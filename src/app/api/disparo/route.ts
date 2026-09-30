import { iniciarDisparo, statusDisparo } from "@/lib/disparo";
import { handleError, isString, jsonError, readJson } from "@/lib/http";

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

/** Manda o n8n disparar a primeira mensagem para os contatos escolhidos (ou toda a fila). */
export async function POST(request: Request) {
  const body = await readJson<{ telefones?: unknown; todos?: unknown }>(request);
  const telefones = Array.isArray(body?.telefones) ? body.telefones.filter(isString).slice(0, 2000) : null;
  if (!telefones && body?.todos !== true) return jsonError("Diga para quem disparar: marque os contatos da fila.");
  try {
    return Response.json(await iniciarDisparo(telefones ?? "todos"));
  } catch (e) {
    return handleError(e);
  }
}
