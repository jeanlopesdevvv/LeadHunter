import { continuarDisparo } from "@/lib/disparo";
import { handleError } from "@/lib/http";

export const maxDuration = 60;

/** Continua o disparo pausado (ou que parou sozinho) com quem ainda não recebeu. */
export async function POST() {
  try {
    return Response.json(await continuarDisparo());
  } catch (e) {
    return handleError(e);
  }
}
