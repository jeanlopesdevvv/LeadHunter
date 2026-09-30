import { infoChatwoot, linkDaConversa } from "@/lib/chatwoot";

export const maxDuration = 20;

/**
 * Abre a conversa do contato no Chatwoot (redireciona). Sem token ou sem conversa, abre a tela
 * padrão do atendimento: o Radar já copiou o telefone para colar na busca.
 */
export async function GET(request: Request) {
  const info = infoChatwoot();
  const telefone = new URL(request.url).searchParams.get("telefone") ?? "";
  let destino = info.url || "/";
  try {
    destino = (await linkDaConversa(telefone)) ?? destino;
  } catch {
    /* Chatwoot fora do ar ou token inválido: abre a tela padrão */
  }
  return Response.redirect(destino.startsWith("http") ? destino : new URL(destino, request.url).toString(), 302);
}
