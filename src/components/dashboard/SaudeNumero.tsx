"use client";

import { Activity, AlertTriangle, PauseCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Badge, Card, cx } from "@/components/ui";
import { limiteMetaTexto, type SaudeNumero, type StatusDisparo } from "@/lib/disparo-regras";
import { quandoCurto } from "@/lib/periodo";

/**
 * Saúde do número da Carol na Meta (23/10/2026). O n8n lê a Meta de hora em hora; o banco decide o freio:
 * amarela = limite do dia pela metade; vermelha, sinalizado, restrito ou bloqueado = disparos pausados.
 */

const n = (v: number) => v.toLocaleString("pt-BR");

function corDa(s: SaudeNumero): { tone: "green" | "amber" | "red" | "gray"; rotulo: string; ponto: string } {
  if (s.freio === "pausado") return { tone: "red", rotulo: s.qualidade === "RED" ? "Vermelha" : "Pausado", ponto: "bg-red-500" };
  if (s.freio === "metade") return { tone: "amber", rotulo: "Amarela", ponto: "bg-amber-400" };
  if (s.freio === "sem_leitura") return { tone: "gray", rotulo: "Sem leitura", ponto: "bg-slate-400" };
  return { tone: "green", rotulo: "Verde", ponto: "bg-emerald-500" };
}

/** "conectado; envio limitado pela Meta" vira itens ("Conectado", "Envio limitado pela Meta"). */
function itensDaSituacao(texto: string): { texto: string; ok: boolean }[] {
  return texto
    .split(";")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => ({ texto: t.charAt(0).toUpperCase() + t.slice(1), ok: t === "conectado" }));
}

/** Qualidade e situação numa frase, para as faixas de aviso. */
function naMeta(s: SaudeNumero): string {
  return `Na Meta: qualidade ${s.qualidadeTexto}${s.situacaoTexto ? `; ${s.situacaoTexto}` : ""}.`;
}

function textoDoFreio(s: SaudeNumero): string {
  if (s.freio === "pausado") return "Disparos pausados até a Meta liberar o número. Voltam sozinhos quando a qualidade melhorar.";
  if (s.freio === "metade") return `Limite de hoje reduzido de ${n(s.limiteConfigurado)} para ${n(s.limiteEfetivo)} mensagens.`;
  if (s.freio === "sem_leitura") return `Sem leitura recente da Meta: vale o limite normal (${n(s.limiteConfigurado)} por dia).`;
  return `Sem freio: vale o limite de ${n(s.limiteConfigurado)} por dia.`;
}

/** Faixa no topo da tela quando o freio está ligado ou a leitura parou. */
export function AvisoSaude({ s }: { s: StatusDisparo | null }) {
  const saude = s?.saude;
  if (!saude) return null;
  if (saude.freio === "pausado") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <PauseCircle className="mt-0.5 size-4 shrink-0" />
        <span>
          <b>Disparos pausados pela saúde do número da Carol.</b> {naMeta(saude)} Eles voltam sozinhos quando a Meta liberar o número; a
          equipe recebeu aviso no WhatsApp.
        </span>
      </div>
    );
  }
  if (saude.freio === "metade") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          <b>Qualidade amarela na Meta.</b> O limite de hoje caiu de {n(saude.limiteConfigurado)} para {n(saude.limiteEfetivo)} mensagens para
          proteger o número. Volta ao normal sozinho quando a qualidade voltar ao verde.
        </span>
      </div>
    );
  }
  if (saude.freio === "sem_leitura" && saude.ultimaTentativaOk === false) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <span>
          <b className="text-ink">Não consegui ler a saúde do número na Meta.</b> Os disparos seguem com o limite normal. Confira o token da Meta
          no n8n{saude.ultimoErro ? ` (${saude.ultimoErro})` : ""}.
        </span>
      </div>
    );
  }
  return null;
}

/** Cartão "Saúde do número", embaixo da fila da Carol. */
export function CartaoSaude({ s }: { s: StatusDisparo | null }) {
  const [detalhes, setDetalhes] = useState(false);
  if (!s) {
    return (
      <Card className="p-5 sm:p-6">
        <div className="skeleton h-5 w-40 rounded" />
        <div className="skeleton mt-3 h-4 w-full rounded" />
      </Card>
    );
  }
  const saude = s.saude;
  if (!saude) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <Activity className="size-4 text-brand" /> Saúde do número
        </p>
        <p className="mt-2 text-sm text-muted">A leitura da Meta ainda não está disponível. Os disparos seguem o limite de cada dia.</p>
      </Card>
    );
  }
  const cor = corDa(saude);
  const limiteMeta = limiteMetaTexto(saude.limiteMeta);
  const temDetalhes = saude.avisos.length > 0 || saude.semWhatsappHoje > 0 || saude.optouts7d > 0;
  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 whitespace-nowrap text-sm font-bold text-ink">
          <Activity className="size-4 text-brand" /> Saúde do número
        </p>
        <Badge tone={cor.tone} title="Qualidade do número da Carol na Meta">
          <span className={cx("size-1.5 rounded-full", cor.ponto)} aria-hidden />
          {cor.rotulo}
        </Badge>
      </div>

      <p className="mt-2 text-sm text-muted">
        Qualidade na Meta: <b className="text-ink">{saude.qualidadeTexto}</b>
      </p>
      {saude.situacaoTexto && (
        <ul className="mt-2 space-y-1 text-sm">
          {itensDaSituacao(saude.situacaoTexto).map((i) => (
            <li key={i.texto} className="flex items-center gap-2 text-ink">
              <span className={cx("size-1.5 shrink-0 rounded-full", i.ok ? "bg-emerald-500" : "bg-amber-400")} aria-hidden />
              {i.texto}
            </li>
          ))}
        </ul>
      )}
      {limiteMeta && <p className="mt-1.5 text-xs text-muted">Limite da Meta: {limiteMeta}</p>}

      <p
        className={cx(
          "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
          saude.freio === "pausado" ? "bg-red-50 text-red-800" : saude.freio === "metade" ? "bg-amber-50 text-amber-900" : "bg-surface text-muted",
        )}
      >
        {saude.freio === "normal" ? (
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
        ) : (
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        )}
        <span>{textoDoFreio(saude)}</span>
      </p>

      {temDetalhes && (
        <button
          type="button"
          onClick={() => setDetalhes((v) => !v)}
          className="mt-2 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
          aria-expanded={detalhes}
        >
          {detalhes ? "Esconder detalhes" : "Ver detalhes"}
        </button>
      )}
      {detalhes && (
        <div className="mt-2 space-y-2 text-xs text-muted">
          {saude.avisos.length > 0 && (
            <ul className="space-y-1">
              {saude.avisos.map((a) => (
                <li key={a} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">
                  {a}
                </li>
              ))}
            </ul>
          )}
          <p>
            Hoje: <b className="text-ink tabular-nums">{n(saude.semWhatsappHoje)}</b> sem WhatsApp · Últimos 7 dias:{" "}
            <b className="text-ink tabular-nums">{n(saude.optouts7d)}</b> {saude.optouts7d === 1 ? "pediu" : "pediram"} para não receber.
          </p>
          <p>Bloqueios e denúncias derrubam a qualidade na Meta. Se esses números subirem, reduza o limite antes que a Meta reduza.</p>
        </div>
      )}

      <p className="mt-3 text-[11px] text-muted">
        {saude.checadoEm ? <>Checado na Meta {quandoCurto(saude.checadoEm)} · atualiza de hora em hora.</> : "Ainda sem leitura da Meta."}
      </p>
    </Card>
  );
}
