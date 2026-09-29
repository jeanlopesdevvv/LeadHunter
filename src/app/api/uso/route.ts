import { obterUso } from "@/lib/usage";

export const maxDuration = 30;

/** Consultas grátis do mês: usadas, restantes e quando renova. `?atualizar=1` relê o Google na hora. */
export async function GET(request: Request) {
  const forcar = new URL(request.url).searchParams.get("atualizar") === "1";
  return Response.json(await obterUso({ forcar }));
}
