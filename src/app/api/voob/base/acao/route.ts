import { readJson } from "@/lib/http";
import { acao } from "@/lib/voob/banco";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";
import type { AcaoBase } from "@/lib/voob/tipos";

export const maxDuration = 30;

const ACOES = new Set<AcaoBase>(["descartar", "restaurar", "priorizar", "tirar_da_fila"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ações na base. Corpo: { ids: uuid[], acao: "descartar" | "restaurar" | "priorizar" | "tirar_da_fila" }. */
export async function POST(request: Request) {
  const body = await readJson<{ ids?: unknown; acao?: unknown }>(request);
  const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string" && UUID.test(x)) : [];
  if (!ids.length) return Response.json({ erro: "Escolha pelo menos uma empresa." }, { status: 400 });
  if (ids.length > 500) return Response.json({ erro: "No máximo 500 de cada vez." }, { status: 400 });
  if (!ACOES.has(body?.acao as AcaoBase)) return Response.json({ erro: "Ação desconhecida." }, { status: 400 });
  try {
    return Response.json(await acao(ids, body!.acao as AcaoBase, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
