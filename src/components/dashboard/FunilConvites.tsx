"use client";

import { AlertTriangle, Link2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { Badge, Card, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { ETAPAS_CONVITE, maiorQueda, type FunilConvites as Funil } from "@/lib/convites-regras";
import { taxa } from "@/lib/automatico-regras";
import { quandoCurto } from "@/lib/periodo";

/**
 * "Do link à conta" (09/11/2026): de quem recebeu o link de cadastro da Carol até quem criou a conta,
 * passo a passo, e em que campo do cadastro as pessoas travam. Só conta os links com convite (&c=).
 */

const n = (v: number) => v.toLocaleString("pt-BR");
const TOM_PAROU: Record<string, "green" | "brand" | "amber" | "gray"> = {
  conta: "green", enviou: "amber", comecou: "brand", formulario: "brand", abriu: "gray", enviado: "gray",
};

export function FunilConvites({ dias }: { dias: number }) {
  const [f, setF] = useState<Funil | null>(null);
  const pedido = useRef(0);
  const carregar = useCallback(async (d: number) => {
    const meu = ++pedido.current;
    try {
      const r = await api<Funil>(`/api/automatico/convites?dias=${d}`);
      if (meu === pedido.current) setF(r);
    } catch {
      if (meu === pedido.current) setF(null);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(dias), 0);
    const i = window.setInterval(() => document.visibilityState === "visible" && void carregar(dias), 120_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(i);
    };
  }, [carregar, dias]);

  if (!f || !f.disponivel) return null;
  const base = f.etapas.enviados;
  const queda = maiorQueda(f);

  return (
    <Card className="entrar overflow-hidden" style={{ "--i": 9 } as CSSProperties}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        <span className="text-brand-600"><Link2 className="size-4" /></span>
        <p className="text-base font-bold text-ink">Do link à conta</p>
        <span className="ml-auto text-xs text-muted">links com o cadastro já preenchido · últimos {dias} dias</span>
      </div>
      {base === 0 ? (
        <p className="p-5 text-sm text-muted">
          Começa a contar no próximo link que a Carol mandar: cada link leva o convite do lead, a página abre com os dados dele e aqui aparece em
          que passo cada um parou.
        </p>
      ) : (
        <div className="grid gap-6 p-5 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-4">
            <ol key={`f-${dias}`} className="cascata space-y-3">
              {ETAPAS_CONVITE.map((e, i) => {
                const v = f.etapas[e.id];
                const ant = i === 0 ? null : f.etapas[ETAPAS_CONVITE[i - 1].id];
                const t = ant === null ? null : taxa(v, ant);
                const largura = base ? Math.max(v > 0 ? 3 : 0, Math.round((v / base) * 100)) : 0;
                return (
                  <li key={e.id} style={{ "--i": i } as CSSProperties} className="space-y-1" title={e.explica}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-ink">{e.rotulo}</span>
                      <span className="shrink-0 tabular-nums">
                        <b className="text-ink">{n(v)}</b>
                        {ant !== null && <span className="ml-1.5 text-xs text-muted">{t === null ? "—" : `${t.toLocaleString("pt-BR")}%`}</span>}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cx("barra-cresce h-full rounded-full transition-[width] duration-500", e.id === "conta" ? "bg-emerald-500" : "bg-brand-600")}
                        style={{ width: `${largura}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ol>
            {queda && (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-900 ring-1 ring-amber-100">
                <AlertTriangle className="mr-1 inline size-3.5 -translate-y-px" />
                Onde mais gente para: entre <b>{queda.de.toLowerCase()}</b> e <b>{queda.para.toLowerCase()}</b> ({n(queda.perderam)}{" "}
                {queda.perderam === 1 ? "pessoa" : "pessoas"}, {queda.pct}%).
              </p>
            )}
          </div>

          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Campos que faltaram ao tentar criar</p>
              {f.faltou.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {f.faltou.map((c) => (
                    <Badge key={c.campo} tone="amber">
                      {c.texto} · {n(c.n)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Ninguém travou em campo nenhum até agora.</p>
              )}
            </div>
            {f.erros.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Erros ao criar a conta</p>
                <ul className="space-y-1.5 text-sm">
                  {f.erros.map((e, i) => (
                    <li key={i} className="text-ink">
                      <span className="text-xs text-muted">{e.em ? quandoCurto(e.em) : ""} · </span>
                      {e.mensagem}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Últimos links</p>
              <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                {f.ultimos.map((u, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{u.nome}</span>
                      <span className="block text-[11px] text-muted">
                        link {u.enviadoEm ? quandoCurto(u.enviadoEm) : ""}
                        {u.aberturas > 0 ? ` · abriu ${u.aberturas}×` : ""}
                      </span>
                    </span>
                    <Badge tone={TOM_PAROU[u.etapa] ?? "gray"}>{u.texto}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
