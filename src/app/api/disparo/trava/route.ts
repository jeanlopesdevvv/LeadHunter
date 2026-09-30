import { nosDaTrava, origemPublica } from "@/lib/trava";

/** Os nós da trava para colar no Fluxo 1 do n8n (já com o endereço e a chave deste Radar). */
export async function GET(request: Request) {
  return Response.json({ nos: nosDaTrava(origemPublica(request)) });
}
