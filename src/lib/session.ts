import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sessão do Radar: cookie assinado (HMAC-SHA256). Dois formatos:
 * - senha da equipe (o de sempre): "exp.assinatura";
 * - por pessoa (12/11/2026, conta do Voob CRM): "p1.exp.dados.assinatura", com o id e o nome de quem entrou.
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

export interface Pessoa {
  /** Id da conta no Voob CRM. */
  id: string;
  /** Primeiro nome (aparece no menu e no histórico do que foi feito). */
  nome: string;
  /**
   * Da equipe da Voob (13/11/2026, white label): vê todas as empresas, o Lavacar e pode criar empresa. Cliente (false) vê só
   * as empresas da conta dele. Sessões antigas (sem o campo) eram todas da equipe: contam como equipe.
   */
  equipe?: boolean;
}

/** Sessão por pessoa vale menos dias: quem sai da equipe perde o acesso sozinho. */
export const SESSION_DAYS_PESSOA = 14;

function assinaturaConfere(payload: string, sig: string): boolean {
  const expected = Buffer.from(sign(payload));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export function createPersonToken(pessoa: Pessoa, now = Date.now()): string {
  const exp = String(now + SESSION_DAYS_PESSOA * 24 * 60 * 60 * 1000);
  const dados = Buffer.from(JSON.stringify({ u: pessoa.id, n: pessoa.nome.slice(0, 40), e: pessoa.equipe === false ? 0 : 1 }), "utf8").toString("base64url");
  const payload = `p1.${exp}.${dados}`;
  return `${payload}.${sign(payload)}`;
}

/** Lê a sessão: válida ou não e, se for por pessoa, quem é. */
export function lerSessao(token: string | undefined, now = Date.now()): { ok: boolean; pessoa: Pessoa | null } {
  const nao = { ok: false, pessoa: null };
  if (!token || !senhaDoApp().ok) return nao;
  const partes = token.split(".");
  if (partes[0] === "p1") {
    const [, exp, dados, sig] = partes;
    if (partes.length !== 4 || !exp || !dados || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return nao;
    if (!assinaturaConfere(`p1.${exp}.${dados}`, sig)) return nao;
    try {
      const d = JSON.parse(Buffer.from(dados, "base64url").toString("utf8")) as { u?: unknown; n?: unknown; e?: unknown };
      if (typeof d.u !== "string" || typeof d.n !== "string" || !d.u || !d.n) return nao;
      return { ok: true, pessoa: { id: d.u, nome: d.n, equipe: d.e !== 0 } };
    } catch {
      return nao;
    }
  }
  const [exp, sig] = partes;
  if (partes.length !== 2 || !exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return nao;
  return assinaturaConfere(exp, sig) ? { ok: true, pessoa: null } : nao;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  return lerSessao(token, now).ok;
}

/** A sessão é da equipe da Voob? Senha da equipe = sim; conta do Voob CRM = o que o banco disse ao entrar. */
export function sessaoDaEquipe(s: { ok: boolean; pessoa: Pessoa | null }): boolean {
  return s.ok && (s.pessoa ? s.pessoa.equipe !== false : true);
}

/** A senha única da equipe ainda vale? (RADAR_SENHA_UNICA=0 desliga, depois que todos entrarem com a própria conta.) */
export function senhaUnicaLiberada(): boolean {
  return !/^(0|nao|não|false|off)$/i.test(process.env.RADAR_SENHA_UNICA?.trim() ?? "");
}

export function passwordMatches(input: string): boolean {
  const password = process.env.APP_PASSWORD?.trim();
  if (!password || !senhaDoApp().ok) return false;
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(password).digest();
  return timingSafeEqual(a, b);
}
