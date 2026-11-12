import { iniciarBuscaVoob, resumoBuscaVoob } from "@/lib/voob/busca-auto";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/** Busca automática da Voob: a configuração, quanto a base precisa, o que dá para gastar e as últimas rodadas. */
export async function GET() {
  try {
    const emp = await empresaAtual();
    return Response.json(await resumoBuscaVoob(emp.id));
  } catch (e) {
    return erroVoob(e);
  }
}

/** "Buscar agora": a mesma busca automática, fora do horário (busca pelo menos um dia de disparo). */
export async function POST() {
  try {
    const emp = await empresaAtual();
    return Response.json(await iniciarBuscaVoob(emp.id, "manual", await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
