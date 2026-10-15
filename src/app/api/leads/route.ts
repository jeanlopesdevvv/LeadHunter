import * as banco from "@/lib/banco";
import { validarEdicao } from "@/lib/banco-regras";
import { handleError, jsonError, readJson } from "@/lib/http";
import { esquecerLeituras, usaBanco } from "@/lib/sheets";

export const maxDuration = 30;

/** Lista de leads para a tela Leads (só quando a lista está no banco). */
export async function GET() {
  if (!usaBanco()) return Response.json({ fonte: "planilha", leads: [] });
  try {
    return Response.json({ fonte: "banco", leads: await banco.listarLeads(), atualizadoEm: Date.now() });
  } catch (e) {
    return handleError(e);
  }
}

/** Edita um lead: nome, tipo, cidade, situação e "não quer receber mensagens". */
export async function PATCH(request: Request) {
  if (!usaBanco()) return jsonError("A lista de leads ainda está na planilha: edite por lá.", 409);
  const v = validarEdicao(await readJson<unknown>(request));
  if (!v.ok) return jsonError(v.erro);
  try {
    const lead = await banco.editarLead(v.edicao);
    esquecerLeituras();
    return Response.json({ lead });
  } catch (e) {
    return handleError(e);
  }
}
