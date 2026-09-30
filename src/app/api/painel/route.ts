import { handleError } from "@/lib/http";
import { painelDaCarol, type Periodo } from "@/lib/painel";

export const maxDuration = 60;

const PERIODOS = new Set<Periodo>(["hoje", "7d", "30d", "tudo"]);

/** Resultados da Carol: quem recebeu, quem respondeu e o quê. `?periodo=hoje|7d|30d|tudo`. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams.get("periodo") as Periodo | null;
  try {
    return Response.json(await painelDaCarol(p && PERIODOS.has(p) ? p : "7d"));
  } catch (e) {
    return handleError(e);
  }
}
