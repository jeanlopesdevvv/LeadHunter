import { lerFilaAtendente } from "@/lib/banco";
import { handleError } from "@/lib/http";

export const maxDuration = 30;

/** Fila do atendente: quem está esperando alguém da equipe agora (Carol → Henrique, Sofia → Pedro). */
export async function GET() {
  try {
    return Response.json(await lerFilaAtendente());
  } catch (e) {
    return handleError(e);
  }
}
