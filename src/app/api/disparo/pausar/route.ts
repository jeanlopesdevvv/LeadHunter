import { interromperDisparo } from "@/lib/disparo";
import { handleError, readJson } from "@/lib/http";

export const maxDuration = 30;

/** Pausa (dá para continuar depois) ou cancela (todo mundo volta para a fila) o disparo em andamento. */
export async function POST(request: Request) {
  const body = await readJson<{ como?: unknown }>(request);
  const como = body?.como === "cancelado" ? "cancelado" : "pausado";
  try {
    return Response.json(await interromperDisparo(como));
  } catch (e) {
    return handleError(e);
  }
}
