import { iniciarDisparo, statusDisparo } from "@/lib/disparo";
import { handleError } from "@/lib/http";

export const maxDuration = 60;

/** Fila da Carol e progresso do disparo em andamento (lido da planilha). */
export async function GET(request: Request) {
  void request; // rota sempre dinâmica
  try {
    return Response.json(await statusDisparo());
  } catch (e) {
    return handleError(e);
  }
}

/** Manda o n8n disparar a primeira mensagem para todos os pendentes. */
export async function POST() {
  try {
    return Response.json(await iniciarDisparo());
  } catch (e) {
    return handleError(e);
  }
}
