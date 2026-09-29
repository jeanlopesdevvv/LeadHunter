/**
 * Regras da aba "leads" (funções puras, testadas em tests/).
 *
 * As colunas são encontradas pelo NOME do cabeçalho, não pela posição.
 * Colunas obrigatórias da Carol: telefone, nome, tipo, cidade, status.
 * mensagem_enviada_em e optout são preenchidas pela Carol: o app só lê.
 */

import { phoneKey, phoneKeysFromCell } from "./phone";
import type { SendResultItem } from "./types";

export type SheetField =
  | "telefone" | "nome" | "tipo" | "cidade" | "status" | "mensagem_enviada_em" | "optout"
  | "endereco" | "bairro" | "uf" | "site" | "maps_url" | "nota" | "avaliacoes" | "categoria"
  | "place_id" | "origem" | "capturado_em" | "termo";

export const REQUIRED_FIELDS: SheetField[] = ["telefone", "nome", "tipo", "cidade", "status"];

/** Nomes aceitos para cada campo (já normalizados), em ordem de prioridade. */
const ALIASES: Record<SheetField, string[]> = {
  telefone: ["telefone", "phone", "celular", "whatsapp", "numero", "fone", "tel"],
  nome: ["nome", "name", "nome_empresa", "empresa", "estabelecimento"],
  tipo: ["tipo", "perfil", "plano"],
  cidade: ["cidade", "city", "municipio"],
  status: ["status"],
  mensagem_enviada_em: ["mensagem_enviada_em", "enviada_em", "enviado_em"],
  optout: ["optout", "opt_out"],
  endereco: ["endereco", "address"],
  bairro: ["bairro"],
  uf: ["uf", "estado"],
  site: ["site", "website"],
  maps_url: ["maps_url", "link_maps", "google_maps", "link_google_maps", "maps"],
  nota: ["nota", "avaliacao", "rating"],
  avaliacoes: ["avaliacoes", "qtd_avaliacoes", "total_avaliacoes", "reviews"],
  categoria: ["categoria", "category"],
  place_id: ["place_id", "google_place_id", "google_id"],
  origem: ["origem", "fonte", "source"],
  capturado_em: ["capturado_em", "criado_em", "data_captura", "created_at"],
  termo: ["termo", "termo_busca", "busca"],
};

/** Campos que o app nunca escreve (são da Carol). */
const READ_ONLY: SheetField[] = ["mensagem_enviada_em", "optout"];

export function normalizeHeader(h: unknown): string {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export type HeaderMap = Partial<Record<SheetField, number>>;

export function buildHeaderMap(headers: unknown[]): HeaderMap {
  const normalized = headers.map(normalizeHeader);
  const map: HeaderMap = {};
  const used = new Set<number>();
  for (const field of Object.keys(ALIASES) as SheetField[]) {
    for (const alias of ALIASES[field]) {
      const idx = normalized.findIndex((h, i) => h === alias && !used.has(i));
      if (idx >= 0) {
        map[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return map;
}

export function missingRequired(map: HeaderMap): SheetField[] {
  return REQUIRED_FIELDS.filter((f) => map[f] === undefined);
}

const NOT_OPTOUT = new Set(["", "false", "falso", "nao", "n", "no", "0", "-"]);

export function isOptout(value: unknown): boolean {
  const v = normalizeHeader(value);
  return !NOT_OPTOUT.has(v);
}

export interface ExistingIndex {
  keys: Set<string>;
  optout: Set<string>;
  rows: number;
}

/** Lê as linhas de dados (sem o cabeçalho) e indexa os telefones existentes. */
export function indexExisting(rows: unknown[][], map: HeaderMap): ExistingIndex {
  const keys = new Set<string>();
  const optout = new Set<string>();
  const telIdx = map.telefone;
  const optIdx = map.optout;
  let count = 0;
  if (telIdx === undefined) return { keys, optout, rows: 0 };
  for (const row of rows) {
    if (!row || row.every((c) => String(c ?? "").trim() === "")) continue;
    count++;
    const rowKeys = phoneKeysFromCell(row[telIdx]);
    const saiu = optIdx !== undefined && isOptout(row[optIdx]);
    for (const key of rowKeys) {
      keys.add(key);
      if (saiu) optout.add(key);
    }
  }
  return { keys, optout, rows: count };
}

/**
 * Abas extras (ex.: historico_carol): procura telefones em TODAS as células
 * (colunas de telefone, JID do WhatsApp "55...@s.whatsapp.net", ids de sessão).
 * Um falso positivo só impede um envio; um falso negativo faria alguém receber de novo.
 */
export function indexPhonesInTab(values: unknown[][]): Set<string> {
  const keys = new Set<string>();
  for (const row of values) {
    if (!row) continue;
    for (const cell of row) for (const k of phoneKeysFromCell(cell)) keys.add(k);
  }
  return keys;
}

/** Converte índice de coluna (0 = A) em letra: 0 -> A, 26 -> AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** "leads!A218:G230" / "'leads'!A5:G5" / "leads!A7" -> { inicio: 218, fim: 230 } */
export function parseUpdatedRows(range: string | undefined): { inicio: number; fim: number } | null {
  const m = range?.match(/![A-Z]+(\d+)(?::[A-Z]+(\d+))?$/);
  if (!m) return null;
  const inicio = Number(m[1]);
  return { inicio, fim: m[2] ? Number(m[2]) : inicio };
}

/**
 * Depois de gravar: acha as linhas gravadas agora (inicio..fim, 1 = cabeçalho)
 * cujo telefone já aparece numa linha ANTERIOR (outro envio ao mesmo tempo).
 */
export function findLateDuplicates(values: unknown[][], map: HeaderMap, inicio: number, fim: number): number[] {
  const telIdx = map.telefone;
  if (telIdx === undefined) return [];
  const antes = new Set<string>();
  for (let r = 1; r < inicio - 1 && r < values.length; r++) for (const k of phoneKeysFromCell(values[r]?.[telIdx])) antes.add(k);
  const dup: number[] = [];
  for (let linha = inicio; linha <= fim; linha++) {
    const keys = phoneKeysFromCell(values[linha - 1]?.[telIdx]);
    if (keys.some((k) => antes.has(k))) dup.push(linha);
  }
  return dup;
}

export interface LeadForSheet {
  telefone: string;
  nome: string;
  tipo: string;
  cidade: string;
  endereco?: string;
  bairro?: string;
  uf?: string;
  site?: string;
  mapsUrl?: string;
  nota?: number | null;
  avaliacoes?: number | null;
  categoria?: string;
  placeId?: string;
  termo?: string;
}

export function formatSaoPaulo(date: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return parts.replace(",", "");
}

/** Monta a linha na ordem exata das colunas da planilha. */
export function buildRow(
  headerCount: number,
  map: HeaderMap,
  lead: LeadForSheet,
  opts: { status: string; now: Date },
): string[] {
  const width = Math.max(headerCount, ...Object.values(map).map((i) => (i ?? 0) + 1));
  const row: string[] = new Array(width).fill("");
  const values: Partial<Record<SheetField, string>> = {
    telefone: lead.telefone,
    nome: lead.nome,
    tipo: lead.tipo,
    cidade: lead.cidade,
    status: opts.status,
    endereco: lead.endereco ?? "",
    bairro: lead.bairro ?? "",
    uf: lead.uf ?? "",
    site: lead.site ?? "",
    maps_url: lead.mapsUrl ?? "",
    nota: lead.nota != null ? String(lead.nota).replace(".", ",") : "",
    avaliacoes: lead.avaliacoes != null ? String(lead.avaliacoes) : "",
    categoria: lead.categoria ?? "",
    place_id: lead.placeId ?? "",
    origem: "LeadHunter",
    capturado_em: formatSaoPaulo(opts.now),
    termo: lead.termo ?? "",
  };
  for (const [field, idx] of Object.entries(map) as [SheetField, number][]) {
    if (READ_ONLY.includes(field)) continue;
    const v = values[field];
    if (v !== undefined) row[idx] = v;
  }
  return row;
}

export interface SendPlan {
  toAppend: LeadForSheet[];
  ignorados: SendResultItem[];
}

/** Decide quem entra: remove telefone inválido, repetidos no lote, quem já está na planilha e opt-out. */
export function planSend(leads: LeadForSheet[], existing: { keys: Set<string>; optout: Set<string> }): SendPlan {
  const seen = new Set<string>();
  const toAppend: LeadForSheet[] = [];
  const ignorados: SendResultItem[] = [];
  for (const lead of leads) {
    const key = phoneKey(lead.telefone);
    const base = { key, telefone: lead.telefone, nome: lead.nome };
    if (!key) ignorados.push({ ...base, motivo: "telefone_invalido" });
    else if (existing.optout.has(key)) ignorados.push({ ...base, motivo: "optout" });
    else if (existing.keys.has(key)) ignorados.push({ ...base, motivo: "ja_na_planilha" });
    else if (seen.has(key)) ignorados.push({ ...base, motivo: "repetido_no_lote" });
    else {
      seen.add(key);
      toAppend.push(lead);
    }
  }
  return { toAppend, ignorados };
}
