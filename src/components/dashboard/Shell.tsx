"use client";

import { ArrowUpRight, ExternalLink, FlaskConical, Headset, History, ListChecks, LogOut, Search, Send, Settings2, TrendingUp, WifiOff } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { abrirAtendimento, useChatwoot } from "@/components/chatwoot";
import { Logo } from "@/components/Logo";
import { BotaoTema, SeletorTema } from "@/components/tema";
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

  // No celular o menu rola de lado: mantém a aba atual à vista.
  const navMovel = useRef<HTMLElement>(null);
  useEffect(() => {
    const ativo = navMovel.current?.querySelector<HTMLElement>('[aria-current="page"]');
    ativo?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [view]);

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
        <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-strong shadow-lg animate-slide-up lg:left-64">
          <WifiOff className="size-4" /> Sem conexão com a internet. Nada se perde: o Radar continua sozinho quando a conexão voltar.
        </div>
      )}
      {/* Barra lateral (desktop) */}
      <aside className="glow-tl scrollbar-thin fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto px-4 py-6 text-white lg:flex">
        <div className="px-2">
          <Logo dark />
        </div>
        {urlAtendimento && (
          <div className="mt-8">
            <a
              href={urlAtendimento}
              target="lavacar-chatwoot"
              onClick={(e) => {
                e.preventDefault();
                abrirAtendimento(urlAtendimento);
              }}
              title="Abrir o atendimento no Chatwoot (Alt + A)"
              className="group block rounded-2xl bg-gradient-to-br from-brand to-brand-600 p-4 text-white shadow-[0_12px_32px_-14px_rgb(3_171_201_/_0.9)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-14px_rgb(3_171_201_/_1)]"
            >
              <span className="flex items-center justify-between">
                <span className="grid size-10 place-items-center rounded-xl bg-white/15 ring-1 ring-white/20">
                  <Headset className="size-5" />
                </span>
                <ArrowUpRight className="size-[18px] text-white/70 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-white" />
              </span>
              <span className="mt-3.5 block text-[15px] leading-tight font-bold">Atendimento</span>
              <span className="mt-1 block text-[12.5px] leading-snug text-white/80">Abrir conversas no Chatwoot</span>
            </a>
            <p className="mt-2 flex items-center justify-center gap-1 text-[11px] text-white/40">
              Atalho
              <kbd className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-px font-sans text-[10.5px] font-semibold text-white/70">Alt</kbd>+
              <kbd className="rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-px font-sans text-[10.5px] font-semibold text-white/70">A</kbd>
            </p>
          </div>
        )}
        <nav className={cx("flex flex-col gap-1", urlAtendimento ? "mt-5" : "mt-10")}>
          <p className="mb-2 px-3 text-[10px] font-bold tracking-[0.18em] text-white/35 uppercase">Menu</p>
          {ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onView(id)}
              aria-current={view === id ? "page" : undefined}
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
          <SeletorTema className="mb-2" />
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
              </button>
            )}
            <BotaoTema />
            <button onClick={onSair} className="rounded-lg p-2 text-white/60 hover:text-white" aria-label="Sair">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
        <nav
          ref={navMovel}
          className="flex gap-1 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none] [mask-image:linear-gradient(to_right,transparent,#000_12px,#000_calc(100%-32px),transparent)] [&::-webkit-scrollbar]:hidden"
        >
          {ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onView(id)}
              aria-current={view === id ? "page" : undefined}
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
