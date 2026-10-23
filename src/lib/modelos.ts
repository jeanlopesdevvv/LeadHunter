import "server-only";

import { caixaDaConversa, infoChatwoot, notaPrivada } from "./chatwoot";
import { getConfig } from "./env";
import {
  CONTAS,
  comandoTemplate,
  motivoDaRecusa,
  nomeTecnico,
  payloadMeta,
  validarRascunho,
  type ContaWhatsApp,
  type RascunhoModelo,
} from "./modelos-regras";
import { MODELOS_SIMULACAO, esquecerModelos } from "./templates";
import { analisarTemplate, type ModeloWhatsApp, type TemplateMeta } from "./templates-regras";

/**
 * Aba "Modelos": lê e cria os modelos do WhatsApp da Carol e da Sofia na Meta (Graph API) e manda o comando
 * "#template nome" para a conversa do Chatwoot (quem envia de fato é o n8n, Fluxos 4 e S4).
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
}

export interface ListaDaConta {
  conta: ContaWhatsApp;
  configurado: boolean;
  modelos: ModeloDaConta[];
  erro: string;
  /** O Radar consegue escrever na conversa do Chatwoot (CHATWOOT_TOKEN). Sem ele, a tela oferece copiar o comando. */
  chatwootLigado: boolean;
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

function paraTela(t: TemplateMeta & { rejected_reason?: string }): ModeloDaConta {
  return { ...analisarTemplate(t), id: String(t.id ?? t.name), recusa: motivoDaRecusa(t.rejected_reason) };
}

const ORDEM: Record<string, number> = { PENDING: 0, IN_APPEAL: 0, REJECTED: 1, APPROVED: 2 };

export async function listarDaConta(conta: ContaWhatsApp): Promise<ListaDaConta> {
  const cfg = getConfig();
  const chatwootLigado = infoChatwoot().apiLigada;
  const base = { conta, chatwootLigado };
  if (cfg.mock) {
    const modelos = conta === "carol" ? MODELOS_SIMULACAO.map((t) => paraTela(t)) : [];
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
      return { ...base, configurado: true, modelos: todos.map(paraTela), erro: erroDaMeta(json.error) };
    }
    todos.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  const modelos = todos
    .filter((t) => String(t.language ?? "").toLowerCase().startsWith("pt"))
    .map(paraTela)
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

/**
 * Envia um modelo aprovado ao contato da conversa: escreve "#template nome" (e " ia") numa nota privada; o n8n
 * envia, atualiza a sessão e responde na própria conversa (✅ enviado / ❌ motivo).
 */
export async function enviarNaConversa(conta: ContaWhatsApp, conversa: number, nome: string, ia: boolean): Promise<void> {
  if (!infoChatwoot().apiLigada) throw new ModelosError("O Radar não está ligado ao Chatwoot (CHATWOOT_TOKEN). Use o botão Copiar comando.", 503);
  if (!Number.isInteger(conversa) || conversa <= 0) throw new ModelosError("Conversa inválida.");
  const caixa = await caixaDaConversa(conversa);
  if (caixa !== CONTAS[conta].caixaChatwoot) throw new ModelosError(`Esta conversa não é da caixa da ${conta === "carol" ? "Carol" : "Sofia"}.`);
  const lista = await listarDaConta(conta);
  const modelo = lista.modelos.find((m) => m.nome === nome);
  if (!modelo) throw new ModelosError(`O modelo "${nome}" não existe em ${CONTAS[conta].nome}.`, 404);
  if (modelo.status !== "APPROVED") throw new ModelosError(`O modelo "${nome}" ainda não foi aprovado pela Meta.`);
  await notaPrivada(conversa, comandoTemplate(nome, ia));
}
