import { iniciarBuscaAuto } from "@/lib/busca-auto";
import { handleError } from "@/lib/http";
import { chaveConfere } from "@/lib/trava";

export const maxDuration = 30;

/**
 * Chamado pelo n8n ("Radar - Busca automática de leads", de segunda a sexta antes da 1ª rodada do disparo).
 * Vale a mesma chave da trava. A busca roda em segundo plano; a resposta diz se começou e quanto a fila precisava.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!chaveConfere(url.searchParams.get("chave"))) {
    return Response.json({ erro: "Chave inválida." }, { status: 401 });
  }
  try {
    return Response.json(await iniciarBuscaAuto("rotina"));
  } catch (e) {
    return handleError(e);
  }
}
