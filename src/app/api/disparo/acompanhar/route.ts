import { acompanharDisparo } from "@/lib/disparo";
import { handleError, isString, jsonError, readJson } from "@/lib/http";

export const maxDuration = 30;

/** O navegador lembra do último disparo e pede para continuar acompanhando (ex.: servidor reiniciou). */
export async function POST(request: Request) {
  const body = await readJson<{ iniciadoEm?: unknown; chaves?: unknown }>(request);
  const iniciadoEm = typeof body?.iniciadoEm === "number" ? body.iniciadoEm : NaN;
  const chaves = Array.isArray(body?.chaves) ? body.chaves.filter(isString) : [];
  if (!Number.isFinite(iniciadoEm) || !chaves.length) return jsonError("Disparo inválido.");
  try {
    return Response.json(await acompanharDisparo(iniciadoEm, chaves));
  } catch (e) {
    return handleError(e);
  }
}
