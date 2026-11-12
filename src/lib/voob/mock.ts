import "server-only";

import { placeToLead, type GooglePlace } from "@/lib/places";
import type { PageResult } from "@/lib/types";

import { SERVE_PARA_ABERTURA } from "./regras";
import type {
  AcaoBase,
  ConfigVoob,
  DiaPainel,
  EmpresaConfig,
  EntradaBase,
  LeadBase,
  ListaBase,
  NumeroProspeccao,
  PainelVoob,
  RespostaInsercao,
  SituacaoConferida,
  StatusLead,
} from "./tipos";

/**
 * Simulação do motor da Voob (MOCK_MODE=1, só fora de produção): o mesmo comportamento das funções radar.* do
 * Voob CRM, na memória, para ver e clicar nas telas sem banco. Dois cenários (VOOB_MOCK_CENARIO):
 * - "hoje" (padrão): como está agora, sem número de prospecção e com uma base pequena;
 * - "rodando": número conectado, mensagem aprovada e duas semanas de envios.
 */

interface Estado {
  empresa: EmpresaConfig;
  numero: NumeroProspeccao | null;
  modeloOk: boolean;
  leads: LeadBase[];
  enviadosHoje: number;
}

const g = globalThis as unknown as { __radarVoobMock?: Estado };

function semente(n: number) {
  let s = n % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const NOMES = [
  ["Clínica Bem Estar", "Clínica de estética", "clínica de estética"],
  ["Odonto Sorriso Leve", "Dentista", "clínica odontológica"],
  ["Studio Bella Sobrancelhas", "Estúdio de sobrancelha", "estúdio de sobrancelha"],
  ["Imobiliária Casa Mineira", "Imobiliária", "imobiliária"],
  ["Barbearia do Léo", "Barbearia", "barbearia"],
  ["Fisio Movimento", "Fisioterapeuta", "fisioterapia"],
  ["Pet Shop Patinhas", "Pet shop", "pet shop"],
  ["Nutri Ana Clara", "Nutricionista", "nutricionista"],
  ["Esmalteria Charme", "Manicure", "esmalteria"],
  ["Contabilidade Horizonte", "Contador", "contabilidade"],
  ["Dedetizadora Lar Seguro", "Dedetizadora", "dedetizadora"],
  ["Psicóloga Marina Reis", "Psicólogo", "psicólogo"],
  ["Salão Glamour", "Salão de beleza", "salão de beleza"],
  ["Corretor Paulo Imóveis", "Corretor de imóveis", "corretor de imóveis"],
  ["Advocacia Lima & Souza", "Advogado", "advogado"],
  ["Autoescola Pampulha", "Autoescola", "autoescola"],
  ["Assistência TecCel", "Assistência técnica", "assistência técnica"],
  ["Estética Renove", "Clínica de estética", "clínica de estética"],
  ["Sorrir Odontologia", "Dentista", "clínica odontológica"],
  ["Barber King", "Barbearia", "barbearia"],
];
const BAIRROS = ["Savassi", "Funcionários", "Lourdes", "Centro", "Buritis", "Castelo", "Pampulha", "Sion", "Floresta", "Prado"];

const iso = (ms: number) => new Date(ms).toISOString();
const DIA = 86_400_000;

function leadFalso(i: number, r: () => number, agora: number): LeadBase {
  const [nome, categoria, termo] = NOMES[i % NOMES.length];
  const sufixo = i >= NOMES.length ? ` ${BAIRROS[i % BAIRROS.length]}` : "";
  const sit = r() < 0.55 ? "sem_site" : r() < 0.75 ? "rede_social" : "com_site";
  const criado = agora - Math.floor(r() * 9) * DIA - Math.floor(r() * 8) * 3600e3;
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    telefone: `+55319${String(80000000 + i * 7919).slice(0, 8)}`,
    negocio: nome + sufixo,
    categoria,
    termo,
    cidade: "Belo Horizonte",
    uf: "MG",
    bairro: BAIRROS[(i * 3) % BAIRROS.length],
    endereco: "",
    site_url: sit === "rede_social" ? `https://instagram.com/${nome.toLowerCase().replace(/[^a-z]/g, "")}` : sit === "com_site" ? "https://exemplo.com.br" : null,
    site_situacao: sit,
    nota: Math.round((3.8 + r() * 1.2) * 10) / 10,
    avaliacoes: Math.floor(r() * 180),
    maps_url: "https://maps.google.com/",
    status: "novo",
    motivo: null,
    prioridade: 0,
    na_fila_em: null,
    enviado_em: null,
    retomada_em: null,
    respondeu_em: null,
    saiu_em: null,
    crm_lead_id: null,
    created_at: iso(criado),
    atualizado: iso(criado),
    sai_em: null,
  };
}

function empresaPadrao(): EmpresaConfig {
  return {
    id: "voob",
    nome: "Voob",
    agente: "Renata",
    ligado: false,
    ligado_em: null,
    pausado_em: null,
    pausado_motivo: null,
    limite_dia: 20,
    dias: [1, 2, 3, 4, 5],
    hora_inicio: "09:00",
    hora_fim: "18:00",
    intervalo_min: 4,
    situacoes_site: ["sem_site", "rede_social"],
    modelo_prefixo: "radar_voob_abertura",
    modelo_prefixo_site: "radar_voob_site",
    retomada_ligada: false,
    retomada_prefixo: "radar_voob_retomada",
    retomada_dias: 3,
    botao_sim: "Quero ver",
    botao_nao: "Não tenho interesse",
    freio_saidas_pct: 8,
    freio_minimo: 10,
    perfil: { cidade: "Belo Horizonte, MG", segmentos: ["clinicas", "imobiliarias", "servicos"], so_sem_site: true },
    atualizado_por: null,
    updated_at: iso(Date.now()),
  };
}

const NUMERO: NumeroProspeccao = {
  id: "c0000000-0000-4000-8000-000000000001",
  nome: "Voob Prospecção",
  crm: "Voob Prospecção",
  final: "4521",
  status: "conectado",
  conectado: true,
  qualidade: "GREEN",
  qualidade_ruim: false,
  teste: false,
  teste_qtd: 0,
  criar_leads: true,
  etapa: "Respondeu abordagem",
  ia_ativa: true,
  pagamento: "ok",
  nome_meta: "Renata da Voob",
  nome_meta_status: "APPROVED",
};

function estado(): Estado {
  if (g.__radarVoobMock) return g.__radarVoobMock;
  const agora = Date.now();
  const r = semente(20261112);
  const rodando = process.env.VOOB_MOCK_CENARIO === "rodando";
  const leads = Array.from({ length: rodando ? 300 : 34 }, (_, i) => leadFalso(i, r, agora));
  const e: Estado = { empresa: empresaPadrao(), numero: rodando ? NUMERO : null, modeloOk: rodando, leads, enviadosHoje: 0 };
  if (rodando) {
    e.empresa.ligado = true;
    e.empresa.ligado_em = iso(agora - 9 * DIA);
    // 10 dias úteis de envios, 20 por dia (o que coube), com respostas.
    let k = 0;
    for (let d = 13; d >= 0 && k < leads.length; d--) {
      const dia = new Date(agora - d * DIA);
      const semana = dia.getUTCDay();
      if (semana === 0 || semana === 6) continue;
      const nDia = d === 0 ? 9 : 20;
      for (let j = 0; j < nDia && k < leads.length; j++, k++) {
        const l = leads[k];
        if (!SERVE_PARA_ABERTURA.includes(l.site_situacao)) continue;
        const quando = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 12) + j * 4 * 60_000;
        l.status = "enviado";
        l.enviado_em = iso(quando);
        const x = r();
        if (x < 0.09) Object.assign(l, { status: "interessado", respondeu_em: iso(quando + 40 * 60_000), crm_lead_id: "crm" });
        else if (x < 0.2) Object.assign(l, { status: "respondeu", respondeu_em: iso(quando + 90 * 60_000), crm_lead_id: "crm" });
        else if (x < 0.27) Object.assign(l, { status: "sem_interesse", respondeu_em: iso(quando + 20 * 60_000), crm_lead_id: "crm" });
        else if (x < 0.29) Object.assign(l, { status: "parou", respondeu_em: iso(quando + 10 * 60_000), saiu_em: iso(quando + 10 * 60_000) });
        l.atualizado = l.respondeu_em ?? l.enviado_em ?? l.atualizado;
        if (d === 0) e.enviadosHoje++;
      }
    }
    // A fila de hoje: o que falta para os 20.
    leads
      .filter((l) => l.status === "novo" && SERVE_PARA_ABERTURA.includes(l.site_situacao))
      .slice(0, 20 - e.enviadosHoje)
      .forEach((l, i) => Object.assign(l, { status: "na_fila", na_fila_em: iso(agora - 3600e3), sai_em: iso(agora + (i + 1) * 4 * 60_000) }));
  }
  g.__radarVoobMock = e;
  return e;
}

function contagem(leads: LeadBase[]): Partial<Record<StatusLead, number>> {
  const c: Partial<Record<StatusLead, number>> = {};
  for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
  return c;
}

const proximaAbertura = (e: EmpresaConfig) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + (d.getUTCHours() >= 21 ? 1 : 0));
  d.setUTCHours(Number(e.hora_inicio.slice(0, 2)) + 3, 0, 0, 0);
  while (!e.dias.includes(((d.getUTCDay() + 6) % 7) + 1)) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime() < Date.now() ? iso(Date.now()) : iso(d.getTime());
};

export function config(): ConfigVoob {
  const e = estado();
  const naFila = e.leads.filter((l) => l.status === "na_fila").length;
  const pronta = e.leads.filter((l) => l.status === "novo" && e.empresa.situacoes_site.includes(l.site_situacao)).length;
  const prox = proximaAbertura(e.empresa);
  const modelo = e.numero ? { ok: e.modeloOk, motivo: e.modeloOk ? null : "aviso_sem_modelo", nome: e.modeloOk ? "radar_voob_abertura_v1" : null, categoria: e.modeloOk ? "MARKETING" : null } : null;
  return {
    empresa: { ...e.empresa },
    numero: e.numero,
    numeros_disponiveis: e.numero ? [{ id: NUMERO.id, nome: NUMERO.nome, final: NUMERO.final, crm: "Voob Prospecção", status: "conectado" }] : [],
    modelos: {
      abertura: modelo,
      retomada: e.numero ? { ok: false, motivo: "aviso_sem_modelo", nome: null, categoria: null } : null,
      site: e.numero ? { ok: false, motivo: "aviso_sem_modelo", nome: null, categoria: null } : null,
    },
    hoje: {
      enviados: e.enviadosHoje,
      na_fila: naFila,
      limite: e.empresa.limite_dia,
      limite_efetivo: e.empresa.limite_dia,
      restantes: Math.max(0, e.empresa.limite_dia - e.enviadosHoje - naFila),
      saidas: 0,
      saidas_desde_ligado: 0,
      enviados_desde_ligado: e.enviadosHoje,
      proxima_abertura: prox,
      no_horario: new Date(prox).getTime() <= Date.now(),
    },
    base: contagem(e.leads),
    base_pronta: pronta,
    simulacao: true,
    prontidao: [
      { id: "numero", ok: Boolean(e.numero), texto: "Número da prospecção escolhido" },
      { id: "conectado", ok: Boolean(e.numero?.conectado), texto: "Número conectado" },
      { id: "modelo", ok: Boolean(e.numero) && e.modeloOk, texto: "Primeira mensagem aprovada pela Meta" },
      { id: "base", ok: pronta > 0, texto: "Empresas na base para chamar" },
      { id: "ligado", ok: e.empresa.ligado, texto: "Radar ligado" },
    ],
  };
}

const CHAVES = new Set(["limite_dia", "dias", "hora_inicio", "hora_fim", "intervalo_min", "situacoes_site", "modelo_prefixo", "retomada_ligada",
  "retomada_prefixo", "retomada_dias", "botao_sim", "botao_nao", "freio_saidas_pct", "freio_minimo", "perfil", "canal_id", "agente"]);

export function definir(m: Record<string, unknown>): ConfigVoob {
  const e = estado();
  for (const k of Object.keys(m)) if (!CHAVES.has(k)) throw Object.assign(new Error(`Campo desconhecido: ${k}.`), { code: "P0001" });
  if ("canal_id" in m && e.empresa.ligado) throw Object.assign(new Error("Desligue o Radar antes de trocar o número."), { code: "P0001" });
  const { canal_id, ...resto } = m;
  if (canal_id !== undefined) e.numero = canal_id ? NUMERO : null;
  Object.assign(e.empresa, resto, { updated_at: iso(Date.now()), atualizado_por: "Radar" });
  return config();
}

export function ligar(ligado: boolean): ConfigVoob {
  const e = estado();
  if (ligado && !e.numero) throw Object.assign(new Error("Falta escolher o número da prospecção."), { code: "P0001" });
  e.empresa.ligado = ligado;
  if (ligado) Object.assign(e.empresa, { ligado_em: iso(Date.now()), pausado_em: null, pausado_motivo: null });
  else {
    Object.assign(e.empresa, { pausado_em: iso(Date.now()), pausado_motivo: "manual" });
    for (const l of e.leads) if (l.status === "na_fila") Object.assign(l, { status: "novo", motivo: "radar_pausado", sai_em: null });
  }
  return config();
}

const chave = (tel: string) => {
  const d = tel.replace(/\D/g, "").replace(/^55/, "");
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : "";
};

export function conferir(telefones: string[]): { telefone: string; situacao: SituacaoConferida }[] {
  const e = estado();
  const naBase = new Map(e.leads.map((l) => [chave(l.telefone), l.status]));
  return telefones.map((t) => {
    const k = chave(t);
    if (!k) return { telefone: t, situacao: "invalido" };
    const st = naBase.get(k);
    if (st) return { telefone: t, situacao: `base:${st}` as SituacaoConferida };
    const n = Number(k.slice(-2));
    return { telefone: t, situacao: n % 17 === 0 ? "ja_no_crm" : n % 23 === 0 ? "ja_conversa" : "novo" };
  });
}

export function inserir(entrada: EntradaBase[]): RespostaInsercao {
  const e = estado();
  const c: Record<string, number> = {};
  // Um por vez, como no banco: o segundo igual do mesmo lote já encontra o primeiro na base.
  const itens = entrada.map((l) => {
    const x = conferir([l.telefone])[0];
    const digitos = l.telefone.replace(/\D/g, "");
    let resultado: RespostaInsercao["itens"][number]["resultado"] =
      x.situacao === "novo" ? "novo" : x.situacao.startsWith("base:") ? "repetido" : (x.situacao as "ja_no_crm" | "ja_conversa" | "invalido");
    if (resultado === "novo" && !/^(55)?\d{2}9\d{8}$/.test(digitos)) resultado = "nao_e_celular";
    if (resultado === "novo") {
      const agora = iso(Date.now());
      e.leads.push({
        ...leadFalso(e.leads.length + 1000, semente(e.leads.length + 7), Date.now()),
        id: crypto.randomUUID(),
        telefone: `+${digitos.startsWith("55") ? digitos : `55${digitos}`}`,
        negocio: l.negocio,
        categoria: l.categoria ?? null,
        termo: l.termo ?? null,
        bairro: l.bairro ?? null,
        site_url: l.site_url ?? null,
        site_situacao: l.site_situacao,
        site_problemas: l.site_problemas ?? null,
        nota: l.nota ?? null,
        avaliacoes: l.avaliacoes ?? null,
        created_at: agora,
        atualizado: agora,
      });
    }
    c[resultado] = (c[resultado] ?? 0) + 1;
    return { telefone: x.telefone, resultado };
  });
  return { contagem: c, itens };
}

const ORDEM: Record<string, number> = { interessado: 0, respondeu: 1, na_fila: 2, novo: 3, enviado: 4, sem_interesse: 5 };

export function lista(f: { status?: StatusLead[]; busca?: string; limite?: number }): ListaBase {
  const e = estado();
  const b = (f.busca ?? "").trim().toLowerCase();
  const itens = e.leads
    .filter((l) => !f.status?.length || f.status.includes(l.status))
    .filter((l) => !b || [l.negocio, l.bairro, l.categoria].some((x) => x?.toLowerCase().includes(b)))
    .sort((a, z) => (ORDEM[a.status] ?? 6) - (ORDEM[z.status] ?? 6) || z.prioridade - a.prioridade || z.atualizado.localeCompare(a.atualizado))
    .slice(0, Math.min(500, f.limite ?? 200));
  return { itens, contagem: contagem(e.leads) };
}

export function acao(ids: string[], qual: AcaoBase): { afetados: number; na_fila: number } {
  const e = estado();
  let afetados = 0;
  let naFila = 0;
  for (const l of e.leads.filter((x) => ids.includes(x.id))) {
    if (qual === "descartar" && ["novo", "pulado", "erro"].includes(l.status)) Object.assign(l, { status: "descartado", motivo: "descartado" });
    else if (qual === "restaurar" && ["descartado", "pulado", "erro"].includes(l.status)) Object.assign(l, { status: "novo", motivo: null });
    else if (qual === "priorizar" && l.status === "novo") {
      l.prioridade = 1;
      if (e.empresa.ligado && e.numero) {
        Object.assign(l, { status: "na_fila", sai_em: iso(Date.now() + 5 * 60_000) });
        naFila++;
      }
    } else if (qual === "tirar_da_fila" && l.status === "na_fila") Object.assign(l, { status: "novo", motivo: "radar_tirado", sai_em: null });
    else continue;
    l.atualizado = iso(Date.now());
    afetados++;
  }
  return { afetados, na_fila: naFila };
}

export function painel(dias: number): PainelVoob {
  const e = estado();
  const agora = Date.now();
  const desde = agora - (dias - 1) * DIA;
  const noDia = (v: string | null, d: string) => Boolean(v && v.slice(0, 10) === d);
  const serie: DiaPainel[] = Array.from({ length: dias }, (_, i) => {
    const d = iso(desde + i * DIA).slice(0, 10);
    return {
      dia: d,
      enviados: e.leads.filter((l) => noDia(l.enviado_em, d)).length,
      retomadas: 0,
      responderam: e.leads.filter((l) => noDia(l.respondeu_em, d)).length,
      interessados: e.leads.filter((l) => l.status === "interessado" && noDia(l.respondeu_em, d)).length,
      pararam: e.leads.filter((l) => noDia(l.saiu_em, d)).length,
    };
  });
  const c = (f: (l: LeadBase) => boolean) => e.leads.filter(f).length;
  const noPeriodo = (v: string | null) => Boolean(v && new Date(v).getTime() >= desde - DIA);
  return {
    dias,
    desde: iso(desde),
    total: {
      base: c((l) => l.status === "novo"),
      base_pronta: c((l) => l.status === "novo" && e.empresa.situacoes_site.includes(l.site_situacao)),
      na_fila: c((l) => l.status === "na_fila"),
      enviados: c((l) => Boolean(l.enviado_em)),
      retomadas: 0,
      responderam: c((l) => Boolean(l.respondeu_em)),
      interessados: c((l) => l.status === "interessado"),
      sem_interesse: c((l) => l.status === "sem_interesse"),
      pararam: c((l) => l.status === "parou"),
      no_crm: c((l) => Boolean(l.crm_lead_id)),
      pulados: c((l) => l.status === "pulado"),
      erros: c((l) => l.status === "erro"),
      descartados: c((l) => l.status === "descartado"),
    },
    periodo: {
      enviados: c((l) => noPeriodo(l.enviado_em)),
      retomadas: 0,
      responderam: c((l) => noPeriodo(l.respondeu_em)),
      interessados: c((l) => l.status === "interessado" && noPeriodo(l.respondeu_em)),
      sem_interesse: c((l) => l.status === "sem_interesse" && noPeriodo(l.respondeu_em)),
      pararam: c((l) => noPeriodo(l.saiu_em)),
      adicionados: c((l) => noPeriodo(l.created_at)),
    },
    serie,
    ligado: e.empresa.ligado,
    pausado_motivo: e.empresa.pausado_motivo,
    pausado_em: e.empresa.pausado_em,
  };
}

// ---------------------------------------------------------------- a busca no Google, simulada

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return Math.abs(h);
}

/** Empresas falsas do tipo pedido (mais ou menos metade sem site, algumas só com Instagram). */
export async function buscaSimulada(input: { textQuery: string; termo: string; cidade: string; pageToken?: string | null }): Promise<PageResult> {
  await new Promise((res) => setTimeout(res, 200 + Math.random() * 300));
  const pagina = input.pageToken ? Number(input.pageToken.split(":")[1]) : 0;
  const r = semente(hash(`${input.textQuery}|${pagina}`));
  const qtd = pagina < 2 ? 20 : 11;
  const termo = input.termo.trim();
  const titulo = termo.charAt(0).toUpperCase() + termo.slice(1);
  const lugares: GooglePlace[] = Array.from({ length: qtd }, (_, i) => {
    const n = hash(`${input.textQuery}|${pagina}|${i}`);
    const bairro = BAIRROS[n % BAIRROS.length];
    const nome = `${titulo} ${["Prime", "Vida", "Mais", "Central", "Bem", "Nova", "Real", "Top"][n % 8]} ${bairro}`;
    const x = r();
    const celular = x > 0.18;
    const tel = celular ? `+55 31 9${String(8000_0000 + (n % 1999_9999)).slice(0, 4)}-${String(n % 10000).padStart(4, "0")}` : `+55 31 3${String(n % 1000).padStart(3, "0")}-${String(n % 10000).padStart(4, "0")}`;
    const site = r() < 0.45 ? undefined : r() < 0.4 ? `https://instagram.com/${nome.toLowerCase().replace(/[^a-z]/g, "")}` : `https://www.${nome.toLowerCase().replace(/[^a-z]/g, "")}.com.br`;
    return {
      id: `mock-voob-${n}`,
      displayName: { text: nome },
      formattedAddress: `R. Exemplo, ${n % 900} - ${bairro}, Belo Horizonte - MG`,
      addressComponents: [
        { longText: bairro, types: ["sublocality_level_1"] },
        { longText: "Belo Horizonte", types: ["administrative_area_level_2"] },
        { shortText: "MG", types: ["administrative_area_level_1"] },
      ],
      googleMapsUri: `https://maps.google.com/?cid=${n}`,
      businessStatus: "OPERATIONAL",
      primaryTypeDisplayName: { text: titulo },
      internationalPhoneNumber: tel,
      websiteUri: site,
      rating: Math.round((3.7 + r() * 1.3) * 10) / 10,
      userRatingCount: Math.floor(r() * 220),
    };
  });
  const leads = lugares.map((p) => placeToLead(p, input.termo, input.cidade));
  return { leads, nextPageToken: pagina < 2 ? `voob:${pagina + 1}` : null, bruto: lugares.length };
}

/** Só para testes: volta ao começo. */
export function __reiniciarSimulacao() {
  g.__radarVoobMock = undefined;
}
