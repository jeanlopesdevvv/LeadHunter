import { readJson } from "@/lib/http";
import { config, definir } from "@/lib/voob/banco";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/** Configuração da prospecção da Voob: número, mensagem, o dia de hoje, a base e o que falta para ligar. */
export async function GET() {
  try {
    return Response.json(await config());
  } catch (e) {
    return erroVoob(e);
  }
}

const CHAVES = new Set([
  "limite_dia", "dias", "hora_inicio", "hora_fim", "intervalo_min", "situacoes_site", "retomada_ligada", "retomada_dias",
  "freio_saidas_pct", "freio_minimo", "perfil", "canal_id",
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
    return Response.json(await definir(m, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
