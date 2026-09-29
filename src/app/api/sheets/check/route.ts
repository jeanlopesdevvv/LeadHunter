import { handleError, isString, jsonError, readJson } from "@/lib/http";
import { getConfig } from "@/lib/env";
import { loadExisting, sheetUrl } from "@/lib/sheets";
import type { CheckResult } from "@/lib/types";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await readJson<{ keys?: unknown }>(request);
  if (!Array.isArray(body?.keys)) return jsonError("Lista de telefones inválida.");
  const keys = body.keys.filter(isString).slice(0, 5000);
  try {
    const existing = await loadExisting();
    const result: CheckResult = {
      existentes: keys.filter((k) => existing.keys.has(k)),
      optout: keys.filter((k) => existing.optout.has(k)),
      totalNaPlanilha: existing.rows,
      aba: getConfig().sheetTab,
      statusPadrao: getConfig().defaultStatus,
      planilhaUrl: sheetUrl(),
    };
    return Response.json(result);
  } catch (e) {
    return handleError(e);
  }
}
