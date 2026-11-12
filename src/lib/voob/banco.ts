import "server-only";

import postgres from "postgres";

import { getConfig } from "@/lib/env";

import * as simulado from "./mock";
import type {
  AcaoBase,
  ConfigVoob,
  EntradaBase,
  EstadoBuscaAuto,
  ListaBase,
  PainelVoob,
  RespostaInsercao,
  SaudeVoob,
  SituacaoConferida,
  StatusLead,
} from "./tipos";

/**
 * Radar · Voob: o motor é o Voob CRM (12/11/2026). O Radar só chama as funções do schema "radar" de lá
 * (migração 20261112150000_radar_voob), com o usuário radar_voob, que não lê nem grava mais nada.
 * Variável no EasyPanel: VOOB_CRM_DB_URL (endereço completo do pooler, com o usuário radar_voob.<projeto>).
 * Na simulação (MOCK_MODE=1, só fora de produção) tudo roda na memória.
 */

export const EMPRESA_VOOB = "voob";
/** Quem fez a mudança, no histórico do banco: o nome de quem entrou (ou "Radar", com a senha da equipe). */
const QUEM_PADRAO = "Radar";

export class VoobError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export const SEM_CONEXAO =
  "O Radar ainda não está ligado ao Voob CRM. Falta pôr a variável VOOB_CRM_DB_URL no EasyPanel (o Jean recebe o endereço pronto).";

const g = globalThis as unknown as { __radarVoob?: postgres.Sql | null };

function conexao(): postgres.Sql {
  const url = getConfig().voobCrmDbUrl;
  if (!url) throw new VoobError(SEM_CONEXAO, 503);
  if (!g.__radarVoob) {
    g.__radarVoob = postgres(url, {
      ssl: /sslmode=disable/i.test(url) ? false : "require",
      max: 3,
      prepare: false, // pooler em modo transação
      idle_timeout: 30,
      connect_timeout: 10,
      connection: { application_name: "radar-voob" },
    });
  }
  return g.__radarVoob;
}

const PASSAGEIRO = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|CONNECT_TIMEOUT|CONNECTION_CLOSED|CONNECTION_ENDED|57P01|53300|08006|08001/;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Roda uma função do banco. Leituras tentam de novo em falha passageira; gravações não repetem. */
async function noCrm<T>(fn: (sql: postgres.Sql) => Promise<T>, leitura: boolean): Promise<T> {
  const tentativas = leitura ? 3 : 1;
  for (let i = 0; ; i++) {
    try {
      return await fn(conexao());
    } catch (e) {
      if (e instanceof VoobError) throw e;
      const err = e as { code?: string; message?: string };
      const msg = `${err.code ?? ""} ${err.message ?? ""}`;
      // Erros de regra que o próprio banco explica (ex.: "Desligue o Radar antes de trocar o número.").
      if (err.code === "P0001" || err.code === "P0002") throw new VoobError(err.message ?? "Pedido recusado.", 400);
      if (leitura && i + 1 < tentativas && PASSAGEIRO.test(msg)) {
        await pausa(500 * 2 ** i);
        continue;
      }
      console.error("[radar-voob] banco:", msg);
      if (/28P01|password authentication failed/i.test(msg)) {
        throw new VoobError("O Radar não conseguiu entrar no Voob CRM (senha do radar_voob). Confira VOOB_CRM_DB_URL no EasyPanel.", 503);
      }
      if (/42501|permission denied/i.test(msg)) throw new VoobError("O usuário do Radar no Voob CRM está sem permissão para isso.", 503);
      if (/3F000|42883|schema "radar" does not exist|function radar\./i.test(msg)) {
        throw new VoobError("O Voob CRM ainda não tem a parte do Radar (falta aplicar a migração do Radar).", 503);
      }
      throw new VoobError("Não deu para falar com o Voob CRM agora. Tente de novo em instantes.", 502);
    }
  }
}

const usarSimulacao = () => getConfig().mock;

/** Na simulação, os "não pode" do banco de mentira viram a mesma resposta das regras do banco de verdade. */
function simular<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P0001" || err.code === "P0002") throw new VoobError(err.message ?? "Pedido recusado.", 400);
    throw e;
  }
}

export async function config(): Promise<ConfigVoob> {
  if (usarSimulacao()) return simular(() => simulado.config());
  return noCrm(async (sql) => (await sql`select radar.config(${EMPRESA_VOOB}) as r`)[0].r as ConfigVoob, true);
}

export async function definir(mudancas: Record<string, unknown>, quem = QUEM_PADRAO): Promise<ConfigVoob> {
  if (usarSimulacao()) return simular(() => simulado.definir(mudancas));
  return noCrm(
    async (sql) => (await sql`select radar.definir(${EMPRESA_VOOB}, ${JSON.stringify(mudancas)}::jsonb, ${quem}) as r`)[0].r as ConfigVoob,
    false,
  );
}

export async function ligar(ligado: boolean, quem = QUEM_PADRAO): Promise<ConfigVoob> {
  if (usarSimulacao()) return simular(() => simulado.ligar(ligado));
  return noCrm(async (sql) => (await sql`select radar.ligar(${EMPRESA_VOOB}, ${ligado}, ${quem}) as r`)[0].r as ConfigVoob, false);
}

export async function inserir(leads: EntradaBase[], quem = QUEM_PADRAO): Promise<RespostaInsercao> {
  if (usarSimulacao()) return simular(() => simulado.inserir(leads));
  return noCrm(
    async (sql) => (await sql`select radar.leads_inserir(${EMPRESA_VOOB}, ${JSON.stringify(leads)}::jsonb, ${quem}) as r`)[0].r as RespostaInsercao,
    false,
  );
}

export async function conferir(telefones: string[]): Promise<Map<string, SituacaoConferida>> {
  const mapa = new Map<string, SituacaoConferida>();
  if (!telefones.length) return mapa;
  const lista = usarSimulacao()
    ? simular(() => simulado.conferir(telefones))
    : await noCrm(
        async (sql) =>
          (await sql`select radar.leads_conferir(${EMPRESA_VOOB}, ${sql.array(telefones)}::text[]) as r`)[0].r as {
            telefone: string;
            situacao: SituacaoConferida;
          }[],
        true,
      );
  for (const x of lista) mapa.set(x.telefone, x.situacao);
  return mapa;
}

export async function lista(filtro: { status?: StatusLead[]; busca?: string; limite?: number }): Promise<ListaBase> {
  if (usarSimulacao()) return simular(() => simulado.lista(filtro));
  return noCrm(
    async (sql) => (await sql`select radar.leads_lista(${EMPRESA_VOOB}, ${JSON.stringify(filtro)}::jsonb) as r`)[0].r as ListaBase,
    true,
  );
}

export async function acao(ids: string[], qual: AcaoBase, quem = QUEM_PADRAO): Promise<{ afetados: number; na_fila: number }> {
  if (usarSimulacao()) return simular(() => simulado.acao(ids, qual));
  return noCrm(
    async (sql) =>
      (await sql`select radar.leads_acao(${EMPRESA_VOOB}, ${sql.array(ids)}::uuid[], ${qual}, ${quem}) as r`)[0].r as {
        afetados: number;
        na_fila: number;
      },
    false,
  );
}

/** Painel: antes, confere o que aconteceu (o pg_cron faz isso a cada 10 min; aqui fica na hora). */
export async function painel(dias: number): Promise<PainelVoob> {
  if (usarSimulacao()) return simular(() => simulado.painel(dias));
  return noCrm(async (sql) => {
    await sql`select radar.apurar(${EMPRESA_VOOB})`;
    return (await sql`select radar.painel(${EMPRESA_VOOB}, ${dias}) as r`)[0].r as PainelVoob;
  }, false);
}

/** Login por pessoa: a conta (id do Voob CRM) é da equipe que usa o Radar? Devolve também o nome. */
export async function pessoaDoRadar(userId: string): Promise<{ pode: boolean; nome: string | null }> {
  return noCrm(async (sql) => (await sql`select radar.pessoa(${userId}::uuid) as r`)[0].r as { pode: boolean; nome: string | null }, true);
}

// ---------------------------------------------------------------- busca automática (migração 20261112210000)

export async function buscaAutoEstado(): Promise<EstadoBuscaAuto> {
  if (usarSimulacao()) return simular(() => simulado.buscaAutoEstado());
  return noCrm(async (sql) => (await sql`select radar.busca_auto_estado(${EMPRESA_VOOB}) as r`)[0].r as EstadoBuscaAuto, true);
}

export async function buscaAutoDefinir(mudancas: Record<string, unknown>, quem = QUEM_PADRAO): Promise<EstadoBuscaAuto> {
  if (usarSimulacao()) return simular(() => simulado.buscaAutoDefinir(mudancas));
  return noCrm(
    async (sql) => (await sql`select radar.busca_auto_definir(${EMPRESA_VOOB}, ${JSON.stringify(mudancas)}::jsonb, ${quem}) as r`)[0].r as EstadoBuscaAuto,
    false,
  );
}

/** Começa uma rodada; null = já tem uma rodando. */
export async function buscaAutoIniciar(origem: "rotina" | "manual", quem: string, precisa: number, podeGastar: number): Promise<number | null> {
  if (usarSimulacao()) return simular(() => simulado.buscaAutoIniciar(origem, quem, precisa, podeGastar));
  return noCrm(async (sql) => {
    const r = (await sql`select radar.busca_auto_iniciar(${EMPRESA_VOOB}, ${origem}, ${quem}, ${precisa}, ${podeGastar}) as r`)[0].r;
    return r === null || r === undefined ? null : Number(r);
  }, false);
}

export async function buscaAutoFeita(
  rodada: number,
  u: { termo: string; lugar: string },
  x: { consultas: number; vistos: number; novos: number; adicionados: number; cheia: boolean },
): Promise<void> {
  if (usarSimulacao()) return simular(() => simulado.buscaAutoFeita(rodada, u.termo, u.lugar, x.consultas, x.novos, x.cheia));
  await noCrm(
    (sql) => sql`select radar.busca_auto_feita(${rodada}, ${u.termo}, ${u.lugar}, ${x.consultas}, ${x.vistos}, ${x.novos}, ${x.adicionados}, ${x.cheia})`,
    false,
  );
}

export async function buscaAutoTerminar(rodada: number, resultado: Record<string, unknown>): Promise<void> {
  if (usarSimulacao()) {
    return simular(() =>
      simulado.buscaAutoTerminar(rodada, resultado as { consultas: number; adicionados: number; motivo: string; texto?: string; erro?: string | null }),
    );
  }
  await noCrm((sql) => sql`select radar.busca_auto_terminar(${rodada}, ${JSON.stringify(resultado)}::jsonb)`, false);
}

// ---------------------------------------------------------------- saúde do número e sugestão de limite

export async function saude(): Promise<SaudeVoob> {
  if (usarSimulacao()) return simular(() => simulado.saude());
  return noCrm(async (sql) => (await sql`select radar.saude(${EMPRESA_VOOB}) as r`)[0].r as SaudeVoob, true);
}

/** "Ler agora": pede uma leitura nova à Meta (no máximo uma a cada 2 min). */
export async function saudeAtualizar(): Promise<SaudeVoob> {
  if (usarSimulacao()) return simular(() => simulado.saudeAtualizar());
  return noCrm(async (sql) => (await sql`select radar.saude_atualizar(${EMPRESA_VOOB}) as r`)[0].r as SaudeVoob, false);
}
