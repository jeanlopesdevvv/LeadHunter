import { listarModelos } from "@/lib/templates";
import { handleError } from "@/lib/http";

export const maxDuration = 30;

/** Modelos do WhatsApp aprovados no Meta (para escolher qual a Carol manda no disparo). */
export async function GET(request: Request) {
  const forcar = new URL(request.url).searchParams.get("atualizar") === "1";
  try {
    return Response.json(await listarModelos(forcar));
  } catch (e) {
    return handleError(e);
  }
}
