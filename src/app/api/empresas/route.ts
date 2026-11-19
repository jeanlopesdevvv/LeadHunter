import { cookies } from "next/headers";

import { contextoDoRadar } from "@/lib/empresa-ativa";
import { COOKIE_EMPRESA } from "@/lib/empresas";
import { readJson } from "@/lib/http";
import { empresaCriar, limitesDefinir, pedidosLista } from "@/lib/voob/banco";
import { exigirEquipe } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { lerDadosDaEmpresa } from "@/lib/voob/marca";

export const maxDuration = 30;

/** As empresas que a pessoa vê, se ela pode criar uma (só a equipe da Voob) e, para a equipe, os pedidos de liberação. */
export async function GET() {
  const c = await contextoDoRadar();
  const pedidos = c.equipe ? await pedidosLista().catch(() => []) : [];
  return Response.json({ empresas: c.empresas, ativa: c.ativa?.id ?? null, podeCriar: c.equipe, erro: c.erroCrm, pedidos });
}

/**
 * Criar empresa (13/11/2026, white label; só a equipe). Corpo: { conta, nome?, cor?, logo?, publico?, agente?, responde?,
 * cidade?, pedido?, cota_buscas_mes?, envios_max_dia? }. 19/11/2026: o nome e o logo vêm da conta quando não vêm no pedido,
 * e quem pediu o Radar com essa conta passa a ver a empresa. Nasce desligada, sem número e sem busca automática; já fica
 * escolhida no seletor.
 */
export async function POST(request: Request) {
  try {
    const quem = await exigirEquipe();
    const body = await readJson<Record<string, unknown>>(request);
    const dados = lerDadosDaEmpresa(body ?? {}, true);
    if (typeof dados === "string") return Response.json({ erro: dados }, { status: 400 });
    const cfg = await empresaCriar(dados, quem.nome);
    const jar = await cookies();
    jar.set(COOKIE_EMPRESA, cfg.empresa.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60 });
    return Response.json(cfg);
  } catch (e) {
    return erroVoob(e);
  }
}

/** Limites de uma empresa (19/11/2026; só a equipe). Corpo: { empresa, cota_buscas_mes?, envios_max_dia? } (null = sem teto). */
export async function PATCH(request: Request) {
  try {
    const quem = await exigirEquipe();
    const body = await readJson<Record<string, unknown>>(request);
    const empresa = typeof body?.empresa === "string" ? body.empresa : "";
    if (!/^[a-z0-9-]{2,30}$/.test(empresa)) return Response.json({ erro: "Escolha a empresa." }, { status: 400 });
    const mudancas: Record<string, unknown> = {};
    for (const k of ["cota_buscas_mes", "envios_max_dia"]) if (body && k in body) mudancas[k] = body[k];
    if (!Object.keys(mudancas).length) return Response.json({ erro: "Nada para mudar." }, { status: 400 });
    return Response.json(await limitesDefinir(empresa, mudancas, quem.nome));
  } catch (e) {
    return erroVoob(e);
  }
}
