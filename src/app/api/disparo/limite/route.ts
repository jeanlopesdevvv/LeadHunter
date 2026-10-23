import { salvarLimiteDiario } from "@/lib/banco";
import { statusDisparo } from "@/lib/disparo";
import { validarLimiteDiario } from "@/lib/disparo-regras";
import { handleError, jsonError, readJson } from "@/lib/http";

export const maxDuration = 30;

/** Muda o limite diário de disparos da Carol (guardado no banco; o Fluxo 1 do n8n lê de lá antes de cada disparo). */
export async function POST(request: Request) {
  const body = await readJson<{ valor?: unknown }>(request);
  const v = validarLimiteDiario(body?.valor);
  if (!v.ok) return jsonError(v.erro, 400);
  try {
    await salvarLimiteDiario(v.valor, "Radar");
    return Response.json(await statusDisparo());
  } catch (e) {
    return handleError(e);
  }
}
