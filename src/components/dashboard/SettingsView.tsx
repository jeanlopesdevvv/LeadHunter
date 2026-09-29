"use client";

import { AlertTriangle, CheckCircle2, Copy, ExternalLink, FlaskConical, KeyRound, Map, RefreshCw, Table2, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Card, cx } from "@/components/ui";

export interface StatusResponse {
  simulacao: boolean;
  places: { configurada: boolean };
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

export function SettingsView({ status, onRecarregar }: { status: StatusResponse | null; onRecarregar: () => Promise<void> }) {
  const toast = useToast();
  const [carregando, setCarregando] = useState(false);

  async function recarregar() {
    setCarregando(true);
    await onRecarregar();
    setCarregando(false);
    toast("Conexões testadas de novo.", "info");
  }

  const p = status?.planilha;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Configuração</p>
          <h1 className="display mt-3 text-4xl text-navy">
            Conexões <span className="text-brand">do sistema</span>
          </h1>
          <p className="mt-2 text-sm text-muted">Tudo é configurado no arquivo .env do servidor. Veja o passo a passo em docs/SETUP.md.</p>
        </div>
        <Button variant="outline" onClick={recarregar} loading={carregando} icon={<RefreshCw className="size-4" />}>
          Testar de novo
        </Button>
      </header>

      {status?.simulacao && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Modo simulação ligado (MOCK_MODE=1).</b> Buscas e envios usam dados falsos e uma planilha em memória. Esse modo é desligado
            automaticamente em produção.
          </span>
        </div>
      )}

      {!status ? (
        <Card className="p-10 text-center text-sm text-muted">Carregando…</Card>
      ) : (
        <Card className="divide-y divide-line p-5 sm:p-7">
          <Linha ok icon={<KeyRound className="size-5" />} titulo="Senha de acesso">
            <p>Ativa. Para trocar, altere APP_PASSWORD no .env do servidor e reinicie (todas as sessões são encerradas).</p>
          </Linha>

          <Linha ok={status.places.configurada} icon={<Map className="size-5" />} titulo="Google Places API">
            {status.places.configurada ? (
              <p>
                Chave configurada. Limite de <b className="text-ink">{status.limites.maxConsultasPorBusca}</b> consultas por busca
                (MAX_REQUESTS_PER_SEARCH).
              </p>
            ) : (
              <p>
                Falta <code className="rounded bg-surface px-1.5 py-0.5 text-ink">GOOGLE_MAPS_API_KEY</code>. Ative a &quot;Places API (New)&quot;
                no Google Cloud, crie a chave e coloque no .env do servidor.
              </p>
            )}
          </Linha>

          <Linha ok={p?.ok ? true : p?.configurada ? "aviso" : false} icon={<Table2 className="size-5" />} titulo="Planilha (Google Sheets)">
            {p?.contaServico && (
              <div>
                <p className="mb-1.5">Compartilhe a planilha com este e-mail como <b className="text-ink">Editor</b>:</p>
                <div className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                  <code className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.contaServico}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(p.contaServico).then(() => toast("E-mail copiado.", "success"))}
                    className="rounded-lg p-1.5 text-muted hover:bg-white hover:text-ink"
                    aria-label="Copiar e-mail"
                  >
                    <Copy className="size-4" />
                  </button>
                </div>
              </div>
            )}
            {!p?.configurada && (
              <p>
                Falta <code className="rounded bg-surface px-1.5 py-0.5 text-ink">GOOGLE_SERVICE_ACCOUNT_JSON</code> (chave da conta de serviço).
              </p>
            )}
            {p?.erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">{p.erro}</p>}
            {p?.titulo && (
              <p>
                Conectado a <b className="text-ink">{p.titulo}</b> · aba <b className="text-ink">{p.aba}</b> ·{" "}
                <span className="tabular-nums">{p.linhas ?? 0}</span> linhas · <span className="tabular-nums">{p.telefonesUnicos ?? 0}</span> telefones
                únicos · <span className="tabular-nums">{p.optout ?? 0}</span> opt-out
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
              Status gravado nos leads novos: <b className="text-ink">{p?.statusPadrao}</b>. Quem aparece também nas abas{" "}
              <b className="text-ink">{p?.abasExtrasLidas?.length ? p.abasExtrasLidas.join(", ") : "—"}</b> não é reenviado
              {p?.extraTelefones ? ` (${p.extraTelefones} telefones)` : ""}.
            </p>
            {p?.extraErro && <p className="text-amber-700">Abas extras (DEDUP_EXTRA_TABS) {p.extraErro}</p>}
            {p?.planilhaUrl && (
              <a href={p.planilhaUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline">
                Abrir planilha <ExternalLink className="size-3.5" />
              </a>
            )}
          </Linha>
        </Card>
      )}
    </div>
  );
}
