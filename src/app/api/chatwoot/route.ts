import { conversasNaVisao, infoChatwoot } from "@/lib/chatwoot";

/** Atalho do atendimento: endereço do Chatwoot e, com token, quantas conversas estão na visão. */
export async function GET() {
  const info = infoChatwoot();
  return Response.json({ url: info.url, apiLigada: info.apiLigada, naVisao: await conversasNaVisao() });
}
