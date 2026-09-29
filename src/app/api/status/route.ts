import { getConfig } from "@/lib/env";
import { sheetStatus } from "@/lib/sheets";
import { obterUso } from "@/lib/usage";

export const maxDuration = 60;

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
    limites: { maxConsultasPorBusca: cfg.maxRequestsPerSearch },
  });
}
