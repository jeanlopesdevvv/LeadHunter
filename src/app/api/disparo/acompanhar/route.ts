import { acompanharDisparo } from "@/lib/disparo";
import { handleError, isString, jsonError, readJson } from "@/lib/http";

export const maxDuration = 30;

/** O navegador lembra do último disparo e pede para continuar acompanhando (ex.: servidor reiniciou). */
export async function POST(request: Request) {
  const body = await readJson<{ iniciadoEm?: unknown; chaves?: unknown; interrompido?: unknown; retomadoEm?: unknown }>(request);
  const iniciadoEm = typeof body?.iniciadoEm === "number" ? body.iniciadoEm : NaN;
  const chaves = Array.isArray(body?.chaves) ? body.chaves.filter(isString) : [];
  if (!Number.isFinite(iniciadoEm) || !chaves.length) return jsonError("Disparo inválido.");
  const i = body?.interrompido as { como?: unknown; em?: unknown } | null | undefined;
  const interrompido =
    i && (i.como === "pausado" || i.como === "cancelado") && typeof i.em === "number"
      ? { como: i.como as "pausado" | "cancelado", em: i.em }
      : null;
  const retomadoEm = typeof body?.retomadoEm === "number" ? body.retomadoEm : null;
  try {
    return Response.json(await acompanharDisparo(iniciadoEm, chaves, { interrompido, retomadoEm }));
  } catch (e) {
    return handleError(e);
  }
}
