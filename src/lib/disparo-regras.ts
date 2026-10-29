/**
 * Regras do disparo (funções puras, testadas em tests/disparo.test.ts).
 *
 * O disparo em si é feito pelo n8n ("Fluxo 1 - Disparo de Leads"): ele lê a aba leads,
 * pega quem está com status "pendente" (e sem optout) e, para cada um, manda o template
 * da Carol e grava na planilha:
 *   - status "enviado" + mensagem_enviada_em = "29/09/2026, 21:13:05"
 *   - status "sem_whatsapp" + mensagem_enviada_em = "erro: número não existe no WhatsApp - 29/09/2026, 21:13:05"
 * O Radar acompanha o progresso lendo essas colunas.
 */

import { phoneKey } from "./phone";
import { isOptout, type HeaderMap } from "./sheet-mapping";

export type SituacaoDisparo = "pendente" | "aguardando" | "enviado" | "sem_whatsapp" | "outro";

export interface LinhaFila {
  /** Número da linha na planilha (a 1 é o cabeçalho). */
  linha: number;
  key: string;
  telefone: string;
  nome: string;
  cidade: string;
  tipo: string;
  status: string;
  situacao: SituacaoDisparo;
  optout: boolean;
  /** Quando a Carol mexeu nesta linha (ms), se der para ler. */
  quando: number | null;
  detalhe: string;
  /** Modelo do WhatsApp gravado pelo Radar no disparo (vazio em disparos antigos). */
  template: string;
}

const BRASILIA_MS = 3 * 60 * 60 * 1000; // Brasília = UTC−3 (sem horário de verão desde 2019)

/**
 * Lê a data que o n8n grava ("29/09/2026, 21:13:05", às vezes dentro de um texto de erro)
 * ou um número de data do Sheets (dias desde 30/12/1899). Hora de Brasília.
 */
export function lerDataHora(valor: unknown): number | null {
  if (typeof valor === "number" && Number.isFinite(valor) && valor > 20000 && valor < 80000) {
    return Math.round((valor - 25569) * 86_400_000) + BRASILIA_MS;
  }
  const texto = String(valor ?? "");
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(texto);
  if (m) {
    const [, d, mo, a, h, mi, s] = m;
    return Date.UTC(Number(a), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)) + BRASILIA_MS;
  }
  const iso = Date.parse(texto);
  return /\d{4}-\d{2}-\d{2}T/.test(texto) && Number.isFinite(iso) ? iso : null;
}

export function situacaoDoStatus(status: string): SituacaoDisparo {
  const s = status.trim().toLowerCase();
  if (s === "pendente") return "pendente";
  if (s === "aguardando") return "aguardando";
  if (s === "enviado" || s === "enviada") return "enviado";
  if (s === "sem_whatsapp" || s === "sem whatsapp") return "sem_whatsapp";
  return "outro";
}

/** Linhas da aba leads (sem o cabeçalho) no formato do disparo. */
export function linhasDaFila(rows: unknown[][], map: HeaderMap): LinhaFila[] {
  const col = (row: unknown[], i: number | undefined) => (i === undefined ? "" : row[i]);
  const out: LinhaFila[] = [];
  rows.forEach((row, i) => {
    if (!row || row.every((c) => String(c ?? "").trim() === "")) return;
    const telefoneBruto = String(col(row, map.telefone) ?? "").trim();
    const status = String(col(row, map.status) ?? "").trim();
    const enviadaEm = col(row, map.mensagem_enviada_em);
    const optoutCel = col(row, map.optout);
    out.push({
      linha: i + 2,
      key: phoneKey(telefoneBruto),
      telefone: telefoneBruto,
      nome: String(col(row, map.nome) ?? "").trim(),
      cidade: String(col(row, map.cidade) ?? "").trim(),
      tipo: String(col(row, map.tipo) ?? "").trim(),
      status,
      situacao: situacaoDoStatus(status),
      optout: map.optout !== undefined && isOptout(optoutCel),
      quando: lerDataHora(enviadaEm),
      detalhe: typeof enviadaEm === "string" && /erro/i.test(enviadaEm) ? enviadaEm.replace(/\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}.*$/, "") : "",
      template: String(col(row, map.template) ?? "").trim(),
    });
  });
  return out;
}

/** Quem o n8n dispara quando roda: status pendente, com telefone e sem optout (mesma regra do fluxo). */
export function paraON8n(l: LinhaFila): boolean {
  return l.situacao === "pendente" && !l.optout && l.telefone.replace(/\D/g, "").length > 0;
}

/** Fila do Radar: pendentes + quem ficou "aguardando" num disparo anterior (com telefone e sem optout). */
export function naFila(l: LinhaFila): boolean {
  return (l.situacao === "pendente" || l.situacao === "aguardando") && !l.optout && l.telefone.replace(/\D/g, "").length > 0;
}

/**
 * Mudanças de status para disparar só para os escolhidos: eles viram "pendente" e todo outro
 * pendente (que o n8n pegaria) vira "aguardando". Quem já está certo não é tocado.
 */
export function mudancasParaDisparo(
  linhas: LinhaFila[],
  escolhidos: Set<string>,
  statusAguardando: string,
  /** Modelo do WhatsApp de cada escolhido (gravado na coluna "template"). */
  templatePara?: (l: LinhaFila) => string,
) {
  const mudancas: { linha: number; key: string; status: string; de: string; template?: string }[] = [];
  const jaVai = new Set<string>(); // o mesmo telefone em duas linhas recebe uma vez só
  for (const l of linhas) {
    if (!l.key) continue;
    if (escolhidos.has(l.key) && naFila(l) && !jaVai.has(l.key)) {
      jaVai.add(l.key);
      const template = templatePara?.(l);
      if (l.situacao !== "pendente" || (template !== undefined && template !== l.template)) {
        mudancas.push({ linha: l.linha, key: l.key, status: "pendente", de: l.status, ...(template !== undefined ? { template } : {}) });
      }
    } else if (paraON8n(l)) {
      mudancas.push({ linha: l.linha, key: l.key, status: statusAguardando, de: l.status });
    }
  }
  return mudancas;
}

/** "2026-09-29" em Brasília. */
export function diaBrasilia(ms: number): string {
  return new Date(ms - BRASILIA_MS).toISOString().slice(0, 10);
}

export interface ResumoDia {
  enviadosHoje: number;
  semWhatsappHoje: number;
  ultimoMovimento: number | null;
}

export function resumoDoDia(linhas: LinhaFila[], agora = Date.now()): ResumoDia {
  const hoje = diaBrasilia(agora);
  let enviadosHoje = 0;
  let semWhatsappHoje = 0;
  let ultimoMovimento: number | null = null;
  for (const l of linhas) {
    if (l.quando === null) continue;
    if (ultimoMovimento === null || l.quando > ultimoMovimento) ultimoMovimento = l.quando;
    if (diaBrasilia(l.quando) !== hoje) continue;
    if (l.situacao === "enviado") enviadosHoje++;
    else if (l.situacao === "sem_whatsapp") semWhatsappHoje++;
  }
  return { enviadosHoje, semWhatsappHoje, ultimoMovimento };
}

/** Sem novidade na planilha há mais que isso = o n8n parou (limite diário, erro ou fim). */
export const PARADO_APOS_MS = 4 * 60_000;
/** Com a trava instalada o n8n avisa o Radar a cada contato: silêncio mais curto já indica que parou. */
export const PARADO_COM_TRAVA_MS = 100_000;
/** Depois de pausar, o n8n precisa ficar este tempo em silêncio para o Radar ter certeza de que parou. */
export const SILENCIO_PARA_RETOMAR_MS = 60_000;
/** Um lead leva ~10–15 s de espera + ~5–10 s de envio e registros. */
export const SEGUNDOS_POR_LEAD = 22;

export type EstadoDisparo = "enviando" | "concluido" | "parado" | "pausado" | "cancelado";

/** Pausa ou cancelamento pedido no Radar. */
export interface Interrupcao {
  como: "pausado" | "cancelado";
  em: number;
}

export interface ItemDisparo {
  key: string;
  nome: string;
  telefone: string;
  cidade: string;
  situacao: SituacaoDisparo | "sumiu";
  quando: number | null;
  detalhe: string;
}

export interface ProgressoDisparo {
  iniciadoEm: number;
  total: number;
  enviados: number;
  semWhatsapp: number;
  outros: number;
  /** Quem ainda não recebeu (na vez, ou de volta à fila depois de pausar/cancelar). */
  aguardando: number;
  estado: EstadoDisparo;
  ultimoMovimento: number | null;
  segundosRestantes: number;
  itens: ItemDisparo[];
  /** Quando foi pausado/cancelado no Radar. */
  interrompidoEm: number | null;
  /** Quando o disparo foi retomado depois de uma pausa. */
  retomadoEm: number | null;
  /** O n8n consultou a trava do Radar durante este disparo (Pausar/Cancelar funcionam no meio do envio). */
  travaConfirmada: boolean;
  /** Contato que a trava acabou de liberar (a mensagem está saindo agora). */
  enviandoAgora: string | null;
  /** A partir de quando dá para continuar (0 = já dá). Só faz sentido pausado ou parado. */
  podeContinuarEm: number;
  /** O WhatsApp recusou o envio e o n8n parou (ex.: modelo com variáveis erradas). */
  erro: { codigo: number | null; mensagem: string } | null;
}

/** Erro de envio que o n8n avisou ao Radar (o contato continua na fila). */
export interface ErroDeEnvio {
  em: number;
  codigo: number | null;
  detalhe: string;
}

/** Explicação simples do erro do WhatsApp (Meta Cloud API). */
export function mensagemDoErro(codigo: number | null, detalhe = ""): string {
  const porCodigo: Record<number, string> = {
    132000: "O número de variáveis do modelo não bate com o que foi enviado.",
    132001: "O modelo não existe ou não está aprovado em português.",
    132005: "O texto do modelo ficou grande demais depois de preenchido.",
    132007: "O WhatsApp recusou o conteúdo do modelo (política).",
    132012: "As variáveis do modelo estão no formato errado.",
    132015: "O WhatsApp pausou este modelo por baixa qualidade.",
    132016: "O WhatsApp desativou este modelo.",
    131056: "Muitas mensagens para o mesmo número em pouco tempo. Tente de novo em alguns minutos.",
    130429: "Muitas mensagens em pouco tempo. Tente de novo em alguns minutos.",
    131048: "O WhatsApp está limitando os envios deste número por denúncias de spam.",
    131031: "A conta do WhatsApp da Carol está bloqueada ou restrita.",
    133010: "O número da Carol não está registrado no WhatsApp.",
    190: "O acesso ao WhatsApp expirou. Fale com o administrador do Radar.",
  };
  if (codigo !== null && porCodigo[codigo]) return porCodigo[codigo];
  const d = String(detalhe ?? "").trim().slice(0, 160);
  return `O WhatsApp recusou o envio${codigo !== null ? ` (erro ${codigo})` : ""}${d ? `: ${d}` : "."}`;
}

export interface ExtrasDoProgresso {
  interrompido?: Interrupcao | null;
  retomadoEm?: number | null;
  /** Última vez que o n8n consultou a trava (qualquer execução). */
  ultimaTrava?: number | null;
  /** A trava respondeu "parar" para a execução antiga depois da pausa. */
  paradaConfirmadaEm?: number | null;
  /** Último movimento da Carol na planilha (qualquer contato). */
  ultimoMovimentoGeral?: number | null;
  enviandoAgora?: { key: string; em: number } | null;
  /** Último erro de envio que o n8n avisou (o n8n parou nele). */
  erro?: ErroDeEnvio | null;
}

/** Progresso de um disparo: os contatos que estavam na fila quando ele começou. */
export function progressoDoDisparo(
  chaves: string[],
  iniciadoEm: number,
  linhas: LinhaFila[],
  agora = Date.now(),
  extras: ExtrasDoProgresso = {},
): ProgressoDisparo {
  const porChave = new Map<string, LinhaFila>();
  for (const l of linhas) if (l.key && !porChave.has(l.key)) porChave.set(l.key, l);
  let enviados = 0;
  let semWhatsapp = 0;
  let outros = 0;
  let aguardando = 0;
  let ultimoMovimento: number | null = null;
  const itens: ItemDisparo[] = chaves.map((key) => {
    const l = porChave.get(key);
    if (!l) {
      outros++;
      return { key, nome: "", telefone: key, cidade: "", situacao: "sumiu", quando: null, detalhe: "linha não encontrada na planilha" };
    }
    if (l.situacao === "pendente" || l.situacao === "aguardando") aguardando++;
    else if (l.situacao === "enviado") enviados++;
    else if (l.situacao === "sem_whatsapp") semWhatsapp++;
    else outros++;
    // Só conta movimento que aconteceu depois do início deste disparo.
    if (l.situacao !== "pendente" && l.quando !== null && l.quando >= iniciadoEm - 60_000) {
      if (ultimoMovimento === null || l.quando > ultimoMovimento) ultimoMovimento = l.quando;
    }
    return { key, nome: l.nome, telefone: l.telefone, cidade: l.cidade, situacao: l.situacao, quando: l.quando, detalhe: l.detalhe };
  });
  const inicioValido = Math.max(iniciadoEm, extras.retomadoEm ?? 0);
  const travaConfirmada = extras.ultimaTrava != null && extras.ultimaTrava >= inicioValido - 5_000;
  const referencia = Math.max(inicioValido, ultimoMovimento ?? 0, travaConfirmada ? (extras.ultimaTrava ?? 0) : 0);
  const silencioMax = travaConfirmada ? PARADO_COM_TRAVA_MS : PARADO_APOS_MS;
  const interrompido = extras.interrompido ?? null;
  // Erro avisado pelo n8n depois do início (ou da retomada): o fluxo parou nele.
  const erroDeste = extras.erro && extras.erro.em >= inicioValido - 5_000 ? extras.erro : null;
  const estado: EstadoDisparo =
    aguardando === 0
      ? "concluido"
      : interrompido
        ? interrompido.como
        : erroDeste || agora - referencia > silencioMax
          ? "parado"
          : "enviando";

  // Continuar só quando a execução antiga do n8n com certeza parou: a trava confirmou,
  // ou o n8n ficou em silêncio (sem consultar a trava e sem mexer na planilha) por 1 minuto.
  let podeContinuarEm = 0;
  if (estado === "pausado" || estado === "parado") {
    // O n8n avisou o erro e encerrou a execução ali: já dá para continuar (ou cancelar).
    const confirmou =
      (interrompido && extras.paradaConfirmadaEm != null && extras.paradaConfirmadaEm >= interrompido.em) ||
      (!interrompido && erroDeste !== null && erroDeste.em >= (extras.ultimaTrava ?? 0));
    if (!confirmou) {
      const ultimoSinal = Math.max(extras.ultimaTrava ?? 0, extras.ultimoMovimentoGeral ?? 0, ultimoMovimento ?? 0, interrompido?.em ?? 0);
      const liberaEm = ultimoSinal + SILENCIO_PARA_RETOMAR_MS;
      podeContinuarEm = liberaEm > agora ? liberaEm : 0;
    }
  }

  const agoraSaindo =
    estado === "enviando" && extras.enviandoAgora && agora - extras.enviandoAgora.em < 45_000 ? extras.enviandoAgora.key : null;
  const enviandoAgora = agoraSaindo && itens.some((i) => i.key === agoraSaindo && i.situacao === "pendente") ? agoraSaindo : null;

  // Ordem: quem já foi (mais recente primeiro), o que está saindo agora, depois quem está esperando.
  const peso = (i: ItemDisparo) => (i.situacao === "pendente" || i.situacao === "aguardando" ? (i.key === enviandoAgora ? 1 : 2) : 0);
  itens.sort((a, b) => {
    const pa = peso(a);
    const pb = peso(b);
    if (pa !== pb) return pa - pb;
    return pa === 0 ? (b.quando ?? 0) - (a.quando ?? 0) : 0;
  });
  return {
    iniciadoEm,
    total: chaves.length,
    enviados,
    semWhatsapp,
    outros,
    aguardando,
    estado,
    ultimoMovimento,
    segundosRestantes: estado === "enviando" ? aguardando * SEGUNDOS_POR_LEAD : 0,
    itens,
    interrompidoEm: interrompido?.em ?? null,
    retomadoEm: extras.retomadoEm ?? null,
    travaConfirmada,
    enviandoAgora,
    podeContinuarEm,
    erro: erroDeste && estado === "parado" ? { codigo: erroDeste.codigo, mensagem: mensagemDoErro(erroDeste.codigo, erroDeste.detalhe) } : null,
  };
}

export interface StatusDisparo {
  configurado: boolean;
  simulacao: boolean;
  /** Só o endereço do n8n (sem caminho), para mostrar na tela. */
  destino: string;
  fila: number;
  /** Quem está na fila (pendente ou aguardando), na ordem da planilha. */
  itensFila: { key: string; linha: number; nome: string; telefone: string; cidade: string; tipo: string; situacao: "pendente" | "aguardando" }[];
  hoje: ResumoDia;
  /** Limite que vale hoje: o do Radar, com o freio da saúde do número (metade ou 0). */
  limiteDiario: number;
  /** O limite fica no banco (atendimento.config) e dá para mudar pelo Radar. */
  limiteEditavel: boolean;
  /** Quando o limite foi mudado pela última vez (ISO), se veio do banco. */
  limiteMudadoEm: string | null;
  /** A Carol mexeu na planilha há pouco e não foi o disparo acompanhado pelo Radar: alguém rodou o fluxo no n8n. */
  movimentoRecente: boolean;
  /** Números bloqueados (ex.: o próprio Lavacar) que estão pendentes na planilha: travam o disparo. */
  bloqueadosNaFila: { nome: string; telefone: string; linha: number }[];
  atual: ProgressoDisparo | null;
  /** Trava de segurança no n8n (o Fluxo 1 pergunta ao Radar antes de cada mensagem). */
  trava: { ultimaEm: number | null; chaveErradaEm: number | null };
  /** Modelo do WhatsApp do disparo atual (null = automático: lava-jato ou autônomo). */
  modeloAtual: string | null;
  /** Limite escolhido no Radar (limiteDiario é o que vale hoje, já com o freio da saúde do número). */
  limiteConfigurado: number;
  /** Saúde do número da Carol na Meta (null = banco fora do ar ou não configurado). */
  saude: SaudeNumero | null;
  atualizadoEm: number;
}

// ---------------------------------------------------------------------------
// Limite diário de disparos da Carol (23/10/2026). Fica no banco (atendimento.config); o Fluxo 1 do n8n lê
// de lá antes de cada disparo. O banco também recusa fora de 1 a 250.
export const LIMITE_DIARIO_MIN = 1;
/** Teto mais baixo da Meta para conversas novas por dia num número comercial. */
export const LIMITE_DIARIO_MAX = 250;
/** Acima disso, o Radar recomenda subir aos poucos. */
export const LIMITE_DIARIO_AVISO = 50;

export function validarLimiteDiario(v: unknown): { ok: true; valor: number } | { ok: false; erro: string } {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, erro: "Digite um número inteiro de mensagens por dia." };
  if (n < LIMITE_DIARIO_MIN) return { ok: false, erro: `O mínimo é ${LIMITE_DIARIO_MIN} mensagem por dia.` };
  if (n > LIMITE_DIARIO_MAX) return { ok: false, erro: `O máximo é ${LIMITE_DIARIO_MAX} por dia (o teto mais baixo da Meta para conversas novas).` };
  return { ok: true, valor: n };
}

/** Aviso antes de salvar um limite alto ou um aumento grande de uma vez. */
export function avisoDoLimite(novo: number, atual: number): string | null {
  if (novo > LIMITE_DIARIO_AVISO) {
    return `Acima de ${LIMITE_DIARIO_AVISO} por dia, suba aos poucos (por exemplo, +20% por semana) e acompanhe se as pessoas bloqueiam ou denunciam a Carol: isso derruba a qualidade do número na Meta.`;
  }
  if (atual > 0 && novo > atual * 2) return "É um aumento grande de uma vez. O mais seguro é subir aos poucos e acompanhar as respostas.";
  return null;
}

// ---------------------------------------------------------------------------
// Saúde do número da Carol na Meta (23/10/2026). O n8n lê a Meta de hora em hora e grava no banco;
// atendimento.carol_saude_atual() devolve a situação e o limite que vale agora (o Fluxo 1 usa o mesmo).
// Amarela = limite do dia pela metade; vermelha, sinalizado, restrito ou bloqueado = disparos pausados.
export type FreioSaude = "normal" | "metade" | "pausado" | "sem_leitura";

export interface SaudeNumero {
  freio: FreioSaude;
  /** Limite que a equipe escolheu no Radar. */
  limiteConfigurado: number;
  /** Limite que vale hoje, já com o freio (0 = pausado). */
  limiteEfetivo: number;
  /** Explicação do freio (vazio quando não há freio). */
  motivo: string;
  /** Última leitura da Meta que funcionou (ISO). */
  checadoEm: string | null;
  qualidade: "GREEN" | "YELLOW" | "RED" | "UNKNOWN" | null;
  qualidadeTexto: string;
  situacaoTexto: string;
  nome: string | null;
  nomeStatus: string | null;
  /** Limite de conversas da Meta (ex.: TIER_250), quando a Meta informa. */
  limiteMeta: string | null;
  /** Avisos da Meta sobre envio, já em português quando conhecidos. */
  avisos: string[];
  ultimaTentativaEm: string | null;
  ultimaTentativaOk: boolean | null;
  ultimoErro: string | null;
  enviadosHoje: number;
  semWhatsappHoje: number;
  /** Pessoas que pediram para não receber mais nos últimos 7 dias. */
  optouts7d: number;
}

const FREIOS: FreioSaude[] = ["normal", "metade", "pausado", "sem_leitura"];
const QUALIDADES = ["GREEN", "YELLOW", "RED", "UNKNOWN"] as const;

function inteiro(v: unknown, padrao = 0): number {
  const n = Number(v);
  return v !== null && v !== "" && Number.isInteger(n) ? n : padrao;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * 29/10/2026 (pedido do Jean): o Radar não mostra mais "envio limitado pela Meta" nem "nome de exibição
 * recusado/pendente". São avisos permanentes da conta (não mudam o freio) e só poluíam o cartão.
 */
const SITUACAO_OCULTA = /^(envio limitado pela meta|nome de exibi[cç][aã]o (recusado|pendente|em an[aá]lise|n[aã]o aprovado))$/i;
const AVISO_OCULTO = /nome de exibi[cç][aã]o|envio (est[aá] )?limitado/i;

/** Tira da situação ("conectado; envio limitado pela Meta; ...") os itens que o Radar não mostra. */
export function situacaoVisivel(texto: string): string {
  return texto
    .split(";")
    .map((t) => t.trim())
    .filter((t) => t && !SITUACAO_OCULTA.test(t))
    .join("; ");
}

/** Converte o jsonb de atendimento.carol_saude_atual() (ou o texto dele). Inválido = null. */
export function saudeDoBanco(bruto: unknown): SaudeNumero | null {
  let a = bruto;
  if (typeof a === "string") {
    try {
      a = JSON.parse(a);
    } catch {
      return null;
    }
  }
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const r = a as Record<string, unknown>;
  const freio = FREIOS.includes(r.freio as FreioSaude) ? (r.freio as FreioSaude) : null;
  const configurado = inteiro(r.limite_configurado, -1);
  const efetivo = inteiro(r.limite_efetivo, -1);
  if (!freio || configurado < 0 || efetivo < 0) return null;
  const q = String(r.qualidade ?? "").toUpperCase();
  return {
    freio,
    limiteConfigurado: configurado,
    limiteEfetivo: efetivo,
    motivo: texto(r.motivo) ?? "",
    checadoEm: iso(r.checado_em),
    qualidade: (QUALIDADES as readonly string[]).includes(q) ? (q as SaudeNumero["qualidade"]) : null,
    qualidadeTexto: texto(r.qualidade_pt) ?? "sem nota da Meta",
    situacaoTexto: situacaoVisivel(texto(r.situacao_pt) ?? ""),
    nome: texto(r.nome),
    nomeStatus: texto(r.nome_status),
    limiteMeta: texto(r.limite_meta),
    avisos: Array.isArray(r.avisos) ? r.avisos.filter((x): x is string => typeof x === "string" && x.trim() !== "" && !AVISO_OCULTO.test(x)).slice(0, 5) : [],
    ultimaTentativaEm: iso(r.ultima_tentativa_em),
    ultimaTentativaOk: typeof r.ultima_tentativa_ok === "boolean" ? r.ultima_tentativa_ok : null,
    ultimoErro: texto(r.ultimo_erro),
    enviadosHoje: inteiro(r.enviados_hoje),
    semWhatsappHoje: inteiro(r.sem_whatsapp_hoje),
    optouts7d: inteiro(r.optouts_7d),
  };
}

/**
 * Por que a trava deve parar o disparo por causa da saúde do número ("" = pode seguir).
 * Pausado para tudo; com a metade, para quando os enviados de hoje chegam ao limite reduzido.
 */
export function motivoDaSaude(s: SaudeNumero | null, enviadosHoje: number): string {
  if (!s) return "";
  if (s.freio === "pausado") return "disparos pausados pela saúde do número da Carol na Meta";
  if (s.freio === "metade" && enviadosHoje >= s.limiteEfetivo) {
    return `limite do dia reduzido pela saúde do número (${enviadosHoje} de ${s.limiteEfetivo})`;
  }
  return "";
}

/** "TIER_250" vira "250 conversas novas por dia". */
export function limiteMetaTexto(tier: string | null): string | null {
  if (!tier) return null;
  if (/UNLIMITED/i.test(tier)) return "sem limite de conversas novas";
  const m = /TIER_(\d+)(K?)/i.exec(tier);
  if (!m) return null;
  const qtd = Number(m[1]) * (m[2] ? 1000 : 1);
  return `${qtd.toLocaleString("pt-BR")} conversas novas por dia`;
}

/** Situação de mentira para o modo simulação (MOCK_SAUDE=verde|amarela|vermelha|sem). */
export function saudeSimulada(modo: string | undefined, limite: number, enviadosHoje: number, agora = Date.now()): SaudeNumero {
  const m = (modo ?? "verde").toLowerCase();
  const freio: FreioSaude = m === "amarela" ? "metade" : m === "vermelha" ? "pausado" : m === "sem" ? "sem_leitura" : "normal";
  const efetivo = freio === "pausado" ? 0 : freio === "metade" ? Math.max(1, Math.ceil(limite / 2)) : limite;
  const qualidade = freio === "metade" ? "YELLOW" : freio === "pausado" ? "RED" : freio === "sem_leitura" ? null : "GREEN";
  const motivos: Record<FreioSaude, string> = {
    pausado: "Disparos pausados: vermelha (baixa), conectado.",
    metade: `Qualidade amarela na Meta: o limite do dia caiu de ${limite} para ${efetivo}.`,
    sem_leitura: "Sem leitura da Meta há mais de 3 horas: vale o limite normal.",
    normal: "",
  };
  const textos: Record<string, string> = { GREEN: "verde (alta)", YELLOW: "amarela (média)", RED: "vermelha (baixa)" };
  return {
    freio,
    limiteConfigurado: limite,
    limiteEfetivo: efetivo,
    motivo: motivos[freio],
    checadoEm: new Date(agora - (freio === "sem_leitura" ? 5 * 3_600_000 : 20 * 60_000)).toISOString(),
    qualidade,
    qualidadeTexto: qualidade ? textos[qualidade] : "sem nota da Meta",
    situacaoTexto: situacaoVisivel("conectado; envio limitado pela Meta; nome de exibição recusado"),
    nome: "Carol do Lavacar",
    nomeStatus: "DECLINED",
    limiteMeta: null,
    avisos: [],
    ultimaTentativaEm: new Date(agora - (freio === "sem_leitura" ? 10 : 20) * 60_000).toISOString(),
    ultimaTentativaOk: freio !== "sem_leitura",
    ultimoErro: freio === "sem_leitura" ? "Error validating access token" : null,
    enviadosHoje,
    semWhatsappHoje: 1,
    optouts7d: 0,
  };
}
