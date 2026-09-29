import { getConfig } from "@/lib/env";
import { handleError, isString, jsonError, readJson } from "@/lib/http";
import { mockSearchPage } from "@/lib/mock";
import { searchPage } from "@/lib/places";
import type { Rect } from "@/lib/types";

export const maxDuration = 60;

interface Body {
  textQuery?: unknown;
  termo?: unknown;
  cidade?: unknown;
  rect?: unknown;
  pageToken?: unknown;
}

function parseRect(value: unknown): Rect | undefined | null {
  if (value === undefined || value === null) return undefined;
  const r = value as Rect;
  const nums = [r?.low?.latitude, r?.low?.longitude, r?.high?.latitude, r?.high?.longitude];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  return { low: { latitude: r.low.latitude, longitude: r.low.longitude }, high: { latitude: r.high.latitude, longitude: r.high.longitude } };
}

export async function POST(request: Request) {
  const cfg = getConfig();
  if (!cfg.mock && !cfg.placesApiKey) {
    return jsonError("Chave da Google Places API não configurada (GOOGLE_MAPS_API_KEY).", 503);
  }
  const body = await readJson<Body>(request);
  if (!body || !isString(body.textQuery) || !body.textQuery.trim() || !isString(body.termo) || !isString(body.cidade)) {
    return jsonError("Consulta inválida.");
  }
  const rect = parseRect(body.rect);
  if (rect === null) return jsonError("Área inválida.");
  const input = {
    textQuery: body.textQuery.slice(0, 160),
    termo: body.termo.slice(0, 80),
    cidade: body.cidade.slice(0, 80),
    rect,
    pageToken: isString(body.pageToken) ? body.pageToken : null,
  };
  try {
    const result = cfg.mock ? await mockSearchPage(input) : await searchPage(input, cfg.placesApiKey);
    return Response.json(result);
  } catch (e) {
    return handleError(e);
  }
}
