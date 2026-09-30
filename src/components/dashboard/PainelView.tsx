"use client";

import {
  AlertTriangle,
  CheckCheck,
  Eye,
  Flame,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Search,
  Send,
  ThumbsDown,
  Trophy,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BotaoAtender, useChatwoot } from "@/components/chatwoot";
import { AnimatedNumber } from "@/components/motion";
import { Badge, Button, Card, cx, inputClass } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { ContatoPainel, Painel, Periodo } from "@/lib/painel-regras";
import { quandoCurto } from "@/lib/periodo";
import { normalizePhone, whatsappLink } from "@/lib/phone";

const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7d", rotulo: "7 dias" },
  { id: "30d", rotulo: "30 dias" },
  { id: "tudo", rotulo: "Tudo" },
];

type Filtro = "todos" | "sim" | "respondeu" | "sem_resposta" | "nao" | "sem_whatsapp";
const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "sim", rotulo: "Sim, atendo" },
  { id: "respondeu", rotulo: "Responderam" },
  { id: "sem_resposta", rotulo: "Sem resposta" },
  { id: "nao", rotulo: "Sem interesse" },
  { id: "sem_whatsapp", rotulo: "Sem WhatsApp" },
];

const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (parte: number | null, total: number) => (parte === null || !total ? null : Math.round((parte / total) * 100));

function passaNoFiltro(c: ContatoPainel, f: Filtro): boolean {
  switch (f) {
    case "sim":
      return c.resposta === "sim";
    case "respondeu":
      return c.mensagensDoContato > 0;
    case "sem_resposta":
      return c.mensagensDoContato === 0 && !c.semWhatsapp;
    case "nao":
      return c.resposta === "nao" || c.resposta === "optout";
    case "sem_whatsapp":
      return c.semWhatsapp;
    default:
      return true;
  }
}

function ChipResposta({ c }: { c: ContatoPainel }) {
  if (c.resposta === "sim")
    return (
      <Badge tone="green">
        <Flame className="size-3" /> Sim, atendo
      </Badge>
    );
  if (c.resposta === "respondeu")
    return (
      <Badge tone="brand">
        <MessageCircle className="size-3" /> Respondeu
      </Badge>
    );
  if (c.resposta === "nao")
    return (
      <Badge tone="gray">
        <ThumbsDown className="size-3" /> Sem interesse
      </Badge>
    );
  if (c.resposta === "optout") return <Badge tone="red">Pediu para sair</Badge>;
  if (c.semWhatsapp)
    return (
      <Badge tone="amber">
        <XCircle className="size-3" /> Sem WhatsApp
      </Badge>
    );
  return <Badge tone="gray">Sem resposta</Badge>;
}

function ChipEntrega({ c }: { c: ContatoPainel }) {
  switch (c.entrega) {
    case "lida":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600" title="O contato abriu a mensagem">
          <CheckCheck className="size-3.5" /> Lida
        </span>
      );
    case "entregue":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted" title="Chegou no celular do contato">
          <CheckCheck className="size-3.5" /> Entregue
        </span>
      );
    case "enviada":
      return <span className="text-xs text-muted">Enviada</span>;
    case "falhou":
      return <span className="text-xs font-semibold text-amber-600">Não entregue</span>;
    default:
      return <span className="text-xs text-muted">—</span>;
  }
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

  const f = painel?.funil;
  const contatos = painel?.contatos ?? [];
  const termo = busca.trim().toLowerCase();
  const lista = contatos.filter(
    (c) => passaNoFiltro(c, filtro) && (!termo || `${c.nome} ${c.telefone} ${c.cidade}`.toLowerCase().includes(termo)),
  );
  const quentes = contatos.filter((c) => c.resposta === "sim" || c.resposta === "respondeu").slice(0, 6);

  const etapas: { rotulo: string; valor: number | null; icone: typeof Send; cor: string }[] = f
    ? [
        { rotulo: "Disparadas", valor: f.disparadas, icone: Send, cor: "bg-bar" },
        { rotulo: "Entregues", valor: f.entregues, icone: CheckCheck, cor: "bg-bar-2" },
        { rotulo: "Lidas", valor: f.lidas, icone: Eye, cor: "bg-brand-700" },
        { rotulo: "Responderam", valor: f.responderam, icone: MessagesSquare, cor: "bg-brand" },
        { rotulo: "Sim, atendo", valor: f.sim, icone: Flame, cor: "bg-emerald-500" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Desempenho dos disparos</p>
          <h1 className="display mt-3 text-[32px] text-strong sm:text-5xl">
            Do disparo à <span className="texto-marca">conversa.</span>
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">Quem recebeu, leu, respondeu e quer atender. Quem respondeu aparece primeiro.</p>
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
        {[
          { rotulo: "Disparadas", valor: f?.disparadas, extra: f ? `${n(f.semWhatsapp)} sem WhatsApp` : "", cor: "text-strong", i: Send },
          {
            rotulo: "Leram",
            valor: f?.lidas ?? null,
            extra: f && f.lidas !== null ? `${pct(f.lidas, f.disparadas)}% das disparadas` : "sem dados do Meta",
            cor: "text-brand-700",
            i: Eye,
          },
          {
            rotulo: "Responderam",
            valor: f?.responderam,
            extra: f ? `${pct(f.responderam, f.disparadas) ?? 0}% de resposta` : "",
            cor: "text-brand",
            i: MessagesSquare,
          },
          { rotulo: "Sim, atendo", valor: f?.sim, extra: f ? `${n(f.nao)} sem interesse` : "", cor: "text-emerald-600", i: Trophy },
        ].map((c, idx) => (
          <Card key={c.rotulo} className={cx("relative overflow-hidden p-4 sm:p-5", idx === 3 && f && f.sim > 0 && "ring-2 ring-emerald-200")} >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted">{c.rotulo}</span>
              <c.i className={cx("size-4", idx === 3 && f && f.sim > 0 ? "text-emerald-500 animate-float" : "text-muted/60")} />
            </div>
            <div className={cx("mt-1.5 text-3xl font-extrabold tracking-tight", c.cor)}>
              {painel === null ? (
                <span className="skeleton inline-block h-8 w-14 rounded" />
              ) : c.valor === null || c.valor === undefined ? (
                "—"
              ) : (
                <AnimatedNumber value={c.valor} />
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted">{c.extra}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Funil */}
        <Card className="p-5 sm:p-6">
          <p className="text-sm font-bold text-ink">Do disparo ao “Sim, atendo”</p>
          <p className="text-xs text-muted">Quanto sobra em cada etapa, sobre o total disparado no período.</p>
          <div className="mt-5 space-y-3">
            {etapas.map((e) => {
              const largura = f && f.disparadas ? Math.max(e.valor ? 4 : 0, ((e.valor ?? 0) / f.disparadas) * 100) : 0;
              return (
                <div key={e.rotulo} className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-3 text-sm">
                  <span className="flex items-center gap-1.5 font-semibold text-ink">
                    <e.icone className="size-3.5 text-muted" /> {e.rotulo}
                  </span>
                  <div className="h-7 overflow-hidden rounded-lg bg-surface">
                    <div className={cx("h-full rounded-lg transition-[width] duration-700 ease-out", e.cor)} style={{ width: `${largura}%` }} />
                  </div>
                  <span className="text-right font-bold text-ink tabular-nums">
                    {e.valor === null ? "—" : <AnimatedNumber value={e.valor} />}
                    {e.valor !== null && f && f.disparadas > 0 && e.rotulo !== "Disparadas" && (
                      <span className="block text-[11px] font-medium text-muted">{pct(e.valor, f.disparadas)}%</span>
                    )}
                  </span>
                </div>
              );
            })}
            {!etapas.length && <div className="skeleton h-40 rounded-xl" />}
          </div>
          {f && f.entregues === null && (
            <p className="mt-4 text-xs text-muted">
              Entregues e lidas aparecem assim que o WhatsApp confirmar a entrega e a leitura.
            </p>
          )}
        </Card>

        {/* Quentes */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-5 py-4">
            <Flame className="size-4 text-orange-500" />
            <p className="text-sm font-bold text-ink">Para atender agora</p>
          </div>
          {!painel ? (
            <div className="space-y-2 p-5">
              <div className="skeleton h-10 rounded-lg" />
              <div className="skeleton h-10 rounded-lg" />
            </div>
          ) : !quentes.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted">Nenhuma resposta neste período ainda.</p>
          ) : (
            <ul className="stagger divide-y divide-line">
              {quentes.map((c, i) => (
                <li key={c.key} style={{ ["--i" as string]: i }} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{c.nome || "(sem nome)"}</p>
                    <p className="truncate text-xs text-muted">{c.ultima?.texto ?? ""}</p>
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
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Lista */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((x) => {
              const qtd = contatos.filter((c) => passaNoFiltro(c, x.id)).length;
              return (
                <button
                  key={x.id}
                  onClick={() => setFiltro(x.id)}
                  className={cx(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    filtro === x.id ? "border-navy bg-navy text-white" : "border-line bg-card text-muted hover:text-ink",
                  )}
                >
                  {x.rotulo} <span className="tabular-nums opacity-70">{qtd}</span>
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
            {contatos.length ? "Ninguém com esse filtro." : "Nenhum disparo neste período. Os resultados aparecem aqui depois do primeiro disparo."}
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
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <ChipEntrega c={c} />
                  <ChipResposta c={c} />
                  {c.enviadoEm && <span className="text-[11px] text-muted">{quandoCurto(c.enviadoEm)}</span>}
                </div>
                {c.ultima && (
                  <p className="mt-2 line-clamp-2 rounded-lg bg-surface px-3 py-2 text-xs text-ink">
                    <b className={c.ultima.deCarol ? "text-brand-700" : "text-emerald-700"}>{c.ultima.deCarol ? "Carol: " : "Contato: "}</b>
                    {c.ultima.texto}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="text-[11px] font-bold tracking-wider text-muted uppercase">
                <tr className="border-b border-line">
                  <th className="px-4 py-3">Contato</th>
                  <th className="px-4 py-3">Disparo</th>
                  <th className="px-4 py-3">Entrega</th>
                  <th className="px-4 py-3">Resposta</th>
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
                      <ChipEntrega c={c} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ChipResposta c={c} />
                      {c.etapa && <p className="mt-1 text-[11px] text-muted">{c.etapa.replace(/_/g, " ").toLowerCase()}</p>}
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      {c.ultima ? (
                        <>
                          <p className="line-clamp-2 text-xs text-ink">
                            <b className={c.ultima.deCarol ? "text-brand-700" : "text-emerald-700"}>{c.ultima.deCarol ? "Carol: " : "Contato: "}</b>
                            {c.ultima.texto}
                          </p>
                          {c.ultima.quando && <p className="mt-0.5 text-[11px] text-muted">{quandoCurto(c.ultima.quando)}</p>}
                        </>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
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
  );
}
