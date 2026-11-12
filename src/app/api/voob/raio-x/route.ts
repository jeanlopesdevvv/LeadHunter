import { readJson } from "@/lib/http";
import { examinarVarios } from "@/lib/voob/raio-x";

export const maxDuration = 60;

/** Raio-X de até 10 sites por vez. Corpo: { urls: string[] }. Devolve, na mesma ordem: situação, problemas e textos. */
export async function POST(request: Request) {
  const body = await readJson<{ urls?: unknown }>(request);
  const urls = Array.isArray(body?.urls) ? (body!.urls as unknown[]).filter((u): u is string => typeof u === "string" && u.trim().length > 3 && u.length < 300) : [];
  if (!urls.length) return Response.json({ erro: "Nenhum site para conferir." }, { status: 400 });
  if (urls.length > 10) return Response.json({ erro: "No máximo 10 sites de cada vez." }, { status: 400 });
  return Response.json({ itens: await examinarVarios(urls) });
}
