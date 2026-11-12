import { NextResponse } from "next/server";

import { getConfig } from "@/lib/env";
import { COOKIE_GOOGLE, cookieDoPkce, enderecoDoGoogle, MINUTOS_GOOGLE, novoPkce, origemDoPedido, origemPermitida } from "@/lib/voob/google-regras";
import { enderecoDoCrm, loginPorContaDisponivel } from "@/lib/voob/pessoas";

/**
 * "Entrar com o Google": manda a pessoa ao login com o Google do Voob CRM (PKCE). A volta é /api/auth/google/volta.
 * Precisa de VOOB_CRM_ANON_KEY e do endereço do Radar na lista de volta do Voob CRM (Supabase Auth › URL Configuration).
 */
export async function GET(request: Request) {
  const cfg = getConfig();
  const origem = origemDoPedido(request.headers, request.url);
  const fixa = (process.env.RADAR_URL ?? "").trim();
  const erro = (codigo: string) => NextResponse.redirect(new URL(`/login?erro=${codigo}`, origem || request.url), 303);
  if (!loginPorContaDisponivel()) return erro("google_off");
  if (!origemPermitida(origem, fixa, process.env.NODE_ENV === "production")) return erro("google_off");
  const proximo = new URL(request.url).searchParams.get("next") ?? "/";
  const { verificador, desafio } = novoPkce();
  const volta = `${fixa.replace(/\/+$/, "") || origem}/api/auth/google/volta`;
  const destino = cfg.mock
    ? `${volta}?code=simulado`
    : enderecoDoGoogle(enderecoDoCrm(cfg.voobCrmDbUrl, cfg.voobCrmUrl), volta, desafio);
  const res = NextResponse.redirect(destino, 303);
  res.cookies.set(COOKIE_GOOGLE, cookieDoPkce(verificador, proximo), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: MINUTOS_GOOGLE * 60,
  });
  return res;
}
