"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Shell, type View } from "@/components/dashboard/Shell";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/client/api";
import type { Empresa } from "@/lib/empresas";
import type { Uso } from "@/lib/types";
import type { ConfigVoob, CotaEmpresa, ResultadoBusca } from "@/lib/voob/tipos";

import { VoobBase } from "./VoobBase";
import { VoobBusca, type EstadoBusca } from "./VoobBusca";
import { VoobComecar } from "./VoobComecar";
import { VoobDisparo } from "./VoobDisparo";
import { ModelosEmpresa } from "./ModelosEmpresa";
import { VoobPainel } from "./VoobPainel";

/**
 * As telas de toda empresa do motor do Voob CRM (12/11/2026 a Voob; 13/11/2026, white label: qualquer empresa, sem nada
 * diferente entre elas). Buscar no Google → pôr na base → o CRM chama N por dia pelo WhatsApp oficial da empresa → quem
 * responde vai para o atendimento escolhido (IA da Voob, equipe pelo CRM ou outro sistema).
 * Esta tela só fala com /api/voob/* (o proxy fecha o resto quando uma empresa do Voob CRM está escolhida).
 */

const TELAS: View[] = ["comecar", "buscar", "leads", "disparo", "modelos", "painel"];

/** A cota de buscas da empresa no formato da barrinha do menu (19/11/2026: o cliente vê a cota dele, não a do Google). */
function usoDaCota(c: CotaEmpresa | null | undefined): Uso | null {
  if (!c || c.limite === null || c.restantes === null) return null;
  const renova = `${c.renova}T03:00:00.000Z`;
  return {
    fonte: "google", usadas: c.usadas, limite: c.limite, restantes: c.restantes, bloquear: c.restantes <= 0,
    inicioPeriodo: "", renovaEm: renova, atualizadoEm: new Date().toISOString(), contandoDesde: "", aviso: "",
  };
}
const CHAVE_TELA = "radar-voob-tela";

function telaGuardada(): View {
  try {
    const v = sessionStorage.getItem(CHAVE_TELA) as View | null;
    return v && TELAS.includes(v) ? v : "comecar";
  } catch {
    return "comecar";
  }
}

export function VoobApp({ empresa, empresas, pessoa, equipe = true }: { empresa: Empresa; empresas: Empresa[]; pessoa?: string | null; equipe?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<View>(telaGuardada);
  const [cfg, setCfg] = useState<ConfigVoob | null>(null);
  const [erroCfg, setErroCfg] = useState<{ mensagem: string; status: number } | null>(null);
  // A cota comum do Google (só a equipe vê) e a cota de buscas da empresa (atualizada a cada busca).
  const [uso, setUso] = useState<Uso | null>(null);
  const cota = cfg?.cota ?? null;
  // A busca fica aqui para não se perder ao trocar de tela.
  const [busca, setBusca] = useState<EstadoBusca>({ resultados: [], feitas: 0, total: 0, rodando: false, aviso: "" });

  const carregar = useCallback(async () => {
    try {
      setCfg(await api<ConfigVoob>("/api/voob/config"));
      setErroCfg(null);
    } catch (e) {
      setErroCfg({ mensagem: e instanceof ApiError ? e.message : "Não deu para ler a configuração agora.", status: e instanceof ApiError ? e.status : 0 });
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 0);
    if (equipe) api<Uso>("/api/uso").then(setUso, () => {});
    return () => window.clearTimeout(t);
  }, [carregar, equipe]);

  const irPara = useCallback((v: View) => {
    setView(v);
    try {
      sessionStorage.setItem(CHAVE_TELA, v);
    } catch {
      /* sem armazenamento: só não lembra a tela */
    }
  }, []);

  const sair = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }, [router]);

  const mudarResultados = useCallback((f: (r: ResultadoBusca[]) => ResultadoBusca[]) => {
    setBusca((b) => ({ ...b, resultados: f(b.resultados) }));
  }, []);

  return (
    <Shell
      empresa={empresa}
      empresas={empresas}
      onErro={(m) => toast(m, "error")}
      view={view}
      onView={irPara}
      totalResultados={0}
      rodando={busca.rodando}
      simulacao={Boolean(cfg?.simulacao)}
      uso={equipe ? uso : usoDaCota(cota)}
      rotuloUso={equipe ? "Consultas grátis" : "Buscas do mês"}
      pessoa={pessoa}
      onSair={sair}
      podeCriar={equipe}
    >
      {view === "comecar" && <VoobComecar empresa={empresa} cfg={cfg} erro={erroCfg} equipe={equipe} onIr={irPara} onRecarregar={carregar} onCfg={setCfg} />}
      {view === "buscar" && (
        <VoobBusca
          cfg={cfg}
          uso={equipe ? uso : null}
          cota={cota}
          onUso={(r) => {
            if (r.uso) setUso(r.uso);
            const nova = r.cotaEmpresa;
            if (nova) setCfg((c) => (c ? { ...c, cota: nova } : c));
          }}
          estado={busca}
          onEstado={setBusca}
          onResultados={mudarResultados}
          onBaseMudou={carregar}
          onIr={irPara}
        />
      )}
      {view === "leads" && <VoobBase cfg={cfg} erroCfg={erroCfg} onMudou={carregar} onIr={irPara} />}
      {view === "disparo" && <VoobDisparo cfg={cfg} erro={erroCfg} onCfg={setCfg} onRecarregar={carregar} onIr={irPara} />}
      {view === "modelos" && <ModelosEmpresa cfg={cfg} onIr={irPara} onCfg={setCfg} />}
      {view === "painel" && <VoobPainel cfg={cfg} erroCfg={erroCfg} onIr={irPara} />}
    </Shell>
  );
}
