import { handleError, jsonError, readJson } from "@/lib/http";
import { ModelosError, criarModelo, listarDaConta } from "@/lib/modelos";
import { LIMITES, ehConta, type BotaoRascunho, type RascunhoModelo } from "@/lib/modelos-regras";

export const maxDuration = 30;

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Modelos do WhatsApp de uma conta (?conta=carol|sofia), com status da Meta. */
export async function GET(request: Request) {
  const conta = new URL(request.url).searchParams.get("conta") ?? "carol";
  if (!ehConta(conta)) return jsonError("Conta inválida.", 400);
  try {
    return Response.json(await listarDaConta(conta));
  } catch (e) {
    return handleError(e);
  }
}

/** Cria um modelo e manda para a aprovação da Meta. */
export async function POST(request: Request) {
  const b = await readJson<Record<string, unknown>>(request);
  if (!b || !ehConta(b.conta)) return jsonError("Conta inválida.", 400);
  const botoes: BotaoRascunho[] = (Array.isArray(b.botoes) ? b.botoes : []).slice(0, 10).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { tipo: o.tipo === "link" ? "link" : "resposta", texto: texto(o.texto, 100), url: texto(o.url, LIMITES.url + 10) };
  });
  const rascunho: RascunhoModelo = {
    conta: b.conta,
    nome: texto(b.nome, 200),
    categoria: b.categoria === "UTILITY" ? "UTILITY" : "MARKETING",
    cabecalho: texto(b.cabecalho, 200),
    corpo: texto(b.corpo, 2000),
    rodape: texto(b.rodape, 200),
    botoes,
    exemploNome: texto(b.exemploNome, 60),
    exemploCidade: texto(b.exemploCidade, 80),
  };
  try {
    return Response.json({ ok: true, ...(await criarModelo(rascunho)) });
  } catch (e) {
    if (e instanceof ModelosError) return jsonError(e.message, e.status);
    return handleError(e);
  }
}
