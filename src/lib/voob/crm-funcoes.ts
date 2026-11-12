import "server-only";

import { getConfig } from "@/lib/env";

import { VoobError } from "./banco";
import { tokenDoCrm } from "./crm-sessao";
import { enderecoDoCrm } from "./pessoas";

/**
 * Chama uma função do Voob CRM (whatsapp-modelos, whatsapp-oficial) com o login de quem está usando o Radar
 * (13/11/2026, white label). O Voob CRM confere tudo de novo: quem não gerencia o número daquela conta, não muda nada.
 */
export const ENTRE_COM_A_CONTA =
  "Para isso, entre no Radar com a sua conta do Voob CRM (e-mail e senha ou Google). Com a senha da equipe não dá.";

export async function funcaoDoCrm<T>(nome: "whatsapp-modelos" | "whatsapp-oficial", corpo: Record<string, unknown>): Promise<T> {
  const cfg = getConfig();
  const base = enderecoDoCrm(cfg.voobCrmDbUrl, cfg.voobCrmUrl);
  if (!base || !cfg.voobCrmAnonKey) throw new VoobError("O Radar ainda não está ligado ao Voob CRM (VOOB_CRM_ANON_KEY).", 503);
  const token = await tokenDoCrm();
  // 428 e não 401: o 401 faz a tela voltar para o login do Radar; aqui o Radar continua aberto e só pede a conta do CRM.
  if (!token) throw new VoobError(ENTRE_COM_A_CONTA, 428);
  let res: Response;
  try {
    res = await fetch(`${base}/functions/v1/${nome}`, {
      method: "POST",
      headers: { apikey: cfg.voobCrmAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    throw new VoobError("O Voob CRM não respondeu agora. Tente de novo em instantes.", 502);
  }
  const dados = (await res.json().catch(() => null)) as (T & { error?: string; problemas?: string[] }) | null;
  if (!res.ok) {
    const texto = typeof dados?.error === "string" && dados.error ? dados.error : "O Voob CRM recusou o pedido.";
    const extra = Array.isArray(dados?.problemas) && dados.problemas.length > 1 ? ` ${dados.problemas.slice(1, 3).join(" ")}` : "";
    if (res.status === 401) throw new VoobError(ENTRE_COM_A_CONTA, 428);
    throw new VoobError(`${texto}${extra}`, res.status >= 500 ? 502 : res.status);
  }
  if (!dados) throw new VoobError("O Voob CRM respondeu vazio.", 502);
  return dados;
}
