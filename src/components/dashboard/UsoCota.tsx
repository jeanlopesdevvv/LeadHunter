"use client";


import { AnimatedNumber } from "@/components/motion";
import { cx } from "@/components/ui";
import { formatarRenovacaoCurta } from "@/lib/periodo";
import type { Uso } from "@/lib/types";

const n = (v: number) => v.toLocaleString("pt-BR");

function tom(uso: Uso) {
  const fracao = uso.limite ? uso.restantes / uso.limite : 0;
  if (uso.restantes <= 0) return { barra: "bg-red-500", texto: "text-red-600" };
  if (fracao < 0.15) return { barra: "bg-amber-500", texto: "text-amber-600" };
  return { barra: "bg-brand", texto: "text-strong" };
}

function Barra({ uso, escura }: { uso: Uso; escura?: boolean }) {
  const pct = uso.limite ? Math.min(100, (uso.usadas / uso.limite) * 100) : 100;
  return (
    <div className={cx("h-2 overflow-hidden rounded-full", escura ? "bg-white/10" : "bg-surface")}>
      <div className={cx("h-full rounded-full transition-all duration-700 ease-out", tom(uso).barra)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Versão compacta (barra lateral escura). */
export function UsoMini({ uso }: { uso: Uso | null }) {
  if (!uso) return null;
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold text-white/50">Consultas grátis</span>
        <span className={cx("text-sm font-bold tabular-nums", uso.restantes <= 0 ? "text-red-300" : "text-white")}>
          <AnimatedNumber value={uso.restantes} />
          <span className="font-medium text-white/40">/{n(uso.limite)}</span>
        </span>
      </div>
      <div className="mt-2">
        <Barra uso={uso} escura />
      </div>
      <p className="mt-2 text-[11px] text-white/45">
        Renova {formatarRenovacaoCurta(uso.renovaEm)}
        {uso.fonte === "radar" && <span className="text-amber-300/80"> · contagem parcial</span>}
      </p>
    </div>
  );
}
