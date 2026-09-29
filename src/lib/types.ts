import type { LeadTipo } from "./classify";
import type { PhoneKind } from "./phone";

export type { LeadTipo, PhoneKind };

/** Situação do lead em relação à aba "leads" da planilha. */
export type SheetState =
  | "desconhecido" // ainda não conferido
  | "novo" // não está na planilha
  | "existente" // já está na planilha
  | "optout" // está na planilha e pediu para não receber mensagens
  | "enviado"; // enviado agora por este app

export interface Lead {
  /** ID do Google (place id). */
  id: string;
  nome: string;
  /** 5531982999779 */
  telefone: string;
  telefoneKey: string;
  telefoneTipo: PhoneKind;
  telefoneExibicao: string;
  tipo: LeadTipo;
  tipoMotivos: string[];
  cidade: string;
  uf: string;
  bairro: string;
  endereco: string;
  site: string;
  mapsUrl: string;
  nota: number | null;
  avaliacoes: number | null;
  categoria: string;
  situacaoNegocio: string;
  semPontoFisico: boolean;
  termo: string;
  capturadoEm: string;
  planilha: SheetState;
}

export interface Rect {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
}

/** Uma consulta de busca (termo + local ou área). */
export interface SearchTask {
  id: string;
  termo: string;
  cidade: string;
  textQuery: string;
  rect?: Rect;
  area: number;
  areas: number;
}

export interface PageResult {
  leads: Lead[];
  nextPageToken: string | null;
  bruto: number;
}

export interface SendResultItem {
  key: string;
  telefone: string;
  nome: string;
  motivo?: "ja_na_planilha" | "optout" | "repetido_no_lote" | "telefone_invalido";
}

export interface SendResult {
  adicionados: SendResultItem[];
  ignorados: SendResultItem[];
  planilhaUrl: string;
  aba: string;
}

export interface CheckResult {
  existentes: string[];
  optout: string[];
  totalNaPlanilha: number;
  aba: string;
  statusPadrao: string;
  planilhaUrl: string;
}
