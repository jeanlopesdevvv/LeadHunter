"use client";

import type { Lead } from "@/lib/types";

/** Histórico de buscas guardado neste navegador (não é compartilhado). */

export interface HistoryEntry {
  id: string;
  criadoEm: string;
  termos: string[];
  cidades: string[];
  /** Quantos contatos novos foram pedidos. */
  alvo?: number;
  /** Buscas antigas (antes do "quantos contatos"). */
  profundidade?: string;
  total: number;
  enviados: number;
  leads?: Lead[];
}

const KEY = "leadhunter:historico:v1";
const MAX = 12;

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: HistoryEntry[]) {
  const items = list.slice(0, MAX);
  // Sem espaço no navegador: mantém os leads só das buscas mais recentes.
  for (let keep = items.length; keep >= 0; keep--) {
    const trimmed = items.map((e, idx) => (idx < keep ? e : { ...e, leads: undefined }));
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed));
      return;
    } catch {
      /* tenta de novo com menos dados */
    }
  }
}

export function upsertHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = [entry, ...loadHistory().filter((e) => e.id !== entry.id)];
  save(list);
  return loadHistory();
}

export function removeHistory(id: string): HistoryEntry[] {
  save(loadHistory().filter((e) => e.id !== id));
  return loadHistory();
}

export function clearHistory(): HistoryEntry[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* navegador sem acesso ao armazenamento: nada a limpar */
  }
  return [];
}
