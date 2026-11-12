import "server-only";

import { cookies } from "next/headers";

import { getConfig } from "@/lib/env";
import { lerSessao, passwordMatches, SESSION_COOKIE, type Pessoa } from "@/lib/session";

import { VoobError, pessoaDoRadar } from "./banco";

/**
 * Entrar no Radar com a conta do Voob CRM (12/11/2026). O Radar não guarda senha de ninguém: manda o e-mail e a senha
 * para o login do próprio Voob CRM (Supabase Auth) e, se entrar, pergunta ao banco (radar.pessoa) se aquela conta é
 * da equipe que usa o Radar. Daí em diante, o histórico (radar.log) mostra o nome de quem fez cada coisa.
 */

export class LoginError extends Error {
  constructor(
    message: string,
    public status = 401,
  ) {
    super(message);
  }
}

/** Endereço do projeto do Voob CRM: VOOB_CRM_URL ou o que sai do usuário do banco ("radar_voob.<projeto>"). */
export function enderecoDoCrm(dbUrl: string, urlFixa = ""): string {
  if (urlFixa) return urlFixa.replace(/\/+$/, "");
  const m = /\/\/[^:/@]+\.([a-z0-9]{15,30})(?::[^@]*)?@/i.exec(dbUrl);
  return m ? `https://${m[1]}.supabase.co` : "";
}

export function loginPorContaDisponivel(): boolean {
  const cfg = getConfig();
  if (cfg.mock) return true;
  return Boolean(cfg.voobCrmAnonKey && enderecoDoCrm(cfg.voobCrmDbUrl, cfg.voobCrmUrl));
}

/** O que o login do Voob CRM respondeu, em português (mensagem e status para a tela). */
export function motivoDaRecusa(status: number, codigo: string): [string, number] {
  if (codigo === "invalid_credentials") return ["E-mail ou senha incorretos.", 401];
  if (codigo === "email_not_confirmed") return ["Confirme o e-mail da sua conta no Voob CRM antes de entrar aqui.", 403];
  if (codigo === "user_banned") return ["Esta conta está bloqueada no Voob CRM.", 403];
  if (status === 400 || status === 401 || status === 422) return ["E-mail ou senha incorretos.", 401];
  return ["O Voob CRM não respondeu ao login. Tente de novo em instantes.", 502];
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0]?.slice(0, 40) || "Equipe";

export async function entrarComConta(email: string, senha: string): Promise<Pessoa> {
  const cfg = getConfig();
  if (cfg.mock) {
    // Simulação: qualquer e-mail com a senha do app entra, com o nome tirado do e-mail.
    if (!passwordMatches(senha)) throw new LoginError("E-mail ou senha incorretos.");
    const nome = email.split("@")[0].replace(/[^a-zA-ZÀ-ÿ]+/g, " ").trim();
    return { id: "00000000-0000-4000-8000-00000000000a", nome: primeiroNome(nome.charAt(0).toUpperCase() + nome.slice(1)) };
  }
  const base = enderecoDoCrm(cfg.voobCrmDbUrl, cfg.voobCrmUrl);
  if (!base || !cfg.voobCrmAnonKey) throw new LoginError("Entrar com a conta do Voob CRM ainda não foi configurado no servidor.", 503);
  let res: Response;
  try {
    res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: cfg.voobCrmAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: senha }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new LoginError("Não deu para falar com o Voob CRM agora. Tente de novo em instantes.", 502);
  }
  if (res.status === 429) throw new LoginError("Muitas tentativas. Aguarde alguns minutos e tente de novo.", 429);
  const dados = (await res.json().catch(() => null)) as { user?: { id?: unknown }; error_code?: unknown } | null;
  if (!res.ok) throw new LoginError(...motivoDaRecusa(res.status, typeof dados?.error_code === "string" ? dados.error_code : ""));
  const id = typeof dados?.user?.id === "string" ? dados.user.id : "";
  return pessoaDaConta(id, email);
}

/** A conta (id do Voob CRM) que acabou de entrar pode usar o Radar? Vale para o e-mail e senha e para o Google. */
export async function pessoaDaConta(id: string, email: string): Promise<Pessoa> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new LoginError("O Voob CRM não respondeu ao login. Tente de novo em instantes.", 502);
  let p: { pode: boolean; nome: string | null };
  try {
    p = await pessoaDoRadar(id);
  } catch (e) {
    throw new LoginError(e instanceof VoobError ? e.message : "Não deu para conferir o seu acesso agora.", e instanceof VoobError ? e.status : 502);
  }
  if (!p.pode) throw new LoginError("A sua conta do Voob CRM não tem acesso ao Radar. Fale com o Jean.", 403);
  return { id, nome: primeiroNome(p.nome ?? (email.split("@")[0] || "Equipe")) };
}

/** Quem está usando o Radar agora (pelo cookie da sessão). Senha da equipe = ninguém em particular. */
export async function pessoaDaSessao(): Promise<Pessoa | null> {
  try {
    const jar = await cookies();
    return lerSessao(jar.get(SESSION_COOKIE)?.value).pessoa;
  } catch {
    return null;
  }
}

/** O nome que vai para o histórico do que foi feito. */
export async function quemFez(): Promise<string> {
  return (await pessoaDaSessao())?.nome ?? "Radar";
}
