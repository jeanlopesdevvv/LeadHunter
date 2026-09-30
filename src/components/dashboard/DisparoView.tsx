"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Loader2,
  MessageCircle,
  PartyPopper,
  PauseCircle,
  Play,
  RefreshCw,
  Send,
  ShieldCheck,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { AnimatedNumber, confete } from "@/components/motion";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Modal, cx, inputClass } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";
import { disparoLembrado, esquecerDisparo, lembrarDisparo } from "@/lib/client/sessao-salva";
import type { ItemDisparo, ProgressoDisparo, StatusDisparo } from "@/lib/disparo-regras";
import { SEGUNDOS_POR_LEAD } from "@/lib/disparo-regras";
import { horaBrasilia, quandoCurto } from "@/lib/periodo";
import { normalizePhone } from "@/lib/phone";

import { InstalarTrava } from "./TravaN8n";

const n = (v: number) => v.toLocaleString("pt-BR");

function minutos(segundos: number): string {
  const m = Math.max(1, Math.round(segundos / 60));
  return m === 1 ? "1 minuto" : `${m} minutos`;
}

function telefone(t: string): string {
  return normalizePhone(t).display || t;
}

function ehFixo(t: string): boolean {
  return normalizePhone(t).kind === "fixo";
}

/** Disparo que ainda ocupa a Carol (não dá para começar outro por cima). */
function ativo(a: ProgressoDisparo | null): boolean {
  return Boolean(a && (a.estado === "enviando" || a.estado === "pausado" || a.estado === "parado"));
}

/**
 * Nó Webhook para colar no Fluxo 1 do n8n. O caminho leva um código aleatório:
 * só quem tem o endereço (o Radar) consegue começar o disparo.
 */
function noParaN8n(): string {
  const cod = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  return JSON.stringify(
    {
      nodes: [
        {
          parameters: { httpMethod: "POST", path: `radar-disparo-${cod}`, options: {} },
          type: "n8n-nodes-base.webhook",
          typeVersion: 2,
          position: [0, 220],
          id: crypto.randomUUID(),
          name: "Disparo pelo Radar",
          webhookId: crypto.randomUUID(),
        },
      ],
      connections: { "Disparo pelo Radar": { main: [[{ node: "Inicializar Limite Diário", type: "main", index: 0 }]] } },
    },
    null,
    2,
  );
}

function ComoLigar() {
  const toast = useToast();
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          O botão ainda não está ligado ao n8n: falta <b>N8N_DISPARO_URL</b> no EasyPanel (serviço radar → Ambiente) e clicar em{" "}
          <b>Implantar</b>.
        </span>
      </p>
      <details className="mt-2 pl-6.5">
        <summary className="cursor-pointer text-xs font-semibold text-amber-800">Ver o passo a passo</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed">
          <li>Clique em Copiar o nó (abaixo).</li>
          <li>No n8n, abra o Fluxo 1, clique num espaço vazio do quadro e aperte Ctrl+V. Ligue o nó ao Inicializar Limite Diário.</li>
          <li>Clique em Publish.</li>
          <li>Abra o nó, escolha Production URL e copie o endereço.</li>
          <li>No EasyPanel → radar → Ambiente, acrescente N8N_DISPARO_URL= e o endereço. Salve e Implante.</li>
        </ol>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          icon={<Copy className="size-3.5" />}
          onClick={() =>
            navigator.clipboard
              .writeText(noParaN8n())
              .then(() => toast("Nó copiado. Cole no Fluxo 1 do n8n com Ctrl+V.", "success"))
              .catch(() => toast("Não deu para copiar. Tente de novo.", "error"))
          }
        >
          Copiar o nó
        </Button>
      </details>
    </div>
  );
}

function ChipSituacao({ item, atual }: { item: ItemDisparo; atual: ProgressoDisparo }) {
  if (item.key === atual.enviandoAgora) {
    return (
      <Badge tone="brand">
        <Loader2 className="size-3 animate-spin" /> Enviando agora
      </Badge>
    );
  }
  switch (item.situacao) {
    case "enviado":
      return (
        <Badge tone="green">
          <CheckCircle2 className="size-3" /> Mensagem enviada
        </Badge>
      );
    case "sem_whatsapp":
      return (
        <Badge tone="amber" title={item.detalhe}>
          <XCircle className="size-3" /> Sem WhatsApp
        </Badge>
      );
    case "pendente":
    case "aguardando":
      if (atual.estado === "cancelado") return <Badge tone="gray">Voltou para a fila</Badge>;
      if (atual.estado === "pausado") {
        return (
          <Badge tone="gray">
            <PauseCircle className="size-3" /> Pausado
          </Badge>
        );
      }
      return (
        <Badge tone="gray">
          <Clock className="size-3" /> Na vez
        </Badge>
      );
    case "sumiu":
      return <Badge tone="red">Saiu da planilha</Badge>;
    default:
      return <Badge tone="gray">Outro status</Badge>;
  }
}

type Acao = "pausar" | "cancelar" | "continuar" | "encerrar";

export function DisparoView({
  preSelecao,
  onPreSelecaoVista,
}: {
  /** Veio do "Ir para o Disparo" do envio: marca esses telefones (sem disparar). */
  preSelecao: string[] | null;
  onPreSelecaoVista: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<StatusDisparo | null>(null);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState("");
  const [aba, setAba] = useState<"todos" | "marcados">("todos");
  const [recemChegados, setRecemChegados] = useState(0);
  const [pedirConfirmacao, setPedirConfirmacao] = useState<Acao | null>(null);
  const [agindo, setAgindo] = useState<Acao | null>(null);
  const [agora, setAgora] = useState(() => Date.now());
  const pedido = useRef(0);
  const preSelecaoRef = useRef(preSelecao);

  /** Aplica uma leitura nova: tira da seleção quem saiu da fila, lembra o disparo e comemora quando termina. */
  const aplicar = useCallback(
    (s: StatusDisparo) => {
      setStatus(s);
      setErro("");
      setAgora(Date.now());
      const a = s.atual;
      if (a) {
        const lem = disparoLembrado();
        const interrompido = a.estado === "pausado" || a.estado === "cancelado" ? { como: a.estado, em: a.interrompidoEm ?? Date.now() } : null;
        const base = { iniciadoEm: a.iniciadoEm, chaves: a.itens.map((i) => i.key), interrompido, retomadoEm: a.retomadoEm };
        if (!lem || lem.iniciadoEm !== a.iniciadoEm) {
          // Disparo que este navegador ainda não conhecia: só comemora se vir ele terminar.
          lembrarDisparo({ ...base, comemorado: a.estado !== "enviando" });
        } else if (a.estado === "concluido" && !lem.comemorado) {
          lembrarDisparo({ ...base, comemorado: true });
          void confete("forte");
          toast(
            a.enviados > 0
              ? `Disparo concluído: ${a.enviados === 1 ? "1 mensagem enviada" : `${n(a.enviados)} mensagens enviadas`}.`
              : "Disparo concluído. Confira abaixo como ficou cada contato.",
            "success",
          );
        } else {
          lembrarDisparo({ ...lem, ...base });
        }
      }
      const naFila = new Set(s.itensFila.map((i) => i.key));
      setMarcados((m) => {
        const novo = new Set([...m].filter((k) => naFila.has(k)));
        return novo.size === m.size ? m : novo;
      });
    },
    [toast],
  );

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    try {
      const s = await api<StatusDisparo>("/api/disparo");
      if (meu !== pedido.current) return null;
      aplicar(s);
      return s;
    } catch (e) {
      if (meu === pedido.current) setErro((e as Error).message);
      return null;
    }
  }, [aplicar]);

  // Primeira leitura; se veio do envio, já marca quem acabou de entrar (sem abrir nada).
  useEffect(() => {
    let vivo = true;
    const meu = ++pedido.current;
    api<StatusDisparo>("/api/disparo")
      .then(async (s) => {
        // O servidor reiniciou (ex.: atualização) no meio de um disparo: volta a acompanhar pelo que o navegador lembra.
        const lem = !s.atual ? disparoLembrado() : null;
        if (lem) {
          s = await api<StatusDisparo>(
            "/api/disparo/acompanhar",
            { iniciadoEm: lem.iniciadoEm, chaves: lem.chaves, interrompido: lem.interrompido ?? null, retomadoEm: lem.retomadoEm ?? null },
            { tentativas: 2 },
          ).catch(() => s);
        }
        return s;
      })
      .then((s) => {
        if (!vivo || meu !== pedido.current) return;
        aplicar(s);
        const pre = preSelecaoRef.current;
        if (pre?.length) {
          preSelecaoRef.current = null;
          onPreSelecaoVista();
          const naFila = new Set(s.itensFila.map((i) => i.key));
          const escolhidos = pre.filter((k) => naFila.has(k));
          if (escolhidos.length) {
            setMarcados(new Set(escolhidos));
            setRecemChegados(escolhidos.length);
            setAba("marcados");
          }
        }
      })
      .catch((e: Error) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [aplicar, onPreSelecaoVista]);

  // Atualiza sozinho: rápido enquanto há disparo em andamento ou pausado, devagar no resto do tempo.
  const atual = status?.atual ?? null;
  const rapido = ativo(atual);
  useEffect(() => {
    const id = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void carregar();
      },
      rapido ? 5_000 : 30_000,
    );
    return () => window.clearInterval(id);
  }, [rapido, carregar]);

  // Relógio para a contagem regressiva do "Continuar".
  const esperandoContinuar = Boolean(atual && atual.podeContinuarEm > agora);
  useEffect(() => {
    if (!esperandoContinuar) return;
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [esperandoContinuar]);

  async function atualizar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  async function disparar() {
    setDisparando(true);
    const inicio = Date.now();
    const escolhidos = [...marcados];
    try {
      const s = await api<StatusDisparo>("/api/disparo", { telefones: escolhidos });
      if (s.atual) lembrarDisparo({ iniciadoEm: s.atual.iniciadoEm, chaves: s.atual.itens.map((i) => i.key), comemorado: false });
      aplicar(s);
      setMarcados(new Set());
      setRecemChegados(0);
      setAba("todos");
      setConfirmar(false);
      const total = s.atual?.total ?? escolhidos.length;
      toast(`Disparo iniciado: ${total === 1 ? "1 contato" : `${n(total)} contatos`} na vez da Carol.`, "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setConfirmar(false);
      if (e instanceof ApiError && e.dados.incerto) {
        // O n8n demorou a responder e pode ter começado: acompanha pela planilha em vez de arriscar disparar de novo.
        lembrarDisparo({ iniciadoEm: inicio - 5_000, chaves: escolhidos, comemorado: false });
        setMarcados(new Set());
        toast("O n8n demorou a responder, mas pode ter começado. O Radar está acompanhando pela planilha: não dispare de novo.", "info");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        toast((e as Error).message, "error");
      }
      void carregar();
    } finally {
      setDisparando(false);
    }
  }

  async function executar(acao: Acao) {
    setPedirConfirmacao(null);
    setAgindo(acao);
    try {
      const rota =
        acao === "continuar" ? "/api/disparo/continuar" : acao === "encerrar" ? "/api/disparo/encerrar" : "/api/disparo/pausar";
      const corpo = acao === "cancelar" ? { como: "cancelado" } : acao === "pausar" ? { como: "pausado" } : {};
      const s = await api<StatusDisparo>(rota, corpo);
      if (acao === "encerrar") esquecerDisparo();
      aplicar(s);
      toast(
        acao === "pausar"
          ? "Disparo pausado. A mensagem que já estava saindo termina de ir; as outras esperam você continuar."
          : acao === "cancelar"
            ? "Disparo cancelado. Quem não recebeu voltou para a fila."
            : acao === "continuar"
              ? "Disparo retomado de onde parou."
              : "Pronto. A fila está livre para um novo disparo.",
        acao === "cancelar" || acao === "encerrar" ? "info" : "success",
      );
    } catch (e) {
      toast((e as Error).message, "error");
      void carregar();
    } finally {
      setAgindo(null);
    }
  }

  function pedir(acao: Acao) {
    // Pausar é imediato quando a trava está ativa; sem trava (ou para cancelar) mostra o aviso antes.
    const travaConhecida = Boolean(atual?.travaConfirmada || status?.trava.ultimaEm);
    if (acao === "pausar" && travaConhecida) return void executar("pausar");
    if (acao === "cancelar" || acao === "pausar") return setPedirConfirmacao(acao);
    void executar(acao);
  }

  const s = status;
  const itens = useMemo(() => s?.itensFila ?? [], [s]);
  const termo = filtro.trim().toLowerCase();
  const visiveis = itens.filter((i) => {
    if (aba === "marcados" && !marcados.has(i.key)) return false;
    return !termo || `${i.nome} ${i.telefone} ${i.cidade}`.toLowerCase().includes(termo);
  });
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((i) => marcados.has(i.key));
  const algunsVisiveisMarcados = visiveis.some((i) => marcados.has(i.key));
  const qtd = marcados.size;
  const restamHoje = s && s.limiteDiario > 0 ? Math.max(0, s.limiteDiario - s.hoje.enviadosHoje) : null;
  const ocupado = ativo(atual);
  const travado = !s || !s.configurado || ocupado || s.movimentoRecente;
  const nomesMarcados = itens.filter((i) => marcados.has(i.key));
  const fixosMarcados = nomesMarcados.filter((i) => ehFixo(i.telefone)).length;
  const travaErrada = Boolean(s?.trava.chaveErradaEm && (!s.trava.ultimaEm || s.trava.chaveErradaEm > s.trava.ultimaEm));

  function alternar(key: string) {
    setMarcados((m) => {
      const novo = new Set(m);
      if (novo.has(key)) novo.delete(key);
      else novo.add(key);
      return novo;
    });
  }

  function marcarTodos() {
    setMarcados((m) => {
      const novo = new Set(m);
      if (todosVisiveisMarcados) visiveis.forEach((i) => novo.delete(i.key));
      else visiveis.forEach((i) => novo.add(i.key));
      return novo;
    });
  }

  /** Deixa marcados só os que cabem no limite de hoje, celulares primeiro (na ordem da fila). */
  function soOsDeHoje() {
    if (restamHoje === null) return;
    const ordem = nomesMarcados.map((i, idx) => ({ i, idx, fixo: ehFixo(i.telefone) }));
    ordem.sort((a, b) => Number(a.fixo) - Number(b.fixo) || a.idx - b.idx);
    setMarcados(new Set(ordem.slice(0, restamHoje).map((x) => x.i.key)));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Hora do disparo</p>
          <h1 className="display mt-3 text-4xl text-navy sm:text-5xl">
            Marcou, disparou: <span className="text-brand">a Carol chama no WhatsApp.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Revise a fila, marque quem recebe e confirme. A Carol manda uma mensagem por vez, a cada 10 a 15 segundos, e você acompanha,
            pausa ou cancela aqui.
          </p>
        </div>
        <Button variant="outline" onClick={atualizar} loading={atualizando} icon={<RefreshCw className="size-4" />}>
          Atualizar
        </Button>
      </header>

      {erro && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>A planilha não respondeu agora.</b> {erro} O Radar tenta de novo sozinho em instantes.
          </span>
        </div>
      )}

      {s && !s.configurado && <ComoLigar />}

      {travaErrada && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>O n8n chamou a trava com uma chave antiga</b> (a senha ou o AUTH_SECRET do Radar mudou). O disparo para por segurança. Copie
              os nós da trava de novo e troque no Fluxo 1.
            </span>
          </p>
          <InstalarTrava className="mt-3" />
        </div>
      )}

      {s?.movimentoRecente && !ocupado && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
          <span>
            A Carol mandou mensagem há pouco: parece que o fluxo está rodando direto no n8n. Espere ele terminar antes de disparar, para
            ninguém receber duas vezes.
          </span>
        </div>
      )}

      {s && s.bloqueadosNaFila.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-sm text-muted">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <span>
            {s.bloqueadosNaFila.map((b) => (
              <span key={b.linha} className="block">
                <b className="text-ink">{b.nome || telefone(b.telefone)}</b> (linha {b.linha} da planilha) é um número bloqueado e nunca recebe
                disparo. Para tirar de vez, escreva sim na coluna optout.
              </span>
            ))}
          </span>
        </div>
      )}

      {atual && s && (
        <CartaoDisparo
          atual={atual}
          s={s}
          agora={agora}
          agindo={agindo}
          onAcao={pedir}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Resumo e botão */}
        <Card className="h-fit p-5 sm:p-6 lg:sticky lg:top-6">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Users className="size-4 text-brand" /> Na fila da Carol
          </p>
          {!s ? (
            <div className="skeleton mt-4 h-10 w-24 rounded" />
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <AnimatedNumber value={s.fila} className="text-5xl font-extrabold tracking-tight text-navy" />
                <span className="text-sm text-muted">{s.fila === 1 ? "contato esperando" : "contatos esperando"}</span>
              </div>
              <div className="mt-4 space-y-1 rounded-xl bg-surface px-3.5 py-3 text-sm">
                <p>
                  Hoje: <AnimatedNumber value={s.hoje.enviadosHoje} className="font-bold" />{" "}
                  {s.hoje.enviadosHoje === 1 ? "mensagem enviada" : "mensagens enviadas"}
                  {s.limiteDiario > 0 && <span className="text-muted"> de {n(s.limiteDiario)} por dia</span>}
                </p>
                {s.hoje.semWhatsappHoje > 0 && (
                  <p className="text-muted">
                    <b className="text-ink tabular-nums">{n(s.hoje.semWhatsappHoje)}</b> sem WhatsApp
                  </p>
                )}
                {s.hoje.ultimoMovimento && <p className="text-xs text-muted">Última mensagem {quandoCurto(s.hoje.ultimoMovimento)}.</p>}
              </div>
              <p className="mt-4 text-sm text-ink">
                <AnimatedNumber value={qtd} className="font-bold" /> {qtd === 1 ? "marcado" : "marcados"}
                {qtd > 0 && <span className="text-muted"> · cerca de {minutos(qtd * SEGUNDOS_POR_LEAD)}</span>}
              </p>
              {fixosMarcados > 0 && (
                <p className="mt-1 text-xs text-muted">
                  {n(fixosMarcados)} {fixosMarcados === 1 ? "é telefone fixo" : "são telefones fixos"} (menos chance de ter WhatsApp).
                </p>
              )}
              {restamHoje !== null && qtd > restamHoje && (
                <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  {restamHoje === 0
                    ? `O limite de ${n(s.limiteDiario)} por dia já foi atingido hoje: o disparo para no primeiro contato.`
                    : `Hoje só cabem mais ${n(restamHoje)} (limite de ${n(s.limiteDiario)} por dia). O resto ficaria parado na vez.`}
                  {restamHoje > 0 && (
                    <button type="button" onClick={soOsDeHoje} className="mt-1 block font-semibold text-amber-900 underline underline-offset-2">
                      Deixar marcados só {n(restamHoje)} (celulares primeiro)
                    </button>
                  )}
                </div>
              )}
              <Button
                size="lg"
                className={cx("mt-4 w-full", !travado && qtd > 0 && "animate-glow")}
                disabled={travado || qtd === 0}
                onClick={() => setConfirmar(true)}
                icon={<Zap className="size-4" />}
              >
                {ocupado ? "Termine o disparo atual" : qtd > 0 ? `Disparar para ${n(qtd)}` : "Marque quem vai receber"}
              </Button>
              {s.configurado && (
                <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
                  n8n: {s.destino}
                  {s.trava.ultimaEm && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-700">
                      · <ShieldCheck className="size-3" /> trava ativa
                    </span>
                  )}
                </p>
              )}
            </>
          )}
        </Card>

        {/* Fila com seleção */}
        <Card className="overflow-hidden">
          {recemChegados > 0 && (
            <div className="flex items-start justify-between gap-3 border-b border-brand-100 bg-brand-50/70 px-5 py-3 text-sm text-brand-800 sm:px-6">
              <p>
                <b>
                  {n(recemChegados)} {recemChegados === 1 ? "contato novo já está marcado" : "contatos novos já estão marcados"}.
                </b>{" "}
                Revise, desmarque quem não deve receber agora e clique em Disparar quando estiver pronto.
              </p>
              <button type="button" onClick={() => setRecemChegados(0)} className="rounded p-0.5 text-brand-700 hover:bg-brand-100" aria-label="Fechar aviso">
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-xl bg-surface p-1 text-sm font-semibold">
                {(
                  [
                    ["todos", `Fila (${n(itens.length)})`],
                    ["marcados", `Marcados (${n(qtd)})`],
                  ] as const
                ).map(([id, rotulo]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAba(id)}
                    className={cx("rounded-lg px-3 py-1.5 transition", aba === id ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink")}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
              <input
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Procurar por nome, telefone ou cidade…"
                className={cx(inputClass, "sm:w-72")}
              />
            </div>
            <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="check"
                checked={todosVisiveisMarcados}
                ref={(el) => {
                  if (el) el.indeterminate = !todosVisiveisMarcados && algunsVisiveisMarcados;
                }}
                onChange={marcarTodos}
                disabled={!visiveis.length || ocupado}
              />
              {todosVisiveisMarcados ? "Desmarcar" : "Marcar"} todos ({n(visiveis.length)}){termo && " do filtro"}
            </label>
          </div>
          {!s ? (
            <div className="space-y-3 p-6">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-10 rounded-xl" />
              ))}
            </div>
          ) : !itens.length ? (
            <div className="p-10 text-center text-sm text-muted">
              <p className="font-semibold text-ink">{ocupado ? "Todo mundo da fila está no disparo atual." : "Fila vazia."}</p>
              <p className="mt-1">Mande contatos para a planilha na tela Oportunidades e eles aparecem aqui.</p>
            </div>
          ) : (
            <ul className="stagger max-h-[560px] divide-y divide-line overflow-y-auto">
              {visiveis.map((p, i) => {
                const marcado = marcados.has(p.key);
                const fixo = ehFixo(p.telefone);
                return (
                  <li key={`${p.key}-${p.linha}`} style={{ "--i": i } as CSSProperties}>
                    <label
                      className={cx(
                        "flex items-center gap-3 px-5 py-3 sm:px-6",
                        ocupado ? "cursor-default opacity-70" : "cursor-pointer",
                        marcado ? "bg-brand-50/50" : "hover:bg-surface/70",
                      )}
                    >
                      <input type="checkbox" className="check" checked={marcado} onChange={() => alternar(p.key)} disabled={ocupado} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{p.nome || "(sem nome)"}</p>
                        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                          <span className={cx("font-semibold", fixo ? "text-amber-600" : "text-emerald-600")}>{fixo ? "fixo" : "celular"}</span>
                          {telefone(p.telefone)}
                          {p.cidade && ` · ${p.cidade}`}
                        </p>
                      </div>
                      <Badge tone="gray" title={p.situacao === "aguardando" ? "Ficou de fora de um disparo anterior" : "Status pendente na planilha"}>
                        {p.situacao === "aguardando" ? "Aguardando" : "Pendente"}
                      </Badge>
                    </label>
                  </li>
                );
              })}
              {!visiveis.length && (
                <li className="px-6 py-8 text-center text-sm text-muted">{aba === "marcados" ? "Nenhum contato marcado." : "Ninguém com esse filtro."}</li>
              )}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={confirmar} onClose={() => !disparando && setConfirmar(false)} title="Confirmar disparo">
        {s && (
          <div className="space-y-4 text-sm">
            <p>
              A Carol vai mandar a primeira mensagem no WhatsApp para <b>{n(qtd)}</b> {qtd === 1 ? "contato" : "contatos"}, um de cada vez
              (cerca de {minutos(qtd * SEGUNDOS_POR_LEAD)}).
            </p>
            {nomesMarcados.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-surface px-3.5 py-2.5">
                {nomesMarcados.map((i) => (
                  <li key={i.key} className="flex justify-between gap-3">
                    <span className="truncate font-semibold text-ink">{i.nome || "(sem nome)"}</span>
                    <span className="shrink-0 text-muted tabular-nums">{telefone(i.telefone)}</span>
                  </li>
                ))}
              </ul>
            )}
            {s.fila > qtd && (
              <p className="text-muted">
                Os outros {n(s.fila - qtd)} da fila não recebem agora: ficam como <b>aguardando</b> para o próximo disparo.
              </p>
            )}
            {restamHoje !== null && qtd > restamHoje && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                Limite da Carol: {n(s.limiteDiario)} por dia (hoje já foram {n(s.hoje.enviadosHoje)}). Só {n(restamHoje)} saem hoje; o disparo
                para no limite e você pode continuar depois.
              </p>
            )}
            <p className="flex items-start gap-2 text-muted">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              {s.trava.ultimaEm
                ? "Dá para pausar ou cancelar a qualquer momento na tela do disparo."
                : "Dá para pausar ou cancelar na tela do disparo (para parar no meio do envio, a trava precisa estar instalada no n8n)."}
            </p>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setConfirmar(false)} disabled={disparando}>
                Voltar
              </Button>
              <Button onClick={disparar} loading={disparando} disabled={qtd === 0} icon={<Send className="size-4" />}>
                {disparando ? "Chamando o n8n…" : `Disparar para ${n(qtd)}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={pedirConfirmacao !== null}
        onClose={() => setPedirConfirmacao(null)}
        title={pedirConfirmacao === "cancelar" ? "Cancelar o disparo?" : "Pausar o disparo?"}
      >
        {atual && (
          <div className="space-y-4 text-sm">
            {pedirConfirmacao === "cancelar" ? (
              <p>
                Os <b>{n(atual.aguardando)}</b> {atual.aguardando === 1 ? "contato que ainda não recebeu volta" : "contatos que ainda não receberam voltam"}{" "}
                para a fila, sem mensagem. Quem já recebeu continua marcado como enviado. Nada é apagado.
              </p>
            ) : (
              <p>
                Ninguém mais recebe até você clicar em <b>Continuar</b>. Os {n(atual.aguardando)} que faltam ficam guardados neste disparo.
              </p>
            )}
            <p className="text-muted">A mensagem que já estiver saindo neste instante termina de ir.</p>
            {!atual.travaConfirmada && !s?.trava.ultimaEm && atual.estado === "enviando" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
                <p className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    A trava do n8n ainda não respondeu neste disparo. Sem ela, o n8n continua com a lista que já leu: depois de confirmar,
                    pare também a execução no n8n (<b>Executions</b> → execução em andamento → <b>Stop</b>).
                  </span>
                </p>
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setPedirConfirmacao(null)}>
                Voltar
              </Button>
              <Button
                variant={pedirConfirmacao === "cancelar" ? "danger" : "primary"}
                onClick={() => pedirConfirmacao && void executar(pedirConfirmacao)}
                icon={pedirConfirmacao === "cancelar" ? <XCircle className="size-4" /> : <PauseCircle className="size-4" />}
              >
                {pedirConfirmacao === "cancelar" ? "Cancelar o disparo" : "Pausar agora"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CartaoDisparo({
  atual,
  s,
  agora,
  agindo,
  onAcao,
}: {
  atual: ProgressoDisparo;
  s: StatusDisparo;
  agora: number;
  agindo: Acao | null;
  onAcao: (a: Acao) => void;
}) {
  const feitos = atual.total - atual.aguardando;
  const esperar = atual.podeContinuarEm > agora ? Math.ceil((atual.podeContinuarEm - agora) / 1000) : 0;
  const limiteBatido = s.limiteDiario > 0 && s.hoje.enviadosHoje >= s.limiteDiario;
  const semTravaAinda = atual.estado === "enviando" && !atual.travaConfirmada && agora - Math.max(atual.iniciadoEm, atual.retomadoEm ?? 0) > 40_000;

  const cabecalho = {
    enviando: { titulo: "A Carol está disparando…", tom: "bg-brand-50 text-brand", icone: <MessageCircle className="size-6 animate-wiggle [animation-duration:1.2s] [animation-iteration-count:infinite]" /> },
    pausado: { titulo: "Disparo pausado", tom: "bg-amber-50 text-amber-600", icone: <PauseCircle className="size-6 animate-pop-in" /> },
    parado: { titulo: "O disparo parou", tom: "bg-amber-50 text-amber-600", icone: <AlertTriangle className="size-6 animate-pop-in" /> },
    cancelado: { titulo: "Disparo cancelado", tom: "bg-surface text-muted", icone: <XCircle className="size-6 animate-pop-in" /> },
    concluido: { titulo: "Disparo concluído", tom: "bg-emerald-50 text-emerald-600", icone: <PartyPopper className="size-6 animate-pop-in" /> },
  }[atual.estado];

  const inicio = atual.retomadoEm ? `Retomado às ${horaBrasilia(atual.retomadoEm)}` : `Começou às ${horaBrasilia(atual.iniciadoEm)}`;

  return (
    <Card className={cx("animate-enter overflow-hidden", atual.estado === "concluido" && "ring-2 ring-emerald-200")}>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className={cx("grid size-12 shrink-0 place-items-center rounded-2xl", cabecalho.tom)}>{cabecalho.icone}</div>
          <div>
            <p className="text-base font-extrabold text-ink">{cabecalho.titulo}</p>
            <p className="text-xs text-muted">
              {inicio}
              {atual.interrompidoEm && (atual.estado === "pausado" || atual.estado === "cancelado") && ` · ${atual.estado} às ${horaBrasilia(atual.interrompidoEm)}`}
              {atual.estado === "enviando" && atual.travaConfirmada && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-emerald-700">
                  · <ShieldCheck className="size-3" /> trava ativa
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="text-left sm:text-right">
            <div className={cx("text-4xl font-extrabold", atual.estado === "concluido" ? "text-emerald-600" : "text-navy")}>
              <AnimatedNumber value={feitos} /> <span className="text-lg font-bold text-muted">de {n(atual.total)}</span>
            </div>
            <div className="text-xs font-semibold text-muted">contatos processados</div>
          </div>
        </div>
      </div>

      <div className={cx("flex h-2.5 bg-surface", atual.estado === "enviando" && "shine")}>
        <div className="h-full bg-emerald-500 transition-all duration-700 ease-out" style={{ width: `${(atual.enviados / Math.max(1, atual.total)) * 100}%` }} />
        <div
          className="h-full bg-amber-400 transition-all duration-700 ease-out"
          style={{ width: `${((atual.semWhatsapp + atual.outros) / Math.max(1, atual.total)) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 px-5 py-4 text-xs text-muted sm:px-6">
        <div>
          <AnimatedNumber value={atual.enviados} className="block text-xl font-extrabold text-emerald-600" />
          mensagens enviadas
        </div>
        <div>
          <AnimatedNumber value={atual.semWhatsapp + atual.outros} className="block text-xl font-extrabold text-amber-600" />
          sem WhatsApp ou erro
        </div>
        <div>
          <AnimatedNumber value={atual.aguardando} className="block text-xl font-extrabold text-ink" />
          {atual.estado === "cancelado" ? "voltaram para a fila" : atual.estado === "concluido" ? "restantes" : "ainda não receberam"}
        </div>
      </div>

      {/* Mensagem + controles */}
      <div
        className={cx(
          "flex flex-col gap-3 border-t px-5 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6",
          atual.estado === "enviando" && "border-brand-100 bg-brand-50/60 text-brand-800",
          atual.estado === "concluido" && "border-emerald-100 bg-emerald-50/70 text-emerald-900",
          (atual.estado === "parado" || atual.estado === "pausado") && "border-amber-100 bg-amber-50/70 text-amber-900",
          atual.estado === "cancelado" && "border-line bg-surface/70 text-ink",
        )}
      >
        <p className="min-w-0">
          {atual.estado === "enviando" &&
            `Uma por vez, para o WhatsApp não bloquear. Faltam cerca de ${minutos(atual.segundosRestantes)}. Pode fechar esta tela: o envio continua no n8n.`}
          {atual.estado === "pausado" &&
            (esperar > 0
              ? "Pausando: a mensagem que já estava saindo termina de ir e o n8n para antes da próxima."
              : `Pausado. Ninguém mais recebe até você continuar. ${atual.aguardando === 1 ? "Falta 1 contato" : `Faltam ${n(atual.aguardando)} contatos`}.`)}
          {atual.estado === "parado" && (
            <>
              O n8n parou com {n(atual.aguardando)} {atual.aguardando === 1 ? "contato" : "contatos"} na vez.{" "}
              {limiteBatido ? (
                <>
                  Motivo provável: <b>limite diário da Carol</b> (hoje: {n(s.hoje.enviadosHoje)} de {n(s.limiteDiario)}). Continue amanhã ou
                  aumente o limite.
                </>
              ) : (
                <>Se foi o limite diário, continue amanhã; se não, veja as execuções do Fluxo 1 no n8n.</>
              )}
            </>
          )}
          {atual.estado === "cancelado" &&
            `Cancelado. ${atual.enviados === 1 ? "1 contato recebeu" : `${n(atual.enviados)} receberam`}; ${atual.aguardando === 1 ? "o que faltava voltou" : `os ${n(atual.aguardando)} que faltavam voltaram`} para a fila, sem mensagem.`}
          {atual.estado === "concluido" && "Todos os contatos foram processados. Acompanhe as respostas no Placar da Carol."}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          {atual.estado === "enviando" && (
            <>
              <Button size="sm" variant="outline" onClick={() => onAcao("pausar")} loading={agindo === "pausar"} icon={<PauseCircle className="size-4" />}>
                Pausar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => onAcao("cancelar")}
                loading={agindo === "cancelar"}
                icon={<XCircle className="size-4" />}
              >
                Cancelar
              </Button>
            </>
          )}
          {(atual.estado === "pausado" || atual.estado === "parado") && (
            <>
              <Button
                size="sm"
                onClick={() => onAcao("continuar")}
                loading={agindo === "continuar"}
                disabled={esperar > 0}
                icon={esperar > 0 ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              >
                {esperar > 0 ? `Esperando o n8n parar (${esperar}s)` : `Continuar (${n(atual.aguardando)})`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => onAcao("cancelar")}
                loading={agindo === "cancelar"}
                icon={<XCircle className="size-4" />}
              >
                Cancelar o resto
              </Button>
            </>
          )}
          {(atual.estado === "cancelado" || atual.estado === "concluido") && (
            <Button size="sm" variant="outline" onClick={() => onAcao("encerrar")} loading={agindo === "encerrar"} icon={<X className="size-4" />}>
              Fechar
            </Button>
          )}
        </div>
      </div>

      {semTravaAinda && (
        <div className="border-t border-amber-100 bg-amber-50/50 px-5 py-3 text-sm text-amber-900 sm:px-6">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              A trava do n8n não respondeu neste disparo: <b>Pausar</b> e <b>Cancelar</b> só conseguem parar o envio no meio com ela instalada.
            </span>
          </p>
          <InstalarTrava className="mt-2" />
        </div>
      )}

      <ul className="max-h-[360px] divide-y divide-line overflow-y-auto border-t border-line">
        {atual.itens.map((item) => (
          <li
            key={item.key}
            className={cx("flex items-center justify-between gap-3 px-5 py-3 sm:px-6", item.key === atual.enviandoAgora && "bg-brand-50/60")}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{item.nome || "(sem nome)"}</p>
              <p className="truncate text-xs text-muted">
                {telefone(item.telefone)}
                {item.cidade && ` · ${item.cidade}`}
                {item.quando && item.situacao !== "pendente" && item.situacao !== "aguardando" && ` · ${horaBrasilia(item.quando)}`}
              </p>
            </div>
            <span key={`${item.situacao}-${item.key === atual.enviandoAgora}`} className="shrink-0 animate-pop-in">
              <ChipSituacao item={item} atual={atual} />
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
