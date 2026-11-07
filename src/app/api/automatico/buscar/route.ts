import { iniciarBuscaAuto } from "@/lib/busca-auto";
import { handleError } from "@/lib/http";

export const maxDuration = 30;

/** Botão "Buscar agora" da tela Disparo automático: a mesma busca automática, fora do horário. */
export async function POST(request: Request) {
  void request;
  try {
    return Response.json(await iniciarBuscaAuto("manual"));
  } catch (e) {
    return handleError(e);
  }
}
