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
