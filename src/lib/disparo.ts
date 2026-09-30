import "server-only";

import {
  linhasDaFila,
  mudancasParaDisparo,
  naFila,
  paraON8n,
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
import { phoneKey } from "./phone";
import { atualizarStatusLinhas, esquecerAbaLeads, lerAbaLeads } from "./sheets";

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
  const bloqueados = telefonesBloqueados();
  const naFilaTodos = linhas.filter(naFila);
  const fila = naFilaTodos.filter((l) => !bloqueados.has(l.key));
  const hoje = resumoDoDia(linhas, agora);
  const atual = g.__radarDisparo ? progressoDoDisparo(g.__radarDisparo.chaves, g.__radarDisparo.iniciadoEm, linhas, agora) : null;
  return {
    configurado: cfg.mock || Boolean(cfg.n8nDisparoUrl),
    simulacao: cfg.mock,
    destino: cfg.mock ? "simulação" : destinoDe(cfg.n8nDisparoUrl),
    fila: fila.length,
    itensFila: fila.slice(0, 1000).map((l) => ({
      key: l.key,
      linha: l.linha,
      nome: l.nome,
      telefone: l.telefone,
      cidade: l.cidade,
      situacao: l.situacao === "pendente" ? ("pendente" as const) : ("aguardando" as const),
    })),
    hoje,
    limiteDiario: cfg.limiteDiarioCarol,
    movimentoRecente: atual?.estado !== "enviando" && movimentoDeFora(hoje.ultimoMovimento, atual, agora),
    bloqueadosNaFila: naFilaTodos.filter((l) => bloqueados.has(l.key)).map((l) => ({ nome: l.nome, telefone: l.telefone, linha: l.linha })),
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

/**
 * Dispara para os contatos escolhidos (telefones) ou para toda a fila ("todos").
 *
 * O n8n manda mensagem para todo "pendente" da planilha. Para disparar só para os escolhidos,
 * o Radar deixa como "pendente" apenas eles e muda os outros pendentes para "aguardando"
 * (continuam na fila do Radar para um próximo disparo). Depois relê a planilha e só chama o n8n
 * se os pendentes forem exatamente os escolhidos.
 */
export function iniciarDisparo(pedido: string[] | "todos" = "todos"): Promise<StatusDisparo> {
  return exclusivo(async () => {
    const cfg = getConfig();
    if (!cfg.mock && !cfg.n8nDisparoUrl) {
      throw new DisparoError("O botão de disparo ainda não foi ligado ao n8n (falta N8N_DISPARO_URL no EasyPanel).", 503);
    }
    const agora = Date.now();
    const linhas = await lerLinhas(0); // leitura fresca na hora de disparar
    const bloqueados = telefonesBloqueados();
    const fila = linhas.filter((l) => naFila(l) && !bloqueados.has(l.key));
    if (!fila.length) throw new DisparoError("Não há ninguém na fila da Carol.");

    let escolhidos = fila;
    if (pedido !== "todos") {
      const quero = new Set(pedido.map((t) => phoneKey(t)).filter(Boolean));
      escolhidos = fila.filter((l) => quero.has(l.key));
      if (!escolhidos.length) throw new DisparoError("Marque pelo menos um contato da fila.");
    }
    const chaves = [...new Set(escolhidos.map((l) => l.key))];

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

    // Só os escolhidos ficam "pendente"; o resto (inclusive números bloqueados) vira "aguardando".
    await atualizarStatusLinhas(mudancasParaDisparo(linhas, new Set(chaves), cfg.statusAguardando));

    // Confere na planilha antes de chamar o n8n.
    const conferencia = (await lerLinhas(0)).filter(paraON8n).map((l) => l.key);
    const esperado = new Set(chaves);
    const sobrando = conferencia.filter((k) => !esperado.has(k));
    const faltando = chaves.filter((k) => !conferencia.includes(k));
    const repetidos = conferencia.length - new Set(conferencia).size;
    if (sobrando.length || faltando.length || repetidos) {
      throw new DisparoError(
        `A planilha não ficou como esperado (${sobrando.length} pendente(s) a mais, ${faltando.length} a menos). Por segurança o n8n não foi chamado. Tente de novo.`,
        409,
      );
    }

    if (cfg.mock) {
      simularN8n();
    } else {
      await chamarN8n(chaves.length);
    }
    g.__radarDisparo = { iniciadoEm: agora, chaves };
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
