"use client";

import { CheckCircle2, Copy, ExternalLink, FlaskConical, Gauge, Headset, KeyRound, Map, RefreshCw, Send, ShieldCheck, Table2, TriangleAlert, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card, cx } from "@/components/ui";
import { formatarRenovacao, horaBrasilia } from "@/lib/periodo";
import type { Uso } from "@/lib/types";

import { InstalarTrava } from "./TravaN8n";

export interface StatusResponse {
  simulacao: boolean;
  places: { configurada: boolean };
  uso?: Uso;
  projetoGoogle?: string;
  disparo?: { configurado: boolean; destino: string; limiteDiario: number; trava?: { ultimaEm: number | null; chaveErradaEm: number | null } };
  chatwoot?: { url: string; apiLigada: boolean };
  limites: { maxConsultasPorBusca: number };
  planilha: {
    configurada: boolean;
    contaServico: string;
    planilhaId: string;
    planilhaUrl: string;
    aba: string;
    abasExtras: string[];
    statusPadrao: string;
    ok: boolean;
    erro: string;
    titulo?: string;
    abas?: string[];
    cabecalhos?: string[];
    colunasFaltando?: string[];
    linhas?: number;
    telefonesUnicos?: number;
    optout?: number;
    extraTelefones?: number;
    abasExtrasLidas?: string[];
    extraErro?: string;
  };
}

type Situacao = "ok" | "atencao" | "erro";

const SITUACAO: Record<Situacao, { rotulo: string; tom: "green" | "amber" | "red"; icone: string }> = {
  ok: { rotulo: "Conectado", tom: "green", icone: "bg-emerald-50 text-emerald-600" },
  atencao: { rotulo: "Atenção", tom: "amber", icone: "bg-amber-50 text-amber-600" },
  erro: { rotulo: "Desconectado", tom: "red", icone: "bg-red-50 text-red-600" },
};

function Item({ situacao, rotulo, titulo, icon, children }: { situacao: Situacao; rotulo?: string; titulo: string; icon: ReactNode; children?: ReactNode }) {
  const s = SITUACAO[situacao];
  return (
    <div className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <div className={cx("grid size-10 shrink-0 place-items-center rounded-xl", s.icone)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold text-ink">{titulo}</p>
          <Badge tone={s.tom}>
            {situacao === "ok" ? <CheckCircle2 className="size-3" /> : situacao === "atencao" ? <TriangleAlert className="size-3" /> : <XCircle className="size-3" />}
            {rotulo ?? s.rotulo}
          </Badge>
        </div>
        <div className="mt-1 space-y-1.5 text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}

function Copiavel({ texto }: { texto: string }) {
  const toast = useToast();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
      <code className="min-w-0 flex-1 truncate text-[13px] text-ink">{texto}</code>
      <button
        onClick={() => navigator.clipboard.writeText(texto).then(() => toast("Copiado.", "success"))}
        className="rounded-lg p-1.5 text-muted hover:bg-card hover:text-ink"
        aria-label="Copiar"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}

const FALE_COM_ADMIN = "Fale com o administrador do Radar.";

export function SettingsView({ status, uso, onRecarregar }: { status: StatusResponse | null; uso: Uso | null; onRecarregar: () => Promise<void> }) {
  const toast = useToast();
  const [carregando, setCarregando] = useState(false);

  async function recarregar() {
    setCarregando(true);
    await onRecarregar();
    setCarregando(false);
    toast("Status atualizado.", "info");
  }

  const p = status?.planilha;
  const u = uso ?? status?.uso ?? null;
  const trava = status?.disparo?.trava;
  const travaChaveErrada = Boolean(trava?.chaveErradaEm && (!trava.ultimaEm || trava.chaveErradaEm > trava.ultimaEm));

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Configuração</p>
          <h1 className="display mt-3 text-[32px] text-strong sm:text-4xl">
            Status das <span className="texto-marca">integrações</span>
          </h1>
          <p className="mt-2 max-w-2xl text-[15px] text-muted">Tudo o que o Radar usa, em um só lugar.</p>
        </div>
        <Button variant="outline" className="self-start sm:self-auto" onClick={recarregar} loading={carregando} icon={<RefreshCw className="size-4" />}>
          Atualizar
        </Button>
      </header>

      {status?.simulacao && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Modo de demonstração.</b> Buscas e envios usam dados fictícios.
          </span>
        </div>
      )}

      {!status ? (
        <Card className="space-y-5 p-5 sm:p-7">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="skeleton size-10 shrink-0 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-3 w-3/4 rounded" />
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <>
          <Card className="stagger divide-y divide-line p-5 sm:p-7">
            <Item situacao="ok" rotulo="Ativo" icon={<KeyRound className="size-5" />} titulo="Acesso">
              <p>Protegido por senha da equipe.</p>
            </Item>

            <Item situacao={status.places.configurada ? "ok" : "erro"} icon={<Map className="size-5" />} titulo="Google Maps">
              <p>
                {status.places.configurada
                  ? `Busca de estabelecimentos ativa (até ${status.limites.maxConsultasPorBusca} consultas por busca).`
                  : `A busca ainda não está configurada. ${FALE_COM_ADMIN}`}
              </p>
            </Item>

            {u && (
              <Item
                situacao={u.restantes <= 0 ? "erro" : u.restantes / Math.max(1, u.limite) < 0.15 ? "atencao" : "ok"}
                rotulo={u.restantes <= 0 ? "Esgotadas" : `${u.restantes.toLocaleString("pt-BR")} disponíveis`}
                icon={<Gauge className="size-5" />}
                titulo="Consultas grátis do mês"
              >
                <p>
                  <b className="text-ink tabular-nums">{u.restantes.toLocaleString("pt-BR")}</b> de {u.limite.toLocaleString("pt-BR")} disponíveis.
                  Renovam {formatarRenovacao(u.renovaEm)}.
                </p>
                {u.bloquear && <p>Quando acabam, as buscas pausam até a renovação, sem cobrança.</p>}
              </Item>
            )}

            <Item situacao={p?.ok ? "ok" : p?.configurada ? "atencao" : "erro"} icon={<Table2 className="size-5" />} titulo="Planilha de leads">
              {p?.ok ? (
                <p>
                  Conectada a <b className="text-ink">{p.titulo}</b>, com{" "}
                  <b className="text-ink tabular-nums">{(p.telefonesUnicos ?? 0).toLocaleString("pt-BR")}</b>{" "}
                  {(p.telefonesUnicos ?? 0) === 1 ? "contato" : "contatos"}. Quem já está nela nunca recebe mensagem repetida.
                </p>
              ) : (
                <p>
                  {p?.configurada ? "Não foi possível acessar a planilha." : "A planilha ainda não está configurada."} {FALE_COM_ADMIN}
                </p>
              )}
              {p?.planilhaUrl && (
                <a href={p.planilhaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline">
                  Abrir planilha <ExternalLink className="size-3.5" />
                </a>
              )}
            </Item>

            <Item situacao={status.disparo?.configurado ? "ok" : "erro"} icon={<Send className="size-5" />} titulo="Disparo da Carol">
              <p>
                {status.disparo?.configurado
                  ? `Envio pelo WhatsApp ativo, com limite de ${status.disparo.limiteDiario} mensagens por dia.`
                  : `O disparo ainda não está configurado. ${FALE_COM_ADMIN}`}
              </p>
            </Item>

            {status.disparo?.configurado && (
              <Item
                situacao={travaChaveErrada ? "erro" : trava?.ultimaEm ? "ok" : "atencao"}
                rotulo={travaChaveErrada ? "Precisa de ajuste" : trava?.ultimaEm ? "Ativo" : "Aguardando disparo"}
                icon={<ShieldCheck className="size-5" />}
                titulo="Pausar e cancelar envios"
              >
                <p>
                  {travaChaveErrada
                    ? `O controle de pausa precisa ser atualizado. ${FALE_COM_ADMIN}`
                    : trava?.ultimaEm
                      ? `Ativo: você pode pausar ou cancelar um disparo a qualquer momento (última verificação às ${horaBrasilia(trava.ultimaEm)}).`
                      : "Será confirmado automaticamente no próximo disparo."}
                </p>
              </Item>
            )}

            <Item
              situacao={status.chatwoot?.url ? "ok" : "erro"}
              rotulo={status.chatwoot?.url ? "Ativo" : "Não configurado"}
              icon={<Headset className="size-5" />}
              titulo="Atendimento (Chatwoot)"
            >
              <p>
                {status.chatwoot?.url
                  ? status.chatwoot.apiLigada
                    ? "O botão Atendimento abre o Chatwoot e o botão Atender vai direto na conversa do contato."
                    : "O botão Atendimento abre o Chatwoot. Em Atender, o telefone do contato é copiado para você colar na busca."
                  : `O atalho do atendimento ainda não está configurado. ${FALE_COM_ADMIN}`}
              </p>
            </Item>
          </Card>

          {/* Só para quem configura o Radar: fechado por padrão. */}
          <details className="rounded-2xl border border-line bg-card px-5 py-4 text-sm text-muted">
            <summary className="cursor-pointer font-semibold text-ink">Área do administrador</summary>
            <div className="mt-4 space-y-5">
              {p?.contaServico && (
                <div>
                  <p className="mb-1.5">Compartilhe a planilha como Editor com este e-mail:</p>
                  <Copiavel texto={p.contaServico} />
                </div>
              )}
              {p?.erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{p.erro}</p>}
              {p?.colunasFaltando && p.colunasFaltando.length > 0 && (
                <p className="text-red-700">Colunas que faltam na planilha: {p.colunasFaltando.join(", ")}.</p>
              )}
              {status.disparo?.configurado && (
                <div>
                  <p className="mb-1.5">Controle de pausa no fluxo de disparo (n8n):</p>
                  <InstalarTrava />
                </div>
              )}
              <p className="text-xs">Chaves e endereços ficam no servidor (EasyPanel). O passo a passo completo está em docs/SETUP.md no repositório.</p>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
