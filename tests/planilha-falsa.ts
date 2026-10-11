/** Aplica um values:batchUpdate do Sheets numa planilha em memória (ex.: "'leads'!E3", "'leads'!H1"). */
export function aplicarBatchUpdate(planilha: unknown[][], data: { range: string; values: unknown[][] }[]) {
  for (const d of data) {
    const m = /!([A-Z]+)(\d+)$/.exec(d.range);
    if (!m) throw new Error(`range inesperado: ${d.range}`);
    const col = [...m[1]].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
    const linha = Number(m[2]) - 1;
    while (planilha.length <= linha) planilha.push([]);
    const row = planilha[linha];
    while (row.length <= col) row.push("");
    row[col] = d.values[0][0];
  }
}
