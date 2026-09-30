"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Clock,
  Flame,
  Headset,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Search,
  Send,
  ThumbsDown,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { BotaoAtender, useChatwoot } from "@/components/chatwoot";
import { AnimatedNumber } from "@/components/motion";
import { Button, Card, cx, inputClass } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { ContatoPainel, Painel, Periodo, Situacao } from "@/lib/painel-regras";
import { quandoCurto } from "@/lib/periodo";
import { normalizePhone, whatsappLink } from "@/lib/phone";

const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "tudo", rotulo: "Tudo" },
];

/** Como cada situação aparece: nome, cor da barra e do selo. Ordem = ordem da barra e dos filtros. */
const SITUACOES: { id: Situacao; rotulo: string; icone: typeof Send; barra: string; selo: string }[] = [
  { id: "atendente", rotulo: "Pediu atendente", icone: Headset, barra: "#f59e0b", selo: "bg-amber-50 text-amber-700 ring-amber-200" },
  { id: "sim", rotulo: "Sim, atendo", icone: Flame, barra: "#10b981", selo: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { id: "conversando", rotulo: "Em conversa", icone: MessageCircle, barra: "#03abc9", selo: "bg-brand-50 text-brand-700 ring-brand-200" },
  { id: "cliente", rotulo: "Cliente Lavacar", icone: BadgeCheck, barra: "#8b7cf6", selo: "bg-[#8b7cf6]/12 text-[#7c6cf2] ring-[#8b7cf6]/30" },
  { id: "sem_resposta", rotulo: "Sem resposta", icone: Clock, barra: "#94a3b8", selo: "bg-slate-100 text-slate-600 ring-slate-200" },
  { id: "sem_interesse", rotulo: "Sem interesse", icone: ThumbsDown, barra: "#f43f5e", selo: "bg-red-50 text-red-700 ring-red-200" },
  { id: "nao_recebeu", rotulo: "Não recebeu", icone: XCircle, barra: "#64748b", selo: "bg-slate-100 text-slate-600 ring-slate-200" },
];
const INFO = Object.fromEntries(SITUACOES.map((s) => [s.id, s])) as Record<Situacao, (typeof SITUACOES)[number]>;
const DICA: Record<Situacao, string> = {
  atendente: "A Carol parou e está esperando alguém da equipe",
  sim: "Respondeu \"Sim, atendo\"",
  conversando: "Respondeu e está conversando com a Carol",
  cliente: "Já é cliente do Lavacar",
  sem_resposta: "Recebeu e ainda não respondeu",
  sem_interesse: "Disse que não tem interesse (não recebe mais mensagens)",
  nao_recebeu: "A mensagem não chegou (sem WhatsApp ou bloqueio do Meta)",
};

type Filtro = "todos" | Situacao;

const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (parte: number, total: number) => (total ? Math.round((parte / total) * 100) : 0);

function Selo({ s }: { s: Situacao }) {
  const i = INFO[s];
  const Icone = i.icone;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset", i.selo)} title={DICA[s]}>
      <Icone className="size-3" /> {i.rotulo}
    </span>
  );
}

function UltimaMensagem({ c, className }: { c: ContatoPainel; className?: string }) {
  if (!c.ultima) return <span className="text-xs text-muted">—</span>;
  return (
    <p className={cx("line-clamp-2 text-xs text-ink", className)}>
      <b className={c.ultima.deCarol ? "text-brand-700" : "text-emerald-700"}>{c.ultima.deCarol ? "Carol: " : "Contato: "}</b>
      {c.ultima.texto}
    </p>
  );
}

function Indicador({
  rotulo,
  valor,
  dica,
  icone,
  cor,
  destaque,
  carregando,
  i,
}: {
  rotulo: string;
  valor: number;
  dica: ReactNode;
  icone: ReactNode;
  cor: string;
  destaque?: string;
  carregando: boolean;
  i: number;
}) {
  return (
    <Card className={cx("relative overflow-hidden p-4 sm:p-5", destaque)} style={{ "--i": i } as CSSProperties}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted sm:text-sm">{rotulo}</span>
        <span className={cx("grid size-8 place-items-center rounded-lg", cor)}>{icone}</span>
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-strong tabular-nums sm:text-4xl">
        {carregando ? <span className="skeleton inline-block h-9 w-14 rounded" /> : <AnimatedNumber value={valor} />}
      </div>
      <div className="mt-1 text-xs text-muted">{dica}</div>
    </Card>
  );
}

export function PainelView() {
  const chatwoot = useChatwoot();
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [painel, setPainel] = useState<Painel | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const pedido = useRef(0);
  const listaRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async (p: Periodo) => {
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const r = await api<Painel>(`/api/painel?periodo=${p}`);
      if (meu !== pedido.current) return;
      setPainel(r);
      setErro("");
    } catch (e) {
      if (meu === pedido.current) setErro((e as Error).message);
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(periodo), 0);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void carregar(periodo);
    }, 60_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [periodo, carregar]);

  const r = painel?.resumo;
  const contatos = painel?.contatos ?? [];
  const termo = busca.trim().toLowerCase();
  const lista = contatos.filter(
    (c) => (filtro === "todos" || c.situacao === filtro) && (!termo || `${c.nome} ${c.telefone} ${c.cidade}`.toLowerCase().includes(termo)),
  );
  const paraAtender = contatos.filter((c) => c.situacao === "atendente" || c.situacao === "sim" || c.situacao === "conversando").slice(0, 8);
  const semDados = painel !== null && !contatos.length;

  function filtrar(f: Filtro) {
    setFiltro(f);
    requestAnimationFrame(() => listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Desempenho dos disparos</p>
          <h1 className="display mt-3 text-[32px] text-strong sm:text-5xl">
            Do disparo à <span className="texto-marca">conversa.</span>
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">Quem respondeu, quem quer conhecer o Lavacar e quem não tem interesse.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-card p-1" role="radiogroup" aria-label="Período">
            {PERIODOS.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={periodo === p.id}
                onClick={() => setPeriodo(p.id)}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
                  periodo === p.id ? "bg-navy text-white" : "text-muted hover:text-ink",
                )}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => void carregar(periodo)} loading={carregando} icon={<RefreshCw className="size-4" />}>
            Atualizar
          </Button>
        </div>
      </header>

      {erro && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Não foi possível carregar os resultados agora.</b> Tente atualizar em instantes.
          </span>
        </div>
      )}

      {/* Números principais */}
      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          i={0}
          rotulo="Disparadas"
          valor={r?.disparadas ?? 0}
          carregando={!painel}
          icone={<Send className="size-4" />}
          cor="bg-slate-100 text-slate-600"
          dica={r && r.naoRecebeu > 0 ? `${n(r.naoRecebeu)} não ${r.naoRecebeu === 1 ? "recebeu" : "receberam"}` : "mensagens da Carol"}
        />
        <Indicador
          i={1}
          rotulo="Responderam"
          valor={r?.responderam ?? 0}
          carregando={!painel}
          icone={<MessagesSquare className="size-4" />}
          cor="bg-brand-50 text-brand-700"
          dica={r ? `${pct(r.responderam, r.receberam)}% de quem recebeu` : ""}
        />
        <Indicador
          i={2}
          rotulo="Sim, atendo"
          valor={r?.sim ?? 0}
          carregando={!painel}
          icone={<Flame className="size-4" />}
          cor="bg-emerald-50 text-emerald-700"
          destaque={r && r.sim > 0 ? "ring-2 ring-emerald-200" : undefined}
          dica="querem conhecer o Lavacar"
        />
        <Indicador
          i={3}
          rotulo="Sem interesse"
          valor={r?.semInteresse ?? 0}
          carregando={!painel}
          icone={<ThumbsDown className="size-4" />}
          cor="bg-red-50 text-red-700"
          dica="não recebem mais mensagens"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Onde está cada contato */}
        <Card className="p-5 sm:p-6">
          <p className="text-base font-bold text-ink">Onde está cada contato</p>
          <p className="text-xs text-muted sm:text-sm">Toque numa situação para ver quem está nela.</p>

          {!painel ? (
            <div className="skeleton mt-5 h-40 rounded-xl" />
          ) : semDados ? (
            <p className="mt-6 rounded-xl bg-surface px-4 py-8 text-center text-sm text-muted">
              Nenhum disparo neste período. Os resultados aparecem aqui depois do primeiro disparo.
            </p>
          ) : (
            <>
              <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-surface" role="img" aria-label="Distribuição dos contatos por situação">
                {SITUACOES.map((s) => {
                  const v = r?.porSituacao[s.id] ?? 0;
                  if (!v) return null;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => filtrar(s.id)}
                      title={`${s.rotulo}: ${n(v)}`}
                      className="h-full transition-[width,filter] duration-700 ease-out hover:brightness-110"
                      style={{ width: `${pct(v, r?.disparadas ?? 0)}%`, minWidth: 6, background: s.barra }}
                    />
                  );
                })}
              </div>
              <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SITUACOES.map((s) => {
                  const v = r?.porSituacao[s.id] ?? 0;
                  if (!v && (s.id === "cliente" || s.id === "atendente" || s.id === "nao_recebeu")) return null;
                  const Icone = s.icone;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => filtrar(s.id)}
                      className={cx(
                        "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition",
                        filtro === s.id ? "border-brand bg-brand-50" : "border-line bg-card hover:border-brand-200",
                        !v && "opacity-60",
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: s.barra }}>
                        <Icone className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{s.rotulo}</span>
                        <span className="block truncate text-[11px] text-muted">{DICA[s.id]}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-lg font-extrabold text-strong tabular-nums">{n(v)}</span>
                        <span className="block text-[11px] text-muted tabular-nums">{pct(v, r?.disparadas ?? 0)}%</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* Para atender agora */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <Flame className="size-4 text-orange-500" />
            <p className="text-base font-bold text-ink">Para atender agora</p>
            {paraAtender.length > 0 && (
              <span className="ml-auto rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 tabular-nums">{paraAtender.length}</span>
            )}
          </div>
          {!painel ? (
            <div className="space-y-2 p-5">
              <div className="skeleton h-12 rounded-lg" />
              <div className="skeleton h-12 rounded-lg" />
            </div>
          ) : !paraAtender.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted">Ninguém esperando resposta agora.</p>
          ) : (
            <ul className="stagger divide-y divide-line">
              {paraAtender.map((c, i) => (
                <li key={c.key} style={{ "--i": i } as CSSProperties} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{c.nome || "(sem nome)"}</p>
                      <div className="mt-1">
                        <Selo s={c.situacao} />
                      </div>
                    </div>
                    {chatwoot?.url ? (
                      <BotaoAtender telefone={c.telefone} nome={c.nome} className="shrink-0" />
                    ) : (
                      <a
                        href={whatsappLink(c.telefone)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                      >
                        <MessageCircle className="size-3.5" /> Abrir
                      </a>
                    )}
                  </div>
                  {c.ultima && <UltimaMensagem c={c} className="mt-2 rounded-lg bg-surface px-3 py-2" />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Lista */}
      <div ref={listaRef} className="scroll-mt-36 lg:scroll-mt-8">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {(["todos", ...SITUACOES.map((s) => s.id)] as Filtro[]).map((id) => {
                const qtd = id === "todos" ? contatos.length : (r?.porSituacao[id] ?? 0);
                if (id !== "todos" && !qtd && id !== filtro && id !== "sem_interesse") return null;
                return (
                  <button
                    key={id}
                    onClick={() => setFiltro(id)}
                    className={cx(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      filtro === id ? "border-navy bg-navy text-white" : "border-line bg-card text-muted hover:text-ink",
                    )}
                  >
                    {id === "todos" ? "Todos" : INFO[id].rotulo} <span className="tabular-nums opacity-70">{qtd}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar contato…" className={cx(inputClass, "pl-9")} />
            </div>
          </div>
          {!painel ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12 rounded-lg" />
              ))}
            </div>
          ) : !lista.length ? (
            <p className="px-6 py-12 text-center text-sm text-muted">
              {contatos.length ? "Ninguém nesta situação." : "Nenhum disparo neste período. Os resultados aparecem aqui depois do primeiro disparo."}
            </p>
          ) : (
            <>
              {/* Cartões (celular) */}
              <ul className="divide-y divide-line md:hidden">
                {lista.slice(0, 300).map((c) => (
                  <li key={c.key} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{c.nome || "(sem nome)"}</p>
                        <p className="truncate text-xs text-muted">
                          {normalizePhone(c.telefone).display || c.telefone}
                          {c.cidade && ` · ${c.cidade}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <BotaoAtender telefone={c.telefone} nome={c.nome} compacto />
                        <a
                          href={whatsappLink(c.telefone)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded-lg p-2 text-muted transition hover:bg-emerald-50 hover:text-emerald-600"
                          aria-label="Abrir no WhatsApp"
                        >
                          <MessageCircle className="size-4" />
                        </a>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Selo s={c.situacao} />
                      {c.enviadoEm && <span className="text-[11px] text-muted">disparo {quandoCurto(c.enviadoEm)}</span>}
                    </div>
                    {c.ultima && <UltimaMensagem c={c} className="mt-2 rounded-lg bg-surface px-3 py-2" />}
                  </li>
                ))}
              </ul>

              {/* Tabela (computador) */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] font-bold tracking-wider text-muted uppercase">
                    <tr className="border-b border-line">
                      <th className="px-4 py-3">Contato</th>
                      <th className="px-4 py-3">Disparo</th>
                      <th className="px-4 py-3">Situação</th>
                      <th className="px-4 py-3">Última mensagem</th>
                      <th className="px-4 py-3 text-right">Atender</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.slice(0, 300).map((c) => (
                      <tr key={c.key} className="border-b border-line/70 align-top last:border-0 hover:bg-surface/70">
                        <td className="max-w-[260px] px-4 py-3">
                          <p className="truncate font-semibold text-ink">{c.nome || "(sem nome)"}</p>
                          <p className="truncate text-xs text-muted">
                            {normalizePhone(c.telefone).display || c.telefone}
                            {c.cidade && ` · ${c.cidade}`}
                            {c.tipo && ` · ${c.tipo}`}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">{c.enviadoEm ? quandoCurto(c.enviadoEm) : "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Selo s={c.situacao} />
                        </td>
                        <td className="max-w-[340px] px-4 py-3">
                          <UltimaMensagem c={c} />
                          {c.ultima?.quando && <p className="mt-0.5 text-[11px] text-muted">{quandoCurto(c.ultima.quando)}</p>}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <BotaoAtender telefone={c.telefone} nome={c.nome} compacto />
                          <a
                            href={whatsappLink(c.telefone)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-lg p-1.5 text-muted transition hover:bg-emerald-50 hover:text-emerald-600"
                            title="Abrir no WhatsApp"
                          >
                            <MessageCircle className="size-4" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
