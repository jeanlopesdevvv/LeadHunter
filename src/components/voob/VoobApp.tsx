"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { Shell, type View } from "@/components/dashboard/Shell";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/client/api";
import type { Empresa } from "@/lib/empresas";
import type { Uso } from "@/lib/types";
import type { ConfigVoob, ResultadoBusca } from "@/lib/voob/tipos";

import { VoobBase } from "./VoobBase";
import { VoobBusca, type EstadoBusca } from "./VoobBusca";
import { VoobComecar } from "./VoobComecar";
import { VoobDisparo } from "./VoobDisparo";
import { VoobPainel } from "./VoobPainel";

/**
 * Radar · Voob (12/11/2026, Entrega 3): a prospecção da Voob com o motor do Voob CRM.
 * Buscar no Google → pôr na base → o CRM chama 20 por dia pelo WhatsApp oficial → a Renata atende quem responde.
 * Esta tela só fala com /api/voob/* (o proxy fecha o resto quando a Voob está escolhida).
 */

const TELAS: View[] = ["comecar", "buscar", "leads", "disparo", "painel"];
const CHAVE_TELA = "radar-voob-tela";

function telaGuardada(): View {
  try {
    const v = sessionStorage.getItem(CHAVE_TELA) as View | null;
    return v && TELAS.includes(v) ? v : "comecar";
  } catch {
    return "comecar";
  }
}

export function VoobApp({ empresa, empresas }: { empresa: Empresa; empresas: Empresa[] }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<View>(telaGuardada);
  const [cfg, setCfg] = useState<ConfigVoob | null>(null);
  const [erroCfg, setErroCfg] = useState<{ mensagem: string; status: number } | null>(null);
  const [uso, setUso] = useState<Uso | null>(null);
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
    api<Uso>("/api/uso").then(setUso, () => {});
    return () => window.clearTimeout(t);
  }, [carregar]);

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
      uso={uso}
      onSair={sair}
    >
      {view === "comecar" && <VoobComecar empresa={empresa} cfg={cfg} erro={erroCfg} onIr={irPara} onRecarregar={carregar} />}
      {view === "buscar" && (
        <VoobBusca cfg={cfg} uso={uso} onUso={setUso} estado={busca} onEstado={setBusca} onResultados={mudarResultados} onBaseMudou={carregar} onIr={irPara} />
      )}
      {view === "leads" && <VoobBase cfg={cfg} erroCfg={erroCfg} onMudou={carregar} onIr={irPara} />}
      {view === "disparo" && <VoobDisparo cfg={cfg} erro={erroCfg} onCfg={setCfg} onRecarregar={carregar} onIr={irPara} />}
      {view === "painel" && <VoobPainel cfg={cfg} erroCfg={erroCfg} onIr={irPara} />}
    </Shell>
  );
}
