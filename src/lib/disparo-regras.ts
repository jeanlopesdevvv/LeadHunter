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

export type SituacaoDisparo = "pendente" | "enviado" | "sem_whatsapp" | "outro";

export interface LinhaFila {
  key: string;
  telefone: string;
  nome: string;
  cidade: string;
  status: string;
  situacao: SituacaoDisparo;
  optout: boolean;
  /** Quando a Carol mexeu nesta linha (ms), se der para ler. */
  quando: number | null;
  detalhe: string;
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
  if (s === "enviado" || s === "enviada") return "enviado";
  if (s === "sem_whatsapp" || s === "sem whatsapp") return "sem_whatsapp";
  return "outro";
}

/** Linhas da aba leads (sem o cabeçalho) no formato do disparo. */
export function linhasDaFila(rows: unknown[][], map: HeaderMap): LinhaFila[] {
  const col = (row: unknown[], i: number | undefined) => (i === undefined ? "" : row[i]);
  const out: LinhaFila[] = [];
  for (const row of rows) {
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
    const telefoneBruto = String(col(row, map.telefone) ?? "").trim();
    const status = String(col(row, map.status) ?? "").trim();
    const enviadaEm = col(row, map.mensagem_enviada_em);
    const optoutCel = col(row, map.optout);
    out.push({
      key: phoneKey(telefoneBruto),
      telefone: telefoneBruto,
      nome: String(col(row, map.nome) ?? "").trim(),
      cidade: String(col(row, map.cidade) ?? "").trim(),
      status,
      situacao: situacaoDoStatus(status),
      optout: map.optout !== undefined && isOptout(optoutCel),
      quando: lerDataHora(enviadaEm),
      detalhe: typeof enviadaEm === "string" && /erro/i.test(enviadaEm) ? enviadaEm.replace(/\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}.*$/, "") : "",
    });
  }
  return out;
}

/** Quem o n8n vai disparar: status pendente, com telefone e sem optout (mesma regra do fluxo). */
export function naFila(l: LinhaFila): boolean {
  return l.situacao === "pendente" && !l.optout && l.telefone.replace(/\D/g, "").length > 0;
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
/** Um lead leva ~10–15 s de espera + ~5–10 s de envio e registros. */
export const SEGUNDOS_POR_LEAD = 22;

export type EstadoDisparo = "enviando" | "concluido" | "parado";

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
  aguardando: number;
  estado: EstadoDisparo;
  ultimoMovimento: number | null;
  segundosRestantes: number;
  itens: ItemDisparo[];
}

/** Progresso de um disparo: os contatos que estavam na fila quando ele começou. */
export function progressoDoDisparo(chaves: string[], iniciadoEm: number, linhas: LinhaFila[], agora = Date.now()): ProgressoDisparo {
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
    if (l.situacao === "pendente") aguardando++;
    else if (l.situacao === "enviado") enviados++;
    else if (l.situacao === "sem_whatsapp") semWhatsapp++;
    else outros++;
    // Só conta movimento que aconteceu depois do início deste disparo.
    if (l.situacao !== "pendente" && l.quando !== null && l.quando >= iniciadoEm - 60_000) {
      if (ultimoMovimento === null || l.quando > ultimoMovimento) ultimoMovimento = l.quando;
    }
    return { key, nome: l.nome, telefone: l.telefone, cidade: l.cidade, situacao: l.situacao, quando: l.quando, detalhe: l.detalhe };
  });
  const referencia = Math.max(iniciadoEm, ultimoMovimento ?? 0);
  const estado: EstadoDisparo = aguardando === 0 ? "concluido" : agora - referencia > PARADO_APOS_MS ? "parado" : "enviando";
  // Ordem: quem já foi (mais recente primeiro), depois quem está esperando.
  itens.sort((a, b) => {
    const pa = a.situacao === "pendente" ? 1 : 0;
    const pb = b.situacao === "pendente" ? 1 : 0;
    if (pa !== pb) return pa - pb;
    return (b.quando ?? 0) - (a.quando ?? 0);
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
  };
}

export interface StatusDisparo {
  configurado: boolean;
  simulacao: boolean;
  /** Só o endereço do n8n (sem caminho), para mostrar na tela. */
  destino: string;
  fila: number;
  proximos: { nome: string; telefone: string; cidade: string }[];
  hoje: ResumoDia;
  limiteDiario: number;
  /** A Carol mexeu na planilha há pouco e não foi o disparo acompanhado pelo Radar: alguém rodou o fluxo no n8n. */
  movimentoRecente: boolean;
  atual: ProgressoDisparo | null;
  atualizadoEm: number;
}
