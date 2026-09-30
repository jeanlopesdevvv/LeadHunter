"use client";

import { ArrowRight, Building2, CheckCircle2, ExternalLink, Info, Phone, Send, ShieldCheck, Smartphone, Table2, User } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { AnimatedNumber } from "@/components/motion";
import { useToast } from "@/components/toast";
import { Badge, Button, Modal, cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { normalizePhone } from "@/lib/phone";
import type { CheckResult, Lead, SendResult } from "@/lib/types";

const MOTIVOS: Record<string, string> = {
  ja_na_planilha: "já estavam na planilha",
  optout: "pediram para não receber mensagens",
  repetido_no_lote: "estavam repetidos nesta lista",
  telefone_invalido: "tinham telefone inválido",
  bloqueado: "são números bloqueados (ex.: o próprio Lavacar)",
};

const n = (v: number) => v.toLocaleString("pt-BR");

function telefone(t: string) {
  return normalizePhone(t).display || t;
}

function Metrica({ rotulo, valor, icone, tom = "ink" }: { rotulo: string; valor: number; icone: ReactNode; tom?: "ink" | "green" | "amber" | "muted" }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
        {icone}
        {rotulo}
      </div>
      <AnimatedNumber
        value={valor}
        className={cx(
          "mt-1 block text-2xl font-extrabold tracking-tight",
          tom === "green" ? "text-emerald-600" : tom === "amber" ? "text-amber-600" : tom === "muted" ? "text-muted" : "text-navy",
        )}
      />
    </div>
  );
}

export function SendDialog({
  aberto,
  onFechar,
  leads,
  check,
  onEnviado,
  onDisparar,
}: {
  aberto: boolean;
  onFechar: () => void;
  leads: Lead[];
  check?: CheckResult;
  onEnviado: (r: SendResult) => void;
  disparoConfigurado: boolean;
  /** Vai para a tela Disparo com estes telefones já marcados (sem disparar). */
  onDisparar: (keys: string[]) => void;
}) {
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<SendResult | null>(null);
  const [enviadoEm, setEnviadoEm] = useState<Date | null>(null);

  const aba = check?.aba ?? "leads";
  const status = check?.statusPadrao ?? "pendente";
  const contagem = useMemo(
    () => ({
      celulares: leads.filter((l) => l.telefoneTipo === "celular").length,
      fixos: leads.filter((l) => l.telefoneTipo === "fixo").length,
      empresas: leads.filter((l) => l.tipo === "Empresa").length,
      autonomos: leads.filter((l) => l.tipo === "Autônomo").length,
    }),
    [leads],
  );
  const porChave = useMemo(() => new Map(leads.map((l) => [normalizePhone(l.telefone).key || l.telefoneKey, l])), [leads]);

  function fechar() {
    if (enviando) return;
    setResultado(null);
    onFechar();
  }

  async function enviar() {
    setEnviando(true);
    // Mesmo id em todas as tentativas: se a conexão cair, repetir é seguro (o servidor devolve o mesmo resultado).
    const lote = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `l${Date.now()}${Math.random().toString(36).slice(2)}`;
    try {
      const r = await api<SendResult>(
        "/api/sheets/send",
        {
          lote,
          leads: leads.map((l) => ({
            telefone: l.telefone,
            nome: l.nome,
            tipo: l.tipo,
            cidade: l.cidade,
            endereco: l.endereco,
            bairro: l.bairro,
            uf: l.uf,
            site: l.site,
            mapsUrl: l.mapsUrl,
            nota: l.nota,
            avaliacoes: l.avaliacoes,
            categoria: l.categoria,
            placeId: l.id,
            termo: l.termo,
          })),
        },
        { tentativas: 3 },
      );
      setResultado(r);
      setEnviadoEm(new Date());
      onEnviado(r);
      toast(
        r.adicionados.length
          ? `${n(r.adicionados.length)} ${r.adicionados.length === 1 ? "contato adicionado" : "contatos adicionados"} à planilha.`
          : "Nenhum contato novo: todos já estavam na planilha.",
        r.adicionados.length ? "success" : "info",
      );
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const ignoradosPorMotivo = resultado
    ? Object.entries(
        resultado.ignorados.reduce<Record<string, number>>((acc, i) => {
          acc[i.motivo ?? "outro"] = (acc[i.motivo ?? "outro"] ?? 0) + 1;
          return acc;
        }, {}),
      )
    : [];

  const titulo = resultado
    ? resultado.adicionados.length
      ? "Envio concluído"
      : "Nenhum contato novo"
    : `Enviar ${n(leads.length)} ${leads.length === 1 ? "contato" : "contatos"} para a planilha`;

  return (
    <Modal open={aberto} onClose={fechar} title={titulo} wide>
      {!resultado ? (
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface/70 px-4 py-3.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand ring-1 ring-line">
              <Table2 className="size-4.5" />
            </div>
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink">
                Destino: aba <span className="font-mono text-[13px]">{aba}</span>, status <span className="font-mono text-[13px]">{status}</span>
              </p>
              <p className="mt-0.5 text-muted">
                Os contatos entram no fim da aba. Na hora de gravar, o Radar confere a planilha de novo e pula quem já estiver lá.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Metrica rotulo="Contatos" valor={leads.length} icone={<User className="size-3.5" />} />
            <Metrica rotulo="Celulares" valor={contagem.celulares} icone={<Smartphone className="size-3.5" />} tom="green" />
            <Metrica rotulo="Fixos" valor={contagem.fixos} icone={<Phone className="size-3.5" />} tom={contagem.fixos ? "amber" : "muted"} />
            <div className="rounded-xl border border-line bg-white px-3.5 py-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted uppercase">
                <Building2 className="size-3.5" />
                Perfil
              </div>
              <p className="mt-1.5 text-sm text-ink">
                <b className="tabular-nums">{n(contagem.empresas)}</b> empresas
              </p>
              <p className="text-sm text-ink">
                <b className="tabular-nums">{n(contagem.autonomos)}</b> autônomos
              </p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Prévia</p>
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface text-[11px] font-semibold tracking-wide text-muted uppercase">
                  <tr>
                    <th className="px-3.5 py-2">Estabelecimento</th>
                    <th className="px-3.5 py-2">Telefone</th>
                    <th className="hidden px-3.5 py-2 sm:table-cell">Tipo</th>
                    <th className="hidden px-3.5 py-2 sm:table-cell">Cidade</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 6).map((l) => (
                    <tr key={l.id} className="border-t border-line">
                      <td className="max-w-[240px] truncate px-3.5 py-2.5 font-medium text-ink">{l.nome}</td>
                      <td className="px-3.5 py-2.5 whitespace-nowrap text-ink tabular-nums">
                        {l.telefoneExibicao}
                        {l.telefoneTipo === "fixo" && <span className="ml-1.5 text-[11px] font-semibold text-amber-600">fixo</span>}
                      </td>
                      <td className="hidden px-3.5 py-2.5 text-muted sm:table-cell">{l.tipo}</td>
                      <td className="hidden px-3.5 py-2.5 whitespace-nowrap text-muted sm:table-cell">{l.cidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {leads.length > 6 && (
                <p className="border-t border-line bg-surface/60 px-3.5 py-2 text-xs text-muted">
                  e mais {n(leads.length - 6)} {leads.length - 6 === 1 ? "contato" : "contatos"}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5 text-emerald-600" /> Nenhuma mensagem é enviada nesta etapa.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="ghost" onClick={fechar} disabled={enviando}>
                Cancelar
              </Button>
              <Button onClick={enviar} loading={enviando} icon={<Send className="size-4" />} disabled={!leads.length}>
                {enviando ? "Gravando na planilha…" : `Enviar ${n(leads.length)} ${leads.length === 1 ? "contato" : "contatos"}`}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <div
              className={cx(
                "grid size-12 shrink-0 animate-pop-in place-items-center rounded-full",
                resultado.adicionados.length ? "bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60" : "bg-surface text-muted",
              )}
            >
              {resultado.adicionados.length ? <CheckCircle2 className="size-6" /> : <Info className="size-6" />}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold text-ink">
                {resultado.adicionados.length ? (
                  <>
                    <AnimatedNumber value={resultado.adicionados.length} />{" "}
                    {resultado.adicionados.length === 1 ? "contato adicionado à planilha" : "contatos adicionados à planilha"}
                  </>
                ) : (
                  "Todos já estavam na planilha"
                )}
              </p>
              <p className="text-sm text-muted">
                Aba <span className="font-mono text-[13px]">{resultado.aba}</span> · status <span className="font-mono text-[13px]">{status}</span>
                {enviadoEm && ` · ${enviadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Metrica rotulo="Adicionados" valor={resultado.adicionados.length} icone={<CheckCircle2 className="size-3.5" />} tom="green" />
            <Metrica rotulo="Ignorados" valor={resultado.ignorados.length} icone={<ShieldCheck className="size-3.5" />} tom="muted" />
          </div>

          {ignoradosPorMotivo.length > 0 && (
            <div className="rounded-xl border border-line px-4 py-3 text-sm">
              <p className="font-semibold text-ink">Por que alguns ficaram de fora</p>
              <ul className="mt-1 space-y-0.5 text-muted">
                {ignoradosPorMotivo.map(([motivo, qtd]) => (
                  <li key={motivo}>
                    <b className="text-ink tabular-nums">{n(qtd)}</b> {MOTIVOS[motivo] ?? motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {resultado.adicionados.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line">
              <p className="border-b border-line bg-surface/70 px-4 py-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
                Adicionados
              </p>
              <ul className="max-h-56 divide-y divide-line overflow-y-auto">
                {resultado.adicionados.map((a) => {
                  const l = porChave.get(a.key);
                  return (
                    <li key={a.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                      <span className="min-w-0 truncate font-medium text-ink">{a.nome}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {l && <Badge tone="gray">{l.tipo}</Badge>}
                        <span className="text-muted tabular-nums">{telefone(a.telefone)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {resultado.adicionados.length > 0 && (
            <div className="flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3.5 text-sm">
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-brand-700" />
              <p className="text-brand-800">
                <b>Próximo passo:</b> na tela Disparo você revisa a fila (os {n(resultado.adicionados.length)} novos já chegam marcados), ajusta
                quem vai receber e só então dispara. Nada é enviado sem a sua confirmação.
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={fechar}>
              Fechar
            </Button>
            <a
              href={resultado.planilhaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink transition hover:bg-surface"
            >
              <ExternalLink className="size-4" /> Abrir planilha
            </a>
            {resultado.adicionados.length > 0 && (
              <Button
                onClick={() => {
                  const keys = resultado.adicionados.map((a) => a.key);
                  setResultado(null);
                  onDisparar(keys);
                }}
                icon={<ArrowRight className="size-4" />}
              >
                Ir para o Disparo
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
