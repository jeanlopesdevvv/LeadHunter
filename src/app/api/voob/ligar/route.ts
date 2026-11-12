import { readJson } from "@/lib/http";
import { ligar } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/** Liga ou desliga o Radar da empresa escolhida. Corpo: { ligado: boolean }. Ligar já enche a fila de hoje (se for dia e hora). */
export async function POST(request: Request) {
  const body = await readJson<{ ligado?: unknown }>(request);
  if (typeof body?.ligado !== "boolean") return Response.json({ erro: "Diga se é para ligar ou desligar." }, { status: 400 });
  try {
    const emp = await empresaAtual();
    return Response.json(await ligar(emp.id, body.ligado, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
