/**
 * Empresas do Radar (12/11/2026, pedido do Pedro e do Henrique: "criar várias empresas dentro do Radar").
 *
 * O Radar passa a ser da Voob ("radar by voob") e cada empresa aparece com o nome e a cor dela.
 * - Lavacar: o motor de hoje (banco "atendimento", n8n, Carol, Chatwoot). Por dentro, nada muda.
 * - Voob: vai usar o Voob CRM (conta, WhatsApp oficial pelo Tech Provider, modelos e agente de IA). Em preparação.
 *
 * As cores completas de cada empresa ficam no globals.css, em [data-empresa="..."]; aqui só a cor do seletor.
 * Este arquivo não usa nada do servidor: vale para a tela, para o proxy e para as rotas.
 */

export type MotorEmpresa = "lavacar" | "voob-crm";
export type SituacaoEmpresa = "ativa" | "preparando";

/** Telas do menu. Cada empresa mostra só as que tem. */
export type Recurso =
  | "comecar"
  | "buscar"
  | "resultados"
  | "disparo"
  | "automatico"
  | "leads"
  | "painel"
  | "historico"
  | "config"
  | "atendimento";

export interface Empresa {
  id: string;
  nome: string;
  /** Duas letras para o selo da empresa. */
  sigla: string;
  /** Cor de destaque (selo e bolinha do seletor). */
  cor: string;
  /** Quem a empresa procura, numa linha (aparece no seletor). */
  publico: string;
  /** Quem conversa com os leads que respondem. */
  agente: string;
  motor: MotorEmpresa;
  situacao: SituacaoEmpresa;
  recursos: readonly Recurso[];
}

export const EMPRESAS: readonly Empresa[] = [
  {
    id: "lavacar",
    nome: "Lavacar",
    sigla: "LV",
    cor: "#03abc9",
    publico: "Lava-jatos e lavadores da Grande BH",
    agente: "Carol",
    motor: "lavacar",
    situacao: "ativa",
    recursos: ["buscar", "resultados", "disparo", "automatico", "leads", "painel", "historico", "config", "atendimento"],
  },
  {
    id: "voob",
    nome: "Voob",
    sigla: "VB",
    cor: "#4e9a1a",
    publico: "Empresas que vendem pelo WhatsApp",
    agente: "Renata",
    motor: "voob-crm",
    situacao: "preparando",
    recursos: ["comecar"],
  },
];

export const EMPRESA_PADRAO = "lavacar";
/** Cookie com a empresa escolhida no seletor. */
export const COOKIE_EMPRESA = "radar_empresa";

const POR_ID = new Map(EMPRESAS.map((e) => [e.id, e]));

export function empresaPorId(id: string | null | undefined): Empresa | null {
  return (id && POR_ID.get(id.trim().toLowerCase())) || null;
}

/**
 * Empresas que este Radar mostra, na ordem da variável RADAR_EMPRESAS (ex.: "lavacar,voob").
 * Sem a variável: todas. Nome desconhecido é ignorado; se nada sobrar, fica só a padrão.
 */
export function idsDisponiveis(valor?: string | null): string[] {
  const pedidos = (valor ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const base = pedidos.length ? pedidos : EMPRESAS.map((e) => e.id);
  const ids = [...new Set(base)].filter((id) => POR_ID.has(id));
  return ids.length ? ids : [EMPRESA_PADRAO];
}

export function empresasDisponiveis(valor?: string | null): Empresa[] {
  return idsDisponiveis(valor).map((id) => POR_ID.get(id)!);
}

/** A empresa do cookie, se ela estiver disponível; senão, a primeira disponível. */
export function escolherEmpresa(cookie: string | null | undefined, disponiveis: readonly string[]): Empresa {
  const pedida = empresaPorId(cookie);
  if (pedida && disponiveis.includes(pedida.id)) return pedida;
  return empresaPorId(disponiveis[0]) ?? POR_ID.get(EMPRESA_PADRAO)!;
}

export function temRecurso(empresa: Empresa, recurso: Recurso): boolean {
  return empresa.recursos.includes(recurso);
}

/** Rotas que valem para qualquer empresa (entrar, sair, trocar de empresa, saúde do serviço). */
const ROTAS_DE_TODAS = ["/api/auth/login", "/api/auth/logout", "/api/empresa", "/api/health"];
/** Abas do Radar dentro do Chatwoot do Lavacar ("Enviar Template"): são do Lavacar, seja qual for a empresa escolhida aqui. */
const ROTAS_DO_CHATWOOT_LAVACAR = ["/api/chatwoot", "/api/modelos"];

/**
 * O que a empresa escolhida pode chamar. Hoje as rotas /api usam o motor do Lavacar
 * (banco "atendimento", planilha, n8n): com outra empresa escolhida, elas ficam fechadas,
 * para ninguém disparar ou buscar para o Lavacar achando que está na Voob.
 */
export function rotaPermitida(empresa: Empresa, caminho: string): boolean {
  if (!caminho.startsWith("/api/")) return true;
  if (ROTAS_DE_TODAS.includes(caminho)) return true;
  if (ROTAS_DO_CHATWOOT_LAVACAR.some((r) => caminho === r || caminho.startsWith(`${r}/`))) return true;
  return empresa.motor === "lavacar";
}
