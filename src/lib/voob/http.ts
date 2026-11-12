import "server-only";

import { handleError, jsonError } from "@/lib/http";

import { VoobError } from "./banco";

/** Erros do motor da Voob com a mensagem certa para a tela; o resto segue o tratamento de sempre. */
export function erroVoob(e: unknown) {
  if (e instanceof VoobError) return jsonError(e.message, e.status);
  return handleError(e);
}
