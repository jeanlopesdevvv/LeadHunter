import "server-only";

/**
 * Configuração vinda das variáveis de ambiente (.env do servidor ou painel da hospedagem).
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
  /** Projeto do Google Cloud (do JSON ou do e-mail ...@PROJETO.iam.gserviceaccount.com). */
  project_id: string;
}

function projectFromEmail(email: string): string {
  return /@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/i.exec(email)?.[1] ?? "";
}

function parseServiceAccount(): ServiceAccount | null {
  const raw = str("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (raw) {
    try {
      const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
      const json = JSON.parse(text) as Partial<ServiceAccount>;
      if (json.client_email && json.private_key) {
        return {
          client_email: json.client_email,
          private_key: json.private_key.replace(/\\n/g, "\n"),
          project_id: json.project_id || projectFromEmail(json.client_email),
        };
      }
    } catch {
      return null;
    }
  }
  const email = str("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const key = str("GOOGLE_PRIVATE_KEY");
  if (email && key) return { client_email: email, private_key: key.replace(/\\n/g, "\n"), project_id: projectFromEmail(email) };
  return null;
}

/**
 * Modo simulação: só em desenvolvimento, para nunca "fingir" envios reais.
 * A imagem Docker define LEADHUNTER_PRODUCAO=1 e a Vercel define VERCEL_ENV=production.
 */
export function isMockMode(): boolean {
  return str("MOCK_MODE") === "1" && process.env.VERCEL_ENV !== "production" && str("LEADHUNTER_PRODUCAO") !== "1";
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
    // Consultas grátis por mês do Google (Text Search Enterprise = 1.000).
    limiteMensal: int("LIMITE_MENSAL_CONSULTAS", 1000),
    // Parar as buscas quando as consultas grátis do mês acabarem ("0" = deixar passar e pagar o excedente).
    bloquearNoLimite: str("BLOQUEAR_NO_LIMITE", "1") !== "0",
    // Projeto do Google Cloud onde a chave do Places foi criada (padrão: o da conta de serviço).
    googleProjectId: str("GOOGLE_CLOUD_PROJECT"),
    // Disparo da Carol pelo n8n (nó Webhook "Disparo pelo Radar" no Fluxo 1).
    n8nDisparoUrl: str("N8N_DISPARO_URL"),
    n8nDisparoToken: str("N8N_DISPARO_TOKEN"),
    n8nDisparoHeader: str("N8N_DISPARO_HEADER", "X-Radar-Token"),
    // Só para mostrar na tela: limite diário da Carol no n8n (CAROL_LIMITE_DIARIO de lá; sem ela o n8n usa 5).
    limiteDiarioCarol: int("LIMITE_DIARIO_CAROL", 5),
    // Status de quem está na fila mas não foi marcado no disparo (o n8n só dispara "pendente").
    statusAguardando: str("STATUS_AGUARDANDO", "aguardando"),
    // Telefones que nunca entram (ex.: o próprio Lavacar). Separados por vírgula.
    telefonesBloqueados: str("TELEFONES_BLOQUEADOS", "5531982149012")
      .split(/[,;\s]+/)
      .map((t) => t.trim())
      .filter(Boolean),
  };
}

export type AppConfig = ReturnType<typeof getConfig>;
