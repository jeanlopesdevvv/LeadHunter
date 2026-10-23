import { handleError, jsonError, readJson } from "@/lib/http";
import { ModelosError, enviarNaConversa } from "@/lib/modelos";
import { ehConta } from "@/lib/modelos-regras";

export const maxDuration = 30;

/** Envia um modelo aprovado ao contato da conversa do Chatwoot (pelo comando #template que o n8n executa). */
export async function POST(request: Request) {
  const b = await readJson<{ conta?: unknown; conversa?: unknown; nome?: unknown; ia?: unknown }>(request);
  if (!b || !ehConta(b.conta)) return jsonError("Conta inválida.", 400);
  const nome = typeof b.nome === "string" ? b.nome.trim() : "";
  if (!/^[a-z0-9_]{1,512}$/.test(nome)) return jsonError("Modelo inválido.", 400);
  try {
    await enviarNaConversa(b.conta, Number(b.conversa), nome, b.ia === true);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof ModelosError) return jsonError(e.message, e.status);
    return handleError(e);
  }
}
