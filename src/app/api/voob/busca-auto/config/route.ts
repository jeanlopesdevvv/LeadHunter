import { readJson } from "@/lib/http";
import { buscaAutoDefinir } from "@/lib/voob/banco";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

const CHAVES = new Set(["ligado", "fila_dias", "max_consultas_dia", "reserva_cota", "refazer_dias"]);

/** Muda a busca automática. Corpo: { mudancas: { ligado?, fila_dias?, max_consultas_dia?, reserva_cota?, refazer_dias? } }. */
export async function POST(request: Request) {
  const body = await readJson<{ mudancas?: Record<string, unknown> }>(request);
  const m = body?.mudancas;
  if (!m || typeof m !== "object" || Array.isArray(m) || !Object.keys(m).length) return Response.json({ erro: "Nada para mudar." }, { status: 400 });
  const desconhecida = Object.keys(m).find((k) => !CHAVES.has(k));
  if (desconhecida) return Response.json({ erro: `Campo desconhecido: ${desconhecida}.` }, { status: 400 });
  try {
    return Response.json(await buscaAutoDefinir(m, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
