import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sessão simples por senha única: cookie "exp.assinatura" (HMAC-SHA256).
 * Trocar APP_PASSWORD (ou AUTH_SECRET) derruba todas as sessões.
 */

export const SESSION_COOKIE = "lh_session";

/**
 * A senha do app só vale se tiver 8+ caracteres e não for o texto de exemplo
 * (evita subir o servidor com "TROQUE_POR_UMA_SENHA" por esquecimento).
 */
export function senhaDoApp(): { ok: boolean; motivo: string } {
  const password = process.env.APP_PASSWORD?.trim() ?? "";
  if (!password) return { ok: false, motivo: "A senha do app ainda não foi definida (APP_PASSWORD)." };
  if (password.length < 8 || /troque|escolha|exemplo|placeholder/i.test(password)) {
    return { ok: false, motivo: "A senha do app (APP_PASSWORD) é a de exemplo ou tem menos de 8 caracteres. Defina uma senha de verdade." };
  }
  return { ok: true, motivo: "" };
}
export const SESSION_DAYS = 30;

function secret(): string {
  // A senha entra sempre na chave: trocar APP_PASSWORD encerra todas as sessões.
  const password = process.env.APP_PASSWORD?.trim() ?? "";
  const extra = process.env.AUTH_SECRET?.trim() ?? "";
  return createHash("sha256").update(`leadhunter:v3:${extra}:${password}`).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(now = Date.now()): string {
  const exp = String(now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${exp}.${sign(exp)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !senhaDoApp().ok) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  const expected = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function passwordMatches(input: string): boolean {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password || !senhaDoApp().ok) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}
