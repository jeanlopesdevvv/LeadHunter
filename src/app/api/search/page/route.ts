import { getConfig } from "@/lib/env";
import { handleError, isString, jsonError, readJson } from "@/lib/http";
import { mockSearchPage } from "@/lib/mock";
import { searchPage } from "@/lib/places";
import { existingKeysCached } from "@/lib/sheets";
import type { Lead, Rect } from "@/lib/types";
import { obterUso, reservarConsulta } from "@/lib/usage";

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
    return jsonError("A chave do Google Maps ainda não foi configurada (GOOGLE_MAPS_API_KEY).", 503);
  }
  const body = await readJson<Body>(request);
  if (!body || !isString(body.textQuery) || !body.textQuery.trim() || !isString(body.termo) || !isString(body.cidade)) {
    return jsonError("Pedido de busca inválido.");
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

  // Confere a cota do mês antes de gastar (com o bloqueio ligado).
  const reserva = await reservarConsulta();
  if (!reserva.ok) return Response.json({ erro: reserva.mensagem, cota: true, uso: reserva.uso }, { status: 429 });

  try {
    const result = cfg.mock ? await mockSearchPage(input) : await searchPage(input, cfg.placesApiKey);
    reserva.concluir(true);
    const [leads, uso] = await Promise.all([marcarPlanilha(result.leads), obterUso()]);
    return Response.json({ ...result, leads, uso });
  } catch (e) {
    reserva.concluir(false);
    return handleError(e);
  }
}

/** Marca cada lead como novo / já na planilha (leitura guardada por alguns segundos). */
async function marcarPlanilha(leads: Lead[]): Promise<Lead[]> {
  try {
    const { keys, optout } = await existingKeysCached();
    return leads.map((l): Lead => {
      if (!l.telefoneKey) return { ...l, planilha: "novo" };
      if (optout.has(l.telefoneKey)) return { ...l, planilha: "optout" };
      if (keys.has(l.telefoneKey)) return { ...l, planilha: "existente" };
      return { ...l, planilha: "novo" };
    });
  } catch {
    return leads; // planilha indisponível: fica "desconhecido" e o painel avisa depois
  }
}
