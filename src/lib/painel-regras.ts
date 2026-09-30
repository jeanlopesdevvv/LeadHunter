/**
 * Painel da Carol (funções puras, testadas em tests/painel.test.ts).
 *
 * Usa só o que os fluxos já gravam na planilha, por telefone:
 *  - aba leads: quem recebeu o disparo e quando (status, mensagem_enviada_em) e quem pediu para sair (optout);
 *  - historico_carol: mensagens da Carol e do contato (remetente "carol" / "lead"), inclusive os botões
 *    "Sim, atendo" e "Não tenho interesse";
 *  - sessoes_carol: em que ponto a conversa está (AGUARDANDO_SUPORTE, LEAD_PERDIDO, CLIENTE_ATIVO…);
 *  - status_meta_carol: o Fluxo 6 grava só as FALHAS do Meta (entregue/lida não são gravados), então ela
 *    serve apenas para saber quem não recebeu.
 * As colunas são encontradas pelo nome (vários nomes aceitos), porque cada fluxo do n8n grava do seu jeito.
 */

import { diaBrasilia, linhasDaFila, type LinhaFila } from "./disparo-regras";
import { phoneKeysFromCell } from "./phone";
import { buildHeaderMap, normalizeHeader } from "./sheet-mapping";

export type Periodo = "hoje" | "7d" | "30d" | "tudo";
export type Resposta = "sim" | "nao" | "respondeu" | "optout";

/** Onde cada contato está agora (uma situação por contato). */
export type Situacao = "atendente" | "sim" | "conversando" | "sem_resposta" | "sem_interesse" | "nao_recebeu" | "cliente";

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
  enviadoEm: number | null;
  situacao: Situacao;
  resposta: Resposta | null;
  respondeuEm: number | null;
  ultima: MensagemPainel | null;
  mensagensDoContato: number;
}

export interface Resumo {
  disparadas: number;
  /** Chegaram ao WhatsApp do contato (disparadas menos quem não recebeu). */
  receberam: number;
  responderam: number;
  sim: number;
  semInteresse: number;
  naoRecebeu: number;
  porSituacao: Record<Situacao, number>;
}

export interface Painel {
  periodo: Periodo;
  resumo: Resumo;
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

/** O Fluxo 6 grava só falhas; ainda assim, confere o texto do status para não contar outra coisa. */
function ehFalha(status: unknown, erro: unknown): boolean {
  const st = normalizeHeader(status);
  if (/fail|falh|undeliver|erro/.test(st)) return true;
  return !st && String(erro ?? "").trim() !== "";
}

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

  // --- falhas do Meta (o Fluxo 6 só grava falhas: número sem WhatsApp, fora da janela, limite de qualidade…)
  const sm = entrada.statusMeta ?? [];
  const sCab = (sm[0] ?? []) as unknown[];
  const sTel = acharColuna(sCab, COL_TELEFONE);
  const sJid = acharColuna(sCab, ["remotejid", "remote_jid", "jid", "wa_id", "recipient_id"]);
  const sSt = acharColuna(sCab, COL_STATUS);
  const sErro = acharColuna(sCab, ["erro_codigo", "erro_detalhe", "erro", "error"]);
  const sData = acharColuna(sCab, COL_DATA);
  const falhas = new Map<string, number | null>();
  if (sTel >= 0 || sJid >= 0) {
    for (const row of sm.slice(1)) {
      const k = (sTel >= 0 ? chave(row?.[sTel]) : "") || (sJid >= 0 ? chave(row?.[sJid]) : "");
      if (!k || !ehFalha(sSt >= 0 ? row?.[sSt] : "", sErro >= 0 ? row?.[sErro] : "")) continue;
      const quando = sData >= 0 ? lerQuando(row?.[sData]) : null;
      falhas.set(k, Math.max(falhas.get(k) ?? 0, quando ?? 0) || null);
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
      const est = String(row?.[eEst] ?? "").trim().toUpperCase();
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

    const estado = etapas.get(l.key) ?? "";
    const falhouEm = falhas.has(l.key) ? falhas.get(l.key) : undefined;
    const falhaDesteDisparo = falhouEm !== undefined && (falhouEm === null || l.quando === null || falhouEm >= l.quando - 60_000);
    let situacao: Situacao;
    if (l.situacao === "sem_whatsapp" || estado === "SEM_WHATSAPP" || (falhaDesteDisparo && !doContato.length)) situacao = "nao_recebeu";
    else if (estado === "CLIENTE_ATIVO") situacao = "cliente";
    else if (resposta === "optout" || resposta === "nao" || estado === "LEAD_PERDIDO") situacao = "sem_interesse";
    else if (estado === "AGUARDANDO_SUPORTE") situacao = "atendente";
    else if (resposta === "sim") situacao = "sim";
    else if (doContato.length) situacao = "conversando";
    else situacao = "sem_resposta";

    contatos.push({
      key: l.key,
      nome: l.nome,
      telefone: l.telefone,
      cidade: l.cidade,
      tipo: l.tipo,
      enviadoEm: l.quando,
      situacao,
      resposta,
      respondeuEm: doContato[0]?.quando ?? null,
      ultima: msgs.length ? msgs[msgs.length - 1] : null,
      mensagensDoContato: doContato.length,
    });
  }

  const porSituacao: Record<Situacao, number> = { atendente: 0, sim: 0, conversando: 0, sem_resposta: 0, sem_interesse: 0, nao_recebeu: 0, cliente: 0 };
  for (const c of contatos) porSituacao[c.situacao]++;
  const resumo: Resumo = {
    disparadas: contatos.length,
    receberam: contatos.length - porSituacao.nao_recebeu,
    responderam: contatos.filter((c) => c.mensagensDoContato > 0 || c.resposta === "optout").length,
    sim: contatos.filter((c) => c.resposta === "sim").length,
    semInteresse: porSituacao.sem_interesse,
    naoRecebeu: porSituacao.nao_recebeu,
    porSituacao,
  };

  // Quem precisa de atenção primeiro (pediu atendente, disse sim, está conversando), o mais recente no topo.
  const PESO: Record<Situacao, number> = { atendente: 6, sim: 5, conversando: 4, cliente: 3, sem_interesse: 2, sem_resposta: 1, nao_recebeu: 0 };
  const recente = (c: ContatoPainel) => c.ultima?.quando ?? c.respondeuEm ?? c.enviadoEm ?? 0;
  contatos.sort((a, b) => PESO[b.situacao] - PESO[a.situacao] || recente(b) - recente(a));

  const fonte = (cab: unknown[], tem: boolean, falta: [string, number][]) => ({
    aba: tem,
    colunas: cab.map((c) => String(c ?? "")).filter(Boolean),
    faltando: tem ? falta.filter(([, i]) => i < 0).map(([n]) => n) : [],
  });

  return {
    periodo,
    resumo,
    contatos: contatos.slice(0, 1000),
    fontes: {
      historico: fonte(hCab, entrada.historico !== undefined, [
        ["telefone", hTel],
        ["mensagem", hMsg],
        ["remetente", hRem],
        ["data", hData],
      ]),
      statusMeta: fonte(sCab, entrada.statusMeta !== undefined, [
        ["telefone", Math.max(sTel, sJid)],
        ["status", Math.max(sSt, sErro)],
      ]),
      sessoes: fonte(eCab, entrada.sessoes !== undefined, [
        ["telefone", eTel],
        ["estado", eEst],
      ]),
    },
    atualizadoEm: agora,
  };
}
