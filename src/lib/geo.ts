import type { Rect } from "./types";

/** "Belo Horizonte - MG" / "São Paulo/SP" / "Contagem, MG" -> nome da cidade. */
export function cityFromInput(input: string): string {
  return input
    .split(",")[0]
    .replace(/\s*[-–/]\s*[A-Za-z]{2}\s*$/, "")
    .trim();
}

/** Divide a área da cidade em n × n retângulos (varredura ampla/máxima). */
export function splitRect(rect: Rect, n: number): Rect[] {
  if (n <= 1) return [rect];
  const { low, high } = rect;
  const dLat = (high.latitude - low.latitude) / n;
  const dLng = (high.longitude - low.longitude) / n;
  const cells: Rect[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      cells.push({
        low: { latitude: low.latitude + dLat * i, longitude: low.longitude + dLng * j },
        high: { latitude: low.latitude + dLat * (i + 1), longitude: low.longitude + dLng * (j + 1) },
      });
    }
  }
  return cells;
}

/** O Google entrega no máximo 60 lugares por consulta (3 páginas de 20). */
export const PAGINAS_POR_CONSULTA = 3;
export const LUGARES_POR_PAGINA = 20;
/** Quantas vezes uma área cheia pode ser dividida em 4 (3 níveis = até 64 pedaços). */
export const MAX_DIVISOES = 3;

export const QUANTIDADES = [20, 50, 100, 200, 500] as const;

/**
 * Limite de consultas sugerido para achar `alvo` contatos novos.
 * Em média cada consulta (20 lugares) rende de 3 a 8 contatos novos com celular;
 * a sugestão cobre o caso mais fraco. A busca para antes se chegar ao alvo.
 */
export function sugerirLimite(alvo: number, combinacoes: number, maximo: number): number {
  const base = Math.max(5, Math.ceil(alvo / 2.5), combinacoes);
  return Math.max(1, Math.min(base, maximo));
}

export function splitLines(text: string): string[] {
  const seen = new Set<string>();
  return text
    .split(/\n|;/)
    .map((t) => t.trim())
    .filter((t) => {
      const k = t.toLowerCase();
      if (!t || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}
