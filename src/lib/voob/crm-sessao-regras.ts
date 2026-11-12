import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * O cookie com o login do Voob CRM (13/11/2026): criptografado (AES-256-GCM) com a chave do Radar (APP_PASSWORD e
 * AUTH_SECRET, como a sessão). Trocar a senha do app invalida os dois. Sem servidor: vale para os testes.
 */

export const COOKIE_CRM = "lh_crm";

export interface TokensCrm {
  /** access_token (JWT do Voob CRM, vale 1 h). */
  a: string;
  /** refresh_token (renova o de cima). */
  r: string;
  /** Quando o access_token vence (ms). */
  e: number;
}

function chave(): Buffer {
  const senha = process.env.APP_PASSWORD?.trim() ?? "";
  const extra = process.env.AUTH_SECRET?.trim() ?? "";
  return createHash("sha256").update(`leadhunter:crm:v1:${extra}:${senha}`).digest();
}

export function fecharTokens(t: TokensCrm): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const corpo = Buffer.concat([c.update(JSON.stringify(t), "utf8"), c.final()]);
  return ["c1", iv.toString("base64url"), corpo.toString("base64url"), c.getAuthTag().toString("base64url")].join(".");
}

export function abrirTokens(v: string | undefined | null): TokensCrm | null {
  if (!v) return null;
  const [versao, iv, corpo, tag] = v.split(".");
  if (versao !== "c1" || !iv || !corpo || !tag) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    const t = JSON.parse(Buffer.concat([d.update(Buffer.from(corpo, "base64url")), d.final()]).toString("utf8")) as Partial<TokensCrm>;
    if (typeof t.a !== "string" || typeof t.r !== "string" || typeof t.e !== "number" || !t.a || !t.r) return null;
    return { a: t.a, r: t.r, e: t.e };
  } catch {
    return null;
  }
}

/** Falta menos de 2 min para vencer (ou já venceu). */
export const precisaRenovar = (t: TokensCrm, agora = Date.now()) => t.e - agora < 120_000;

/** O que a resposta do login do Supabase Auth traz (password, pkce e refresh_token têm o mesmo formato). */
export function tokensDaResposta(d: unknown): TokensCrm | null {
  const x = d as { access_token?: unknown; refresh_token?: unknown; expires_at?: unknown; expires_in?: unknown } | null;
  if (!x || typeof x.access_token !== "string" || typeof x.refresh_token !== "string" || !x.access_token || !x.refresh_token) return null;
  const exp = typeof x.expires_at === "number" ? x.expires_at * 1000 : Date.now() + (typeof x.expires_in === "number" ? x.expires_in : 3600) * 1000;
  return { a: x.access_token, r: x.refresh_token, e: exp };
}

