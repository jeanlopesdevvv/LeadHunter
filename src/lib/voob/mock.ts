import "server-only";

import { placeToLead, type GooglePlace } from "@/lib/places";
import type { PageResult } from "@/lib/types";

import type { ResumoEmpresaCrm } from "@/lib/empresas";

import { SERVE_PARA_ABERTURA } from "./regras";
import type {
  AcaoBase,
  ContaCrm,
  ModeloConta,
  NumeroDisponivel,
  ConfigBuscaAuto,
  ConfigVoob,
  DiaPainel,
  EmpresaConfig,
  EntradaBase,
  LeadBase,
  ListaBase,
  NumeroProspeccao,
  EstadoBuscaAuto,
  FeitaBuscaVoob,
  PainelVoob,
  RespostaInsercao,
  RodadaBuscaAuto,
  SaudeVoob,
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
  /** Os números da conta da empresa (para escolher). */
  numerosConta: NumeroProspeccao[];
  /** Os modelos do número (cópia do CRM, simulada). */
  modelos: ModeloConta[];
  leads: LeadBase[];
  enviadosHoje: number;
  busca: ConfigBuscaAuto;
  rodadas: RodadaBuscaAuto[];
  feitas: (FeitaBuscaVoob & { em: number; consultas: number })[];
  saudeLida: number | null;
}

/** Uma empresa da simulação: o resumo do seletor e quem vê (ids de conta do CRM simulado). */
interface EmpresaMock {
  resumo: Omit<ResumoEmpresaCrm, "ligado" | "pausado" | "numero" | "teste" | "situacao">;
  /** Ids de pessoa (cliente) que veem esta empresa. A equipe vê todas. */
  clientes: string[];
}

const g = globalThis as unknown as { __radarVoobMock?: Map<string, Estado>; __radarVoobMockEmpresas?: EmpresaMock[]; __radarVoobMockRodada?: number };

/** O cliente da simulação (entra com um e-mail que tenha "cliente"). */
export const CLIENTE_SIMULADO = "00000000-0000-4000-8000-00000000000c";

function empresasMock(): EmpresaMock[] {
  if (g.__radarVoobMockEmpresas) return g.__radarVoobMockEmpresas;
  g.__radarVoobMockEmpresas = [
    { resumo: { id: "voob", nome: "Voob", cor: "#4e9a1a", logo: null, publico: "Empresas que vendem pelo WhatsApp", agente: "Renata", conta: "Voob Prospecção" }, clientes: [] },
    { resumo: { id: "clinica-exemplo", nome: "Clínica Exemplo", cor: "#1d4ed8", logo: null, publico: "Pacientes de BH", agente: "Bia", conta: "Clínica Exemplo" }, clientes: [CLIENTE_SIMULADO] },
  ];
  return g.__radarVoobMockEmpresas;
}

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

const MODELO_VOOB: ModeloConta = {
  id: "3d000000-0000-4000-8000-000000000001",
  nome: "radar_voob_abertura_v1",
  titulo: "Radar Voob: abertura",
  status: "APPROVED",
  categoria: "MARKETING",
  motivo: null,
  arquivado: false,
  criado_em: iso(Date.now() - 5 * DIA),
  corpo: "Olá! 👋 Aqui é a Renata, assistente virtual da Voob.\n\nEncontrei {{nome_do_negocio}} no Google, mas não achei um site de vocês. Posso te mostrar, em 1 minuto, como ficaria para vocês?",
  botoes: ["Quero ver", "Não tenho interesse"],
  campos: [{ param: "nome_do_negocio", tipo: "livre", rotulo: "nome do negócio", exemplo: "Clínica Sorriso" }],
};

function estadoDaVoob(): Estado {
  const agora = Date.now();
  const r = semente(20261112);
  const rodando = process.env.VOOB_MOCK_CENARIO === "rodando";
  const leads = Array.from({ length: rodando ? 300 : 34 }, (_, i) => leadFalso(i, r, agora));
  const e: Estado = {
    empresa: empresaPadrao(),
    numero: rodando ? NUMERO : null,
    numerosConta: rodando ? [NUMERO] : [],
    modelos: rodando ? [MODELO_VOOB] : [],
    leads,
    enviadosHoje: 0,
    busca: { ligado: rodando, fila_dias: 3, max_consultas_dia: 40, reserva_cota: 150, refazer_dias: 60 },
    rodadas: rodando
      ? [{ id: 1, origem: "rotina", quem: "Radar", inicio: iso(agora - 3 * 3600e3), fim: iso(agora - 3 * 3600e3 + 95_000), precisava: 26, consultas: 9, adicionados: 27, motivo: "alvo", texto: "achou o que a base precisava", erro: null }]
      : [],
    feitas: [],
    saudeLida: rodando ? agora - 40 * 60_000 : null,
  };
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
    // Três vendas entre os que quiseram ver (para o Desempenho mostrar o custo por venda).
    leads.filter((l) => l.status === "interessado").slice(0, 3).forEach((l, i) => (l.vendeu_em = iso(Math.min(agora - 3600e3, new Date(l.respondeu_em ?? l.enviado_em ?? iso(agora)).getTime() + (i + 1) * DIA))));
    // A fila de hoje: o que falta para os 20.
    leads
      .filter((l) => l.status === "novo" && SERVE_PARA_ABERTURA.includes(l.site_situacao))
      .slice(0, 20 - e.enviadosHoje)
      .forEach((l, i) => Object.assign(l, { status: "na_fila", na_fila_em: iso(agora - 3600e3), sai_em: iso(agora + (i + 1) * 4 * 60_000) }));
  }
  return e;
}

/** Empresa nova da simulação: sem número escolhido, sem base; a conta já tem um número conectado para escolher. */
function estadoNovo(m: EmpresaMock): Estado {
  const base = empresaPadrao();
  const pref = `radar_${m.resumo.id.replace(/-/g, "_")}`;
  const numero: NumeroProspeccao = { ...NUMERO, id: `c0000000-0000-4000-8000-${String(hash(m.resumo.id) % 1e12).padStart(12, "0")}`, nome: m.resumo.conta ?? m.resumo.nome, crm: m.resumo.conta, final: String(1000 + (hash(m.resumo.id) % 9000)), ia_ativa: false, nome_meta: m.resumo.nome };
  return {
    empresa: {
      ...base, id: m.resumo.id, nome: m.resumo.nome, agente: m.resumo.agente, cor: m.resumo.cor, logo: m.resumo.logo, publico: m.resumo.publico,
      modelo_prefixo: `${pref}_abertura`, modelo_prefixo_site: `${pref}_abertura`, retomada_prefixo: `${pref}_retomada`, botao_sim: "Quero ver", botao_nao: "Agora não",
      perfil: { cidade: "Belo Horizonte, MG", segmentos: [], termos_extras: [], site: "sem_site", so_sem_site: true },
      responde: "ia", responde_sistema: null, site_id: `5${String(hash(m.resumo.id) % 1e7).padStart(7, "0")}-0000-4000-8000-000000000000`, conta: m.resumo.conta, teste: null,
    },
    numero: null,
    numerosConta: [numero],
    modelos: [],
    leads: [],
    enviadosHoje: 0,
    busca: { ligado: false, fila_dias: 3, max_consultas_dia: 40, reserva_cota: 150, refazer_dias: 60 },
    rodadas: [],
    feitas: [],
    saudeLida: null,
  };
}

function estado(id: string): Estado {
  if (!g.__radarVoobMock) g.__radarVoobMock = new Map();
  const ja = g.__radarVoobMock.get(id);
  if (ja) return ja;
  const m = empresasMock().find((x) => x.resumo.id === id);
  if (!m) throw Object.assign(new Error(`Empresa "${id}" não existe no Radar.`), { code: "P0002" });
  const e = id === "voob" ? estadoDaVoob() : estadoNovo(m);
  if (id === "voob") Object.assign(e.empresa, { cor: m.resumo.cor, logo: m.resumo.logo, publico: m.resumo.publico, responde: "ia", conta: "Voob Prospecção", site_id: "b6e69f06-1460-4539-8693-f4fc66b220a6", teste: null });
  g.__radarVoobMock.set(id, e);
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

/** O modelo aprovado com o começo de nome (como o whatsapp_modelo_para_envio do CRM). */
function situacaoDoModelo(e: Estado, prefixo: string | undefined) {
  if (!e.numero || !prefixo) return null;
  const m = e.modelos
    .filter((x) => x.nome.startsWith(prefixo))
    .sort((a, z) => Number(z.status === "APPROVED") - Number(a.status === "APPROVED") || Number(a.arquivado) - Number(z.arquivado))[0];
  if (!m) return { ok: false, motivo: "aviso_sem_modelo", nome: null, categoria: null, titulo: null };
  if (m.status === "PENDING") return { ok: false, motivo: "modelo_em_analise", nome: m.nome, categoria: m.categoria, titulo: m.titulo };
  if (m.status !== "APPROVED") return { ok: false, motivo: "modelo_indisponivel", nome: m.nome, categoria: m.categoria, titulo: m.titulo };
  return { ok: true, motivo: null, nome: m.nome, categoria: m.categoria, titulo: m.titulo };
}

/** Na simulação, a Meta aprova um modelo novo 20 s depois. */
function aprovarPendentes(e: Estado) {
  for (const m of e.modelos) if (m.status === "PENDING" && Date.now() - new Date(m.criado_em).getTime() > 20_000) m.status = "APPROVED";
}

export function config(id: string): ConfigVoob {
  const e = estado(id);
  aprovarPendentes(e);
  const naFila = e.leads.filter((l) => l.status === "na_fila").length;
  const pronta = e.leads.filter((l) => l.status === "novo" && e.empresa.situacoes_site.includes(l.site_situacao)).length;
  const prox = proximaAbertura(e.empresa);
  const abertura = situacaoDoModelo(e, e.empresa.modelo_prefixo);
  const numeros: NumeroDisponivel[] = e.numerosConta.map((n) => ({ id: n.id, nome: n.nome, final: n.final, crm: n.crm ?? "", status: n.status }));
  return {
    empresa: { ...e.empresa },
    numero: e.numero ? { ...e.numero, teste: Boolean(e.empresa.teste), teste_qtd: e.empresa.teste ? 1 : 0 } : null,
    numeros_disponiveis: numeros,
    modelos: {
      abertura,
      retomada: situacaoDoModelo(e, e.empresa.retomada_prefixo),
      site: situacaoDoModelo(e, e.empresa.modelo_prefixo_site),
    },
    modelos_conta: e.numero ? e.modelos.map((m) => ({ ...m })) : [],
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
      { id: "numero", ok: Boolean(e.numero), texto: "Número escolhido" },
      { id: "conectado", ok: Boolean(e.numero?.conectado), texto: "Número conectado" },
      { id: "modelo", ok: Boolean(abertura?.ok), texto: "Primeira mensagem aprovada pela Meta" },
      { id: "base", ok: pronta > 0, texto: "Empresas na base para chamar" },
      { id: "ligado", ok: e.empresa.ligado, texto: "Radar ligado" },
    ],
  };
}

const CHAVES = new Set(["limite_dia", "dias", "hora_inicio", "hora_fim", "intervalo_min", "situacoes_site", "modelo_prefixo", "retomada_ligada",
  "retomada_prefixo", "retomada_dias", "botao_sim", "botao_nao", "freio_saidas_pct", "freio_minimo", "perfil", "canal_id", "agente", "modelo_prefixo_site",
  "nome", "cor", "logo", "publico", "responde", "responde_sistema"]);

const recusa = (texto: string) => Object.assign(new Error(texto), { code: "P0001" });

export function definir(id: string, m: Record<string, unknown>): ConfigVoob {
  const e = estado(id);
  for (const k of Object.keys(m)) if (!CHAVES.has(k)) throw recusa(`Campo desconhecido: ${k}.`);
  if ("canal_id" in m && e.empresa.ligado) throw recusa("Desligue o Radar antes de trocar o número.");
  if ("canal_id" in m && e.empresa.teste) throw recusa("Encerre o teste antes de trocar o número.");
  if ("cor" in m && !/^#[0-9a-f]{6}$/i.test(String(m.cor))) throw recusa("Valor fora do permitido na configuração.");
  if ("responde" in m && !["ia", "crm", "outro"].includes(String(m.responde))) throw recusa("Valor fora do permitido na configuração.");
  if ("nome" in m && (String(m.nome ?? "").trim().length < 2 || String(m.nome).trim().length > 40)) throw recusa("O nome da empresa precisa ter de 2 a 40 letras.");
  const { canal_id, ...resto } = m;
  if (canal_id !== undefined) {
    const n = canal_id ? e.numerosConta.find((x) => x.id === canal_id) : null;
    if (canal_id && !n) throw recusa("Esse número não é da conta desta empresa no Voob CRM.");
    e.numero = n ?? null;
  }
  Object.assign(e.empresa, resto, { updated_at: iso(Date.now()), atualizado_por: "Radar" });
  const meta = empresasMock().find((x) => x.resumo.id === id);
  if (meta) Object.assign(meta.resumo, { nome: e.empresa.nome, cor: e.empresa.cor ?? meta.resumo.cor, logo: e.empresa.logo ?? null, publico: e.empresa.publico ?? "", agente: e.empresa.agente });
  return config(id);
}

export function ligar(id: string, ligado: boolean): ConfigVoob {
  const e = estado(id);
  if (ligado && !e.numero) throw Object.assign(new Error("Falta escolher o número da prospecção."), { code: "P0001" });
  e.empresa.ligado = ligado;
  if (ligado) Object.assign(e.empresa, { ligado_em: iso(Date.now()), pausado_em: null, pausado_motivo: null });
  else {
    Object.assign(e.empresa, { pausado_em: iso(Date.now()), pausado_motivo: "manual" });
    for (const l of e.leads) if (l.status === "na_fila") Object.assign(l, { status: "novo", motivo: "radar_pausado", sai_em: null });
  }
  return config(id);
}

const chave = (tel: string) => {
  const d = tel.replace(/\D/g, "").replace(/^55/, "");
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : "";
};

export function conferir(id: string, telefones: string[]): { telefone: string; situacao: SituacaoConferida }[] {
  const e = estado(id);
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

export function inserir(id: string, entrada: EntradaBase[]): RespostaInsercao {
  const e = estado(id);
  const c: Record<string, number> = {};
  // Um por vez, como no banco: o segundo igual do mesmo lote já encontra o primeiro na base.
  const itens = entrada.map((l) => {
    const x = conferir(id, [l.telefone])[0];
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

export function lista(id: string, f: { status?: StatusLead[]; busca?: string; limite?: number }): ListaBase {
  const e = estado(id);
  const b = (f.busca ?? "").trim().toLowerCase();
  const itens = e.leads
    .filter((l) => !f.status?.length || f.status.includes(l.status))
    .filter((l) => !b || [l.negocio, l.bairro, l.categoria].some((x) => x?.toLowerCase().includes(b)))
    .sort((a, z) => (ORDEM[a.status] ?? 6) - (ORDEM[z.status] ?? 6) || z.prioridade - a.prioridade || z.atualizado.localeCompare(a.atualizado))
    .slice(0, Math.min(500, f.limite ?? 200));
  return { itens, contagem: contagem(e.leads) };
}

export function acao(id: string, ids: string[], qual: AcaoBase): { afetados: number; na_fila: number } {
  const e = estado(id);
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

export function painel(id: string, dias: number): PainelVoob {
  const e = estado(id);
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
      vendas: e.leads.filter((l) => noDia(l.vendeu_em ?? null, d)).length,
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
      vendas: c((l) => Boolean(l.vendeu_em)),
    },
    periodo: {
      enviados: c((l) => noPeriodo(l.enviado_em)),
      retomadas: 0,
      responderam: c((l) => noPeriodo(l.respondeu_em)),
      interessados: c((l) => l.status === "interessado" && noPeriodo(l.respondeu_em)),
      sem_interesse: c((l) => l.status === "sem_interesse" && noPeriodo(l.respondeu_em)),
      pararam: c((l) => noPeriodo(l.saiu_em)),
      adicionados: c((l) => noPeriodo(l.created_at)),
      vendas: c((l) => noPeriodo(l.vendeu_em ?? null)),
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

// ---------------------------------------------------------------- busca automática e saúde do número, simuladas

export function buscaAutoEstado(id: string): EstadoBuscaAuto {
  const e = estado(id);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const isodow = ((new Date().getDay() + 6) % 7) + 1;
  const refazer = Date.now() - e.busca.refazer_dias * DIA;
  return {
    config: { ...e.busca },
    perfil: { ...e.empresa.perfil },
    limite: e.empresa.limite_dia,
    dias: [...e.empresa.dias],
    situacoes_site: [...e.empresa.situacoes_site],
    ligado: e.empresa.ligado,
    dia_de_disparo: e.empresa.dias.includes(isodow),
    base_pronta: e.leads.filter((l) => l.status === "novo" && e.empresa.situacoes_site.includes(l.site_situacao)).length,
    consultas_hoje: e.rodadas.filter((r) => new Date(r.inicio).getTime() >= hoje.getTime()).reduce((a, r) => a + r.consultas, 0),
    rodando: e.rodadas.some((r) => !r.fim && Date.now() - new Date(r.inicio).getTime() < 20 * 60_000),
    feitas: e.feitas.filter((f) => f.em > refazer).map(({ termo, lugar, cheia, novos }) => ({ termo, lugar, cheia, novos })),
    ultimas: [...e.rodadas].sort((a, z) => z.inicio.localeCompare(a.inicio)).slice(0, 5),
  };
}

function daRodada(rodada: number): Estado | undefined {
  return [...(g.__radarVoobMock?.values() ?? [])].find((e) => e.rodadas.some((r) => r.id === rodada));
}

const CHAVES_BUSCA = new Set(["ligado", "fila_dias", "max_consultas_dia", "reserva_cota", "refazer_dias"]);

export function buscaAutoDefinir(id: string, m: Record<string, unknown>): EstadoBuscaAuto {
  const e = estado(id);
  for (const k of Object.keys(m)) if (!CHAVES_BUSCA.has(k)) throw Object.assign(new Error(`Não dá para mudar "${k}" na busca automática.`), { code: "P0001" });
  Object.assign(e.busca, m);
  return buscaAutoEstado(id);
}

export function buscaAutoIniciar(empresa: string, origem: "rotina" | "manual", quem: string, precisa: number, podeGastar: number): number | null {
  const e = estado(empresa);
  if (e.rodadas.some((r) => !r.fim)) return null;
  const id = (g.__radarVoobMockRodada = (g.__radarVoobMockRodada ?? 100) + 1);
  e.rodadas.push({ id, origem, quem, inicio: iso(Date.now()), fim: null, precisava: precisa, consultas: 0, adicionados: 0, motivo: null, texto: null, erro: null });
  void podeGastar;
  return id;
}

export function buscaAutoFeita(rodada: number, termo: string, lugar: string, consultas: number, novos: number, cheia: boolean) {
  const e = daRodada(rodada);
  const r = e?.rodadas.find((x) => x.id === rodada);
  if (!r || r.fim) throw Object.assign(new Error("Rodada da busca automática encerrada ou inexistente."), { code: "P0001" });
  r.consultas += consultas;
  e!.feitas.push({ termo, lugar, cheia, novos, consultas, em: Date.now() });
}

export function buscaAutoTerminar(rodada: number, res: { consultas: number; adicionados: number; motivo: string; texto?: string; erro?: string | null }) {
  const r = daRodada(rodada)?.rodadas.find((x) => x.id === rodada);
  if (!r || r.fim) return;
  Object.assign(r, { fim: iso(Date.now()), consultas: Math.max(r.consultas, res.consultas), adicionados: res.adicionados, motivo: res.motivo, texto: res.texto ?? null, erro: res.erro ?? null });
}

export function saude(id: string): SaudeVoob {
  const e = estado(id);
  const lim = e.empresa.limite_dia;
  const semNumero = !e.numero;
  const enviados = e.leads.filter((l) => l.enviado_em && Date.now() - new Date(l.enviado_em).getTime() < 14 * DIA);
  // A sugestão na simulação: no cenário "rodando", 5 dias cheios e verde.
  const cheios = semNumero ? 0 : 5;
  const novo = Math.min(250, lim + Math.max(5, Math.round(lim * 0.5)));
  const pode = !semNumero && lim === 20;
  return {
    numero: semNumero ? null : { final: e.numero!.final, conectado: true, nome: e.numero!.nome },
    freio: semNumero ? "sem_numero" : "normal",
    qualidade_radar: semNumero ? null : "GREEN",
    limite_configurado: lim,
    limite_efetivo: lim,
    leitura: semNumero
      ? null
      : {
          qualidade: "GREEN",
          status: "CONNECTED",
          nome_status: "APPROVED",
          limite_meta: "TIER_250",
          pode_enviar: "AVAILABLE",
          avisos: [],
          checado_em: iso(e.saudeLida ?? Date.now()),
          tentativa_em: iso(e.saudeLida ?? Date.now()),
          ok: true,
          erro: null,
          falhas: 0,
          pedido_em: iso(e.saudeLida ?? Date.now()),
          esperando: false,
        },
    enviados_hoje: e.enviadosHoje,
    saidas_7d: e.leads.filter((l) => l.saiu_em && Date.now() - new Date(l.saiu_em).getTime() < 7 * DIA).length,
    sem_interesse_7d: e.leads.filter((l) => l.status === "sem_interesse" && l.respondeu_em && Date.now() - new Date(l.respondeu_em).getTime() < 7 * DIA).length,
    erros_7d: 0,
    sugestao: {
      pode,
      motivo: semNumero ? "sem_numero" : pode ? null : "dias",
      texto: semNumero
        ? "A sugestão começa depois que o número estiver conectado e disparando."
        : pode
          ? `5 dias de envio cheios, 1,5% de saídas e qualidade verde: dá para subir de ${lim} para ${novo} por dia.`
          : `Faltam 5 dias de envio cheio (${Math.ceil(lim * 0.8)} ou mais mensagens no dia) para sugerir.`,
      atual: lim,
      novo,
      dias_cheios: pode ? cheios : 0,
      dias_precisa: 5,
      cheio_a_partir: Math.ceil(lim * 0.8),
      enviados: enviados.length,
      saidas: 1,
      saidas_pct: 1.5,
    },
    simulacao: true,
  };
}

export function saudeAtualizar(id: string): SaudeVoob {
  const e = estado(id);
  if (e.numero) e.saudeLida = Date.now();
  return saude(id);
}

/** Só para testes: volta ao começo. */
export function __reiniciarSimulacao() {
  g.__radarVoobMock = undefined;
  g.__radarVoobMockEmpresas = undefined;
}

// ---------------------------------------------------------------- empresas (white label), simuladas

function resumoMock(m: EmpresaMock): ResumoEmpresaCrm {
  const e = g.__radarVoobMock?.get(m.resumo.id);
  const ligado = Boolean(e?.empresa.ligado);
  return {
    ...m.resumo,
    ligado,
    pausado: Boolean(e?.empresa.pausado_em),
    numero: Boolean(e?.numero),
    teste: Boolean(e?.empresa.teste),
    situacao: ligado && e?.numero ? "ativa" : "preparando",
  };
}

const vePessoa = (m: EmpresaMock, userId: string | null, equipe: boolean) => equipe || (userId !== null && m.clientes.includes(userId));

export function empresasLista(userId: string | null, equipe: boolean): ResumoEmpresaCrm[] {
  return empresasMock()
    .filter((m) => vePessoa(m, userId, equipe))
    .map(resumoMock)
    .sort((a, z) => Number(z.id === "voob") - Number(a.id === "voob") || a.nome.localeCompare(z.nome));
}

export function empresaVer(id: string, userId: string | null, equipe: boolean): ResumoEmpresaCrm | null {
  const m = empresasMock().find((x) => x.resumo.id === id);
  return m && vePessoa(m, userId, equipe) ? resumoMock(m) : null;
}

const CONTAS: ContaCrm[] = [
  { id: "b6e69f06-1460-4539-8693-f4fc66b220a6", nome: "Voob Prospecção", oficial: true, modulo_oficial: true, empresa: "Voob" },
  { id: "50000000-0000-4000-8000-0000000000c1", nome: "Clínica Exemplo", oficial: true, modulo_oficial: true, empresa: "Clínica Exemplo" },
  { id: "50000000-0000-4000-8000-0000000000c2", nome: "Imobiliária Horizonte", oficial: false, modulo_oficial: true, empresa: null },
  { id: "50000000-0000-4000-8000-0000000000c3", nome: "Pet Shop Patinhas", oficial: false, modulo_oficial: false, empresa: null },
];

export function contas(busca: string): ContaCrm[] {
  const b = busca.trim().toLowerCase();
  return CONTAS.filter((c) => !b || c.nome.toLowerCase().includes(b));
}

function slug(nome: string): string {
  const s = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24);
  return s.length >= 2 ? s : "empresa";
}

export function empresaCriar(dados: Record<string, unknown>, quem: string): ConfigVoob {
  const nome = String(dados.nome ?? "").replace(/\s+/g, " ").trim();
  if (nome.length < 2 || nome.length > 40) throw recusa("O nome da empresa precisa ter de 2 a 40 letras.");
  const conta = CONTAS.find((c) => c.id === dados.conta);
  if (!conta) throw recusa("Escolha a conta do Voob CRM da empresa.");
  const cor = typeof dados.cor === "string" && dados.cor ? dados.cor : "#4e9a1a";
  if (!/^#[0-9a-f]{6}$/i.test(cor)) throw recusa("Algum dado está fora do permitido (cor, logo ou texto grande demais).");
  const base = slug(nome);
  let id = base;
  for (let i = 2; id === "lavacar" || empresasMock().some((m) => m.resumo.id === id); i++) id = `${base.slice(0, 26)}-${i}`;
  conta.empresa = conta.empresa ?? nome;
  empresasMock().push({
    resumo: {
      id, nome, cor, logo: typeof dados.logo === "string" && dados.logo ? dados.logo : null, publico: String(dados.publico ?? "").slice(0, 80),
      agente: String(dados.agente ?? "").trim().slice(0, 40) || "Atendimento", conta: conta.nome,
    },
    clientes: [],
  });
  const e = estado(id);
  e.empresa.criado_por = quem;
  e.empresa.perfil = { ...e.empresa.perfil, cidade: String(dados.cidade ?? "").trim() || "Belo Horizonte, MG" };
  if (dados.responde) e.empresa.responde = dados.responde as "ia" | "crm" | "outro";
  if (!conta.oficial) e.numerosConta = [];
  return config(id);
}

export function modeloRenomear(id: string, modelo: string, titulo: string): ModeloConta[] {
  const e = estado(id);
  const t = titulo.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 60) throw recusa("O nome do modelo precisa ter de 2 a 60 letras.");
  const m = e.modelos.find((x) => x.id === modelo);
  if (!m) throw recusa("Modelo não encontrado neste número.");
  m.titulo = t;
  return e.modelos.map((x) => ({ ...x }));
}

export function modeloArquivar(id: string, modelo: string, arquivar: boolean): ModeloConta[] {
  const e = estado(id);
  const m = e.modelos.find((x) => x.id === modelo);
  if (!m) throw recusa("Modelo não encontrado neste número.");
  const p = e.empresa;
  if (arquivar && [p.modelo_prefixo, p.modelo_prefixo_site, p.retomada_ligada ? p.retomada_prefixo : null].some((x) => x && m.nome.startsWith(x))) {
    throw recusa("Este modelo é a mensagem do Radar. Escolha outro antes de arquivar.");
  }
  m.arquivado = arquivar;
  return e.modelos.map((x) => ({ ...x }));
}

export function teste(id: string, telefone: string | null, ligarTeste: boolean): ConfigVoob {
  const e = estado(id);
  if (ligarTeste) {
    if (!e.numero) throw recusa("Escolha o número antes do teste.");
    if (e.empresa.ligado && !e.empresa.teste) throw recusa("Desligue o Radar antes de testar.");
    const k = chave(telefone ?? "");
    if (!k) throw recusa("Telefone inválido. Use DDD e número.");
    e.empresa.teste = { chave: k, final: k.slice(-4), desde: iso(Date.now()), quem: "Radar" };
    e.empresa.ligado = true;
    e.empresa.ligado_em = iso(Date.now());
    const lead = leadFalso(e.leads.length + 5000, semente(9), Date.now());
    e.leads.unshift({ ...lead, id: crypto.randomUUID(), telefone: `+55${k.slice(0, 2)}9${k.slice(2)}`, negocio: "Teste do Radar", status: "na_fila", motivo: "teste", sai_em: iso(Date.now() + 60_000), site_situacao: e.empresa.situacoes_site[0] ?? "sem_site" });
  } else if (e.empresa.teste) {
    e.empresa.teste = null;
    return ligar(id, false);
  }
  return config(id);
}

export function buscaAutoEmpresas(): string[] {
  return empresasMock()
    .map((m) => m.resumo.id)
    .filter((id) => g.__radarVoobMock?.get(id)?.busca.ligado);
}

// ---------------------------------------------------------------- o que o Voob CRM faria (whatsapp-modelos e whatsapp-oficial)

/** Criar ou editar um modelo: vai para a análise da Meta (na simulação, aprova em 20 s). */
export function modeloSalvarSimulado(id: string, d: { modelo_id?: string; titulo: string; categoria: string; texto: string; botoes: string[] }): ModeloConta {
  const e = estado(id);
  if (!e.numero) throw recusa("Este CRM não tem o WhatsApp oficial.");
  const corpo = d.texto
    .replace(/\{(Nome do contato|nome)\}/gi, "{{nome}}")
    .replace(/\{(Nome de quem atende|atendente)\}/gi, "{{atendente}}")
    .replace(/\{empresa\}/gi, e.empresa.nome)
    .replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (_, k: string) => `{{${k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "")}}}`);
  const campos = [...corpo.matchAll(/\{\{(\w+)\}\}/g)].map((x) => ({ param: x[1], tipo: x[1] === "nome" ? "contato" : x[1] === "atendente" ? "atendente" : "livre" }));
  if (d.modelo_id) {
    const m = e.modelos.find((x) => x.id === d.modelo_id);
    if (!m) throw recusa("Modelo não encontrado.");
    Object.assign(m, { titulo: d.titulo, categoria: d.categoria, corpo, botoes: d.botoes, campos, status: "PENDING", criado_em: iso(Date.now()) });
    return { ...m };
  }
  const nome = `${d.titulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)}_${Math.random().toString(36).slice(2, 6)}`;
  const m: ModeloConta = { id: crypto.randomUUID(), nome, titulo: d.titulo, status: "PENDING", categoria: d.categoria, motivo: null, arquivado: false, criado_em: iso(Date.now()), corpo, botoes: d.botoes, campos };
  e.modelos.unshift(m);
  return { ...m };
}

export function escreverSimulado(pedido: string, empresa: string): { texto: string; exemplos: Record<string, string>; problemas: string[] } {
  void pedido;
  return {
    texto: `Olá! Aqui é a {Nome de quem atende}, da ${empresa}. Encontrei {Nome do negócio} no Google e acho que podemos ajudar vocês a atender mais clientes pelo WhatsApp. Posso te mostrar como funciona?`,
    exemplos: { nome_do_negocio: "Clínica Sorriso" },
    problemas: [],
  };
}

/** "Conectar número novo" na simulação: aparece um número na conta. */
export function conectarSimulado(id: string): { canal: { id: string } } {
  const e = estado(id);
  const n: NumeroProspeccao = { ...NUMERO, id: crypto.randomUUID(), nome: `${e.empresa.nome} (novo)`, crm: e.empresa.conta ?? e.empresa.nome, final: String(2000 + Math.floor(Math.random() * 7000)), ia_ativa: false };
  e.numerosConta.push(n);
  return { canal: { id: n.id } };
}
