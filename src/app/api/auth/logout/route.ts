import { cookies } from "next/headers";

import { SESSION_COOKIE } from "@/lib/session";
import { COOKIE_CRM } from "@/lib/voob/crm-sessao-regras";

export async function POST() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(COOKIE_CRM);
  return Response.json({ ok: true });
}
