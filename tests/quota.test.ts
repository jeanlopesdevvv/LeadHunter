import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { formatarRenovacao, formatarRenovacaoCurta, periodoDaCota, tempoAte } from "@/lib/periodo";

/**
 * Cota grátis do mês: período no horário do Pacífico, leitura do Cloud Monitoring
 * e bloqueio quando acaba.
 */

describe("período da cota (horário do Pacífico)", () => {
  it("setembro: renova em 1º de outubro às 04:00 de Brasília (horário de verão nos EUA)", () => {
    const p = periodoDaCota(Date.parse("2026-09-29T23:41:00Z"));
    expect(new Date(p.inicio).toISOString()).toBe("2026-09-01T07:00:00.000Z");
    expect(new Date(p.fim).toISOString()).toBe("2026-10-01T07:00:00.000Z");
    expect(formatarRenovacao(p.fim)).toBe("quinta-feira, 1º de outubro, às 04:00");
    expect(formatarRenovacaoCurta(p.fim)).toBe("01/10 às 04:00");
  });

  it("novembro: começa ainda no horário de verão e renova às 05:00 de Brasília", () => {
    const p = periodoDaCota(Date.parse("2026-11-15T12:00:00Z"));
    expect(new Date(p.inicio).toISOString()).toBe("2026-11-01T07:00:00.000Z");
    expect(new Date(p.fim).toISOString()).toBe("2026-12-01T08:00:00.000Z");
    expect(formatarRenovacao(p.fim)).toBe("terça-feira, 1º de dezembro, às 05:00");
  });

  it("dezembro vira o ano", () => {
    const p = periodoDaCota(Date.parse("2026-12-31T20:00:00Z"));
    expect(new Date(p.fim).toISOString()).toBe("2027-01-01T08:00:00.000Z");
  });

  it("de madrugada no Brasil do dia 1º ainda é o mês anterior no Pacífico", () => {
    const p = periodoDaCota(Date.parse("2026-10-01T06:59:59Z")); // 03:59 em Brasília
    expect(new Date(p.inicio).toISOString()).toBe("2026-09-01T07:00:00.000Z");
    const depois = periodoDaCota(Date.parse("2026-10-01T07:00:00Z"));
    expect(new Date(depois.inicio).toISOString()).toBe("2026-10-01T07:00:00.000Z");
  });

  it("tempo até a renovação em linguagem simples", () => {
    const agora = Date.parse("2026-09-29T23:41:00Z");
    expect(tempoAte("2026-10-01T07:00:00Z", agora)).toBe("em 31 horas");
    expect(tempoAte("2026-10-05T07:00:00Z", agora)).toBe("em 5 dias");
    expect(tempoAte("2026-09-29T23:52:00Z", agora)).toBe("em 11 minutos");
  });
});

vi.mock("google-auth-library", () => ({
  JWT: class {
    async getAccessToken() {
      return { token: "token-de-teste" };
    }
  },
}));

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

function mockFetch(handler: (url: string) => { status?: number; body: unknown }) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const { status = 200, body } = handler(url);
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

function serie(method: string, valor: number) {
  return { resource: { labels: { method } }, points: [{ value: { int64Value: String(valor) } }] };
}

describe("contador de consultas (Cloud Monitoring)", () => {
  const AGORA = Date.parse("2026-09-29T23:41:00Z");

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("MOCK_MODE", "");
    vi.stubEnv(
      "GOOGLE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({ client_email: "radar@lavacar-sistema.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n" }),
    );
    vi.stubEnv("LIMITE_MENSAL_CONSULTAS", "");
    const { __reiniciarUso } = await import("@/lib/usage");
    __reiniciarUso();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("soma só as buscas (SearchText) com sucesso desde o 1º do mês", async () => {
    mockFetch((url) => {
      const u = new URL(url);
      const inicio = u.searchParams.get("interval.startTime");
      // parte antiga do mês: 130 buscas; últimos 35 min: 2
      const antiga = inicio === "2026-09-01T07:00:00.000Z";
      return {
        body: {
          timeSeries: [
            serie("google.maps.places.v1.Places.SearchText", antiga ? 130 : 2),
            serie("google.maps.places.v1.Places.GetPlace", 40), // área da cidade: outra cota
            serie("google.maps.places.v1.Places.AutocompletePlaces", 40),
          ],
        },
      };
    });
    const { obterUso } = await import("@/lib/usage");
    const uso = await obterUso({ agora: AGORA });
    expect(uso).toMatchObject({ fonte: "google", usadas: 132, limite: 1000, restantes: 868, bloquear: true, aviso: "" });
    expect(uso.renovaEm).toBe("2026-10-01T07:00:00.000Z");

    // Projeto tirado do e-mail da conta de serviço; filtro certo; um balde só por intervalo.
    const u = new URL(calls[0].url);
    expect(u.pathname).toBe("/v3/projects/lavacar-sistema/timeSeries");
    expect(u.searchParams.get("filter")).toContain('metric.type="serviceruntime.googleapis.com/api/request_count"');
    expect(u.searchParams.get("filter")).toContain('resource.labels.service="places.googleapis.com"');
    expect(u.searchParams.get("filter")).toContain('metric.labels.response_code_class="2xx"');
    expect(u.searchParams.get("aggregation.groupByFields")).toBe("resource.labels.method");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer token-de-teste");
    const intervalos = calls.map((c) => new URL(c.url).searchParams);
    const recente = intervalos.find((p) => p.get("interval.startTime") !== "2026-09-01T07:00:00.000Z")!;
    expect(Date.parse(recente.get("interval.endTime")!) - Date.parse(recente.get("interval.startTime")!)).toBe(35 * 60_000);
  });

  it("usa o registro do Radar quando o Google ainda não mostrou as buscas recentes", async () => {
    mockFetch(() => ({ body: { timeSeries: [serie("google.maps.places.v1.Places.SearchText", 10)] } }));
    const { obterUso, registrarConsulta } = await import("@/lib/usage");
    const antes = await obterUso({ agora: AGORA });
    expect(antes.usadas).toBe(20); // 10 antigas + 10 recentes
    for (let i = 0; i < 15; i++) registrarConsulta("busca", AGORA - 60_000);
    registrarConsulta("area", AGORA - 60_000); // não conta
    const depois = await obterUso({ agora: AGORA + 1000 }); // mesma leitura do Google (cache)
    expect(depois.usadas).toBe(10 + 15);
    expect(calls).toHaveLength(2);
  });

  it("sem permissão no Google Cloud: conta sozinho e explica o que fazer", async () => {
    mockFetch(() => ({ status: 403, body: { error: { message: "Permission monitoring.timeSeries.list denied" } } }));
    const { obterUso, registrarConsulta } = await import("@/lib/usage");
    registrarConsulta("busca", AGORA - 1000);
    const uso = await obterUso({ agora: AGORA });
    expect(uso.fonte).toBe("radar");
    expect(uso.usadas).toBe(1);
    expect(uso.aviso).toMatch(/Visualizador de monitoramento/);
    expect(uso.aviso).toContain("radar@lavacar-sistema.iam.gserviceaccount.com");
  });

  it("bloqueia a busca quando as consultas grátis acabam", async () => {
    vi.stubEnv("LIMITE_MENSAL_CONSULTAS", "3");
    mockFetch(() => ({ body: { timeSeries: [serie("google.maps.places.v1.Places.SearchText", 1)] } }));
    const { reservarConsulta } = await import("@/lib/usage");
    // 1 antiga + 1 recente = 2 usadas de 3: sobra 1
    const a = await reservarConsulta();
    expect(a.ok).toBe(true);
    // A primeira ainda está em andamento: a segunda já não cabe.
    const b = await reservarConsulta();
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.mensagem).toMatch(/As 3 consultas grátis deste mês acabaram\. Elas voltam em \d\d\/\d\d às \d\d:\d\d/);
    if (a.ok) a.concluir(false); // falhou: devolve a vaga
    const c = await reservarConsulta();
    expect(c.ok).toBe(true);
  });

  it("com BLOQUEAR_NO_LIMITE=0 deixa passar", async () => {
    vi.stubEnv("LIMITE_MENSAL_CONSULTAS", "1");
    vi.stubEnv("BLOQUEAR_NO_LIMITE", "0");
    mockFetch(() => ({ body: { timeSeries: [serie("google.maps.places.v1.Places.SearchText", 5)] } }));
    const { reservarConsulta } = await import("@/lib/usage");
    const r = await reservarConsulta();
    expect(r.ok).toBe(true);
    expect(r.uso.restantes).toBe(0);
  });
});

describe("área da cidade (Autocomplete + Place Details)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("usa a sessão do Autocomplete e guarda o resultado", async () => {
    const viewport = { low: { latitude: -20.06, longitude: -44.06 }, high: { latitude: -19.78, longitude: -43.86 } };
    mockFetch((url) =>
      url.includes(":autocomplete")
        ? { body: { suggestions: [{ placePrediction: { placeId: "ChIJ_BH", text: { text: "Belo Horizonte - MG, Brasil" } } }] } }
        : { body: { id: "ChIJ_BH", formattedAddress: "Belo Horizonte - MG, Brasil", viewport } },
    );
    const { resolveCityArea } = await import("@/lib/places");
    let chamadas = 0;
    const area = await resolveCityArea("Belo Horizonte - MG", "CHAVE", () => chamadas++);
    expect(area).toEqual({ entrada: "Belo Horizonte - MG", nome: "Belo Horizonte - MG, Brasil", viewport });
    expect(chamadas).toBe(2);

    const [ac, det] = calls;
    expect(ac.url).toBe("https://places.googleapis.com/v1/places:autocomplete");
    const body = JSON.parse(String(ac.init?.body));
    expect(body).toMatchObject({ input: "Belo Horizonte - MG", includedRegionCodes: ["br"], includedPrimaryTypes: ["(regions)"] });
    const detUrl = new URL(det.url);
    expect(detUrl.pathname).toBe("/v1/places/ChIJ_BH");
    expect(detUrl.searchParams.get("sessionToken")).toBe(body.sessionToken);
    expect((det.init?.headers as Record<string, string>)["X-Goog-FieldMask"]).toContain("viewport");
    expect(det.init?.method).toBe("GET");

    await resolveCityArea("belo horizonte - mg", "CHAVE");
    expect(calls).toHaveLength(2); // veio do cache
  });
});
