import "server-only";

import {
  linhasDaFila,
  mudancasParaDisparo,
  naFila,
  paraON8n,
  PARADO_APOS_MS,
  progressoDoDisparo,
  resumoDoDia,
  type Interrupcao,
  type LinhaFila,
  type ProgressoDisparo,
  type StatusDisparo,
} from "./disparo-regras";
import { telefonesBloqueados } from "./bloqueio";
import { getConfig } from "./env";
import { dataN8n, mockSheet } from "./mock";
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
    /** A chamada ao n8n pode ter chegado (sem resposta): tratar como disparo em andamento. */
    public incerto = false,
  ) {
    super(message);
  }
}

interface DisparoAtual {
  iniciadoEm: number;
  chaves: string[];
  interrompido?: Interrupcao | null;
  retomadoEm?: number | null;
}

interface ExecucaoN8n {
  primeiraEm: number;
  ultimaEm: number;
  parada: boolean;
}

/** O que o Radar sabe da trava (chamadas do n8n antes de cada mensagem). */
interface EstadoTrava {
  /** Limite diário que o próprio n8n informou (campo limite_diario do contato). */
  limiteN8n: number | null;
  ultimaEm: number | null;
  chaveErradaEm: number | null;
  paradaConfirmadaEm: number | null;
  enviandoAgora: { key: string; em: number } | null;
  execucoes: Map<string, ExecucaoN8n>;
}

const g = globalThis as unknown as {
  /** Até quando o movimento da Carol na planilha é explicado por disparos do Radar já fechados. */
  __radarMovimentoConhecido?: number;
  __radarDisparo?: DisparoAtual | null;
  __radarDisparoSim?: ReturnType<typeof setInterval> | null;
  __radarTrava?: EstadoTrava;
};

function trava(): EstadoTrava {
  return (g.__radarTrava ??= {
    limiteN8n: null,
    ultimaEm: null,
    chaveErradaEm: null,
    paradaConfirmadaEm: null,
    enviandoAgora: null,
    execucoes: new Map(),
  });
}

function progressoAtual(linhas: LinhaFila[], agora: number): ProgressoDisparo | null {
  const d = g.__radarDisparo;
  if (!d) return null;
  const t = trava();
  return progressoDoDisparo(d.chaves, d.iniciadoEm, linhas, agora, {
    interrompido: d.interrompido,
    retomadoEm: d.retomadoEm,
    ultimaTrava: t.ultimaEm,
    paradaConfirmadaEm: t.paradaConfirmadaEm,
    ultimoMovimentoGeral: resumoDoDia(linhas, agora).ultimoMovimento,
    enviandoAgora: t.enviandoAgora,
  });
}

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
  const hoje = resumoDoDia(linhas, agora);
  const atual = progressoAtual(linhas, agora);
  // Quem ainda faz parte do disparo em andamento (ou pausado) aparece no cartão do disparo, não na fila.
  const doDisparo =
    atual && (atual.estado === "enviando" || atual.estado === "pausado" || atual.estado === "parado")
      ? new Set(atual.itens.filter((i) => i.situacao === "pendente" || i.situacao === "aguardando").map((i) => i.key))
      : new Set<string>();
  const fila = naFilaTodos.filter((l) => !bloqueados.has(l.key) && !doDisparo.has(l.key));
  const t = trava();
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
    limiteDiario: t.limiteN8n ?? cfg.limiteDiarioCarol,
    movimentoRecente: atual?.estado !== "enviando" && movimentoDeFora(hoje.ultimoMovimento, atual, agora),
    bloqueadosNaFila: naFilaTodos.filter((l) => bloqueados.has(l.key)).map((l) => ({ nome: l.nome, telefone: l.telefone, linha: l.linha })),
    atual,
    trava: { ultimaEm: t.ultimaEm, chaveErradaEm: t.chaveErradaEm },
    atualizadoEm: agora,
  };
}

/**
 * A Carol mexeu na planilha nos últimos 90 s e isso não foi o disparo que o Radar acompanha:
 * alguém rodou o fluxo direto no n8n.
 */
function movimentoDeFora(ultimoMovimento: number | null, atual: ProgressoDisparo | null, agora: number): boolean {
  if (ultimoMovimento === null || agora - ultimoMovimento >= 90_000) return false;
  if (ultimoMovimento <= (g.__radarMovimentoConhecido ?? 0)) return false;
  return !atual || atual.ultimoMovimento === null || ultimoMovimento > atual.ultimoMovimento;
}

function segundos(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000));
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
    exigirConfigurado();
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

    const anterior = progressoAtual(linhas, agora);
    conferirQueDaParaDisparar(linhas, anterior, agora);
    await dispararPara(linhas, chaves, () => {
      g.__radarDisparo = { iniciadoEm: agora, chaves };
    });
    esquecerAbaLeads();
    return statusDisparo();
  });
}

function exigirConfigurado() {
  const cfg = getConfig();
  if (!cfg.mock && !cfg.n8nDisparoUrl) {
    throw new DisparoError("O botão de disparo ainda não foi ligado ao n8n (falta N8N_DISPARO_URL no EasyPanel).", 503);
  }
}

/** Nunca dois disparos ao mesmo tempo: a mesma pessoa receberia duas mensagens. */
function conferirQueDaParaDisparar(linhas: LinhaFila[], anterior: ProgressoDisparo | null, agora: number) {
  if (anterior?.estado === "enviando") {
    throw new DisparoError(
      `Já tem um disparo em andamento (${anterior.total - anterior.aguardando} de ${anterior.total}). Espere ele terminar ou pause.`,
      409,
    );
  }
  if (anterior && anterior.podeContinuarEm > agora) {
    throw new DisparoError(
      `A Carol ainda está terminando a mensagem que já tinha saído. Tente de novo em ${segundos(anterior.podeContinuarEm - agora)} s.`,
      409,
    );
  }
  const { ultimoMovimento } = resumoDoDia(linhas, agora);
  if (movimentoDeFora(ultimoMovimento, anterior, agora)) {
    const seg = Math.max(1, Math.round((agora - (ultimoMovimento ?? agora)) / 1000));
    throw new DisparoError(
      `A Carol mandou mensagem há ${seg} segundos: parece que o fluxo está rodando no n8n agora. Espere uns minutos e tente de novo.`,
      409,
    );
  }
}

/**
 * Deixa "pendente" só as chaves pedidas (os outros pendentes viram "aguardando"), confere a
 * planilha e chama o n8n. `registrar` guarda o disparo; é chamado também quando o n8n não
 * responde a tempo (ele pode ter começado: o Radar acompanha em vez de deixar disparar por cima).
 */
async function dispararPara(linhas: LinhaFila[], chaves: string[], registrar: () => void) {
  const cfg = getConfig();

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
    try {
      await chamarN8n(chaves.length);
    } catch (e) {
      if (e instanceof DisparoError && e.incerto) {
        registrar();
        esquecerAbaLeads();
      }
      throw e;
    }
  }
  registrar();
}

/**
 * Pausa ou cancela o disparo: quem ainda não recebeu volta para "aguardando" e a trava passa a
 * responder "parar" para a execução do n8n (ela encerra antes da próxima mensagem).
 * Pausado dá para continuar do ponto em que parou; cancelado devolve todo mundo para a fila.
 */
export function interromperDisparo(como: "pausado" | "cancelado"): Promise<StatusDisparo> {
  return exclusivo(async () => {
    const d = g.__radarDisparo;
    if (!d) throw new DisparoError("Não há disparo para pausar.", 404);
    const agora = Date.now();
    const linhas = await lerLinhas(0);
    const atual = progressoAtual(linhas, agora);
    if (!atual || atual.estado === "concluido") throw new DisparoError("Esse disparo já terminou.", 409);
    if (atual.estado === "cancelado") return statusDisparo();

    const t = trava();
    const doDisparo = new Set(d.chaves);
    // A mensagem que a trava acabou de liberar já está saindo: o n8n grava o resultado nela.
    const saindo = t.enviandoAgora && agora - t.enviandoAgora.em < 60_000 ? t.enviandoAgora.key : null;
    const mudancas = linhas
      .filter((l) => doDisparo.has(l.key) && paraON8n(l) && l.key !== saindo)
      .map((l) => ({ linha: l.linha, key: l.key, status: getConfig().statusAguardando, de: l.status }));
    if (mudancas.length) await atualizarStatusLinhas(mudancas);

    for (const ex of t.execucoes.values()) ex.parada = true;
    t.enviandoAgora = null;
    d.interrompido = { como, em: d.interrompido?.em ?? agora };
    esquecerAbaLeads();
    return statusDisparo();
  });
}

/** Continua um disparo pausado (ou que parou sozinho) só com quem ainda não recebeu. */
export function continuarDisparo(): Promise<StatusDisparo> {
  return exclusivo(async () => {
    exigirConfigurado();
    const d = g.__radarDisparo;
    if (!d) throw new DisparoError("Não há disparo para continuar.", 404);
    const agora = Date.now();
    const linhas = await lerLinhas(0);
    const atual = progressoAtual(linhas, agora);
    if (!atual || atual.estado === "concluido") throw new DisparoError("Esse disparo já terminou.", 409);
    if (atual.estado === "cancelado") throw new DisparoError("Esse disparo foi cancelado: marque os contatos de novo na fila.", 409);
    const bloqueados = telefonesBloqueados();
    const naFilaAgora = new Set(linhas.filter((l) => naFila(l) && !bloqueados.has(l.key)).map((l) => l.key));
    const restantes = atual.itens
      .filter((i) => (i.situacao === "pendente" || i.situacao === "aguardando") && naFilaAgora.has(i.key))
      .map((i) => i.key);
    if (!restantes.length) throw new DisparoError("Não sobrou ninguém para receber neste disparo.", 409);

    conferirQueDaParaDisparar(linhas, atual, agora);
    const t = trava();
    for (const ex of t.execucoes.values()) ex.parada = true; // execuções antigas nunca mais passam
    await dispararPara(linhas, restantes, () => {
      d.interrompido = null;
      d.retomadoEm = agora;
    });
    esquecerAbaLeads();
    return statusDisparo();
  });
}

/** Tira da tela um disparo que já terminou ou foi cancelado. */
export function encerrarDisparo(): Promise<StatusDisparo> {
  return exclusivo(async () => {
    const d = g.__radarDisparo;
    if (d) {
      const atual = progressoAtual(await lerLinhas(0), Date.now());
      if (atual && atual.estado !== "concluido" && atual.estado !== "cancelado") {
        throw new DisparoError("Pause ou cancele o disparo antes de fechar.", 409);
      }
      // O que a Carol mandou neste disparo não conta como "fluxo rodando direto no n8n".
      if (atual?.ultimoMovimento) g.__radarMovimentoConhecido = Math.max(g.__radarMovimentoConhecido ?? 0, atual.ultimoMovimento);
    }
    g.__radarDisparo = null;
    return statusDisparo();
  });
}

/**
 * Trava: o n8n pergunta antes de cada mensagem. Responde com o próprio contato (o fluxo segue
 * com ele) e `radar_parar`. Para quando o disparo foi pausado/cancelado no Radar ou quando o
 * contato não está mais "pendente" na planilha. Se a planilha não responder, deixa seguir
 * (o n8n já tinha lido ela como pendente).
 */
export async function consultarTrava(
  contato: Record<string, unknown>,
  execId: string,
  agora = Date.now(),
): Promise<Record<string, unknown> & { radar_parar: boolean; radar_motivo: string }> {
  const t = trava();
  t.ultimaEm = agora;
  const id = execId || "sem-id";
  let ex = t.execucoes.get(id);
  if (!ex) {
    ex = { primeiraEm: agora, ultimaEm: agora, parada: false };
    t.execucoes.set(id, ex);
    // Guarda só as execuções recentes.
    for (const [k, v] of t.execucoes) if (agora - v.ultimaEm > 6 * 60 * 60_000) t.execucoes.delete(k);
  }
  ex.ultimaEm = agora;
  const limite = Number(contato.limite_diario);
  if (Number.isInteger(limite) && limite > 0 && limite < 10_000) t.limiteN8n = limite;
  const key = phoneKey(String(contato.telefone ?? ""));
  const d = g.__radarDisparo;

  let motivo = "";
  if (ex.parada) motivo = "disparo pausado ou cancelado no Radar";
  else if (d?.interrompido) motivo = d.interrompido.como === "cancelado" ? "disparo cancelado no Radar" : "disparo pausado no Radar";
  else if (key && telefonesBloqueados().has(key)) motivo = "número bloqueado";
  else if (key) {
    try {
      const linhas = await lerLinhas(2_000);
      const doTelefone = linhas.filter((l) => l.key === key);
      if (doTelefone.length && !doTelefone.some(paraON8n)) {
        const l = doTelefone[0];
        motivo = l.optout ? "pediu para não receber (optout)" : `status "${l.status || "vazio"}" na planilha`;
      }
    } catch {
      /* planilha fora do ar: o n8n já leu este contato como pendente, segue */
    }
  }

  const parar = motivo !== "";
  if (parar) {
    ex.parada = true;
    t.paradaConfirmadaEm = agora;
    if (t.enviandoAgora?.key === key) t.enviandoAgora = null;
  } else if (key) {
    t.enviandoAgora = { key, em: agora };
  }
  return { ...contato, radar_parar: parar, radar_motivo: motivo };
}

export function registrarChaveErrada(agora = Date.now()) {
  trava().chaveErradaEm = agora;
}

/** Para a tela de Configuração: a trava já foi usada pelo n8n (desde que o servidor ligou)? */
export function estadoDaTrava(): { ultimaEm: number | null; chaveErradaEm: number | null } {
  const t = trava();
  return { ultimaEm: t.ultimaEm, chaveErradaEm: t.chaveErradaEm };
}

/**
 * Volta a acompanhar um disparo que o navegador lembra (ex.: o servidor reiniciou no meio).
 * Só adota se o servidor não conhece um disparo mais novo.
 */
export async function acompanharDisparo(
  iniciadoEm: number,
  chaves: string[],
  extra: { interrompido?: Interrupcao | null; retomadoEm?: number | null } = {},
): Promise<StatusDisparo> {
  const agora = Date.now();
  const valido = Number.isFinite(iniciadoEm) && iniciadoEm > agora - 12 * 60 * 60_000 && iniciadoEm <= agora + 60_000;
  const limpas = [...new Set(chaves.map((c) => phoneKey(c)).filter(Boolean))].slice(0, 2000);
  if (valido && limpas.length && (!g.__radarDisparo || g.__radarDisparo.iniciadoEm < iniciadoEm)) {
    const i = extra.interrompido;
    const interrompido =
      i && (i.como === "pausado" || i.como === "cancelado") && Number.isFinite(i.em) && i.em >= iniciadoEm ? { como: i.como, em: i.em } : null;
    const retomadoEm = typeof extra.retomadoEm === "number" && extra.retomadoEm >= iniciadoEm ? extra.retomadoEm : null;
    g.__radarDisparo = { iniciadoEm, chaves: limpas, interrompido, retomadoEm };
  }
  return statusDisparo(agora);
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
    throw new DisparoError(
      `O n8n não respondeu a tempo (${(e as Error).message}). Ele pode ter começado mesmo assim: acompanhe aqui. ` +
        "Se em 4 minutos ninguém mudar de status, pode disparar de novo.",
      504,
      true,
    );
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

/**
 * Simulação (MOCK_MODE), igual ao Fluxo 1: lê a lista de pendentes uma vez só e, a cada 2,5 s,
 * pergunta à trava e manda para o próximo.
 */
function simularN8n() {
  if (g.__radarDisparoSim) clearInterval(g.__radarDisparoSim);
  const cfg = getConfig();
  const values = mockSheet().tabs[cfg.sheetTab] ?? mockSheet().tabs.leads;
  const h = values[0];
  const iTel = h.indexOf("telefone");
  const iNome = h.indexOf("nome");
  const iTipo = h.indexOf("tipo");
  const iCidade = h.indexOf("cidade");
  const iStatus = h.indexOf("status");
  const iEm = h.indexOf("mensagem_enviada_em");
  const iOpt = h.indexOf("optout");
  const lista = values.slice(1).filter((r) => String(r[iStatus] ?? "").trim() === "pendente" && !String(r[iOpt] ?? "").trim() && r[iTel]);
  const exec = `sim-${Date.now()}`;
  let n = 0;
  let ocupado = false;
  const parar = () => {
    if (g.__radarDisparoSim) clearInterval(g.__radarDisparoSim);
    g.__radarDisparoSim = null;
  };
  g.__radarDisparoSim = setInterval(() => {
    if (ocupado) return;
    const row = lista[n];
    if (!row) return parar();
    ocupado = true;
    void consultarTrava({ telefone: row[iTel], nome: row[iNome], tipo: row[iTipo], cidade: row[iCidade], status: row[iStatus] }, exec)
      .then((r) => {
        if (r.radar_parar) return parar();
        n++;
        const agora = Date.now();
        const quando = dataN8n(agora);
        const semZap = n % 7 === 3;
        while (row.length <= Math.max(iStatus, iEm)) row.push("");
        row[iStatus] = semZap ? "sem_whatsapp" : "enviado";
        row[iEm] = semZap ? `erro: número não existe no WhatsApp - ${quando}` : quando;
        // Como o n8n faria: histórico da Carol, status do Meta e, às vezes, uma resposta do contato.
        const tel = String(row[iTel]);
        const tabs = mockSheet().tabs;
        if (!semZap) {
          tabs.historico_carol?.push([tel, new Date(agora).toISOString(), "carol", "Oi! Aqui é a Carol, consultora comercial do Lavacar…", `${tel}@s.whatsapp.net`]);
          tabs.status_meta_carol?.push([tel, `wamid.sim${n}`, n % 3 === 0 ? "delivered" : "read", new Date(agora + 3000).toISOString(), ""]);
          const respostas = ["Sim, atendo", "Não tenho interesse", "Oi! Como funciona?"];
          if (n % 2 === 1) {
            setTimeout(() => {
              tabs.historico_carol?.push([tel, new Date().toISOString(), "lead", respostas[n % 3], `${tel}@s.whatsapp.net`]);
            }, 4000);
          }
        }
        esquecerAbaLeads();
      })
      .finally(() => {
        ocupado = false;
      });
  }, 2500);
}

export { PARADO_APOS_MS };
export type { StatusDisparo };
