import { saude, saudeAtualizar } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";

export const maxDuration = 30;

/** Saúde do número da prospecção (lida da Meta de hora em hora pelo Voob CRM) e a sugestão de subir o limite. */
export async function GET() {
  try {
    const emp = await empresaAtual();
    return Response.json(await saude(emp.id));
  } catch (e) {
    return erroVoob(e);
  }
}

/** "Ler agora": pede uma leitura nova à Meta (no máximo uma a cada 2 min). A resposta chega em segundos. */
export async function POST() {
  try {
    const emp = await empresaAtual();
    return Response.json(await saudeAtualizar(emp.id));
  } catch (e) {
    return erroVoob(e);
  }
}
