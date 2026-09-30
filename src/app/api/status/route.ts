import { infoChatwoot } from "@/lib/chatwoot";
import { estadoDaTrava } from "@/lib/disparo";
import { getConfig } from "@/lib/env";
import { sheetStatus } from "@/lib/sheets";
import { obterUso } from "@/lib/usage";

export const maxDuration = 60;

function destinoN8n(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

export async function GET(request: Request) {
  void request; // rota sempre dinâmica
  const cfg = getConfig();
  const [planilha, uso] = await Promise.all([sheetStatus(), obterUso({ forcar: true })]);
  return Response.json({
    simulacao: cfg.mock,
    places: { configurada: cfg.mock || Boolean(cfg.placesApiKey) },
    planilha,
    uso,
    projetoGoogle: cfg.googleProjectId || cfg.serviceAccount?.project_id || "",
    disparo: {
      configurado: cfg.mock || Boolean(cfg.n8nDisparoUrl),
      destino: cfg.mock ? "simulação" : destinoN8n(cfg.n8nDisparoUrl),
      limiteDiario: cfg.limiteDiarioCarol,
      trava: estadoDaTrava(),
    },
    limites: { maxConsultasPorBusca: cfg.maxRequestsPerSearch },
    chatwoot: (() => {
      const c = infoChatwoot();
      return { url: c.url, apiLigada: c.apiLigada };
    })(),
  });
}
