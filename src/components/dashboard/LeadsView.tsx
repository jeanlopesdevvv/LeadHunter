"use client";

import { AlertTriangle, Ban, CheckCircle2, Clock, ListChecks, MessageCircle, Pencil, RefreshCw, Search, Send, Trash2, Undo2, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "@/components/toast";
import { Button, Card, Field, Modal, Toggle, cx, inputClass } from "@/components/ui";
import { STATUS_EDITAVEIS, TIPOS_LEAD, situacaoDoLead, type SituacaoLead, type StatusEditavel } from "@/lib/banco-regras";
import { api } from "@/lib/client/api";
import { lerDataHora } from "@/lib/disparo-regras";
import { quandoCurto } from "@/lib/periodo";
import { normalizePhone, whatsappLink } from "@/lib/phone";

/**
 * Tela "Leads": a lista de contatos da Carol (antes a aba leads da planilha).
 * Ver, procurar, corrigir nome/cidade/tipo, mudar a situação e tirar alguém da lista,
 * sem abrir planilha nenhuma. Só funciona com a lista no banco.
 */

interface LeadDaLista {
  telefone: string;
  nome: string;
  tipo: string;
  cidade: string;
  status: string;
  mensagem_enviada_em: string;
  optout: string;
  template: string;
  ordem: number;
  atualizado_em: string;
}

const INFO: Record<SituacaoLead, { rotulo: string; icone: typeof Send; selo: string; dica: string }> = {
  fila: { rotulo: "Na fila", icone: Clock, selo: "bg-brand-50 text-brand-700 ring-brand-200", dica: "Ainda não recebeu: aparece no Disparo" },
  enviado: { rotulo: "Enviado", icone: CheckCircle2, selo: "bg-emerald-50 text-emerald-700 ring-emerald-200", dica: "A Carol já mandou a mensagem" },
  sem_whatsapp: { rotulo: "Sem WhatsApp", icone: XCircle, selo: "bg-slate-100 text-slate-600 ring-slate-200", dica: "O número não tem WhatsApp (ou o Meta recusou)" },
  nao_quer: { rotulo: "Não quer contato", icone: Ban, selo: "bg-red-50 text-red-700 ring-red-200", dica: "Pediu para não receber mensagens: a Carol nunca manda de novo" },
  fora: { rotulo: "Fora da lista", icone: Trash2, selo: "bg-slate-100 text-slate-500 ring-slate-200", dica: "Tirado da lista: não recebe mensagem e não volta nas buscas" },
  outro: { rotulo: "Outro", icone: ListChecks, selo: "bg-amber-50 text-amber-700 ring-amber-200", dica: "Situação fora do padrão" },
};
const ORDEM: SituacaoLead[] = ["fila", "enviado", "sem_whatsapp", "nao_quer", "outro", "fora"];
type Filtro = "todos" | SituacaoLead;

function Selo({ s }: { s: SituacaoLead }) {
  const i = INFO[s];
  const Icone = i.icone;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ring-1 ring-inset", i.selo)} title={i.dica}>
      <Icone className="size-3" /> {i.rotulo}
    </span>
  );
}

/** Ao voltar para a lista: quem já recebeu volta como recebido; quem não recebeu volta para a fila. */
function statusAoVoltar(l: LeadDaLista): StatusEditavel {
  const m = l.mensagem_enviada_em.trim();
  if (!m) return "aguardando";
  return /erro/i.test(m) ? "sem_whatsapp" : "enviado";
}

function quandoEnviado(l: LeadDaLista): string {
  const t = lerDataHora(l.mensagem_enviada_em);
  return t ? quandoCurto(t) : "—";
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

interface Formulario {
  nome: string;
  tipo: string;
  cidade: string;
  status: StatusEditavel | "";
  optout: boolean;
}

export function LeadsView() {
  const toast = useToast();
  const [leads, setLeads] = useState<LeadDaLista[] | null>(null);
  const [fonte, setFonte] = useState<"banco" | "planilha" | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<LeadDaLista | null>(null);
  const [form, setForm] = useState<Formulario>({ nome: "", tipo: "", cidade: "", status: "", optout: false });
  const [salvando, setSalvando] = useState(false);
  const pedido = useRef(0);

  const carregar = useCallback(async () => {
    const meu = ++pedido.current;
    setCarregando(true);
    try {
      const r = await api<{ fonte: "banco" | "planilha"; leads: LeadDaLista[] }>("/api/leads");
      if (meu !== pedido.current) return;
      setFonte(r.fonte);
      setLeads(r.leads);
      setErro("");
    } catch (e) {
      if (meu === pedido.current) setErro((e as Error).message);
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(t);
  }, [carregar]);

  const comSituacao = useMemo(() => (leads ?? []).map((l) => ({ ...l, situacao: situacaoDoLead(l) })), [leads]);
  const contagem = useMemo(() => {
    const c = Object.fromEntries(ORDEM.map((s) => [s, 0])) as Record<SituacaoLead, number>;
    for (const l of comSituacao) c[l.situacao]++;
    return c;
  }, [comSituacao]);
  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const digitos = busca.replace(/\D/g, "");
    return comSituacao.filter((l) => {
      if (filtro === "todos" ? l.situacao === "fora" : l.situacao !== filtro) return false;
      if (!q) return true;
      return semAcento(`${l.nome} ${l.cidade} ${l.tipo}`).includes(q) || (digitos.length >= 3 && l.telefone.includes(digitos));
    });
  }, [comSituacao, filtro, busca]);

  function abrir(l: LeadDaLista) {
    const s = l.status.trim().toLowerCase();
    setForm({
      nome: l.nome,
      tipo: l.tipo,
      cidade: l.cidade,
      status: (Object.prototype.hasOwnProperty.call(STATUS_EDITAVEIS, s) ? s : "") as StatusEditavel | "",
      optout: situacaoDoLead({ status: "", optout: l.optout }) === "nao_quer",
    });
    setEditando(l);
  }

  async function salvar(extra?: Partial<Formulario>) {
    if (!editando) return;
    const f = { ...form, ...extra };
    const corpo: Record<string, unknown> = { telefone: editando.telefone };
    if (f.nome.trim() !== editando.nome) corpo.nome = f.nome;
    if (f.cidade.trim() !== editando.cidade) corpo.cidade = f.cidade;
    if (f.tipo && f.tipo !== editando.tipo) corpo.tipo = f.tipo;
    if (f.status && f.status !== editando.status.trim().toLowerCase()) corpo.status = f.status;
    const optoutAtual = situacaoDoLead({ status: "", optout: editando.optout }) === "nao_quer";
    if (f.optout !== optoutAtual) corpo.optout = f.optout;
    if (Object.keys(corpo).length === 1) {
      setEditando(null);
      return;
    }
    setSalvando(true);
    try {
      const r = await api<{ lead: LeadDaLista }>("/api/leads", corpo, { method: "PATCH" });
      setLeads((atual) => (atual ?? []).map((l) => (l.telefone === r.lead.telefone ? r.lead : l)));
      setEditando(null);
      toast(f.status === "removido" ? "Contato tirado da lista." : "Contato atualizado.", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSalvando(false);
    }
  }

  const filtros: Filtro[] = ["todos", ...ORDEM];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Lista de leads</p>
          <h1 className="display mt-3 text-[32px] text-strong sm:text-5xl">
            Todos os contatos <span className="texto-marca">da Carol.</span>
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
            Corrija nome, cidade e tipo, mude a situação ou tire alguém da lista. É aqui que se mexe na lista agora, sem planilha.
          </p>
        </div>
        <Button variant="outline" onClick={() => void carregar()} loading={carregando} icon={<RefreshCw className="size-4" />}>
          Atualizar
        </Button>
      </header>

      {erro && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            <b>Não foi possível carregar a lista agora.</b> {erro}
          </span>
        </div>
      )}

      {fonte === "planilha" ? (
        <Card className="p-6 text-sm text-muted">A lista de leads ainda está na planilha do Google. Esta tela funciona quando a lista está no banco do Lavacar.</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {filtros.map((id) => {
                const qtd = id === "todos" ? comSituacao.length - contagem.fora : contagem[id];
                if (id !== "todos" && !qtd && id !== filtro) return null;
                return (
                  <button
                    key={id}
                    onClick={() => setFiltro(id)}
                    className={cx(
                      "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                      filtro === id ? "border-navy bg-navy text-white" : "border-line bg-card text-muted hover:text-ink",
                    )}
                  >
                    {id === "todos" ? "Todos" : INFO[id].rotulo} <span className="tabular-nums opacity-70">{qtd}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative lg:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, cidade ou telefone…" className={cx(inputClass, "pl-9")} />
            </div>
          </div>

          {!leads ? (
            <div className="space-y-2 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-12 rounded-lg" />
              ))}
            </div>
          ) : !lista.length ? (
            <p className="px-6 py-12 text-center text-sm text-muted">
              {comSituacao.length ? "Ninguém nesta situação." : "A lista está vazia. Mande contatos na tela Oportunidades e eles aparecem aqui."}
            </p>
          ) : (
            <>
              {/* Cartões (celular) */}
              <ul className="divide-y divide-line md:hidden">
                {lista.slice(0, 500).map((l) => (
                  <li key={l.telefone} className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{l.nome || "(sem nome)"}</p>
                        <p className="truncate text-xs text-muted">
                          {normalizePhone(l.telefone).display || l.telefone}
                          {l.cidade && ` · ${l.cidade}`}
                          {l.tipo && ` · ${l.tipo}`}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => abrir(l)} icon={<Pencil className="size-3.5" />}>
                        Editar
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Selo s={l.situacao} />
                      {l.mensagem_enviada_em && <span className="text-[11px] text-muted">disparo {quandoEnviado(l)}</span>}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Tabela (computador) */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="text-[11px] font-bold tracking-wider text-muted uppercase">
                    <tr className="border-b border-line">
                      <th className="px-4 py-3">Contato</th>
                      <th className="px-4 py-3">Cidade</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Situação</th>
                      <th className="px-4 py-3">Disparo</th>
                      <th className="px-4 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lista.slice(0, 500).map((l) => (
                      <tr key={l.telefone} className="border-b border-line/70 align-top last:border-0 hover:bg-surface/70">
                        <td className="max-w-[280px] px-4 py-3">
                          <p className="truncate font-semibold text-ink">{l.nome || "(sem nome)"}</p>
                          <p className="truncate text-xs text-muted">{normalizePhone(l.telefone).display || l.telefone}</p>
                        </td>
                        <td className="px-4 py-3 text-muted">{l.cidade || "—"}</td>
                        <td className="px-4 py-3 text-muted">{l.tipo || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Selo s={l.situacao} />
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-muted">{quandoEnviado(l)}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <a
                            href={whatsappLink(l.telefone)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex rounded-lg p-1.5 text-muted transition hover:bg-emerald-50 hover:text-emerald-600"
                            title="Abrir no WhatsApp"
                          >
                            <MessageCircle className="size-4" />
                          </a>
                          <Button size="sm" variant="ghost" onClick={() => abrir(l)} icon={<Pencil className="size-3.5" />}>
                            Editar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}

      <Modal open={Boolean(editando)} onClose={() => !salvando && setEditando(null)} title="Editar contato">
        {editando && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void salvar();
            }}
          >
            <p className="text-sm text-muted">
              {normalizePhone(editando.telefone).display || editando.telefone}
              {editando.mensagem_enviada_em && <> · disparo {quandoEnviado(editando)}</>}
            </p>
            <Field label="Nome" htmlFor="lead-nome">
              <input id="lead-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={inputClass} maxLength={120} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Cidade" htmlFor="lead-cidade">
                <input id="lead-cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className={inputClass} maxLength={120} />
              </Field>
              <Field label="Tipo" htmlFor="lead-tipo" hint="Define a mensagem automática do disparo">
                <select id="lead-tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className={inputClass}>
                  {!TIPOS_LEAD.includes(form.tipo as (typeof TIPOS_LEAD)[number]) && <option value={form.tipo}>{form.tipo || "—"}</option>}
                  {TIPOS_LEAD.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Situação" htmlFor="lead-status" hint="Quem está na fila aparece na tela Disparo">
              <select
                id="lead-status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as StatusEditavel })}
                className={inputClass}
              >
                {!form.status && <option value="">{editando.status || "—"}</option>}
                {(Object.keys(STATUS_EDITAVEIS) as StatusEditavel[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_EDITAVEIS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Toggle
              checked={form.optout}
              onChange={(v) => setForm({ ...form, optout: v })}
              label="Não quer receber mensagens"
              hint="A Carol nunca manda disparo para quem está marcado aqui (o botão “Não tenho interesse” marca sozinho)."
            />
            <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              {editando.status.trim().toLowerCase() === "removido" ? (
                <Button type="button" variant="ghost" disabled={salvando} onClick={() => void salvar({ status: statusAoVoltar(editando) })} icon={<Undo2 className="size-4" />}>
                  Voltar para a lista
                </Button>
              ) : (
                <Button type="button" variant="danger" disabled={salvando} onClick={() => void salvar({ status: "removido" })} icon={<Trash2 className="size-4" />}>
                  Tirar da lista
                </Button>
              )}
              <div className="flex gap-2 sm:justify-end">
                <Button type="button" variant="ghost" disabled={salvando} onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
                <Button type="submit" loading={salvando}>
                  Salvar
                </Button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
