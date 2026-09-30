import { infoChatwoot } from "@/lib/chatwoot";

/** Atalho do atendimento: endereço do Chatwoot e se dá para abrir a conversa exata de cada contato. */
export async function GET() {
  const info = infoChatwoot();
  return Response.json({ url: info.url, apiLigada: info.apiLigada });
}
