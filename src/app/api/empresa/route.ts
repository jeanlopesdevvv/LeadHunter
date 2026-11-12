import { cookies } from "next/headers";

import { COOKIE_EMPRESA, idsDisponiveis } from "@/lib/empresas";
import { jsonError, readJson } from "@/lib/http";

/** Troca a empresa do Radar (seletor no menu). Só aceita as empresas deste Radar. */
export async function POST(request: Request) {
  const body = await readJson<{ id?: unknown }>(request);
  const id = typeof body?.id === "string" ? body.id.trim().toLowerCase() : "";
  if (!id || !idsDisponiveis(process.env.RADAR_EMPRESAS).includes(id)) return jsonError("Empresa não encontrada neste Radar.", 404);
  const jar = await cookies();
  jar.set(COOKIE_EMPRESA, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
  return Response.json({ ok: true, id });
}
