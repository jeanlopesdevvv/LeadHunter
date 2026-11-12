import { painel } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";

export const maxDuration = 30;

/** Os números da prospecção da empresa escolhida. `?dias=14` (1 a 90). */
export async function GET(request: Request) {
  const dias = Math.min(90, Math.max(1, Number.parseInt(new URL(request.url).searchParams.get("dias") ?? "14", 10) || 14));
  try {
    const emp = await empresaAtual();
    return Response.json(await painel(emp.id, dias));
  } catch (e) {
    return erroVoob(e);
  }
}
