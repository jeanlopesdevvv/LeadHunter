import "server-only";

import { getConfig } from "./env";
import { googleAccessToken } from "./google-auth";
import { formatarRenovacaoCurta, periodoDaCota } from "./periodo";
import type { FonteUso, Uso } from "./types";

export type { FonteUso, Uso };

/**
 * Contador das consultas grátis do mês (Google Places, Text Search Enterprise: 1.000/mês).
 *
 * Fonte principal: Cloud Monitoring do projeto (a mesma contagem do painel "APIs e serviços"),
 * somando as chamadas SearchText com resposta 2xx desde o 1º do mês (horário do Pacífico).
 * O Google leva alguns minutos para mostrar as chamadas mais recentes, então nos últimos
 * 35 minutos vale o maior número entre o Google e o registro do próprio Radar.
 *
 * Só as buscas (SearchText) contam. Descobrir a área da cidade usa outro serviço
 * (Autocomplete + Place Details), com cota grátis separada.
 */

const JANELA_RECENTE_MS = 35 * 60_000;
const CACHE_MS = 60_000;

interface Registro {
  desde: number;
  buscas: number[];
  areas: number[];
  pendentes: number;
}

const g = globalThis as unknown as {
  __radarUso?: Registro;
  __radarMonitoring?: { em: number; periodo: number; valor: Promise<LeituraGoogle> };
};

function registro(): Registro {
  if (!g.__radarUso) g.__radarUso = { desde: Date.now(), buscas: [], areas: [], pendentes: 0 };
  return g.__radarUso;
}

function podar(lista: number[], inicio: number) {
  while (lista.length && lista[0] < inicio) lista.shift();
}

/** Anota uma chamada que deu certo. */
export function registrarConsulta(tipo: "busca" | "area", quando = Date.now()) {
  const r = registro();
  (tipo === "busca" ? r.buscas : r.areas).push(quando);
}

type LeituraGoogle =
  | { ok: true; antes: number; recente: number; corte: number; em: number }
  | { ok: false; erro: string; em: number };

interface SerieMonitoring {
  resource?: { labels?: Record<string, string> };
  points?: { value?: { int64Value?: string; doubleValue?: number } }[];
}

function segundos(ms: number) {
  return `${Math.max(60, Math.ceil(ms / 1000))}s`;
}

async function somarSearchText(projeto: string, token: string, inicio: number, fim: number): Promise<number> {
  const params = new URLSearchParams({
    filter: [
      'metric.type="serviceruntime.googleapis.com/api/request_count"',
      'resource.type="consumed_api"',
      'resource.labels.service="places.googleapis.com"',
      'metric.labels.response_code_class="2xx"',
    ].join(" AND "),
    "interval.startTime": new Date(inicio).toISOString(),
    "interval.endTime": new Date(fim).toISOString(),
    // Um único balde cobrindo o intervalo inteiro, somado por método.
    "aggregation.alignmentPeriod": segundos(fim - inicio),
    "aggregation.perSeriesAligner": "ALIGN_SUM",
    "aggregation.crossSeriesReducer": "REDUCE_SUM",
    "aggregation.groupByFields": "resource.labels.method",
  });
  let total = 0;
  let pageToken = "";
  for (let pagina = 0; pagina < 10; pagina++) {
    if (pageToken) params.set("pageToken", pageToken);
    const res = await fetch(`https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(projeto)}/timeSeries?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try {
        msg = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? msg;
      } catch {
        /* texto puro */
      }
      throw Object.assign(new Error(msg), { status: res.status });
    }
    const data = JSON.parse(text || "{}") as { timeSeries?: SerieMonitoring[]; nextPageToken?: string };
    for (const serie of data.timeSeries ?? []) {
      const metodo = serie.resource?.labels?.method ?? "";
      if (!/searchtext$/i.test(metodo)) continue;
      for (const p of serie.points ?? []) total += Number(p.value?.int64Value ?? p.value?.doubleValue ?? 0) || 0;
    }
    pageToken = data.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return Math.round(total);
}

function explicarErroMonitoring(e: unknown, email: string): string {
  const status = (e as { status?: number }).status;
  const msg = (e as Error).message ?? "";
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
    return "A Cloud Monitoring API está desativada no projeto do Google Cloud. Ative em APIs e serviços → Biblioteca → Cloud Monitoring API.";
  }
  if (status === 403 || /permission/i.test(msg)) {
    return `A conta de serviço ainda não pode ler o uso. No Google Cloud (IAM), dê o papel "Visualizador de monitoramento" para ${email}.`;
  }
  if (status === 401) return "O Google recusou a conta de serviço ao ler o uso. Gere a chave JSON de novo.";
  return `Não deu para ler o uso no Google agora (${msg.slice(0, 160) || "sem detalhes"}).`;
}

async function lerGoogle(agora: number, inicioPeriodo: number): Promise<LeituraGoogle> {
  const cfg = getConfig();
  const projeto = cfg.googleProjectId || cfg.serviceAccount?.project_id || "";
  if (!cfg.serviceAccount || !projeto) {
    return { ok: false, erro: "A conta de serviço do Google não está configurada, então o Radar conta as consultas sozinho.", em: agora };
  }
  try {
    const token = await googleAccessToken();
    const fim = Math.floor(agora / 1000) * 1000;
    const corte = Math.max(inicioPeriodo, fim - JANELA_RECENTE_MS);
    const [antes, recente] = await Promise.all([
      corte > inicioPeriodo ? somarSearchText(projeto, token, inicioPeriodo, corte) : Promise.resolve(0),
      somarSearchText(projeto, token, corte, fim),
    ]);
    return { ok: true, antes, recente, corte, em: agora };
  } catch (e) {
    console.error("[radar] leitura do uso no Cloud Monitoring falhou:", (e as Error).message);
    return { ok: false, erro: explicarErroMonitoring(e, cfg.serviceAccount.client_email), em: agora };
  }
}

function leituraGoogle(agora: number, inicioPeriodo: number, forcar: boolean): Promise<LeituraGoogle> {
  const c = g.__radarMonitoring;
  if (!forcar && c && c.periodo === inicioPeriodo && agora - c.em < CACHE_MS) return c.valor;
  const valor = lerGoogle(agora, inicioPeriodo);
  g.__radarMonitoring = { em: agora, periodo: inicioPeriodo, valor };
  return valor;
}

export async function obterUso(opts: { forcar?: boolean; agora?: number } = {}): Promise<Uso> {
  const cfg = getConfig();
  const agora = opts.agora ?? Date.now();
  const { inicio, fim } = periodoDaCota(agora);
  const r = registro();
  podar(r.buscas, inicio);
  podar(r.areas, inicio);

  const base = {
    limite: cfg.limiteMensal,
    bloquear: cfg.bloquearNoLimite,
    inicioPeriodo: new Date(inicio).toISOString(),
    renovaEm: new Date(fim).toISOString(),
    contandoDesde: new Date(Math.max(r.desde, inicio)).toISOString(),
  };
  const montar = (fonte: FonteUso, usadas: number, atualizadoEm: number, aviso: string): Uso => ({
    ...base,
    fonte,
    usadas,
    restantes: Math.max(0, cfg.limiteMensal - usadas),
    atualizadoEm: new Date(atualizadoEm).toISOString(),
    aviso,
  });

  if (cfg.mock) return montar("simulacao", r.buscas.length, agora, "");

  const leitura = await leituraGoogle(agora, inicio, Boolean(opts.forcar));
  if (!leitura.ok) return montar("radar", r.buscas.length, agora, leitura.erro);
  const locaisRecentes = r.buscas.filter((t) => t >= leitura.corte).length;
  return montar("google", leitura.antes + Math.max(leitura.recente, locaisRecentes), leitura.em, "");
}

export function mensagemCotaEsgotada(uso: Uso): string {
  return (
    `As ${uso.limite.toLocaleString("pt-BR")} consultas grátis deste mês acabaram. ` +
    `Elas voltam em ${formatarRenovacaoCurta(uso.renovaEm)} (horário de Brasília).`
  );
}

/**
 * Reserva uma consulta antes de chamar o Google. Com o bloqueio ligado, recusa quando a cota
 * do mês acabou (contando também as que estão em andamento neste instante).
 */
export async function reservarConsulta(): Promise<
  { ok: true; uso: Uso; concluir: (deuCerto: boolean) => void } | { ok: false; uso: Uso; mensagem: string }
> {
  const uso = await obterUso();
  const r = registro();
  if (uso.bloquear && uso.usadas + r.pendentes >= uso.limite) {
    return { ok: false, uso, mensagem: mensagemCotaEsgotada(uso) };
  }
  r.pendentes++;
  let feito = false;
  return {
    ok: true,
    uso,
    concluir: (deuCerto) => {
      if (feito) return;
      feito = true;
      r.pendentes = Math.max(0, r.pendentes - 1);
      if (deuCerto) registrarConsulta("busca");
    },
  };
}

/** Só para testes. */
export function __reiniciarUso() {
  g.__radarUso = undefined;
  g.__radarMonitoring = undefined;
}
