import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testa as chamadas reais ao Google (Places e Sheets) com fetch simulado:
 * formato da requisição, deduplicação contra a planilha e mensagens de erro.
 */

vi.mock("google-auth-library", () => ({
  JWT: class {
    async getAccessToken() {
      return { token: "token-de-teste" };
    }
  },
}));

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function mockFetch(handler: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const { status = 200, body } = handler(url, init);
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MOCK_MODE", "");
  vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify({ client_email: "robo@proj.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n" }));
  vi.stubEnv("SHEET_ID", "PLANILHA123");
  vi.stubEnv("SHEET_TAB", "leads");
  vi.stubEnv("DEDUP_EXTRA_TABS", "historico_carol,historico_sofia"); // sofia não existe na planilha de teste
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Places API (New)", () => {
  it("monta a requisição certa e converte os lugares", async () => {
    mockFetch(() => ({
      body: {
        places: [
          {
            id: "p1",
            displayName: { text: "Lava Jato Centro" },
            internationalPhoneNumber: "+55 31 98888-7777",
            formattedAddress: "Av. Afonso Pena, 1 - Centro, Belo Horizonte - MG",
            businessStatus: "OPERATIONAL",
          },
        ],
        nextPageToken: "TOKEN2",
      },
    }));
    const { searchPage } = await import("@/lib/places");
    const rect = { low: { latitude: -20, longitude: -44 }, high: { latitude: -19.9, longitude: -43.9 } };
    const r = await searchPage({ textQuery: "lava jato", termo: "lava jato", cidade: "Belo Horizonte - MG", rect, pageToken: "TOKEN1" }, "CHAVE");

    const { url, init } = calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("CHAVE");
    expect(headers["X-Goog-FieldMask"]).toContain("places.nationalPhoneNumber");
    expect(headers["X-Goog-FieldMask"]).toContain("nextPageToken");
    expect(JSON.parse(String(init?.body))).toEqual({
      textQuery: "lava jato",
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize: 20,
      includePureServiceAreaBusinesses: true,
      locationRestriction: { rectangle: rect },
      pageToken: "TOKEN1",
    });
    expect(r.nextPageToken).toBe("TOKEN2");
    expect(r.leads[0]).toMatchObject({ telefone: "5531988887777", nome: "Lava Jato Centro", cidade: "Belo Horizonte" });
  });

  it("explica erro de faturamento em português", async () => {
    mockFetch(() => ({ status: 403, body: { error: { status: "PERMISSION_DENIED", message: "This API method requires billing to be enabled." } } }));
    const { searchPage } = await import("@/lib/places");
    await expect(searchPage({ textQuery: "x", termo: "x", cidade: "BH" }, "K")).rejects.toThrow(/faturamento/);
  });
});

describe("Google Sheets (conta de serviço)", () => {
  function sheetHandler(url: string, init?: RequestInit) {
    if (url.includes("?fields=")) return { body: { properties: { title: "Leads Lava-jatos" }, sheets: [{ properties: { title: "leads" } }, { properties: { title: "historico_carol" } }] } };
    if (url.includes("values:batchGet")) return { body: { valueRanges: [{ values: [["remote_jid", "msg"], ["5531977776666@s.whatsapp.net", "oi"]] }] } };
    if (url.includes(":append")) return { body: { updates: { updatedRows: 1 } } };
    if (url.includes("/values/") && (!init || init.method !== "POST"))
      return {
        body: {
          values: [
            ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout"],
            ["5531982999779", "Jean Lopes", "Autônomo", "Belo Horizonte", "pendente"],
          ],
        },
      };
    return { status: 404, body: {} };
  }

  it("grava só os novos, no formato da aba leads, com valueInputOption=RAW", async () => {
    mockFetch(sheetHandler);
    const { appendLeads } = await import("@/lib/sheets");
    const r = await appendLeads([
      { telefone: "5531982999779", nome: "Jean de novo", tipo: "Autônomo", cidade: "Belo Horizonte" },
      { telefone: "5531977776666", nome: "Já falou com a Carol", tipo: "Empresa", cidade: "Belo Horizonte" },
      { telefone: "5531955554444", nome: "Lava Jato Novo", tipo: "Empresa", cidade: "Contagem" },
    ]);

    expect(r.adicionados.map((a) => a.nome)).toEqual(["Lava Jato Novo"]);
    expect(r.ignorados.map((i) => i.motivo)).toEqual(["ja_na_planilha", "ja_na_planilha"]);

    const batch = calls.find((c) => c.url.includes("values:batchGet"))!;
    expect(batch.url).toContain("historico_carol");
    expect(batch.url).not.toContain("historico_sofia"); // aba inexistente é ignorada, não trava o envio

    const append = calls.find((c) => c.url.includes(":append"))!;
    expect(append.url).toContain("/PLANILHA123/values/'leads'!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS");
    expect((append.init?.headers as Record<string, string>).Authorization).toBe("Bearer token-de-teste");
    expect(JSON.parse(String(append.init?.body)).values).toEqual([["5531955554444", "Lava Jato Novo", "Empresa", "Contagem", "pendente", "", ""]]);
  });

  it("não chama o append quando todos já estão na planilha", async () => {
    mockFetch(sheetHandler);
    const { appendLeads } = await import("@/lib/sheets");
    const r = await appendLeads([{ telefone: "(31) 98299-9779", nome: "Jean", tipo: "Autônomo", cidade: "BH" }]);
    expect(r.adicionados).toHaveLength(0);
    expect(calls.some((c) => c.url.includes(":append"))).toBe(false);
  });

  it("explica quando a planilha não foi compartilhada com a conta de serviço", async () => {
    mockFetch(() => ({ status: 403, body: { error: { message: "The caller does not have permission" } } }));
    const { appendLeads } = await import("@/lib/sheets");
    await expect(appendLeads([{ telefone: "5531955554444", nome: "X", tipo: "Empresa", cidade: "BH" }])).rejects.toThrow(
      /robo@proj\.iam\.gserviceaccount\.com como Editor/,
    );
  });

  it("recusa aba sem a coluna telefone", async () => {
    mockFetch((url, init) => {
      if (url.includes("/values/") && !url.includes("batchGet") && (!init || init.method !== "POST")) return { body: { values: [["nome", "cidade"]] } };
      return sheetHandler(url, init);
    });
    const { appendLeads } = await import("@/lib/sheets");
    await expect(appendLeads([{ telefone: "5531955554444", nome: "X", tipo: "Empresa", cidade: "BH" }])).rejects.toThrow(/Faltam colunas.*telefone/);
  });

  it("se outro envio gravou o mesmo telefone ao mesmo tempo, a linha repetida vira 'duplicado'", async () => {
    let leituras = 0;
    mockFetch((url, init) => {
      if (url.includes(":append")) return { body: { updates: { updatedRange: "leads!A4:G5" } } };
      if (url.includes("values:batchUpdate")) return { body: {} };
      if (url.includes("/values/") && !url.includes("batchGet") && (!init || init.method !== "POST")) {
        leituras++;
        const base = [
          ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout"],
          ["5531982999779", "Jean Lopes", "Autônomo", "Belo Horizonte", "pendente"],
        ];
        if (leituras === 1) return { body: { values: base } };
        // Depois do append: outra instância gravou o 5531944443333 na linha 3, antes das nossas.
        return {
          body: {
            values: [
              ...base,
              ["5531944443333", "Gravado por outro envio", "Empresa", "BH", "pendente"],
              ["5531955554444", "Nosso novo", "Empresa", "BH", "pendente"],
              ["5531944443333", "Nosso repetido", "Empresa", "BH", "pendente"],
            ],
          },
        };
      }
      return sheetHandler(url, init);
    });
    const { appendLeads } = await import("@/lib/sheets");
    const r = await appendLeads([
      { telefone: "5531955554444", nome: "Nosso novo", tipo: "Empresa", cidade: "BH" },
      { telefone: "5531944443333", nome: "Nosso repetido", tipo: "Empresa", cidade: "BH" },
    ]);
    const upd = calls.find((c) => c.url.includes("values:batchUpdate"))!;
    expect(JSON.parse(String(upd.init?.body)).data).toEqual([{ range: "'leads'!E5", values: [["duplicado"]] }]);
    expect(r.adicionados.map((a) => a.nome)).toEqual(["Nosso novo"]);
    expect(r.ignorados.map((i) => i.nome)).toContain("Nosso repetido");
  });
});
