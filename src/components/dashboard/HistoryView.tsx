"use client";

import { Clock, FolderOpen, MapPin, RotateCcw, Send, Tag, Trash2 } from "lucide-react";
import { useState, type CSSProperties } from "react";

import { Badge, Button, Card } from "@/components/ui";
import type { HistoryEntry } from "@/lib/client/history";

export function HistoryView({
  historico,
  rodando,
  onAbrir,
  onRepetir,
  onRemover,
  onLimpar,
}: {
  historico: HistoryEntry[];
  rodando: boolean;
  onAbrir: (e: HistoryEntry) => void;
  onRepetir: (e: HistoryEntry) => void;
  onRemover: (id: string) => void;
  onLimpar: () => void;
}) {
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
        <p className="eyebrow">Histórico</p>
        <h1 className="display mt-3 text-4xl text-navy">
          Suas caçadas <span className="text-brand">recentes</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          As 12 últimas ficam guardadas neste navegador. Reabra uma lista ou repita a caçada com um clique: o Radar confere a planilha de
          novo e ninguém recebe mensagem repetida.
        </p>
        </div>
        {historico.length > 0 &&
          (confirmar ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">Apagar as {historico.length} buscas deste navegador?</span>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  onLimpar();
                  setConfirmar(false);
                }}
              >
                Sim, limpar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmar(false)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setConfirmar(true)} disabled={rodando} icon={<Trash2 className="size-4" />}>
              Limpar histórico
            </Button>
          ))}
      </header>
      <p className="-mt-3 text-xs text-muted">Limpar o histórico não mexe na planilha: quem já foi enviado continua lá e não recebe de novo.</p>

      {!historico.length ? (
        <Card className="grid place-items-center px-6 py-20 text-center">
          <Clock className="size-8 animate-float text-muted/60" />
          <p className="mt-4 font-semibold text-ink">Nenhuma caçada por aqui ainda</p>
          <p className="mt-1 text-sm text-muted">Faça a primeira e ela aparece aqui, pronta para reabrir ou repetir quando quiser.</p>
        </Card>
      ) : (
        <div className="stagger grid gap-3 lg:grid-cols-2">
          {historico.map((h, i) => (
            <Card key={h.id} className="lift flex flex-col gap-4 p-5 hover:shadow-md" style={{ "--i": i } as CSSProperties}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                  <p className="flex items-center gap-2 text-sm font-bold text-ink">
                    <Tag className="size-3.5 shrink-0 text-brand" />
                    <span className="truncate">{h.termos.join(", ")}</span>
                  </p>
                  <p className="flex items-center gap-2 text-sm text-muted">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{h.cidades.join(", ")}</span>
                  </p>
                </div>
                {h.alvo ? <Badge tone="brand">meta de {h.alvo}</Badge> : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  {new Date(h.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                </span>
                <span>
                  <b className="text-ink tabular-nums">{h.total}</b> no radar
                </span>
                <span className="inline-flex items-center gap-1">
                  <Send className="size-3" /> <b className="text-ink tabular-nums">{h.enviados}</b> enviados para a planilha
                </span>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                <Button size="sm" variant="outline" onClick={() => onAbrir(h)} disabled={!h.leads?.length || rodando} icon={<FolderOpen className="size-3.5" />}>
                  Abrir lista
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onRepetir(h)} icon={<RotateCcw className="size-3.5" />}>
                  Caçar de novo
                </Button>
                <Button size="sm" variant="ghost" className="ml-auto hover:text-red-600" onClick={() => onRemover(h.id)} aria-label="Remover do histórico">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
