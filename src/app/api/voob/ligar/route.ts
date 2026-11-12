import { readJson } from "@/lib/http";
import { ligar } from "@/lib/voob/banco";
import { erroVoob } from "@/lib/voob/http";

export const maxDuration = 30;

/** Liga ou desliga a prospecção da Voob. Corpo: { ligado: boolean }. Ligar já enche a fila de hoje (se for dia e hora). */
export async function POST(request: Request) {
  const body = await readJson<{ ligado?: unknown }>(request);
  if (typeof body?.ligado !== "boolean") return Response.json({ erro: "Diga se é para ligar ou desligar." }, { status: 400 });
  try {
    return Response.json(await ligar(body.ligado));
  } catch (e) {
    return erroVoob(e);
  }
}
