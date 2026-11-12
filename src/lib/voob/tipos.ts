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
}

export interface PerfilBusca {
  cidade?: string;
  segmentos?: string[];
  termos_extras?: string[];
  bairros?: string[];
  so_sem_site?: boolean;
}

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
  modelos: { abertura: SituacaoModelo | null; retomada: SituacaoModelo | null };
  hoje: Hoje;
  base: Partial<Record<StatusLead, number>>;
  /** Na base, para quem a 1ª mensagem serve (hoje: sem site ou só rede social). */
  base_pronta: number;
  prontidao: Prontidao[];
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
  };
  periodo: {
    enviados: number;
    retomadas: number;
    responderam: number;
    interessados: number;
    sem_interesse: number;
    pararam: number;
    adicionados: number;
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
  nota: number | null;
  avaliacoes: number | null;
  mapsUrl: string;
  /** Na base / já é da Voob / novo (só para celulares). "sem_conferir": o Voob CRM não respondeu. */
  situacao: SituacaoConferida | "fixo" | "sem_conferir";
}
