"use client";

import { AlertTriangle, CheckCircle2, Copy, ExternalLink, FlaskConical, Gauge, KeyRound, Map, RefreshCw, Send, Table2, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card, cx } from "@/components/ui";
import { formatarRenovacao } from "@/lib/periodo";
import type { Uso } from "@/lib/types";

import { FonteDoUso } from "./UsoCota";

export interface StatusResponse {
  simulacao: boolean;
  places: { configurada: boolean };
  uso?: Uso;
  projetoGoogle?: string;
  disparo?: { configurado: boolean; destino: string; limiteDiario: number };
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

const OBRIGATORIAS = ["telefone", "nome", "tipo", "cidade", "status"];

function Linha({ ok, titulo, children, icon }: { ok: boolean | "aviso"; titulo: string; children?: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex gap-4 py-5 first:pt-0 last:pb-0">
      <div
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-xl",
          ok === true ? "bg-emerald-50 text-emerald-600" : ok === "aviso" ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600",
        )}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-bold text-ink">
          {titulo}
          {ok === true ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : ok === "aviso" ? (
            <AlertTriangle className="size-4 text-amber-500" />
          ) : (
            <XCircle className="size-4 text-red-500" />
          )}
        </p>
        <div className="mt-1 space-y-2 text-sm text-muted">{children}</div>
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
        className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-ink"
        aria-label="Copiar"
      >
        <Copy className="size-4" />
      </button>
    </div>
  );
}

export function SettingsView({ status, uso, onRecarregar }: { status: StatusResponse | null; uso: Uso | null; onRecarregar: () => Promise<void> }) {
  const toast = useToast();
  const [carregando, setCarregando] = useState(false);

  async function recarregar() {
    setCarregando(true);
    await onRecarregar();
    setCarregando(false);
    toast("Conexões conferidas de novo.", "info");
  }

  const p = status?.planilha;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Configuração</p>
          <h1 className="display mt-3 text-4xl text-navy">
            Motor do Radar: <span className="text-brand">tudo ligado?</span>
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Checagem rápida: Google, planilha e Carol conversando entre si. Verde é tudo certo. As chaves ficam guardadas no servidor
            (EasyPanel → serviço radar → Ambiente); depois de mudar alguma, clique em Implantar.
          </p>
        </div>
        <Button variant="outline" onClick={recarregar} loading={carregando} icon={<RefreshCw className="size-4" />}>
          Conferir de novo
        </Button>
      </header>

      {status?.simulacao && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Modo simulação ligado.</b> As buscas e os envios usam dados de mentira e uma planilha de teste. No servidor de verdade esse
            modo fica sempre desligado.
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
        <Card className="stagger divide-y divide-line p-5 sm:p-7">
          <Linha ok icon={<KeyRound className="size-5" />} titulo="Senha de acesso">
            <p>Ativa. Para trocar, mude APP_PASSWORD no EasyPanel e clique em Implantar. Quem estiver dentro vai precisar entrar de novo.</p>
          </Linha>

          <Linha ok={status.places.configurada} icon={<Map className="size-5" />} titulo="Busca no Google Maps">
            {status.places.configurada ? (
              <p>
                Conectada. Uma busca pode gastar no máximo <b className="text-ink">{status.limites.maxConsultasPorBusca}</b> consultas
                (MAX_REQUESTS_PER_SEARCH).
              </p>
            ) : (
              <p>
                Falta a chave do Google Maps (<code className="rounded bg-surface px-1.5 py-0.5 text-ink">GOOGLE_MAPS_API_KEY</code>). No Google
                Cloud, ative a &quot;Places API (New)&quot;, crie a chave e cole no EasyPanel.
              </p>
            )}
          </Linha>

          {(() => {
            const u = uso ?? status.uso;
            if (!u) return null;
            return (
              <Linha ok={u.fonte === "radar" ? "aviso" : true} icon={<Gauge className="size-5" />} titulo="Contador de consultas grátis">
                <p>
                  <b className="text-ink tabular-nums">{u.restantes.toLocaleString("pt-BR")}</b> de {u.limite.toLocaleString("pt-BR")} restantes
                  neste mês. Renova {formatarRenovacao(u.renovaEm)} (horário de Brasília).
                </p>
                <FonteDoUso uso={u} />
                {u.fonte === "google" && status.projetoGoogle && (
                  <p>
                    Lendo o uso real do projeto <b className="text-ink">{status.projetoGoogle}</b> no Google Cloud (inclui buscas feitas por outros
                    sistemas do mesmo projeto).
                  </p>
                )}
                {u.fonte === "radar" && p?.contaServico && (
                  <div>
                    <p className="mb-1.5">
                      Para o número exato: Google Cloud → IAM e administrador → IAM → <b className="text-ink">Conceder acesso</b> para este e-mail
                      com o papel <b className="text-ink">Visualizador de monitoramento</b>:
                    </p>
                    <Copiavel texto={p.contaServico} />
                  </div>
                )}
                <p>
                  {u.bloquear
                    ? "Quando as consultas grátis acabam, o Radar para de buscar até a renovação, então nada é cobrado."
                    : "O bloqueio está desligado (BLOQUEAR_NO_LIMITE=0): passando do limite, o Google cobra cerca de US$ 35 a cada 1.000 consultas."}
                </p>
              </Linha>
            );
          })()}

          <Linha ok={p?.ok ? true : p?.configurada ? "aviso" : false} icon={<Table2 className="size-5" />} titulo="Planilha">
            {p?.contaServico && (
              <div>
                <p className="mb-1.5">
                  A planilha precisa estar compartilhada com este e-mail como <b className="text-ink">Editor</b>:
                </p>
                <Copiavel texto={p.contaServico} />
              </div>
            )}
            {!p?.configurada && (
              <p>
                Falta a chave da conta de serviço do Google (
                <code className="rounded bg-surface px-1.5 py-0.5 text-ink">GOOGLE_SERVICE_ACCOUNT_JSON</code>).
              </p>
            )}
            {p?.erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{p.erro}</p>}
            {p?.titulo && (
              <p>
                Conectada a <b className="text-ink">{p.titulo}</b>, aba <b className="text-ink">{p.aba}</b>:{" "}
                <span className="tabular-nums">{(p.linhas ?? 0).toLocaleString("pt-BR")}</span> linhas,{" "}
                <span className="tabular-nums">{(p.telefonesUnicos ?? 0).toLocaleString("pt-BR")}</span> telefones diferentes,{" "}
                <span className="tabular-nums">{p.optout ?? 0}</span> {(p.optout ?? 0) === 1 ? "pediu" : "pediram"} para não receber mensagens.
              </p>
            )}
            {p?.cabecalhos && (
              <div className="flex flex-wrap gap-1.5">
                {OBRIGATORIAS.map((c) => (
                  <Badge key={c} tone={p.colunasFaltando?.includes(c) ? "red" : "green"}>
                    {c}
                  </Badge>
                ))}
                {p.cabecalhos
                  .filter((h) => !OBRIGATORIAS.includes(h.trim().toLowerCase()))
                  .map((h) => (
                    <Badge key={h} tone="gray">
                      {h}
                    </Badge>
                  ))}
              </div>
            )}
            <p>
              Os contatos novos entram com status <b className="text-ink">{p?.statusPadrao}</b> (é assim que a Carol sabe quem chamar). Também não
              são enviados de novo os telefones que aparecem nas abas{" "}
              <b className="text-ink">{p?.abasExtrasLidas?.length ? p.abasExtrasLidas.join(", ") : "—"}</b>
              {p?.extraTelefones ? ` (${p.extraTelefones.toLocaleString("pt-BR")} telefones)` : ""}.
            </p>
            {p?.extraErro && <p className="text-amber-700">Abas de histórico (DEDUP_EXTRA_TABS) {p.extraErro}</p>}
            {p?.planilhaUrl && (
              <a href={p.planilhaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline">
                Abrir planilha <ExternalLink className="size-3.5" />
              </a>
            )}
          </Linha>

          <Linha ok={status.disparo?.configurado ? true : "aviso"} icon={<Send className="size-5" />} titulo="Disparo da Carol (n8n)">
            {status.disparo?.configurado ? (
              <p>
                Ligado ao n8n em <b className="text-ink">{status.disparo.destino}</b>. O botão da tela Disparo chama o Fluxo 1, que manda a
                primeira mensagem para quem está pendente.
                {status.disparo.limiteDiario > 0 && ` Limite da Carol: ${status.disparo.limiteDiario} por dia.`}
              </p>
            ) : (
              <p>
                Ainda não ligado. O passo a passo (com o botão que copia o nó para o n8n) está na tela <b className="text-ink">Disparo</b>.
              </p>
            )}
          </Linha>
        </Card>
      )}
    </div>
  );
}
