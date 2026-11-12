import { NextResponse, type NextRequest } from "next/server";

import { bloqueado, ipDe, limparFalhas, registrarFalha } from "@/lib/rate-limit";
import { createPersonToken, SESSION_COOKIE, SESSION_DAYS_PESSOA } from "@/lib/session";
import { COOKIE_CRM, fecharTokens } from "@/lib/voob/crm-sessao-regras";
import { trocarCodigoDoGoogle } from "@/lib/voob/google";
import { COOKIE_GOOGLE, erroDaVolta, lerCookieDoPkce, origemDoPedido, type ErroGoogle } from "@/lib/voob/google-regras";
import { LoginError } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/** Volta do Google: troca o código pela conta do Voob CRM, confere o acesso ao Radar e abre a sessão (14 dias). */
export async function GET(request: NextRequest) {
  const origem = origemDoPedido(request.headers, request.url) || new URL(request.url).origin;
  const url = new URL(request.url);
  const pkce = lerCookieDoPkce(request.cookies.get(COOKIE_GOOGLE)?.value);
  const sair = (destino: string) => {
    const res = NextResponse.redirect(new URL(destino, origem), 303);
    res.cookies.set(COOKIE_GOOGLE, "", { path: "/api/auth/google", maxAge: 0 });
    return res;
  };
  const erro = (codigo: ErroGoogle) => sair(`/login?erro=${codigo}`);

  const ip = ipDe(request);
  if (bloqueado(ip)) return erro("google_falhou");
  const erroDoCrm = url.searchParams.get("error");
  if (erroDoCrm) return erro(erroDaVolta(erroDoCrm, url.searchParams.get("error_description") ?? ""));
  const codigo = url.searchParams.get("code") ?? "";
  if (!pkce) return erro("google_expirou");
  if (!/^[A-Za-z0-9._~-]{6,200}$/.test(codigo)) return erro("google_falhou");
  try {
    const { pessoa, tokens } = await trocarCodigoDoGoogle(codigo, pkce.verificador);
    limparFalhas(ip);
    const res = sair(pkce.proximo);
    const opcoes = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
      maxAge: SESSION_DAYS_PESSOA * 24 * 60 * 60,
    };
    res.cookies.set(SESSION_COOKIE, createPersonToken(pessoa), opcoes);
    // 13/11/2026: o login do Voob CRM fica guardado (criptografado) para conectar número e mexer em modelos.
    if (tokens) res.cookies.set(COOKIE_CRM, fecharTokens(tokens), opcoes);
    else res.cookies.set(COOKIE_CRM, "", { ...opcoes, maxAge: 0 });
    return res;
  } catch (e) {
    registrarFalha(ip);
    if (e instanceof LoginError) {
      if (e.status === 403) return erro("google_sem_acesso");
      if (e.status === 401) return erro("google_expirou");
    } else {
      console.error("[radar] google:", (e as Error)?.message ?? e);
    }
    return erro("google_falhou");
  }
}
