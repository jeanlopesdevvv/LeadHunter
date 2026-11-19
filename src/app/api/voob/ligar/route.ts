import { readJson } from "@/lib/http";
import { buscaAutoDefinir, ligar } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/**
 * Liga ou desliga o Radar da empresa escolhida. Corpo: { ligado: boolean, buscar?: boolean }. Ligar já enche a fila de
 * hoje (se for dia e hora). 19/11/2026: com "buscar", a busca automática liga ou desliga junto (o Radar procura empresas
 * novas sozinho todo dia), para o cliente não ter de achar outra chave.
 */
export async function POST(request: Request) {
  const body = await readJson<{ ligado?: unknown; buscar?: unknown }>(request);
  if (typeof body?.ligado !== "boolean") return Response.json({ erro: "Diga se é para ligar ou desligar." }, { status: 400 });
  try {
    const emp = await empresaAtual();
    const quem = await quemFez();
    const cfg = await ligar(emp.id, body.ligado, quem);
    if (typeof body.buscar === "boolean") {
      await buscaAutoDefinir(emp.id, { ligado: body.buscar && body.ligado }, quem).catch((e) => console.error("[radar-voob] ligar a busca:", (e as Error).message));
    }
    return Response.json(cfg);
  } catch (e) {
    return erroVoob(e);
  }
}
