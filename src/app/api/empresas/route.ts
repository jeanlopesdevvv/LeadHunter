import { cookies } from "next/headers";

import { contextoDoRadar } from "@/lib/empresa-ativa";
import { COOKIE_EMPRESA } from "@/lib/empresas";
import { readJson } from "@/lib/http";
import { empresaCriar } from "@/lib/voob/banco";
import { exigirEquipe } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { lerDadosDaEmpresa } from "@/lib/voob/marca";

export const maxDuration = 30;

/** As empresas que a pessoa vê e se ela pode criar uma (só a equipe da Voob, por enquanto). */
export async function GET() {
  const c = await contextoDoRadar();
  return Response.json({ empresas: c.empresas, ativa: c.ativa?.id ?? null, podeCriar: c.equipe, erro: c.erroCrm });
}

/**
 * Criar empresa (13/11/2026, white label; só a equipe). Corpo: { nome, conta, cor?, logo?, publico?, agente?, responde?,
 * cidade? }. Nasce desligada, sem número e sem busca automática; já fica escolhida no seletor.
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
