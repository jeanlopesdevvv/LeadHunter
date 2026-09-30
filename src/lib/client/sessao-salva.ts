"use client";

import type { Lead } from "@/lib/types";

import type { Progresso, SnapshotBusca } from "./search-runner";

/**
 * O que está na tela fica salvo neste navegador: recarregar a página (ou a sessão expirar)
 * não perde a lista, a seleção nem a busca em andamento.
 */

const CHAVE = "radar:sessao:v2";
const VALIDADE_MS = 3 * 24 * 60 * 60_000;

export interface SessaoSalva {
  salvoEm: number;
  view: string;
  form: Record<string, unknown>;
  meta: { id: string; criadoEm: string; termos: string[]; cidades: string[]; alvo?: number } | null;
  leads: Lead[];
  selecionados: string[];
  incluirFixos: boolean;
  progresso: Progresso | null;
  /** A busca estava rodando quando a página fechou. */
  rodando: boolean;
  busca: SnapshotBusca | null;
}

export function carregarSessao(): SessaoSalva | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return null;
    const s = JSON.parse(raw) as SessaoSalva;
    if (!s || typeof s.salvoEm !== "number" || Date.now() - s.salvoEm > VALIDADE_MS) return null;
    if (!Array.isArray(s.leads)) s.leads = [];
    return s;
  } catch {
    return null;
  }
}

export function salvarSessao(s: Omit<SessaoSalva, "salvoEm">) {
  if (typeof window === "undefined") return;
  const tentar = (dados: Omit<SessaoSalva, "salvoEm">) => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify({ ...dados, salvoEm: Date.now() }));
      return true;
    } catch {
      return false;
    }
  };
  // Sem espaço no navegador: salva sem a fila da busca e, se ainda não couber, sem a lista.
  if (tentar(s)) return;
  if (tentar({ ...s, busca: null })) return;
  tentar({ ...s, busca: null, leads: [], selecionados: [] });
}

export function apagarSessao() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* sem acesso ao armazenamento */
  }
}

/* ---------- disparo que este navegador começou (para acompanhar mesmo se o servidor reiniciar) ---------- */

const CHAVE_DISPARO = "radar:disparo:v1";

export interface DisparoLembrado {
  iniciadoEm: number;
  chaves: string[];
  comemorado?: boolean;
}

export function lembrarDisparo(d: DisparoLembrado) {
  try {
    localStorage.setItem(CHAVE_DISPARO, JSON.stringify(d));
  } catch {
    /* sem acesso ao armazenamento */
  }
}

export function disparoLembrado(): DisparoLembrado | null {
  try {
    const raw = localStorage.getItem(CHAVE_DISPARO);
    if (!raw) return null;
    const d = JSON.parse(raw) as DisparoLembrado;
    if (!d || typeof d.iniciadoEm !== "number" || !Array.isArray(d.chaves)) return null;
    if (Date.now() - d.iniciadoEm > 12 * 60 * 60_000) return null;
    return d;
  } catch {
    return null;
  }
}
