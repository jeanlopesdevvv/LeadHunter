import { getConfig } from "@/lib/env";
import { sheetStatus } from "@/lib/sheets";

export const maxDuration = 60;

export async function GET(request: Request) {
  void request; // rota sempre dinâmica
  const cfg = getConfig();
  const planilha = await sheetStatus();
  return Response.json({
    simulacao: cfg.mock,
    places: { configurada: cfg.mock || Boolean(cfg.placesApiKey) },
    planilha,
    limites: { maxConsultasPorBusca: cfg.maxRequestsPerSearch },
  });
}
