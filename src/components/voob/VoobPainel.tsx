"use client";

import { Coins, Eye, MessageCircle, RefreshCw, Send, ThumbsDown } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { GraficoEnvios } from "@/components/dashboard/GraficoEnvios";
import type { View } from "@/components/dashboard/Shell";
import { AnimatedNumber } from "@/components/motion";
import { Button, Card, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { custoEstimado, funil, reais, taxaPct, textoPausa } from "@/lib/voob/regras";
import type { ConfigVoob, PainelVoob } from "@/lib/voob/tipos";

import { Carregando, Indicador, Titulo, n } from "./comum";

/** Desempenho da prospecção da Voob (12/11/2026): quem recebeu, respondeu, quer ver, pediu para parar e quanto custou. */

const PERIODOS = [7, 14, 30];

function Porcento({ parte, total }: { parte: number; total: number }) {
  const t = taxaPct(parte, total);
  return t === null ? <span className="text-muted">—</span> : <>{t.toLocaleString("pt-BR")}%</>;
}

export function VoobPainel({ cfg, erroCfg, onIr }: { cfg: ConfigVoob | null; erroCfg: { mensagem: string } | null; onIr: (v: View) => void }) {
  const [dias, setDias] = useState(14);
  const [p, setP] = useState<PainelVoob | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async (d: number) => {
    setCarregando(true);
    try {
      setP(await api<PainelVoob>(`/api/voob/painel?dias=${d}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não deu para ler os números agora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(dias), 0);
    return () => window.clearTimeout(t);
  }, [carregar, dias]);

  if (!p) {
    return (
      <div className="space-y-4">
        <Titulo titulo="Desempenho" texto="Quem recebeu, quem respondeu e quem quer ver, dia a dia." />
        {erro ? (
          <Card className="p-5 text-sm text-muted">
            {erro || erroCfg?.mensagem}{" "}
            <button className="font-semibold text-brand-700 underline" onClick={() => void carregar(dias)}>
              Tentar de novo
            </button>
          </Card>
        ) : (
          <Carregando />
        )}
      </div>
    );
  }

  const per = p.periodo;
  const etapas = funil(p);
  const topo = Math.max(1, ...etapas.map((x) => x.valor));
  const semEnvio = p.total.enviados === 0;
  const freio = cfg?.empresa.freio_saidas_pct ?? 8;

  return (
    <div className="space-y-5">
      <Titulo titulo="Desempenho" texto="Quem recebeu a 1ª mensagem, quem respondeu e quem quer ver como ficaria. Atualiza na hora em que abre.">
        <div className="flex gap-1" role="group" aria-label="Período">
          {PERIODOS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              aria-pressed={dias === d}
              className={cx("rounded-lg px-2.5 py-1 text-xs font-semibold transition", dias === d ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100" : "text-muted hover:bg-strong/5")}
            >
              {d} dias
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void carregar(dias)} loading={carregando} icon={<RefreshCw className="size-4" />}>
          Atualizar
        </Button>
      </Titulo>

      {!p.ligado && p.pausado_motivo && p.pausado_motivo !== "manual" && (
        <Card className="border-red-200 bg-red-50/60 p-4 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-200">{textoPausa(p.pausado_motivo)}</Card>
      )}

      {semEnvio ? (
        <Card className="entrar p-6 text-sm text-muted sm:p-8" style={{ "--i": 0 } as CSSProperties}>
          <p className="text-base font-bold text-ink">Os números aparecem aqui depois do primeiro disparo.</p>
          <p className="mt-1">
            Na base agora: <b className="text-ink">{n(p.total.base_pronta)}</b> empresas para chamar.{" "}
            <button className="font-semibold text-brand-700 underline" onClick={() => onIr(p.total.base_pronta ? "disparo" : "buscar")}>
              {p.total.base_pronta ? "Ver o disparo" : "Fazer uma busca"}
            </button>
          </p>
        </Card>
      ) : (
        <>
          <div key={`kpi-${p.dias}`} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Indicador
              i={0}
              cor="neutro"
              rotulo="Receberam"
              valor={<AnimatedNumber value={per.enviados} />}
              detalhe={<>nos últimos {p.dias} dias{per.retomadas ? <> · {n(per.retomadas)} retomadas</> : null}</>}
              explica="A 1ª mensagem saiu e a Meta aceitou."
              icone={<Send className="size-4" />}
            />
            <Indicador
              i={1}
              cor="brand"
              rotulo="Responderam"
              valor={<Porcento parte={per.responderam} total={per.enviados} />}
              detalhe={<><b>{n(per.responderam)}</b> de {n(per.enviados)}</>}
              explica="Escreveram ou tocaram num botão. Viram lead no CRM e a Renata atende."
              icone={<MessageCircle className="size-4" />}
            />
            <Indicador
              i={2}
              cor="verde"
              rotulo="Querem ver"
              valor={<Porcento parte={per.interessados} total={per.enviados} />}
              detalhe={<><b>{n(per.interessados)}</b> tocaram em “Quero ver”</>}
              explica="O sinal mais forte: a Renata mostra como ficaria para eles."
              icone={<Eye className="size-4" />}
            />
            <Indicador
              i={3}
              cor="ambar"
              rotulo="Pediram para parar"
              valor={<Porcento parte={per.pararam} total={per.enviados} />}
              detalhe={<><b>{n(per.pararam)}</b> · {n(per.sem_interesse)} sem interesse</>}
              explica={`Se passar de ${freio.toLocaleString("pt-BR")}% num dia, o Radar pausa sozinho. “Não tenho interesse” fica à parte.`}
              icone={<ThumbsDown className="size-4" />}
            />
            <Indicador
              i={4}
              cor="neutro"
              rotulo="Custo na Meta"
              valor={reais(custoEstimado(per.enviados + per.retomadas))}
              detalhe={<>≈ {reais(per.interessados ? custoEstimado(per.enviados + per.retomadas) / per.interessados : 0)} por “Quero ver”</>}
              explica="Estimativa: R$ 0,32 por mensagem de marketing (tabela da Meta para o Brasil; conferir no painel)."
              icone={<Coins className="size-4" />}
            />
          </div>

          <Card className="entrar p-5 sm:p-6" style={{ "--i": 5 } as CSSProperties}>
            <p className="text-base font-bold text-ink">Do Google à conversa</p>
            <p className="mt-0.5 text-xs text-muted">Desde o começo.</p>
            <div className="mt-4 space-y-2.5">
              {etapas.map((x, i) => (
                <div key={x.id} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-sm">
                  <span className="text-muted">{x.rotulo}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-surface">
                    <div
                      className="barra-cresce h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(x.valor ? 2 : 0, (x.valor / topo) * 100)}%`, opacity: 1 - i * 0.13, "--i": i } as CSSProperties}
                    />
                  </div>
                  <span className="w-12 text-right font-bold text-ink tabular-nums">{n(x.valor)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="entrar p-5 sm:p-6" style={{ "--i": 6 } as CSSProperties}>
            <GraficoEnvios
              dias={p.serie.map((d) => ({ dia: d.dia, enviados: d.enviados, segundos: d.retomadas, responderam: d.responderam, saidas: d.pararam, erros: 0 }))}
            />
          </Card>
        </>
      )}
    </div>
  );
}
