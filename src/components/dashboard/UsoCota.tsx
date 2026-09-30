"use client";

import { AlertTriangle, CalendarClock, FlaskConical, Gauge, RefreshCw } from "lucide-react";

import { AnimatedNumber } from "@/components/motion";
import { Card, cx } from "@/components/ui";
import { formatarRenovacao, formatarRenovacaoCurta, horaBrasilia, tempoAte } from "@/lib/periodo";
import type { Uso } from "@/lib/types";

const n = (v: number) => v.toLocaleString("pt-BR");

function tom(uso: Uso) {
  const fracao = uso.limite ? uso.restantes / uso.limite : 0;
  if (uso.restantes <= 0) return { barra: "bg-red-500", texto: "text-red-600" };
  if (fracao < 0.15) return { barra: "bg-amber-500", texto: "text-amber-600" };
  return { barra: "bg-brand", texto: "text-navy" };
}

function Barra({ uso, escura }: { uso: Uso; escura?: boolean }) {
  const pct = uso.limite ? Math.min(100, (uso.usadas / uso.limite) * 100) : 100;
  return (
    <div className={cx("h-2 overflow-hidden rounded-full", escura ? "bg-white/10" : "bg-surface")}>
      <div className={cx("h-full rounded-full transition-all duration-700 ease-out", tom(uso).barra)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** De onde veio o número (Google, contagem do Radar ou simulação). */
export function FonteDoUso({ uso }: { uso: Uso }) {
  if (uso.fonte === "simulacao") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-amber-700">
        <FlaskConical className="size-3.5" /> Modo simulação: nenhuma consulta real é gasta.
      </p>
    );
  }
  if (uso.fonte === "google") {
    return <p className="text-xs text-muted">Número do painel do Google Cloud, conferido às {horaBrasilia(uso.atualizadoEm)}.</p>;
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-800">
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      <span>
        Contando só as buscas feitas pelo Radar desde {formatarRenovacaoCurta(uso.contandoDesde)}. {uso.aviso}
      </span>
    </p>
  );
}

/** Cartão grande (tela de busca). */
export function UsoCard({ uso, onAtualizar, atualizando }: { uso: Uso | null; onAtualizar?: () => void; atualizando?: boolean }) {
  if (!uso) {
    return (
      <Card className="p-5 sm:p-6">
        <div className="skeleton h-4 w-44 rounded" />
        <div className="skeleton mt-4 h-8 w-28 rounded" />
        <div className="skeleton mt-4 h-2 rounded-full" />
      </Card>
    );
  }
  const t = tom(uso);
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Gauge className="size-4 text-brand" /> Combustível do radar (grátis)
        </p>
        {onAtualizar && uso.fonte !== "simulacao" && (
          <button
            onClick={onAtualizar}
            disabled={atualizando}
            className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-ink disabled:opacity-50"
            aria-label="Atualizar contador"
            title="Atualizar agora"
          >
            <RefreshCw className={cx("size-4", atualizando && "animate-spin")} />
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <AnimatedNumber value={uso.restantes} className={cx("text-4xl font-extrabold tracking-tight", t.texto)} />
        <span className="text-sm text-muted">
          consultas de <b className="text-ink tabular-nums">{n(uso.limite)}</b> ainda no tanque · {n(uso.usadas)} usadas
        </span>
      </div>
      <div className="mt-3">
        <Barra uso={uso} />
      </div>

      <p className="mt-3 flex items-start gap-2 text-sm text-ink">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted" />
        <span>
          Renova {tempoAte(uso.renovaEm)}: <b>{formatarRenovacao(uso.renovaEm)}</b>
          <span className="text-muted"> (horário de Brasília)</span>
        </span>
      </p>

      <div className="mt-3 space-y-1.5 border-t border-line pt-3">
        <FonteDoUso uso={uso} />
        <p className="text-xs text-muted">
          Cada consulta traz até 20 lava-jatos do Google Maps.{" "}
          {uso.bloquear
            ? "Quando as grátis acabam, o Radar para de buscar até a renovação (nada é cobrado)."
            : "Passando do limite, o Google cobra cerca de US$ 35 a cada 1.000 consultas."}
        </p>
      </div>
    </Card>
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
