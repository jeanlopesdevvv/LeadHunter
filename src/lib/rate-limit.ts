import "server-only";

/**
 * Limite simples de tentativas de senha por IP (memória da instância).
 * Não é perfeito entre várias instâncias, mas barra força bruta óbvia.
 */
const JANELA_MS = 10 * 60 * 1000;
const MAX_FALHAS = 8;
const falhas = new Map<string, { n: number; ate: number }>();

export function ipDe(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconhecido";
}

export function bloqueado(ip: string, agora = Date.now()): boolean {
  const f = falhas.get(ip);
  if (!f) return false;
  if (f.ate < agora) {
    falhas.delete(ip);
    return false;
  }
  return f.n >= MAX_FALHAS;
}

export function registrarFalha(ip: string, agora = Date.now()) {
  const f = falhas.get(ip);
  if (!f || f.ate < agora) falhas.set(ip, { n: 1, ate: agora + JANELA_MS });
  else f.n++;
  if (falhas.size > 5000) falhas.clear();
}

export function limparFalhas(ip: string) {
  falhas.delete(ip);
}
