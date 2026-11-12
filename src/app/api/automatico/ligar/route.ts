import { comoPainelAutomatico, CHAVES_LIGAR, type ChaveLigar } from "@/lib/automatico-regras";
import { ligarAutomatico, lerPainelAutomatico } from "@/lib/banco";
import { esquecerAutomaticoLigado } from "@/lib/disparo";
import { handleError, jsonError, readJson } from "@/lib/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/** Pausar/continuar o disparo automático, a busca automática ou o 2º contato. */
export async function POST(request: Request) {
  const body = await readJson<{ chave?: unknown; ligado?: unknown; dias?: unknown }>(request);
  const chave = typeof body?.chave === "string" && body.chave in CHAVES_LIGAR ? (body.chave as ChaveLigar) : null;
  if (!chave || typeof body?.ligado !== "boolean") return jsonError("Pedido inválido.");
  try {
    await ligarAutomatico(CHAVES_LIGAR[chave], body.ligado, `${await quemFez()} (${body.ligado ? "continuar" : "pausar"})`);
    esquecerAutomaticoLigado();
    const d = Number(body.dias);
    return Response.json(comoPainelAutomatico(await lerPainelAutomatico([7, 14, 30].includes(d) ? d : 14)));
  } catch (e) {
    return handleError(e);
  }
}
