/**
 * Abrir o Radar pelo menu do Voob CRM, já logado (19/11/2026). O CRM manda o login atual da pessoa (só o access_token,
 * nunca o refresh_token: os dois lados renovando o mesmo derrubaria a sessão do CRM) num POST de formulário. O Radar
 * aceita só de quem é o CRM (Origin) e confere o token no próprio Supabase Auth do CRM. Sem servidor: vale para os testes.
 */

/** As origens que podem abrir o Radar já logado: o site do CRM (com e sem www) e as da variável RADAR_CRM_ORIGENS. */
export function origensDoCrm(site: string, extras?: string | null): string[] {
  const lista = new Set<string>();
  const por = (v: string) => {
    try {
      const u = new URL(v.trim());
      if (u.protocol !== "https:" && u.hostname !== "localhost") return;
      lista.add(u.origin);
      if (!u.hostname.startsWith("www.") && u.hostname.split(".").length === 2) lista.add(`${u.protocol}//www.${u.host}`);
    } catch {
      /* endereço inválido: ignora */
    }
  };
  if (site) por(site);
  for (const v of (extras ?? "").split(",")) if (v.trim()) por(v);
  return [...lista];
}

export function origemPermitida(origin: string | null, permitidas: string[]): boolean {
  return Boolean(origin) && permitidas.includes(String(origin).toLowerCase().replace(/\/+$/, ""));
}

/** Parece um JWT (três partes base64url)? */
export const pareceJwt = (t: unknown): t is string => typeof t === "string" && t.length <= 4000 && /^[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(t);

/** Quando o token vence (ms), pelo "exp" do JWT; sem ler, 50 min a partir de agora. */
export function vencimentoDoJwt(token: string, agora = Date.now()): number {
  try {
    const corpo = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: unknown };
    if (typeof corpo.exp === "number" && corpo.exp * 1000 > agora) return corpo.exp * 1000;
  } catch {
    /* sem exp */
  }
  return agora + 50 * 60_000;
}

/** Para onde ir depois de entrar (só caminhos do próprio Radar). */
export function destinoSeguro(v: unknown): string {
  return typeof v === "string" && /^\/(?!\/)[A-Za-z0-9/_?=&.-]*$/.test(v) && v.length <= 200 ? v : "/";
}
