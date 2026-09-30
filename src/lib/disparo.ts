import "server-only";

import {
  linhasDaFila,
  naFila,
  PARADO_APOS_MS,
  progressoDoDisparo,
  resumoDoDia,
  type LinhaFila,
  type ProgressoDisparo,
  type StatusDisparo,
} from "./disparo-regras";
import { telefonesBloqueados } from "./bloqueio";
import { getConfig } from "./env";
import { mockSheet } from "./mock";
import { esquecerAbaLeads, lerAbaLeads } from "./sheets";

/**
 * Disparo da Carol: o Radar chama o webhook do n8n ("Disparo pelo Radar", no Fluxo 1)
 * e acompanha o progresso lendo a aba leads (status e mensagem_enviada_em).
 */

export class DisparoError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

interface DisparoAtual {
  iniciadoEm: number;
  chaves: string[];
}

const g = globalThis as unknown as { __radarDisparo?: DisparoAtual | null; __radarDisparoSim?: ReturnType<typeof setInterval> | null };

function destinoDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

async function lerLinhas(maxAgeMs?: number): Promise<LinhaFila[]> {
  const { map, rows } = await lerAbaLeads(maxAgeMs);
  return linhasDaFila(rows, map);
}

export async function statusDisparo(agora = Date.now()): Promise<StatusDisparo> {
  const cfg = getConfig();
  const linhas = await lerLinhas();
  const fila = linhas.filter(naFila);
  const hoje = resumoDoDia(linhas, agora);
  const bloqueados = telefonesBloqueados();
  const atual = g.__radarDisparo ? progressoDoDisparo(g.__radarDisparo.chaves, g.__radarDisparo.iniciadoEm, linhas, agora) : null;
  return {
    configurado: cfg.mock || Boolean(cfg.n8nDisparoUrl),
    simulacao: cfg.mock,
    destino: cfg.mock ? "simulação" : destinoDe(cfg.n8nDisparoUrl),
    fila: fila.length,
    proximos: fila.slice(0, 100).map((l) => ({ nome: l.nome, telefone: l.telefone, cidade: l.cidade })),
    hoje,
    limiteDiario: cfg.limiteDiarioCarol,
    movimentoRecente: atual?.estado !== "enviando" && movimentoDeFora(hoje.ultimoMovimento, atual, agora),
    bloqueadosNaFila: fila.filter((l) => bloqueados.has(l.key)).map((l) => ({ nome: l.nome, telefone: l.telefone, linha: l.linha })),
    atual,
    atualizadoEm: agora,
  };
}

/**
 * A Carol mexeu na planilha nos últimos 90 s e isso não foi o disparo que o Radar acompanha:
 * alguém rodou o fluxo direto no n8n.
 */
function movimentoDeFora(ultimoMovimento: number | null, atual: ProgressoDisparo | null, agora: number): boolean {
  if (ultimoMovimento === null || agora - ultimoMovimento >= 90_000) return false;
  return !atual || atual.ultimoMovimento === null || ultimoMovimento > atual.ultimoMovimento;
}

/** Um pedido de disparo por vez neste servidor. */
let fila: Promise<unknown> = Promise.resolve();
function exclusivo<T>(fn: () => Promise<T>): Promise<T> {
  const run = fila.then(fn, fn);
  fila = run.catch(() => undefined);
  return run;
}

export function iniciarDisparo(): Promise<StatusDisparo> {
  return exclusivo(async () => {
    const cfg = getConfig();
    if (!cfg.mock && !cfg.n8nDisparoUrl) {
      throw new DisparoError("O botão de disparo ainda não foi ligado ao n8n (falta N8N_DISPARO_URL no EasyPanel).", 503);
    }
    const agora = Date.now();
    const linhas = await lerLinhas(0); // leitura fresca na hora de disparar
    const pendentes = linhas.filter(naFila);
    if (!pendentes.length) throw new DisparoError("Não há ninguém pendente na planilha para a Carol chamar.");

    // O n8n dispara para todo pendente da planilha: um número bloqueado ali receberia mensagem.
    const bloqueados = telefonesBloqueados();
    const barrado = pendentes.find((l) => bloqueados.has(l.key));
    if (barrado) {
      throw new DisparoError(
        `"${barrado.nome || barrado.telefone}" é um número bloqueado e está pendente na planilha (linha ${barrado.linha}). ` +
          "Escreva sim na coluna optout dessa linha (ou apague a linha) e tente de novo.",
        409,
      );
    }

    // Nunca dois disparos ao mesmo tempo: a mesma pessoa receberia duas mensagens.
    const anterior = g.__radarDisparo ? progressoDoDisparo(g.__radarDisparo.chaves, g.__radarDisparo.iniciadoEm, linhas, agora) : null;
    if (anterior?.estado === "enviando") {
      throw new DisparoError(`Já tem um disparo em andamento (${anterior.total - anterior.aguardando} de ${anterior.total}). Espere ele terminar.`, 409);
    }
    const { ultimoMovimento } = resumoDoDia(linhas, agora);
    if (movimentoDeFora(ultimoMovimento, anterior, agora)) {
      const seg = Math.max(1, Math.round((agora - (ultimoMovimento ?? agora)) / 1000));
      throw new DisparoError(
        `A Carol mandou mensagem há ${seg} segundos: parece que o fluxo está rodando no n8n agora. Espere uns minutos e tente de novo.`,
        409,
      );
    }

    if (cfg.mock) {
      simularN8n();
    } else {
      await chamarN8n(pendentes.length);
    }
    g.__radarDisparo = { iniciadoEm: agora, chaves: [...new Set(pendentes.map((l) => l.key).filter(Boolean))] };
    esquecerAbaLeads();
    return statusDisparo();
  });
}

async function chamarN8n(pendentes: number) {
  const cfg = getConfig();
  let res: Response;
  try {
    res = await fetch(cfg.n8nDisparoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cfg.n8nDisparoToken ? { [cfg.n8nDisparoHeader]: cfg.n8nDisparoToken } : {}) },
      body: JSON.stringify({ origem: "radar", pendentes, pedidoEm: new Date().toISOString() }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new DisparoError(`Não deu para falar com o n8n (${(e as Error).message}). Confira N8N_DISPARO_URL.`, 502);
  }
  if (res.ok) return;
  const texto = (await res.text().catch(() => "")).slice(0, 200);
  if (res.status === 404) {
    throw new DisparoError(
      "O n8n não reconheceu o endereço do disparo. Confira se o Fluxo 1 está publicado (botão Publish) e se N8N_DISPARO_URL é a Production URL do nó \"Disparo pelo Radar\".",
      502,
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new DisparoError(
      "O n8n recusou o pedido. Se o nó \"Disparo pelo Radar\" usa Header Auth, N8N_DISPARO_TOKEN precisa ser igual ao valor da credencial.",
      502,
    );
  }
  throw new DisparoError(`O n8n respondeu com erro (${res.status})${texto ? `: ${texto}` : ""}.`, 502);
}

/** Simulação (MOCK_MODE): a "Carol" atende um pendente a cada 2,5 s. */
function simularN8n() {
  if (g.__radarDisparoSim) clearInterval(g.__radarDisparoSim);
  const cfg = getConfig();
  let n = 0;
  g.__radarDisparoSim = setInterval(() => {
    const values = mockSheet().tabs[cfg.sheetTab] ?? mockSheet().tabs.leads;
    const h = values[0];
    const iTel = h.indexOf("telefone");
    const iStatus = h.indexOf("status");
    const iEm = h.indexOf("mensagem_enviada_em");
    const iOpt = h.indexOf("optout");
    const row = values.slice(1).find((r) => String(r[iStatus] ?? "").trim() === "pendente" && !String(r[iOpt] ?? "").trim() && r[iTel]);
    if (!row) {
      clearInterval(g.__radarDisparoSim!);
      g.__radarDisparoSim = null;
      return;
    }
    n++;
    const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const semZap = n % 7 === 3;
    while (row.length <= Math.max(iStatus, iEm)) row.push("");
    row[iStatus] = semZap ? "sem_whatsapp" : "enviado";
    row[iEm] = semZap ? `erro: número não existe no WhatsApp - ${quando}` : quando;
    esquecerAbaLeads();
  }, 2500);
}

export { PARADO_APOS_MS };
export type { StatusDisparo };
