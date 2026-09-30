import "server-only";

import { getConfig } from "./env";
import { phoneKey } from "./phone";

/** Telefones que o Radar nunca mostra, nunca manda para a planilha e não deixa disparar (ex.: o próprio Lavacar). */
export function telefonesBloqueados(): Set<string> {
  return new Set(getConfig().telefonesBloqueados.map((t) => phoneKey(t)).filter(Boolean));
}
