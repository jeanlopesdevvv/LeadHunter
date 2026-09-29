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

export const DEPTHS = {
  rapida: { label: "Rápida", grid: 1, descricao: "1 área · até 60 por termo" },
  ampla: { label: "Ampla", grid: 2, descricao: "4 áreas · até 240 por termo" },
  maxima: { label: "Máxima", grid: 3, descricao: "9 áreas · até 540 por termo" },
} as const;

export type Depth = keyof typeof DEPTHS;

/** Pior caso de consultas: 3 páginas por área + 1 consulta para achar a área da cidade. */
export function estimateRequests(termos: number, cidades: number, depth: Depth): number {
  const grid = DEPTHS[depth].grid;
  const areas = grid * grid;
  return termos * cidades * areas * 3 + (grid > 1 ? cidades : 0);
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
