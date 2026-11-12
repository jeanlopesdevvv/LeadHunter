import "server-only";

import postgres from "postgres";

import { getConfig } from "@/lib/env";

import * as simulado from "./mock";
import type { ResumoEmpresaCrm } from "@/lib/empresas";

import type {
  AcaoBase,
  ContaCrm,
  ModeloConta,
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

/** A empresa Voob (a primeira do Radar no Voob CRM). As outras vêm do banco (radar.empresas_lista). */
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

/** Roda uma função do banco. Leituras tentam de novo em falha passageira; gravações não repetem. Erro: o do banco. */
async function noCrmCru<T>(fn: (sql: postgres.Sql) => Promise<T>, leitura: boolean): Promise<T> {
  const tentativas = leitura ? 3 : 1;
  for (let i = 0; ; i++) {
    try {
      return await fn(conexao());
    } catch (e) {
      if (e instanceof VoobError) throw e;
      const err = e as { code?: string; message?: string };
      const msg = `${err.code ?? ""} ${err.message ?? ""}`;
      if (leitura && i + 1 < tentativas && PASSAGEIRO.test(msg)) {
        await pausa(500 * 2 ** i);
        continue;
      }
      throw e;
    }
  }
}

/** Roda uma função do banco, com o erro já em português. */
async function noCrm<T>(fn: (sql: postgres.Sql) => Promise<T>, leitura: boolean): Promise<T> {
  try {
    return await noCrmCru(fn, leitura);
  } catch (e) {
    throw traduzir(e);
  }
}

/** O erro do banco em português (o que a tela mostra). */
function traduzir(e: unknown): VoobError {
  if (e instanceof VoobError) return e;
  const err = e as { code?: string; message?: string };
  const msg = `${err.code ?? ""} ${err.message ?? ""}`;
  // Erros de regra que o próprio banco explica (ex.: "Desligue o Radar antes de trocar o número.").
  if (err.code === "P0001" || err.code === "P0002") return new VoobError(err.message ?? "Pedido recusado.", 400);
  console.error("[radar-voob] banco:", msg);
  if (/28P01|password authentication failed/i.test(msg)) {
    return new VoobError("O Radar não conseguiu entrar no Voob CRM (senha do radar_voob). Confira VOOB_CRM_DB_URL no EasyPanel.", 503);
  }
  if (/42501|permission denied/i.test(msg)) return new VoobError("O usuário do Radar no Voob CRM está sem permissão para isso.", 503);
  if (/3F000|42883|schema "radar" does not exist|function radar\./i.test(msg)) {
    return new VoobError("O Voob CRM ainda não tem esta parte do Radar (falta aplicar a migração do Radar).", 503);
  }
  return new VoobError("Não deu para falar com o Voob CRM agora. Tente de novo em instantes.", 502);
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

export async function config(empresa: string): Promise<ConfigVoob> {
  if (usarSimulacao()) return simular(() => simulado.config(empresa));
  return noCrm(async (sql) => (await sql`select radar.config(${empresa}) as r`)[0].r as ConfigVoob, true);
}

export async function definir(empresa: string, mudancas: Record<string, unknown>, quem = QUEM_PADRAO): Promise<ConfigVoob> {
  if (usarSimulacao()) return simular(() => simulado.definir(empresa, mudancas));
  return noCrm(
    async (sql) => (await sql`select radar.definir(${empresa}, ${JSON.stringify(mudancas)}::jsonb, ${quem}) as r`)[0].r as ConfigVoob,
    false,
  );
}

export async function ligar(empresa: string, ligado: boolean, quem = QUEM_PADRAO): Promise<ConfigVoob> {
  if (usarSimulacao()) return simular(() => simulado.ligar(empresa, ligado));
  return noCrm(async (sql) => (await sql`select radar.ligar(${empresa}, ${ligado}, ${quem}) as r`)[0].r as ConfigVoob, false);
}

export async function inserir(empresa: string, leads: EntradaBase[], quem = QUEM_PADRAO): Promise<RespostaInsercao> {
  if (usarSimulacao()) return simular(() => simulado.inserir(empresa, leads));
  return noCrm(
    async (sql) => (await sql`select radar.leads_inserir(${empresa}, ${JSON.stringify(leads)}::jsonb, ${quem}) as r`)[0].r as RespostaInsercao,
    false,
  );
}

export async function conferir(empresa: string, telefones: string[]): Promise<Map<string, SituacaoConferida>> {
  const mapa = new Map<string, SituacaoConferida>();
  if (!telefones.length) return mapa;
  const lista = usarSimulacao()
    ? simular(() => simulado.conferir(empresa, telefones))
    : await noCrm(
        async (sql) =>
          (await sql`select radar.leads_conferir(${empresa}, ${sql.array(telefones)}::text[]) as r`)[0].r as {
            telefone: string;
            situacao: SituacaoConferida;
          }[],
        true,
      );
  for (const x of lista) mapa.set(x.telefone, x.situacao);
  return mapa;
}

export async function lista(empresa: string, filtro: { status?: StatusLead[]; busca?: string; limite?: number }): Promise<ListaBase> {
  if (usarSimulacao()) return simular(() => simulado.lista(empresa, filtro));
  return noCrm(
    async (sql) => (await sql`select radar.leads_lista(${empresa}, ${JSON.stringify(filtro)}::jsonb) as r`)[0].r as ListaBase,
    true,
  );
}

export async function acao(empresa: string, ids: string[], qual: AcaoBase, quem = QUEM_PADRAO): Promise<{ afetados: number; na_fila: number }> {
  if (usarSimulacao()) return simular(() => simulado.acao(empresa, ids, qual));
  return noCrm(
    async (sql) =>
      (await sql`select radar.leads_acao(${empresa}, ${sql.array(ids)}::uuid[], ${qual}, ${quem}) as r`)[0].r as {
        afetados: number;
        na_fila: number;
      },
    false,
  );
}

/** Painel: antes, confere o que aconteceu (o pg_cron faz isso a cada 10 min; aqui fica na hora). */
export async function painel(empresa: string, dias: number): Promise<PainelVoob> {
  if (usarSimulacao()) return simular(() => simulado.painel(empresa, dias));
  return noCrm(async (sql) => {
    await sql`select radar.apurar(${empresa})`;
    return (await sql`select radar.painel(${empresa}, ${dias}) as r`)[0].r as PainelVoob;
  }, false);
}

/** Login por pessoa: a conta (id do Voob CRM) é da equipe que usa o Radar? Devolve também o nome. */
export async function pessoaDoRadar(userId: string): Promise<{ pode: boolean; nome: string | null; equipe?: boolean }> {
  return noCrm(async (sql) => (await sql`select radar.pessoa(${userId}::uuid) as r`)[0].r as { pode: boolean; nome: string | null; equipe?: boolean }, true);
}

// ---------------------------------------------------------------- busca automática (migração 20261112210000)

export async function buscaAutoEstado(empresa: string): Promise<EstadoBuscaAuto> {
  if (usarSimulacao()) return simular(() => simulado.buscaAutoEstado(empresa));
  return noCrm(async (sql) => (await sql`select radar.busca_auto_estado(${empresa}) as r`)[0].r as EstadoBuscaAuto, true);
}

export async function buscaAutoDefinir(empresa: string, mudancas: Record<string, unknown>, quem = QUEM_PADRAO): Promise<EstadoBuscaAuto> {
  if (usarSimulacao()) return simular(() => simulado.buscaAutoDefinir(empresa, mudancas));
  return noCrm(
    async (sql) => (await sql`select radar.busca_auto_definir(${empresa}, ${JSON.stringify(mudancas)}::jsonb, ${quem}) as r`)[0].r as EstadoBuscaAuto,
    false,
  );
}

/** Começa uma rodada; null = já tem uma rodando. */
export async function buscaAutoIniciar(empresa: string, origem: "rotina" | "manual", quem: string, precisa: number, podeGastar: number): Promise<number | null> {
  if (usarSimulacao()) return simular(() => simulado.buscaAutoIniciar(empresa, origem, quem, precisa, podeGastar));
  return noCrm(async (sql) => {
    const r = (await sql`select radar.busca_auto_iniciar(${empresa}, ${origem}, ${quem}, ${precisa}, ${podeGastar}) as r`)[0].r;
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

export async function saude(empresa: string): Promise<SaudeVoob> {
  if (usarSimulacao()) return simular(() => simulado.saude(empresa));
  return noCrm(async (sql) => (await sql`select radar.saude(${empresa}) as r`)[0].r as SaudeVoob, true);
}

/** "Ler agora": pede uma leitura nova à Meta (no máximo uma a cada 2 min). */
export async function saudeAtualizar(empresa: string): Promise<SaudeVoob> {
  if (usarSimulacao()) return simular(() => simulado.saudeAtualizar(empresa));
  return noCrm(async (sql) => (await sql`select radar.saude_atualizar(${empresa}) as r`)[0].r as SaudeVoob, false);
}

// ---------------------------------------------------------------- empresas (white label, migração 20261113100000)

const SEM_EMPRESAS = /function radar\.(empresas_lista|empresa_ver|contas|empresa_criar|teste|modelo_)|42883/;

/** As empresas que a pessoa vê (equipe: todas). Banco sem a parte das empresas (antes da migração 5): só a Voob. */
export async function empresasLista(userId: string | null, equipe: boolean): Promise<ResumoEmpresaCrm[]> {
  if (usarSimulacao()) return simular(() => simulado.empresasLista(userId, equipe));
  try {
    return await noCrmCru(async (sql) => (await sql`select radar.empresas_lista(${userId}::uuid, ${equipe}) as r`)[0].r as ResumoEmpresaCrm[], true);
  } catch (e) {
    if (SEM_EMPRESAS.test(String((e as { message?: string; code?: string })?.message ?? "") + " " + String((e as { code?: string })?.code ?? ""))) {
      return equipe ? [VOOB_ANTIGA] : [];
    }
    throw traduzir(e);
  }
}

/** Uma empresa, se a pessoa vê (null = não vê). */
export async function empresaVer(empresa: string, userId: string | null, equipe: boolean): Promise<ResumoEmpresaCrm | null> {
  if (usarSimulacao()) return simular(() => simulado.empresaVer(empresa, userId, equipe));
  try {
    return await noCrmCru(
      async (sql) => ((await sql`select radar.empresa_ver(${empresa}, ${userId}::uuid, ${equipe}) as r`)[0].r as ResumoEmpresaCrm | null) ?? null,
      true,
    );
  } catch (e) {
    if (SEM_EMPRESAS.test(String((e as { message?: string })?.message ?? "") + " " + String((e as { code?: string })?.code ?? ""))) {
      return equipe && empresa === EMPRESA_VOOB ? VOOB_ANTIGA : null;
    }
    throw traduzir(e);
  }
}

/** A Voob como era antes da migração 5 (o seletor continua mostrando enquanto a migração não entra). */
const VOOB_ANTIGA: ResumoEmpresaCrm = {
  id: EMPRESA_VOOB, nome: "Voob", cor: "#4e9a1a", logo: null, publico: "Empresas que vendem pelo WhatsApp", agente: "Renata",
  ligado: false, pausado: false, numero: false, conta: null, teste: false, situacao: "preparando",
};

export async function contas(busca: string): Promise<ContaCrm[]> {
  if (usarSimulacao()) return simular(() => simulado.contas(busca));
  return noCrm(async (sql) => (await sql`select radar.contas(${busca}) as r`)[0].r as ContaCrm[], true);
}

export async function empresaCriar(dados: Record<string, unknown>, quem = QUEM_PADRAO): Promise<ConfigVoob> {
  if (usarSimulacao()) return simular(() => simulado.empresaCriar(dados, quem));
  return noCrm(async (sql) => (await sql`select radar.empresa_criar(${JSON.stringify(dados)}::jsonb, ${quem}) as r`)[0].r as ConfigVoob, false);
}

export async function modeloRenomear(empresa: string, modelo: string, titulo: string, quem = QUEM_PADRAO): Promise<ModeloConta[]> {
  if (usarSimulacao()) return simular(() => simulado.modeloRenomear(empresa, modelo, titulo));
  return noCrm(async (sql) => (await sql`select radar.modelo_renomear(${empresa}, ${modelo}::uuid, ${titulo}, ${quem}) as r`)[0].r as ModeloConta[], false);
}

export async function modeloArquivar(empresa: string, modelo: string, arquivar: boolean, quem = QUEM_PADRAO): Promise<ModeloConta[]> {
  if (usarSimulacao()) return simular(() => simulado.modeloArquivar(empresa, modelo, arquivar));
  return noCrm(async (sql) => (await sql`select radar.modelo_arquivar(${empresa}, ${modelo}::uuid, ${arquivar}, ${quem}) as r`)[0].r as ModeloConta[], false);
}

/** Teste no próprio número: liga (com o telefone) ou encerra. */
export async function teste(empresa: string, telefone: string | null, ligarTeste: boolean, quem = QUEM_PADRAO): Promise<ConfigVoob> {
  if (usarSimulacao()) return simular(() => simulado.teste(empresa, telefone, ligarTeste));
  return noCrm(async (sql) => (await sql`select radar.teste(${empresa}, ${telefone}, ${ligarTeste}, ${quem}) as r`)[0].r as ConfigVoob, false);
}

/** As empresas com a busca automática ligada (o fluxo do n8n busca para todas). Banco antigo: só a Voob. */
export async function buscaAutoEmpresas(): Promise<string[]> {
  if (usarSimulacao()) return simular(() => simulado.buscaAutoEmpresas());
  try {
    return await noCrmCru(async (sql) => (await sql`select radar.busca_auto_empresas() as r`)[0].r as string[], true);
  } catch (e) {
    if (SEM_EMPRESAS.test(String((e as { message?: string })?.message ?? "") + " " + String((e as { code?: string })?.code ?? "")) || /busca_auto_empresas/.test(String((e as { message?: string })?.message ?? ""))) {
      return [EMPRESA_VOOB];
    }
    throw traduzir(e);
  }
}
