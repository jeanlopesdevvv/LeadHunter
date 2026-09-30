/**
 * Classificação do lead para a coluna "tipo" da planilha.
 *
 * Autônomo  = lavador individual (plano Individual do Lavacar), normalmente
 *             atende a domicílio, sem ponto fixo, poucas avaliações.
 * Empresa   = lava-jato / estética com ponto físico (plano Lava Jato).
 *
 * É uma sugestão: o usuário pode trocar lead a lead antes de enviar.
 */

export type LeadTipo = "Autônomo" | "Empresa";

export interface ClassifyInput {
  nome: string;
  site?: string;
  avaliacoes?: number | null;
  semPontoFisico?: boolean; // pureServiceAreaBusiness do Google
  endereco?: string;
}

export interface ClassifyResult {
  tipo: LeadTipo;
  motivos: string[];
}

function strip(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Palavras inteiras (evita "automovel" casar com "movel"). */
const MOBILE_RE = /(^|[^a-z])(domicili\w*|delivery|movel|itinerante|vai ate voce|em casa|no seu endereco)([^a-z]|$)/;

/** "João Lavador", "Lavadora Ana": pessoa que lava carros. */
const LAVADOR_RE = /(^|[^a-z])(lavador|lavadora|lavadores)([^a-z]|$)/;

const CORPORATE_RE =
  /(^|[^a-z])(ltda|eireli|s\/a|s\.a|epp|rede|franquia|unidade|filial|shopping|posto|centro automotivo|center|grupo|matriz)([^a-z]|$)/;

const BUSINESS_RE =
  /(^|[^a-z])(lava\w*|jato|car|cars|auto\w*|wash|estetica|polimento|polimentos|higieniz\w*|detail\w*|limpeza|garag\w*|spa|ducha|posto|oficina|motors|servico\w*|premium|clean|brilho|cristal|express)([^a-z]|$)/;

const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "linktr.ee", "wa.me", "whatsapp.com", "linkedin.com"];

function isRealWebsite(site?: string): boolean {
  if (!site) return false;
  const s = site.toLowerCase();
  return !SOCIAL_HOSTS.some((h) => s.includes(h));
}

/** "João Silva", "Marcos Paulo Lavador" -> parece nome de pessoa. */
function looksLikePersonName(nome: string): boolean {
  const n = strip(nome).trim();
  if (!n || /\d/.test(n)) return false;
  if (BUSINESS_RE.test(n)) return false;
  const words = n.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 4 && words.every((w) => /^[a-z]+$/.test(w));
}

export function classifyLead(input: ClassifyInput): ClassifyResult {
  const nome = ` ${strip(input.nome)} `;
  const avaliacoes = input.avaliacoes ?? 0;
  let autonomo = 0;
  let empresa = 0;
  const motivos: string[] = [];

  if (input.semPontoFisico) {
    autonomo += 3;
    motivos.push("atende no endereço do cliente (sem ponto físico)");
  } else if (input.endereco) {
    empresa += 2;
    motivos.push("tem ponto físico");
  }

  if (MOBILE_RE.test(nome)) {
    autonomo += 3;
    motivos.push("nome indica serviço a domicílio");
  }

  if (LAVADOR_RE.test(nome)) {
    autonomo += 2;
    motivos.push("nome indica lavador autônomo");
  }

  if (looksLikePersonName(input.nome)) {
    autonomo += 2;
    motivos.push("nome de pessoa");
  }

  if (CORPORATE_RE.test(nome)) {
    empresa += 2;
    motivos.push("nome de empresa/rede");
  }

  if (isRealWebsite(input.site)) {
    empresa += 1.5;
    motivos.push("tem site próprio");
  } else {
    autonomo += 0.5;
  }

  if (avaliacoes >= 100) {
    empresa += 2;
    motivos.push(`${avaliacoes} avaliações`);
  } else if (avaliacoes >= 40) {
    empresa += 1;
    motivos.push(`${avaliacoes} avaliações`);
  } else if (avaliacoes < 10) {
    autonomo += 1;
    motivos.push(avaliacoes ? `só ${avaliacoes} avaliações` : "sem avaliações");
  }

  return { tipo: autonomo > empresa ? "Autônomo" : "Empresa", motivos };
}
