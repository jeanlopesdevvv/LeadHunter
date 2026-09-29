import { cookies } from "next/headers";

import { readJson, jsonError } from "@/lib/http";
import { bloqueado, ipDe, limparFalhas, registrarFalha } from "@/lib/rate-limit";
import { createSessionToken, passwordMatches, senhaDoApp, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

export async function POST(request: Request) {
  const senhaApp = senhaDoApp();
  if (!senhaApp.ok) return jsonError(`${senhaApp.motivo} Ajuste no EasyPanel e clique em Implantar.`, 503);
  const ip = ipDe(request);
  if (bloqueado(ip)) return jsonError("Muitas tentativas. Aguarde 10 minutos e tente de novo.", 429);
  const body = await readJson<{ senha?: unknown }>(request);
  const senha = typeof body?.senha === "string" ? body.senha : "";
  if (!senha || !passwordMatches(senha)) {
    registrarFalha(ip);
    await new Promise((r) => setTimeout(r, 700)); // desacelera tentativas
    return jsonError("Senha incorreta.", 401);
  }
  limparFalhas(ip);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return Response.json({ ok: true });
}
