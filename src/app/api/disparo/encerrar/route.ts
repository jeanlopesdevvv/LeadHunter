import { encerrarDisparo } from "@/lib/disparo";
import { handleError } from "@/lib/http";

/** Tira da tela um disparo concluído ou cancelado. */
export async function POST() {
  try {
    return Response.json(await encerrarDisparo());
  } catch (e) {
    return handleError(e);
  }
}
