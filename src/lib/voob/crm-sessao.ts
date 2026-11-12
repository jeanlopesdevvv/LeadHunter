import "server-only";

import { cookies } from "next/headers";

import { getConfig } from "@/lib/env";

import { abrirTokens, COOKIE_CRM, fecharTokens, precisaRenovar, tokensDaResposta, type TokensCrm } from "./crm-sessao-regras";
import { enderecoDoCrm } from "./pessoas";

/**
 * A sessão do Voob CRM dentro do Radar (13/11/2026, white label). Para conectar número e mexer em modelos em nome da
 * pessoa, o Radar chama as funções do próprio Voob CRM (whatsapp-oficial, whatsapp-modelos) com o login dela: cada um só
 * faz o que a conta dele permite, igual no CRM. O login fica num cookie criptografado (só o servidor lê) e é renovado
 * sozinho quando vence (1 h). Senha da equipe = sem sessão do CRM (essas ações pedem para entrar com a conta).
 */

export { COOKIE_CRM, tokensDaResposta, type TokensCrm } from "./crm-sessao-regras";

const opcoes = (dias: number) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: dias * 24 * 60 * 60,
});

/** Cookie só grava numa rota (numa página dá erro): aí o token novo vale só neste pedido. */
function gravar(f: () => void) {
  try {
    f();
  } catch {
    /* fora de uma rota */
  }
}

/** Guarda o login do CRM (no login por e-mail e senha e na volta do Google). */
export async function guardarSessaoCrm(t: TokensCrm, dias: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_CRM, fecharTokens(t), opcoes(dias));
}

export async function apagarSessaoCrm(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_CRM, "", { ...opcoes(0), maxAge: 0 });
}

/**
 * O token para chamar o Voob CRM em nome de quem está usando o Radar. null = entrou com a senha da equipe ou o login do
 * CRM acabou (a tela pede para entrar de novo com a conta). Renova sozinho quando falta menos de 2 min para vencer.
 */
export async function tokenDoCrm(): Promise<string | null> {
  const cfg = getConfig();
  if (cfg.mock) return "token-simulado";
  const jar = await cookies();
  const t = abrirTokens(jar.get(COOKIE_CRM)?.value);
  if (!t) return null;
  if (!precisaRenovar(t)) return t.a;
  const base = enderecoDoCrm(cfg.voobCrmDbUrl, cfg.voobCrmUrl);
  if (!base || !cfg.voobCrmAnonKey) return null;
  try {
    const res = await fetch(`${base}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: cfg.voobCrmAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: t.r }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const novo = res.ok ? tokensDaResposta(await res.json().catch(() => null)) : null;
    if (!novo) {
      if (res.status === 400 || res.status === 401) gravar(() => jar.set(COOKIE_CRM, "", { ...opcoes(0), maxAge: 0 }));
      return null;
    }
    // A sessão do Radar dura 14 dias: o login do CRM acompanha.
    gravar(() => jar.set(COOKIE_CRM, fecharTokens(novo), opcoes(14)));
    return novo.a;
  } catch {
    return null;
  }
}
