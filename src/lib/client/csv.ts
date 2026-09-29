"use client";

import type { Lead } from "@/lib/types";

const COLS: [string, (l: Lead) => string | number | null][] = [
  ["telefone", (l) => l.telefone],
  ["nome", (l) => l.nome],
  ["tipo", (l) => l.tipo],
  ["cidade", (l) => l.cidade],
  ["uf", (l) => l.uf],
  ["bairro", (l) => l.bairro],
  ["telefone_tipo", (l) => l.telefoneTipo],
  ["endereco", (l) => l.endereco],
  ["site", (l) => l.site],
  ["nota", (l) => l.nota],
  ["avaliacoes", (l) => l.avaliacoes],
  ["categoria", (l) => l.categoria],
  ["situacao_planilha", (l) => l.planilha],
  ["google_maps", (l) => l.mapsUrl],
];

function cell(v: string | number | null): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita fórmula ao abrir no Excel
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV com ";" e BOM: abre certo no Excel em português. */
export function downloadCsv(leads: Lead[], nome: string) {
  const lines = [COLS.map((c) => c[0]).join(";"), ...leads.map((l) => COLS.map(([, f]) => cell(f(l))).join(";"))];
  const blob = new Blob([String.fromCharCode(0xfeff) + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
