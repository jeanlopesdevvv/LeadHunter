"use client";

import { LUGARES_POR_PAGINA, MAX_DIVISOES, PAGINAS_POR_CONSULTA, splitRect } from "@/lib/geo";
import type { Lead, PageResult, PlanResult, Rect, SearchTask, Uso } from "@/lib/types";

import { api, ApiError } from "./api";

/** Por que a busca parou. */
export type MotivoFim = "alvo" | "limite" | "esgotado" | "parado" | "cota" | "erro";

export interface Progresso {
  /** Quantos contatos novos foram pedidos. */
  alvo: number;
  /** Contatos novos com celular (fora da planilha) encontrados até agora. */
  novos: number;
  /** Consultas gastas nesta busca (somando as continuações). */
  consultas: number;
  /** Máximo de consultas desta busca. */
  limite: number;
  /** Estabelecimentos recebidos do Google (com repetidos). */
  vistos: number;
  unicos: number;
  repetidos: number;
  fechados: number;
  jaNaPlanilha: number;
  semCelular: number;
  etapa: string;
  avisos: string[];
  rodando: boolean;
  fim: MotivoFim | null;
  erro?: string;
}

interface Item extends SearchTask {
  paginas: number;
  pageToken: string | null;
  recebidos: number;
}

const PARALELO = 3;
/** Uma consulta que chegou perto de 60 lugares ainda tem mais para achar: divide o mapa. */
const CHEIA = PAGINAS_POR_CONSULTA * LUGARES_POR_PAGINA - 5;

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Conta como "novo" para o alvo: celular (ou fixo, se permitido) e fora da planilha. */
export function contaComoNovo(lead: Lead, incluirFixos = false): boolean {
  const fone = lead.telefoneTipo === "celular" || (incluirFixos && lead.telefoneTipo === "fixo");
  return fone && (lead.planilha === "novo" || lead.planilha === "desconhecido");
}

/**
 * Uma busca em andamento. O navegador comanda a busca em passos curtos (uma página
 * de 20 lugares por chamada), por rodadas: primeiro a 1ª página de cada termo × cidade,
 * depois as seguintes. Quando o Google esgota os 60 resultados de uma consulta,
 * o mapa daquela cidade é dividido em 4 (e de novo, até 64 pedaços) para achar mais.
 * Para ao chegar na quantidade pedida, no limite de consultas ou quando acabam os resultados.
 */
export class SessaoDeBusca {
  private fila: Item[];
  private areas: Record<string, Rect | null>;
  private porId = new Map<string, Lead>();
  private porTelefone = new Set<string>();
  private semArea = new Set<string>();
  readonly ignorarFechados: boolean;
  readonly incluirFixos: boolean;
  readonly progresso: Progresso;
  ultimoUso: Uso | null;

  constructor(plano: PlanResult, opts: { ignorarFechados: boolean; incluirFixos?: boolean }) {
    this.fila = plano.tarefas.map((t) => ({ ...t, paginas: 0, pageToken: null, recebidos: 0 }));
    this.areas = plano.areas;
    this.ignorarFechados = opts.ignorarFechados;
    this.incluirFixos = Boolean(opts.incluirFixos);
    this.ultimoUso = plano.uso;
    this.progresso = {
      alvo: 0,
      novos: 0,
      consultas: 0,
      limite: 0,
      vistos: 0,
      unicos: 0,
      repetidos: 0,
      fechados: 0,
      jaNaPlanilha: 0,
      semCelular: 0,
      etapa: "",
      avisos: plano.cidades.filter((c) => c.erro).map((c) => `${c.entrada}: ${c.erro}`),
      rodando: false,
      fim: null,
    };
  }

  get leads(): Lead[] {
    return [...this.porId.values()];
  }

  /** Ainda há consultas na fila (dá para continuar). */
  get temMais(): boolean {
    return this.fila.length > 0;
  }

  async executar(opts: { alvo: number; limite: number; signal: AbortSignal; onUpdate: (leads: Lead[], p: Progresso) => void }) {
    const p = this.progresso;
    p.alvo = opts.alvo;
    p.limite = opts.limite;
    p.fim = null;
    p.erro = undefined;
    p.rodando = true;
    let emAndamento = 0;
    let fatal: { motivo: MotivoFim; mensagem: string } | null = null;
    const emitir = () => opts.onUpdate(this.leads, { ...p, avisos: [...p.avisos] });
    const parar = () => opts.signal.aborted || fatal !== null || p.novos >= opts.alvo;

    const trabalhador = async () => {
      while (!parar()) {
        if (p.consultas + emAndamento >= opts.limite || !this.fila.length) {
          if (emAndamento === 0) return;
          await dormir(120); // outra consulta em andamento pode liberar vaga ou trazer mais trabalho
          continue;
        }
        const item = this.fila.shift()!;
        emAndamento++;
        p.etapa = descrever(item);
        emitir();
        try {
          const f = await this.buscarPagina(item, opts.signal);
          if (f && !fatal) fatal = f;
        } finally {
          emAndamento--;
        }
        emitir();
      }
    };

    // Poucos contatos pedidos: uma consulta por vez, para não gastar à toa.
    const paralelo = Math.max(1, Math.min(PARALELO, Math.ceil((opts.alvo - p.novos) / 15)));
    await Promise.all(Array.from({ length: paralelo }, trabalhador));

    p.rodando = false;
    if (fatal) {
      const f = fatal as { motivo: MotivoFim; mensagem: string };
      p.fim = f.motivo;
      p.erro = f.mensagem;
    } else if (opts.signal.aborted) p.fim = "parado";
    else if (p.novos >= opts.alvo) p.fim = "alvo";
    else if (!this.fila.length) p.fim = "esgotado";
    else p.fim = "limite";
    p.etapa = "";
    emitir();
  }

  /** Busca uma página. Devolve um erro fatal (para a busca inteira) ou null. */
  private async buscarPagina(item: Item, signal: AbortSignal): Promise<{ motivo: MotivoFim; mensagem: string } | null> {
    let result: PageResult | null = null;
    for (let tentativa = 0; tentativa < 2 && !result; tentativa++) {
      try {
        result = await api<PageResult>(
          "/api/search/page",
          { textQuery: item.textQuery, termo: item.termo, cidade: item.cidade, rect: item.rect, pageToken: item.pageToken },
          { signal },
        );
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          this.fila.unshift(item); // dá para continuar depois
          return null;
        }
        const status = e instanceof ApiError ? e.status : 0;
        const mensagem = (e as Error).message;
        if (e instanceof ApiError && e.dados.cota) {
          if (e.dados.uso) this.ultimoUso = e.dados.uso as Uso;
          this.fila.unshift(item);
          return { motivo: "cota", mensagem };
        }
        // Chave errada, API desligada, sem faturamento, limite do Google: não adianta insistir.
        if (status === 503 || status === 429 || status === 401) {
          this.fila.unshift(item);
          return { motivo: "erro", mensagem };
        }
        if (status === 400 || tentativa === 1) {
          this.progresso.avisos.push(`"${item.termo}" em ${item.cidade}: ${mensagem}`);
          return null;
        }
        await dormir(1500);
      }
    }
    if (!result) return null;

    const p = this.progresso;
    p.consultas++;
    if (result.uso) this.ultimoUso = result.uso;
    item.paginas++;
    item.recebidos += result.bruto;
    this.receber(result.leads);

    if (result.nextPageToken && item.paginas < PAGINAS_POR_CONSULTA) {
      this.fila.push({ ...item, pageToken: result.nextPageToken });
    } else if (item.recebidos >= CHEIA) {
      this.dividir(item);
    }
    return null;
  }

  private dividir(item: Item) {
    if (item.nivel >= MAX_DIVISOES) return;
    const rect = item.rect ?? this.areas[item.cidade];
    if (!rect) {
      if (!this.semArea.has(item.cidade)) {
        this.semArea.add(item.cidade);
        this.progresso.avisos.push(`${item.cidade}: o Google mostra no máximo 60 por busca e não deu para dividir o mapa desta cidade.`);
      }
      return;
    }
    splitRect(rect, 2).forEach((r, i) =>
      this.fila.push({
        id: `${item.id}/${i + 1}`,
        termo: item.termo,
        cidade: item.cidade,
        textQuery: item.termo,
        rect: r,
        nivel: item.nivel + 1,
        paginas: 0,
        pageToken: null,
        recebidos: 0,
      }),
    );
  }

  private receber(leads: Lead[]) {
    const p = this.progresso;
    for (const lead of leads) {
      p.vistos++;
      if (this.ignorarFechados && lead.situacaoNegocio !== "OPERATIONAL") {
        p.fechados++;
        continue;
      }
      if (this.porId.has(lead.id) || (lead.telefoneKey && this.porTelefone.has(lead.telefoneKey))) {
        p.repetidos++;
        continue;
      }
      this.porId.set(lead.id, lead);
      if (lead.telefoneKey) this.porTelefone.add(lead.telefoneKey);
      p.unicos++;
      if (lead.planilha === "existente" || lead.planilha === "optout") p.jaNaPlanilha++;
      else if (!(lead.telefoneTipo === "celular" || (this.incluirFixos && lead.telefoneTipo === "fixo"))) p.semCelular++;
      else p.novos++;
    }
  }
}

function descrever(item: Item): string {
  const onde = `"${item.termo}" em ${item.cidade}`;
  const mapa = item.nivel > 0 ? ` · mapa dividido em ${4 ** item.nivel} partes` : "";
  return `${onde}${mapa} · página ${item.paginas + 1}`;
}

/** Pede ao servidor o plano da busca (consultas iniciais e contorno de cada cidade). */
export function planejarBusca(termos: string[], cidades: string[], signal: AbortSignal) {
  return api<PlanResult>("/api/search/plan", { termos, cidades }, { signal });
}
