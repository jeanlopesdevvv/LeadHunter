import "server-only";

import { getConfig } from "@/lib/env";

import { tokensDaResposta } from "./crm-sessao-regras";
import { enderecoDoCrm, LoginError, pessoaDaConta, type Entrada } from "./pessoas";

/** Troca o código da volta do Google pela conta do Voob CRM (PKCE) e confere se ela usa o Radar. */
export async function trocarCodigoDoGoogle(codigo: string, verificador: string): Promise<Entrada> {
  const cfg = getConfig();
  if (cfg.mock) return { pessoa: { id: "00000000-0000-4000-8000-00000000000a", nome: "Jean", equipe: true }, tokens: null };
  const base = enderecoDoCrm(cfg.voobCrmDbUrl, cfg.voobCrmUrl);
  if (!base || !cfg.voobCrmAnonKey) throw new LoginError("Entrar com o Google ainda não foi configurado no servidor.", 503);
  let res: Response;
  try {
    res = await fetch(`${base}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: { apikey: cfg.voobCrmAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ auth_code: codigo, code_verifier: verificador }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new LoginError("Não deu para falar com o Voob CRM agora. Tente de novo em instantes.", 502);
  }
  const dados = (await res.json().catch(() => null)) as { user?: { id?: unknown; email?: unknown }; error_code?: unknown } | null;
  if (!res.ok) {
    // Código vencido, usado duas vezes ou de outro navegador: o Voob CRM recusa (400/404/422).
    throw new LoginError("A entrada com o Google expirou. Tente de novo.", res.status === 429 ? 429 : 401);
  }
  const id = typeof dados?.user?.id === "string" ? dados.user.id : "";
  const email = typeof dados?.user?.email === "string" ? dados.user.email : "";
  return { pessoa: await pessoaDaConta(id, email), tokens: tokensDaResposta(dados) };
}
