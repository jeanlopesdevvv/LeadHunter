import { iniciarBuscaVoob, resumoBuscaVoob } from "@/lib/voob/busca-auto";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/** Busca automática da Voob: a configuração, quanto a base precisa, o que dá para gastar e as últimas rodadas. */
export async function GET() {
  try {
    return Response.json(await resumoBuscaVoob());
  } catch (e) {
    return erroVoob(e);
  }
}

/** "Buscar agora": a mesma busca automática, fora do horário (busca pelo menos um dia de disparo). */
export async function POST() {
  try {
    return Response.json(await iniciarBuscaVoob("manual", await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
