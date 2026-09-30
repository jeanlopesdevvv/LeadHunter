import { consultarTrava, registrarChaveErrada } from "@/lib/disparo";
import { chaveConfere } from "@/lib/trava";

export const maxDuration = 20;

/**
 * Chamado pelo n8n (nó "Radar: Pode Enviar?") antes de cada mensagem. Não usa a sessão do site:
 * vale a chave da trava no endereço. Devolve o próprio contato + radar_parar.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  if (!chaveConfere(url.searchParams.get("chave"))) {
    registrarChaveErrada();
    return Response.json({ erro: "Chave da trava inválida. Copie os nós da trava de novo no Radar (Configuração)." }, { status: 401 });
  }
  const contato = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!contato || typeof contato !== "object" || Array.isArray(contato)) {
    return Response.json({ erro: "O n8n precisa mandar o contato no corpo (JSON)." }, { status: 400 });
  }
  const exec = (url.searchParams.get("exec") ?? "").slice(0, 80);
  return Response.json(await consultarTrava(contato, exec));
}
