"use client";

import { Check, CircleDashed, Hammer, MessageCircleQuestion, Sparkles } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { Badge, Card, cx } from "@/components/ui";
import { ROTULO_SITE, STATUS, textoAbertura } from "@/lib/voob/regras";
import type { SituacaoSite, StatusLead } from "@/lib/voob/tipos";

export const n = (v: number) => v.toLocaleString("pt-BR");

export function Chip({ children, ativo, onClick, title }: { children: ReactNode; ativo?: boolean; onClick?: () => void; title?: string }) {
  const classe = cx(
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
    ativo ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-strong/[0.04] text-ink ring-line",
    onClick && (ativo ? "hover:bg-brand-100" : "hover:bg-strong/[0.07]"),
  );
  if (!onClick) return <span className={classe} title={title}>{children}</span>;
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className={classe} title={title}>
      {ativo && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

export function SeloSite({ situacao, url }: { situacao: SituacaoSite; url?: string | null }) {
  const tom = situacao === "sem_site" ? "green" : situacao === "rede_social" ? "brand" : "gray";
  const selo = <Badge tone={tom}>{ROTULO_SITE[situacao]}</Badge>;
  if (!url) return selo;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={url} className="transition hover:opacity-80">
      {selo}
    </a>
  );
}

export function SeloStatus({ status }: { status: StatusLead }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tom} title={s.dica}>
      {s.rotulo}
    </Badge>
  );
}

/** Cabeçalho de tela (mesmo desenho das telas do Lavacar). */
export function Titulo({ titulo, texto, children }: { titulo: string; texto: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">{titulo}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{texto}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

const CORES = {
  brand: { linha: "bg-brand", icone: "bg-brand-50 text-brand-700", valor: "text-brand-700" },
  verde: { linha: "bg-emerald-500", icone: "bg-emerald-50 text-emerald-700", valor: "text-emerald-600" },
  ambar: { linha: "bg-amber-400", icone: "bg-amber-50 text-amber-700", valor: "text-strong" },
  neutro: { linha: "bg-slate-400", icone: "bg-slate-100 text-slate-600", valor: "text-strong" },
} as const;

/** Número grande com explicação curta embaixo. */
export function Indicador({
  i,
  rotulo,
  valor,
  detalhe,
  explica,
  icone,
  cor,
}: {
  i: number;
  rotulo: string;
  valor: ReactNode;
  detalhe: ReactNode;
  explica?: string;
  icone: ReactNode;
  cor: keyof typeof CORES;
}) {
  const c = CORES[cor];
  return (
    <Card className="lift entrar group relative overflow-hidden p-4 sm:p-5" style={{ "--i": i } as CSSProperties}>
      <span className={cx("linha-topo", c.linha)} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold text-muted sm:text-[13px]">{rotulo}</span>
        <span className={cx("grid size-8 shrink-0 place-items-center rounded-lg transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110", c.icone)}>
          {icone}
        </span>
      </div>
      <div className={cx("mt-1 text-[28px] leading-tight font-extrabold tracking-tight tabular-nums", c.valor)}>{valor}</div>
      <p className="mt-0.5 text-xs text-ink">{detalhe}</p>
      {explica && <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-muted">{explica}</p>}
    </Card>
  );
}

/** Prévia da 1ª mensagem no formato do WhatsApp (o texto que vai para a aprovação da Meta). */
export function PreviaMensagem({ agente, negocio = "Clínica Bem Estar", botoes = ["Quero ver", "Não tenho interesse"] }: { agente: string; negocio?: string; botoes?: string[] }) {
  const texto = textoAbertura(agente, "§");
  const [antes, depois] = texto.split("§");
  return (
    <div className="max-w-md rounded-2xl bg-[#e9e3d8] p-3 dark:bg-[#0b141a]">
      <div className="relative rounded-xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
        <p>
          {antes}
          <b>{negocio}</b>
          {depois}
        </p>
        <span className="mt-1 block text-right text-[11px] text-[#667781] dark:text-[#8696a0]">09:41</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {botoes.map((b) => (
          <span key={b} className="rounded-xl bg-white py-2 text-center text-[13px] font-semibold text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]">
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

export type Situacao = "pronto" | "rascunho" | "falta" | "construindo";

const SITUACAO: Record<Situacao, { rotulo: string; classe: string; icone: typeof Check }> = {
  pronto: { rotulo: "Pronto", classe: "bg-emerald-50 text-emerald-700 ring-emerald-200", icone: Check },
  rascunho: { rotulo: "Rascunho", classe: "bg-brand-50 text-brand-700 ring-brand-200", icone: Sparkles },
  falta: { rotulo: "Falta", classe: "bg-amber-50 text-amber-700 ring-amber-200", icone: MessageCircleQuestion },
  construindo: { rotulo: "Em construção", classe: "bg-slate-100 text-slate-600 ring-slate-200", icone: Hammer },
};

export function Etiqueta({ situacao, texto }: { situacao: Situacao; texto?: string }) {
  const s = SITUACAO[situacao];
  const Icone = s.icone;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ring-1 ring-inset", s.classe)}>
      <Icone className="size-3" />
      {texto ?? s.rotulo}
    </span>
  );
}

export function Nota({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
      <CircleDashed className="mt-px size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function Carregando({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="skeleton h-28 rounded-2xl" />
      ))}
    </div>
  );
}

export function quando(isoOuNada: string | null | undefined): string {
  if (!isoOuNada) return "";
  const d = new Date(isoOuNada);
  const hoje = new Date();
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  const mesmoDia = fmt({ day: "2-digit", month: "2-digit", year: "numeric" }) ===
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(hoje);
  return mesmoDia ? `hoje às ${fmt({ hour: "2-digit", minute: "2-digit" })}` : `${fmt({ day: "2-digit", month: "2-digit" })} às ${fmt({ hour: "2-digit", minute: "2-digit" })}`;
}
