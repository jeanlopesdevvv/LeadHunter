import "server-only";

/**
 * Configuração vinda das variáveis de ambiente (Vercel → Settings → Environment Variables).
 * Nada de segredo vai para o navegador.
 */

export const DEFAULT_SHEET_ID = "180iMVX1oA3oJ0IVBlsnGkFPq_2p4pEtNMZ8zhSUlP1g";

function str(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v.trim();
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(str(name), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function parseServiceAccount(): ServiceAccount | null {
  const raw = str("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (raw) {
    try {
      const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const json = JSON.parse(text) as Partial<ServiceAccount>;
      if (json.client_email && json.private_key) {
        return { client_email: json.client_email, private_key: json.private_key.replace(/\\n/g, "\n") };
      }
    } catch {
      return null;
    }
  }
  const email = str("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = str("GOOGLE_PRIVATE_KEY");
  if (email && key) return { client_email: email, private_key: key.replace(/\\n/g, "\n") };
  return null;
}

/** Modo simulação: só fora da produção da Vercel, para nunca "fingir" envios reais. */
export function isMockMode(): boolean {
  return str("MOCK_MODE") === "1" && process.env.VERCEL_ENV !== "production";
}

export function getConfig() {
  const serviceAccountRaw = str("GOOGLE_SERVICE_ACCOUNT_JSON") || str("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  return {
    mock: isMockMode(),
    appPassword: str("APP_PASSWORD"),
    authSecret: str("AUTH_SECRET"),
    placesApiKey: str("GOOGLE_MAPS_API_KEY"),
    serviceAccount: parseServiceAccount(),
    serviceAccountInvalid: Boolean(serviceAccountRaw) && !parseServiceAccount(),
    sheetId: str("SHEET_ID", DEFAULT_SHEET_ID),
    sheetTab: str("SHEET_TAB", "leads"),
    defaultStatus: str("SHEET_DEFAULT_STATUS", "pendente"),
    // Abas extras onde um telefone também conta como "já contatado".
    // Padrão: históricos da Carol e da Sofia. Use "nenhuma" para desligar.
    dedupExtraTabs: str("DEDUP_EXTRA_TABS", "historico_carol,historico_sofia")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && t.toLowerCase() !== "nenhuma"),
    maxRequestsPerSearch: int("MAX_REQUESTS_PER_SEARCH", 200),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
