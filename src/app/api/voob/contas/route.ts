import { contas } from "@/lib/voob/banco";
import { exigirEquipe } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";

export const maxDuration = 30;

/** As contas do Voob CRM para escolher ao criar uma empresa (só a equipe). `?busca=nome` (até 30). */
export async function GET(request: Request) {
  try {
    await exigirEquipe();
    const busca = (new URL(request.url).searchParams.get("busca") ?? "").trim().slice(0, 60);
    return Response.json({ contas: await contas(busca) });
  } catch (e) {
    return erroVoob(e);
  }
}
