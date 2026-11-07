import { comoPainelAutomatico } from "@/lib/automatico-regras";
import { lerPainelAutomatico } from "@/lib/banco";
import { handleError } from "@/lib/http";

export const maxDuration = 30;

/** Tela "Disparo automático": números, fila, 2º contato, freios, busca automática e mudanças (?dias=7|14|30). */
export async function GET(request: Request) {
  const d = Number(new URL(request.url).searchParams.get("dias"));
  const dias = [7, 14, 30].includes(d) ? d : 14;
  try {
    return Response.json(comoPainelAutomatico(await lerPainelAutomatico(dias)));
  } catch (e) {
    return handleError(e);
  }
}
