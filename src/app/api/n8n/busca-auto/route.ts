import { iniciarBuscaAuto } from "@/lib/busca-auto";
import { handleError } from "@/lib/http";
import { chaveConfere } from "@/lib/trava";
import { iniciarBuscaVoob } from "@/lib/voob/busca-auto";

export const maxDuration = 30;

/**
 * Chamado pelo n8n ("Radar - Busca automática de leads", de segunda a sexta às 8h41 e às 13h41, pulando feriado).
 * Vale a mesma chave da trava. As buscas rodam em segundo plano; a resposta diz se começaram e quanto precisavam.
 * 12/11/2026: a mesma chamada também começa a busca automática da Voob (cada uma com a sua configuração; uma não
 * atrapalha a outra).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!chaveConfere(url.searchParams.get("chave"))) {
    return Response.json({ erro: "Chave inválida." }, { status: 401 });
  }
  let voob: unknown;
  try {
    voob = await iniciarBuscaVoob("rotina");
  } catch (e) {
    voob = { iniciada: false, texto: (e as Error).message?.slice(0, 200) ?? "erro" };
  }
  try {
    return Response.json({ ...(await iniciarBuscaAuto("rotina")), voob });
  } catch (e) {
    return handleError(e);
  }
}
