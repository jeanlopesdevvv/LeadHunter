/**
 * Empresas do Radar.
 *
 * 12/11/2026: "criar várias empresas dentro do Radar". 13/11/2026 (white label): o Lavacar fica exatamente como está
 * (motor próprio: banco "atendimento", n8n, Carol, Chatwoot) e todas as outras empresas usam o motor do Voob CRM
 * (schema "radar"), com as mesmas telas e sem nada diferente entre elas. A Voob é uma dessas empresas (com a Renata
 * respondendo). As empresas do Voob CRM vêm do banco (radar.empresas_lista); aqui ficam o Lavacar e as regras.
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
  | "atendimento"
  | "modelos";

export interface Empresa {
  id: string;
  nome: string;
  /** Duas letras para o selo da empresa (quando não tem logo). */
  sigla: string;
  /** Cor de destaque (selo, seletor e a cor principal das telas). */
  cor: string;
  /** Logo (imagem pequena, data:image/...). */
  logo?: string | null;
  /** Quem a empresa procura, numa linha (aparece no seletor). */
  publico: string;
  /** Quem conversa com os leads que respondem. */
  agente: string;
  motor: MotorEmpresa;
  situacao: SituacaoEmpresa;
  recursos: readonly Recurso[];
  /** Nome de uma tela no menu, quando é diferente do padrão (ex.: a "Base"). */
  rotulos?: Partial<Record<Recurso, string>>;
}

export const LAVACAR: Empresa = {
  id: "lavacar",
  nome: "Lavacar",
  sigla: "LV",
  cor: "#03abc9",
  logo: null,
  publico: "Lava-jatos e lavadores da Grande BH",
  agente: "Carol",
  motor: "lavacar",
  situacao: "ativa",
  recursos: ["buscar", "resultados", "disparo", "automatico", "leads", "painel", "historico", "config", "atendimento"],
};

/** As empresas fixas do Radar (só o Lavacar; as outras vêm do Voob CRM). */
export const EMPRESAS: readonly Empresa[] = [LAVACAR];

/** As telas de toda empresa do Voob CRM, na ordem do menu. */
export const RECURSOS_CRM: readonly Recurso[] = ["comecar", "buscar", "leads", "disparo", "modelos", "painel"];
export const ROTULOS_CRM: Partial<Record<Recurso, string>> = { comecar: "Primeiros passos", leads: "Base", disparo: "Disparo", modelos: "Modelos" };

/** O que o banco devolve de cada empresa (radar.empresas_lista / radar.empresa_ver). */
export interface ResumoEmpresaCrm {
  id: string;
  nome: string;
  cor: string;
  logo: string | null;
  publico: string;
  agente: string;
  ligado: boolean;
  pausado: boolean;
  numero: boolean;
  conta: string | null;
  teste: boolean;
  situacao: SituacaoEmpresa;
}

/** "Clínica Bem Estar" → "CB"; "Voob" → "VO". */
export function siglaDe(nome: string): string {
  const palavras = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((p) => p && !/^(de|da|do|das|dos|e|&)$/i.test(p));
  const s = palavras.length >= 2 ? `${palavras[0][0]}${palavras[1][0]}` : (palavras[0] ?? "Em").slice(0, 2);
  return (s.length === 2 ? s : `${s}X`.slice(0, 2)).toUpperCase();
}

const COR = /^#[0-9a-f]{6}$/i;

export function empresaDoCrm(r: ResumoEmpresaCrm): Empresa {
  return {
    id: r.id,
    nome: r.nome,
    sigla: siglaDe(r.nome),
    cor: COR.test(r.cor) ? r.cor : "#4e9a1a",
    logo: r.logo ?? null,
    publico: r.publico || (r.conta ? `Conta ${r.conta}` : ""),
    agente: r.agente,
    motor: "voob-crm",
    situacao: r.situacao === "ativa" ? "ativa" : "preparando",
    recursos: RECURSOS_CRM,
    rotulos: ROTULOS_CRM,
  };
}

export const EMPRESA_PADRAO = "lavacar";
/** Cookie com a empresa escolhida no seletor. */
export const COOKIE_EMPRESA = "radar_empresa";

/** Id de empresa que pode vir do cookie ou de um pedido. */
export const idValido = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9-]{2,30}$/.test(id);

export function empresaPorId(id: string | null | undefined): Empresa | null {
  return id?.trim().toLowerCase() === LAVACAR.id ? LAVACAR : null;
}

/** O motor da empresa pelo id: "lavacar" é o Lavacar; qualquer outra é do Voob CRM. */
export const motorDoId = (id: string | null | undefined): MotorEmpresa => (id?.trim().toLowerCase() === LAVACAR.id ? "lavacar" : "voob-crm");

function pedidos(valor?: string | null): string[] {
  return (valor ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** RADAR_EMPRESAS (ex.: "lavacar,voob"): sem a variável, tudo. O Lavacar aparece se estiver na lista. */
export function lavacarNoRadar(valor?: string | null): boolean {
  const p = pedidos(valor);
  return !p.length || p.includes(LAVACAR.id);
}

/** As empresas do Voob CRM aparecem se a lista tiver qualquer outra além do Lavacar (ou se não tiver lista). */
export function crmNoRadar(valor?: string | null): boolean {
  const p = pedidos(valor);
  return !p.length || p.some((id) => id !== LAVACAR.id);
}

/**
 * O motor da empresa escolhida, para o proxy (sem banco): o Lavacar só para a equipe e só se ele estiver neste Radar;
 * qualquer outra empresa (ou cliente sem escolha) é do Voob CRM. Quem pode ver qual empresa, as rotas conferem no banco.
 */
export function motorDaEscolha(cookie: string | null | undefined, o: { equipe: boolean; lavacar: boolean; crm: boolean }): MotorEmpresa {
  const lavacarPode = o.equipe && o.lavacar;
  if (motorDoId(cookie) === "lavacar" || !idValido(cookie)) return lavacarPode || !o.crm ? "lavacar" : "voob-crm";
  return o.crm ? "voob-crm" : "lavacar";
}

export function temRecurso(empresa: Pick<Empresa, "recursos">, recurso: Recurso): boolean {
  return empresa.recursos.includes(recurso);
}

/** Rotas que valem para qualquer empresa (entrar, sair, trocar de empresa, lista de empresas, saúde do serviço). */
const ROTAS_DE_TODAS = ["/api/auth/login", "/api/auth/logout", "/api/empresa", "/api/empresas", "/api/health"];
/** Abas do Radar dentro do Chatwoot do Lavacar ("Enviar Template"): são do Lavacar, seja qual for a empresa escolhida aqui. */
const ROTAS_DO_CHATWOOT_LAVACAR = ["/api/chatwoot", "/api/modelos"];
/** Consultas grátis do Google: a cota é uma só para todas as empresas (só leitura). */
const ROTAS_COMPARTILHADAS = ["/api/uso"];
/** O motor do Voob CRM (schema "radar"): só com uma empresa desse motor escolhida. */
const ROTAS_DO_VOOB_CRM = "/api/voob";

const comecaCom = (caminho: string, r: string) => caminho === r || caminho.startsWith(`${r}/`);

/**
 * O que a empresa escolhida pode chamar. As rotas /api de sempre usam o motor do Lavacar (banco "atendimento",
 * planilha, n8n): com outra empresa escolhida, elas ficam fechadas, para ninguém disparar ou buscar para o Lavacar
 * achando que está em outra empresa. E as /api/voob (motor do Voob CRM) só abrem com uma empresa do Voob CRM escolhida.
 */
export function rotaPermitida(empresa: Pick<Empresa, "motor">, caminho: string): boolean {
  if (!caminho.startsWith("/api/")) return true;
  if (ROTAS_DE_TODAS.includes(caminho) || ROTAS_COMPARTILHADAS.includes(caminho)) return true;
  if (ROTAS_DO_CHATWOOT_LAVACAR.some((r) => comecaCom(caminho, r))) return true;
  if (comecaCom(caminho, ROTAS_DO_VOOB_CRM)) return empresa.motor === "voob-crm";
  return empresa.motor === "lavacar";
}

/** Rotas que só a equipe da Voob chama, seja qual for a empresa (o Lavacar e as abas dele no Chatwoot). */
export function rotaSoDaEquipe(caminho: string): boolean {
  if (!caminho.startsWith("/api/")) return false;
  if (ROTAS_DE_TODAS.includes(caminho) || ROTAS_COMPARTILHADAS.includes(caminho) || comecaCom(caminho, ROTAS_DO_VOOB_CRM)) return false;
  return true;
}

export function rotuloDaTela(empresa: Pick<Empresa, "rotulos">, recurso: Recurso, padrao: string): string {
  return empresa.rotulos?.[recurso] ?? padrao;
}
