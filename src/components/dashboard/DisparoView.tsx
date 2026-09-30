"use client";

import { AlertTriangle, CheckCircle2, Clock, Copy, Loader2, MessageCircle, PauseCircle, RefreshCw, Send, Users, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card, Modal, cx, inputClass } from "@/components/ui";
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
          <Clock className="size-3" /> Na vez
        </Badge>
      );
    case "aguardando":
      return <Badge tone="gray">Tirado do disparo</Badge>;
    case "sumiu":
      return <Badge tone="red">Saiu da planilha</Badge>;
    default:
      return <Badge tone="gray">Outro status</Badge>;
  }
}

export function DisparoView({
  preSelecao,
  onPreSelecaoVista,
}: {
  /** Veio do botão "Disparar agora" do envio: marca esses telefones e abre a confirmação. */
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
  const pedido = useRef(0);
  const preSelecaoRef = useRef(preSelecao);

  /** Aplica uma leitura nova: tira da seleção quem saiu da fila. */
  const aplicar = useCallback((s: StatusDisparo) => {
    setStatus(s);
    setErro("");
    const naFila = new Set(s.itensFila.map((i) => i.key));
    setMarcados((m) => {
      const novo = new Set([...m].filter((k) => naFila.has(k)));
      return novo.size === m.size ? m : novo;
    });
  }, []);

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

  // Primeira leitura; se veio do envio, já marca quem acabou de entrar e abre a confirmação.
  useEffect(() => {
    let ativo = true;
    const meu = ++pedido.current;
    api<StatusDisparo>("/api/disparo")
      .then((s) => {
        if (!ativo || meu !== pedido.current) return;
        aplicar(s);
        const pre = preSelecaoRef.current;
        if (pre?.length) {
          preSelecaoRef.current = null;
          onPreSelecaoVista();
          const naFila = new Set(s.itensFila.map((i) => i.key));
          const escolhidos = pre.filter((k) => naFila.has(k));
          setMarcados(new Set(escolhidos));
          if (s.configurado && escolhidos.length) setConfirmar(true);
        }
      })
      .catch((e: Error) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [aplicar, onPreSelecaoVista]);

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
      const s = await api<StatusDisparo>("/api/disparo", { telefones: [...marcados] });
      aplicar(s);
      setMarcados(new Set());
      setConfirmar(false);
      toast(`Disparo começou: ${n(s.atual?.total ?? 0)} contato(s) na vez da Carol.`, "success");
      window.scrollTo({ top: 0, behavior: "smooth" });
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
  const itens = s?.itensFila ?? [];
  const termo = filtro.trim().toLowerCase();
  const visiveis = termo ? itens.filter((i) => `${i.nome} ${i.telefone} ${i.cidade}`.toLowerCase().includes(termo)) : itens;
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((i) => marcados.has(i.key));
  const algunsVisiveisMarcados = visiveis.some((i) => marcados.has(i.key));
  const qtd = marcados.size;
  const restamHoje = s && s.limiteDiario > 0 ? Math.max(0, s.limiteDiario - s.hoje.enviadosHoje) : null;
  const travado = !s || !s.configurado || enviando || s.movimentoRecente;
  const nomesMarcados = itens.filter((i) => marcados.has(i.key));

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

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Disparo</p>
          <h1 className="display mt-3 text-4xl text-navy sm:text-5xl">
            A Carol chama <span className="text-brand">no WhatsApp.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
            Marque quem deve receber a primeira mensagem da Carol e clique em Disparar. Ela manda uma por vez, a cada 10 a 15 segundos, para
            o WhatsApp não bloquear. O andamento aparece aqui.
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

      {s && !s.configurado && <ComoLigar />}

      {s?.movimentoRecente && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" />
          <span>
            A Carol mandou mensagem há pouco: parece que o fluxo está rodando direto no n8n. Espere terminar antes de disparar de novo, para
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
                disparo: ele não aparece na fila e, ao disparar, fica como aguardando. Para tirar de vez, escreva sim na coluna optout.
              </span>
            ))}
          </span>
        </div>
      )}

      {atual && <CartaoProgresso atual={atual} s={s} />}

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Resumo e botão */}
        <Card className="h-fit p-5 sm:p-6 lg:sticky lg:top-6">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Users className="size-4 text-brand" /> Fila da Carol
          </p>
          {!s ? (
            <div className="mt-4 h-10 w-24 animate-pulse rounded bg-surface" />
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-extrabold tracking-tight text-navy tabular-nums">{n(s.fila)}</span>
                <span className="text-sm text-muted">na fila</span>
              </div>
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
              <p className="mt-4 text-sm text-ink">
                <b className="tabular-nums">{n(qtd)}</b> {qtd === 1 ? "marcado" : "marcados"}
                {qtd > 0 && <span className="text-muted"> · cerca de {minutos(qtd * SEGUNDOS_POR_LEAD)}</span>}
              </p>
              {restamHoje !== null && qtd > restamHoje && (
                <p className="mt-1 text-xs text-amber-700">
                  Hoje só cabem mais {n(restamHoje)} (limite de {n(s.limiteDiario)} por dia). Os outros continuam na fila para o próximo disparo.
                </p>
              )}
              <Button size="lg" className="mt-4 w-full" disabled={travado || qtd === 0} onClick={() => setConfirmar(true)} icon={<Send className="size-4" />}>
                {enviando ? "Disparo em andamento" : qtd > 0 ? `Disparar para ${n(qtd)}` : "Marque quem vai receber"}
              </Button>
              {s.configurado && <p className="mt-2 text-center text-[11px] text-muted">n8n: {s.destino}</p>}
            </>
          )}
        </Card>

        {/* Fila com seleção */}
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
              <input
                type="checkbox"
                className="check"
                checked={todosVisiveisMarcados}
                ref={(el) => {
                  if (el) el.indeterminate = !todosVisiveisMarcados && algunsVisiveisMarcados;
                }}
                onChange={marcarTodos}
                disabled={!visiveis.length || enviando}
              />
              Marcar todos ({n(visiveis.length)}){termo && " do filtro"}
            </label>
            <input
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Procurar por nome, telefone ou cidade…"
              className={cx(inputClass, "sm:w-72")}
            />
          </div>
          {!s ? (
            <div className="p-6 text-sm text-muted">Carregando…</div>
          ) : !itens.length ? (
            <div className="p-10 text-center text-sm text-muted">Ninguém na fila. Envie contatos para a planilha na tela de Resultados.</div>
          ) : (
            <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">
              {visiveis.map((p) => {
                const marcado = marcados.has(p.key);
                return (
                  <li key={`${p.key}-${p.linha}`}>
                    <label className={cx("flex cursor-pointer items-center gap-3 px-5 py-3 sm:px-6", marcado ? "bg-brand-50/50" : "hover:bg-surface/70")}>
                      <input type="checkbox" className="check" checked={marcado} onChange={() => alternar(p.key)} disabled={enviando} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{p.nome || "(sem nome)"}</p>
                        <p className="truncate text-xs text-muted">
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
              {!visiveis.length && <li className="px-6 py-8 text-center text-sm text-muted">Ninguém com esse filtro.</li>}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={confirmar} onClose={() => !disparando && setConfirmar(false)} title="Disparar agora?">
        {s && (
          <div className="space-y-4 text-sm">
            <p>
              A Carol vai mandar a primeira mensagem no WhatsApp para <b>{n(qtd)}</b> {qtd === 1 ? "contato" : "contatos"}, um de cada vez (cerca de{" "}
              {minutos(qtd * SEGUNDOS_POR_LEAD)}).
            </p>
            {nomesMarcados.length > 0 && nomesMarcados.length <= 8 && (
              <ul className="space-y-1 rounded-xl bg-surface px-3.5 py-2.5">
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
                Os outros {n(s.fila - qtd)} da fila não recebem agora: ficam como <b>aguardando</b> na planilha e continuam aqui para o próximo disparo.
              </p>
            )}
            {restamHoje !== null && (
              <p className="text-muted">
                Limite da Carol: {n(s.limiteDiario)} por dia (hoje já foram {n(s.hoje.enviadosHoje)}).{" "}
                {qtd > restamHoje ? `Só ${n(restamHoje)} saem hoje; o resto fica pendente para o próximo disparo.` : ""}
              </p>
            )}
            <p className="flex items-start gap-2 text-amber-800">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Mensagem enviada não volta atrás.
            </p>
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => setConfirmar(false)} disabled={disparando}>
                Cancelar
              </Button>
              <Button onClick={disparar} loading={disparando} disabled={qtd === 0} icon={<Send className="size-4" />}>
                Sim, disparar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CartaoProgresso({ atual, s }: { atual: NonNullable<StatusDisparo["atual"]>; s: StatusDisparo | null }) {
  return (
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
        <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${((atual.semWhatsapp + atual.outros) / Math.max(1, atual.total)) * 100}%` }} />
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
          na vez
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
        {atual.estado === "concluido" && `Pronto! ${atual.total === 1 ? "O contato foi processado" : `Os ${n(atual.total)} contatos foram processados`}. As respostas chegam para a Carol no WhatsApp.`}
        {atual.estado === "parado" && (
          <>
            O n8n parou com {n(atual.aguardando)} {atual.aguardando === 1 ? "contato na vez" : "contatos na vez"}. O mais comum é o <b>limite diário da Carol</b>
            {s && ` (hoje: ${n(s.hoje.enviadosHoje)} enviadas${s.limiteDiario ? ` de ${n(s.limiteDiario)}` : ""})`}. Quem ficou continua pendente e sai
            no próximo disparo. Se não for isso, veja as execuções do Fluxo 1 no n8n.
          </>
        )}
      </div>
      <ul className="max-h-[360px] divide-y divide-line overflow-y-auto border-t border-line">
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
  );
}
