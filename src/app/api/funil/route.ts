import { lerFunilAtivacao } from "@/lib/banco";
import { periodoValido } from "@/lib/funil-regras";
import { handleError } from "@/lib/http";

export const maxDuration = 30;

/** Funil de ativação de parceiros: Carol → link → conta → pronto → primeiro agendamento (?dias=7|30|90). */
export async function GET(req: Request) {
  try {
    const dias = periodoValido(new URL(req.url).searchParams.get("dias"));
    return Response.json(await lerFunilAtivacao(dias));
  } catch (e) {
    return handleError(e);
  }
}
