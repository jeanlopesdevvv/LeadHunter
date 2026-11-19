import { NextResponse, type NextRequest } from "next/server";

import { getConfig } from "@/lib/env";
import { bloqueado, ipDe, limparFalhas, registrarFalha } from "@/lib/rate-limit";
import { createPersonToken, SESSION_COOKIE, SESSION_DAYS_PESSOA, type Pessoa } from "@/lib/session";
import { destinoSeguro, origemPermitida, origensDoCrm, pareceJwt, vencimentoDoJwt } from "@/lib/voob/crm-entrada-regras";
import { COOKIE_CRM, fecharTokens } from "@/lib/voob/crm-sessao-regras";
import { origemDoPedido, type ErroGoogle } from "@/lib/voob/google-regras";
import { enderecoDoCrm, LoginError, pessoaDaConta, pessoaSimulada } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/**
 * Abrir o Radar pelo menu do Voob CRM, já logado (19/11/2026). Corpo (formulário): access_token, destino?.
 * Só aceita POST vindo do site do CRM (Origin) e confere o token no Supabase Auth do CRM. Abre a sessão do Radar
 * (14 dias) e guarda o login do CRM para as ações em nome da pessoa (vale enquanto o token valer; depois, abrir pelo
 * menu do CRM de novo renova).
 */
export async function POST(request: NextRequest) {
  const cfg = getConfig();
  const origem = origemDoPedido(request.headers, request.url) || new URL(request.url).origin;
  const ir = (destino: string) => NextResponse.redirect(new URL(destino, origem), 303);
  const erro = (codigo: ErroGoogle) => ir(`/login?erro=${codigo}`);

  const ip = ipDe(request);
  if (bloqueado(ip)) return erro("crm_falhou");
  const permitidas = origensDoCrm(cfg.voobCrmSite, process.env.RADAR_CRM_ORIGENS);
  if (!cfg.mock && !origemPermitida(request.headers.get("origin"), permitidas)) {
    console.warn("[radar] entrada pelo CRM recusada: origem", request.headers.get("origin") ?? "(nenhuma)");
    return erro("crm_falhou");
  }
  const form = await request.formData().catch(() => null);
  const token = form?.get("access_token");
  const destino = destinoSeguro(form?.get("destino"));

  let pessoa: Pessoa;
  let tokenCrm: string | null = null;
  try {
    if (cfg.mock) {
      // Simulação: o "token" é um e-mail (mesmas regras do login simulado).
      if (typeof token !== "string" || !token.includes("@")) return erro("crm_expirou");
      pessoa = pessoaSimulada(token);
    } else {
      if (!pareceJwt(token)) return erro("crm_expirou");
      const base = enderecoDoCrm(cfg.voobCrmDbUrl, cfg.voobCrmUrl);
      if (!base || !cfg.voobCrmAnonKey) return erro("crm_falhou");
      const res = await fetch(`${base}/auth/v1/user`, {
        headers: { apikey: cfg.voobCrmAnonKey, Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 401 || res.status === 403) {
        registrarFalha(ip);
        return erro("crm_expirou");
      }
      if (!res.ok) return erro("crm_falhou");
      const u = (await res.json().catch(() => null)) as { id?: unknown; email?: unknown } | null;
      if (typeof u?.id !== "string") return erro("crm_falhou");
      pessoa = await pessoaDaConta(u.id, typeof u.email === "string" ? u.email : "");
      tokenCrm = token;
    }
  } catch (e) {
    if (e instanceof LoginError && e.status === 403) return erro("google_sem_acesso");
    console.error("[radar] entrada pelo CRM:", (e as Error)?.message ?? e);
    return erro("crm_falhou");
  }
  limparFalhas(ip);
  const res = ir(destino);
  const opcoes = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/", maxAge: SESSION_DAYS_PESSOA * 24 * 60 * 60 };
  res.cookies.set(SESSION_COOKIE, createPersonToken(pessoa), opcoes);
  if (tokenCrm) res.cookies.set(COOKIE_CRM, fecharTokens({ a: tokenCrm, r: "", e: vencimentoDoJwt(tokenCrm) }), opcoes);
  else res.cookies.set(COOKIE_CRM, "", { ...opcoes, maxAge: 0 });
  return res;
}
