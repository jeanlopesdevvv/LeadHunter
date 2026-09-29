"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { splitLines, type Depth } from "@/lib/geo";
import { api } from "@/lib/client/api";
import { loadHistory, removeHistory, upsertHistory, type HistoryEntry } from "@/lib/client/history";
import { runSearch, type Progress } from "@/lib/client/search-runner";
import type { CheckResult, Lead, SendResult } from "@/lib/types";

import { HistoryView } from "./HistoryView";
import { ResultsView } from "./ResultsView";
import { SearchView, type SearchForm } from "./SearchView";
import { SendDialog } from "./SendDialog";
import { SettingsView, type StatusResponse } from "./SettingsView";
import { Shell, type View } from "./Shell";

export interface SearchMeta {
  id: string;
  criadoEm: string;
  termos: string[];
  cidades: string[];
  profundidade: Depth;
}

export interface SearchStats {
  brutos: number;
  repetidos: number;
  fechados: number;
}

export type CheckState = { estado: "idle" | "checando" | "ok" | "erro"; erro?: string; info?: CheckResult };

/** Pode ir para a planilha? */
export function podeEnviar(lead: Lead, incluirFixos: boolean): boolean {
  if (!lead.telefone) return false;
  if (lead.telefoneTipo !== "celular" && !(incluirFixos && lead.telefoneTipo === "fixo")) return false;
  return lead.planilha === "novo" || lead.planilha === "desconhecido";
}

const FORM_INICIAL: SearchForm = {
  termos: "lava jato\nestética automotiva",
  cidades: "Belo Horizonte - MG",
  profundidade: "rapida",
  ignorarFechados: true,
};

export function Dashboard() {
  const toast = useToast();
  const router = useRouter();
  const [view, setView] = useState<View>("buscar");
  const [form, setForm] = useState<SearchForm>(FORM_INICIAL);
  const [rodando, setRodando] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<SearchStats>({ brutos: 0, repetidos: 0, fechados: 0 });
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [check, setCheck] = useState<CheckState>({ estado: "idle" });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [incluirFixos, setIncluirFixos] = useState(false);
  const [historico, setHistorico] = useState<HistoryEntry[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [enviarAberto, setEnviarAberto] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const porId = useRef(new Map<string, Lead>());
  const porTelefone = useRef(new Set<string>());
  /** Sempre a lista mais recente (inclui o "tipo" editado pelo usuário). */
  const leadsRef = useRef<Lead[]>([]);
  /** Cada conferência/busca nova invalida respostas antigas que cheguem atrasadas. */
  const geracao = useRef(0);

  const atualizarLeads = useCallback((lista: Lead[]) => {
    leadsRef.current = lista;
    setLeads(lista);
  }, []);

  useEffect(() => {
    // Lido depois de montar para não divergir do HTML do servidor.
    setHistorico(loadHistory());
  }, []);

  const carregarStatus = useCallback(async () => {
    try {
      setStatus(await api<StatusResponse>("/api/status"));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [toast]);

  useEffect(() => {
    void carregarStatus();
  }, [carregarStatus]);

  const irPara = useCallback(
    (v: View) => {
      setView(v);
      if (v === "config") void carregarStatus(); // números da planilha sempre atuais
    },
    [carregarStatus],
  );

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  /**
   * Confere na planilha quem já existe e pré-seleciona os novos com celular.
   * Retorna null se, enquanto conferia, o usuário começou outra busca.
   */
  const conferirPlanilha = useCallback(
    async (selecionar = true): Promise<Lead[] | null> => {
      const minha = geracao.current;
      const keys = [...new Set(leadsRef.current.map((l) => l.telefoneKey).filter(Boolean))];
      const aplicarSelecao = (lista: Lead[]) => {
        if (selecionar) setSelecionados(new Set(lista.filter((l) => podeEnviar(l, false)).map((l) => l.id)));
      };
      if (!keys.length) {
        setCheck({ estado: "ok" });
        return leadsRef.current;
      }
      setCheck({ estado: "checando" });
      try {
        const info = await api<CheckResult>("/api/sheets/check", { keys });
        if (minha !== geracao.current) return null;
        const existe = new Set(info.existentes);
        const optout = new Set(info.optout);
        const atualizados = leadsRef.current.map((l): Lead => {
          if (l.planilha === "enviado") return l;
          if (l.telefoneKey && optout.has(l.telefoneKey)) return { ...l, planilha: "optout" };
          if (l.telefoneKey && existe.has(l.telefoneKey)) return { ...l, planilha: "existente" };
          return { ...l, planilha: "novo" };
        });
        atualizarLeads(atualizados);
        setCheck({ estado: "ok", info });
        aplicarSelecao(atualizados);
        return atualizados;
      } catch (e) {
        if (minha !== geracao.current) return null;
        setCheck({ estado: "erro", erro: (e as Error).message });
        aplicarSelecao(leadsRef.current);
        return leadsRef.current;
      }
    },
    [atualizarLeads],
  );

  const buscar = useCallback(async () => {
    const termos = splitLines(form.termos);
    const cidades = splitLines(form.cidades);
    if (!termos.length) return toast("Informe pelo menos um termo de busca.", "error");
    if (!cidades.length) return toast("Informe pelo menos uma cidade.", "error");

    const controller = new AbortController();
    abortRef.current = controller;
    const minha = ++geracao.current;
    porId.current = new Map();
    porTelefone.current = new Set();
    const contagem: SearchStats = { brutos: 0, repetidos: 0, fechados: 0 };
    const novaMeta: SearchMeta = {
      id: crypto.randomUUID(),
      criadoEm: new Date().toISOString(),
      termos,
      cidades,
      profundidade: form.profundidade,
    };

    setRodando(true);
    atualizarLeads([]);
    setStats(contagem);
    setSelecionados(new Set());
    setCheck({ estado: "idle" });
    setMeta(novaMeta);
    setProgress({ feitas: 0, previstas: 1, etapa: "Planejando a busca…", erros: [] });

    let falhou = false;
    try {
      await runSearch({
        termos,
        cidades,
        profundidade: form.profundidade,
        signal: controller.signal,
        onPlan: () => {},
        onProgress: setProgress,
        onLeads: (batch) => {
          let mudou = false;
          for (const lead of batch) {
            contagem.brutos++;
            if (form.ignorarFechados && lead.situacaoNegocio !== "OPERATIONAL") {
              contagem.fechados++;
              continue;
            }
            if (porId.current.has(lead.id) || (lead.telefoneKey && porTelefone.current.has(lead.telefoneKey))) {
              contagem.repetidos++;
              continue;
            }
            porId.current.set(lead.id, lead);
            if (lead.telefoneKey) porTelefone.current.add(lead.telefoneKey);
            mudou = true;
          }
          setStats({ ...contagem });
          if (mudou) {
            // Mantém edições feitas durante a busca (ex.: tipo trocado).
            const atuais = new Map(leadsRef.current.map((l) => [l.id, l]));
            atualizarLeads([...porId.current.values()].map((l) => atuais.get(l.id) ?? l));
          }
        },
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        falhou = true;
        toast((e as Error).message, "error");
        setProgress((p) => (p ? { ...p, etapa: "Falhou", erros: [...p.erros, (e as Error).message] } : p));
      }
    }

    setRodando(false);
    abortRef.current = null;
    if (minha !== geracao.current) return;
    if (!leadsRef.current.length) {
      if (!falhou) toast("Nenhum estabelecimento encontrado. Tente outros termos ou uma cidade maior.", "info");
      return;
    }
    const conferidos = await conferirPlanilha();
    if (!conferidos) return;
    setHistorico(upsertHistory({ ...novaMeta, total: conferidos.length, enviados: 0, leads: conferidos }));
    const novos = conferidos.filter((l) => podeEnviar(l, false)).length;
    toast(`${conferidos.length} estabelecimentos únicos · ${novos} novos com celular.`, "success");
    setView("resultados");
  }, [form, toast, conferirPlanilha, atualizarLeads]);

  const parar = useCallback(() => abortRef.current?.abort(), []);

  const leadsParaEnviar = useMemo(
    () => leads.filter((l) => selecionados.has(l.id) && podeEnviar(l, incluirFixos)),
    [leads, selecionados, incluirFixos],
  );

  const aoEnviar = useCallback(
    (result: SendResult) => {
      const enviados = new Set(result.adicionados.map((i) => i.key));
      const jaExistiam = new Set(
        result.ignorados.filter((i) => i.motivo === "ja_na_planilha" || i.motivo === "repetido_no_lote").map((i) => i.key),
      );
      const optout = new Set(result.ignorados.filter((i) => i.motivo === "optout").map((i) => i.key));
      const atualizados = leadsRef.current.map((l): Lead => {
        if (!l.telefoneKey) return l;
        if (enviados.has(l.telefoneKey) && selecionados.has(l.id)) return { ...l, planilha: "enviado" };
        if (optout.has(l.telefoneKey)) return { ...l, planilha: "optout" };
        if (jaExistiam.has(l.telefoneKey) || enviados.has(l.telefoneKey)) return { ...l, planilha: "existente" };
        return l;
      });
      atualizarLeads(atualizados);
      setSelecionados(new Set());
      if (meta) {
        const anterior = historico.find((h) => h.id === meta.id);
        setHistorico(
          upsertHistory({
            ...meta,
            total: atualizados.length,
            enviados: (anterior?.enviados ?? 0) + result.adicionados.length,
            leads: atualizados,
          }),
        );
      }
    },
    [selecionados, meta, historico, atualizarLeads],
  );

  const abrirHistorico = useCallback(
    async (entry: HistoryEntry) => {
      if (!entry.leads?.length) return toast("Os resultados desta busca não estão mais salvos neste navegador.", "info");
      if (rodando) return toast("Espere a busca atual terminar.", "info");
      geracao.current++;
      setMeta({ id: entry.id, criadoEm: entry.criadoEm, termos: entry.termos, cidades: entry.cidades, profundidade: entry.profundidade });
      setStats({ brutos: entry.leads.length, repetidos: 0, fechados: 0 });
      setProgress(null);
      setSelecionados(new Set());
      atualizarLeads(entry.leads);
      setView("resultados");
      await conferirPlanilha(); // a planilha pode ter mudado desde então
    },
    [conferirPlanilha, toast, rodando, atualizarLeads],
  );

  const repetirBusca = useCallback((entry: HistoryEntry) => {
    setForm((f) => ({ ...f, termos: entry.termos.join("\n"), cidades: entry.cidades.join("\n"), profundidade: entry.profundidade }));
    setView("buscar");
  }, []);

  const sair = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }, [router]);

  const podeEnviarParaPlanilha = check.estado !== "erro" && check.estado !== "checando";

  return (
    <Shell
      view={view}
      onView={irPara}
      totalResultados={leads.length}
      rodando={rodando}
      simulacao={Boolean(status?.simulacao)}
      planilhaUrl={status?.planilha.planilhaUrl}
      onSair={sair}
    >
      {view === "buscar" && (
        <SearchView
          form={form}
          onForm={setForm}
          rodando={rodando}
          progress={progress}
          stats={stats}
          totalUnicos={leads.length}
          maxConsultas={status?.limites.maxConsultasPorBusca ?? 200}
          placesConfigurada={status ? status.places.configurada : true}
          onBuscar={buscar}
          onParar={parar}
          onVerResultados={() => setView("resultados")}
        />
      )}
      {view === "resultados" && (
        <ResultsView
          leads={leads}
          onLeads={atualizarLeads}
          meta={meta}
          stats={stats}
          rodando={rodando}
          check={check}
          selecionados={selecionados}
          onSelecionados={setSelecionados}
          incluirFixos={incluirFixos}
          onIncluirFixos={setIncluirFixos}
          paraEnviar={leadsParaEnviar.length}
          podeEnviarParaPlanilha={podeEnviarParaPlanilha}
          onEnviar={() => setEnviarAberto(true)}
          onReconferir={() => conferirPlanilha(false)}
          onNovaBusca={() => setView("buscar")}
          onConfig={() => irPara("config")}
        />
      )}
      {view === "historico" && (
        <HistoryView
          historico={historico}
          rodando={rodando}
          onAbrir={abrirHistorico}
          onRepetir={repetirBusca}
          onRemover={(id) => setHistorico(removeHistory(id))}
        />
      )}
      {view === "config" && <SettingsView status={status} onRecarregar={carregarStatus} />}

      <SendDialog
        aberto={enviarAberto}
        onFechar={() => setEnviarAberto(false)}
        leads={leadsParaEnviar}
        check={check.info}
        onEnviado={aoEnviar}
      />
    </Shell>
  );
}
