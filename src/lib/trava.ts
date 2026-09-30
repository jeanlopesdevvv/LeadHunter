import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Trava de segurança do disparo.
 *
 * O Fluxo 1 do n8n lê a lista de pendentes uma vez só e depois manda uma mensagem por vez.
 * Para dar para pausar/cancelar no meio, o fluxo pergunta ao Radar antes de cada mensagem
 * ("Radar: Pode Enviar?"). O Radar responde com o próprio contato e `radar_parar`:
 * true = encerra a execução ali (nenhuma mensagem a mais).
 *
 * A chamada é protegida por uma chave derivada do segredo do servidor (AUTH_SECRET, ou a senha
 * se AUTH_SECRET não existir). Dá para fixar outra em N8N_TRAVA_CHAVE.
 */

export function chaveDaTrava(): string {
  const fixa = process.env.N8N_TRAVA_CHAVE?.trim();
  if (fixa) return fixa;
  const base = process.env.AUTH_SECRET?.trim() || process.env.APP_PASSWORD?.trim() || "radar-sem-segredo";
  return createHash("sha256").update(`radar-trava:v1:${base}`).digest("hex").slice(0, 32);
}

export function chaveConfere(recebida: string | null): boolean {
  if (!recebida) return false;
  const a = Buffer.from(recebida);
  const b = Buffer.from(chaveDaTrava());
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Endereço público do Radar a partir do pedido (atrás do proxy do EasyPanel). */
export function origemPublica(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host")?.split(",")[0].trim() || h.get("host") || new URL(request.url).host;
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

function uuid(): string {
  return crypto.randomUUID();
}

/** Os dois nós para colar no Fluxo 1 (entre "Delay - Antiblock" e "Montar Mensagem"). */
export function nosDaTrava(origem: string): string {
  const url = `=${origem}/api/n8n/trava?chave=${chaveDaTrava()}&exec={{ $execution.id }}`;
  return JSON.stringify(
    {
      nodes: [
        {
          parameters: {
            method: "POST",
            url,
            sendBody: true,
            specifyBody: "json",
            jsonBody: "={{ JSON.stringify($json) }}",
            options: { timeout: 15000 },
          },
          type: "n8n-nodes-base.httpRequest",
          typeVersion: 4.2,
          position: [31120, 10640],
          id: uuid(),
          name: "Radar: Pode Enviar?",
          retryOnFail: true,
          maxTries: 3,
          waitBetweenTries: 3000,
          notes: "Pergunta ao Radar se este contato ainda deve receber (Pausar/Cancelar no Radar). Devolve o próprio contato.",
        },
        {
          parameters: {
            conditions: {
              options: { caseSensitive: true, leftValue: "", typeValidation: "loose", version: 2 },
              conditions: [
                {
                  id: uuid(),
                  leftValue: "={{ $json.radar_parar }}",
                  rightValue: true,
                  operator: { type: "boolean", operation: "true", singleValue: true },
                },
              ],
              combinator: "and",
            },
            options: {},
          },
          type: "n8n-nodes-base.if",
          typeVersion: 2.2,
          position: [31340, 10640],
          id: uuid(),
          name: "Radar Mandou Parar?",
          notes: "Saída true: vazia (encerra o disparo). Saída false: ligar em Montar Mensagem.",
        },
      ],
      connections: {
        "Radar: Pode Enviar?": { main: [[{ node: "Radar Mandou Parar?", type: "main", index: 0 }]] },
      },
    },
    null,
    2,
  );
}
