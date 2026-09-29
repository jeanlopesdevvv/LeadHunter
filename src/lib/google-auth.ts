import "server-only";

import { JWT } from "google-auth-library";

import { getConfig } from "./env";

/**
 * Token da conta de serviço do Google, usado pela planilha (Sheets) e pelo
 * contador de consultas (Cloud Monitoring, só leitura).
 */

export const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/monitoring.read",
];

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}

let jwtClient: JWT | null = null;
let jwtEmail = "";

export async function googleAccessToken(): Promise<string> {
  const cfg = getConfig();
  if (!cfg.serviceAccount) {
    throw new GoogleAuthError(
      cfg.serviceAccountInvalid
        ? "A chave da conta de serviço (GOOGLE_SERVICE_ACCOUNT_JSON) está inválida. Cole de novo o JSON inteiro."
        : "A conta de serviço do Google ainda não foi configurada (GOOGLE_SERVICE_ACCOUNT_JSON).",
    );
  }
  if (!jwtClient || jwtEmail !== cfg.serviceAccount.client_email) {
    jwtClient = new JWT({
      email: cfg.serviceAccount.client_email,
      key: cfg.serviceAccount.private_key,
      scopes: SCOPES,
    });
    jwtEmail = cfg.serviceAccount.client_email;
  }
  try {
    const { token } = await jwtClient.getAccessToken();
    if (!token) throw new Error("token vazio");
    return token;
  } catch (e) {
    throw new GoogleAuthError(`Não foi possível autenticar a conta de serviço: ${(e as Error).message}`);
  }
}
