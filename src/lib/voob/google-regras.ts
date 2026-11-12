/**
 * Entrar no Radar com o Google (12/11/2026, pedido do Jean: "as contas do Henrique e do Pedro provavelmente são
 * linkadas com o Google... A minha é."). É o mesmo "Entrar com o Google" do Voob CRM (Supabase Auth), no fluxo PKCE:
 * o Radar manda a pessoa ao login do Voob CRM, que manda ao Google; na volta, o Radar troca o código pela conta (com o
 * verificador que só ele tem, num cookie) e pergunta ao banco se aquela conta é da equipe do Radar (radar.pessoa).
 * Regras puras aqui (tests/google.test.ts); o servidor em google.ts e nas rotas /api/auth/google e /api/auth/google/volta.
 */

import { createHash, randomBytes } from "node:crypto";

export const COOKIE_GOOGLE = "lh_google";
/** Quanto tempo a pessoa tem para escolher a conta no Google. */
export const MINUTOS_GOOGLE = 10;

const b64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Verificador (43 letras) e desafio (SHA-256 dele) do PKCE. */
export function novoPkce(): { verificador: string; desafio: string } {
  const verificador = b64url(randomBytes(32));
  return { verificador, desafio: desafioDe(verificador) };
}

export const desafioDe = (verificador: string) => b64url(createHash("sha256").update(verificador).digest());

/** Só caminhos deste próprio site (bloqueia "//evil.com", "/\\evil.com" etc.). */
export function caminhoSeguro(raw: string | null | undefined): string {
  try {
    const base = "http://radar.local";
    const url = new URL(raw || "/", base);
    return url.origin === base ? `${url.pathname}${url.search}` : "/";
  } catch {
    return "/";
  }
}

/** O cookie do PKCE: verificador, para onde voltar e quando começou. */
export function cookieDoPkce(verificador: string, proximo: string, agora = Date.now()): string {
  return b64url(Buffer.from(JSON.stringify({ v: verificador, n: caminhoSeguro(proximo), t: agora }), "utf8"));
}

export function lerCookieDoPkce(valor: string | undefined, agora = Date.now()): { verificador: string; proximo: string } | null {
  if (!valor) return null;
  try {
    const x = JSON.parse(Buffer.from(valor.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { v?: unknown; n?: unknown; t?: unknown };
    if (typeof x.v !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(x.v)) return null;
    if (typeof x.t !== "number" || agora - x.t > MINUTOS_GOOGLE * 60_000 || x.t > agora + 60_000) return null;
    return { verificador: x.v, proximo: caminhoSeguro(typeof x.n === "string" ? x.n : "/") };
  } catch {
    return null;
  }
}

/** Endereços em que o Radar aceita estar (o Voob CRM só devolve a pessoa para os que estão na lista dele). */
export function origemPermitida(origem: string, fixa: string, producao: boolean): boolean {
  if (fixa) return origem === fixa.replace(/\/+$/, "");
  if (/^https:\/\/radar\.lavacar\.app$/.test(origem)) return true;
  return !producao && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

/** O endereço público do Radar, pelo proxy do EasyPanel (x-forwarded-*) ou pelo próprio pedido. */
export function origemDoPedido(headers: Headers, urlDoPedido: string): string {
  const u = new URL(urlDoPedido);
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? u.host).split(",")[0].trim();
  const proto = (headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "")).split(",")[0].trim();
  if (!/^[a-z0-9.-]+(:\d+)?$/i.test(host) || !/^https?$/.test(proto)) return "";
  return `${proto}://${host.toLowerCase()}`;
}

/** Para onde mandar a pessoa: o login com o Google do Voob CRM, já com o desafio do PKCE e a volta para o Radar. */
export function enderecoDoGoogle(baseCrm: string, voltaPara: string, desafio: string): string {
  const q = new URLSearchParams({ provider: "google", redirect_to: voltaPara, code_challenge: desafio, code_challenge_method: "s256" });
  return `${baseCrm.replace(/\/+$/, "")}/auth/v1/authorize?${q}`;
}

export type ErroGoogle = "google_off" | "google_cancelado" | "google_expirou" | "google_sem_acesso" | "google_falhou" | "google_recusado";

/** A mensagem da tela de entrada para cada erro da volta do Google. */
export const MENSAGEM_GOOGLE: Record<ErroGoogle, string> = {
  google_off: "Entrar com o Google ainda não foi configurado no servidor.",
  google_cancelado: "A entrada com o Google foi cancelada. Tente de novo.",
  google_expirou: "A entrada com o Google demorou demais ou foi aberta em outro navegador. Tente de novo.",
  google_sem_acesso: "A sua conta do Voob CRM não tem acesso ao Radar. Fale com o Jean.",
  google_falhou: "Não deu para entrar com o Google agora. Tente de novo ou entre com e-mail e senha.",
  google_recusado: "O Voob CRM não aceitou essa conta do Google. Use a conta do Google ligada ao seu usuário do Voob CRM.",
};

/** O que o Voob CRM respondeu na volta (?error=...) em um dos nossos erros. */
export function erroDaVolta(erro: string, descricao: string): ErroGoogle {
  if (/access_denied/i.test(erro) && /cancel|denied by user|user denied/i.test(descricao)) return "google_cancelado";
  if (/access_denied|signup|not allowed|disabled|hook/i.test(`${erro} ${descricao}`)) return "google_recusado";
  return "google_falhou";
}
