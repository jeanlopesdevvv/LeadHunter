import { handleError } from "@/lib/http";
import { painelDaCarol, type Periodo } from "@/lib/painel";

export const maxDuration = 60;

const PERIODOS = new Set<Periodo>(["hoje", "7d", "30d", "tudo"]);

/** Resultados da Carol: quem recebeu, quem respondeu e o quê. `?periodo=hoje|7d|30d|tudo&modelo=<nome>|todos`. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const p = params.get("periodo") as Periodo | null;
  const modelo = (params.get("modelo") ?? "").slice(0, 512) || undefined;
  try {
    return Response.json(await painelDaCarol(p && PERIODOS.has(p) ? p : "7d", modelo));
  } catch (e) {
    return handleError(e);
  }
}
