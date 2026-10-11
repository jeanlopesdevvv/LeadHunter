import { registrarErroDoN8n } from "@/lib/disparo";
import { chaveConfere } from "@/lib/trava";

export const maxDuration = 20;

/**
 * Chamado pelo n8n (nó "Avisar Radar (erro de envio)" do Fluxo 1) quando o WhatsApp recusa um
 * envio por algo que não é o número (ex.: modelo com variáveis erradas). Vale a mesma chave da trava.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!chaveConfere(url.searchParams.get("chave"))) {
    return Response.json({ erro: "Chave inválida." }, { status: 401 });
  }
  const dados = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    return Response.json({ erro: "O n8n precisa mandar o erro no corpo (JSON)." }, { status: 400 });
  }
  registrarErroDoN8n(dados);
  return Response.json({ ok: true });
}
