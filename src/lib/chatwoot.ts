import "server-only";

import { getConfig } from "./env";
import { phoneKey } from "./phone";

/**
 * Atalho para o atendimento no Chatwoot.
 *
 * Sem token: o Radar só abre a tela configurada em CHATWOOT_URL.
 * Com CHATWOOT_TOKEN (token de acesso de um agente): acha a conversa do contato pelo telefone
 * (para o botão "Atender").
 */

export interface InfoChatwoot {
  /** Tela que o atalho abre. */
  url: string;
  /** Endereço do Chatwoot (ex.: https://chat.lavacar.app). */
  origem: string;
  conta: string;
  /** Id da visão personalizada (custom_view) de CHATWOOT_URL, se houver. */
  visao: string;
  apiLigada: boolean;
}

export function infoChatwoot(): InfoChatwoot {
  const cfg = getConfig();
  let origem = "";
  let conta = "";
  let visao = "";
  try {
    const u = new URL(cfg.chatwootUrl);
    origem = u.origin;
    conta = /\/accounts\/(\d+)/.exec(u.pathname)?.[1] ?? "";
    visao = /\/custom_view\/(\d+)/.exec(u.pathname)?.[1] ?? "";
  } catch {
    /* URL inválida: o atalho fica escondido */
  }
  return { url: origem ? cfg.chatwootUrl : "", origem, conta, visao, apiLigada: Boolean(cfg.chatwootToken && origem && conta) };
}

async function api<T>(caminho: string, init?: RequestInit): Promise<T> {
  const cfg = getConfig();
  const info = infoChatwoot();
  const base = (cfg.chatwootApiUrl || info.origem).replace(/\/$/, "");
  const res = await fetch(`${base}/api/v1/accounts/${info.conta}${caminho}`, {
    ...init,
    headers: { api_access_token: cfg.chatwootToken, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Chatwoot respondeu ${res.status}`);
  return (await res.json()) as T;
}

/** Formas do mesmo telefone como o Chatwoot pode ter guardado (com/sem 55, com/sem o 9). */
function formasDoTelefone(telefone: string): string[] {
  const key = phoneKey(telefone); // 55 + DDD + número
  if (!key) return [];
  const local = key.slice(2);
  const semNove = local.length === 11 && local[2] === "9" ? local.slice(0, 2) + local.slice(3) : local;
  return [...new Set([key, local, `55${semNove}`, semNove])];
}

type Conversa = { id: number; last_activity_at?: number; status?: string };
const cacheConversa = new Map<string, { em: number; url: string | null }>();

/** Link da conversa mais recente do contato no Chatwoot (ou null se não achar). */
export async function linkDaConversa(telefone: string): Promise<string | null> {
  const info = infoChatwoot();
  if (!info.apiLigada) return null;
  const key = phoneKey(telefone);
  if (!key) return null;
  const guardado = cacheConversa.get(key);
  if (guardado && Date.now() - guardado.em < (guardado.url ? 10 * 60_000 : 60_000)) return guardado.url;

  let url: string | null = null;
  for (const forma of formasDoTelefone(telefone)) {
    const busca = await api<{ payload?: { id: number; phone_number?: string | null; identifier?: string | null }[] }>(
      `/contacts/search?q=${encodeURIComponent(forma)}&page=1`,
    );
    const contatos = (busca.payload ?? []).filter((c) => phoneKey(c.phone_number ?? "") === key || phoneKey(c.identifier ?? "") === key);
    for (const c of contatos) {
      const conversas = await api<{ payload?: Conversa[] }>(`/contacts/${c.id}/conversations`);
      const maisRecente = (conversas.payload ?? []).sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0))[0];
      if (maisRecente) {
        url = `${info.origem}/app/accounts/${info.conta}/conversations/${maisRecente.id}`;
        break;
      }
    }
    if (url) break;
  }
  cacheConversa.set(key, { em: Date.now(), url });
  return url;
}
