import "server-only";

import { getConfig } from "./env";
import { montarPainel, type Painel, type Periodo } from "./painel-regras";
import { lerAbas } from "./sheets";

export type { Painel, Periodo };

/** Lê a aba leads e as abas da Carol e monta o painel de resultados. */
export async function painelDaCarol(periodo: Periodo): Promise<Painel> {
  const cfg = getConfig();
  const nomes = [cfg.sheetTab, cfg.painelAbaHistorico, cfg.painelAbaStatus, cfg.painelAbaSessoes];
  const { dados } = await lerAbas(nomes);
  return montarPainel(
    {
      leads: dados[cfg.sheetTab] ?? [],
      historico: dados[cfg.painelAbaHistorico],
      statusMeta: dados[cfg.painelAbaStatus],
      sessoes: dados[cfg.painelAbaSessoes],
    },
    periodo,
  );
}
