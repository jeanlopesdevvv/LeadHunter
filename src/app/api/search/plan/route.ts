import { getConfig } from "@/lib/env";
import { handleError, isString, jsonError, readJson } from "@/lib/http";
import { mockResolveCityArea } from "@/lib/mock";
import { resolveCityArea } from "@/lib/places";
import type { PlanResult, Rect, SearchTask } from "@/lib/types";
import { mensagemCotaEsgotada, obterUso, registrarConsulta } from "@/lib/usage";

export const maxDuration = 60;

interface Body {
  termos?: unknown;
  cidades?: unknown;
}

function cleanList(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value)) return null;
  const list = value.filter(isString).map((s) => s.trim().slice(0, 80)).filter(Boolean);
  return list.length && list.length <= max ? [...new Set(list)] : null;
}

/**
 * Prepara a busca: uma consulta por termo × cidade (a cidade inteira) e o retângulo de cada
 * cidade, usado só se o Google esgotar os 60 resultados e for preciso dividir o mapa.
 */
export async function POST(request: Request) {
  const cfg = getConfig();
  if (!cfg.mock && !cfg.placesApiKey) {
    return jsonError("A chave do Google Maps ainda não foi configurada (GOOGLE_MAPS_API_KEY).", 503);
  }
  const body = await readJson<Body>(request);
  const termos = cleanList(body?.termos, 15);
  const cidades = cleanList(body?.cidades, 30);
  if (!termos) return jsonError("Escreva de 1 a 15 coisas para procurar (uma por linha).");
  if (!cidades) return jsonError("Escreva de 1 a 30 cidades ou bairros (um por linha).");

  try {
    const uso = await obterUso();
    if (uso.bloquear && uso.restantes <= 0) return jsonError(mensagemCotaEsgotada(uso), 429);

    const resolvidas = await Promise.all(
      cidades.map(async (cidade) => {
        try {
          const area = cfg.mock
            ? await mockResolveCityArea(cidade)
            : await resolveCityArea(cidade, cfg.placesApiKey, () => registrarConsulta("area"));
          return { ...area, erro: area.viewport ? "" : "não achei o contorno no mapa; a busca fica só na cidade inteira" };
        } catch (e) {
          return { entrada: cidade, nome: cidade, viewport: null, erro: (e as Error).message };
        }
      }),
    );

    const tarefas: SearchTask[] = [];
    for (const termo of termos) {
      for (const area of resolvidas) {
        tarefas.push({ id: `${termo}|${area.entrada}`, termo, cidade: area.entrada, textQuery: `${termo} em ${area.entrada}`, nivel: 0 });
      }
    }
    const areas: Record<string, Rect | null> = Object.fromEntries(resolvidas.map((a) => [a.entrada, a.viewport]));
    const result: PlanResult = {
      tarefas,
      areas,
      cidades: resolvidas.map(({ entrada, nome, erro }) => ({ entrada, nome, erro })),
      uso,
    };
    return Response.json(result);
  } catch (e) {
    return handleError(e);
  }
}
