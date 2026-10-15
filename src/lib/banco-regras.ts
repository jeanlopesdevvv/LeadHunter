/**
 * Regras puras da lista de leads no banco (schema "atendimento" do Supabase do Lavacar).
 * O resto do Radar continua vendo "abas" (linhas e cabeçalho): o banco é convertido para o mesmo
 * formato, então busca, disparo e Desempenho não mudam.
 */

import { normalizePhone } from "./phone";

/** Colunas de atendimento.leads, na ordem em que viram "aba". */
export const CABECALHO_LEADS = ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout", "template"] as const;

/** Abas que o Radar sabe ler do banco, com as mesmas colunas que tinham na planilha. */
export const CABECALHOS_ABAS: Record<string, readonly string[]> = {
  leads: CABECALHO_LEADS,
  historico_carol: ["telefone", "timestamp", "remetente", "mensagem", "remoteJid"],
  historico_sofia: ["telefone", "timestamp", "remetente", "mensagem", "remoteJid", "messageId"],
  status_meta_carol: ["timestamp", "telefone", "wamid", "status", "erro_codigo", "erro_detalhe", "categoria_cobranca"],
  sessoes_carol: ["remoteJid", "telefone", "nome", "estado", "janela_meta_ate", "ultimo_contato", "tentativas_reativacao"],
  sessoes_sofia: ["remoteJid", "telefone", "nome", "tipo_usuario", "estado", "trilha", "ultimo_contato", "tentativas_reativacao"],
};

/** Valor do banco como texto de planilha: nulo vira vazio e data vira ISO. */
export function comoTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v);
}

/** Registros do banco -> [cabeçalho, ...linhas], como o Radar lia da planilha. */
export function registrosComoAba(cabecalho: readonly string[], registros: readonly Record<string, unknown>[]): string[][] {
  return [[...cabecalho], ...registros.map((r) => cabecalho.map((c) => comoTexto(r[c])))];
}

/** Telefone como o banco guarda (só dígitos, 55 + DDD + número). Vazio quando não serve. */
export function telefoneDoBanco(raw: unknown): string {
  const d = normalizePhone(raw).digits || String(raw ?? "").replace(/\D+/g, "");
  return /^[0-9]{10,15}$/.test(d) ? d : "";
}

/** Nome do Radar/abas -> nome normalizado (minúsculo, sem espaços). */
export function nomeDeAba(n: string): string {
  return n.trim().toLowerCase();
}

/**
 * Lê a senha/endereço do banco nas variáveis de ambiente. Aceita mais de um nome, porque o painel
 * da hospedagem foi preenchido à mão (ex.: "radar-atendimento").
 */
export const NOMES_SENHA_BANCO = [
  "RADAR_ATENDIMENTO_SENHA",
  "radar-atendimento",
  "RADAR-ATENDIMENTO",
  "RADAR_ATENDIMENTO",
  "radar_atendimento",
  "ATENDIMENTO_DB_PASSWORD",
] as const;

export function lerSenhaBanco(env: Record<string, string | undefined>): string {
  for (const n of NOMES_SENHA_BANCO) {
    const v = env[n];
    if (v !== undefined && v.trim() !== "") return v.trim();
  }
  return "";
}

// ---------------------------------------------------------------- tela "Leads" (editar sem planilha)

/** Status que dá para escolher na tela Leads. O n8n só dispara quem está "pendente". */
export const STATUS_EDITAVEIS = {
  aguardando: "Na fila",
  pendente: "Marcado para o próximo disparo",
  enviado: "Enviado",
  sem_whatsapp: "Sem WhatsApp",
  removido: "Fora da lista",
} as const;
export type StatusEditavel = keyof typeof STATUS_EDITAVEIS;

export const TIPOS_LEAD = ["Empresa", "Autônomo"] as const;

export type SituacaoLead = "fila" | "enviado" | "sem_whatsapp" | "nao_quer" | "fora" | "outro";

/** Como o lead aparece na tela: "fora da lista" e "não quer contato" vêm antes do status. */
export function situacaoDoLead(l: { status?: string | null; optout?: string | null }): SituacaoLead {
  const s = String(l.status ?? "").trim().toLowerCase();
  if (s === "removido") return "fora";
  if (String(l.optout ?? "").trim() && !["false", "nao", "não", "0", "-"].includes(String(l.optout).trim().toLowerCase())) return "nao_quer";
  if (s === "pendente" || s === "aguardando") return "fila";
  if (s === "enviado" || s === "enviada") return "enviado";
  if (s === "sem_whatsapp" || s === "sem whatsapp") return "sem_whatsapp";
  return "outro";
}

export interface EdicaoLead {
  telefone: string;
  nome?: string;
  tipo?: string;
  cidade?: string;
  status?: StatusEditavel;
  optout?: boolean;
}

/** Confere o pedido de edição vindo da tela. Devolve o que pode gravar ou o motivo da recusa. */
export function validarEdicao(body: unknown): { ok: true; edicao: EdicaoLead } | { ok: false; erro: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const telefone = typeof b.telefone === "string" ? b.telefone.replace(/\D/g, "") : "";
  if (!/^[0-9]{10,15}$/.test(telefone)) return { ok: false, erro: "Telefone do lead inválido." };
  const edicao: EdicaoLead = { telefone };
  for (const campo of ["nome", "cidade"] as const) {
    if (b[campo] === undefined) continue;
    if (typeof b[campo] !== "string") return { ok: false, erro: `Campo ${campo} inválido.` };
    const v = (b[campo] as string).replace(/\s+/g, " ").trim();
    if (!v) return { ok: false, erro: campo === "nome" ? "O nome não pode ficar vazio." : "A cidade não pode ficar vazia." };
    if (v.length > 120) return { ok: false, erro: `O campo ${campo} passou de 120 caracteres.` };
    edicao[campo] = v;
  }
  if (b.tipo !== undefined) {
    if (!TIPOS_LEAD.includes(b.tipo as (typeof TIPOS_LEAD)[number])) return { ok: false, erro: "Tipo deve ser Empresa ou Autônomo." };
    edicao.tipo = b.tipo as string;
  }
  if (b.status !== undefined) {
    if (typeof b.status !== "string" || !Object.prototype.hasOwnProperty.call(STATUS_EDITAVEIS, b.status)) return { ok: false, erro: "Situação inválida." };
    edicao.status = b.status as StatusEditavel;
  }
  if (b.optout !== undefined) {
    if (typeof b.optout !== "boolean") return { ok: false, erro: "Campo optout inválido." };
    edicao.optout = b.optout;
  }
  if (Object.keys(edicao).length === 1) return { ok: false, erro: "Nada para alterar." };
  return { ok: true, edicao };
}

/** Data e hora de Brasília no formato que o n8n grava ("15/10/2026, 11:30:00"). */
export function agoraBrasilia(d = new Date()): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
