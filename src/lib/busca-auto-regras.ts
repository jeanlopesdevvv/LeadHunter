/**
 * Busca automática de leads (07/11/2026, pedido do Jean): nos dias de disparo o Radar procura lava-jatos novos sozinho,
 * só o necessário para a fila do disparo automático não secar. Funções puras; a busca recebe as dependências
 * (Google, banco, cota) de fora, para dar para testar sem chamar nada de verdade (tests/busca-auto.test.ts).
 *
 * Como decide:
 * - precisa = limite do dia × "fila_dias" − novos que já estão na fila (atendimento.disparo_fila). Fila cheia: não busca.
 * - Vai cidade por cidade (ordem da configuração busca_auto: Belo Horizonte primeiro, depois a Grande BH, das mais
 *   perto para as mais longe). Cada busca é "termo em cidade" (até 3 páginas de 20). Se o Google devolve cerca de 60
 *   (cheia), divide o mapa da cidade em 4 e busca cada pedaço, até 3 vezes (64 pedaços).
 * - 07/11/2026 (pedido do Jean: "da melhor forma possível, priorizando BH"): dentro de cada cidade a busca vai por
 *   camadas (todos os termos na cidade inteira, depois os 4 pedaços, depois os 16...), cobrindo a cidade toda antes de
 *   ir fundo num canto só. Um pedaço só é dividido de novo se ainda rendeu leads novos (3 ou mais): onde quase tudo já
 *   está na lista, dividir só gastaria consulta. Categoria do Google que não é lavagem (estacionamento, oficina,
 *   autopeças...) fica de fora, a não ser que o nome diga que lava carro.
 * - O que já foi buscado nos últimos "refazer_dias" não é repetido (atendimento.busca_auto_feitas).
 * - Entra na lista só celular, estabelecimento aberto, de MG, com nome de verdade, fora do perfil fica de fora
 *   (lavanderia de roupa, estofados...) e quem já está na lista, conversou com a Carol/Sofia ou pediu para sair também.
 * - Para no que vier primeiro: achou o que precisa, "max_consultas_dia" (somando as rodadas do dia), a cota do mês menos
 *   a "reserva_cota" (sobra para a busca manual), ou acabaram as buscas.
 */

import { MAX_DIVISOES, PAGINAS_POR_CONSULTA, LUGARES_POR_PAGINA, splitRect } from "./geo";
import type { Lead, PageResult, Rect } from "./types";

export interface ConfigBuscaAuto {
  ligado: boolean;
  termos: string[];
  cidades: string[];
  filaDias: number;
  maxConsultasDia: number;
  reservaCota: number;
  refazerDias: number;
  uf: string;
}

export interface FeitaBuscaAuto {
  termo: string;
  cidade: string;
  area: string;
  cheia: boolean;
  /** Leads novos que essa busca rendeu (decide se vale dividir de novo). */
  novos?: number;
}

export interface EstadoBuscaAuto {
  config: ConfigBuscaAuto;
  limite: number;
  filaNovos: number;
  consultasHoje: number;
  consultasMes: number;
  rodando: boolean;
  feitas: FeitaBuscaAuto[];
}

const num = (v: unknown, padrao: number, min = 0, max = 100_000) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : padrao;
};
const lista = (v: unknown, max: number) =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, max) : [];

export function comoConfigBusca(v: unknown): ConfigBuscaAuto {
  const c = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    ligado: c.ligado === true,
    termos: lista(c.termos, 10),
    cidades: lista(c.cidades, 80),
    filaDias: num(c.fila_dias, 3, 1, 15),
    maxConsultasDia: num(c.max_consultas_dia, 40, 0, 300),
    reservaCota: num(c.reserva_cota, 150, 0, 1000),
    refazerDias: num(c.refazer_dias, 90, 1, 365),
    uf: typeof c.uf === "string" && /^[A-Za-z]{2}$/.test(c.uf) ? c.uf.toUpperCase() : "MG",
  };
}

export function comoEstadoBusca(v: unknown): EstadoBuscaAuto {
  let x = v;
  if (typeof x === "string") {
    try {
      x = JSON.parse(x);
    } catch {
      x = null;
    }
  }
  const e = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const feitas = Array.isArray(e.feitas)
    ? e.feitas
        .map((f) => f as Record<string, unknown>)
        .filter((f) => typeof f.termo === "string" && typeof f.cidade === "string")
        .map((f) => ({ termo: String(f.termo), cidade: String(f.cidade), area: String(f.area ?? ""), cheia: f.cheia === true, novos: Number(f.novos ?? 99) || 0 }))
    : [];
  return {
    config: comoConfigBusca(e.config),
    limite: num(e.limite, 0, 0, 10_000),
    filaNovos: num(e.fila_novos, 0, 0, 1_000_000),
    consultasHoje: num(e.consultas_hoje, 0, 0, 1_000_000),
    consultasMes: num(e.consultas_mes, 0, 0, 1_000_000),
    rodando: e.rodando === true,
    feitas,
  };
}

/** Quantos leads novos a busca precisa achar agora (0 = a fila já dá para os próximos dias). */
export function quantoPrecisa(e: EstadoBuscaAuto): number {
  if (e.limite <= 0) return 0;
  return Math.max(0, e.limite * e.config.filaDias - e.filaNovos);
}

/** Quantas consultas esta rodada pode gastar: o que sobrou do dia e da cota do mês (menos a reserva da busca manual). */
export function consultasPermitidas(e: EstadoBuscaAuto, cotaRestante: number | null): number {
  const doDia = Math.max(0, e.config.maxConsultasDia - e.consultasHoje);
  const daCota = cotaRestante === null ? doDia : Math.max(0, cotaRestante - e.config.reservaCota);
  return Math.min(doDia, daCota);
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mesma regra de atendimento.lead_fora_do_perfil e do Fluxo 1: não é lavagem de carro. */
export function foraDoPerfil(nome: string): boolean {
  const n = semAcento(nome);
  return (
    /(lavanderia|estofad|\bsofas?\b|tapete|colchao|roupa|impermeabiliza|carpete|dedetiza|piscina)/.test(n) &&
    !/(automotiv|carro|veicul|lava ?-?jato|lava ?-?rapido|car ?wash|polimento|estetica auto)/.test(n)
  );
}

export type MotivoDescarte = "sem_celular" | "fechado" | "outro_estado" | "fora_do_perfil" | "sem_nome" | "ja_na_lista" | "repetido";

/** O lead serve para a fila do disparo? (null = serve) */
/** Categoria do Google que não é lavagem de carro, quando o nome também não diz que lava (ex.: "Estacionamento Central"). */
export function categoriaFora(categoria: string, nome: string): boolean {
  const c = semAcento(categoria || "");
  if (!c) return false;
  const fora = /(estacionamento|autope|pecas|concession|pneu|borrachar|funilar|mecanic|oficina|locadora|seguro|despachante|vidrac|som automotivo|insulfilm|auto ?escola|guincho|posto de (gasolina|combust)|loja de)/.test(c);
  return fora && !/(lava|jato|wash|estetica|polimento|higieniz|detail|limpeza|lavagem)/.test(semAcento(nome));
}

export function motivoDescarte(l: Lead, uf: string, existentes: Set<string>, vistos: Set<string>): MotivoDescarte | null {
  if (l.telefoneTipo !== "celular" || !l.telefoneKey) return "sem_celular";
  if (l.situacaoNegocio && l.situacaoNegocio !== "OPERATIONAL") return "fechado";
  if (l.uf && uf && l.uf.toUpperCase() !== uf) return "outro_estado";
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(l.nome) || l.nome === "(sem nome)") return "sem_nome";
  if (foraDoPerfil(l.nome) || categoriaFora(l.categoria, l.nome)) return "fora_do_perfil";
  if (existentes.has(l.telefoneKey)) return "ja_na_lista";
  if (vistos.has(l.telefoneKey)) return "repetido";
  return null;
}

export interface UnidadeBusca {
  termo: string;
  cidade: string;
  /** "" = cidade inteira; "2" = 2º pedaço; "2.3" = 3º pedaço do 2º pedaço. */
  area: string;
  nivel: number;
}

/** Um pedaço cheio só é dividido de novo se ainda rendeu pelo menos isso de leads novos (a cidade inteira sempre divide). */
export const MIN_NOVOS_PARA_DIVIDIR = 3;
export const vaiDividir = (nivel: number, cheia: boolean, novos: number) => cheia && (nivel === 0 || novos >= MIN_NOVOS_PARA_DIVIDIR);

export const chaveUnidade = (u: { termo: string; cidade: string; area: string }) => `${u.cidade.toLowerCase()}|${u.termo.toLowerCase()}|${u.area}`;

/** Retângulo de um pedaço do mapa a partir do contorno da cidade ("" = cidade inteira, sem retângulo). */
export function retanguloDaArea(cidade: Rect | null, area: string): Rect | undefined | null {
  if (!area) return undefined;
  if (!cidade) return null;
  let r: Rect = cidade;
  for (const parte of area.split(".")) {
    const i = Number(parte);
    if (!Number.isInteger(i) || i < 1 || i > 4) return null;
    r = splitRect(r, 2)[i - 1];
  }
  return r;
}

export function filhas(u: UnidadeBusca): UnidadeBusca[] {
  if (u.nivel >= MAX_DIVISOES) return [];
  return [1, 2, 3, 4].map((i) => ({ termo: u.termo, cidade: u.cidade, area: u.area ? `${u.area}.${i}` : String(i), nivel: u.nivel + 1 }));
}

/** Uma busca que chegou perto dos 60 resultados ainda tem mais para achar (divide o mapa). */
export const CHEIA = PAGINAS_POR_CONSULTA * LUGARES_POR_PAGINA - 5;

export type MotivoFimBusca = "alvo" | "limite" | "cota" | "esgotado" | "erro" | "fila_cheia" | "desligada" | "rodando";

export interface ResultadoBuscaAuto {
  precisava: number;
  consultas: number;
  vistos: number;
  novos: number;
  adicionados: number;
  motivo: MotivoFimBusca;
  erro?: string;
  cidades: Record<string, { consultas: number; novos: number; adicionados: number }>;
  descartes: Partial<Record<MotivoDescarte, number>>;
}

export interface DependenciasBusca {
  /** Contorno da cidade (para dividir o mapa); null = não achou. */
  area: (cidade: string) => Promise<Rect | null>;
  /** Uma página do Google. Lança erro com `status` (503 = configuração, 429 = cota/limite). */
  pagina: (p: { textQuery: string; termo: string; cidade: string; rect?: Rect; pageToken?: string | null }) => Promise<PageResult>;
  /** Reserva uma consulta da cota do mês (false = acabou). */
  reservar: () => Promise<{ ok: boolean; concluir: (deuCerto: boolean) => void }>;
  /** Telefones (chave) que já estão na lista, nos históricos ou pediram para sair. */
  existentes: () => Promise<Set<string>>;
  /** Grava os leads novos como "pendente"; devolve quantos entraram de fato. */
  gravar: (leads: Lead[]) => Promise<number>;
  /** Guarda uma busca terminada (termo × cidade × pedaço). */
  feita: (u: UnidadeBusca, r: { consultas: number; vistos: number; novos: number; cheia: boolean }) => Promise<void>;
}

/**
 * Faz a busca até achar `precisa` leads novos ou acabar o que pode gastar (`maxConsultas`).
 * Grava os leads de cada busca assim que ela termina (se a rodada parar no meio, o que achou já está na lista).
 */
export async function executarBuscaAuto(
  e: EstadoBuscaAuto,
  precisa: number,
  maxConsultas: number,
  dep: DependenciasBusca,
): Promise<ResultadoBuscaAuto> {
  const r: ResultadoBuscaAuto = { precisava: precisa, consultas: 0, vistos: 0, novos: 0, adicionados: 0, motivo: "esgotado", cidades: {}, descartes: {} };
  const cfg = e.config;
  const feitas = new Map(e.feitas.map((f) => [chaveUnidade(f), f]));
  const fila: UnidadeBusca[] = [];
  for (const cidade of cfg.cidades) for (const termo of cfg.termos) fila.push({ termo, cidade, area: "", nivel: 0 });
  // Ordem: cidade (da configuração) → camada (cidade inteira, 4 pedaços, 16...) → termo → pedaço.
  const posCidade = new Map(cfg.cidades.map((c, i) => [c, i]));
  const posTermo = new Map(cfg.termos.map((t, i) => [t, i]));
  const ordem = (a: UnidadeBusca, b: UnidadeBusca) =>
    (posCidade.get(a.cidade) ?? 999) - (posCidade.get(b.cidade) ?? 999) || a.nivel - b.nivel ||
    (posTermo.get(a.termo) ?? 999) - (posTermo.get(b.termo) ?? 999) || (a.area < b.area ? -1 : a.area > b.area ? 1 : 0);
  const enfileirar = (us: UnidadeBusca[]) => {
    fila.push(...us);
    fila.sort(ordem);
  };
  const contornos = new Map<string, Rect | null>();
  const contorno = async (cidade: string) => {
    if (!contornos.has(cidade)) {
      let a: Rect | null = null;
      try {
        a = await dep.area(cidade);
      } catch {
        a = null;
      }
      contornos.set(cidade, a);
    }
    return contornos.get(cidade) ?? null;
  };
  const existentes = await dep.existentes();
  const vistos = new Set<string>();
  const porCidade = (c: string) => (r.cidades[c] ??= { consultas: 0, novos: 0, adicionados: 0 });

  while (fila.length) {
    if (r.adicionados >= precisa) { r.motivo = "alvo"; break; }
    if (r.consultas >= maxConsultas) { r.motivo = "limite"; break; }
    const u = fila.shift()!;
    const ja = feitas.get(chaveUnidade(u));
    if (ja) {
      if (vaiDividir(u.nivel, ja.cheia, ja.novos ?? 99) && (await contorno(u.cidade))) enfileirar(filhas(u));
      continue;
    }
    const rect = retanguloDaArea(await contorno(u.cidade), u.area);
    if (rect === null) continue; // pedaço sem contorno da cidade: não dá para buscar
    const textQuery = u.area ? u.termo : `${u.termo} em ${u.cidade}`;
    let token: string | null = null;
    let recebidos = 0, consultas = 0, vistosU = 0;
    const novosU: Lead[] = [];
    let fatal = false;
    for (let pagina = 0; pagina < PAGINAS_POR_CONSULTA; pagina++) {
      if (r.consultas >= maxConsultas) break;
      const reserva = await dep.reservar();
      if (!reserva.ok) { r.motivo = "cota"; fatal = true; break; }
      let res: PageResult;
      try {
        res = await dep.pagina({ textQuery, termo: u.termo, cidade: u.cidade, rect, pageToken: token });
        reserva.concluir(true);
      } catch (err) {
        reserva.concluir(false);
        const status = (err as { status?: number }).status ?? 0;
        if (status === 503 || status === 401 || status === 429) {
          r.motivo = status === 429 ? "cota" : "erro";
          r.erro = (err as Error).message;
          fatal = true;
        }
        break; // erro passageiro: segue para a próxima busca
      }
      consultas++;
      r.consultas++;
      porCidade(u.cidade).consultas++;
      recebidos += res.bruto;
      for (const l of res.leads) {
        vistosU++;
        const motivo = motivoDescarte(l, cfg.uf, existentes, vistos);
        if (motivo) { r.descartes[motivo] = (r.descartes[motivo] ?? 0) + 1; continue; }
        vistos.add(l.telefoneKey);
        novosU.push(l);
      }
      token = res.nextPageToken;
      if (!token) break;
    }
    if (fatal && !consultas) break;
    r.vistos += vistosU;
    r.novos += novosU.length;
    porCidade(u.cidade).novos += novosU.length;
    if (novosU.length) {
      const entraram = await dep.gravar(novosU);
      r.adicionados += entraram;
      porCidade(u.cidade).adicionados += entraram;
    }
    const cheia = recebidos >= CHEIA;
    // Só guarda a busca que foi até o fim (uma parada no meio, por limite ou cota, é refeita na próxima rodada).
    if (consultas && (!token || consultas >= PAGINAS_POR_CONSULTA)) {
      await dep.feita(u, { consultas, vistos: vistosU, novos: novosU.length, cheia });
      feitas.set(chaveUnidade(u), { ...u, cheia, novos: novosU.length });
      if (vaiDividir(u.nivel, cheia, novosU.length) && (await contorno(u.cidade))) enfileirar(filhas(u));
    }
    if (fatal) break;
  }
  if (r.motivo === "esgotado" && r.adicionados >= precisa) r.motivo = "alvo";
  return r;
}

export const MOTIVO_FIM_TEXTO: Record<MotivoFimBusca, string> = {
  alvo: "achou o que a fila precisava",
  limite: "chegou no máximo de consultas do dia",
  cota: "cota do mês do Google no limite (sobra a reserva para a busca manual)",
  esgotado: "já buscou todas as cidades e termos da configuração",
  erro: "erro no Google (configuração)",
  fila_cheia: "a fila já tinha leads para os próximos dias",
  desligada: "busca automática desligada",
  rodando: "já tinha uma busca rodando",
};
