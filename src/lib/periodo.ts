/**
 * Período da cota grátis do Google Maps Platform.
 * O Google fecha o mês no horário do Pacífico (EUA), com horário de verão:
 * a cota volta no dia 1º às 00:00 de lá = 04:00 ou 05:00 em Brasília.
 */

export const FUSO_GOOGLE = "America/Los_Angeles";
export const FUSO_BRASIL = "America/Sao_Paulo";

function partes(instante: number, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour),
    minuto: Number(p.minute),
    segundo: Number(p.second),
  };
}

/** Quanto o relógio do fuso está à frente (+) ou atrás (−) do UTC, em ms. */
function deslocamento(instante: number, timeZone: string): number {
  const p = partes(instante, timeZone);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

/** Meia-noite do dia (ano, mês 1–12, dia) no fuso, como instante UTC. */
export function meiaNoite(ano: number, mes: number, dia: number, timeZone: string): number {
  const palpite = Date.UTC(ano, mes - 1, dia);
  let t = palpite - deslocamento(palpite, timeZone);
  t = palpite - deslocamento(t, timeZone); // acerta perto da troca de horário de verão
  return t;
}

export interface Periodo {
  inicio: number;
  fim: number;
}

/** Mês atual da cota: [1º do mês 00:00 Pacífico, 1º do próximo mês 00:00 Pacífico). */
export function periodoDaCota(agora = Date.now()): Periodo {
  const { ano, mes } = partes(agora, FUSO_GOOGLE);
  const inicio = meiaNoite(ano, mes, 1, FUSO_GOOGLE);
  const fim = mes === 12 ? meiaNoite(ano + 1, 1, 1, FUSO_GOOGLE) : meiaNoite(ano, mes + 1, 1, FUSO_GOOGLE);
  return { inicio, fim };
}

const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "quinta-feira, 1º de outubro, às 04:00" (horário de Brasília). */
export function formatarRenovacao(iso: string | number): string {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  const p = partes(t, FUSO_BRASIL);
  const semana = new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay();
  const dia = p.dia === 1 ? "1º" : String(p.dia);
  const hora = `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
  return `${DIAS[semana]}, ${dia} de ${MESES[p.mes - 1]}, às ${hora}`;
}

/** "01/10 às 04:00" (horário de Brasília). */
export function formatarRenovacaoCurta(iso: string | number): string {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  const p = partes(t, FUSO_BRASIL);
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(p.dia)}/${dd(p.mes)} às ${dd(p.hora)}:${dd(p.minuto)}`;
}

/** "em 2 dias", "em 5 horas", "em 12 minutos". */
export function tempoAte(iso: string | number, agora = Date.now()): string {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  const min = Math.max(0, Math.round((t - agora) / 60_000));
  if (min < 60) return `em ${min} minuto${min === 1 ? "" : "s"}`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `em ${horas} hora${horas === 1 ? "" : "s"}`;
  const dias = Math.round(horas / 24);
  return `em ${dias} dias`;
}

/** "14:32" em Brasília. */
export function horaBrasilia(iso: string | number): string {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  const p = partes(t, FUSO_BRASIL);
  return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

/** "às 21:26" se for hoje; "em 10/09 às 10:00" se for outro dia (Brasília). */
export function quandoCurto(iso: string | number, agora = Date.now()): string {
  const t = typeof iso === "number" ? iso : Date.parse(iso);
  const p = partes(t, FUSO_BRASIL);
  const h = partes(agora, FUSO_BRASIL);
  const hora = `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
  if (p.ano === h.ano && p.mes === h.mes && p.dia === h.dia) return `às ${hora}`;
  return `em ${String(p.dia).padStart(2, "0")}/${String(p.mes).padStart(2, "0")} às ${hora}`;
}
