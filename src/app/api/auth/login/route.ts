import { cookies } from "next/headers";

import { readJson, jsonError } from "@/lib/http";
import { bloqueado, ipDe, limparFalhas, registrarFalha } from "@/lib/rate-limit";
import {
  createPersonToken,
  createSessionToken,
  passwordMatches,
  senhaDoApp,
  senhaUnicaLiberada,
  SESSION_COOKIE,
  SESSION_DAYS,
  SESSION_DAYS_PESSOA,
} from "@/lib/session";
import { apagarSessaoCrm, guardarSessaoCrm } from "@/lib/voob/crm-sessao";
import { entrarComConta, LoginError, loginPorContaDisponivel } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/**
 * Entrar no Radar. Dois jeitos:
 * - { email, senha }: a conta do Voob CRM (12/11/2026). O histórico passa a mostrar quem fez cada coisa.
 * - { senha }: a senha da equipe (o de sempre), enquanto RADAR_SENHA_UNICA não for 0.
 */
export async function POST(request: Request) {
  const senhaApp = senhaDoApp();
  if (!senhaApp.ok) return jsonError(`${senhaApp.motivo} Ajuste no EasyPanel e clique em Implantar.`, 503);
  const ip = ipDe(request);
  if (bloqueado(ip)) return jsonError("Muitas tentativas. Aguarde 10 minutos e tente de novo.", 429);
  const body = await readJson<{ senha?: unknown; email?: unknown }>(request);
  const senha = typeof body?.senha === "string" ? body.senha : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
  const falhou = async (mensagem: string, status = 401) => {
    registrarFalha(ip);
    await new Promise((r) => setTimeout(r, 700)); // desacelera tentativas
    return jsonError(mensagem, status);
  };
  const jar = await cookies();
  const gravar = (token: string, dias: number) =>
    jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: dias * 24 * 60 * 60 });

  if (email) {
    if (!loginPorContaDisponivel()) return jsonError("Entrar com a conta do Voob CRM ainda não foi configurado no servidor.", 503);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !senha || senha.length > 200) return falhou("E-mail ou senha incorretos.");
    try {
      const { pessoa, tokens } = await entrarComConta(email, senha);
      limparFalhas(ip);
      gravar(createPersonToken(pessoa), SESSION_DAYS_PESSOA);
      // 13/11/2026: o login do Voob CRM fica guardado (criptografado) para conectar número e mexer em modelos.
      if (tokens) await guardarSessaoCrm(tokens, SESSION_DAYS_PESSOA);
      else await apagarSessaoCrm();
      return Response.json({ ok: true, nome: pessoa.nome });
    } catch (e) {
      if (e instanceof LoginError) return e.status === 401 || e.status === 403 ? falhou(e.message, e.status) : jsonError(e.message, e.status);
      console.error("[radar] login:", (e as Error)?.message ?? e);
      return jsonError("Não foi possível entrar agora. Tente de novo.", 500);
    }
  }

  if (!senhaUnicaLiberada() && loginPorContaDisponivel()) return jsonError("A senha da equipe foi desligada. Entre com o seu e-mail e a sua senha do Voob CRM.", 403);
  if (!senha || !passwordMatches(senha)) return falhou("Senha incorreta.");
  limparFalhas(ip);
  gravar(createSessionToken(), SESSION_DAYS);
  await apagarSessaoCrm();
  return Response.json({ ok: true });
}
