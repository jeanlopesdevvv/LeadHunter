import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { CABECALHO_LEADS, comoTexto, lerSenhaBanco, registrosComoAba, telefoneDoBanco } from "@/lib/banco-regras";

describe("regras da lista de leads no banco", () => {
  it("converte registros em aba com o mesmo cabeçalho da planilha", () => {
    const aba = registrosComoAba(CABECALHO_LEADS, [
      { telefone: "5531982999779", nome: "Jean", tipo: null, cidade: "BH", status: "pendente", template: undefined },
    ]);
    expect(aba[0]).toEqual(["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout", "template"]);
    expect(aba[1]).toEqual(["5531982999779", "Jean", "", "BH", "pendente", "", "", ""]);
  });

  it("data vira ISO e número vira texto", () => {
    expect(comoTexto(new Date("2026-10-15T12:00:00Z"))).toBe("2026-10-15T12:00:00.000Z");
    expect(comoTexto(3)).toBe("3");
    expect(comoTexto(null)).toBe("");
  });

  it("telefone vai para o banco só com dígitos e no formato da Carol", () => {
    expect(telefoneDoBanco("(31) 98299-9779")).toBe("5531982999779");
    expect(telefoneDoBanco("+55 31 3376-1558")).toBe("553133761558");
    expect(telefoneDoBanco("abc")).toBe("");
  });

  it("acha a senha do banco com o nome que foi posto no painel", () => {
    expect(lerSenhaBanco({ "radar-atendimento": " s3nha " })).toBe("s3nha");
    expect(lerSenhaBanco({ RADAR_ATENDIMENTO_SENHA: "a", "radar-atendimento": "b" })).toBe("a");
    expect(lerSenhaBanco({})).toBe("");
  });
});

/**
 * Integração com um Postgres de verdade (schema atendimento). Só roda com RADAR_TESTE_BANCO_URL
 * (ex.: postgres://radar_atendimento:x@localhost:55432/postgres?sslmode=disable) e
 * RADAR_TESTE_BANCO_ADMIN_URL (dono do schema, para preparar os dados).
 */
const URL_TESTE = process.env.RADAR_TESTE_BANCO_URL;
const URL_ADMIN = process.env.RADAR_TESTE_BANCO_ADMIN_URL;

describe.skipIf(!URL_TESTE || !URL_ADMIN)("lista de leads no banco (integração)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any;

  beforeAll(async () => {
    process.env.ATENDIMENTO_DATABASE_URL = URL_TESTE;
    delete process.env.MOCK_MODE;
    const postgres = (await import("postgres")).default;
    admin = postgres(URL_ADMIN!, { max: 1 });
  });

  afterAll(async () => {
    await admin?.end();
    const g = globalThis as unknown as { __radarBanco?: { end: () => Promise<void> } | null };
    await g.__radarBanco?.end();
    g.__radarBanco = null;
  });

  beforeEach(async () => {
    await admin`truncate atendimento.leads`;
    await admin`
      insert into atendimento.leads (telefone, nome, tipo, cidade, status, mensagem_enviada_em, optout) values
        ('5531982999779', 'Jean Lopes', 'Autônomo', 'Belo Horizonte', 'pendente', '30/09/2026, 00:15:21', ''),
        ('5531973365898', 'Lava Jato Top Cleaner', 'Empresa', 'Belo Horizonte', 'enviado', '10/10/2026, 17:11:11', ''),
        ('5531977776666', 'Sem Interesse', 'Empresa', 'Contagem', 'enviado', '10/10/2026, 17:20:00', '10/10/2026, 18:00:00')`;
    const s = await import("@/lib/sheets");
    s.esquecerAbaLeads();
  });

  it("usa o banco quando a senha/endereço está no ambiente", async () => {
    const { usaBanco, sheetUrl } = await import("@/lib/sheets");
    expect(usaBanco()).toBe(true);
    expect(sheetUrl()).toBe("");
  });

  it("lê a lista na ordem de chegada, no mesmo formato da aba", async () => {
    const { lerAbaLeads } = await import("@/lib/sheets");
    const { headers, map, rows } = await lerAbaLeads(0);
    expect(headers).toContain("status");
    expect(map.telefone).toBe(0);
    expect(rows.map((r) => (r as string[])[0])).toEqual(["5531982999779", "5531973365898", "5531977776666"]);
  });

  it("existentes: telefones da lista e dos históricos; opt-out separado", async () => {
    const { loadExisting } = await import("@/lib/sheets");
    const e = await loadExisting();
    expect(e.keys.has("5531982999779")).toBe(true);
    expect(e.keys.has("5531911112222")).toBe(true); // está só no historico_carol
    expect(e.keys.has("5531933334444")).toBe(true); // está só no historico_sofia
    expect([...e.optout]).toEqual(["5531977776666"]);
    expect(e.rows).toBe(3);
  });

  it("muda status pela chave e nunca desfaz um 'enviado'", async () => {
    const { atualizarStatusLinhas } = await import("@/lib/sheets");
    await atualizarStatusLinhas([
      { linha: 99, key: "5531982999779", status: "aguardando", de: "pendente", template: "carol_prospeccao_lavajato" },
      { linha: 99, key: "5531973365898", status: "aguardando", de: "pendente" },
    ]);
    const r = await admin`select telefone, status, template from atendimento.leads order by ordem`;
    expect(r[0]).toMatchObject({ status: "aguardando", template: "carol_prospeccao_lavajato" });
    expect(r[1]).toMatchObject({ status: "enviado", template: null });
  });

  it("chave que não existe: não grava nada e avisa", async () => {
    const { atualizarStatusLinhas } = await import("@/lib/sheets");
    await expect(
      atualizarStatusLinhas([
        { linha: 2, key: "5531982999779", status: "aguardando" },
        { linha: 3, key: "5531900000000", status: "aguardando" },
      ]),
    ).rejects.toMatchObject({ status: 409 });
    const r = await admin`select status from atendimento.leads where telefone = '5531982999779'`;
    expect(r[0].status).toBe("pendente");
  });

  it("grava contatos novos e ignora quem já está, pediu para sair ou repetiu", async () => {
    const { appendLeads } = await import("@/lib/sheets");
    const r = await appendLeads([
      { telefone: "5531988887777", nome: "Novo Lava", tipo: "Empresa", cidade: "Betim" },
      { telefone: "5531988887777", nome: "Novo Lava (de novo)", tipo: "Empresa", cidade: "Betim" },
      { telefone: "5531982999779", nome: "Jean", tipo: "Autônomo", cidade: "BH" },
      { telefone: "5531977776666", nome: "Sem Interesse", tipo: "Empresa", cidade: "Contagem" },
      { telefone: "5531911112222", nome: "Já conversou", tipo: "Empresa", cidade: "BH" },
      { telefone: "", nome: "Sem telefone", tipo: "Empresa", cidade: "BH" },
    ]);
    expect(r.adicionados.map((a) => a.telefone)).toEqual(["5531988887777"]);
    expect(Object.fromEntries(r.ignorados.map((i) => [i.nome, i.motivo]))).toEqual({
      "Novo Lava (de novo)": "repetido_no_lote",
      Jean: "ja_na_planilha",
      "Sem Interesse": "optout",
      "Já conversou": "ja_na_planilha",
      "Sem telefone": "telefone_invalido",
    });
    expect(r.planilhaUrl).toBe("");
    const novo = await admin`select status, ordem from atendimento.leads where telefone = '5531988887777'`;
    expect(novo[0].status).toBe("pendente");
    expect(Number(novo[0].ordem)).toBeGreaterThan(0);
  });

  it("o Desempenho lê as abas do banco", async () => {
    const { painelDaCarol } = await import("@/lib/painel");
    const p = await painelDaCarol("tudo");
    expect(p).toBeTruthy();
    const { lerAbas } = await import("@/lib/sheets");
    const { dados } = await lerAbas(["leads", "historico_carol", "status_meta_carol", "sessoes_carol", "nao_existe"], 0);
    expect(Object.keys(dados).sort()).toEqual(["historico_carol", "leads", "sessoes_carol", "status_meta_carol"]);
    expect(dados.historico_carol[0]).toEqual(["telefone", "timestamp", "remetente", "mensagem", "remoteJid"]);
  });

  it("situação para a tela de Configuração", async () => {
    const { sheetStatus } = await import("@/lib/sheets");
    const s = await sheetStatus();
    expect(s).toMatchObject({ ok: true, fonte: "banco", linhas: 3, telefonesUnicos: 3, optout: 1, planilhaUrl: "" });
  });

  it("o usuário do Radar não consegue apagar leads", async () => {
    const postgres = (await import("postgres")).default;
    const radar = postgres(URL_TESTE!, { max: 1 });
    await expect(radar`delete from atendimento.leads`).rejects.toThrow(/permission denied/);
    await radar.end();
  });
});
