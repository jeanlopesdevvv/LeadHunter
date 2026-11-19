import { readJson } from "@/lib/http";
import { aceitar } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/**
 * Aceite de responsabilidade da empresa escolhida (19/11/2026; obrigatório para ligar). Corpo: { aceito: true }.
 * Fica guardado quem aceitou, quando e a versão do texto.
 */
export async function POST(request: Request) {
  const body = await readJson<{ aceito?: unknown }>(request);
  if (body?.aceito !== true) return Response.json({ erro: "Marque que está de acordo para continuar." }, { status: 400 });
  try {
    const emp = await empresaAtual();
    return Response.json(await aceitar(emp.id, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
