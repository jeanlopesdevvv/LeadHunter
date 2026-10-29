"use client";

import { BellRing, CheckCircle2, Hourglass, MessageCircle, MoonStar } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import { ABA_CHATWOOT, BotaoAtender, useChatwoot } from "@/components/chatwoot";
import { Badge, Card, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { RESPONSAVEL, tempoDeEspera, urgencia, type FilaAtendente as Fila, type ItemFila } from "@/lib/fila-regras";
import { normalizePhone, whatsappLink } from "@/lib/phone";

/**
 * "Esperando atendente" (29/10/2026): quem a Carol ou a Sofia passaram para a equipe e ainda não teve resposta,
 * ou escreveu de novo depois da resposta da equipe. O tempo fica amarelo com 15 min e vermelho com 60 min
 * no horário da equipe (segunda a sexta, das 8h às 18h), os mesmos pontos em que o n8n manda o lembrete.
 */

const COR_TEMPO = {
  ok: "bg-slate-100 text-slate-700",
  atencao: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  atrasado: "bg-red-50 text-red-700 ring-1 ring-red-200",
} as const;

function Linha({ item, i }: { item: ItemFila; i: number }) {
  const chatwoot = useChatwoot();
  const tel = normalizePhone(item.telefone);
  const u = urgencia(item.minutosUteis);
  const foraDoHorario = item.minutosTotal - item.minutosUteis > 5;
  return (
    <li style={{ "--i": i } as CSSProperties} className="px-5 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {item.nome || "(sem nome)"} <span className="font-normal text-muted">{tel.display || item.telefone}</span>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={item.canal === "carol" ? "brand" : "navy"} title={`Responsável: ${RESPONSAVEL[item.canal]}`}>
              {item.canal === "carol" ? "Carol · vendas" : "Sofia · suporte"}
            </Badge>
            <span className="text-[11px] text-muted">
              {item.tipo === "pedido" ? "A IA passou para a equipe" : "Escreveu de novo depois da resposta"}
            </span>
            {item.lembretes > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted" title="Lembretes já mandados para a equipe no WhatsApp">
                <BellRing className="size-3" /> {item.lembretes === 1 ? "1 lembrete" : `${item.lembretes} lembretes`}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span
            className={cx("rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums", COR_TEMPO[u])}
            title={foraDoHorario ? `${tempoDeEspera(item.minutosUteis)} no horário da equipe` : undefined}
          >
            {tempoDeEspera(item.minutosTotal)}
          </span>
          {item.linkConversa ? (
            <a
              href={item.linkConversa}
              target={ABA_CHATWOOT}
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100"
            >
              Atender
            </a>
          ) : chatwoot?.url ? (
            <BotaoAtender telefone={item.telefone} nome={item.nome} />
          ) : (
            <a
              href={whatsappLink(tel.digits || item.telefone)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
            >
              <MessageCircle className="size-3.5" /> Abrir
            </a>
          )}
        </div>
      </div>
      {item.ultimaMensagem && (
        <p className="mt-2 line-clamp-2 rounded-lg bg-surface px-3 py-2 text-xs text-ink">
          <b className="text-emerald-700">Contato: </b>
          {item.ultimaMensagem}
        </p>
      )}
    </li>
  );
}

export function FilaAtendente() {
  const [fila, setFila] = useState<Fila | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setFila(await api<Fila>("/api/fila"));
      setErro(false);
    } catch {
      setErro(true);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 0);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void carregar();
    }, 60_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [carregar]);

  if (fila && !fila.disponivel) return null;
  const itens = fila?.itens ?? [];
  const atrasados = itens.filter((x) => urgencia(x.minutosUteis) !== "ok").length;

  return (
    <Card className={cx("overflow-hidden", atrasados > 0 && "ring-2 ring-amber-200")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
        <Hourglass className="size-4 text-amber-500" />
        <p className="text-base font-bold text-ink">Esperando atendente</p>
        {itens.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 tabular-nums">{itens.length}</span>
        )}
        {fila && !fila.equipeNoHorario && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted" title="Os lembretes no WhatsApp só saem no horário da equipe">
            <MoonStar className="size-3.5" /> Fora do horário da equipe (seg. a sex., 8h às 18h)
          </span>
        )}
      </div>
      {!fila && !erro ? (
        <div className="space-y-2 p-5">
          <div className="skeleton h-12 rounded-lg" />
        </div>
      ) : erro && !fila ? (
        <p className="px-5 py-6 text-sm text-muted">Não deu para ler a fila agora. Ela atualiza sozinha em 1 minuto.</p>
      ) : !itens.length ? (
        <p className="flex items-center justify-center gap-2 px-5 py-6 text-sm text-muted">
          <CheckCircle2 className="size-4 text-emerald-500" /> Ninguém esperando a equipe agora.
        </p>
      ) : (
        <>
          <ul className="stagger divide-y divide-line">
            {itens.map((item, i) => (
              <Linha key={`${item.canal}-${item.telefone}`} item={item} i={i} />
            ))}
          </ul>
          <p className="border-t border-line px-5 py-2.5 text-[11px] text-muted">
            Lembrete no WhatsApp com 15 min (para o responsável: Carol → {RESPONSAVEL.carol}, Sofia → {RESPONSAVEL.sofia}) e com 1 hora (para os dois),
            contando só o horário da equipe.
          </p>
        </>
      )}
    </Card>
  );
}
