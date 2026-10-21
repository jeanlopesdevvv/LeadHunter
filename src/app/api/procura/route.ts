import * as banco from "@/lib/banco";
import { usaBanco } from "@/lib/sheets";

export const maxDuration = 15;

/**
 * Cidades onde clientes abriram o app do Lavacar e não acharam lava-jato a 20 km (Onda 4, 21/10/2026).
 * A tela de busca sugere essas cidades. Falha aqui nunca atrapalha a busca: devolve lista vazia.
 */
export async function GET() {
  if (!usaBanco()) return Response.json({ cidades: [] });
  try {
    return Response.json({ cidades: await banco.cidadesComProcura() });
  } catch (e) {
    console.error("[leadhunter] procura:", (e as Error).message);
    return Response.json({ cidades: [], erro: true });
  }
}
