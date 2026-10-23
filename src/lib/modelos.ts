import "server-only";

import { getConfig } from "./env";
import {
  CONTAS,
  ehDaAssistente,
  motivoDaRecusa,
  motivoSemEnvio,
  nomeTecnico,
  payloadMeta,
  validarRascunho,
  type ContaWhatsApp,
  type RascunhoModelo,
} from "./modelos-regras";
import { MODELOS_SIMULACAO, esquecerModelos } from "./templates";
import { analisarTemplate, type ModeloWhatsApp, type TemplateMeta } from "./templates-regras";

/**
 * Aba "Modelos": lê e cria os templates do WhatsApp da Carol e da Sofia na Meta (Graph API).
 * O envio ao cliente fica na aba "📤 Enviar Template" (n8n), que já existia.
 */

export class ModelosError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export interface ModeloDaConta extends ModeloWhatsApp {
  id: string;
  /** Motivo da recusa da Meta, em português (vazio se não foi recusado). */
  recusa: string;
  /** Template da Carol/Sofia (false = da automação: avisos, lembretes, repasses). */
  daAssistente: boolean;
  /** Por que não dá para enviar ao cliente pela aba "📤 Enviar Template" (vazio = dá). */
  semEnvio: string;
}

export interface ListaDaConta {
  conta: ContaWhatsApp;
  configurado: boolean;
  modelos: ModeloDaConta[];
  erro: string;
}

function wabaDe(conta: ContaWhatsApp): string {
  const cfg = getConfig();
  return conta === "carol" ? cfg.metaWabaId : cfg.metaWabaIdSofia;
}

type RespostaMeta = { data?: (TemplateMeta & { rejected_reason?: string })[]; paging?: { next?: string }; id?: string; status?: string; category?: string; error?: { message?: string; code?: number; error_user_title?: string; error_user_msg?: string } };

async function meta(url: string, init?: RequestInit): Promise<{ ok: boolean; json: RespostaMeta }> {
  const cfg = getConfig();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.metaToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as RespostaMeta;
  return { ok: res.ok && !json.error, json };
}

function erroDaMeta(e: RespostaMeta["error"]): string {
  if (!e) return "A Meta não respondeu como esperado. Tente de novo.";
  if (e.code === 190) return "O acesso ao WhatsApp expirou (token da Meta). Fale com o administrador do Radar.";
  if (e.code === 200 || e.code === 10) return "O token da Meta não tem permissão para esta conta do WhatsApp. Fale com o administrador do Radar.";
  const detalhe = [e.error_user_title, e.error_user_msg].filter(Boolean).join(": ") || e.message || "";
  return `A Meta recusou${e.code ? ` (erro ${e.code})` : ""}: ${detalhe}`.trim();
}

function paraTela(t: TemplateMeta & { rejected_reason?: string }, conta: ContaWhatsApp): ModeloDaConta {
  const m = analisarTemplate(t);
  return { ...m, id: String(t.id ?? t.name), recusa: motivoDaRecusa(t.rejected_reason), daAssistente: ehDaAssistente(m.nome, conta), semEnvio: motivoSemEnvio(m, conta) };
}

/** Só na simulação (MOCK_MODE): a conta da Sofia com um de cada situação. */
const SIMULACAO_SOFIA: (TemplateMeta & { rejected_reason?: string })[] = [
  { name: "sofia_retomada_contato", status: "APPROVED", category: "MARKETING", language: "pt_BR", components: [{ type: "BODY", text: "Oi, {{1}}! Aqui é a Sofia, do Lavacar. Podemos retomar de onde paramos?" }] },
  { name: "sofia_aviso_novidade", status: "PENDING", category: "UTILITY", language: "pt_BR", components: [{ type: "BODY", text: "Oi, {{1}}! Temos novidade no app do Lavacar." }] },
  { name: "sofia_promo_recusada", status: "REJECTED", rejected_reason: "INCORRECT_CATEGORY", category: "UTILITY", language: "pt_BR", components: [{ type: "BODY", text: "Oi, {{1}}! Desconto de 20% hoje." }] },
  { name: "alerta_falha_automacao", status: "APPROVED", category: "UTILITY", language: "pt_BR", components: [{ type: "HEADER", format: "TEXT", text: "Falha na automação do Lavacar" }, { type: "BODY", text: "Fluxo: {{1}}\nO que aconteceu: {{2}}" }] },
];

const ORDEM: Record<string, number> = { PENDING: 0, IN_APPEAL: 0, REJECTED: 1, APPROVED: 2 };

export async function listarDaConta(conta: ContaWhatsApp): Promise<ListaDaConta> {
  const cfg = getConfig();
  const base = { conta };
  if (cfg.mock) {
    const modelos = (conta === "carol" ? MODELOS_SIMULACAO : SIMULACAO_SOFIA).map((t) => paraTela(t, conta));
    return { ...base, configurado: true, modelos, erro: "" };
  }
  const waba = wabaDe(conta);
  if (!cfg.metaToken || !waba) return { ...base, configurado: false, modelos: [], erro: "" };

  const todos: (TemplateMeta & { rejected_reason?: string })[] = [];
  let url: string | null =
    `https://graph.facebook.com/${cfg.metaApiVersion}/${encodeURIComponent(waba)}/message_templates` +
    `?fields=id,name,status,category,language,components,parameter_format,rejected_reason&limit=100`;
  for (let pagina = 0; url && pagina < 10; pagina++) {
    const { ok, json } = await meta(url);
    if (!ok) {
      console.error("[radar] Meta recusou a lista de modelos:", conta, json.error?.code, json.error?.message);
      return { ...base, configurado: true, modelos: todos.map((t) => paraTela(t, conta)), erro: erroDaMeta(json.error) };
    }
    todos.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  const modelos = todos
    .filter((t) => String(t.language ?? "").toLowerCase().startsWith("pt"))
    .map((t) => paraTela(t, conta))
    // Em análise e recusados primeiro (é o que a equipe acompanha); dentro de cada grupo, por nome.
    .sort((a, b) => (ORDEM[a.status] ?? 3) - (ORDEM[b.status] ?? 3) || a.nome.localeCompare(b.nome));
  return { ...base, configurado: true, modelos, erro: "" };
}

/** Manda o rascunho para a aprovação da Meta. */
export async function criarModelo(r: RascunhoModelo): Promise<{ nome: string; status: string; categoria: string }> {
  const v = validarRascunho(r);
  if (!v.ok) throw new ModelosError(v.erros[0]);
  const cfg = getConfig();
  const nome = nomeTecnico(r.nome, r.conta);
  if (cfg.mock) return { nome, status: "PENDING", categoria: r.categoria };
  const waba = wabaDe(r.conta);
  if (!cfg.metaToken || !waba) throw new ModelosError("O Radar ainda não está ligado à Meta (META_TOKEN). Fale com o administrador.", 503);

  // Nome repetido: a Meta recusa com uma mensagem confusa; avisamos antes.
  const atual = await listarDaConta(r.conta);
  if (atual.modelos.some((m) => m.nome === nome)) throw new ModelosError(`Já existe um modelo "${nome}" em ${CONTAS[r.conta].nome}. Use outro nome.`);

  const { ok, json } = await meta(`https://graph.facebook.com/${cfg.metaApiVersion}/${encodeURIComponent(waba)}/message_templates`, {
    method: "POST",
    body: JSON.stringify(payloadMeta(r)),
  });
  if (!ok) {
    console.error("[radar] Meta recusou o novo modelo:", r.conta, nome, json.error?.code, json.error?.message);
    throw new ModelosError(erroDaMeta(json.error), 422);
  }
  if (r.conta === "carol") esquecerModelos();
  return { nome, status: String(json.status ?? "PENDING"), categoria: String(json.category ?? r.categoria) };
}
