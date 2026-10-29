import "server-only";

import postgres from "postgres";

import { CABECALHOS_ABAS, CABECALHO_LEADS, agoraBrasilia, nomeDeAba, registrosComoAba, telefoneDoBanco, type EdicaoLead } from "./banco-regras";
import { getConfig } from "./env";
import { SheetsError } from "./erros";
import { comoItemDaFila, type FilaAtendente, type ItemFila } from "./fila-regras";
import { comoFunil, type FunilAtivacao } from "./funil-regras";
import { phoneKey } from "./phone";
import {
  buildHeaderMap,
  indexExisting,
  indexPhonesInTab,
  missingRequired,
  planSend,
  type HeaderMap,
  type LeadForSheet,
} from "./sheet-mapping";
import type { SendResult } from "./types";

/**
 * Lista de leads no banco do Lavacar (Supabase, schema "atendimento", usuário radar_atendimento).
 * Substitui a aba "leads" do Google Sheets (Etapa B da migração, 15/10/2026). Cada função devolve o
 * mesmo formato que a versão da planilha devolvia, então o resto do Radar não muda.
 * O usuário do Radar só lê o atendimento e grava em leads (sem apagar nada).
 */

export const TITULO_BANCO = "Banco de dados do Lavacar";

const g = globalThis as unknown as { __radarBanco?: postgres.Sql | null };

function conexao(): postgres.Sql {
  const b = getConfig().banco;
  if (!b) throw new SheetsError("O banco de dados não está configurado no servidor.", 503);
  if (!g.__radarBanco) {
    const opcoes = {
      // Supabase exige TLS; "sslmode=disable" no endereço só serve para testes num Postgres local.
      ssl: /sslmode=disable/i.test(b.url) ? (false as const) : ("require" as const),
      max: 3,
      prepare: false, // pooler em modo transação
      idle_timeout: 30,
      connect_timeout: 10,
      connection: { application_name: "radar-lavacar" },
    };
    g.__radarBanco = b.url
      ? postgres(b.url, opcoes)
      : postgres({ ...opcoes, host: b.host, port: b.porta, database: b.nome, username: b.usuario, password: b.senha });
  }
  return g.__radarBanco;
}

const PASSAGEIRO = /ECONNRESET|ETIMEDOUT|ECONNREFUSED|EPIPE|CONNECT_TIMEOUT|CONNECTION_CLOSED|CONNECTION_ENDED|57P01|53300|08006|08001/;
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Roda no banco. Leituras tentam de novo em falha passageira de conexão; gravações não repetem. */
async function noBanco<T>(fn: (sql: postgres.Sql) => Promise<T>, leitura = true): Promise<T> {
  const tentativas = leitura ? 3 : 1;
  for (let i = 0; ; i++) {
    try {
      return await fn(conexao());
    } catch (e) {
      if (e instanceof SheetsError) throw e;
      const err = e as { code?: string; message?: string };
      const msg = `${err.code ?? ""} ${err.message ?? ""}`;
      if (leitura && i + 1 < tentativas && PASSAGEIRO.test(msg)) {
        await pausa(500 * 2 ** i);
        continue;
      }
      console.error("[leadhunter] banco:", msg);
      if (/28P01|password authentication failed/i.test(msg)) {
        throw new SheetsError("O servidor não conseguiu entrar no banco de dados (senha do radar_atendimento). Confira a variável no EasyPanel.", 503);
      }
      throw new SheetsError("Não deu para falar com o banco de dados agora. Tente de novo em instantes.", 502);
    }
  }
}

type Registro = Record<string, unknown>;

async function registrosDeLeads(sql: postgres.Sql): Promise<Registro[]> {
  return sql<Registro[]>`
    select telefone, nome, tipo, cidade, status, mensagem_enviada_em, optout, template
      from atendimento.leads
     order by ordem, criado_em, telefone`;
}

/** As consultas de cada aba conhecida (só estas; nada de nome de tabela vindo de fora). */
const CONSULTAS: Record<string, (sql: postgres.Sql) => Promise<Registro[]>> = {
  leads: registrosDeLeads,
  historico_carol: (sql) => sql<Registro[]>`
    select telefone, "timestamp", remetente, mensagem, "remoteJid" from atendimento.historico_carol order by "timestamp", id`,
  historico_sofia: (sql) => sql<Registro[]>`
    select telefone, "timestamp", remetente, mensagem, "remoteJid", "messageId" from atendimento.historico_sofia order by "timestamp", id`,
  status_meta_carol: (sql) => sql<Registro[]>`
    select "timestamp", telefone, wamid, status, erro_codigo, erro_detalhe, categoria_cobranca
      from atendimento.status_meta_carol order by "timestamp", id`,
  sessoes_carol: (sql) => sql<Registro[]>`
    select "remoteJid", telefone, nome, estado, janela_meta_ate, ultimo_contato, tentativas_reativacao
      from atendimento.sessoes_carol order by atualizado_em`,
  sessoes_sofia: (sql) => sql<Registro[]>`
    select "remoteJid", telefone, nome, tipo_usuario, estado, trilha, ultimo_contato, tentativas_reativacao
      from atendimento.sessoes_sofia order by atualizado_em`,
};

export const ABAS_DO_BANCO = Object.keys(CONSULTAS);

/** Valores da lista de leads como aba: [cabeçalho, ...linhas]. */
export async function valoresLeads(): Promise<string[][]> {
  const regs = await noBanco((sql) => registrosDeLeads(sql));
  return registrosComoAba(CABECALHO_LEADS, regs);
}

export interface AbaBanco {
  title: string;
  tabs: string[];
  headers: string[];
  map: HeaderMap;
  rows: string[][];
}

export async function abaPrincipal(): Promise<AbaBanco> {
  const values = await valoresLeads();
  const headers = values[0];
  return { title: TITULO_BANCO, tabs: ABAS_DO_BANCO, headers, map: buildHeaderMap(headers), rows: values.slice(1) };
}

/** Telefones que já aparecem nas abas extras (históricos): quem já conversou não entra de novo. */
export async function telefonesDasAbasExtras(nomes: string[]): Promise<{ keys: Set<string>; lidas: string[]; ausentes: string[] }> {
  const keys = new Set<string>();
  const lidas = [...new Set(nomes.map(nomeDeAba).filter((n) => n !== "leads" && CONSULTAS[n]))];
  const ausentes = nomes.filter((n) => !CONSULTAS[nomeDeAba(n)]);
  for (const n of lidas) {
    const regs = await noBanco((sql) => CONSULTAS[n](sql));
    for (const k of indexPhonesInTab(registrosComoAba(CABECALHOS_ABAS[n], regs).slice(1))) keys.add(k);
  }
  return { keys, lidas, ausentes };
}

/** Várias abas de uma vez (Desempenho). As que o banco não tem ficam de fora, como na planilha. */
export async function lerAbas(nomes: string[]): Promise<{ abas: string[]; dados: Record<string, unknown[][]> }> {
  const dados: Record<string, unknown[][]> = {};
  for (const pedido of nomes) {
    const n = nomeDeAba(pedido);
    if (!CONSULTAS[n] || dados[pedido]) continue;
    const regs = await noBanco((sql) => CONSULTAS[n](sql));
    dados[pedido] = registrosComoAba(CABECALHOS_ABAS[n], regs);
  }
  return { abas: ABAS_DO_BANCO, dados };
}

/**
 * Muda o status (e o modelo do WhatsApp) de alguns leads. Confere o telefone de cada um; com `de`,
 * só muda se o status atual ainda for esse (o n8n pode ter acabado de gravar "enviado": nunca desfazer).
 */
export async function atualizarStatus(
  mudancas: { linha: number; key: string; status: string; de?: string; template?: string }[],
): Promise<void> {
  if (!mudancas.length) return;
  await noBanco(async (sql) => {
    const atuais = await sql<{ telefone: string }[]>`select telefone from atendimento.leads`;
    const porChave = new Map<string, string[]>();
    for (const r of atuais) {
      const k = phoneKey(r.telefone);
      if (k) porChave.set(k, [...(porChave.get(k) ?? []), r.telefone]);
    }
    for (const m of mudancas) {
      if (!porChave.has(m.key)) {
        throw new SheetsError("A lista de leads mudou enquanto o Radar preparava o disparo. Nada foi alterado; tente de novo.", 409);
      }
    }
    await sql.begin(async (tx) => {
      for (const m of mudancas) {
        for (const tel of porChave.get(m.key) ?? []) {
          const template = m.template === undefined ? null : m.template;
          const de = m.de === undefined ? null : m.de.trim().toLowerCase();
          await tx`
            update atendimento.leads
               set status = ${m.status},
                   template = coalesce(${template}::text, template),
                   atualizado_em = now()
             where telefone = ${tel}
               and (${de}::text is null or lower(btrim(coalesce(status, ''))) = ${de}::text)`;
        }
      }
    });
  }, false);
}

/** Telefones já na lista (leads + abas extras) e quem pediu opt-out. */
export async function existentes(extras: string[]) {
  const tab = await abaPrincipal();
  const missing = missingRequired(tab.map);
  if (missing.length) throw new SheetsError(`A lista de leads do banco está sem as colunas: ${missing.join(", ")}.`, 500);
  const idx = indexExisting(tab.rows, tab.map);
  const extra = await telefonesDasAbasExtras(extras);
  for (const k of extra.keys) idx.keys.add(k);
  return { ...idx, tab };
}

/** Grava leads novos (quem já está, pediu para sair ou está repetido fica de fora, com o motivo). */
export async function appendLeads(leads: LeadForSheet[], statusInicial: string, extras: string[]): Promise<SendResult> {
  const existing = await existentes(extras); // relido na hora de gravar
  const { toAppend, ignorados } = planSend(leads, existing);
  const linhas: { telefone: string; nome: string; tipo: string; cidade: string; status: string }[] = [];
  const porTelefone = new Map<string, LeadForSheet>();
  for (const l of toAppend) {
    const telefone = telefoneDoBanco(l.telefone);
    if (!telefone) {
      ignorados.push({ key: phoneKey(l.telefone), telefone: l.telefone, nome: l.nome, motivo: "telefone_invalido" });
      continue;
    }
    porTelefone.set(telefone, l);
    linhas.push({ telefone, nome: l.nome ?? "", tipo: l.tipo ?? "", cidade: l.cidade ?? "", status: statusInicial });
  }
  let gravados = new Set<string>();
  if (linhas.length) {
    const r = await noBanco(
      (sql) => sql<{ telefone: string }[]>`
        insert into atendimento.leads ${sql(linhas)}
        on conflict (telefone) do nothing
        returning telefone`,
      false,
    );
    gravados = new Set(r.map((x) => x.telefone));
  }
  const adicionados = [];
  for (const [telefone, l] of porTelefone) {
    const item = { key: phoneKey(l.telefone), telefone: l.telefone, nome: l.nome };
    // Outro envio gravou o mesmo telefone um instante antes: conta como "já na lista".
    if (gravados.has(telefone)) adicionados.push(item);
    else ignorados.push({ ...item, motivo: "ja_na_planilha" as const });
  }
  return { adicionados, ignorados, planilhaUrl: "", aba: "leads" };
}

/** Situação da lista no banco (tela de Configuração). */
export async function status(extras: string[]) {
  const base = {
    configurada: true,
    fonte: "banco" as const,
    contaServico: "",
    planilhaId: "",
    planilhaUrl: "",
    aba: "atendimento.leads",
    abasExtras: extras,
  };
  try {
    const tab = await abaPrincipal();
    const idx = indexExisting(tab.rows, tab.map);
    let extraErro = "";
    let extraTelefones = 0;
    let abasExtrasLidas: string[] = [];
    try {
      const extra = await telefonesDasAbasExtras(extras);
      extraTelefones = extra.keys.size;
      abasExtrasLidas = extra.lidas;
      if (extra.ausentes.length) extraErro = `não encontradas: ${extra.ausentes.join(", ")}`;
    } catch (e) {
      extraErro = (e as Error).message;
    }
    return {
      ...base,
      ok: true,
      titulo: TITULO_BANCO,
      abas: tab.tabs,
      cabecalhos: tab.headers,
      colunasFaltando: [] as string[],
      linhas: idx.rows,
      telefonesUnicos: idx.keys.size,
      optout: idx.optout.size,
      extraTelefones,
      abasExtrasLidas,
      extraErro,
      erro: "",
    };
  } catch (e) {
    return { ...base, ok: false, erro: (e as Error).message };
  }
}

// ---------------------------------------------------------------- tela "Leads"

export interface LeadDaLista {
  telefone: string;
  nome: string;
  tipo: string;
  cidade: string;
  status: string;
  mensagem_enviada_em: string;
  optout: string;
  template: string;
  ordem: number;
  atualizado_em: string;
}

function comoLead(r: Registro): LeadDaLista {
  const t = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v));
  return {
    telefone: t(r.telefone),
    nome: t(r.nome),
    tipo: t(r.tipo),
    cidade: t(r.cidade),
    status: t(r.status),
    mensagem_enviada_em: t(r.mensagem_enviada_em),
    optout: t(r.optout),
    template: t(r.template),
    ordem: Number(r.ordem ?? 0),
    atualizado_em: t(r.atualizado_em),
  };
}

/** Todos os leads, do mais novo para o mais antigo. */
export async function listarLeads(): Promise<LeadDaLista[]> {
  const regs = await noBanco(
    (sql) => sql<Registro[]>`
      select telefone, nome, tipo, cidade, status, mensagem_enviada_em, optout, template, ordem, atualizado_em
        from atendimento.leads
       order by ordem desc`,
  );
  return regs.map(comoLead);
}

/** Cidade onde gente abriu o app do Lavacar sem lava-jato parceiro a 20 km (só números). */
export interface CidadeComProcura {
  cidade: string;
  estado: string | null;
  pessoas: number;
  pedidosAviso: number;
  tentaramComprar: number;
  prioridade: number;
}

/** Cidades com procura e sem parceiro, mais urgentes primeiro (função atendimento.cidades_com_procura). */
export async function cidadesComProcura(): Promise<CidadeComProcura[]> {
  const regs = await noBanco((sql) => sql<Registro[]>`select * from atendimento.cidades_com_procura()`);
  return regs.map((r) => ({
    cidade: String(r.cidade ?? ""),
    estado: r.estado ? String(r.estado) : null,
    pessoas: Number(r.pessoas ?? 0),
    pedidosAviso: Number(r.pedidos_aviso ?? 0),
    tentaramComprar: Number(r.tentaram_comprar ?? 0),
    prioridade: Number(r.prioridade ?? 0),
  })).filter((c) => c.cidade);
}

/** Edita um lead (o que não veio fica como está). Opt-out ligado guarda a data, como o n8n faz. */
export async function editarLead(e: EdicaoLead): Promise<LeadDaLista> {
  const optout = e.optout === undefined ? null : e.optout;
  const r = await noBanco(
    (sql) => sql<Registro[]>`
      update atendimento.leads set
        nome = coalesce(${e.nome ?? null}::text, nome),
        tipo = coalesce(${e.tipo ?? null}::text, tipo),
        cidade = coalesce(${e.cidade ?? null}::text, cidade),
        status = coalesce(${e.status ?? null}::text, status),
        optout = case
          when ${optout}::boolean is null then optout
          when ${optout}::boolean then coalesce(nullif(btrim(coalesce(optout, '')), ''), ${agoraBrasilia()}::text)
          else '' end,
        atualizado_em = now()
      where telefone = ${e.telefone}
      returning telefone, nome, tipo, cidade, status, mensagem_enviada_em, optout, template, ordem, atualizado_em`,
    false,
  );
  if (!r.length) throw new SheetsError("Esse lead não está mais na lista.", 404);
  return comoLead(r[0]);
}

// ---------------------------------------------------------------------------
// Limite diário de disparos da Carol (atendimento.config, chave carol_limite_diario). O Fluxo 1 lê daqui.
export interface LimiteDiarioBanco {
  valor: number;
  atualizadoEm: string | null;
  por: string | null;
}

function comoLimite(r: Registro | undefined): LimiteDiarioBanco | null {
  if (!r || r.valor === null || r.valor === undefined) return null;
  const em = r.atualizado_em ? new Date(r.atualizado_em as string) : null;
  return { valor: Number(r.valor), atualizadoEm: em && !Number.isNaN(em.getTime()) ? em.toISOString() : null, por: (r.atualizado_por as string) ?? null };
}

/** Limite atual (null se o banco não está configurado ou ainda não tem o valor). */
export async function lerLimiteDiario(): Promise<LimiteDiarioBanco | null> {
  if (!getConfig().banco) return null;
  const r = await noBanco((sql) =>
    sql<Registro[]>`select (valor->>'valor')::int as valor, atualizado_em, atualizado_por from atendimento.config where chave = 'carol_limite_diario'`,
  );
  return comoLimite(r[0]);
}

/** Grava o novo limite (o banco guarda o histórico e recusa fora de 1 a 250). */
export async function salvarLimiteDiario(valor: number, por: string): Promise<LimiteDiarioBanco> {
  const r = await noBanco(
    (sql) => sql<Registro[]>`
      insert into atendimento.config (chave, valor, atualizado_por) values ('carol_limite_diario', ${sql.json({ valor })}, ${por})
      on conflict (chave) do update set valor = excluded.valor, atualizado_por = excluded.atualizado_por
      returning (valor->>'valor')::int as valor, atualizado_em, atualizado_por`,
    false,
  );
  const l = comoLimite(r[0]);
  if (!l) throw new SheetsError("O banco não confirmou o novo limite. Tente de novo.", 502);
  return l;
}

/**
 * Saúde do número da Carol na Meta e o limite que vale agora (23/10/2026): jsonb de
 * atendimento.carol_saude_atual(), o mesmo que o Fluxo 1 usa. null se o banco não está configurado.
 */
export async function lerSaudeNumero(): Promise<unknown> {
  if (!getConfig().banco) return null;
  const r = await noBanco((sql) => sql<Registro[]>`select atendimento.carol_saude_atual() as s`);
  return r[0]?.s ?? null;
}

/** Funil de ativação de parceiros (30/10/2026): atendimento.funil_ativacao(dias). */
export async function lerFunilAtivacao(dias: number): Promise<FunilAtivacao> {
  if (!getConfig().banco) return { ...comoFunil({}, dias), disponivel: false };
  const linhas = await noBanco((sql) => sql<Registro[]>`select atendimento.funil_ativacao(${dias}::int) as j`);
  return comoFunil(linhas[0]?.j, dias);
}

/**
 * Fila do atendente (29/10/2026): quem está esperando alguém da equipe agora (Carol e Sofia),
 * de atendimento.fila_atendente(). Sem banco configurado, devolve a fila como indisponível.
 */
export async function lerFilaAtendente(): Promise<FilaAtendente> {
  if (!getConfig().banco) return { disponivel: false, equipeNoHorario: false, itens: [] };
  const [linhas, hora] = await Promise.all([
    noBanco((sql) => sql<Registro[]>`select * from atendimento.fila_atendente()`),
    noBanco((sql) => sql<Registro[]>`select atendimento.equipe_disponivel() as d`),
  ]);
  const itens = linhas.map(comoItemDaFila).filter((x): x is ItemFila => x !== null);
  return { disponivel: true, equipeNoHorario: hora[0]?.d === true, itens };
}
