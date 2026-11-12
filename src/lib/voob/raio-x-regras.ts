/**
 * Raio-X do site (12/11/2026): o que dá para afirmar, com segurança, olhando só a página inicial.
 * Cada problema é um fato conferível (a Renata cita na 1ª mensagem, então não pode ser palpite): o endereço não
 * existe mais, página "em construção" ou domínio parado, sem cadeado (HTTPS), não se adapta ao celular, endereço
 * gratuito (sem o domínio da empresa) e rodapé de um ano antigo.
 * Na dúvida (site lento, barrou robô, erro passageiro), fica "não conferido": o Radar não afirma o que não viu.
 * Sem servidor aqui: recebe o HTML já baixado (raio-x.ts baixa com as travas de segurança).
 */

export type ProblemaSite = "fora_do_ar" | "em_construcao" | "sem_https" | "sem_celular" | "endereco_gratuito" | "ano_antigo";

export interface RaioX {
  /** desatualizado = pelo menos um problema; ok = nenhum; nao_conferido = não deu para olhar agora (erro nosso, não do site). */
  situacao: "desatualizado" | "ok" | "nao_conferido";
  problemas: ProblemaSite[];
  /** Os problemas em português, prontos para a tela e para a mensagem. */
  textos: string[];
  /** Ano mais novo achado no rodapé (©). */
  ano: number | null;
}

/** Como cada problema entra na mensagem, depois de "notei o seguinte:" (frase inteira, sem ponto final). */
export const TEXTO_PROBLEMA: Record<ProblemaSite, string> = {
  fora_do_ar: "o endereço do site que aparece no Google não está abrindo",
  em_construcao: "o site está em construção",
  sem_https: "o site abre como “não seguro” no navegador, sem o cadeado",
  sem_celular: "o site não se adapta à tela do celular",
  endereco_gratuito: "o site usa um endereço gratuito, sem o domínio da empresa",
  ano_antigo: "o site parece parado no tempo",
};

/** A ordem em que os problemas aparecem (o primeiro é o que vai na frente na mensagem). */
const ORDEM: ProblemaSite[] = ["fora_do_ar", "em_construcao", "sem_https", "sem_celular", "endereco_gratuito", "ano_antigo"];

/** Construtores de site com endereço gratuito (o site existe, mas não tem o domínio da empresa). */
const ENDERECOS_GRATUITOS = [
  "wixsite.com", "webnode.page", "webnode.com.br", "webnode.com", "blogspot.com", "sites.google.com", "wordpress.com", "weebly.com",
  "canva.site", "carrd.co", "godaddysites.com", "site123.me", "mystrikingly.com", "jimdofree.com", "jimdosite.com", "ueniweb.com",
  "yolasite.com", "square.site", "netlify.app", "vercel.app", "github.io",
];

export function enderecoGratuito(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ENDERECOS_GRATUITOS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const SINAIS_CONSTRUCAO = [
  /em\s+constru[çc][ãa]o/i,
  /under\s+construction/i,
  /coming\s+soon/i,
  /site\s+em\s+manuten[çc][ãa]o/i,
  /this\s+domain\s+(is\s+)?(for\s+sale|parked)/i,
  /dom[íi]nio\s+(est[áa]\s+)?(à|a)\s+venda/i,
  /parked\s+(free|domain)/i,
  /hostgator.*(p[áa]gina\s+padr[ãa]o|default\s+page)/i,
  /index\s+of\s+\//i,
];

/** O ano mais novo que aparece junto de ©, &copy; ou "copyright" (ex.: "© 2019", "Copyright 2015-2018"). */
export function anoDoRodape(html: string): number | null {
  const anos: number[] = [];
  const re = /(?:©|&copy;|&#169;|copyright)\s*(?:\D{0,25}?)((?:19|20)\d{2})(?:\s*[-–]\s*((?:19|20)\d{2}))?/gi;
  for (const m of html.matchAll(re)) {
    for (const g of [m[1], m[2]]) {
      const a = g ? Number(g) : NaN;
      if (a >= 1995 && a <= 2100) anos.push(a);
    }
  }
  return anos.length ? Math.max(...anos) : null;
}

export function temViewport(html: string): boolean {
  return /<meta[^>]+name\s*=\s*["']?viewport["']?[^>]*>/i.test(html);
}

/** Texto visível aproximado (sem scripts, estilos e tags), para procurar "em construção". */
function textoVisivel(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 20_000);
}

/**
 * Lê a página. `finalUrl` é o endereço depois dos redirecionamentos; `httpsFunciona` diz se a versão com https abriu.
 * 404 ou 410 na página inicial = o endereço não existe mais. Outro erro (5xx, 4xx) ou página vazia = não conferido:
 * pode ser passageiro ou o site barrando robô. Ano antigo = rodapé com ano de 3 anos atrás ou mais (em 2026: 2023 ou antes).
 */
export function analisarPagina(entrada: { html: string; status: number; finalUrl: string; httpsFunciona: boolean; anoAtual: number }): RaioX {
  if (entrada.status === 404 || entrada.status === 410) return fechar(["fora_do_ar"], null);
  if (entrada.status >= 400 || !entrada.html.trim()) return NAO_CONFERIDO;
  const problemas: ProblemaSite[] = [];
  const texto = textoVisivel(entrada.html);
  // Página quase vazia com um aviso de construção, ou domínio estacionado.
  if (SINAIS_CONSTRUCAO.some((r) => r.test(texto)) && texto.length < 4_000) problemas.push("em_construcao");
  if (!entrada.httpsFunciona && !/^https:/i.test(entrada.finalUrl)) problemas.push("sem_https");
  if (!temViewport(entrada.html)) problemas.push("sem_celular");
  if (enderecoGratuito(entrada.finalUrl)) problemas.push("endereco_gratuito");
  const ano = anoDoRodape(entrada.html);
  if (ano !== null && ano <= entrada.anoAtual - 3) problemas.push("ano_antigo");
  return fechar(problemas, ano);
}

export function fechar(problemas: ProblemaSite[], ano: number | null): RaioX {
  const unicos = ORDEM.filter((p) => problemas.includes(p));
  return {
    situacao: unicos.length ? "desatualizado" : "ok",
    problemas: unicos,
    textos: unicos.map((p) => (p === "ano_antigo" && ano ? `o rodapé do site ainda mostra ${ano}` : TEXTO_PROBLEMA[p])),
    ano,
  };
}

/** Não deu para olhar (erro do nosso lado, endereço bloqueado): não afirma nada sobre o site. */
export const NAO_CONFERIDO: RaioX = { situacao: "nao_conferido", problemas: [], textos: [], ano: null };

/** O endereço pode ser conferido? Só http(s), porta padrão e nome de domínio público (nada de IP ou rede interna). */
export function enderecoPermitido(url: string): URL | null {
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(url.trim()) ? url.trim() : `http://${url.trim()}`);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") return null;
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return null; // IP direto
  return u;
}

/** IP de rede interna, loopback, link-local etc. (o nome resolveu para dentro: não busca). */
export function ipInterno(ip: string): boolean {
  if (ip.includes(":")) {
    const x = ip.toLowerCase();
    return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:");
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}
