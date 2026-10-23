/**
 * Aba "Modelos" (Chatwoot e Radar): criar modelos (templates) do WhatsApp da Carol e da Sofia e mandar para a
 * aprovação da Meta. Funções puras, testadas em tests/modelos.test.ts.
 *
 * Quem envia o modelo depois é o n8n (comando "#template nome" numa nota privada do Chatwoot, Fluxos 4 e S4), que
 * só sabe preencher {{1}} = nome do contato e, em modelos de prospecção, {{2}} = "em <cidade>". Por isso o
 * formulário só aceita essas variáveis, e nenhuma no cabeçalho, no rodapé ou em link.
 */

import { PREFIXO_PROSPECCAO, ehBotaoDeSaida, variaveis, type ComponenteMeta, type TemplateMeta } from "./templates-regras";

export type ContaWhatsApp = "carol" | "sofia";
export type CategoriaModelo = "MARKETING" | "UTILITY";

export const CONTAS: Record<ContaWhatsApp, { nome: string; prefixo: string; caixaChatwoot: number }> = {
  carol: { nome: "Carol (vendas)", prefixo: "carol_", caixaChatwoot: 2 },
  sofia: { nome: "Sofia (suporte)", prefixo: "sofia_", caixaChatwoot: 6 },
};

export function ehConta(v: unknown): v is ContaWhatsApp {
  return v === "carol" || v === "sofia";
}

/** Caixa do Chatwoot → conta do WhatsApp (2 = Carol, 6 = Sofia). */
export function contaDaCaixa(caixa: unknown): ContaWhatsApp | null {
  const n = Number(caixa);
  if (n === CONTAS.carol.caixaChatwoot) return "carol";
  if (n === CONTAS.sofia.caixaChatwoot) return "sofia";
  return null;
}

export const LIMITES = { nome: 512, cabecalho: 60, corpo: 1024, rodape: 60, botao: 25, botoes: 3, url: 2000 } as const;

export interface BotaoRascunho {
  tipo: "resposta" | "link";
  texto: string;
  url?: string;
}

export interface RascunhoModelo {
  conta: ContaWhatsApp;
  /** Como a pessoa digitou; vira o nome técnico com nomeTecnico(). */
  nome: string;
  categoria: CategoriaModelo;
  cabecalho: string;
  corpo: string;
  rodape: string;
  botoes: BotaoRascunho[];
  /** Exemplo do nome do contato, que a Meta exige quando o texto tem {{1}}. */
  exemploNome: string;
  /** Exemplo da cidade ({{2}}, só em prospecção). */
  exemploCidade: string;
}

export const RASCUNHO_VAZIO: Omit<RascunhoModelo, "conta"> = {
  nome: "",
  categoria: "MARKETING",
  cabecalho: "",
  corpo: "",
  rodape: "",
  botoes: [],
  exemploNome: "João",
  exemploCidade: "em Belo Horizonte",
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** "Retomada 12 meses!" na Carol → "carol_retomada_12_meses". Sempre com o prefixo da conta. */
export function nomeTecnico(nome: string, conta: ContaWhatsApp): string {
  const base = semAcento(String(nome ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const prefixo = CONTAS[conta].prefixo;
  const semPrefixo = base.startsWith(prefixo) ? base.slice(prefixo.length) : base;
  return semPrefixo ? `${prefixo}${semPrefixo}`.slice(0, LIMITES.nome) : "";
}

/** O modelo é de prospecção (só esses podem usar a cidade, {{2}}, e só esses entram no disparo do Radar). */
export function ehProspeccao(nomeTec: string): boolean {
  return nomeTec.startsWith(PREFIXO_PROSPECCAO);
}

export interface Validacao {
  ok: boolean;
  /** Impedem o envio para a Meta. */
  erros: string[];
  /** Não impedem, mas costumam dar recusa ou custo maior. */
  avisos: string[];
}

const PROMOCIONAL = /gr[aá]tis|promo[cç][aã]o|desconto|oferta|cupom|\d+\s?%|aproveite|imperd[ií]vel|condi[cç][aã]o especial|por tempo limitado/i;

export function validarRascunho(r: RascunhoModelo): Validacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const nome = nomeTecnico(r.nome, r.conta);
  const corpo = String(r.corpo ?? "");
  const cabecalho = String(r.cabecalho ?? "").trim();
  const rodape = String(r.rodape ?? "").trim();
  const botoes = r.botoes ?? [];

  if (!nome) erros.push("Dê um nome ao modelo (ex.: retomada 12 meses).");
  if (r.categoria !== "MARKETING" && r.categoria !== "UTILITY") erros.push("Escolha a categoria: marketing ou utilidade.");

  if (!corpo.trim()) erros.push("Escreva o texto da mensagem.");
  if (corpo.length > LIMITES.corpo) erros.push(`O texto tem ${corpo.length} caracteres; o máximo da Meta é ${LIMITES.corpo}.`);
  const vars = variaveis(corpo);
  const aceitas = ehProspeccao(nome) ? ["1", "2"] : ["1"];
  const estranhas = [...new Set(vars.filter((v) => !aceitas.includes(v)))];
  if (estranhas.length) {
    erros.push(
      estranhas.includes("2") && !ehProspeccao(nome)
        ? `A cidade ({{2}}) só funciona em modelo de prospecção (nome começando com ${PREFIXO_PROSPECCAO}). Use só {{1}} (nome do contato).`
        : `Variável que o envio não sabe preencher: ${estranhas.map((v) => `{{${v}}}`).join(", ")}. Use {{1}} (nome do contato)${ehProspeccao(nome) ? " e {{2}} (cidade)" : ""}.`,
    );
  }
  if (vars.includes("2") && !vars.includes("1")) erros.push("Se usar {{2}}, use também {{1}} (a Meta exige variáveis em sequência).");
  if (vars.length && /^\s*\{\{/.test(corpo)) erros.push("A Meta não aceita texto começando com variável. Comece com uma palavra (ex.: Oi, {{1}}!).");
  if (vars.length && /\}\}\s*$/.test(corpo)) erros.push("A Meta não aceita texto terminando com variável. Termine com uma palavra ou pontuação.");
  if (/\}\}\s*\{\{/.test(corpo)) erros.push("Duas variáveis coladas são recusadas pela Meta. Coloque texto entre elas.");
  if (vars.length && corpo.replace(/\{\{\s*\w+\s*\}\}/g, "").trim().length < 15 * vars.length)
    avisos.push("Texto curto para a quantidade de variáveis: a Meta costuma recusar. Escreva um pouco mais.");
  if (vars.includes("1") && !String(r.exemploNome ?? "").trim()) erros.push("Preencha o exemplo do nome (a Meta pede um exemplo para cada variável).");
  if (vars.includes("2") && !String(r.exemploCidade ?? "").trim()) erros.push("Preencha o exemplo da cidade.");
  if (/\n{3,}/.test(corpo)) avisos.push("Mais de uma linha em branco seguida: a Meta pode recusar.");

  if (cabecalho.length > LIMITES.cabecalho) erros.push(`O título tem ${cabecalho.length} caracteres; o máximo é ${LIMITES.cabecalho}.`);
  if (/\{\{/.test(cabecalho)) erros.push("O título não pode ter variável.");
  if (/[\n*_~]/.test(cabecalho)) erros.push("O título não aceita quebra de linha nem formatação (*, _, ~).");
  if (/\p{Extended_Pictographic}/u.test(cabecalho)) erros.push("O título não aceita emoji (regra da Meta).");
  if (rodape.length > LIMITES.rodape) erros.push(`O rodapé tem ${rodape.length} caracteres; o máximo é ${LIMITES.rodape}.`);
  if (/\{\{/.test(rodape)) erros.push("O rodapé não pode ter variável.");

  if (botoes.length > LIMITES.botoes) erros.push(`No máximo ${LIMITES.botoes} botões.`);
  const textos = new Set<string>();
  botoes.forEach((b, i) => {
    const t = String(b.texto ?? "").trim();
    const n = i + 1;
    if (!t) erros.push(`O botão ${n} está sem texto.`);
    if (t.length > LIMITES.botao) erros.push(`O botão ${n} tem ${t.length} caracteres; o máximo é ${LIMITES.botao}.`);
    if (t && textos.has(t.toLowerCase())) erros.push(`Dois botões com o mesmo texto ("${t}").`);
    textos.add(t.toLowerCase());
    if (b.tipo === "link") {
      const url = String(b.url ?? "").trim();
      if (!/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(url)) erros.push(`O botão ${n} precisa de um link começando com https://.`);
      else if (url.length > LIMITES.url) erros.push(`O link do botão ${n} é longo demais.`);
      if (/\{\{/.test(url)) erros.push(`O link do botão ${n} não pode ter variável.`);
    }
  });
  const grupos = botoes.filter((b, i) => i === 0 || b.tipo !== botoes[i - 1].tipo).length;
  if (grupos > 2) erros.push("Deixe os botões de resposta juntos e os de link juntos (a Meta não aceita intercalados).");

  if (r.categoria === "UTILITY" && PROMOCIONAL.test(`${cabecalho}\n${corpo}\n${rodape}`))
    avisos.push("O texto tem cara de promoção (grátis, desconto, oferta…). Na categoria utilidade a Meta costuma recusar ou mudar para marketing.");
  if (r.categoria === "MARKETING" && !botoes.some((b) => b.tipo === "resposta" && ehBotaoDeSaida(b.texto)))
    avisos.push('Modelo de marketing: vale incluir um botão "Não tenho interesse". Quem toca nele sai da lista sozinho, e isso protege a qualidade do número.');

  return { ok: erros.length === 0, erros, avisos };
}

/** O que vai no POST /{waba}/message_templates (só chamar com o rascunho validado). */
export function payloadMeta(r: RascunhoModelo): { name: string; language: string; category: CategoriaModelo; parameter_format: "POSITIONAL"; components: Record<string, unknown>[] } {
  const corpo = String(r.corpo ?? "");
  const vars = [...new Set(variaveis(corpo))].sort();
  const exemplos = vars.map((v) => (v === "2" ? String(r.exemploCidade).trim() : String(r.exemploNome).trim()));
  const components: Record<string, unknown>[] = [];
  const cabecalho = String(r.cabecalho ?? "").trim();
  const rodape = String(r.rodape ?? "").trim();
  if (cabecalho) components.push({ type: "HEADER", format: "TEXT", text: cabecalho });
  components.push({ type: "BODY", text: corpo.trim(), ...(vars.length ? { example: { body_text: [exemplos] } } : {}) });
  if (rodape) components.push({ type: "FOOTER", text: rodape });
  if (r.botoes?.length) {
    components.push({
      type: "BUTTONS",
      buttons: r.botoes.map((b) =>
        b.tipo === "link" ? { type: "URL", text: b.texto.trim(), url: String(b.url ?? "").trim() } : { type: "QUICK_REPLY", text: b.texto.trim() },
      ),
    });
  }
  return { name: nomeTecnico(r.nome, r.conta), language: "pt_BR", category: r.categoria, parameter_format: "POSITIONAL", components };
}

/** O rascunho como a Meta devolveria (para a prévia usar o mesmo componente da lista). */
export function rascunhoComoTemplate(r: RascunhoModelo): TemplateMeta {
  const p = payloadMeta(r);
  return { name: p.name || "novo_modelo", status: "RASCUNHO", category: p.category, language: p.language, components: p.components as unknown as ComponenteMeta[] };
}

/** Como a tela mostra o status da Meta. */
export function statusDoModelo(status: string): { rotulo: string; tom: "green" | "amber" | "red" | "gray"; explica: string } {
  switch (String(status ?? "").toUpperCase()) {
    case "APPROVED":
      return { rotulo: "Aprovado", tom: "green", explica: "Pronto para enviar." };
    case "PENDING":
    case "IN_APPEAL":
      return { rotulo: "Em análise", tom: "amber", explica: "A Meta costuma responder em minutos, às vezes em até 24 h." };
    case "REJECTED":
      return { rotulo: "Recusado", tom: "red", explica: "A Meta não aprovou. Ajuste o texto e crie de novo com outro nome." };
    case "PAUSED":
      return { rotulo: "Pausado", tom: "amber", explica: "A Meta pausou por avaliações negativas de quem recebeu." };
    case "DISABLED":
      return { rotulo: "Desativado", tom: "red", explica: "A Meta desativou o modelo." };
    case "PENDING_DELETION":
      return { rotulo: "Sendo apagado", tom: "gray", explica: "" };
    case "RASCUNHO":
      return { rotulo: "Rascunho", tom: "gray", explica: "" };
    default:
      return { rotulo: status || "?", tom: "gray", explica: "" };
  }
}

const MOTIVOS: Record<string, string> = {
  ABUSIVE_CONTENT: "conteúdo considerado abusivo",
  INCORRECT_CATEGORY: "categoria errada (ex.: promoção marcada como utilidade)",
  INVALID_FORMAT: "formato inválido (variáveis, exemplos ou formatação)",
  SCAM: "parecido com golpe",
  PROMOTIONAL: "conteúdo promocional numa categoria que não permite",
  TAG_CONTENT_MISMATCH: "o texto não combina com a categoria escolhida",
  NONE: "",
};

export function motivoDaRecusa(motivo: string | undefined): string {
  const m = String(motivo ?? "").toUpperCase();
  if (!m) return "";
  return MOTIVOS[m] ?? m.toLowerCase().replace(/_/g, " ");
}

/**
 * Templates da assistente x da automação. Nas contas da Meta também ficam os que só a automação usa: avisos para a
 * equipe (alerta_*, dono_*), lembretes de agendamento e, na conta da Sofia, alguns carol_* de repasse. Esses não são
 * para enviar à mão: na tela ficam numa seção fechada, sem envio (mesma regra da aba "📤 Enviar Template").
 */
export function ehDaAssistente(nome: string, conta: ContaWhatsApp): boolean {
  const n = String(nome ?? "").toLowerCase();
  return n.startsWith(CONTAS[conta].prefixo) && !/^(alerta|dono)_/.test(n);
}

/**
 * Por que um template não pode ser enviado ao cliente pela aba "📤 Enviar Template" (vazio = pode).
 * O envio (n8n) só preenche {{1}} = nome e, em prospecção, {{2}} = cidade; título só de texto.
 */
export function motivoSemEnvio(t: { nome: string; status: string; cabecalho: string; corpo: string }, conta: ContaWhatsApp): string {
  if (!ehDaAssistente(t.nome, conta)) return "é da automação (avisos e lembretes automáticos)";
  if (String(t.status ?? "").toUpperCase() !== "APPROVED") return "ainda não foi aprovado pela Meta";
  const aceitas = ehProspeccao(t.nome) ? ["1", "2"] : ["1"];
  const estranhas = [...new Set([...variaveis(t.cabecalho), ...variaveis(t.corpo)].filter((v) => !aceitas.includes(v)))];
  if (estranhas.length) return `usa campos que só a automação preenche (${estranhas.map((v) => `{{${v}}}`).join(", ")})`;
  return "";
}
