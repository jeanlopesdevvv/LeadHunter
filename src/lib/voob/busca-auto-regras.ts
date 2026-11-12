/**
 * Busca automática da Voob (12/11/2026, pedido do Jean: "o mesmo sistema do Lavacar que enche a base sozinho nos dias
 * de disparo"). Funções puras: a busca recebe o Google, o Raio-X, o Voob CRM e a cota de fora (tests/busca-auto-voob.test.ts).
 *
 * Como decide (igual ao Lavacar, com o público da Voob):
 * - precisa = limite do dia × "fila_dias" − empresas prontas na base. Base cheia: não busca.
 * - O que buscar é o da última "Nova prospecção" (segmentos, termos a mais, cidade, bairros e "também site desatualizado").
 * - Primeiro cada termo na cidade inteira; depois bairro por bairro, só para o termo que veio "cheio" na cidade (o Google
 *   para em 60 por busca: veio cheio, tem mais para achar por bairro). Sem bairros escolhidos em BH, usa os 15 de sempre.
 * - O que já foi buscado nos últimos "refazer_dias" não é repetido (radar.busca_feitas).
 * - Entra na base: celular, aberto, do estado da busca, com nome, sem site ou só com rede social (e, se escolhido, site
 *   desatualizado pelo Raio-X), que não seja cliente, lead, conversa da Voob nem já esteja na base (conferido no CRM).
 * - Para no que vier primeiro: achou o que precisa, o máximo de consultas do dia, a cota do mês menos a reserva (sobra para
 *   a busca manual) ou acabaram as buscas.
 */

import type { RaioX } from "./raio-x-regras";
import { BAIRROS_BH, CIDADE_PADRAO, PAGINAS_POR_BUSCA, paraBase, resultadoDaBusca, situacaoDoSite, termosDosSegmentos } from "./regras";
import type { EntradaBase, EstadoBuscaAuto, FeitaBuscaVoob, PerfilBusca, ResultadoBusca, SituacaoConferida } from "./tipos";
import type { Lead, PageResult } from "@/lib/types";

/** Quando a rotina roda (o fluxo do n8n "Radar - Busca automática de leads", o mesmo do Lavacar). */
export const HORARIOS_ROTINA = "às 8h41 e às 13h41";

export const SEGMENTOS_PADRAO = ["clinicas", "imobiliarias", "servicos"];

/** Quantas empresas novas a base precisa agora (0 = já tem para os próximos dias). */
export function quantoPrecisa(e: Pick<EstadoBuscaAuto, "limite" | "base_pronta" | "config">): number {
  if (e.limite <= 0) return 0;
  return Math.max(0, e.limite * e.config.fila_dias - e.base_pronta);
}

/** Quantas consultas esta rodada pode gastar: o que sobrou do dia e da cota do mês (menos a reserva da busca manual). */
export function consultasPermitidas(e: Pick<EstadoBuscaAuto, "config" | "consultas_hoje">, cotaRestante: number | null): number {
  const doDia = Math.max(0, e.config.max_consultas_dia - e.consultas_hoje);
  const daCota = cotaRestante === null ? doDia : Math.max(0, cotaRestante - e.config.reserva_cota);
  return Math.min(doDia, daCota);
}

export interface UnidadeVoob {
  termo: string;
  lugar: string;
  /** 0 = cidade inteira; 1 = um bairro. */
  camada: 0 | 1;
}

export const chaveVoob = (u: { termo: string; lugar: string }) => `${u.termo.toLowerCase()}|${u.lugar.toLowerCase()}`;

const ehBH = (cidade: string) => /belo horizonte/i.test(cidade);

/**
 * Os públicos escolhidos. A Voob, de antes de 13/11 (sem o campo), usa os do começo; empresa nova (lista vazia) só busca o
 * que for escolhido nos Primeiros passos.
 */
export function segmentosDoPerfil(p: PerfilBusca | null | undefined): string[] {
  if (p?.segmentos === undefined && !p?.termos_extras?.length) return SEGMENTOS_PADRAO;
  return p?.segmentos ?? [];
}

/** O que buscar, na ordem: cada termo na cidade inteira; depois, termo por termo, bairro por bairro. */
export function unidadesDaBusca(perfil: PerfilBusca | null | undefined): UnidadeVoob[] {
  const p = perfil ?? {};
  const termos = termosDosSegmentos(segmentosDoPerfil(p), p.termos_extras ?? []);
  const cidade = (p.cidade ?? "").trim() || CIDADE_PADRAO;
  const bairros = p.bairros?.length ? p.bairros : ehBH(cidade) ? BAIRROS_BH : [];
  const lista: UnidadeVoob[] = termos.map((termo) => ({ termo, lugar: cidade, camada: 0 }));
  for (const termo of termos) for (const b of bairros) lista.push({ termo, lugar: `${b}, ${cidade}`, camada: 1 });
  return lista;
}

/** UF da busca ("Belo Horizonte, MG" → "MG"). */
export function ufDaCidade(cidade: string): string {
  const m = /,\s*([A-Za-z]{2})\s*$/.exec(cidade.trim());
  return m ? m[1].toUpperCase() : "";
}

/** Uma busca que chegou perto dos 60 resultados ainda tem mais para achar (vale ir bairro por bairro). */
export const CHEIA = PAGINAS_POR_BUSCA * 20 - 5;

export type DescarteVoob = "sem_celular" | "fechado" | "outro_estado" | "sem_nome" | "repetido" | "tem_site" | "site_em_dia" | "ja_da_voob";

/** O lead do Google serve para a base? (null = serve, por enquanto: o site e o CRM ainda são conferidos depois) */
export function descarte(l: Lead, uf: string, vistos: Set<string>): DescarteVoob | null {
  if (l.telefoneTipo !== "celular" || !l.telefoneKey) return "sem_celular";
  if (l.situacaoNegocio !== "OPERATIONAL") return "fechado";
  if (l.uf && uf && l.uf.toUpperCase() !== uf) return "outro_estado";
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(l.nome) || l.nome === "(sem nome)") return "sem_nome";
  if (vistos.has(l.telefoneKey)) return "repetido";
  return null;
}

export type MotivoFimVoob = "alvo" | "limite" | "cota" | "esgotado" | "erro" | "base_cheia" | "desligada" | "rodando" | "nao_e_dia";

export const MOTIVO_FIM_VOOB: Record<MotivoFimVoob, string> = {
  alvo: "achou o que a base precisava",
  limite: "chegou no máximo de consultas do dia",
  cota: "cota do mês do Google no limite (sobra a reserva para a busca manual)",
  esgotado: "já fez todas as buscas da configuração (elas voltam a valer depois de alguns dias)",
  erro: "erro no Google (configuração)",
  base_cheia: "a base já tinha empresas para os próximos dias",
  desligada: "busca automática desligada",
  rodando: "já tinha uma busca rodando",
  nao_e_dia: "hoje não é dia de disparo",
};

export interface ResultadoBuscaVoob {
  precisava: number;
  consultas: number;
  vistos: number;
  novos: number;
  adicionados: number;
  motivo: MotivoFimVoob;
  erro?: string;
  lugares: Record<string, { consultas: number; adicionados: number }>;
  descartes: Partial<Record<DescarteVoob, number>>;
}

export interface DependenciasVoob {
  /** Uma página do Google. Lança erro com `status` (503 = configuração, 429 = cota/limite). */
  pagina: (p: { textQuery: string; termo: string; cidade: string; pageToken?: string | null }) => Promise<PageResult>;
  /** Reserva uma consulta da cota do mês (false = acabou). */
  reservar: () => Promise<{ ok: boolean; concluir: (deuCerto: boolean) => void }>;
  /** Raio-X dos sites (mesma ordem). */
  raioX: (urls: string[]) => Promise<RaioX[]>;
  /** Confere no Voob CRM quem já é da Voob ou já está na base. */
  conferir: (telefones: string[]) => Promise<Map<string, SituacaoConferida>>;
  /** Grava na base; devolve quantos entraram. */
  gravar: (entradas: EntradaBase[]) => Promise<number>;
  /** Guarda uma busca terminada (termo em lugar). */
  feita: (u: UnidadeVoob, r: { consultas: number; vistos: number; novos: number; adicionados: number; cheia: boolean }) => Promise<void>;
}

/**
 * Faz a busca até achar `precisa` empresas novas ou acabar o que pode gastar (`maxConsultas`).
 * Grava o que achou em cada busca assim que ela termina (se a rodada parar no meio, o que achou já está na base).
 */
export async function executarBuscaVoob(
  e: Pick<EstadoBuscaAuto, "perfil" | "feitas">,
  precisa: number,
  maxConsultas: number,
  dep: DependenciasVoob,
): Promise<ResultadoBuscaVoob> {
  const r: ResultadoBuscaVoob = { precisava: precisa, consultas: 0, vistos: 0, novos: 0, adicionados: 0, motivo: "esgotado", lugares: {}, descartes: {} };
  const perfil = e.perfil ?? {};
  const comDesatualizado = perfil.com_desatualizado === true;
  // 13/11/2026: campanha que não liga para site ("tanto faz") põe quem tem site também, sem Raio-X.
  const tantoFaz = perfil.site === "tanto_faz" || perfil.so_sem_site === false;
  const uf = ufDaCidade((perfil.cidade ?? "").trim() || CIDADE_PADRAO);
  const feitas = new Map<string, FeitaBuscaVoob>(e.feitas.map((f) => [chaveVoob(f), f]));
  const unidades = unidadesDaBusca(perfil);
  const cidadeDe = new Map(unidades.filter((u) => u.camada === 0).map((u) => [u.termo, u.lugar]));
  const vistos = new Set<string>();
  const conta = (d: DescarteVoob, q = 1) => (r.descartes[d] = (r.descartes[d] ?? 0) + q);
  const noLugar = (l: string) => (r.lugares[l] ??= { consultas: 0, adicionados: 0 });

  for (const u of unidades) {
    if (r.adicionados >= precisa) { r.motivo = "alvo"; break; }
    if (r.consultas >= maxConsultas) { r.motivo = "limite"; break; }
    if (feitas.has(chaveVoob(u))) continue;
    if (u.camada === 1) {
      // Bairro só vale para o termo que veio cheio na cidade inteira (sem saber, não gasta).
      const daCidade = feitas.get(chaveVoob({ termo: u.termo, lugar: cidadeDe.get(u.termo) ?? "" }));
      if (!daCidade?.cheia) continue;
    }
    let token: string | null = null;
    let recebidos = 0, consultas = 0, vistosU = 0;
    let fatal = false;
    const candidatos: ResultadoBusca[] = [];
    const paraRaio: Lead[] = [];
    for (let pagina = 0; pagina < PAGINAS_POR_BUSCA; pagina++) {
      if (r.consultas >= maxConsultas) break;
      const reserva = await dep.reservar();
      if (!reserva.ok) { r.motivo = "cota"; fatal = true; break; }
      let res: PageResult;
      try {
        res = await dep.pagina({ textQuery: `${u.termo} em ${u.lugar}`, termo: u.termo, cidade: u.lugar, pageToken: token });
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
      noLugar(u.lugar).consultas++;
      recebidos += res.bruto;
      for (const l of res.leads) {
        vistosU++;
        const d = descarte(l, uf, vistos);
        if (d) { conta(d); continue; }
        vistos.add(l.telefoneKey);
        const site = situacaoDoSite(l.site);
        if (site === "com_site") {
          if (tantoFaz) candidatos.push(resultadoDaBusca(l, "novo"));
          else if (comDesatualizado) paraRaio.push(l);
          else conta("tem_site");
          continue;
        }
        candidatos.push(resultadoDaBusca(l, "novo"));
      }
      token = res.nextPageToken;
      if (!token) break;
    }
    if (fatal && !consultas) break;
    // Raio-X de quem tem site (só com "também site desatualizado"): entra só o desatualizado, com o que foi achado.
    if (paraRaio.length) {
      let exames: RaioX[] = [];
      try {
        exames = await dep.raioX(paraRaio.map((l) => l.site));
      } catch {
        exames = [];
      }
      paraRaio.forEach((l, i) => {
        const x = exames[i];
        if (x?.situacao === "desatualizado") {
          candidatos.push({ ...resultadoDaBusca(l, "novo"), siteSituacao: "desatualizado", raioX: "desatualizado", siteProblemas: x.textos });
        } else conta("site_em_dia");
      });
    }
    let novosU: ResultadoBusca[] = [];
    if (candidatos.length) {
      const conferidos = await dep.conferir(candidatos.map((c) => c.telefone));
      novosU = candidatos.filter((c) => (conferidos.get(c.telefone) ?? "novo") === "novo");
      conta("ja_da_voob", candidatos.length - novosU.length);
    }
    let entraram = 0;
    if (novosU.length) entraram = await dep.gravar(novosU.map(paraBase));
    r.vistos += vistosU;
    r.novos += novosU.length;
    r.adicionados += entraram;
    noLugar(u.lugar).adicionados += entraram;
    const cheia = recebidos >= CHEIA;
    // Só guarda a busca que foi até o fim (parada no meio, por limite ou cota, é refeita na próxima rodada).
    if (consultas && (!token || consultas >= PAGINAS_POR_BUSCA)) {
      await dep.feita(u, { consultas, vistos: vistosU, novos: novosU.length, adicionados: entraram, cheia });
      feitas.set(chaveVoob(u), { termo: u.termo, lugar: u.lugar, cheia, novos: novosU.length });
    }
    if (fatal) break;
  }
  if (r.motivo === "esgotado" && r.adicionados >= precisa) r.motivo = "alvo";
  return r;
}

/** Limite por dia: inteiro de 1 a 250 (o teto do Radar; a Meta começa em 250 conversas novas por dia). */
export function validarLimiteVoob(v: unknown): { ok: true; valor: number } | { ok: false; erro: string } {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return { ok: false, erro: "Digite um número inteiro de mensagens por dia." };
  if (n < 1) return { ok: false, erro: "O mínimo é 1 mensagem por dia." };
  if (n > 250) return { ok: false, erro: "O máximo é 250 por dia." };
  return { ok: true, valor: n };
}

/** Aviso antes de salvar um aumento grande de uma vez. */
export function avisoDoLimiteVoob(novo: number, atual: number): string | null {
  if (atual > 0 && novo > Math.ceil(atual * 1.5)) {
    return `Subir de ${atual} para ${novo} de uma vez é muito. Suba no máximo 50% por vez (até ${Math.ceil(atual * 1.5)}) e espere uns dias: muita gente bloqueando derruba a qualidade do número.`;
  }
  return null;
}

/** A qualidade da Meta em português. */
export function textoQualidade(q: string | null | undefined): string {
  const x = (q ?? "").toUpperCase();
  if (x === "GREEN" || x === "HIGH") return "verde (alta)";
  if (x === "YELLOW" || x === "MEDIUM") return "amarela (média)";
  if (x === "RED" || x === "LOW") return "vermelha (baixa)";
  if (x === "UNKNOWN" || x === "NA") return "ainda sem nota (número novo)";
  return x ? x.toLowerCase() : "sem leitura";
}

/** A situação do número na Meta em itens ("Conectado", "Nome aprovado"...). */
export function itensDaSituacaoVoob(l: { status: string | null; nome_status: string | null; pode_enviar: string | null } | null): { texto: string; ok: boolean }[] {
  if (!l) return [];
  const itens: { texto: string; ok: boolean }[] = [];
  const st = (l.status ?? "").toUpperCase();
  const ST: Record<string, [string, boolean]> = {
    CONNECTED: ["Conectado", true],
    FLAGGED: ["Sinalizado pela Meta", false],
    RESTRICTED: ["Restrito pela Meta", false],
    BANNED: ["Banido pela Meta", false],
    DISCONNECTED: ["Desconectado", false],
    PENDING: ["Esperando ativação", false],
    OFFLINE: ["Fora do ar", false],
  };
  if (st) itens.push(ST[st] ? { texto: ST[st][0], ok: ST[st][1] } : { texto: st.toLowerCase(), ok: false });
  const pode = (l.pode_enviar ?? "").toUpperCase();
  if (pode === "LIMITED") itens.push({ texto: "Envio limitado pela Meta", ok: false });
  if (pode === "BLOCKED") itens.push({ texto: "Envio bloqueado pela Meta", ok: false });
  const nome = (l.nome_status ?? "").toUpperCase();
  if (nome === "APPROVED" || nome === "AVAILABLE_WITHOUT_REVIEW") itens.push({ texto: "Nome de exibição aprovado", ok: true });
  else if (nome === "DECLINED" || nome === "EXPIRED") itens.push({ texto: "Nome de exibição recusado", ok: false });
  else if (nome === "PENDING_REVIEW" || nome === "PENDING") itens.push({ texto: "Nome de exibição em análise", ok: false });
  return itens;
}
