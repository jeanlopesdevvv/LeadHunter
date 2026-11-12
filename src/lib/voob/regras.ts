/**
 * Radar · Voob: regras sem servidor (valem para a tela, para as rotas e para os testes).
 * Quem procurar, como ler o site de cada empresa, os nomes de cada situação e os textos da prospecção.
 */

import type { Lead } from "@/lib/types";

import type { EntradaBase, NumeroProspeccao, PainelVoob, ResultadoBusca, SituacaoSite, StatusLead } from "./tipos";

// ---------------------------------------------------------------- quem procurar

export interface Segmento {
  id: string;
  nome: string;
  termos: string[];
}

/** Os públicos do começo (decisão do Jean, 12/11: BH, quem não tem site). Cada termo é uma busca no Google. */
export const SEGMENTOS: Segmento[] = [
  { id: "clinicas", nome: "Clínicas e saúde", termos: ["clínica de estética", "clínica odontológica", "fisioterapia", "psicólogo", "nutricionista"] },
  { id: "beleza", nome: "Beleza", termos: ["salão de beleza", "barbearia", "estúdio de sobrancelha", "esmalteria"] },
  { id: "imobiliarias", nome: "Imobiliárias", termos: ["imobiliária", "corretor de imóveis"] },
  { id: "servicos", nome: "Prestadores de serviço", termos: ["advogado", "contabilidade", "assistência técnica", "dedetizadora", "pet shop", "autoescola"] },
];

export const CIDADE_PADRAO = "Belo Horizonte, MG";

/** Bairros e regiões de BH para dividir a busca (o Google devolve no máximo 60 por busca). */
export const BAIRROS_BH = [
  "Savassi",
  "Funcionários",
  "Lourdes",
  "Centro",
  "Santo Agostinho",
  "Sion",
  "Buritis",
  "Castelo",
  "Pampulha",
  "Cidade Nova",
  "Floresta",
  "Santa Efigênia",
  "Prado",
  "Barreiro",
  "Venda Nova",
];

/** No máximo 3 páginas (60 empresas) por busca: o que o Google entrega. */
export const PAGINAS_POR_BUSCA = 3;

export function termosDosSegmentos(ids: string[], extras: string[] = []): string[] {
  const termos = SEGMENTOS.filter((s) => ids.includes(s.id)).flatMap((s) => s.termos);
  const limpos = extras.map((t) => t.trim().replace(/\s+/g, " ")).filter((t) => t.length >= 3 && t.length <= 60);
  return [...new Set([...termos, ...limpos].map((t) => t.toLowerCase()))];
}

/** Os lugares da busca: a cidade inteira ou cada bairro escolhido ("Savassi, Belo Horizonte, MG"). */
export function lugaresDaBusca(cidade: string, bairros: string[] = []): string[] {
  const c = cidade.trim() || CIDADE_PADRAO;
  const bs = [...new Set(bairros.map((b) => b.trim()).filter(Boolean))];
  return bs.length ? bs.map((b) => `${b}, ${c}`) : [c];
}

export interface TarefaBusca {
  termo: string;
  lugar: string;
  textQuery: string;
}

export function planoDeBusca(termos: string[], lugares: string[]): TarefaBusca[] {
  return termos.flatMap((termo) => lugares.map((lugar) => ({ termo, lugar, textQuery: `${termo} em ${lugar}` })));
}

/** Consultas do Google que a busca pode gastar no máximo (cada página é uma). */
export const consultasMaximas = (tarefas: number) => tarefas * PAGINAS_POR_BUSCA;

// ---------------------------------------------------------------- o site de cada empresa

/** Endereços que não são um site da empresa: rede social, link de bio, WhatsApp, perfis em plataformas. */
const SEM_SITE_PROPRIO = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "fb.me",
  "m.facebook.com",
  "linktr.ee",
  "linktree.com",
  "linkin.bio",
  "bio.link",
  "beacons.ai",
  "taplink.cc",
  "campsite.bio",
  "wa.me",
  "api.whatsapp.com",
  "whatsapp.com",
  "wa.link",
  "tiktok.com",
  "youtube.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "doctoralia.com.br",
  "ifood.com.br",
  "booksy.com",
  "trinks.com",
  "zapimoveis.com.br",
  "vivareal.com.br",
  "olx.com.br",
  "mercadolivre.com.br",
];

/** Sites do Google que saíram do ar (o link aparece no Maps mas não abre nada). */
const SITE_DESATIVADO = ["business.site", "g.page"];

function dominio(url: string): string {
  const t = url.trim();
  if (!t) return "";
  try {
    return new URL(/^[a-z]+:\/\//i.test(t) ? t : `https://${t}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

const termina = (host: string, d: string) => host === d || host.endsWith(`.${d}`);

/** Como a Voob lê o site que está no Google: não tem, só rede social (ou perfil em plataforma), ou tem site. */
export function situacaoDoSite(url: string | null | undefined): Exclude<SituacaoSite, "desatualizado" | "nao_conferido"> {
  const host = dominio(url ?? "");
  if (!host) return "sem_site";
  if (SITE_DESATIVADO.some((d) => termina(host, d))) return "sem_site";
  if (SEM_SITE_PROPRIO.some((d) => termina(host, d))) return "rede_social";
  return "com_site";
}

/** Para quem a 1ª mensagem ("vi que vocês ainda não têm site") serve. */
export const SERVE_PARA_ABERTURA: SituacaoSite[] = ["sem_site", "rede_social"];

export const ROTULO_SITE: Record<SituacaoSite, string> = {
  sem_site: "Sem site",
  rede_social: "Só rede social",
  desatualizado: "Site desatualizado",
  com_site: "Tem site",
  nao_conferido: "Site não conferido",
};

// ---------------------------------------------------------------- do Google para a base

export function resultadoDaBusca(lead: Lead, situacao: ResultadoBusca["situacao"]): ResultadoBusca {
  return {
    placeId: lead.id,
    negocio: lead.nome,
    telefone: lead.telefone,
    telefoneExibicao: lead.telefoneExibicao,
    celular: lead.telefoneTipo === "celular",
    categoria: lead.categoria,
    termo: lead.termo,
    cidade: lead.cidade,
    uf: lead.uf,
    bairro: lead.bairro,
    endereco: lead.endereco,
    site: lead.site,
    siteSituacao: situacaoDoSite(lead.site),
    nota: lead.nota,
    avaliacoes: lead.avaliacoes,
    mapsUrl: lead.mapsUrl,
    situacao,
  };
}

export function paraBase(r: ResultadoBusca): EntradaBase {
  return {
    telefone: r.telefone,
    negocio: r.negocio.slice(0, 160),
    categoria: r.categoria || undefined,
    termo: r.termo || undefined,
    cidade: r.cidade || undefined,
    uf: r.uf || undefined,
    bairro: r.bairro || undefined,
    endereco: r.endereco || undefined,
    site_url: r.site || undefined,
    site_situacao: r.siteSituacao,
    nota: r.nota,
    avaliacoes: r.avaliacoes,
    place_id: r.placeId || undefined,
    maps_url: r.mapsUrl || undefined,
  };
}

/** Pode ir para a base: celular, ainda não está nela e não é da Voob. */
export const podeIrParaBase = (r: ResultadoBusca) => r.celular && r.situacao === "novo";

// ---------------------------------------------------------------- nomes na tela

export type Tom = "brand" | "green" | "amber" | "red" | "gray" | "navy";

export const STATUS: Record<StatusLead, { rotulo: string; tom: Tom; dica: string }> = {
  novo: { rotulo: "Na base", tom: "gray", dica: "Esperando a vez. Entra na fila de um dia de envio." },
  na_fila: { rotulo: "Na fila de hoje", tom: "brand", dica: "Sai hoje, no horário e no espaçamento combinados." },
  enviado: { rotulo: "Recebeu", tom: "navy", dica: "A primeira mensagem saiu. Ainda não respondeu." },
  respondeu: { rotulo: "Respondeu", tom: "green", dica: "Escreveu de volta: a Renata está conversando." },
  interessado: { rotulo: "Quer ver", tom: "green", dica: "Tocou em “Quero ver”: a Renata mostra como ficaria." },
  sem_interesse: { rotulo: "Sem interesse", tom: "amber", dica: "Tocou em “Não tenho interesse”. Não recebe mais nada do Radar." },
  parou: { rotulo: "Pediu para parar", tom: "red", dica: "Pediu para não receber mensagens. Conta no freio de saídas." },
  pulado: { rotulo: "Não enviado", tom: "gray", dica: "O porteiro segurou antes de sair (motivo ao lado)." },
  erro: { rotulo: "Erro no envio", tom: "red", dica: "A Meta não entregou (motivo ao lado)." },
  descartado: { rotulo: "Descartado", tom: "gray", dica: "Tirado da base por alguém da equipe." },
};

/** Ordem dos filtros da base. */
export const ORDEM_STATUS: StatusLead[] = ["interessado", "respondeu", "na_fila", "novo", "enviado", "sem_interesse", "parou", "pulado", "erro", "descartado"];

const MOTIVOS: Record<string, string> = {
  ja_e_lead: "Já é lead no CRM da Voob",
  ja_no_crm: "Já é lead no CRM da Voob",
  cliente_ou_equipe: "É cliente ou da equipe da Voob",
  ja_conversou: "Já conversou com a Voob",
  ja_conversa: "Já conversou com a Voob",
  ja_respondeu: "Já respondeu",
  pediu_para_parar: "Pediu para não receber mensagens",
  ja_recebeu: "Já recebeu a mensagem do Radar",
  mensagem_nao_serve: "A 1ª mensagem é para quem não tem site",
  campo_vazio: "Faltou um dado para a mensagem",
  radar_pausado: "O Radar foi pausado antes de sair",
  radar_desligado: "O Radar estava desligado",
  radar_tirado: "Tirado da fila",
  atrasado_demais: "Ficou parado na fila e voltou para a base",
  fora_da_lista_de_teste: "Número em modo teste: só a lista de teste recebe",
  numero_desconectado: "O número estava desconectado",
  qualidade_baixa: "Qualidade do número baixa",
  sem_modelo: "Sem mensagem aprovada pela Meta",
  modelo_em_analise: "Mensagem ainda em análise na Meta",
  limite_do_dia: "Limite do dia atingido",
  freio_saidas: "Freio de saídas",
  proprio_numero: "É o próprio número",
  envio_sumiu: "O envio saiu da fila",
  descartado: "Descartado",
};

export function motivoLegivel(motivo: string | null | undefined): string {
  if (!motivo) return "";
  if (MOTIVOS[motivo]) return MOTIVOS[motivo];
  if (/131049/.test(motivo)) return "A Meta segurou (limite de mensagens de marketing para essa pessoa)";
  if (/131026|not.*whatsapp|undeliverable/i.test(motivo)) return "Esse número não recebe WhatsApp";
  return motivo.replace(/_/g, " ");
}

export const CONFERIDA: Record<string, { rotulo: string; tom: Tom }> = {
  novo: { rotulo: "Novo", tom: "green" },
  cliente_ou_equipe: { rotulo: "Cliente ou equipe", tom: "gray" },
  ja_no_crm: { rotulo: "Já é lead da Voob", tom: "gray" },
  ja_conversa: { rotulo: "Já conversou com a Voob", tom: "gray" },
  invalido: { rotulo: "Telefone inválido", tom: "gray" },
  fixo: { rotulo: "Telefone fixo", tom: "gray" },
  sem_conferir: { rotulo: "Não conferido", tom: "amber" },
};

export function rotuloConferida(s: ResultadoBusca["situacao"]): { rotulo: string; tom: Tom } {
  if (s.startsWith("base:")) {
    const st = s.slice(5) as StatusLead;
    return { rotulo: `Na base · ${STATUS[st]?.rotulo ?? st}`, tom: "brand" };
  }
  return CONFERIDA[s] ?? { rotulo: s, tom: "gray" };
}

export const RESULTADO_INSERCAO: Record<string, string> = {
  novo: "entraram na base",
  repetido: "já estavam na base",
  ja_no_crm: "já são leads da Voob",
  ja_conversa: "já conversaram com a Voob",
  cliente_ou_equipe: "são clientes ou da equipe",
  nao_e_celular: "não são celular",
  invalido: "com telefone inválido",
};

export function resumoInsercao(contagem: Partial<Record<string, number>>): string {
  const partes = Object.entries(contagem)
    .filter(([, n]) => (n ?? 0) > 0)
    .sort(([a], [b]) => (a === "novo" ? -1 : b === "novo" ? 1 : 0))
    .map(([k, n]) => `${n} ${RESULTADO_INSERCAO[k] ?? k}`);
  return partes.join(", ") || "nada mudou";
}

export const DIAS_SEMANA: { id: number; curto: string; nome: string }[] = [
  { id: 1, curto: "seg", nome: "segunda" },
  { id: 2, curto: "ter", nome: "terça" },
  { id: 3, curto: "qua", nome: "quarta" },
  { id: 4, curto: "qui", nome: "quinta" },
  { id: 5, curto: "sex", nome: "sexta" },
  { id: 6, curto: "sáb", nome: "sábado" },
  { id: 7, curto: "dom", nome: "domingo" },
];

export function textoDias(dias: number[]): string {
  const s = [...new Set(dias)].sort((a, b) => a - b);
  if (s.join() === "1,2,3,4,5") return "de segunda a sexta";
  if (s.length === 7) return "todos os dias";
  return s.map((d) => DIAS_SEMANA.find((x) => x.id === d)?.curto ?? d).join(", ");
}

export function textoPausa(motivo: string | null | undefined): string {
  if (motivo === "saidas") return "Pausado sozinho: muita gente pediu para parar hoje.";
  if (motivo === "qualidade") return "Pausado sozinho: a qualidade do número caiu na Meta.";
  if (motivo === "manual") return "Desligado.";
  return motivo ? `Pausado: ${motivo}.` : "Desligado.";
}

export function textoNumero(n: NumeroProspeccao | null): string {
  if (!n) return "Nenhum número escolhido";
  return `${n.nome} · final ${n.final || "?"}`;
}

/** Preço aproximado de uma mensagem de marketing para o Brasil (Meta, tabela de 01/10/2026; conferir no painel). */
export const PRECO_MARKETING = 0.3217;
export const custoEstimado = (mensagens: number) => Math.round(mensagens * PRECO_MARKETING * 100) / 100;
export const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const taxaPct = (parte: number, total: number): number | null => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);

/** Funil do período para o painel. */
export function funil(p: PainelVoob) {
  const t = p.total;
  return [
    { id: "base", rotulo: "Na base", valor: t.base + t.na_fila },
    { id: "enviados", rotulo: "Receberam", valor: t.enviados },
    { id: "responderam", rotulo: "Responderam", valor: t.responderam },
    { id: "interessados", rotulo: "Querem ver", valor: t.interessados },
    { id: "no_crm", rotulo: "No CRM", valor: t.no_crm },
  ];
}

/** O texto da 1ª mensagem (o mesmo que vai para a aprovação da Meta), com o nome do negócio. */
export function textoAbertura(agente: string, negocio: string): string {
  return (
    `Olá! Aqui é a ${agente}, da Voob. Encontrei ${negocio} no Google e vi que vocês ainda não têm site. ` +
    "A gente monta o site, o CRM e uma IA que responde os seus clientes no WhatsApp na hora, até à noite e no fim de semana. " +
    "Posso te mostrar como ficaria para vocês?"
  );
}

export function textoRetomada(negocio: string): string {
  return `Oi! Passando de novo por aqui: quer que eu te mostre como ficaria o site e o atendimento com IA para ${negocio}? Se não for o momento, é só me falar.`;
}
