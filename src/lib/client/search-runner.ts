"use client";

import type { Depth } from "@/lib/geo";
import type { Lead, PageResult, SearchTask } from "@/lib/types";

import { api, ApiError } from "./api";

export interface PlanResponse {
  tasks: SearchTask[];
  estimativa: number;
  cidades: { entrada: string; nome: string; erro: string }[];
}

export interface Progress {
  feitas: number;
  previstas: number;
  etapa: string;
  erros: string[];
}

const PAGES_PER_TASK = 3;
const CONCURRENCY = 3;

/**
 * O navegador comanda a busca em passos curtos (uma página por chamada),
 * assim nenhuma requisição fica longa (nem estoura tempo limite de proxy) e o progresso é real.
 */
export async function runSearch(opts: {
  termos: string[];
  cidades: string[];
  profundidade: Depth;
  signal: AbortSignal;
  onPlan: (plan: PlanResponse) => void;
  onLeads: (leads: Lead[]) => void;
  onProgress: (p: Progress) => void;
}) {
  const plan = await api<PlanResponse>(
    "/api/search/plan",
    { termos: opts.termos, cidades: opts.cidades, profundidade: opts.profundidade },
    { signal: opts.signal },
  );
  opts.onPlan(plan);

  const progress: Progress = {
    feitas: plan.cidades.some((c) => c.nome !== c.entrada) ? plan.cidades.length : 0,
    previstas: plan.tasks.length * PAGES_PER_TASK,
    etapa: "Iniciando…",
    erros: plan.cidades.filter((c) => c.erro).map((c) => `${c.entrada}: ${c.erro}`),
  };
  progress.previstas += progress.feitas;
  opts.onProgress({ ...progress });

  const queue = [...plan.tasks];
  let fatal: Error | null = null;

  async function runTask(task: SearchTask) {
    let pageToken: string | null = null;
    for (let page = 0; page < PAGES_PER_TASK; page++) {
      if (opts.signal.aborted || fatal) return;
      progress.etapa = `${task.termo} · ${task.cidade}${task.areas > 1 ? ` · área ${task.area}/${task.areas}` : ""} · página ${page + 1}`;
      opts.onProgress({ ...progress });
      let result: PageResult | null = null;
      for (let tentativa = 0; tentativa < 2 && !result; tentativa++) {
        try {
          result = await api<PageResult>(
            "/api/search/page",
            { textQuery: task.textQuery, termo: task.termo, cidade: task.cidade, rect: task.rect, pageToken },
            { signal: opts.signal },
          );
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
          const status = e instanceof ApiError ? e.status : 0;
          // Chave inválida, API desligada, sem faturamento: não adianta continuar.
          if (status === 503 || (status === 502 && /chave|faturamento|ativada|recusou/i.test((e as Error).message))) {
            fatal = e as Error;
            return;
          }
          if (tentativa === 1 || status === 400) {
            progress.erros.push(`${task.termo} · ${task.cidade}: ${(e as Error).message}`);
            progress.previstas -= PAGES_PER_TASK - page - 1;
            progress.feitas++;
            opts.onProgress({ ...progress });
            return;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      if (!result) return;
      progress.feitas++;
      opts.onLeads(result.leads);
      if (!result.nextPageToken) {
        progress.previstas -= PAGES_PER_TASK - page - 1;
        opts.onProgress({ ...progress });
        return;
      }
      pageToken = result.nextPageToken;
      opts.onProgress({ ...progress });
    }
  }

  async function worker() {
    while (queue.length && !opts.signal.aborted && !fatal) {
      const task = queue.shift();
      if (task) await runTask(task);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  if (fatal) throw fatal;
  progress.etapa = opts.signal.aborted ? "Busca interrompida" : "Concluída";
  progress.previstas = Math.max(progress.feitas, opts.signal.aborted ? progress.feitas : progress.previstas);
  opts.onProgress({ ...progress });
}
