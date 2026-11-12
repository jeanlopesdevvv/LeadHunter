import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_EMPRESA, escolherEmpresa, idsDisponiveis, rotaPermitida } from "@/lib/empresas";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

/**
 * Tudo exige a senha, exceto a tela de login, a rota que faz o login, o healthcheck a trava
 * que o n8n consulta antes de cada mensagem, o aviso de erro de envio e a busca automática (esses conferem a própria chave).
 */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health", "/api/n8n/trava", "/api/n8n/erro", "/api/n8n/busca-auto"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const ok = verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (ok) {
    // 12/11/2026: com outra empresa escolhida no seletor, as rotas do motor do Lavacar ficam fechadas.
    const empresa = escolherEmpresa(request.cookies.get(COOKIE_EMPRESA)?.value, idsDisponiveis(process.env.RADAR_EMPRESAS));
    if (!rotaPermitida(empresa, pathname)) {
      return NextResponse.json({ erro: `Esta ação é do Lavacar. Você está na ${empresa.nome}: troque a empresa no menu.` }, { status: 409 });
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
