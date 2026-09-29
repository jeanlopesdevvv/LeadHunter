import "server-only";

import { JWT } from "google-auth-library";

import { getConfig } from "./env";
import { phoneKey } from "./phone";
import { mockSheet } from "./mock";
import {
  buildHeaderMap,
  buildRow,
  columnLetter,
  findLateDuplicates,
  indexExisting,
  indexPhonesInTab,
  missingRequired,
  parseUpdatedRows,
  planSend,
  type HeaderMap,
  type LeadForSheet,
} from "./sheet-mapping";
import type { SendResult } from "./types";

/**
 * Google Sheets via conta de serviço.
 * A planilha precisa estar compartilhada com o e-mail da conta de serviço (Editor).
 */

const API = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

let jwtClient: JWT | null = null;
let jwtEmail = "";

async function accessToken(): Promise<string> {
  const cfg = getConfig();
  if (!cfg.serviceAccount) {
    throw new SheetsError(
      cfg.serviceAccountInvalid
        ? "GOOGLE_SERVICE_ACCOUNT_JSON está inválido. Cole o JSON inteiro da chave da conta de serviço."
        : "Conta de serviço do Google não configurada (GOOGLE_SERVICE_ACCOUNT_JSON).",
      503,
    );
  }
  if (!jwtClient || jwtEmail !== cfg.serviceAccount.client_email) {
    jwtClient = new JWT({
      email: cfg.serviceAccount.client_email,
      key: cfg.serviceAccount.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    jwtEmail = cfg.serviceAccount.client_email;
  }
  try {
    const { token } = await jwtClient.getAccessToken();
    if (!token) throw new Error("token vazio");
    return token;
  } catch (e) {
    throw new SheetsError(`Não foi possível autenticar a conta de serviço: ${(e as Error).message}`, 503);
  }
}

function quoteTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

async function sheetsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const cfg = getConfig();
  const token = await accessToken();
  const res = await fetch(`${API}/${cfg.sheetId}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text.slice(0, 300);
    try {
      msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg;
    } catch {
      /* texto puro */
    }
    if (res.status === 403) {
      throw new SheetsError(
        `A conta de serviço não tem acesso à planilha. Compartilhe a planilha com ${cfg.serviceAccount?.client_email} como Editor.`,
        403,
      );
    }
    if (res.status === 404) throw new SheetsError("Planilha não encontrada. Confira SHEET_ID.", 404);
    if (/unable to parse range/i.test(msg)) throw new SheetsError(`Aba "${cfg.sheetTab}" não encontrada na planilha.`, 400);
    throw new SheetsError(`Erro do Google Sheets (${res.status}): ${msg}`);
  }
  return JSON.parse(text || "{}") as T;
}

interface TabData {
  title: string;
  tabs: string[];
  headers: string[];
  map: HeaderMap;
  rows: string[][];
}

async function readMainTab(): Promise<TabData> {
  const cfg = getConfig();
  if (cfg.mock) {
    const s = mockSheet();
    const values = s.tabs[cfg.sheetTab] ?? s.tabs.leads;
    return { title: s.title, tabs: Object.keys(s.tabs), headers: values[0], map: buildHeaderMap(values[0]), rows: values.slice(1) };
  }
  const meta = await sheetsFetch<{ properties?: { title?: string }; sheets?: { properties?: { title?: string } }[] }>(
    `?fields=properties.title,sheets.properties.title`,
  );
  const tabs = (meta.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
  if (!tabs.includes(cfg.sheetTab)) {
    throw new SheetsError(`Aba "${cfg.sheetTab}" não encontrada. Abas da planilha: ${tabs.join(", ")}.`, 400);
  }
  // UNFORMATTED_VALUE: telefone salvo como número vem inteiro (sem notação científica da formatação).
  const data = await sheetsFetch<{ values?: unknown[][] }>(
    `/values/${encodeURIComponent(quoteTab(cfg.sheetTab))}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
  );
  const values = (data.values ?? []).map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c))));
  const headers = values[0] ?? [];
  return { title: meta.properties?.title ?? "", tabs, headers, map: buildHeaderMap(headers), rows: values.slice(1) };
}

/** Lê os telefones das abas extras que existem na planilha (as que não existem são ignoradas). */
async function readExtraTabKeys(existingTabs: string[]): Promise<{ keys: Set<string>; lidas: string[]; ausentes: string[] }> {
  const cfg = getConfig();
  const keys = new Set<string>();
  const byLower = new Map(existingTabs.map((t) => [t.trim().toLowerCase(), t]));
  const lidas = [
    ...new Set(
      cfg.dedupExtraTabs
        .map((t) => byLower.get(t.trim().toLowerCase()))
        .filter((t): t is string => Boolean(t) && t !== cfg.sheetTab),
    ),
  ];
  const ausentes = cfg.dedupExtraTabs.filter((t) => !byLower.has(t.trim().toLowerCase()));
  if (!lidas.length) return { keys, lidas, ausentes };
  let valueRanges: { values?: string[][] }[] = [];
  if (cfg.mock) {
    const s = mockSheet();
    valueRanges = lidas.map((t) => ({ values: s.tabs[t] ?? [] }));
  } else {
    const qs = lidas.map((t) => `ranges=${encodeURIComponent(quoteTab(t))}`).join("&");
    const data = await sheetsFetch<{ valueRanges?: { values?: string[][] }[] }>(
      `/values:batchGet?${qs}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
    );
    valueRanges = data.valueRanges ?? [];
  }
  for (const vr of valueRanges) for (const k of indexPhonesInTab(vr.values ?? [])) keys.add(k);
  return { keys, lidas, ausentes };
}

function assertColumns(tab: TabData) {
  const cfg = getConfig();
  if (!tab.headers.length) throw new SheetsError(`A aba "${cfg.sheetTab}" está sem cabeçalho na linha 1.`, 400);
  const missing = missingRequired(tab.map);
  if (missing.length) {
    // Sem "status" a Carol nunca pegaria o lead; sem "telefone" não há deduplicação.
    throw new SheetsError(`Faltam colunas na linha 1 da aba "${cfg.sheetTab}": ${missing.join(", ")}.`, 400);
  }
}

/** Telefones já presentes (aba leads + abas extras) e quem pediu opt-out. */
export async function loadExisting() {
  const tab = await readMainTab();
  assertColumns(tab);
  const idx = indexExisting(tab.rows, tab.map);
  const extra = await readExtraTabKeys(tab.tabs);
  for (const k of extra.keys) idx.keys.add(k);
  return { ...idx, tab };
}

export function sheetUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${getConfig().sheetId}/edit`;
}

/** Um envio por vez nesta instância (dois cliques/abas ao mesmo tempo não se atropelam). */
let fila: Promise<unknown> = Promise.resolve();
function exclusivo<T>(fn: () => Promise<T>): Promise<T> {
  const run = fila.then(fn, fn);
  fila = run.catch(() => undefined);
  return run;
}

async function readValues(): Promise<unknown[][]> {
  const cfg = getConfig();
  const data = await sheetsFetch<{ values?: unknown[][] }>(
    `/values/${encodeURIComponent(quoteTab(cfg.sheetTab))}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`,
  );
  return data.values ?? [];
}

export function appendLeads(leads: LeadForSheet[]): Promise<SendResult> {
  return exclusivo(async () => {
    const cfg = getConfig();
    const existing = await loadExisting(); // relido na hora de gravar
    const { toAppend, ignorados } = planSend(leads, existing);
    const now = new Date();
    const rows = toAppend.map((l) => buildRow(existing.tab.headers.length, existing.tab.map, l, { status: cfg.defaultStatus, now }));
    let adicionados = toAppend.map((l) => ({ key: phoneKey(l.telefone), telefone: l.telefone, nome: l.nome }));

    if (rows.length && cfg.mock) {
      const s = mockSheet();
      (s.tabs[cfg.sheetTab] ?? s.tabs.leads).push(...rows);
    } else if (rows.length) {
      const res = await sheetsFetch<{ updates?: { updatedRange?: string } }>(
        `/values/${encodeURIComponent(`${quoteTab(cfg.sheetTab)}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
        { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values: rows }) },
      );

      // Rede de segurança: se outro envio (outra instância/servidor) gravou o mesmo telefone
      // um instante antes, a nossa linha repetida vira "duplicado" e a Carol não a dispara.
      const faixa = parseUpdatedRows(res.updates?.updatedRange);
      const statusIdx = existing.tab.map.status;
      if (faixa && statusIdx !== undefined) {
        try {
          const values = await readValues();
          const map = buildHeaderMap(values[0] ?? []);
          const linhas = findLateDuplicates(values, map, faixa.inicio, faixa.fim);
          if (linhas.length) {
            const col = columnLetter(map.status ?? statusIdx);
            await sheetsFetch(`/values:batchUpdate`, {
              method: "POST",
              body: JSON.stringify({
                valueInputOption: "RAW",
                data: linhas.map((linha) => ({ range: `${quoteTab(cfg.sheetTab)}!${col}${linha}`, values: [["duplicado"]] })),
              }),
            });
            const telIdx = map.telefone ?? 0;
            const dupKeys = new Set(linhas.map((linha) => phoneKey(values[linha - 1]?.[telIdx])));
            ignorados.push(...adicionados.filter((a) => dupKeys.has(a.key)).map((a) => ({ ...a, motivo: "ja_na_planilha" as const })));
            adicionados = adicionados.filter((a) => !dupKeys.has(a.key));
          }
        } catch (e) {
          console.error("[leadhunter] verificação pós-envio falhou", e);
        }
      }
    }

    return { adicionados, ignorados, planilhaUrl: sheetUrl(), aba: cfg.sheetTab };
  });
}

export async function sheetStatus() {
  const cfg = getConfig();
  const base = {
    configurada: cfg.mock || Boolean(cfg.serviceAccount),
    contaServico: cfg.mock ? "simulacao@leadhunter.local" : cfg.serviceAccount?.client_email ?? "",
    planilhaId: cfg.sheetId,
    planilhaUrl: sheetUrl(),
    aba: cfg.sheetTab,
    abasExtras: cfg.dedupExtraTabs,
    statusPadrao: cfg.defaultStatus,
  };
  try {
    const tab = await readMainTab();
    const missing = tab.headers.length ? missingRequired(tab.map) : ["telefone", "nome", "tipo", "cidade", "status"];
    const idx = indexExisting(tab.rows, tab.map);
    let extraErro = "";
    let extraTelefones = 0;
    let abasExtrasLidas: string[] = [];
    try {
      const extra = await readExtraTabKeys(tab.tabs);
      extraTelefones = extra.keys.size;
      abasExtrasLidas = extra.lidas;
      if (extra.ausentes.length) extraErro = `não encontradas: ${extra.ausentes.join(", ")}`;
    } catch (e) {
      extraErro = (e as Error).message;
    }
    return {
      ...base,
      ok: missing.length === 0,
      titulo: tab.title,
      abas: tab.tabs,
      cabecalhos: tab.headers,
      colunasFaltando: missing,
      linhas: idx.rows,
      telefonesUnicos: idx.keys.size,
      optout: idx.optout.size,
      extraTelefones,
      abasExtrasLidas,
      extraErro,
      erro: missing.length ? `Faltam colunas na aba "${cfg.sheetTab}": ${missing.join(", ")}` : "",
    };
  } catch (e) {
    return { ...base, ok: false, erro: (e as Error).message };
  }
}
