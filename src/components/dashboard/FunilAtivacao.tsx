"use client";

import { Filter, Store } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { Badge, Card, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { PERIODOS, taxa, type FunilAtivacao as Funil, type Periodo } from "@/lib/funil-regras";

/**
 * Funil de ativação de parceiros (30/10/2026): de quem conversou com a Carol até o primeiro agendamento.
 * Cada etapa conta só quem passou pela anterior; embaixo, os lava-jatos novos que pararam no caminho.
 */

const n = (v: number) => v.toLocaleString("pt-BR");

function Etapa({ rotulo, valor, base, anterior, i }: { rotulo: string; valor: number; base: number; anterior: number | null; i: number }) {
  const largura = base ? Math.max(valor > 0 ? 4 : 0, Math.round((valor / base) * 100)) : 0;
  const t = anterior === null ? null : taxa(valor, anterior);
  return (
    <li style={{ "--i": i } as CSSProperties} className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-ink">{rotulo}</span>
        <span className="shrink-0 tabular-nums">
          <b className="text-ink">{n(valor)}</b>
          {anterior !== null && <span className="ml-1.5 text-xs text-muted">{t === null ? "—" : `${t}% da etapa anterior`}</span>}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-[width] duration-500" style={{ width: `${largura}%` }} />
      </div>
    </li>
  );
}

export function FunilAtivacao() {
  const [dias, setDias] = useState<Periodo>(30);
  const [funil, setFunil] = useState<Funil | null>(null);
  const [erro, setErro] = useState(false);

  const pedido = useRef(0);
  const carregar = useCallback(async (d: Periodo) => {
    const meu = ++pedido.current; // trocou de período no meio: só vale a resposta do último pedido
    try {
      const f = await api<Funil>(`/api/funil?dias=${d}`);
      if (meu === pedido.current) { setFunil(f); setErro(false); }
    } catch {
      if (meu === pedido.current) setErro(true);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(dias), 0);
    return () => window.clearTimeout(t);
  }, [carregar, dias]);

  if (funil && !funil.disponivel) return null;
  const etapas = funil?.etapas ?? [];
  const base = etapas[0]?.n ?? 0;
  const c = funil?.cadastros;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        <Filter className="size-4 text-brand-600" />
        <p className="text-base font-bold text-ink">Funil de ativação de parceiros</p>
        <div className="ml-auto flex gap-1" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDias(p)}
              aria-pressed={dias === p}
              className={cx(
                "rounded-lg px-2.5 py-1 text-xs font-semibold transition",
                dias === p ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100" : "text-muted hover:bg-slate-100",
              )}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {!funil && !erro ? (
        <div className="space-y-3 p-5">
          <div className="skeleton h-6 rounded-lg" />
          <div className="skeleton h-6 rounded-lg" />
          <div className="skeleton h-6 rounded-lg" />
        </div>
      ) : erro && !funil ? (
        <p className="px-5 py-6 text-sm text-muted">Não deu para ler o funil agora. Tente de novo em instantes.</p>
      ) : (
        <div className="space-y-5 p-5">
          {base === 0 ? (
            <p className="text-sm text-muted">Ninguém conversou com a Carol nos últimos {funil?.dias} dias.</p>
          ) : (
            <ol className="stagger space-y-3">
              {etapas.map((e, i) => (
                <Etapa key={e.chave} i={i} rotulo={e.rotulo} valor={e.n} base={base} anterior={i === 0 ? null : etapas[i - 1].n} />
              ))}
            </ol>
          )}
          {!!funil?.jaParceiros && (
            <p className="text-xs text-muted">
              {n(funil.jaParceiros)} {funil.jaParceiros === 1 ? "pessoa que conversou já era parceira" : "pessoas que conversaram já eram parceiras"} antes (não contam como conta nova).
            </p>
          )}
          {!!funil?.contaSemLink && (
            <p className="text-xs text-muted">
              Mais {n(funil.contaSemLink)} {funil.contaSemLink === 1 ? "pessoa criou" : "pessoas criaram"} a conta sem receber o link da Carol.
            </p>
          )}

          {c && (
            <div className="rounded-xl bg-surface px-4 py-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Store className="size-4 text-muted" /> Lava-jatos novos nos últimos {funil?.dias} dias
              </p>
              <p className="mt-1 text-sm text-ink tabular-nums">
                <b>{n(c.total)}</b> {c.total === 1 ? "cadastro" : "cadastros"} · <b>{n(c.prontos)}</b> {c.prontos === 1 ? "pronto" : "prontos"} para clientes ·{" "}
                <b>{n(c.comAgendamento)}</b> com agendamento · <b>{n(c.pelaCarol)}</b> pela Carol
              </p>
            </div>
          )}

          {!!funil?.parados.length && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pararam no caminho</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {funil.parados.map((p, i) => (
                  <li key={`${p.unidade}-${i}`} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold text-ink">{p.unidade}</span>
                      <Badge tone={p.pronto ? "amber" : "red"}>{p.pronto ? "Sem agendamento" : "Falta preparar"}</Badge>
                      {p.pelaCarol && <Badge tone="brand">pela Carol</Badge>}
                      <span className="ml-auto text-xs text-muted">{p.dias === 1 ? "há 1 dia" : `há ${p.dias} dias`}</span>
                    </div>
                    {p.falta && <p className="mt-1 text-xs text-muted">Falta: {p.falta}</p>}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted">A Sofia acompanha os 7 primeiros dias de cada lava-jato novo e o Pedro recebe um aviso com 48 h.</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
