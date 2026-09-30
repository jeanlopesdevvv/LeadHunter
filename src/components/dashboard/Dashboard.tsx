"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { splitLines, sugerirLimite } from "@/lib/geo";
import { api } from "@/lib/client/api";
import { clearHistory, loadHistory, removeHistory, upsertHistory, type HistoryEntry } from "@/lib/client/history";
import { planejarBusca, SessaoDeBusca, type Progresso } from "@/lib/client/search-runner";
import { formatarRenovacaoCurta } from "@/lib/periodo";
import type { CheckResult, Lead, SendResult, Uso } from "@/lib/types";

import { DisparoView } from "./DisparoView";
import { HistoryView } from "./HistoryView";
import { ResultsView } from "./ResultsView";
import { calcularLimite, SearchView, type SearchForm } from "./SearchView";
import { SendDialog } from "./SendDialog";
import { SettingsView, type StatusResponse } from "./SettingsView";
import { Shell, type View } from "./Shell";

export interface SearchMeta {
  id: string;
  criadoEm: string;
  termos: string[];
  cidades: string[];
  alvo?: number;
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
  termos: "lava jato\nestética automotiva\nlavagem a domicílio\nlavador de carros",
  cidades: "Belo Horizonte - MG",
  alvo: 50,
  limite: null,
  ignorarFechados: false,
  incluirFixos: true,
};

/** Marca os primeiros `max` que podem ir para a planilha (celular ou fixo permitido, fora da planilha). */
function primeirosElegiveis(lista: Lead[], max: number, incluirFixos: boolean): Set<string> {
  const ids = new Set<string>();
  for (const l of lista) {
    if (ids.size >= max) break;
    if (podeEnviar(l, incluirFixos)) ids.add(l.id);
  }
  return ids;
}

export function Dashboard() {
  const toast = useToast();
  const router = useRouter();
  const [view, setView] = useState<View>("buscar");
  const [form, setForm] = useState<SearchForm>(FORM_INICIAL);
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stats, setStats] = useState<SearchStats>({ brutos: 0, repetidos: 0, fechados: 0 });
  const [meta, setMeta] = useState<SearchMeta | null>(null);
  const [check, setCheck] = useState<CheckState>({ estado: "idle" });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [incluirFixos, setIncluirFixosState] = useState(FORM_INICIAL.incluirFixos);
  const incluirFixosRef = useRef(FORM_INICIAL.incluirFixos);
  const setIncluirFixos = useCallback((v: boolean) => {
    incluirFixosRef.current = v;
    setIncluirFixosState(v);
  }, []);
  // O histórico só aparece na aba Histórico (nunca no primeiro desenho), então pode ser lido já na criação.
  const [historico, setHistorico] = useState<HistoryEntry[]>(() => (typeof window === "undefined" ? [] : loadHistory()));
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [uso, setUso] = useState<Uso | null>(null);
  const [atualizandoUso, setAtualizandoUso] = useState(false);
  const [enviarAberto, setEnviarAberto] = useState(false);
  const [preSelecaoDisparo, setPreSelecaoDisparo] = useState<string[] | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const sessaoRef = useRef<SessaoDeBusca | null>(null);
  /** Sempre a lista mais recente (inclui o "tipo" editado pelo usuário). */
  const leadsRef = useRef<Lead[]>([]);
  /** Cada conferência/busca nova invalida respostas antigas que cheguem atrasadas. */
  const geracao = useRef(0);

  const maxPorBusca = status?.limites.maxConsultasPorBusca ?? 200;

  const atualizarLeads = useCallback((lista: Lead[]) => {
    leadsRef.current = lista;
    setLeads(lista);
  }, []);

  const carregarStatus = useCallback(async () => {
    try {
      const s = await api<StatusResponse>("/api/status");
      setStatus(s);
      if (s.uso) setUso(s.uso);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }, [toast]);

  const carregarUso = useCallback(async (forcar = false) => {
    if (forcar) setAtualizandoUso(true);
    try {
      setUso(await api<Uso>(`/api/uso${forcar ? "?atualizar=1" : ""}`));
    } catch {
      /* o contador não é essencial; tenta de novo depois */
    } finally {
      if (forcar) setAtualizandoUso(false);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    api<StatusResponse>("/api/status")
      .then((s) => {
        if (!ativo) return;
        setStatus(s);
        if (s.uso) setUso(s.uso);
      })
      .catch((e: Error) => ativo && toast(e.message, "error"));
    return () => {
      ativo = false;
    };
  }, [toast]);

  // Mantém o contador de consultas em dia enquanto a tela está aberta.
  useEffect(() => {
    if (rodando) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void carregarUso();
    }, 120_000);
    return () => window.clearInterval(id);
  }, [rodando, carregarUso]);

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
   * Confere na planilha quem já existe e marca os primeiros `selecionar` novos com celular.
   * Retorna null se, enquanto conferia, o usuário começou outra busca.
   */
  const conferirPlanilha = useCallback(
    async (selecionar: number | false = Number.POSITIVE_INFINITY): Promise<Lead[] | null> => {
      const minha = geracao.current;
      const keys = [...new Set(leadsRef.current.map((l) => l.telefoneKey).filter(Boolean))];
      const aplicarSelecao = (lista: Lead[]) => {
        if (selecionar !== false) setSelecionados(primeirosElegiveis(lista, selecionar, incluirFixosRef.current));
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

  /** Roda (ou continua) a sessão de busca até o alvo ou o limite de consultas. */
  const executar = useCallback(
    async (sessao: SessaoDeBusca, alvo: number, limite: number, controller: AbortController, minha: number) => {
      await sessao.executar({
        alvo,
        limite,
        signal: controller.signal,
        onUpdate: (lista, p) => {
          if (minha !== geracao.current) return;
          // Mantém edições feitas durante a busca (ex.: tipo trocado, lead já enviado).
          const atuais = new Map(leadsRef.current.map((l) => [l.id, l]));
          atualizarLeads(lista.map((l) => atuais.get(l.id) ?? l));
          setProgresso(p);
          setStats({ brutos: p.vistos, repetidos: p.repetidos, fechados: p.fechados });
          if (sessao.ultimoUso) setUso(sessao.ultimoUso);
        },
      });
    },
    [atualizarLeads],
  );

  const finalizar = useCallback(
    async (minha: number, metaBusca: SearchMeta, sessao: SessaoDeBusca | null, falhou: boolean) => {
      setRodando(false);
      abortRef.current = null;
      setTemMais(Boolean(sessao?.temMais));
      void carregarUso();
      if (minha !== geracao.current) return;
      if (!leadsRef.current.length) {
        if (!falhou) toast("O Google não achou nenhum estabelecimento. Tente outros termos ou uma cidade maior.", "info");
        return;
      }
      const conferidos = await conferirPlanilha(metaBusca.alvo ?? Number.POSITIVE_INFINITY);
      if (!conferidos) return;
      const anterior = loadHistory().find((h) => h.id === metaBusca.id);
      setHistorico(upsertHistory({ ...metaBusca, total: conferidos.length, enviados: anterior?.enviados ?? 0, leads: conferidos }));
      const novos = conferidos.filter((l) => podeEnviar(l, incluirFixosRef.current)).length;
      toast(
        novos
          ? `${novos} contato${novos === 1 ? "" : "s"} novo${novos === 1 ? "" : "s"} pronto${novos === 1 ? "" : "s"} para enviar.`
          : "Nenhum contato novo desta vez: quem apareceu já está na planilha ou não tem telefone.",
        novos ? "success" : "info",
      );
      setView("resultados");
    },
    [toast, conferirPlanilha, carregarUso],
  );

  const buscar = useCallback(async () => {
    const termos = splitLines(form.termos);
    const cidades = splitLines(form.cidades);
    if (!termos.length) return toast("Escreva pelo menos uma coisa para procurar.", "error");
    if (!cidades.length) return toast("Escreva pelo menos uma cidade.", "error");
    if (!(form.alvo > 0)) return toast("Diga quantos contatos você quer.", "error");

    const controller = new AbortController();
    abortRef.current = controller;
    const minha = ++geracao.current;
    const novaMeta: SearchMeta = { id: crypto.randomUUID(), criadoEm: new Date().toISOString(), termos, cidades, alvo: form.alvo };

    sessaoRef.current = null;
    setIncluirFixos(form.incluirFixos);
    setRodando(true);
    setTemMais(false);
    atualizarLeads([]);
    setStats({ brutos: 0, repetidos: 0, fechados: 0 });
    setSelecionados(new Set());
    setCheck({ estado: "idle" });
    setMeta(novaMeta);
    setProgresso({
      alvo: form.alvo,
      novos: 0,
      consultas: 0,
      limite: calcularLimite(form, uso, maxPorBusca).limite,
      vistos: 0,
      unicos: 0,
      repetidos: 0,
      fechados: 0,
      jaNaPlanilha: 0,
      semCelular: 0,
      etapa: "Preparando a busca…",
      avisos: [],
      rodando: true,
      fim: null,
    });

    let falhou = false;
    let sessao: SessaoDeBusca | null = null;
    try {
      const plano = await planejarBusca(termos, cidades, controller.signal);
      setUso(plano.uso);
      const { limite } = calcularLimite(form, plano.uso, maxPorBusca);
      if (limite <= 0) throw new Error(`As consultas grátis deste mês acabaram. Voltam em ${formatarRenovacaoCurta(plano.uso.renovaEm)}.`);
      sessao = new SessaoDeBusca(plano, { ignorarFechados: form.ignorarFechados, incluirFixos: form.incluirFixos });
      sessaoRef.current = sessao;
      await executar(sessao, form.alvo, limite, controller, minha);
      const p = sessao.progresso;
      if (p.fim === "cota" || p.fim === "erro") {
        falhou = !leadsRef.current.length;
        toast(p.erro || "A busca parou por um erro.", "error");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        falhou = true;
        const msg = (e as Error).message;
        toast(msg, "error");
        setProgresso((p) => (p ? { ...p, rodando: false, fim: "erro", erro: msg, etapa: "" } : p));
      } else {
        setProgresso((p) => (p ? { ...p, rodando: false, fim: "parado", etapa: "" } : p));
      }
    }
    await finalizar(minha, novaMeta, sessao, falhou);
  }, [form, uso, maxPorBusca, toast, atualizarLeads, executar, finalizar, setIncluirFixos]);

  const continuar = useCallback(async () => {
    const sessao = sessaoRef.current;
    if (!sessao || rodando || !meta) return;
    const p = sessao.progresso;
    const faltam = Math.max(1, p.alvo - p.novos);
    const disponivel = uso?.bloquear ? Math.max(0, uso.restantes) : maxPorBusca;
    const extra = Math.min(sugerirLimite(faltam, 1, maxPorBusca), disponivel);
    if (extra <= 0 && uso) return toast(`As consultas grátis deste mês acabaram. Voltam em ${formatarRenovacaoCurta(uso.renovaEm)}.`, "error");

    const controller = new AbortController();
    abortRef.current = controller;
    const minha = ++geracao.current;
    setRodando(true);
    setView("buscar");
    try {
      await executar(sessao, p.alvo, p.consultas + extra, controller, minha);
      if (sessao.progresso.fim === "cota" || sessao.progresso.fim === "erro") toast(sessao.progresso.erro || "A busca parou por um erro.", "error");
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast((e as Error).message, "error");
    }
    await finalizar(minha, meta, sessao, false);
  }, [rodando, meta, uso, maxPorBusca, toast, executar, finalizar]);

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
      if (!entry.leads?.length) return toast("A lista desta busca não está mais guardada neste navegador.", "info");
      if (rodando) return toast("Espere a busca atual terminar.", "info");
      geracao.current++;
      sessaoRef.current = null;
      setTemMais(false);
      setMeta({ id: entry.id, criadoEm: entry.criadoEm, termos: entry.termos, cidades: entry.cidades, alvo: entry.alvo });
      setStats({ brutos: entry.leads.length, repetidos: 0, fechados: 0 });
      setProgresso(null);
      setSelecionados(new Set());
      atualizarLeads(entry.leads);
      setView("resultados");
      // A planilha pode ter mudado desde então. Nada vem marcado: reabrir é para conferir, e evita mandar sem querer.
      await conferirPlanilha(0);
    },
    [conferirPlanilha, toast, rodando, atualizarLeads],
  );

  const repetirBusca = useCallback((entry: HistoryEntry) => {
    setForm((f) => ({ ...f, termos: entry.termos.join("\n"), cidades: entry.cidades.join("\n"), alvo: entry.alvo ?? f.alvo }));
    setView("buscar");
  }, []);

  const sair = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }, [router]);

  const preSelecaoVista = useCallback(() => setPreSelecaoDisparo(null), []);

  const podeEnviarParaPlanilha = check.estado !== "erro" && check.estado !== "checando";

  return (
    <Shell
      view={view}
      onView={irPara}
      totalResultados={leads.length}
      rodando={rodando}
      simulacao={Boolean(status?.simulacao)}
      planilhaUrl={status?.planilha.planilhaUrl}
      uso={uso}
      onSair={sair}
    >
      {view === "buscar" && (
        <SearchView
          form={form}
          onForm={setForm}
          rodando={rodando}
          progresso={progresso}
          podeContinuar={temMais}
          uso={uso}
          maxPorBusca={maxPorBusca}
          placesConfigurada={status ? status.places.configurada : true}
          atualizandoUso={atualizandoUso}
          onAtualizarUso={() => void carregarUso(true)}
          onBuscar={buscar}
          onParar={parar}
          onContinuar={continuar}
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
          progresso={progresso}
          podeContinuar={temMais && !rodando}
          onContinuar={continuar}
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
      {view === "disparo" && <DisparoView preSelecao={preSelecaoDisparo} onPreSelecaoVista={preSelecaoVista} />}
      {view === "historico" && (
        <HistoryView
          historico={historico}
          rodando={rodando}
          onAbrir={abrirHistorico}
          onRepetir={repetirBusca}
          onRemover={(id) => setHistorico(removeHistory(id))}
          onLimpar={() => {
            setHistorico(clearHistory());
            toast("Histórico limpo.", "success");
          }}
        />
      )}
      {view === "config" && <SettingsView status={status} uso={uso} onRecarregar={carregarStatus} />}

      <SendDialog
        aberto={enviarAberto}
        onFechar={() => setEnviarAberto(false)}
        leads={leadsParaEnviar}
        check={check.info}
        onEnviado={aoEnviar}
        disparoConfigurado={Boolean(status?.disparo?.configurado)}
        onDisparar={(keys) => {
          setEnviarAberto(false);
          setPreSelecaoDisparo(keys);
          setView("disparo");
        }}
      />
    </Shell>
  );
}
