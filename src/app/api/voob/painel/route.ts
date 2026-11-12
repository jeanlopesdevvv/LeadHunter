import { painel } from "@/lib/voob/banco";
import { erroVoob } from "@/lib/voob/http";

export const maxDuration = 30;

/** Os números da prospecção da Voob. `?dias=14` (1 a 90). */
export async function GET(request: Request) {
  const dias = Math.min(90, Math.max(1, Number.parseInt(new URL(request.url).searchParams.get("dias") ?? "14", 10) || 14));
  try {
    return Response.json(await painel(dias));
  } catch (e) {
    return erroVoob(e);
  }
}
