/**
 * Tela "Disparo automático" (07/11/2026, pedido do Jean): o que vem de atendimento.disparo_painel(dias), já arrumado
 * para a tela, e as regras de texto (situação, mudanças). Funções puras (tests/automatico.test.ts).
 */

export const CHAVES_LIGAR = {
  disparo: "disparo_automatico",
  busca: "busca_auto",
  segundo: "disparo_segundo_contato",
} as const;
export type ChaveLigar = keyof typeof CHAVES_LIGAR;

export interface DiaEnvios {
  dia: string;
  enviados: number;
  segundos: number;
  responderam: number;
  saidas: number;
  erros: number;
}

export interface ModeloEnvios {
  modelo: string;
  segundo: boolean;
  enviados: number;
  responderam: number;
  saidas: number;
  link: number;
  conta: number;
  erros: number;
}

export interface Freio {
  motivo: string;
  nivel: string;
  texto: string;
}

export interface RodadaBusca {
  inicio: string;
  fim: string | null;
  origem: string;
  precisava: number;
  consultas: number;
  vistos: number;
  novos: number;
  adicionados: number;
  motivoFim: string;
  erro: string;
  cidades: { cidade: string; consultas: number; novos: number; adicionados: number }[];
}

export interface Mudanca {
  chave: string;
  texto: string;
  por: string;
  em: string;
}

export interface PainelAutomatico {
  disponivel: boolean;
  agora: string;
  dias: number;
  disparo: { ligado: boolean; inicio: string | null; rotacao: string[]; vizinho: string | null; cidades: string[] };
  segundoContato: { ligado: boolean; dias: number; peso: number; modelo: string | null };
  busca: {
    ligado: boolean;
    termos: string[];
    cidades: string[];
    filaDias: number;
    maxConsultasDia: number;
    reservaCota: number;
    consultasMes: number;
    adicionadosMes: number;
    cidadesFeitas: string[];
    ultimas: RodadaBusca[];
  };
  limite: number;
  /** Freio por saídas: acima desta % de "não quero receber" num dia, o disparo pausa. */
  freioSaidasPct: number;
  situacao: {
    limite: number;
    limiteConfigurado: number;
    enviadosHoje: number;
    freio: string;
    motivo: string;
    rotinaLiberada: boolean;
    freios: Freio[];
    saidasHoje: number;
    barradasHoje: number;
  };
  hoje: { enviados: number; segundos: number; responderam: number; saidas: number; erros: number; rotina: number; radar: number };
  periodo: { enviados: number; responderam: number; saidas: number; link: number; conta: number; erros: number; semWhatsapp: number; barradas: number };
  porDia: DiaEnvios[];
  modelos: ModeloEnvios[];
  fila: {
    novos: number;
    segundosNaFila: number;
    segundoProntos: number;
    segundo7Dias: number;
    segundoProximo: string | null;
    porCidade: { cidade: string; n: number }[];
    diasDeFila: number | null;
    removidos: number;
    semWhatsapp: number;
    optout: number;
  };
  freiosLog: { dia: string; motivo: string; nivel: string; detalhe: string }[];
  mudancas: Mudanca[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const n = (v: unknown, padrao = 0) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : padrao;
};
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const strs = (v: unknown) => arr(v).filter((x): x is string => typeof x === "string");

const lerJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

export function comoPainelAutomatico(v: unknown): PainelAutomatico {
  const j = obj(lerJson(v));
  const cfg = obj(j.config);
  const d = obj(cfg.disparo);
  const sc = obj(cfg.segundo_contato);
  const b = obj(cfg.busca);
  const sit = obj(j.situacao);
  const env = obj(j.envios);
  const hoje = obj(env.hoje);
  const per = obj(env.periodo);
  const fila = obj(j.fila);
  const fora = obj(fila.pendentes_fora);
  const busca = obj(j.busca);
  return {
    disponivel: Object.keys(j).length > 0,
    agora: s(j.agora),
    dias: n(j.dias, 14),
    disparo: {
      ligado: d.ligado === true,
      inicio: typeof d.inicio === "string" && d.inicio ? d.inicio : null,
      rotacao: strs(d.rotacao),
      vizinho: typeof d.vizinho === "string" && d.vizinho ? d.vizinho : null,
      cidades: strs(d.ordem_cidades),
    },
    segundoContato: {
      ligado: sc.ligado === true,
      dias: n(sc.dias, 30),
      peso: n(sc.peso, 0.3),
      modelo: typeof sc.modelo === "string" && sc.modelo ? sc.modelo : null,
    },
    busca: {
      ligado: b.ligado === true,
      termos: strs(b.termos),
      cidades: strs(b.cidades),
      filaDias: n(b.fila_dias, 3),
      maxConsultasDia: n(b.max_consultas_dia, 40),
      reservaCota: n(b.reserva_cota, 150),
      consultasMes: n(busca.consultas_mes),
      adicionadosMes: n(busca.adicionados_mes),
      cidadesFeitas: strs(busca.cidades_feitas),
      ultimas: arr(busca.ultimas).map((x) => {
        const r = obj(x);
        const cid = obj(r.cidades);
        return {
          inicio: s(r.inicio),
          fim: r.fim ? s(r.fim) : null,
          origem: s(r.origem),
          precisava: n(r.precisava),
          consultas: n(r.consultas),
          vistos: n(r.vistos),
          novos: n(r.novos),
          adicionados: n(r.adicionados),
          motivoFim: s(r.motivo_fim),
          erro: s(r.erro),
          cidades: Object.entries(cid)
            .map(([cidade, c]) => ({ cidade, consultas: n(obj(c).consultas), novos: n(obj(c).novos), adicionados: n(obj(c).adicionados) }))
            .sort((a, b2) => b2.adicionados - a.adicionados || b2.consultas - a.consultas),
        };
      }),
    },
    limite: n(cfg.limite),
    freioSaidasPct: n(obj(cfg.freios).saidas_pct, 8),
    situacao: {
      limite: n(sit.limite),
      limiteConfigurado: n(sit.limite_configurado),
      enviadosHoje: n(sit.enviados_hoje),
      freio: s(sit.freio) || "normal",
      motivo: s(sit.motivo),
      rotinaLiberada: sit.rotina_liberada === true,
      freios: arr(sit.freios).map((x) => ({ motivo: s(obj(x).motivo), nivel: s(obj(x).nivel), texto: s(obj(x).texto) })),
      saidasHoje: n(sit.saidas_hoje),
      barradasHoje: n(sit.barradas_hoje),
    },
    hoje: {
      enviados: n(hoje.enviados), segundos: n(hoje.segundos), responderam: n(hoje.responderam), saidas: n(hoje.saidas),
      erros: n(hoje.erros), rotina: n(hoje.rotina), radar: n(hoje.radar),
    },
    periodo: {
      enviados: n(per.enviados), responderam: n(per.responderam), saidas: n(per.saidas), link: n(per.link), conta: n(per.conta),
      erros: n(per.erros), semWhatsapp: n(per.sem_whatsapp), barradas: n(per.barradas),
    },
    porDia: arr(env.dias).map((x) => {
      const r = obj(x);
      return { dia: s(r.dia), enviados: n(r.enviados), segundos: n(r.segundos), responderam: n(r.responderam), saidas: n(r.saidas), erros: n(r.erros) };
    }),
    modelos: arr(env.modelos).map((x) => {
      const r = obj(x);
      return {
        modelo: s(r.modelo), segundo: r.segundo === true, enviados: n(r.enviados), responderam: n(r.responderam), saidas: n(r.saidas),
        link: n(r.link), conta: n(r.conta), erros: n(r.erros),
      };
    }),
    fila: {
      novos: n(fila.novos),
      segundosNaFila: n(fila.segundos_na_fila),
      segundoProntos: n(fila.segundo_prontos),
      segundo7Dias: n(fila.segundo_7dias),
      segundoProximo: typeof fila.segundo_proximo === "string" && fila.segundo_proximo ? fila.segundo_proximo : null,
      porCidade: arr(fila.por_cidade).map((x) => ({ cidade: s(obj(x).cidade), n: n(obj(x).n) })),
      diasDeFila: fila.dias_de_fila === null || fila.dias_de_fila === undefined ? null : n(fila.dias_de_fila),
      removidos: n(fora.removidos),
      semWhatsapp: n(fora.sem_whatsapp),
      optout: n(fora.optout),
    },
    freiosLog: arr(j.freios_log).map((x) => ({ dia: s(obj(x).dia), motivo: s(obj(x).motivo), nivel: s(obj(x).nivel), detalhe: s(obj(x).detalhe) })),
    mudancas: arr(j.mudancas)
      .map((x) => {
        const r = obj(x);
        return { chave: s(r.chave), texto: descreverMudanca(s(r.chave), r.antes, r.depois), por: s(r.por), em: s(r.em) };
      })
      .filter((m) => m.texto),
  };
}

const NOMES: Record<string, string> = {
  disparo_automatico: "Disparo automático",
  busca_auto: "Busca automática de leads",
  disparo_segundo_contato: "2º contato",
  disparo_freios: "Freios do disparo",
  carol_limite_diario: "Limite do dia",
};

/** O que mudou numa configuração, em uma frase. "" = nada que valha mostrar. */
export function descreverMudanca(chave: string, antes: unknown, depois: unknown): string {
  const a = obj(antes);
  const d = obj(depois);
  const nome = NOMES[chave] ?? chave;
  if (chave === "carol_limite_diario") {
    if (antes === null || antes === undefined) return `Limite do dia: ${n(d.valor)}`;
    return n(a.valor) === n(d.valor) ? "" : `Limite do dia: ${n(a.valor)} → ${n(d.valor)}`;
  }
  if ("ligado" in d && a.ligado !== d.ligado && (antes !== null && antes !== undefined)) {
    return d.ligado === true ? `${nome}: continuado` : `${nome}: pausado`;
  }
  if (antes === null || antes === undefined) return `${nome}: criado`;
  return JSON.stringify(a) === JSON.stringify(d) ? "" : `${nome}: configuração alterada`;
}

export type EstadoDisparo = "ligado" | "pausado" | "aguardando" | "freio" | "metade" | "sem_rodada";

const FERIADOS = new Set(["2026-11-02", "2026-11-15", "2026-11-20", "2026-12-24", "2026-12-25", "2026-12-31",
  "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26", "2027-04-21", "2027-05-01", "2027-05-27", "2027-09-07", "2027-10-12",
  "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-24", "2027-12-25", "2027-12-31"]);

/** Data (aaaa-mm-dd) e dia da semana (0 = domingo) em Brasília. */
export function hojeEmBrasilia(agora = new Date()): { dia: string; semana: number; minutos: number } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(agora)
      .map((x) => [x.type, x.value]),
  );
  const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { dia: `${p.year}-${p.month}-${p.day}`, semana, minutos: Number(p.hour) * 60 + Number(p.minute) };
}

/** Situação do disparo automático agora, para o selo e a frase do topo da tela. */
export function estadoDoDisparo(p: PainelAutomatico, agora = new Date()): { estado: EstadoDisparo; titulo: string; detalhe: string } {
  const h = hojeEmBrasilia(agora);
  const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  if (!p.disparo.ligado) return { estado: "pausado", titulo: "Pausado", detalhe: "Nenhuma rodada sai até alguém clicar em Continuar." };
  if (p.disparo.inicio && h.dia < p.disparo.inicio) {
    return { estado: "aguardando", titulo: `Começa em ${dataBr(p.disparo.inicio)}`, detalhe: "Ligado. A 1ª rodada sai às 9h07 do dia de início." };
  }
  if (p.situacao.freio === "pausado") {
    return { estado: "freio", titulo: "Parado pelo freio", detalhe: p.situacao.freios.map((f) => f.texto).join("; ") || p.situacao.motivo || "Um freio parou o disparo de hoje." };
  }
  const util = h.semana >= 1 && h.semana <= 5 && !FERIADOS.has(h.dia);
  if (!util) return { estado: "sem_rodada", titulo: "Ligado", detalhe: "Hoje não tem rodada (fim de semana ou feriado). Volta no próximo dia útil às 9h07." };
  if (p.situacao.freio === "metade") {
    return { estado: "metade", titulo: "Ligado, com metade do limite", detalhe: p.situacao.freios.map((f) => f.texto).join("; ") || p.situacao.motivo };
  }
  if (h.minutos > 16 * 60 + 45) return { estado: "ligado", titulo: "Ligado", detalhe: "As rodadas de hoje já terminaram. Amanhã (dia útil) começa às 9h07." };
  return { estado: "ligado", titulo: "Ligado", detalhe: "Rodadas de segunda a sexta, a cada 30 min (9h07 a 11h37 e 14h07 a 16h37)." };
}

export const taxa = (parte: number, total: number): number | null => (total > 0 ? Math.round((parte / total) * 1000) / 10 : null);

export const MOTIVO_BUSCA: Record<string, string> = {
  alvo: "achou o que a fila precisava",
  limite: "chegou no máximo de consultas do dia",
  cota: "cota do mês do Google no limite",
  esgotado: "buscou todas as cidades e termos",
  erro: "erro",
  interrompida: "interrompida (o Radar reiniciou)",
};
