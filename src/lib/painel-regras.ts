/**
 * Painel da Carol (funções puras, testadas em tests/painel.test.ts).
 *
 * Junta, por telefone:
 *  - aba leads: quem recebeu o disparo e quando (status + mensagem_enviada_em);
 *  - historico_carol: mensagens da Carol e respostas do contato (botões "Sim, atendo" / "Não tenho interesse");
 *  - status_meta_carol (se existir): entregue / lida / falhou, vindo do Meta;
 *  - sessoes_carol (se existir): em que etapa da conversa o contato está.
 * As colunas são encontradas pelo nome (vários nomes aceitos), porque cada fluxo do n8n grava do seu jeito.
 */

import { diaBrasilia, linhasDaFila, type LinhaFila } from "./disparo-regras";
import { phoneKeysFromCell } from "./phone";
import { buildHeaderMap, normalizeHeader } from "./sheet-mapping";

export type Periodo = "hoje" | "7d" | "30d" | "tudo";
export type Entrega = "lida" | "entregue" | "enviada" | "falhou";
export type Resposta = "sim" | "nao" | "respondeu" | "optout";

export interface MensagemPainel {
  texto: string;
  deCarol: boolean;
  quando: number | null;
}

export interface ContatoPainel {
  key: string;
  nome: string;
  telefone: string;
  cidade: string;
  tipo: string;
  statusPlanilha: string;
  enviadoEm: number | null;
  semWhatsapp: boolean;
  entrega: Entrega | null;
  resposta: Resposta | null;
  respondeuEm: number | null;
  ultima: MensagemPainel | null;
  mensagensDoContato: number;
  etapa: string;
}

export interface Funil {
  disparadas: number;
  entregues: number | null;
  lidas: number | null;
  responderam: number;
  sim: number;
  nao: number;
  semWhatsapp: number;
  optout: number;
}

export interface Painel {
  periodo: Periodo;
  funil: Funil;
  contatos: ContatoPainel[];
  fontes: {
    historico: { aba: boolean; colunas: string[]; faltando: string[] };
    statusMeta: { aba: boolean; colunas: string[]; faltando: string[] };
    sessoes: { aba: boolean; colunas: string[]; faltando: string[] };
  };
  atualizadoEm: number;
}

const BRASILIA_MS = 3 * 60 * 60 * 1000;

/** Acha a coluna pelo nome (exato primeiro, depois "contém"). */
export function acharColuna(cabecalho: unknown[], nomes: string[]): number {
  const junta = (x: string) => x.replace(/_/g, "");
  const h = cabecalho.map((c) => junta(normalizeHeader(c)));
  for (const n of nomes) {
    const i = h.indexOf(junta(n));
    if (i >= 0) return i;
  }
  for (const n of nomes) {
    const i = h.findIndex((c) => c.length > 2 && c.includes(junta(n)));
    if (i >= 0) return i;
  }
  return -1;
}

const COL_TELEFONE = ["telefone", "remotejid", "remote_jid", "jid", "whatsapp", "celular", "numero", "phone", "wa_id", "recipient_id", "destinatario"];
const COL_REMETENTE = ["remetente", "from_me", "fromme", "autor", "quem", "sender", "role", "direcao", "origem", "enviado_por"];
const COL_MENSAGEM = ["mensagem", "texto", "message", "conteudo", "body", "msg", "text", "resposta"];
const COL_DATA = ["timestamp", "data_hora", "datahora", "data", "created_at", "criado_em", "hora", "quando", "date", "ultimo_contato"];
const COL_STATUS = ["status", "status_meta", "situacao", "estado_entrega", "evento"];
const COL_ESTADO = ["estado", "etapa", "fase", "status"];

/** Data em ISO, "29/09/2026, 21:13:05", número do Sheets ou epoch (s/ms). */
export function lerQuando(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 20000 && v < 80000) return Math.round((v - 25569) * 86_400_000) + BRASILIA_MS;
    if (v > 1e12) return v;
    if (v > 1e9) return v * 1000;
    return null;
  }
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (/^\d{10}$/.test(t)) return Number(t) * 1000;
  if (/^\d{13}$/.test(t)) return Number(t);
  const br = /(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (br) return Date.UTC(+br[3], +br[2] - 1, +br[1], +br[4], +br[5], +(br[6] ?? 0)) + BRASILIA_MS;
  const iso = Date.parse(t);
  return Number.isFinite(iso) ? iso : null;
}

const CAROL_RE = /carol|sofia|bot|assistente|agente|sistema|lavacar|atendente|outbound|saida|enviad|^ia$|^ai$|^true$|^sim$|^1$/;
const LEAD_RE = /lead|cliente|usuario|user|contato|entrada|inbound|recebid|humano|^false$|^nao$|^0$/;

/** A mensagem é da Carol (ou de outro robô do Lavacar)? null = não dá para saber. */
export function ehDaCarol(remetente: unknown): boolean | null {
  const r = normalizeHeader(remetente);
  if (!r) return null;
  if (LEAD_RE.test(r)) return false;
  if (CAROL_RE.test(r)) return true;
  return null;
}

/** "Sim, atendo" / "Não tenho interesse" (botões do template) ou respostas equivalentes. */
export function lerResposta(texto: string): "sim" | "nao" | null {
  const t = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (!t) return null;
  if (/nao tenho interesse|sem interesse|nao atendo|nao trabalho|parei|nao quero/.test(t) || /^nao\b/.test(t)) return "nao";
  if (/sim,?\s*atendo|^sim\b|ainda atendo|atendo sim|tenho interesse/.test(t)) return "sim";
  return null;
}

function mapaEntrega(v: unknown): Entrega | null {
  const s = normalizeHeader(v);
  if (!s) return null;
  if (/read|lida|lido|visualiz/.test(s)) return "lida";
  if (/deliver|entreg/.test(s)) return "entregue";
  if (/fail|falh|erro|undeliver/.test(s)) return "falhou";
  if (/sent|enviad|accepted|aceit/.test(s)) return "enviada";
  return null;
}

const ORDEM_ENTREGA: Record<Entrega, number> = { falhou: 0, enviada: 1, entregue: 2, lida: 3 };

function chave(cel: unknown): string {
  return phoneKeysFromCell(cel)[0] ?? "";
}

function dentroDoPeriodo(t: number | null, periodo: Periodo, agora: number): boolean {
  if (periodo === "tudo") return true;
  if (t === null) return false;
  if (periodo === "hoje") return diaBrasilia(t) === diaBrasilia(agora);
  const dias = periodo === "7d" ? 7 : 30;
  return t >= agora - dias * 86_400_000;
}

export function montarPainel(
  entrada: { leads: unknown[][]; historico?: unknown[][]; statusMeta?: unknown[][]; sessoes?: unknown[][] },
  periodo: Periodo,
  agora = Date.now(),
): Painel {
  const cabLeads = (entrada.leads[0] ?? []) as unknown[];
  const linhas: LinhaFila[] = linhasDaFila(entrada.leads.slice(1), buildHeaderMap(cabLeads));

  // --- histórico de conversa
  const hist = entrada.historico ?? [];
  const hCab = (hist[0] ?? []) as unknown[];
  const hTel = acharColuna(hCab, COL_TELEFONE);
  const hJid = acharColuna(hCab, ["remotejid", "remote_jid", "jid", "wa_id"]);
  const hRem = acharColuna(hCab, COL_REMETENTE);
  const hMsg = acharColuna(hCab, COL_MENSAGEM);
  const hData = acharColuna(hCab, COL_DATA);
  const conversas = new Map<string, MensagemPainel[]>();
  if (hTel >= 0 && hMsg >= 0) {
    for (const row of hist.slice(1)) {
      const k = chave(row?.[hTel]) || (hJid >= 0 ? chave(row?.[hJid]) : "");
      if (!k) continue;
      const texto = String(row?.[hMsg] ?? "").trim();
      if (!texto) continue;
      const carol = hRem >= 0 ? ehDaCarol(row?.[hRem]) : null;
      // Sem saber quem mandou: só conta como do contato se for resposta de botão reconhecida.
      const deCarol = carol ?? lerResposta(texto) === null;
      const lista = conversas.get(k) ?? [];
      lista.push({ texto, deCarol, quando: hData >= 0 ? lerQuando(row?.[hData]) : null });
      conversas.set(k, lista);
    }
  }

  // --- status do Meta
  const sm = entrada.statusMeta ?? [];
  const sCab = (sm[0] ?? []) as unknown[];
  const sTel = acharColuna(sCab, COL_TELEFONE);
  const sJid = acharColuna(sCab, ["remotejid", "remote_jid", "jid", "wa_id", "recipient_id"]);
  const sSt = acharColuna(sCab, COL_STATUS);
  const entregas = new Map<string, Entrega>();
  if (sTel >= 0 && sSt >= 0) {
    for (const row of sm.slice(1)) {
      const k = chave(row?.[sTel]) || (sJid >= 0 ? chave(row?.[sJid]) : "");
      const e = mapaEntrega(row?.[sSt]);
      if (!k || !e) continue;
      const atual = entregas.get(k);
      if (!atual || ORDEM_ENTREGA[e] > ORDEM_ENTREGA[atual]) entregas.set(k, e);
    }
  }

  // --- sessões
  const ss = entrada.sessoes ?? [];
  const eCab = (ss[0] ?? []) as unknown[];
  const eTel = acharColuna(eCab, COL_TELEFONE);
  const eJid = acharColuna(eCab, ["remotejid", "remote_jid", "jid"]);
  const eEst = acharColuna(eCab, COL_ESTADO);
  const etapas = new Map<string, string>();
  if (eTel >= 0 && eEst >= 0) {
    for (const row of ss.slice(1)) {
      const k = chave(row?.[eTel]) || (eJid >= 0 ? chave(row?.[eJid]) : "");
      const est = String(row?.[eEst] ?? "").trim();
      if (k && est) etapas.set(k, est);
    }
  }

  // --- contatos que receberam disparo
  const vistos = new Set<string>();
  const contatos: ContatoPainel[] = [];
  for (const l of linhas) {
    if (!l.key || vistos.has(l.key)) continue;
    const recebeu = l.quando !== null || l.situacao === "enviado" || l.situacao === "sem_whatsapp";
    if (!recebeu || l.situacao === "pendente" || l.situacao === "aguardando") continue;
    if (!dentroDoPeriodo(l.quando, periodo, agora)) continue;
    vistos.add(l.key);
    const msgs = (conversas.get(l.key) ?? []).slice().sort((a, b) => (a.quando ?? 0) - (b.quando ?? 0));
    const desde = (l.quando ?? 0) - 60_000;
    const doContato = msgs.filter((m) => !m.deCarol && (m.quando === null || m.quando >= desde));
    let resposta: Resposta | null = null;
    for (const m of doContato) resposta = lerResposta(m.texto) ?? resposta;
    if (!resposta && doContato.length) resposta = "respondeu";
    if (l.optout) resposta = "optout";
    const entrega = entregas.get(l.key) ?? (l.situacao === "sem_whatsapp" ? "falhou" : null);
    contatos.push({
      key: l.key,
      nome: l.nome,
      telefone: l.telefone,
      cidade: l.cidade,
      tipo: l.tipo,
      statusPlanilha: l.status,
      enviadoEm: l.quando,
      semWhatsapp: l.situacao === "sem_whatsapp",
      entrega,
      resposta,
      respondeuEm: doContato[0]?.quando ?? null,
      ultima: msgs.length ? msgs[msgs.length - 1] : null,
      mensagensDoContato: doContato.length,
      etapa: etapas.get(l.key) ?? "",
    });
  }

  const temMeta = sTel >= 0 && sSt >= 0 && sm.length > 1;
  const funil: Funil = {
    disparadas: contatos.length,
    entregues: temMeta ? contatos.filter((c) => c.entrega === "entregue" || c.entrega === "lida").length : null,
    lidas: temMeta ? contatos.filter((c) => c.entrega === "lida").length : null,
    responderam: contatos.filter((c) => c.mensagensDoContato > 0).length,
    sim: contatos.filter((c) => c.resposta === "sim").length,
    nao: contatos.filter((c) => c.resposta === "nao").length,
    semWhatsapp: contatos.filter((c) => c.semWhatsapp).length,
    optout: contatos.filter((c) => c.resposta === "optout").length,
  };

  // Quem respondeu primeiro (mais recente no topo), depois o resto por data de envio.
  const peso = (c: ContatoPainel) => (c.resposta === "sim" ? 3 : c.resposta === "respondeu" ? 2 : c.resposta === "nao" ? 1 : 0);
  contatos.sort((a, b) => peso(b) - peso(a) || (b.respondeuEm ?? b.enviadoEm ?? 0) - (a.respondeuEm ?? a.enviadoEm ?? 0));

  const fonte = (cab: unknown[], tem: boolean, falta: [string, number][]) => ({
    aba: tem,
    colunas: cab.map((c) => String(c ?? "")).filter(Boolean),
    faltando: tem ? falta.filter(([, i]) => i < 0).map(([n]) => n) : [],
  });

  return {
    periodo,
    funil,
    contatos: contatos.slice(0, 1000),
    fontes: {
      historico: fonte(hCab, entrada.historico !== undefined, [
        ["telefone", hTel],
        ["mensagem", hMsg],
        ["remetente", hRem],
        ["data", hData],
      ]),
      statusMeta: fonte(sCab, entrada.statusMeta !== undefined, [
        ["telefone", sTel],
        ["status", sSt],
      ]),
      sessoes: fonte(eCab, entrada.sessoes !== undefined, [
        ["telefone", eTel],
        ["estado", eEst],
      ]),
    },
    atualizadoEm: agora,
  };
}
