import { getConfig } from "@/lib/env";
import { DEPTHS, estimateRequests, splitRect, type Depth } from "@/lib/geo";
import { handleError, isString, jsonError, readJson } from "@/lib/http";
import { mockResolveCityArea } from "@/lib/mock";
import { resolveCityArea } from "@/lib/places";
import type { SearchTask } from "@/lib/types";

export const maxDuration = 60;

interface Body {
  termos?: unknown;
  cidades?: unknown;
  profundidade?: unknown;
}

function cleanList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter(isString).map((s) => s.trim().slice(0, 80)).filter(Boolean);
  return list.length && list.length <= max ? [...new Set(list)] : null;
}

export async function POST(request: Request) {
  const cfg = getConfig();
  if (!cfg.mock && !cfg.placesApiKey) {
    return jsonError("Chave da Google Places API não configurada (GOOGLE_MAPS_API_KEY).", 503);
  }
  const body = await readJson<Body>(request);
  const termos = cleanList(body?.termos, 15);
  const cidades = cleanList(body?.cidades, 30);
  const profundidade = (isString(body?.profundidade) && body.profundidade in DEPTHS ? body.profundidade : "rapida") as Depth;
  if (!termos) return jsonError("Informe de 1 a 15 termos de busca.");
  if (!cidades) return jsonError("Informe de 1 a 30 cidades ou regiões.");

  const estimativa = estimateRequests(termos.length, cidades.length, profundidade);
  if (estimativa > cfg.maxRequestsPerSearch) {
    return jsonError(
      `Esta busca pode usar até ${estimativa} consultas, acima do limite de ${cfg.maxRequestsPerSearch} por busca. ` +
        "Reduza termos, cidades ou a profundidade (ou aumente MAX_REQUESTS_PER_SEARCH).",
    );
  }

  try {
    const grid = DEPTHS[profundidade].grid;
    const areas = await Promise.all(
      cidades.map(async (cidade) => {
        if (grid === 1) return { entrada: cidade, nome: cidade, viewport: null, erro: "" };
        try {
          const area = cfg.mock ? await mockResolveCityArea(cidade) : await resolveCityArea(cidade, cfg.placesApiKey);
          return { ...area, erro: area.viewport ? "" : "área não encontrada; usando busca simples" };
        } catch (e) {
          return { entrada: cidade, nome: cidade, viewport: null, erro: (e as Error).message };
        }
      }),
    );

    const tasks: SearchTask[] = [];
    for (const area of areas) {
      const cells = area.viewport ? splitRect(area.viewport, grid) : [];
      for (const termo of termos) {
        if (!cells.length) {
          tasks.push({ id: `${termo}|${area.entrada}|1`, termo, cidade: area.entrada, textQuery: `${termo} em ${area.entrada}`, area: 1, areas: 1 });
          continue;
        }
        cells.forEach((rect, i) =>
          tasks.push({ id: `${termo}|${area.entrada}|${i + 1}`, termo, cidade: area.entrada, textQuery: termo, rect, area: i + 1, areas: cells.length }),
        );
      }
    }
    return Response.json({ tasks, estimativa, cidades: areas.map(({ entrada, nome, erro }) => ({ entrada, nome, erro })) });
  } catch (e) {
    return handleError(e);
  }
}
