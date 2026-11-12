import { readJson } from "@/lib/http";
import { config, definir } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/** Configuração da empresa escolhida: marca, número, mensagem, o dia de hoje, a base e o que falta para ligar. */
export async function GET() {
  try {
    const emp = await empresaAtual();
    return Response.json(await config(emp.id));
  } catch (e) {
    return erroVoob(e);
  }
}

const CHAVES = new Set([
  "limite_dia", "dias", "hora_inicio", "hora_fim", "intervalo_min", "situacoes_site", "retomada_ligada", "retomada_dias",
  "freio_saidas_pct", "freio_minimo", "perfil", "canal_id",
  // 13/11/2026 (white label): a marca, quem responde, quem fala e o modelo escolhido.
  "nome", "cor", "logo", "publico", "responde", "responde_sistema", "agente", "modelo_prefixo", "modelo_prefixo_site", "retomada_prefixo",
  "botao_sim", "botao_nao",
]);

/** Muda a configuração. Corpo: { mudancas: {...} } (só as chaves conhecidas; o banco confere os valores). */
export async function POST(request: Request) {
  const body = await readJson<{ mudancas?: Record<string, unknown> }>(request);
  const m = body?.mudancas;
  if (!m || typeof m !== "object" || Array.isArray(m) || !Object.keys(m).length) {
    return Response.json({ erro: "Nada para mudar." }, { status: 400 });
  }
  const desconhecida = Object.keys(m).find((k) => !CHAVES.has(k));
  if (desconhecida) return Response.json({ erro: `Campo desconhecido: ${desconhecida}.` }, { status: 400 });
  try {
    const emp = await empresaAtual();
    return Response.json(await definir(emp.id, m, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
