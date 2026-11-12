import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EMPRESA, crmNoRadar, lavacarNoRadar, motorDaEscolha, rotaPermitida, rotaSoDaEquipe } from "@/lib/empresas";
import { lerSessao, sessaoDaEquipe, SESSION_COOKIE } from "@/lib/session";

/**
 * Tudo exige a senha, exceto a tela de login, a rota que faz o login, o healthcheck a trava
 * que o n8n consulta antes de cada mensagem, o aviso de erro de envio e a busca automática (esses conferem a própria chave).
 */
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  // 12/11/2026: entrar com o Google (ida e volta do login do Voob CRM).
  "/api/auth/google",
  "/api/auth/google/volta",
  "/api/health",
  "/api/n8n/trava",
  "/api/n8n/erro",
  "/api/n8n/busca-auto",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const sessao = lerSessao(request.cookies.get(SESSION_COOKIE)?.value);
  if (sessao.ok) {
    // 13/11/2026 (white label): o Lavacar e as rotas dele são só da equipe da Voob; cliente usa só as empresas dele.
    const equipe = sessaoDaEquipe(sessao);
    if (!equipe && rotaSoDaEquipe(pathname)) {
      return NextResponse.json({ erro: "Esta parte do Radar é só da equipe da Voob." }, { status: 403 });
    }
    // 12/11/2026: com outra empresa escolhida no seletor, as rotas do motor do Lavacar ficam fechadas (e o contrário).
    const env = process.env.RADAR_EMPRESAS;
    const motor = motorDaEscolha(request.cookies.get(COOKIE_EMPRESA)?.value, { equipe, lavacar: lavacarNoRadar(env), crm: crmNoRadar(env) });
    if (!rotaPermitida({ motor }, pathname)) {
      const texto = motor === "lavacar" ? "Esta ação é de uma empresa do Voob CRM. Troque a empresa no menu." : "Esta ação é do Lavacar. Troque a empresa no menu.";
      return NextResponse.json({ erro: texto }, { status: 409 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "Sessão expirada. Entre novamente." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  const destino = `${pathname}${request.nextUrl.search}`;
  url.search = destino === "/" ? "" : `?next=${encodeURIComponent(destino)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|favicon.ico|robots.txt|marca/).*)"],
};
