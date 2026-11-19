import { pedir } from "@/lib/voob/banco";
import { quemUsa } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";

export const maxDuration = 30;

/**
 * "Quero usar o Radar" (19/11/2026): quem entrou com a conta do Voob CRM e ainda não tem empresa pede a liberação.
 * A equipe vê o pedido ao criar a empresa; quando cria, a pessoa já entra direto.
 */
export async function POST() {
  try {
    const q = await quemUsa();
    if (!q.usuario) return Response.json({ erro: "Entre com a sua conta do Voob CRM para pedir o Radar." }, { status: 400 });
    return Response.json(await pedir(q.usuario));
  } catch (e) {
    return erroVoob(e);
  }
}
