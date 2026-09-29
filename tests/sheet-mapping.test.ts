import { describe, expect, it } from "vitest";

import {
  buildHeaderMap,
  buildRow,
  columnLetter,
  findLateDuplicates,
  indexExisting,
  indexPhonesInTab,
  isOptout,
  missingRequired,
  parseUpdatedRows,
  planSend,
} from "@/lib/sheet-mapping";

const HEADERS = ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout"];

describe("cabeçalho da aba leads", () => {
  it("encontra as colunas da Carol pelo nome", () => {
    const map = buildHeaderMap(HEADERS);
    expect(map).toMatchObject({ telefone: 0, nome: 1, tipo: 2, cidade: 3, status: 4, mensagem_enviada_em: 5, optout: 6 });
    expect(missingRequired(map)).toEqual([]);
  });

  it("funciona com colunas em outra ordem, maiúsculas e acentos", () => {
    const map = buildHeaderMap(["Nome", "Cidade", " Telefone ", "STATUS", "Tipo", "Opt-out"]);
    expect(map).toMatchObject({ nome: 0, cidade: 1, telefone: 2, status: 3, tipo: 4, optout: 5 });
  });

  it("aponta colunas obrigatórias faltando", () => {
    expect(missingRequired(buildHeaderMap(["telefone", "nome"]))).toEqual(["tipo", "cidade", "status"]);
  });
});

describe("linha gerada", () => {
  it("segue exatamente o formato da planilha (print)", () => {
    const map = buildHeaderMap(HEADERS);
    const row = buildRow(HEADERS.length, map, { telefone: "5531982999779", nome: "Jean Lopes", tipo: "Autônomo", cidade: "Belo Horizonte" }, { status: "pendente", now: new Date() });
    expect(row).toEqual(["5531982999779", "Jean Lopes", "Autônomo", "Belo Horizonte", "pendente", "", ""]);
  });

  it("nunca escreve mensagem_enviada_em nem optout", () => {
    const map = buildHeaderMap(HEADERS);
    const row = buildRow(7, map, { telefone: "5531982999779", nome: "X", tipo: "Empresa", cidade: "BH" }, { status: "pendente", now: new Date() });
    expect(row[5]).toBe("");
    expect(row[6]).toBe("");
  });

  it("preenche colunas extras só se existirem no cabeçalho", () => {
    const headers = [...HEADERS, "site", "origem", "link_maps"];
    const map = buildHeaderMap(headers);
    const row = buildRow(headers.length, map, { telefone: "1", nome: "A", tipo: "Empresa", cidade: "BH", site: "https://a.com", mapsUrl: "https://maps" }, { status: "pendente", now: new Date() });
    expect(row.slice(7)).toEqual(["https://a.com", "Radar Lavacar", "https://maps"]);
  });
});

describe("deduplicação", () => {
  const map = buildHeaderMap(HEADERS);
  const rows = [
    ["5531982999779", "Jean Lopes", "Autônomo", "Belo Horizonte", "pendente", "", ""],
    ["(31) 3333-4444", "Fixo", "Empresa", "BH", "enviado", "", ""],
    ["5531991112233", "Saiu", "Empresa", "BH", "enviado", "01/09/2026", "sim"],
    ["", "", "", "", "", "", ""],
  ];
  const existing = indexExisting(rows, map);

  it("indexa telefones e opt-out", () => {
    expect(existing.rows).toBe(3);
    expect(existing.keys.size).toBe(3);
    expect(existing.optout.has("5531991112233")).toBe(true);
  });

  it("não reenvia quem já está, quem saiu, nem repetidos do lote", () => {
    const plan = planSend(
      [
        { telefone: "553182999779", nome: "Jean de novo (sem o 9)", tipo: "Autônomo", cidade: "BH" },
        { telefone: "5531991112233", nome: "Opt-out", tipo: "Empresa", cidade: "BH" },
        { telefone: "5531977776666", nome: "Novo", tipo: "Empresa", cidade: "BH" },
        { telefone: "(31) 97777-6666", nome: "Novo repetido", tipo: "Empresa", cidade: "BH" },
        { telefone: "", nome: "Sem telefone", tipo: "Empresa", cidade: "BH" },
      ],
      existing,
    );
    expect(plan.toAppend.map((l) => l.nome)).toEqual(["Novo"]);
    expect(plan.ignorados.map((i) => i.motivo)).toEqual(["ja_na_planilha", "optout", "repetido_no_lote", "telefone_invalido"]);
  });

  it("opt-out aceita vários jeitos de marcar", () => {
    for (const v of ["sim", "TRUE", "x", "1", "opt-out"]) expect(isOptout(v)).toBe(true);
    for (const v of ["", "não", "false", "0", null]) expect(isOptout(v)).toBe(false);
  });

  it("lê telefones de abas de histórico (incluindo JID do WhatsApp)", () => {
    const keys = indexPhonesInTab([
      ["data", "remote_jid", "mensagem"],
      ["01/09", "5531982999779@s.whatsapp.net", "oi"],
      ["01/09", "5531988887777", "oi"],
    ]);
    expect(keys.has("5531982999779")).toBe(true);
    expect(keys.has("5531988887777")).toBe(true);
  });

  it("acha telefones em qualquer coluna do histórico (ex.: chat_id)", () => {
    const keys = indexPhonesInTab([
      ["nome_contato", "chat_id"],
      ["Zé", "5531977776666@s.whatsapp.net"],
    ]);
    expect(keys.has("5531977776666")).toBe(true);
  });
});

describe("verificação depois de gravar (envios simultâneos)", () => {
  it("lê a faixa gravada pelo append", () => {
    expect(parseUpdatedRows("leads!A218:G230")).toEqual({ inicio: 218, fim: 230 });
    expect(parseUpdatedRows("'leads'!A5:G5")).toEqual({ inicio: 5, fim: 5 });
    expect(parseUpdatedRows("leads!A7")).toEqual({ inicio: 7, fim: 7 });
    expect(parseUpdatedRows(undefined)).toBeNull();
  });

  it("converte índice em letra de coluna", () => {
    expect([0, 4, 25, 26, 27].map(columnLetter)).toEqual(["A", "E", "Z", "AA", "AB"]);
  });

  it("marca só as linhas novas cujo telefone já existia antes delas", () => {
    const map = buildHeaderMap(HEADERS);
    const values = [
      HEADERS,
      ["5531982999779", "Jean"], // linha 2
      ["5531977776666", "Outro envio (concorrente)"], // linha 3
      ["5531955554444", "Nosso novo"], // linha 4 (nossa)
      ["5531977776666", "Nosso repetido"], // linha 5 (nossa)
    ];
    expect(findLateDuplicates(values, map, 4, 5)).toEqual([5]);
  });
});
