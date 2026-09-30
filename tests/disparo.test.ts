import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diaBrasilia, lerDataHora, linhasDaFila, naFila, progressoDoDisparo, resumoDoDia } from "@/lib/disparo-regras";
import { buildHeaderMap } from "@/lib/sheet-mapping";

/**
 * Disparo da Carol: o Radar lê o que o n8n grava na aba leads para mostrar o progresso,
 * e nunca deixa começar um segundo disparo por cima do primeiro.
 */

vi.mock("google-auth-library", () => ({
  JWT: class {
    async getAccessToken() {
      return { token: "token-de-teste" };
    }
  },
}));

const CAB = ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout"];
const MAP = buildHeaderMap(CAB);

describe("datas gravadas pelo n8n", () => {
  it("lê o formato pt-BR (hora de Brasília), com ou sem vírgula e dentro do texto de erro", () => {
    const esperado = Date.parse("2026-09-30T00:13:05Z"); // 21:13:05 em Brasília
    expect(lerDataHora("29/09/2026, 21:13:05")).toBe(esperado);
    expect(lerDataHora("29/09/2026 21:13:05")).toBe(esperado);
    expect(lerDataHora("erro: número não existe no WhatsApp - 29/09/2026, 21:13:05")).toBe(esperado);
    expect(lerDataHora("2026-09-30T00:13:05.000Z")).toBe(esperado);
    expect(lerDataHora("")).toBeNull();
    expect(lerDataHora("sim")).toBeNull();
  });

  it("lê data em número do Sheets", () => {
    // 29/09/2026 21:13:05 → 46294 dias + fração
    const serial = 46294 + (21 * 3600 + 13 * 60 + 5) / 86400;
    expect(lerDataHora(serial)).toBe(Date.parse("2026-09-30T00:13:05Z"));
  });

  it("dia em Brasília", () => {
    expect(diaBrasilia(Date.parse("2026-09-30T02:00:00Z"))).toBe("2026-09-29"); // 23:00 em Brasília
  });
});

describe("fila e progresso", () => {
  const rows = [
    ["5531911110001", "Lava A", "Empresa", "BH", "pendente", "", ""],
    ["5531911110002", "Lava B", "Empresa", "BH", "enviado", "29/09/2026, 21:10:00", ""],
    ["5531911110003", "Lava C", "Autônomo", "BH", "sem_whatsapp", "erro: número não existe no WhatsApp - 29/09/2026, 21:11:00", ""],
    ["5531911110004", "Lava D", "Empresa", "BH", "pendente", "", "sim"], // optout: n8n pula
    ["", "Sem telefone", "Empresa", "BH", "pendente", "", ""],
    ["5531911110005", "Lava E", "Empresa", "BH", "enviado", "28/09/2026, 10:00:00", ""], // ontem
    [],
  ];
  const linhas = linhasDaFila(rows, MAP);
  const agora = Date.parse("2026-09-30T00:12:00Z"); // 21:12 em Brasília

  it("a fila segue a mesma regra do n8n: pendente, com telefone e sem optout", () => {
    expect(linhas.filter(naFila).map((l) => l.nome)).toEqual(["Lava A"]);
  });

  it("conta os envios de hoje e o último movimento", () => {
    expect(resumoDoDia(linhas, agora)).toEqual({
      enviadosHoje: 1,
      semWhatsappHoje: 1,
      ultimoMovimento: Date.parse("2026-09-30T00:11:00Z"),
    });
    expect(linhas[2].detalhe).toBe("erro: número não existe no WhatsApp");
  });

  it("acompanha só quem estava na fila quando o disparo começou", () => {
    const inicio = Date.parse("2026-09-30T00:09:00Z");
    const chaves = ["5531911110001", "5531911110002", "5531911110003", "5531999999999"];
    const p = progressoDoDisparo(chaves, inicio, linhas, agora);
    expect(p).toMatchObject({ total: 4, enviados: 1, semWhatsapp: 1, aguardando: 1, outros: 1, estado: "enviando" });
    expect(p.segundosRestantes).toBeGreaterThan(0);
    // quem já foi aparece primeiro, o mais recente no topo; quem saiu da planilha é marcado
    expect(p.itens.map((i) => i.situacao)).toEqual(["sem_whatsapp", "enviado", "sumiu", "pendente"]);
  });

  it("sem novidade por mais de 4 minutos = parou (limite diário ou erro no n8n)", () => {
    const inicio = Date.parse("2026-09-30T00:09:00Z");
    const p = progressoDoDisparo(["5531911110001", "5531911110002"], inicio, linhas, Date.parse("2026-09-30T00:20:00Z"));
    expect(p.estado).toBe("parado");
    expect(p.segundosRestantes).toBe(0);
  });

  it("todos processados = concluído", () => {
    const p = progressoDoDisparo(["5531911110002", "5531911110003"], Date.parse("2026-09-30T00:09:00Z"), linhas, agora);
    expect(p.estado).toBe("concluido");
  });
});

describe("iniciar disparo (servidor)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("MOCK_MODE", "");
    vi.stubEnv(
      "GOOGLE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({ client_email: "robo@proj.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n" }),
    );
    vi.stubEnv("N8N_DISPARO_URL", "https://n8n.exemplo.com/webhook/radar-disparo");
    vi.stubEnv("N8N_DISPARO_TOKEN", "segredo-de-teste");
    (globalThis as { __radarDisparo?: unknown }).__radarDisparo = null;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockGoogle(valores: unknown[][], n8n: { status: number } = { status: 200 }) {
    const chamadasN8n: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("https://n8n.exemplo.com")) {
          chamadasN8n.push(init ?? {});
          return new Response(JSON.stringify({ message: "Workflow was started" }), { status: n8n.status });
        }
        return new Response(JSON.stringify({ values: valores }), { status: 200 });
      }),
    );
    return chamadasN8n;
  }

  it("chama o webhook com a senha no cabeçalho e guarda quem estava na fila", async () => {
    const chamadas = mockGoogle([CAB, ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""], ["5531911110002", "B", "Empresa", "BH", "pendente", "", ""]]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    const s = await iniciarDisparo();
    expect(chamadas).toHaveLength(1);
    expect((chamadas[0].headers as Record<string, string>)["X-Radar-Token"]).toBe("segredo-de-teste");
    expect(JSON.parse(String(chamadas[0].body))).toMatchObject({ origem: "radar", pendentes: 2 });
    expect(s.atual).toMatchObject({ total: 2, aguardando: 2, estado: "enviando" });
  });

  it("não deixa começar outro disparo enquanto o primeiro está enviando", async () => {
    const chamadas = mockGoogle([CAB, ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""]]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    await iniciarDisparo();
    await expect(iniciarDisparo()).rejects.toThrow(/Já tem um disparo em andamento/);
    expect(chamadas).toHaveLength(1);
  });

  it("não dispara se a Carol mandou mensagem há menos de 90 s (fluxo rodando direto no n8n)", async () => {
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const chamadas = mockGoogle([
      CAB,
      ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""],
      ["5531911110002", "B", "Empresa", "BH", "enviado", agora, ""],
    ]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    await expect(iniciarDisparo()).rejects.toThrow(/fluxo está rodando no n8n/);
    expect(chamadas).toHaveLength(0);
  });

  it("explica quando o fluxo não está publicado no n8n", async () => {
    mockGoogle([CAB, ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""]], { status: 404 });
    const { iniciarDisparo } = await import("@/lib/disparo");
    await expect(iniciarDisparo()).rejects.toThrow(/publicado/);
  });

  it("sem pendentes não chama o n8n", async () => {
    const chamadas = mockGoogle([CAB, ["5531911110001", "A", "Empresa", "BH", "enviado", "01/09/2026, 10:00:00", ""]]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    await expect(iniciarDisparo()).rejects.toThrow(/Não há ninguém pendente/);
    expect(chamadas).toHaveLength(0);
  });
});
