"use client";

import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { Empresa } from "@/lib/empresas";
import { CriarEmpresa } from "@/components/voob/CriarEmpresa";
import { SeloMarca } from "@/components/voob/marca";

/**
 * Seletor de empresa (12/11/2026): "empresa 1, Lavacar; empresa 2, Voob, com o nome e a corzinha da Voob" (Pedro).
 * Trocar grava a escolha no servidor (cookie) e recarrega a tela já com as cores e as telas da empresa.
 */

export function SeloEmpresa({ empresa, className }: { empresa: Pick<Empresa, "sigla" | "cor" | "nome" | "logo">; className?: string }) {
  return <SeloMarca empresa={empresa} className={className} />;
}

function rotuloSituacao(e: Empresa): string {
  return e.situacao === "preparando" ? "Em preparação" : e.publico;
}

export function SeletorEmpresa({
  empresa,
  empresas,
  compacto = false,
  onErro,
  podeCriar = false,
}: {
  empresa: Empresa;
  empresas: Empresa[];
  /** Topo do celular: só o selo e o nome. */
  compacto?: boolean;
  onErro?: (mensagem: string) => void;
  /** 13/11/2026: "Criar empresa" no fim da lista (só a equipe da Voob). */
  podeCriar?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [criando, setCriando] = useState(false);
  const [trocando, setTrocando] = useState<string | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const idLista = useId();

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  const trocar = async (id: string) => {
    if (id === empresa.id) {
      setAberto(false);
      return;
    }
    setTrocando(id);
    try {
      await api("/api/empresa", { id });
      window.location.reload();
    } catch (e) {
      setTrocando(null);
      onErro?.(e instanceof Error ? e.message : "Não deu para trocar de empresa.");
    }
  };

  if (empresas.length < 2 && !podeCriar) {
    return compacto ? null : (
      <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
        <SeloEmpresa empresa={empresa} className="size-9" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{empresa.nome}</span>
          <span className="block truncate text-[11.5px] text-white/50">{rotuloSituacao(empresa)}</span>
        </span>
      </div>
    );
  }

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={idLista}
        title="Trocar de empresa"
        className={cx(
          "group flex w-full items-center text-left transition",
          compacto
            ? "gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10"
            : "gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10 hover:bg-white/[0.07] hover:ring-white/20",
        )}
      >
        <SeloEmpresa empresa={empresa} className={compacto ? "size-7 text-[10px]" : "size-9"} />
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate font-bold text-white", compacto ? "text-[13px]" : "text-sm")}>{empresa.nome}</span>
          {!compacto && <span className="block truncate text-[11.5px] text-white/50">{rotuloSituacao(empresa)}</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-white/40 transition group-hover:text-white/80" />
      </button>

      {aberto && (
        <div
          id={idLista}
          role="listbox"
          aria-label="Empresas"
          className={cx(
            "animate-slide-up absolute z-50 mt-2 overflow-hidden rounded-2xl bg-card p-1.5 text-ink shadow-card ring-1 ring-line",
            compacto ? "right-0 w-[min(18rem,calc(100vw-2rem))]" : "inset-x-0",
          )}
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold tracking-[0.16em] text-muted uppercase">Empresas</p>
          {empresas.map((e) => {
            const atual = e.id === empresa.id;
            return (
              <button
                key={e.id}
                type="button"
                role="option"
                aria-selected={atual}
                disabled={Boolean(trocando)}
                onClick={() => trocar(e.id)}
                className={cx(
                  "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition disabled:cursor-wait",
                  atual ? "bg-strong/[0.05]" : "hover:bg-strong/[0.04]",
                )}
              >
                <SeloEmpresa empresa={e} className="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-strong">{e.nome}</span>
                    {e.situacao === "preparando" && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-800">Em preparação</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">{e.publico}</span>
                </span>
                {trocando === e.id ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-muted" />
                ) : (
                  atual && <Check className="size-4 shrink-0 text-brand" />
                )}
              </button>
            );
          })}
          {podeCriar && (
            <button
              type="button"
              onClick={() => {
                setAberto(false);
                setCriando(true);
              }}
              className="mt-1 flex w-full items-center gap-3 rounded-xl border-t border-line px-2.5 py-2.5 text-left transition hover:bg-strong/[0.04]"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
                <Plus className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-strong">Criar empresa</span>
                <span className="block truncate text-xs text-muted">Nome, cor, logo e a conta do Voob CRM</span>
              </span>
            </button>
          )}
        </div>
      )}
      {podeCriar && <CriarEmpresa aberto={criando} onFechar={() => setCriando(false)} />}
    </div>
  );
}
