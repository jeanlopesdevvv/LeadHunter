/** Verificação de vida para o Docker/Traefik (pública, sem dados). */
export function GET() {
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
