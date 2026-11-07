"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { cx } from "@/components/ui";
import { taxa, type DiaEnvios } from "@/lib/automatico-regras";

/**
 * Envios por dia (tela Disparo automático). Só os dias úteis, porque o disparo não roda no fim de semana.
 * Duas colunas por dia, do mesmo tom: enviados (claro, contexto) e quem respondeu em até 7 dias (forte, o que importa).
 * As colunas crescem da base ao abrir; passar o mouse (ou o foco do teclado) mostra o dia inteiro.
 * Cores conferidas com o validador de paleta (ordinal, claro e escuro): --color-grafico-envio e --color-grafico-resposta.
 */

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const n = (v: number) => v.toLocaleString("pt-BR");
const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const pct = (parte: number, total: number) => {
  const t = taxa(parte, total);
  return t === null ? "—" : `${t.toLocaleString("pt-BR")}%`;
};

/** Topo do eixo: o primeiro número "redondo" acima do maior dia. */
export function topoDoEixo(max: number): number {
  const redondos = [10, 20, 25, 40, 50, 60, 80, 100, 120, 150, 200, 250, 300, 400, 500, 750, 1000];
  return redondos.find((r) => r >= max) ?? Math.ceil(max / 500) * 500;
}

function marcas(topo: number): number[] {
  const partes = topo % 4 === 0 ? 4 : 2;
  return Array.from({ length: partes + 1 }, (_, i) => (topo / partes) * i);
}

export function GraficoEnvios({ dias }: { dias: DiaEnvios[] }) {
  const uteis = useMemo(() => dias.filter((d) => diaDaSemana(d.dia) >= 1 && diaDaSemana(d.dia) <= 5), [dias]);
  const comEnvio = uteis.filter((d) => d.enviados > 0);
  const topo = topoDoEixo(Math.max(0, ...uteis.map((d) => d.enviados)));
  const ticks = marcas(topo);
  const [pronto, setPronto] = useState(false);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const r = requestAnimationFrame(() => setPronto(true));
    return () => cancelAnimationFrame(r);
  }, []);

  const totalEnv = comEnvio.reduce((a, d) => a + d.enviados, 0);
  const totalResp = comEnvio.reduce((a, d) => a + d.responderam, 0);
  // Datas embaixo: todas no computador (até 24 dias úteis); no celular, uma sim, uma não (ou 1 a cada 3 no mês).
  const passoCel = uteis.length > 16 ? 3 : uteis.length > 6 ? 2 : 1;
  const passoDesk = uteis.length > 24 ? 2 : 1;
  const d = ativo === null ? null : uteis[ativo];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-base font-bold text-ink">Envios por dia útil</p>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-grafico-envio" /> Enviados
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px] bg-grafico-resposta" /> Responderam em até 7 dias
            </span>
          </div>
        </div>
        {comEnvio.length > 0 && (
          <p className="text-xs text-muted sm:text-right">
            Média por dia de disparo
            <span className="mt-0.5 block text-sm text-ink">
              <b className="font-bold">{n(Math.round(totalEnv / comEnvio.length))}</b> enviados ·{" "}
              <b className="font-bold">{pct(totalResp, totalEnv)}</b> responderam
            </span>
          </p>
        )}
      </div>

      <div className="flex gap-2">
        {/* Eixo: só a escala, discreto */}
        <div className="relative h-48 w-7 shrink-0 text-right text-[10px] text-muted tabular-nums" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / topo) * 100}%` }}>
              {n(t)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-48" onPointerLeave={() => setAtivo(null)}>
            {ticks.map((t) => (
              <div key={t} className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ bottom: `${(t / topo) * 100}%` }} aria-hidden />
            ))}

            <div className="absolute inset-0 flex">
              {uteis.map((x, i) => {
                const he = (x.enviados / topo) * 100;
                const hr = (x.responderam / topo) * 100;
                const anim = (atraso: number): CSSProperties => ({
                  transform: pronto ? "scaleY(1)" : "scaleY(0)",
                  transformOrigin: "bottom",
                  transition: "transform 700ms cubic-bezier(0.2, 0.8, 0.2, 1), filter 150ms",
                  transitionDelay: pronto ? `${i * 40 + atraso}ms` : "0ms",
                });
                return (
                  <button
                    key={x.dia}
                    type="button"
                    onPointerEnter={() => setAtivo(i)}
                    onFocus={() => setAtivo(i)}
                    onBlur={() => setAtivo(null)}
                    aria-label={`${SEMANA[diaDaSemana(x.dia)]}, ${dataCurta(x.dia)}: ${n(x.enviados)} enviados, ${n(x.responderam)} responderam`}
                    className={cx(
                      "relative flex h-full min-w-0 flex-1 items-end justify-center gap-[2px] rounded-lg outline-none transition-colors",
                      ativo === i ? "bg-ink/[0.045]" : "",
                      "focus-visible:ring-2 focus-visible:ring-brand-300",
                    )}
                  >
                    {x.enviados > 0 ? (
                      <>
                        <span
                          className={cx("block rounded-t-[4px] bg-grafico-envio", ativo === i && "brightness-110")}
                          style={{ height: `${he}%`, width: "min(18px, 38%)", ...anim(0) }}
                        />
                        <span
                          className={cx("block rounded-t-[4px] bg-grafico-resposta", ativo === i && "brightness-110")}
                          style={{ height: `${Math.max(hr, x.responderam > 0 ? 1.5 : 0)}%`, width: "min(18px, 38%)", ...anim(90) }}
                        />
                      </>
                    ) : (
                      <span className="mb-[-1px] block h-[2px] rounded-full bg-line" style={{ width: "min(38px, 80%)" }} />
                    )}
                  </button>
                );
              })}
            </div>

            {d && ativo !== null && (
              <div
                role="status"
                className="pointer-events-none absolute top-2 z-10 w-52 rounded-xl border border-line bg-card px-3 py-2.5 text-xs shadow-lg animate-fade-in"
                style={
                  // Ao lado da coluna (à direita na 1ª metade, à esquerda na 2ª), sem cobrir as barras nem sair do cartão.
                  ativo < uteis.length / 2
                    ? { left: `calc(${((ativo + 1) / uteis.length) * 100}% + 6px)` }
                    : { right: `calc(${((uteis.length - ativo) / uteis.length) * 100}% + 6px)` }
                }
              >
                <p className="mb-1.5 font-semibold text-muted">
                  {SEMANA[diaDaSemana(d.dia)]}, {dataCurta(d.dia)}
                </p>
                {d.enviados === 0 ? (
                  <p className="text-ink">Sem disparo neste dia</p>
                ) : (
                  <ul className="space-y-1">
                    <li className="flex items-center gap-2">
                      <span className="h-0.5 w-3 rounded-full bg-grafico-envio" />
                      <b className="text-sm text-ink tabular-nums">{n(d.enviados)}</b>
                      <span className="text-muted">enviados{d.segundos ? ` (${n(d.segundos)} de 2º contato)` : ""}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="h-0.5 w-3 rounded-full bg-grafico-resposta" />
                      <b className="text-sm text-ink tabular-nums">{n(d.responderam)}</b>
                      <span className="text-muted">responderam · {pct(d.responderam, d.enviados)}</span>
                    </li>
                    {(d.saidas > 0 || d.erros > 0) && (
                      <li className="pt-0.5 text-muted">
                        {d.saidas > 0 && <>{n(d.saidas)} pediram para parar</>}
                        {d.saidas > 0 && d.erros > 0 && " · "}
                        {d.erros > 0 && <>{n(d.erros)} não chegaram</>}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>

          <div className="mt-2 flex">
            {uteis.map((x, i) => (
              <span
                key={x.dia}
                className={cx(
                  "min-w-0 flex-1 text-center leading-tight whitespace-nowrap text-muted",
                  i % passoCel !== 0 && "max-sm:invisible",
                  i % passoDesk !== 0 && "sm:invisible",
                )}
              >
                <span className="block text-[10px]">{SEMANA[diaDaSemana(x.dia)]}</span>
                <span className="block text-[11px] text-ink/80 tabular-nums">{dataCurta(x.dia)}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {comEnvio.length === 0 && <p className="mt-3 text-sm text-muted">Nenhum disparo nos dias deste período.</p>}

      {/* Mesmos números em tabela, para leitor de tela */}
      <table className="sr-only">
        <caption>Envios por dia útil</caption>
        <thead>
          <tr>
            <th>Dia</th>
            <th>Enviados</th>
            <th>Responderam</th>
            <th>Saíram</th>
          </tr>
        </thead>
        <tbody>
          {uteis.map((x) => (
            <tr key={x.dia}>
              <td>{dataCurta(x.dia)}</td>
              <td>{x.enviados}</td>
              <td>{x.responderam}</td>
              <td>{x.saidas}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
