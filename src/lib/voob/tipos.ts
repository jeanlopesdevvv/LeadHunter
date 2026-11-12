/**
 * Radar · Voob (12/11/2026): o que as funções radar.* do Voob CRM devolvem (migração 20261112150000_radar_voob).
 * Os nomes seguem o banco, para a tela ler o JSON sem tradução.
 */

export type SituacaoSite = "sem_site" | "rede_social" | "desatualizado" | "com_site" | "nao_conferido";

export type StatusLead =
  | "novo"
  | "na_fila"
  | "enviado"
  | "respondeu"
  | "interessado"
  | "sem_interesse"
  | "parou"
  | "pulado"
  | "erro"
  | "descartado";

export type AcaoBase = "descartar" | "restaurar" | "priorizar" | "tirar_da_fila";

export interface EmpresaConfig {
  id: string;
  nome: string;
  agente: string;
  ligado: boolean;
  ligado_em: string | null;
  pausado_em: string | null;
  pausado_motivo: string | null;
  limite_dia: number;
  /** isodow: 1 = segunda ... 7 = domingo */
  dias: number[];
  hora_inicio: string;
  hora_fim: string;
  intervalo_min: number;
  situacoes_site: SituacaoSite[];
  modelo_prefixo: string;
  /** 1ª mensagem para quem tem site desatualizado (Raio-X). Só existe depois da migração do Raio-X. */
  modelo_prefixo_site?: string;
  retomada_ligada: boolean;
  retomada_prefixo: string;
  retomada_dias: number;
  botao_sim: string;
  botao_nao: string;
  freio_saidas_pct: number;
  freio_minimo: number;
  perfil: PerfilBusca;
  atualizado_por: string | null;
  updated_at: string;
  // 13/11/2026 (white label, migração 20261113100000). Opcionais: o banco de antes não manda.
  cor?: string;
  logo?: string | null;
  publico?: string;
  /** Quem responde quem respondeu à 1ª mensagem: a IA da Voob, a equipe pelo CRM ou outro sistema (ex.: ManyChat). */
  responde?: QuemResponde;
  responde_sistema?: string | null;
  /** A conta da empresa no Voob CRM. */
  site_id?: string | null;
  conta?: string | null;
  /** Teste no próprio número ligado. */
  teste?: TesteEmpresa | null;
  criado_por?: string | null;
}

export type QuemResponde = "ia" | "crm" | "outro";

export interface TesteEmpresa {
  chave: string;
  final: string;
  desde: string;
  quem: string;
}

/** Uma conta do Voob CRM (para escolher ao criar uma empresa). */
export interface ContaCrm {
  id: string;
  nome: string;
  /** Já tem WhatsApp oficial. */
  oficial: boolean;
  /** O WhatsApp oficial está liberado para essa conta (dá para conectar pelo Radar). */
  modulo_oficial: boolean;
  /** Já é a conta de uma empresa do Radar (nome dela). */
  empresa: string | null;
}

/** Um modelo (template) do número da empresa, como está na cópia do Voob CRM. */
export interface ModeloConta {
  id: string;
  nome: string;
  titulo: string;
  /** APPROVED, PENDING, REJECTED, PAUSED, DISABLED... */
  status: string;
  categoria: string | null;
  motivo: string | null;
  arquivado: boolean;
  criado_em: string;
  /** O texto com os campos ({{nome}}, {{nome_do_negocio}}...). */
  corpo: string | null;
  botoes: string[];
  campos: { param: string; tipo?: string; rotulo?: string; exemplo?: string }[];
}

export interface PerfilBusca {
  cidade?: string;
  segmentos?: string[];
  termos_extras?: string[];
  bairros?: string[];
  so_sem_site?: boolean;
  com_desatualizado?: boolean;
  /** Filtro de site da campanha (13/11/2026): só quem não tem site, também site desatualizado, ou tanto faz. */
  site?: FiltroSite;
}

export type FiltroSite = "sem_site" | "desatualizado" | "tanto_faz";

export interface NumeroProspeccao {
  id: string;
  nome: string;
  crm: string | null;
  /** Últimos 4 dígitos. */
  final: string;
  status: string;
  conectado: boolean;
  qualidade: string | null;
  qualidade_ruim: boolean;
  /** Modo teste do número: só a lista de teste recebe. */
  teste: boolean;
  teste_qtd: number;
  criar_leads: boolean;
  etapa: string | null;
  ia_ativa: boolean;
  pagamento: string | null;
  nome_meta: string | null;
  nome_meta_status: string | null;
}

export interface NumeroDisponivel {
  id: string;
  nome: string;
  final: string;
  crm: string;
  status: string;
}

export interface SituacaoModelo {
  ok: boolean;
  motivo: string | null;
  nome: string | null;
  categoria: string | null;
  titulo?: string | null;
}

export interface Prontidao {
  id: "numero" | "conectado" | "modelo" | "base" | "ligado";
  ok: boolean;
  texto: string;
}

export interface Hoje {
  enviados: number;
  na_fila: number;
  limite: number;
  limite_efetivo: number;
  restantes: number;
  saidas: number;
  saidas_desde_ligado: number;
  enviados_desde_ligado: number;
  proxima_abertura: string | null;
  no_horario: boolean;
}

export interface ConfigVoob {
  empresa: EmpresaConfig;
  numero: NumeroProspeccao | null;
  numeros_disponiveis: NumeroDisponivel[];
  /** "site" só existe depois da migração do Raio-X (1ª mensagem para site desatualizado). */
  modelos: { abertura: SituacaoModelo | null; retomada: SituacaoModelo | null; site?: SituacaoModelo | null };
  hoje: Hoje;
  base: Partial<Record<StatusLead, number>>;
  /** Na base, para quem a 1ª mensagem serve (hoje: sem site ou só rede social). */
  base_pronta: number;
  prontidao: Prontidao[];
  /** Os modelos do número da empresa (migração 20261113100000). */
  modelos_conta?: ModeloConta[];
  /** Só na simulação (MOCK_MODE=1). */
  simulacao?: boolean;
}

export interface LeadBase {
  id: string;
  telefone: string;
  negocio: string;
  categoria: string | null;
  termo: string | null;
  cidade: string | null;
  uf: string | null;
  bairro: string | null;
  endereco: string | null;
  site_url: string | null;
  site_situacao: SituacaoSite;
  /** O que o Raio-X achou no site (só para "desatualizado"). */
  site_problemas?: string[] | null;
  nota: number | null;
  avaliacoes: number | null;
  maps_url: string | null;
  status: StatusLead;
  motivo: string | null;
  prioridade: number;
  na_fila_em: string | null;
  enviado_em: string | null;
  retomada_em: string | null;
  respondeu_em: string | null;
  saiu_em: string | null;
  crm_lead_id: string | null;
  /** Comprou depois da 1ª mensagem (migração das vendas, 12/11/2026). */
  vendeu_em?: string | null;
  created_at: string;
  atualizado: string;
  /** Quando sai (se está na fila). */
  sai_em: string | null;
}

export interface ListaBase {
  itens: LeadBase[];
  contagem: Partial<Record<StatusLead, number>>;
}

/** O que o Radar manda para a base (radar.leads_inserir). */
export interface EntradaBase {
  telefone: string;
  negocio: string;
  categoria?: string;
  termo?: string;
  cidade?: string;
  uf?: string;
  bairro?: string;
  endereco?: string;
  site_url?: string;
  site_situacao: SituacaoSite;
  site_problemas?: string[];
  nota?: number | null;
  avaliacoes?: number | null;
  place_id?: string;
  maps_url?: string;
}

export type ResultadoInsercao =
  | "novo"
  | "repetido"
  | "invalido"
  | "nao_e_celular"
  | "cliente_ou_equipe"
  | "ja_no_crm"
  | "ja_conversa";

export interface RespostaInsercao {
  contagem: Partial<Record<ResultadoInsercao, number>>;
  itens: { telefone: string; resultado: ResultadoInsercao }[];
}

/** radar.leads_conferir: "base:<status>" ou se já é da Voob. */
export type SituacaoConferida = `base:${StatusLead}` | "cliente_ou_equipe" | "ja_no_crm" | "ja_conversa" | "novo" | "invalido";

export interface DiaPainel {
  dia: string;
  enviados: number;
  retomadas: number;
  responderam: number;
  interessados: number;
  pararam: number;
  vendas?: number;
}

export interface PainelVoob {
  dias: number;
  desde: string;
  total: {
    base: number;
    base_pronta: number;
    na_fila: number;
    enviados: number;
    retomadas: number;
    responderam: number;
    interessados: number;
    sem_interesse: number;
    pararam: number;
    no_crm: number;
    pulados: number;
    erros: number;
    descartados: number;
    /** Compraram depois da 1ª mensagem. */
    vendas?: number;
  };
  periodo: {
    enviados: number;
    retomadas: number;
    responderam: number;
    interessados: number;
    sem_interesse: number;
    pararam: number;
    adicionados: number;
    vendas?: number;
  };
  serie: DiaPainel[];
  ligado: boolean;
  pausado_motivo: string | null;
  pausado_em: string | null;
}

/** Uma empresa achada no Google, já olhada com os olhos da Voob. */
export interface ResultadoBusca {
  placeId: string;
  negocio: string;
  telefone: string;
  telefoneExibicao: string;
  celular: boolean;
  categoria: string;
  termo: string;
  cidade: string;
  uf: string;
  bairro: string;
  endereco: string;
  site: string;
  siteSituacao: SituacaoSite;
  /** Raio-X feito: o resultado; os problemas em português (só quando desatualizado). */
  raioX?: "ok" | "desatualizado" | "nao_conferido";
  siteProblemas?: string[];
  nota: number | null;
  avaliacoes: number | null;
  mapsUrl: string;
  /** Na base / já é da Voob / novo (só para celulares). "sem_conferir": o Voob CRM não respondeu. */
  situacao: SituacaoConferida | "fixo" | "sem_conferir";
}

// ---------------------------------------------------------------- busca automática, saúde do número e sugestão de limite
// (migração 20261112210000_radar_busca_saude, 12/11/2026)

export interface ConfigBuscaAuto {
  ligado: boolean;
  /** A base precisa ter empresas para quantos dias de disparo (limite × dias). */
  fila_dias: number;
  max_consultas_dia: number;
  /** Consultas do mês que ficam guardadas para a busca manual (a cota do Google é uma só para o Lavacar e a Voob). */
  reserva_cota: number;
  /** Depois de quantos dias a mesma busca (termo em lugar) pode ser feita de novo. */
  refazer_dias: number;
}

export interface RodadaBuscaAuto {
  id: number;
  origem: "rotina" | "manual";
  quem: string | null;
  inicio: string;
  fim: string | null;
  precisava: number;
  consultas: number;
  adicionados: number;
  motivo: string | null;
  texto: string | null;
  erro: string | null;
}

export interface FeitaBuscaVoob {
  termo: string;
  lugar: string;
  cheia: boolean;
  novos: number;
}

export interface EstadoBuscaAuto {
  config: ConfigBuscaAuto;
  perfil: PerfilBusca;
  limite: number;
  dias: number[];
  situacoes_site: SituacaoSite[];
  ligado: boolean;
  dia_de_disparo: boolean;
  base_pronta: number;
  consultas_hoje: number;
  rodando: boolean;
  feitas: FeitaBuscaVoob[];
  ultimas: RodadaBuscaAuto[];
}

export type FreioVoob = "normal" | "metade" | "pausado" | "sem_leitura" | "sem_numero";

export interface SugestaoLimite {
  pode: boolean;
  motivo: "maximo" | "sem_numero" | "dias" | "qualidade" | "saidas" | "pausa" | null;
  texto: string;
  atual: number;
  novo: number;
  dias_cheios: number;
  dias_precisa: number;
  cheio_a_partir: number;
  enviados: number;
  saidas: number;
  saidas_pct: number | null;
}

export interface SaudeVoob {
  numero: { final: string; conectado: boolean; nome: string | null } | null;
  freio: FreioVoob;
  qualidade_radar: string | null;
  limite_configurado: number;
  limite_efetivo: number;
  leitura: {
    qualidade: string | null;
    status: string | null;
    nome_status: string | null;
    limite_meta: string | null;
    pode_enviar: string | null;
    avisos: string[];
    checado_em: string | null;
    tentativa_em: string | null;
    ok: boolean | null;
    erro: string | null;
    falhas: number;
    pedido_em: string | null;
    esperando: boolean;
  } | null;
  enviados_hoje: number;
  saidas_7d: number;
  sem_interesse_7d: number;
  erros_7d: number;
  sugestao: SugestaoLimite;
  /** Só na simulação. */
  simulacao?: boolean;
}
