/**
 * Modelos (templates) do WhatsApp para o disparo da Carol — funções puras, testadas em tests/templates.test.ts.
 *
 * O Radar lê os modelos aprovados no Meta e só deixa escolher os que o Fluxo 1 sabe preencher:
 *  - variáveis do texto: {{1}} (ou {{nome}}) = primeiro nome; {{2}} (ou {{cidade}}) = "em <cidade>";
 *  - cabeçalho só de texto (imagem/vídeo/documento ainda não);
 *  - botões de resposta rápida, link fixo ou telefone (link com variável não).
 * A mesma regra está no nó "Montar Mensagem" do Fluxo 1: se mudar aqui, mude lá.
 */

export const AUTOMATICO = "automatico";

/**
 * Só modelos de prospecção entram no disparo: o nome precisa começar com isto. Assim modelos de outro uso
 * (retomada, boas-vindas, handoff da Sofia, que usam {{2}} com outro sentido) nunca vão para lead frio.
 */
export const PREFIXO_PROSPECCAO = "carol_prospeccao";

/** Modelos que o Fluxo 1 usa quando ninguém escolhe (mesma regra do nó "Montar Mensagem"). */
export const MODELO_LAVAJATO = "carol_prospeccao_lavajato";
export const MODELO_AUTONOMO = "carol_prospeccao_autonomo";

export function templateAutomatico(tipo: string): string {
  const t = String(tipo ?? "").trim().toLowerCase();
  return ["autonomo", "autônomo", "individual"].includes(t) ? MODELO_AUTONOMO : MODELO_LAVAJATO;
}

export interface ComponenteMeta {
  type: string;
  format?: string;
  text?: string;
  buttons?: { type: string; text?: string; url?: string; phone_number?: string }[];
}

/** Como o Meta devolve cada modelo em /{waba}/message_templates. */
export interface TemplateMeta {
  id?: string;
  name: string;
  status?: string;
  category?: string;
  language?: string;
  parameter_format?: string;
  components?: ComponenteMeta[];
}

export interface ModeloWhatsApp {
  nome: string;
  idioma: string;
  categoria: string;
  status: string;
  cabecalho: string;
  corpo: string;
  rodape: string;
  botoes: string[];
  utilizavel: boolean;
  /** Por que não dá para usar (vazio quando dá). */
  motivo: string;
  /** Como o contato vê, com nome e cidade de exemplo. */
  previa: string;
}

export interface DadosDoContato {
  primeiroNome: string;
  cidadeTexto: string;
}

const VAR = /\{\{\s*([\w.]+)\s*\}\}/g;

export function variaveis(texto: string): string[] {
  return [...String(texto ?? "").matchAll(VAR)].map((m) => m[1]);
}

/** O que entra em cada variável. null = o Radar não sabe preencher. */
export function valorDaVariavel(chave: string, d: DadosDoContato): string | null {
  const k = chave.trim().toLowerCase();
  if (["1", "nome", "primeiro_nome", "name", "first_name"].includes(k)) return d.primeiroNome;
  if (["2", "cidade", "regiao", "região", "city"].includes(k)) return d.cidadeTexto;
  return null;
}

const GENERICAS =
  /^(lava|lava-?jato|lavajato|jato|auto|autos|estetica|estética|car|cars|carwash|posto|lavagem|lavação|lavacao|lavador|lavadora|lavarapido|lava-?rápido|centro|center|ducha|polimento|spa|garage|garagem|studio|estúdio|oficina|mega|super|top|express|clean|lavanderia|higienização|higienizacao|detail|detailing|premium|vip|the|o|a|os|as|mr|dr)$/i;
const FEMININAS = /^(estetica|estética|lavagem|lavação|lavacao|ducha|oficina|garagem|central|loja|lavanderia|higienização|higienizacao|a|as)$/i;

/**
 * Como chamar o contato no "Oi, {{1}}!": o primeiro nome quando é gente ("Marcos Lavagem" → "Marcos");
 * quando o nome é de estabelecimento, "pessoal do/da <nome>" ("Lava Jato do Bahia" → "pessoal do Lava Jato do Bahia").
 * Mesma regra do nó "Montar Mensagem" do Fluxo 1.
 */
export function comoChamar(nome: string): string {
  const limpo = String(nome ?? "")
    .replace(/\s+[-–|•]\s.*$|\s*[(|•].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo) return "pessoal";
  const palavras = limpo.split(" ");
  if (!GENERICAS.test(palavras[0])) return palavras[0];
  const curto = limpo.length > 40 ? palavras.slice(0, 4).join(" ") : limpo;
  return `${FEMININAS.test(palavras[0]) ? "pessoal da" : "pessoal do"} ${curto}`;
}

export function dadosDoContato(nome: string, cidade: string): DadosDoContato {
  const cidadeBruta = String(cidade ?? "").trim();
  return { primeiroNome: comoChamar(nome), cidadeTexto: cidadeBruta ? `em ${cidadeBruta}` : "na sua região" };
}

export const EXEMPLO: DadosDoContato = { primeiroNome: "João", cidadeTexto: "em Belo Horizonte" };

export function preencher(texto: string, d: DadosDoContato): string {
  return String(texto ?? "").replace(VAR, (_, k: string) => valorDaVariavel(k, d) ?? `{{${k}}}`);
}

/** Botão que significa "não quero mais receber": vira o payload de opt-out que o Fluxo 2 reconhece. */
export function ehBotaoDeSaida(texto: string): boolean {
  return /n[aã]o tenho interesse|descadastr|sair da lista|parar de receber|n[aã]o quero receber/i.test(String(texto ?? ""));
}

function comp(t: TemplateMeta, tipo: string): ComponenteMeta | undefined {
  return (t.components ?? []).find((c) => String(c.type).toUpperCase() === tipo);
}

export function analisarTemplate(t: TemplateMeta): ModeloWhatsApp {
  const header = comp(t, "HEADER");
  const body = comp(t, "BODY");
  const footer = comp(t, "FOOTER");
  const botoes = comp(t, "BUTTONS")?.buttons ?? [];
  const status = String(t.status ?? "").toUpperCase();
  const categoria = String(t.category ?? "").toUpperCase();
  const idioma = String(t.language ?? "");
  const cabecalho = header && String(header.format ?? "TEXT").toUpperCase() === "TEXT" ? String(header.text ?? "") : "";
  const corpo = String(body?.text ?? "");
  const rodape = String(footer?.text ?? "");

  let motivo = "";
  const desconhecidas = [...variaveis(cabecalho), ...variaveis(corpo)].filter((v) => valorDaVariavel(v, EXEMPLO) === null);
  if (status && status !== "APPROVED") motivo = "ainda não foi aprovado pelo WhatsApp";
  else if (categoria === "AUTHENTICATION") motivo = "é um modelo de código de verificação";
  else if (!corpo) motivo = "não tem texto";
  else if (header && String(header.format ?? "TEXT").toUpperCase() !== "TEXT") motivo = "tem imagem, vídeo ou documento no cabeçalho (ainda não suportado)";
  else if (variaveis(cabecalho).length > 1) motivo = "o cabeçalho tem mais de uma variável";
  else if (desconhecidas.length) motivo = `usa variáveis que o Radar não sabe preencher (${[...new Set(desconhecidas)].map((v) => `{{${v}}}`).join(", ")})`;
  else if (botoes.some((b) => !["QUICK_REPLY", "PHONE_NUMBER", "URL"].includes(String(b.type).toUpperCase())))
    motivo = "tem um tipo de botão que o Radar não sabe enviar";
  else if (botoes.some((b) => String(b.type).toUpperCase() === "URL" && /\{\{/.test(String(b.url ?? ""))))
    motivo = "tem botão de link com variável";
  else if (!String(t.name ?? "").toLowerCase().startsWith(PREFIXO_PROSPECCAO))
    motivo = `não é de prospecção (para usar no disparo, o nome do modelo precisa começar com ${PREFIXO_PROSPECCAO}_)`;

  const previa = [preencher(cabecalho, EXEMPLO), preencher(corpo, EXEMPLO), rodape].filter(Boolean).join("\n\n");
  return {
    nome: t.name,
    idioma,
    categoria,
    status,
    cabecalho,
    corpo,
    rodape,
    botoes: botoes.map((b) => String(b.text ?? "")).filter(Boolean),
    utilizavel: motivo === "",
    motivo,
    previa,
  };
}

/** Componentes do envio (o mesmo que o Fluxo 1 monta). Exposto para teste e conferência. */
export function montarComponentes(t: TemplateMeta, d: DadosDoContato): Record<string, unknown>[] {
  const nomeado = String(t.parameter_format ?? "").toUpperCase() === "NAMED";
  const param = (k: string) => ({ type: "text", text: valorDaVariavel(k, d) ?? "", ...(nomeado ? { parameter_name: k } : {}) });
  const out: Record<string, unknown>[] = [];
  const header = comp(t, "HEADER");
  const hv = header && String(header.format ?? "TEXT").toUpperCase() === "TEXT" ? variaveis(String(header.text ?? "")) : [];
  if (hv.length) out.push({ type: "header", parameters: hv.map(param) });
  const bv = variaveis(String(comp(t, "BODY")?.text ?? ""));
  if (bv.length) out.push({ type: "body", parameters: bv.map(param) });
  (comp(t, "BUTTONS")?.buttons ?? []).forEach((b, i) => {
    if (String(b.type).toUpperCase() !== "QUICK_REPLY") return;
    out.push({
      type: "button",
      sub_type: "quick_reply",
      index: String(i),
      parameters: [{ type: "payload", payload: ehBotaoDeSaida(String(b.text ?? "")) ? "OPTOUT_PROSPECCAO" : i === 0 ? "SIM_ATENDE" : `RESPOSTA_${i + 1}` }],
    });
  });
  return out;
}

/** Nome mais amigável para a tela: "carol_prospeccao_12_meses" -> "12 meses". */
export function nomeAmigavel(nome: string): string {
  const semPrefixo = String(nome ?? "").replace(new RegExp(`^${PREFIXO_PROSPECCAO}_?`, "i"), "");
  const texto = (semPrefixo || String(nome ?? "")).replace(/_/g, " ").trim();
  return texto ? texto[0].toUpperCase() + texto.slice(1) : texto;
}
