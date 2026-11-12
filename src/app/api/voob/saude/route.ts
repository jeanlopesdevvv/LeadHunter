import { saude, saudeAtualizar } from "@/lib/voob/banco";
import { erroVoob } from "@/lib/voob/http";

export const maxDuration = 30;

/** Saúde do número da prospecção (lida da Meta de hora em hora pelo Voob CRM) e a sugestão de subir o limite. */
export async function GET() {
  try {
    return Response.json(await saude());
  } catch (e) {
    return erroVoob(e);
  }
}

/** "Ler agora": pede uma leitura nova à Meta (no máximo uma a cada 2 min). A resposta chega em segundos. */
export async function POST() {
  try {
    return Response.json(await saudeAtualizar());
  } catch (e) {
    return erroVoob(e);
  }
}
