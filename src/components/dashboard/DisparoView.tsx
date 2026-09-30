"use client";

import { AlertTriangle, CheckCircle2, Clock, Loader2, MessageCircle, PauseCircle, RefreshCw, Send, Users, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card, Modal, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { ItemDisparo, StatusDisparo } from "@/lib/disparo-regras";
import { SEGUNDOS_POR_LEAD } from "@/lib/disparo-regras";
import { horaBrasilia, quandoCurto } from "@/lib/periodo";
import { normalizePhone } from "@/lib/phone";

const n = (v: number) => v.toLocaleString("pt-BR");

function minutos(segundos: number): string {
  const m = Math.max(1, Math.round(segundos / 60));
  return m === 1 ? "1 minuto" : `${m} minutos`;
}

function telefone(t: string): string {
  return normalizePhone(t).display || t;
}

function ChipSituacao({ item }: { item: ItemDisparo }) {
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
      return (
        <Badge tone="gray">
          <Clock className="size-3" /> Aguardando
        </Badge>
      );
    case "sumiu":
      return <Badge tone="red">Saiu da planilha</Badge>;
    default:
      return <Badge tone="gray">Outro status</Badge>;
  }
}

export function DisparoView({
  confirmarAoAbrir,
  onConfirmacaoVista,
}: {
  /** Veio do botão "Disparar agora" do envio: já abre a confirmação. */
  confirmarAoAbrir: boolean;
  onConfirmacaoVista: () => void;
}) {
  const toast = useToast();
  const [status, setStatus] = useState<StatusDisparo | null>(null);
  const [erro, setErro] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [disparando, setDisparando] = useState(false);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    try {
      const s = await api<StatusDisparo>("/api/disparo");
      if (meu !== pedido.current) return null;
      setStatus(s);
      setErro("");
      return s;
    } catch (e) {
      if (meu === pedido.current) setErro((e as Error).message);
      return null;
    }
  }, []);

  // Primeira leitura e, se veio do envio, abre a confirmação.
  const abrirConfirmacao = useRef(confirmarAoAbrir);
  useEffect(() => {
    let ativo = true;
    const meu = ++pedido.current;
    api<StatusDisparo>("/api/disparo")
      .then((s) => {
        if (!ativo || meu !== pedido.current) return;
        setStatus(s);
        setErro("");
        if (abrirConfirmacao.current) {
          abrirConfirmacao.current = false;
          onConfirmacaoVista();
          if (s.configurado && s.fila > 0) setConfirmar(true);
        }
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [onConfirmacaoVista]);

  // Atualiza sozinho: rápido enquanto a Carol está enviando, devagar no resto do tempo.
  const enviando = status?.atual?.estado === "enviando";
  useEffect(() => {
    const id = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void carregar();
      },
      enviando ? 5_000 : 30_000,
    );
    return () => window.clearInterval(id);
  }, [enviando, carregar]);

  async function atualizar() {
    setAtualizando(true);
    await carregar();
    setAtualizando(false);
  }

  async function disparar() {
    setDisparando(true);
    try {
      const s = await api<StatusDisparo>("/api/disparo", {});
      setStatus(s);
      setConfirmar(false);
      toast(`Disparo começou: ${n(s.atual?.total ?? 0)} contatos na fila da Carol.`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
      setConfirmar(false);
      void carregar();
    } finally {
      setDisparando(false);
    }
  }

  const s = status;
  const atual = s?.atual ?? null;
  const bloqueado = !s || !s.configurado || s.fila === 0 || enviando || s.movimentoRecente;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Disparo</p>
          <h1 className="display mt-3 text-4xl text-navy sm:text-5xl">
            A Carol chama <span className="text-brand">no WhatsApp.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Quem está pendente na planilha recebe a primeira mensagem da Carol. Ela manda uma por vez, a cada 10 a 15 segundos, para o
            WhatsApp não bloquear. Você acompanha tudo aqui.
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
            <b>Não deu para ler a planilha.</b> {erro}
          </span>
        </div>
      )}

      {s && !s.configurado && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            O botão ainda não está ligado ao n8n. Falta colocar o nó <b>Disparo pelo Radar</b> no Fluxo 1 e as variáveis{" "}
            <b>N8N_DISPARO_URL</b> e <b>N8N_DISPARO_TOKEN</b> no EasyPanel (passo a passo em docs/SETUP.md).
          </span>
        </div>
      )}

      {s?.movimentoRecente && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
          <span>
            A Carol mandou mensagem há pouco: parece que o fluxo está rodando direto no n8n. Espere terminar antes de disparar de novo, para
            ninguém receber duas vezes.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Fila */}
        <Card className="p-5 sm:p-6">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Users className="size-4 text-brand" /> Fila da Carol
          </p>
          {!s ? (
            <div className="mt-4 h-10 w-24 animate-pulse rounded bg-surface" />
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight text-navy tabular-nums">{n(s.fila)}</span>
                <span className="text-sm text-muted">{s.fila === 1 ? "contato pendente" : "contatos pendentes"}</span>
              </div>
              <p className="mt-1 text-xs text-muted">
                {s.fila > 0 ? `Leva cerca de ${minutos(s.fila * SEGUNDOS_POR_LEAD)} para todos.` : "Envie contatos para a planilha na tela de Resultados."}
              </p>
              <div className="mt-4 space-y-1 rounded-xl bg-surface px-3.5 py-3 text-sm">
                <p>
                  Hoje: <b className="tabular-nums">{n(s.hoje.enviadosHoje)}</b> {s.hoje.enviadosHoje === 1 ? "mensagem enviada" : "mensagens enviadas"}
                  {s.limiteDiario > 0 && <span className="text-muted"> de {n(s.limiteDiario)} por dia</span>}
                </p>
                {s.hoje.semWhatsappHoje > 0 && (
                  <p className="text-muted">
                    <b className="text-ink tabular-nums">{n(s.hoje.semWhatsappHoje)}</b> sem WhatsApp
                  </p>
                )}
                {s.hoje.ultimoMovimento && <p className="text-xs text-muted">Última mensagem {quandoCurto(s.hoje.ultimoMovimento)}.</p>}
              </div>
              <Button
                size="lg"
                className="mt-5 w-full"
                disabled={bloqueado}
                onClick={() => setConfirmar(true)}
                icon={<Send className="size-4" />}
              >
                {enviando ? "Disparo em andamento" : s.fila > 0 ? `Disparar para ${n(s.fila)}` : "Ninguém na fila"}
              </Button>
              {s.configurado && <p className="mt-2 text-center text-[11px] text-muted">n8n: {s.destino}</p>}
            </>
          )}
        </Card>

        {/* Progresso */}
        {atual ? (
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-center gap-4">
                <div
                  className={cx(
                    "grid size-12 shrink-0 place-items-center rounded-2xl",
                    atual.estado === "enviando" && "bg-brand-50 text-brand",
                    atual.estado === "concluido" && "bg-emerald-50 text-emerald-600",
                    atual.estado === "parado" && "bg-amber-50 text-amber-600",
                  )}
                >
                  {atual.estado === "enviando" ? (
                    <MessageCircle className="size-6 animate-pulse" />
                  ) : atual.estado === "concluido" ? (
                    <CheckCircle2 className="size-6" />
                  ) : (
                    <PauseCircle className="size-6" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">
                    {atual.estado === "enviando" ? "Enviando…" : atual.estado === "concluido" ? "Disparo concluído" : "O disparo parou"}
                  </p>
                  <p className="text-xs text-muted">Começou às {horaBrasilia(atual.iniciadoEm)}</p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-3xl font-extrabold text-navy tabular-nums">
                  {n(atual.total - atual.aguardando)} <span className="text-lg font-bold text-muted">de {n(atual.total)}</span>
                </div>
                <div className="text-xs font-semibold text-muted">contatos processados</div>
              </div>
            </div>
            <div className="flex h-2 bg-surface">
              <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(atual.enviados / Math.max(1, atual.total)) * 100}%` }} />
              <div
                className="h-full bg-amber-400 transition-all duration-500"
                style={{ width: `${((atual.semWhatsapp + atual.outros) / Math.max(1, atual.total)) * 100}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 px-5 py-4 text-xs text-muted sm:px-6">
              <div>
                <div className="text-lg font-bold text-emerald-600 tabular-nums">{n(atual.enviados)}</div>
                mensagens enviadas
              </div>
              <div>
                <div className="text-lg font-bold text-amber-600 tabular-nums">{n(atual.semWhatsapp + atual.outros)}</div>
                sem WhatsApp ou erro
              </div>
              <div>
                <div className="text-lg font-bold text-ink tabular-nums">{n(atual.aguardando)}</div>
                aguardando
              </div>
            </div>
            <div
              className={cx(
                "border-t px-5 py-3 text-sm sm:px-6",
                atual.estado === "enviando" && "border-brand-100 bg-brand-50/60 text-brand-800",
                atual.estado === "concluido" && "border-emerald-100 bg-emerald-50/70 text-emerald-900",
                atual.estado === "parado" && "border-amber-100 bg-amber-50/70 text-amber-900",
              )}
            >
              {atual.estado === "enviando" &&
                `A Carol está mandando uma por vez. Faltam cerca de ${minutos(atual.segundosRestantes)}. Pode fechar esta tela: o envio continua no n8n.`}
              {atual.estado === "concluido" && `Pronto! Todos os ${n(atual.total)} contatos foram processados. As respostas chegam para a Carol no WhatsApp.`}
              {atual.estado === "parado" && (
                <>
                  O n8n parou com {n(atual.aguardando)} {atual.aguardando === 1 ? "contato aguardando" : "contatos aguardando"}. O mais comum é o{" "}
                  <b>limite diário da Carol</b>
                  {s && ` (hoje: ${n(s.hoje.enviadosHoje)} enviadas${s.limiteDiario ? ` de ${n(s.limiteDiario)}` : ""})`}. Quem ficou continua
                  pendente e sai no próximo disparo. Se não for isso, veja as execuções do Fluxo 1 no n8n.
                </>
              )}
            </div>
            <ul className="max-h-[480px] divide-y divide-line overflow-y-auto border-t border-line">
              {atual.itens.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{item.nome || "(sem nome)"}</p>
                    <p className="truncate text-xs text-muted">
                      {telefone(item.telefone)}
                      {item.cidade && ` · ${item.cidade}`}
                      {item.quando && item.situacao !== "pendente" && ` · ${horaBrasilia(item.quando)}`}
                    </p>
                  </div>
                  <ChipSituacao item={item} />
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="border-b border-line px-5 py-4 sm:px-6">
              <p className="text-sm font-bold text-ink">Próximos da fila</p>
              <p className="text-xs text-muted">Estes recebem a mensagem no próximo disparo (a mesma regra do n8n: status pendente e sem optout).</p>
            </div>
            {!s ? (
              <div className="p-6 text-sm text-muted">Carregando…</div>
            ) : !s.proximos.length ? (
              <div className="p-10 text-center text-sm text-muted">Ninguém pendente na planilha agora.</div>
            ) : (
              <ul className="max-h-[480px] divide-y divide-line overflow-y-auto">
                {s.proximos.map((p, i) => (
                  <li key={`${p.telefone}-${i}`} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{p.nome || "(sem nome)"}</p>
                      <p className="truncate text-xs text-muted">
                        {telefone(p.telefone)}
                        {p.cidade && ` · ${p.cidade}`}
                      </p>
                    </div>
                    <Badge tone="gray">Pendente</Badge>
                  </li>
                ))}
                {s.fila > s.proximos.length && (
                  <li className="px-5 py-3 text-xs text-muted sm:px-6">e mais {n(s.fila - s.proximos.length)}</li>
                )}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Modal open={confirmar} onClose={() => !disparando && setConfirmar(false)} title="Disparar agora?">
        {s && (
          <div className="space-y-4 text-sm">
            <p>
              A Carol vai mandar a primeira mensagem no WhatsApp para <b>{n(s.fila)}</b> {s.fila === 1 ? "contato pendente" : "contatos pendentes"} da
              planilha, um de cada vez (cerca de {minutos(s.fila * SEGUNDOS_POR_LEAD)}).
            </p>
            {s.limiteDiario > 0 && (
              <p className="rounded-xl bg-surface px-3.5 py-2.5 text-muted">
                Limite da Carol: {n(s.limiteDiario)} por dia. Hoje já foram {n(s.hoje.enviadosHoje)}. Quem passar do limite fica pendente para o
                próximo dia.
              </p>
            )}
            <p className="flex items-start gap-2 text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Mensagem enviada não volta atrás.
            </p>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setConfirmar(false)} disabled={disparando}>
                Cancelar
              </Button>
              <Button onClick={disparar} loading={disparando} icon={<Send className="size-4" />}>
                Sim, disparar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
