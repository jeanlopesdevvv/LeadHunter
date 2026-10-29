/**
 * Fila do atendente (29/10/2026): quem está esperando alguém da equipe, lido de atendimento.fila_atendente().
 * Carol (vendas) → Henrique; Sofia (suporte) → Pedro. O n8n manda o lembrete com 15 e 60 minutos no horário
 * da equipe (segunda a sexta, das 8h às 18h); aqui o Radar só mostra a fila.
 */

export type CanalFila = "carol" | "sofia";
export type TipoEspera = "pedido" | "respondeu_depois";
export type Urgencia = "ok" | "atencao" | "atrasado";

export interface ItemFila {
  canal: CanalFila;
  telefone: string;
  nome: string;
  tipo: TipoEspera;
  desde: string;
  minutosTotal: number;
  minutosUteis: number;
  ultimaMensagem: string;
  linkConversa: string | null;
  lembretes: number;
}

export interface FilaAtendente {
  disponivel: boolean;
  equipeNoHorario: boolean;
  itens: ItemFila[];
}

const LINK_CHATWOOT = /^https:\/\/chat\.lavacar\.app\/app\/accounts\/\d+\/conversations\/\d+$/;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Linha do banco → item da fila (descarta o que não tem número ou canal conhecido). */
export function comoItemDaFila(r: Record<string, unknown>): ItemFila | null {
  const canal = String(r.canal ?? "");
  if (canal !== "carol" && canal !== "sofia") return null;
  const telefone = String(r.telefone || r.remote_jid || "").split("@")[0].replace(/\D/g, "");
  if (telefone.length < 10) return null;
  const desde = r.esperando_desde instanceof Date ? r.esperando_desde.toISOString() : String(r.esperando_desde ?? "");
  const link = String(r.link_conversa ?? "").trim();
  return {
    canal,
    telefone,
    nome: String(r.nome ?? "").trim(),
    tipo: r.tipo_espera === "respondeu_depois" ? "respondeu_depois" : "pedido",
    desde,
    minutosTotal: num(r.minutos_total),
    minutosUteis: num(r.minutos_uteis),
    ultimaMensagem: String(r.ultima_msg ?? "").trim(),
    linkConversa: LINK_CHATWOOT.test(link) ? link : null,
    lembretes: num(r.lembretes),
  };
}

/** 17 → "17 min"; 75 → "1h15"; 1500 → "1 dia e 1h". */
export function tempoDeEspera(min: number): string {
  const m = Math.max(0, Math.floor(min || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const resto = m % 60;
  if (h < 24) return `${h}h${resto ? String(resto).padStart(2, "0") : ""}`;
  const d = Math.floor(h / 24);
  const hr = h % 24;
  return `${d} ${d === 1 ? "dia" : "dias"}${hr ? ` e ${hr}h` : ""}`;
}

/** Cor do tempo: conta só os minutos no horário da equipe (o mesmo critério dos lembretes). */
export function urgencia(minutosUteis: number): Urgencia {
  if (minutosUteis >= 60) return "atrasado";
  if (minutosUteis >= 15) return "atencao";
  return "ok";
}

export const RESPONSAVEL: Record<CanalFila, string> = { carol: "Henrique", sofia: "Pedro" };
