/**
 * Funil de ativação de parceiros (30/10/2026), lido de atendimento.funil_ativacao(dias).
 * Quem conversou com a Carol no período → recebeu o link de cadastro → criou a conta de parceiro
 * (mesmo número) → deixou o lava-jato pronto para clientes → teve o primeiro agendamento.
 * Cada etapa conta só quem passou pela anterior. Também mostra os lava-jatos novos que pararam no caminho.
 */

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export interface EtapaFunil {
  chave: string;
  rotulo: string;
  n: number;
}

export interface ParadoFunil {
  unidade: string;
  dias: number;
  pronto: boolean;
  agendamentos: number;
  falta: string;
  pelaCarol: boolean;
}

export interface FunilAtivacao {
  disponivel: boolean;
  dias: number;
  etapas: EtapaFunil[];
  contaSemLink: number;
  /** Conversaram com a Carol, mas o lava-jato já existia antes da conversa. */
  jaParceiros: number;
  cadastros: { total: number; prontos: number; comAgendamento: number; pelaCarol: number };
  parados: ParadoFunil[];
  geradoEm: string;
}

const inteiro = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};
const objeto = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** "30" → 30; qualquer outra coisa → 30. */
export function periodoValido(v: unknown): Periodo {
  const n = Number(v);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

/** jsonb do banco → funil (tolerante: campo que faltar vira zero ou lista vazia). */
export function comoFunil(bruto: unknown, dias: number): FunilAtivacao {
  const j = objeto(typeof bruto === "string" ? safeJson(bruto) : bruto);
  const etapas = (Array.isArray(j.etapas) ? j.etapas : []).map((e) => {
    const o = objeto(e);
    return { chave: String(o.chave ?? ""), rotulo: String(o.rotulo ?? "").trim(), n: inteiro(o.n) };
  }).filter((e) => e.chave && e.rotulo);
  const c = objeto(j.cadastros);
  const parados = (Array.isArray(j.parados) ? j.parados : []).map((p) => {
    const o = objeto(p);
    return {
      unidade: String(o.unidade ?? "").trim() || "(sem nome)",
      dias: Math.max(0, Math.round(Number(o.dias) || 0)),
      pronto: o.pronto === true,
      agendamentos: inteiro(o.agendamentos),
      falta: String(o.falta ?? "").trim(),
      pelaCarol: o.pela_carol === true,
    };
  });
  return {
    disponivel: true,
    dias: inteiro(j.dias) || dias,
    etapas,
    contaSemLink: inteiro(j.conta_sem_link),
    jaParceiros: inteiro(j.ja_parceiros),
    cadastros: { total: inteiro(c.total), prontos: inteiro(c.prontos), comAgendamento: inteiro(c.com_agendamento), pelaCarol: inteiro(c.pela_carol) },
    parados,
    geradoEm: String(j.gerado_em ?? ""),
  };
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

/** Porcentagem inteira de n sobre base; sem base, null (mostra "—"). */
export function taxa(n: number, base: number): number | null {
  if (!base) return null;
  return Math.round((n / base) * 100);
}
