import { cookies } from "next/headers";

import { contextoDoRadar } from "@/lib/empresa-ativa";
import { COOKIE_EMPRESA, idValido } from "@/lib/empresas";
import { jsonError, readJson } from "@/lib/http";

/** Troca a empresa do Radar (seletor no menu). Só aceita as empresas que a pessoa vê (o cliente, só as dele). */
export async function POST(request: Request) {
  const body = await readJson<{ id?: unknown }>(request);
  const id = typeof body?.id === "string" ? body.id.trim().toLowerCase() : "";
  if (!idValido(id)) return jsonError("Empresa não encontrada neste Radar.", 404);
  const { empresas } = await contextoDoRadar();
  if (!empresas.some((e) => e.id === id)) return jsonError("Empresa não encontrada neste Radar.", 404);
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
