"use client";

import {
  AlertTriangle,
  CalendarClock,
  CirclePause,
  CirclePlay,
  History,
  Link2,
  MapPin,
  MessageCircle,
  RefreshCw,
  Repeat2,
  Search,
  Send,
  ShieldAlert,
  Store,
  ThumbsDown,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { AnimatedNumber, useCountUp } from "@/components/motion";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Modal, Toggle, cx } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { estadoDoDisparo, MOTIVO_BUSCA, taxa, type ChaveLigar, type PainelAutomatico } from "@/lib/automatico-regras";
import type { StatusDisparo } from "@/lib/disparo-regras";
import { quandoCurto } from "@/lib/periodo";
import type { Uso } from "@/lib/types";

import { nomeDoModelo } from "./ModeloWhatsApp";
import { GraficoEnvios } from "./GraficoEnvios";
import { CartaoSaude } from "./SaudeNumero";

/**
 * Tela "Disparo automático" (07/11/2026, pedido do Jean): como o disparo da Carol está indo, a saúde do número,
 * a fila (com o 2º contato), a busca automática de leads e o botão de pausar/continuar.
 * Atualiza sozinha a cada minuto.
 */

const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (parte: number, total: number) => {
  const t = taxa(parte, total);
  return t === null ? "—" : `${t.toLocaleString("pt-BR")}%`;
};
const dataCurta = (iso: string) => (iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);
const DIAS = [7, 14, 30] as const;
type Dias = (typeof DIAS)[number];

const TOM: Record<string, { selo: string; ponto: string; vivo: boolean }> = {
  ligado: { selo: "bg-emerald-50 text-emerald-700 ring-emerald-200", ponto: "bg-emerald-500 text-emerald-500", vivo: true },
  sem_rodada: { selo: "bg-emerald-50 text-emerald-700 ring-emerald-200", ponto: "bg-emerald-400 text-emerald-400", vivo: true },
  aguardando: { selo: "bg-brand-50 text-brand-700 ring-brand-200", ponto: "bg-brand text-brand", vivo: true },
  metade: { selo: "bg-amber-50 text-amber-800 ring-amber-200", ponto: "bg-amber-500 text-amber-500", vivo: true },
  freio: { selo: "bg-red-50 text-red-700 ring-red-200", ponto: "bg-red-500 text-red-500", vivo: false },
  pausado: { selo: "bg-slate-100 text-slate-700 ring-slate-200", ponto: "bg-slate-400 text-slate-400", vivo: false },
};

/** "Jean (plano de 07/11: ...)" → "Jean"; "Radar (pausar)" → "Radar". */
const quem = (por: string) => por.replace(/\s*\(.*$/, "").trim() || "alguém da equipe";

const CORES = {
  brand: { linha: "bg-brand", icone: "bg-brand-50 text-brand-700", valor: "text-brand-700" },
  verde: { linha: "bg-emerald-500", icone: "bg-emerald-50 text-emerald-700", valor: "text-emerald-600" },
  ambar: { linha: "bg-amber-400", icone: "bg-amber-50 text-amber-700", valor: "text-strong" },
  neutro: { linha: "bg-slate-400", icone: "bg-slate-100 text-slate-600", valor: "text-strong" },
} as const;

/** Cartão de número com explicação curta (07/11/2026: o Jean não entendeu "Pediram para sair"). */
function Indicador({
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
  explica: string;
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
      <div className={cx("mt-1 text-[28px] leading-tight font-extrabold tracking-tight", c.valor)}>{valor}</div>
      <p className="mt-0.5 text-xs text-ink">{detalhe}</p>
      <p className="mt-2 border-t border-line pt-2 text-[11px] leading-snug text-muted">{explica}</p>
    </Card>
  );
}

/** Porcentagem que sobe contando ao abrir e ao mudar o período. */
function Porcento({ parte, total }: { parte: number; total: number }) {
  const t = taxa(parte, total);
  const [alvo, setAlvo] = useState(0);
  useEffect(() => {
    const r = requestAnimationFrame(() => setAlvo(Math.round((t ?? 0) * 10)));
    return () => cancelAnimationFrame(r);
  }, [t]);
  const v = useCountUp(alvo, 900);
  return <>{t === null ? "—" : `${(v / 10).toLocaleString("pt-BR")}%`}</>;
}

function Titulo({ icone, children, extra }: { icone: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
      <span className="text-brand-600">{icone}</span>
      <p className="text-base font-bold text-ink">{children}</p>
      {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
    </div>
  );
}

export function AutomaticoView({ uso }: { uso: Uso | null }) {
  const toast = useToast();
  const [dias, setDias] = useState<Dias>(14);
  const [p, setP] = useState<PainelAutomatico | null>(null);
  const [saude, setSaude] = useState<StatusDisparo | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [confirmar, setConfirmar] = useState<{ chave: ChaveLigar; ligado: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const pedido = useRef(0);
  const carregar = useCallback(async (d: Dias) => {
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const [painel, s] = await Promise.all([api<PainelAutomatico>(`/api/automatico?dias=${d}`), api<StatusDisparo>("/api/disparo").catch(() => null)]);
      if (meu !== pedido.current) return;
      setP(painel);
      if (s) setSaude(s);
      setErro("");
    } catch (e) {
      if (meu === pedido.current) setErro((e as Error).message);
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(dias), 0);
    const i = window.setInterval(() => document.visibilityState === "visible" && void carregar(dias), 60_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(i);
    };
  }, [carregar, dias]);

  const ligar = async (chave: ChaveLigar, ligado: boolean) => {
    setSalvando(true);
    try {
      setP(await api<PainelAutomatico>("/api/automatico/ligar", { chave, ligado, dias }));
      const nome = chave === "disparo" ? "Disparo automático" : chave === "busca" ? "Busca automática" : "2º contato";
      toast(`${nome} ${ligado ? "ligado" : "pausado"}.`, "success");
      setConfirmar(null);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSalvando(false);
    }
  };

  const buscarAgora = async () => {
    setBuscando(true);
    try {
      const r = await api<{ iniciada: boolean; texto: string }>("/api/automatico/buscar", {});
      toast(r.iniciada ? `Busca começou: ${r.texto}. O resultado aparece aqui em alguns minutos.` : `A busca não começou: ${r.texto}.`, r.iniciada ? "success" : "info");
      if (r.iniciada) window.setTimeout(() => void carregar(dias), 20_000);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu para começar a busca agora.", "error");
    } finally {
      setBuscando(false);
    }
  };

  if (!p) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-strong">Disparo automático</h1>
        {erro ? (
          <Card className="p-5 text-sm text-muted">
            Não deu para ler o painel agora: {erro}{" "}
            <button className="font-semibold text-brand-700 underline" onClick={() => void carregar(dias)}>Tentar de novo</button>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}
          </div>
        )}
      </div>
    );
  }
  if (!p.disponivel) {
    return (
      <Card className="p-6 text-sm text-muted">O painel precisa do banco do Lavacar configurado no servidor (variável radar-atendimento no EasyPanel).</Card>
    );
  }

  const est = estadoDoDisparo(p);
  const tom = TOM[est.estado] ?? TOM.ligado;
  const ultimaMudanca = p.mudancas.find((m) => m.chave === "disparo_automatico" && /pausado|continuado/.test(m.texto));
  const per = p.periodo;
  const restamHoje = Math.max(0, p.situacao.limite - p.situacao.enviadosHoje);
  const cidadesBusca = p.busca.cidades;
  const feitas = new Set(p.busca.cidadesFeitas.map((c) => c.toLowerCase()));
  const sc = p.segundoContato;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-strong">Disparo automático</h1>
          <p className="mt-1 text-sm text-muted">A Carol manda a 1ª mensagem sozinha, de segunda a sexta. Aqui dá para acompanhar e pausar.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void carregar(dias)} loading={carregando} icon={<RefreshCw className="size-4" />}>
          Atualizar
        </Button>
      </div>

      {/* Situação + pausar/continuar (borda ciano correndo enquanto está ligado) */}
      <div className={cx("entrar rounded-2xl", tom.vivo ? "borda-viva p-px" : "")} style={{ "--i": 0 } as CSSProperties}>
      <Card className={cx("overflow-hidden", tom.vivo && "border-transparent")}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="min-w-0 flex-1">
            <span className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ring-1 ring-inset", tom.selo)}>
              <span className={cx("size-2 rounded-full", tom.ponto, tom.vivo && "anel-pulso")} />
              {est.titulo}
            </span>
            <p className="mt-2 text-sm text-ink">{est.detalhe}</p>
            <p className="mt-2 text-xs text-muted tabular-nums">
              Hoje: <b className="text-ink">{n(p.situacao.enviadosHoje)}</b> enviados
              {p.situacao.rotinaLiberada || !p.disparo.ligado ? (
                <>
                  {" "}de <b className="text-ink">{n(p.situacao.limite)}</b>
                  {p.situacao.limite !== p.situacao.limiteConfigurado && <> (limite configurado {n(p.situacao.limiteConfigurado)})</>}
                </>
              ) : (
                <> · limite de <b className="text-ink">{n(p.situacao.limiteConfigurado)}</b> por dia quando começar</>
              )}
              {p.disparo.ligado && restamHoje > 0 && est.estado !== "freio" && <> · faltam {n(restamHoje)}</>}
              {p.hoje.radar > 0 && <> · {n(p.hoje.radar)} pelo Radar</>}
            </p>
            {ultimaMudanca && (
              <p className="mt-1 text-[11px] text-muted">
                {/pausado/.test(ultimaMudanca.texto) ? "Pausado" : "Continuado"} {quandoCurto(ultimaMudanca.em)}, por {quem(ultimaMudanca.por)}.
              </p>
            )}
          </div>
          {p.disparo.ligado ? (
            <Button variant="danger" size="lg" onClick={() => setConfirmar({ chave: "disparo", ligado: false })} icon={<CirclePause className="size-5" />}>
              Pausar disparos
            </Button>
          ) : (
            <Button size="lg" onClick={() => setConfirmar({ chave: "disparo", ligado: true })} icon={<CirclePlay className="size-5" />}>
              Continuar disparos
            </Button>
          )}
        </div>
        {p.situacao.freios.length > 0 && (
          <ul className="space-y-1 border-t border-line bg-amber-50/60 px-5 py-3 sm:px-6">
            {p.situacao.freios.map((f) => (
              <li key={f.motivo} className="flex items-start gap-2 text-sm text-amber-900">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {f.texto}
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>

      {/* Números do período */}
      <div className="entrar flex flex-wrap items-center justify-between gap-2" style={{ "--i": 1 } as CSSProperties}>
        <p className="text-sm font-bold text-ink">Como está indo</p>
        <div className="flex gap-1" role="group" aria-label="Período">
          {DIAS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              aria-pressed={dias === d}
              className={cx("rounded-lg px-2.5 py-1 text-xs font-semibold transition", dias === d ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100" : "text-muted hover:bg-slate-100")}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>
      <div key={`kpi-${p.dias}`} className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador
          i={2}
          cor="neutro"
          rotulo="Mensagens enviadas"
          valor={<AnimatedNumber value={per.enviados} />}
          detalhe={<>nos últimos {p.dias} dias · <b>{n(p.hoje.enviados)}</b> hoje</>}
          explica="1ª mensagem e 2º contato da Carol, pela rotina e pelo Radar."
          icone={<Send className="size-4" />}
        />
        <Indicador
          i={3}
          cor="brand"
          rotulo="Responderam"
          valor={<Porcento parte={per.responderam} total={per.enviados} />}
          detalhe={<><b>{n(per.responderam)}</b> de {n(per.enviados)} pessoas</>}
          explica="Escreveram ou tocaram num botão em até 7 dias depois da mensagem."
          icone={<MessageCircle className="size-4" />}
        />
        <Indicador
          i={4}
          cor="ambar"
          rotulo="Não querem receber"
          valor={<Porcento parte={per.saidas} total={per.enviados} />}
          detalhe={<><b>{n(per.saidas)}</b> de {n(per.enviados)} pediram para parar</>}
          explica={`Tocaram em “Não tenho interesse” ou pediram para sair da lista: não recebem mais nada. Se passar de ${n(p.freioSaidasPct)}% num dia, o disparo pausa sozinho.`}
          icone={<ThumbsDown className="size-4" />}
        />
        <Indicador
          i={5}
          cor="brand"
          rotulo="Receberam o link de cadastro"
          valor={<AnimatedNumber value={per.link} />}
          detalhe={<>{pct(per.link, per.enviados)} de quem recebeu a mensagem</>}
          explica="Conversaram com a Carol até ela mandar o link para criar a conta de parceiro."
          icone={<Link2 className="size-4" />}
        />
        <Indicador
          i={6}
          cor="verde"
          rotulo="Criaram a conta"
          valor={<AnimatedNumber value={per.conta} />}
          detalhe={<>{pct(per.conta, per.link)} de quem recebeu o link</>}
          explica="Criaram a conta de parceiro no Lavacar depois da mensagem."
          icone={<Store className="size-4" />}
        />
      </div>

      <Card className="entrar p-5 sm:p-6" style={{ "--i": 7 } as CSSProperties}>
        <GraficoEnvios key={p.dias} dias={p.porDia} />
        {(per.semWhatsapp > 0 || per.barradas > 0 || per.erros > 0) && (
          <p className="mt-3 text-xs text-muted">
            Não chegaram <b className="text-ink">{n(per.erros)}</b> {per.erros === 1 ? "mensagem" : "mensagens"}: {n(per.semWhatsapp)} para números sem WhatsApp e{" "}
            {n(per.barradas)} que a Meta segurou porque a pessoa já tinha recebido muitas mensagens de empresas.
          </p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Fila e 2º contato */}
        <Card className="entrar overflow-hidden" style={{ "--i": 8 } as CSSProperties}>
          <Titulo icone={<MapPin className="size-4" />}>Fila do disparo</Titulo>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p className="text-sm text-muted">
                <AnimatedNumber value={p.fila.novos} className="text-3xl font-extrabold text-strong" /> leads novos
              </p>
              {p.fila.diasDeFila !== null && (
                <p className={cx("text-sm", p.fila.diasDeFila < 2 ? "font-semibold text-amber-700" : "text-muted")}>
                  dá para cerca de <b className="text-ink">{p.fila.diasDeFila.toLocaleString("pt-BR")}</b> {p.fila.diasDeFila === 1 ? "dia" : "dias"} de disparo
                </p>
              )}
            </div>
            {p.fila.diasDeFila !== null && (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className={cx("barra-cresce h-full rounded-full", p.fila.diasDeFila < 2 ? "bg-amber-400" : "bg-brand")}
                    style={{ width: `${Math.min(100, (p.fila.diasDeFila / Math.max(1, p.busca.filaDias)) * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Meta: {n(p.busca.filaDias)} dias de fila. {p.busca.ligado ? "Abaixo disso, a busca automática procura lava-jatos novos sozinha." : "A busca automática está desligada."}
                </p>
              </div>
            )}
            {p.fila.porCidade.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {p.fila.porCidade.map((c, i) => (
                  <span key={c.cidade} className="entrar" style={{ "--i": i + 9 } as CSSProperties}>
                    <Badge tone="gray">{c.cidade} · {n(c.n)}</Badge>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted">
              Não entram na fila: {n(p.fila.optout)} que pediram para não receber, {n(p.fila.semWhatsapp)} sem WhatsApp e {n(p.fila.removidos)} removidos
              (telefone fixo, não é lava-jato ou sem nome).
            </p>

            <div className="rounded-xl border border-line p-4">
              <Toggle
                checked={sc.ligado}
                onChange={(v) => setConfirmar({ chave: "segundo", ligado: v })}
                label="2º contato para quem não respondeu"
                hint={`${sc.dias} dias depois da 1ª mensagem, com outra mensagem${sc.modelo ? ` (${nomeDoModelo(sc.modelo)})` : ""}. Cerca de ${Math.round(sc.peso * 10)} em cada 10 envios do dia.`}
              />
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-surface px-2 py-2">
                  <AnimatedNumber value={p.fila.segundoProntos} className="block text-lg font-extrabold text-strong" />
                  <p className="text-[11px] text-muted">prontos agora</p>
                </div>
                <div className="rounded-lg bg-surface px-2 py-2">
                  <AnimatedNumber value={p.fila.segundo7Dias} className="block text-lg font-extrabold text-strong" />
                  <p className="text-[11px] text-muted">nos próximos 7 dias</p>
                </div>
                <div className="rounded-lg bg-surface px-2 py-2">
                  <p className="text-lg font-extrabold text-strong tabular-nums">{p.fila.segundoProximo ? dataCurta(p.fila.segundoProximo) : "—"}</p>
                  <p className="text-[11px] text-muted">próximo</p>
                </div>
              </div>
              {!sc.ligado && (
                <p className="mt-2 text-[11px] text-muted">Desligado: ninguém recebe o 2º contato.</p>
              )}
            </div>
          </div>
        </Card>

        {/* Saúde do número */}
        <div className="entrar space-y-5" style={{ "--i": 9 } as CSSProperties}>
          <CartaoSaude s={saude} />
          {p.freiosLog.length > 0 && (
            <Card className="overflow-hidden">
              <Titulo icone={<AlertTriangle className="size-4" />}>Freios que ligaram</Titulo>
              <ul className="divide-y divide-line">
                {p.freiosLog.slice(0, 6).map((f) => (
                  <li key={`${f.dia}-${f.motivo}`} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                    <Badge tone={f.nivel === "pausa" ? "red" : "amber"}>{dataCurta(f.dia)}</Badge>
                    <span className="text-ink">{f.detalhe}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {/* Mensagens */}
      {p.modelos.length > 0 && (
        <Card className="entrar overflow-hidden" style={{ "--i": 10 } as CSSProperties}>
          <Titulo icone={<Repeat2 className="size-4" />}>Resultado de cada mensagem nos últimos {p.dias} dias</Titulo>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-5 py-2 font-semibold">Mensagem</th>
                  <th className="px-3 py-2 text-right font-semibold">Enviadas</th>
                  <th className="px-3 py-2 text-right font-semibold">Responderam</th>
                  <th className="px-3 py-2 text-right font-semibold">Não querem</th>
                  <th className="px-3 py-2 text-right font-semibold">Link</th>
                  <th className="px-5 py-2 text-right font-semibold">Conta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {p.modelos.map((m) => (
                  <tr key={`${m.modelo}-${m.segundo}`} className="transition-colors hover:bg-surface">
                    <td className="px-5 py-2.5 text-ink">
                      {nomeDoModelo(m.modelo)} {m.segundo && <Badge tone="brand">2º contato</Badge>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{n(m.enviados)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{n(m.responderam)} <span className="text-xs text-muted">{pct(m.responderam, m.enviados)}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{n(m.saidas)} <span className="text-xs text-muted">{pct(m.saidas, m.enviados)}</span></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{n(m.link)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{n(m.conta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-2.5 text-[11px] text-muted">
            Responderam: escreveram ou tocaram num botão em até 7 dias. Não querem: pediram para parar de receber. Link: receberam o link de
            cadastro. Conta: criaram a conta de parceiro.
          </p>
        </Card>
      )}

      {/* Busca automática */}
      <Card className="entrar overflow-hidden" style={{ "--i": 11 } as CSSProperties}>
        <Titulo
          icone={<Search className="size-4" />}
          extra={
            <Button size="sm" variant="outline" onClick={() => void buscarAgora()} loading={buscando} icon={<Search className="size-3.5" />}>
              Buscar agora
            </Button>
          }
        >
          Busca automática de leads
        </Titulo>
        <div className="space-y-4 p-5">
          <Toggle
            checked={p.busca.ligado}
            onChange={(v) => setConfirmar({ chave: "busca", ligado: v })}
            label="Buscar leads novos sozinho nos dias de disparo"
            hint={`Antes da 1ª rodada, só quando a fila tem menos de ${n(p.busca.filaDias)} dias de disparo. No máximo ${n(p.busca.maxConsultasDia)} consultas por dia; ${n(p.busca.reservaCota)} consultas do mês ficam para a busca manual.`}
          />
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
            <span>Neste mês: <b className="text-ink tabular-nums">{n(p.busca.adicionadosMes)}</b> leads novos em <b className="text-ink tabular-nums">{n(p.busca.consultasMes)}</b> consultas</span>
            {uso && <span>Cota do Google: <b className="text-ink tabular-nums">{n(uso.restantes)}</b> de {n(uso.limite)} livres</span>}
          </div>
          {cidadesBusca.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted">Cidades, na ordem ({p.busca.termos.join(", ")})</p>
              <div className="flex flex-wrap gap-1.5">
                {cidadesBusca.map((c) => (
                  <Badge key={c} tone={feitas.has(c.toLowerCase()) ? "brand" : "gray"} title={feitas.has(c.toLowerCase()) ? "Já buscada (não repete por 90 dias)" : "Ainda não buscada"}>
                    {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {p.busca.ultimas.length > 0 ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {p.busca.ultimas.slice(0, 6).map((r, i) => (
                <li key={r.inicio} className="entrar px-4 py-2.5 text-sm transition-colors hover:bg-surface" style={{ "--i": i + 12 } as CSSProperties}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-semibold text-ink">{quandoCurto(r.inicio)}</span>
                    <Badge tone={r.origem === "manual" ? "navy" : "gray"}>{r.origem === "manual" ? "Buscar agora" : "automática"}</Badge>
                    {!r.fim ? (
                      <Badge tone="brand">buscando…</Badge>
                    ) : (
                      <span className="text-muted">
                        <b className="text-ink tabular-nums">{n(r.adicionados)}</b> novos na lista · {n(r.consultas)} consultas · {MOTIVO_BUSCA[r.motivoFim] ?? r.motivoFim}
                      </span>
                    )}
                  </div>
                  {r.cidades.length > 0 && (
                    <p className="mt-0.5 text-xs text-muted">{r.cidades.slice(0, 5).map((c) => `${c.cidade}: ${n(c.adicionados)}`).join(" · ")}</p>
                  )}
                  {r.erro && <p className="mt-0.5 text-xs text-red-600">{r.erro}</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Ainda não rodou. A 1ª busca automática sai no próximo dia útil, antes das 9h, se a fila precisar.</p>
          )}
        </div>
      </Card>

      {/* Mudanças */}
      {p.mudancas.length > 0 && (
        <Card className="entrar overflow-hidden" style={{ "--i": 12 } as CSSProperties}>
          <Titulo icone={<History className="size-4" />}>Últimas mudanças</Titulo>
          <ul className="divide-y divide-line">
            {p.mudancas.map((m) => (
              <li key={`${m.chave}-${m.em}`} className="flex flex-wrap items-baseline gap-x-2 px-5 py-2.5 text-sm transition-colors hover:bg-surface">
                <span className="text-ink">{m.texto}</span>
                <span className="text-xs text-muted">{quandoCurto(m.em)} · {quem(m.por)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted">
        <CalendarClock className="size-3.5" /> Atualizado {p.agora ? quandoCurto(p.agora) : ""}. A tela atualiza sozinha a cada minuto.
      </p>

      <Modal
        open={confirmar !== null}
        onClose={() => !salvando && setConfirmar(null)}
        title={
          confirmar?.chave === "disparo"
            ? confirmar.ligado ? "Continuar o disparo automático?" : "Pausar o disparo automático?"
            : confirmar?.chave === "busca"
              ? confirmar.ligado ? "Ligar a busca automática?" : "Desligar a busca automática?"
              : confirmar?.ligado ? "Ligar o 2º contato?" : "Desligar o 2º contato?"
        }
      >
        <div className="space-y-4 text-sm text-ink">
          {confirmar?.chave === "disparo" && !confirmar.ligado && (
            <p>A rodada que estiver saindo para na próxima mensagem e nenhuma outra sai até alguém clicar em <b>Continuar disparos</b>. Quem já recebeu continua conversando com a Carol normalmente.</p>
          )}
          {confirmar?.chave === "disparo" && confirmar.ligado && (
            <p>As rodadas voltam no próximo horário (de segunda a sexta, a cada 30 min das 9h07 às 16h37), com o limite do dia e os freios de sempre.</p>
          )}
          {confirmar?.chave === "busca" && (
            <p>{confirmar.ligado ? "Nos dias de disparo, antes da 1ª rodada, o Radar busca leads novos no Google se a fila estiver acabando." : "O Radar para de buscar sozinho. A busca manual (Nova prospecção) continua funcionando."}</p>
          )}
          {confirmar?.chave === "segundo" && (
            <p>
              {confirmar.ligado
                ? `Quem recebeu a 1ª mensagem há ${sc.dias} dias ou mais e nunca respondeu passa a entrar na fila, com outra mensagem. Fica de fora quem pediu para sair, quem não recebeu e parceiros.`
                : "Ninguém mais recebe o 2º contato. Quem já recebeu não muda nada."}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={salvando}>Voltar</Button>
            <Button
              variant={confirmar && !confirmar.ligado ? "danger" : "primary"}
              loading={salvando}
              onClick={() => confirmar && void ligar(confirmar.chave, confirmar.ligado)}
            >
              {confirmar?.ligado ? "Sim, ligar" : "Sim, pausar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
