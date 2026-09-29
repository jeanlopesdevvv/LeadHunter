"use client";

import { Clock, FolderOpen, MapPin, RotateCcw, Send, Tag, Trash2 } from "lucide-react";

import { Badge, Button, Card } from "@/components/ui";
import type { HistoryEntry } from "@/lib/client/history";

export function HistoryView({
  historico,
  rodando,
  onAbrir,
  onRepetir,
  onRemover,
}: {
  historico: HistoryEntry[];
  rodando: boolean;
  onAbrir: (e: HistoryEntry) => void;
  onRepetir: (e: HistoryEntry) => void;
  onRemover: (id: string) => void;
}) {
  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Histórico</p>
        <h1 className="display mt-3 text-4xl text-navy">
          Buscas <span className="text-brand">anteriores</span>
        </h1>
        <p className="mt-2 text-sm text-muted">
          As 12 últimas ficam guardadas só neste navegador. Ao reabrir, o Radar confere a planilha de novo para não repetir ninguém.
        </p>
      </header>

      {!historico.length ? (
        <Card className="grid place-items-center px-6 py-20 text-center">
          <Clock className="size-8 text-muted/60" />
          <p className="mt-4 font-semibold text-ink">Nenhuma busca ainda</p>
          <p className="mt-1 text-sm text-muted">Depois da primeira busca, ela aparece aqui para você reabrir a lista ou buscar de novo.</p>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {historico.map((h) => (
            <Card key={h.id} className="flex flex-col gap-4 p-5">
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
                {h.alvo ? <Badge tone="brand">{h.alvo} pedidos</Badge> : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span>
                  {new Date(h.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
                </span>
                <span>
                  <b className="text-ink tabular-nums">{h.total}</b> na lista
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
                  Buscar de novo
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
