"use client";

import { ExternalLink, FlaskConical, Headset, History, ListChecks, LogOut, Search, Send, Settings2, TrendingUp, WifiOff } from "lucide-react";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { abrirAtendimento, useChatwoot } from "@/components/chatwoot";
import { Logo } from "@/components/Logo";
import { cx } from "@/components/ui";
import type { Uso } from "@/lib/types";

import { UsoMini } from "./UsoCota";

export type View = "buscar" | "resultados" | "disparo" | "painel" | "historico" | "config";

const ITEMS: { id: View; label: string; icon: typeof Search }[] = [
  { id: "buscar", label: "Nova prospecção", icon: Search },
  { id: "resultados", label: "Oportunidades", icon: ListChecks },
  { id: "disparo", label: "Disparo", icon: Send },
  { id: "painel", label: "Desempenho", icon: TrendingUp },
  { id: "historico", label: "Histórico", icon: History },
  { id: "config", label: "Configuração", icon: Settings2 },
];

function assinarConexao(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

export function Shell({
  view,
  onView,
  totalResultados,
  rodando,
  simulacao,
  planilhaUrl,
  uso,
  onSair,
  children,
}: {
  view: View;
  onView: (v: View) => void;
  totalResultados: number;
  rodando: boolean;
  simulacao: boolean;
  planilhaUrl?: string;
  uso: Uso | null;
  onSair: () => void;
  children: ReactNode;
}) {
  const badge = (id: View) =>
    id === "resultados" && (totalResultados > 0 || rodando) ? (
      <span className="ml-auto rounded-full bg-brand/15 px-2 py-0.5 text-[11px] font-bold text-brand-300 tabular-nums">
        {rodando ? "…" : totalResultados}
      </span>
    ) : null;

  const online = useSyncExternalStore(assinarConexao, () => navigator.onLine, () => true);
  const chatwoot = useChatwoot();
  const urlAtendimento = chatwoot?.url ?? "";

  // Alt + A abre o atendimento de qualquer tela (menos quando está digitando).
  useEffect(() => {
    if (!urlAtendimento) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== "KeyA") return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) return;
      e.preventDefault();
      abrirAtendimento(urlAtendimento);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [urlAtendimento]);

  return (
    <div className="min-h-screen lg:pl-64">
      {!online && (
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-navy shadow-lg animate-slide-up lg:left-64">
          <WifiOff className="size-4" /> Sem conexão com a internet. Nada se perde: o Radar continua sozinho quando a conexão voltar.
        </div>
      )}
      {/* Barra lateral (desktop) */}
      <aside className="glow-tl fixed inset-y-0 left-0 z-30 hidden w-64 flex-col px-4 py-6 text-white lg:flex">
        <div className="px-2">
          <Logo dark />
        </div>
        {urlAtendimento && (
          <a
            href={urlAtendimento}
            target="lavacar-chatwoot"
            onClick={(e) => {
              e.preventDefault();
              abrirAtendimento(urlAtendimento);
            }}
            title="Abrir o atendimento no Chatwoot (atalho: Alt + A)"
            className="group mt-8 flex items-center gap-3 rounded-2xl bg-brand px-3.5 py-3 text-white shadow-[0_10px_30px_-12px_rgb(3_171_201_/_0.9)] transition hover:bg-brand-600"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">
              <Headset className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-sm font-bold">Atendimento</span>
              <span className="block text-[11px] text-white/75">Chatwoot · Alt + A</span>
            </span>
            {chatwoot?.naVisao != null && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-extrabold text-brand-700 tabular-nums" title="Conversas nessa visão do Chatwoot">
                {chatwoot.naVisao}
              </span>
            )}
            <ExternalLink className="size-3.5 shrink-0 text-white/70 transition group-hover:text-white" />
          </a>
        )}
        <nav className={cx("flex flex-col gap-1", urlAtendimento ? "mt-6" : "mt-10")}>
          <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.18em] text-white/35 uppercase">Menu</p>
          {ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onView(id)}
              className={cx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                view === id ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <Icon className={cx("size-[18px]", view === id ? "text-brand" : "")} />
              {label}
              {badge(id)}
            </button>
          ))}
        </nav>
        <div className="mt-auto mb-4">
          <UsoMini uso={uso} />
        </div>
        <div className="flex flex-col gap-1 border-t border-white/10 pt-4">
          {simulacao && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-300">
              <FlaskConical className="size-4" /> Modo simulação
            </div>
          )}
          {planilhaUrl && (
            <a
              href={planilhaUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-white/55 hover:bg-white/[0.04] hover:text-white"
            >
              <ExternalLink className="size-[18px]" /> Abrir planilha
            </a>
          )}
          <button
            onClick={onSair}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-white/55 hover:bg-white/[0.04] hover:text-white"
          >
            <LogOut className="size-[18px]" /> Sair
          </button>
        </div>
      </aside>

      {/* Topo (celular/tablet) */}
      <header className="glow-tl sticky top-0 z-30 text-white lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo dark />
          <div className="flex items-center gap-1">
            {simulacao && <FlaskConical className="size-4 text-amber-300" aria-label="Modo simulação" />}
            {urlAtendimento && (
              <button
                onClick={() => abrirAtendimento(urlAtendimento)}
                className="flex items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-bold text-white"
                aria-label="Abrir o atendimento no Chatwoot"
              >
                <Headset className="size-4" /> Atendimento
                {chatwoot?.naVisao != null && <span className="rounded-full bg-white px-1.5 text-[10px] text-brand-700 tabular-nums">{chatwoot.naVisao}</span>}
              </button>
            )}
            <button onClick={onSair} className="rounded-lg p-2 text-white/60 hover:text-white" aria-label="Sair">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 scrollbar-thin">
          {ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onView(id)}
              className={cx(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold",
                view === id ? "bg-white/10 text-white" : "text-white/55",
              )}
            >
              <Icon className={cx("size-4", view === id && "text-brand")} />
              {label}
              {id === "resultados" && totalResultados > 0 && <span className="text-brand-300 tabular-nums">{totalResultados}</span>}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-32 sm:px-6 lg:px-10 lg:pt-10">
        <div key={view} className="view-in">
          {children}
        </div>
      </main>
    </div>
  );
}
