import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { diaBrasilia, lerDataHora, linhasDaFila, naFila, progressoDoDisparo, resumoDoDia } from "@/lib/disparo-regras";
import { buildHeaderMap } from "@/lib/sheet-mapping";

import { aplicarBatchUpdate } from "./planilha-falsa";

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
    (globalThis as { __radarDisparo?: unknown; __radarTrava?: unknown }).__radarDisparo = null;
    (globalThis as { __radarTrava?: unknown; __radarMovimentoConhecido?: number }).__radarTrava = undefined;
    (globalThis as { __radarMovimentoConhecido?: number }).__radarMovimentoConhecido = 0;
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
    const chamadas = mockGoogle([[...CAB], ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""], ["5531911110002", "B", "Empresa", "BH", "pendente", "", ""]]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    const s = await iniciarDisparo();
    expect(chamadas).toHaveLength(1);
    expect((chamadas[0].headers as Record<string, string>)["X-Radar-Token"]).toBe("segredo-de-teste");
    expect(JSON.parse(String(chamadas[0].body))).toMatchObject({ origem: "radar", pendentes: 2 });
    expect(s.atual).toMatchObject({ total: 2, aguardando: 2, estado: "enviando" });
  });

  it("não deixa começar outro disparo enquanto o primeiro está enviando", async () => {
    const chamadas = mockGoogle([[...CAB], ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""]]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    await iniciarDisparo();
    await expect(iniciarDisparo()).rejects.toThrow(/Já tem um disparo em andamento/);
    expect(chamadas).toHaveLength(1);
  });

  it("não dispara se a Carol mandou mensagem há menos de 90 s (fluxo rodando direto no n8n)", async () => {
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const chamadas = mockGoogle([
      [...CAB],
      ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""],
      ["5531911110002", "B", "Empresa", "BH", "enviado", agora, ""],
    ]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    await expect(iniciarDisparo()).rejects.toThrow(/envio em andamento/);
    expect(chamadas).toHaveLength(0);
  });

  it("explica quando o fluxo não está publicado no n8n", async () => {
    mockGoogle([[...CAB], ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""]], { status: 404 });
    const { iniciarDisparo } = await import("@/lib/disparo");
    await expect(iniciarDisparo()).rejects.toThrow(/não publicado/);
  });

  it("com optout marcado o bloqueado sai da fila e o disparo segue", async () => {
    const chamadas = mockGoogle([
      [...CAB],
      ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""],
      ["5531982149012", "Lavacar - Lava Jato Delivery", "Autônomo", "BH", "pendente", "", "sim"],
    ]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    const s = await iniciarDisparo();
    expect(chamadas).toHaveLength(1);
    expect(s.atual?.total).toBe(1);
  });

  it("sem senha configurada, chama o webhook sem cabeçalho extra", async () => {
    vi.stubEnv("N8N_DISPARO_TOKEN", "");
    const chamadas = mockGoogle([[...CAB], ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""]]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    await iniciarDisparo();
    expect(Object.keys(chamadas[0].headers as Record<string, string>)).toEqual(["Content-Type"]);
  });

  it("dispara só para os marcados: os outros pendentes (e o Lavacar) viram 'aguardando' antes de chamar o n8n", async () => {
    const planilha: unknown[][] = [
      [...CAB],
      ["5531982999779", "Jean Lopes", "Autônomo", "BH", "pendente", "", ""],
      ["5531982149012", "Lavacar - Lava Jato Delivery", "Autônomo", "BH", "pendente", "", ""],
      ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""],
      ["5531911110002", "B", "Empresa", "BH", "aguardando", "", ""],
      ["5531911110003", "C", "Empresa", "BH", "enviado", "01/09/2026, 10:00:00", ""],
    ];
    const escritas: { range: string; values: string[][] }[] = [];
    const chamadasN8n: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("https://n8n.exemplo.com")) {
          chamadasN8n.push(init ?? {});
          return new Response("{}", { status: 200 });
        }
        if (url.includes("values:batchUpdate")) {
          const body = JSON.parse(String(init?.body)) as { data: { range: string; values: string[][] }[] };
          escritas.push(...body.data);
          aplicarBatchUpdate(planilha, body.data);
          return new Response("{}", { status: 200 });
        }
        return new Response(JSON.stringify({ values: planilha }), { status: 200 });
      }),
    );
    const { iniciarDisparo, statusDisparo } = await import("@/lib/disparo");
    const antes = await statusDisparo();
    expect(antes.itensFila.map((i) => i.nome)).toEqual(["Jean Lopes", "A", "B"]); // o Lavacar não aparece
    const s = await iniciarDisparo(["5531982999779"]);
    expect(escritas.map((e) => [e.range, e.values[0][0]])).toEqual([
      ["'leads'!E2", "pendente"],
      ["'leads'!E3", "aguardando"],
      ["'leads'!E4", "aguardando"],
      // Coluna "template" criada no fim do cabeçalho, com o modelo que o escolhido vai receber.
      ["'leads'!H1", "template"],
      ["'leads'!H2", "carol_prospeccao_autonomo"],
    ]);
    expect(planilha.slice(1).map((r) => r[4])).toEqual(["pendente", "aguardando", "aguardando", "aguardando", "enviado"]);
    expect(chamadasN8n).toHaveLength(1);
    expect(s.atual?.total).toBe(1);
    // Quem está no disparo aparece no cartão do disparo; a fila mostra só quem ficou de fora.
    expect(s.atual?.itens.map((i) => [i.nome, i.situacao])).toEqual([["Jean Lopes", "pendente"]]);
    expect(s.itensFila.map((i) => [i.nome, i.situacao])).toEqual([
      ["A", "aguardando"],
      ["B", "aguardando"],
    ]);
  });

  it("um marcado que estava 'aguardando' volta a 'pendente'", async () => {
    const planilha: unknown[][] = [[...CAB], ["5531911110002", "B", "Empresa", "BH", "aguardando", "", ""]];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("https://n8n.exemplo.com")) return new Response("{}", { status: 200 });
        if (url.includes("values:batchUpdate")) {
          const body = JSON.parse(String(init?.body)) as { data: { range: string; values: string[][] }[] };
          aplicarBatchUpdate(planilha, body.data);
          return new Response("{}", { status: 200 });
        }
        return new Response(JSON.stringify({ values: planilha }), { status: 200 });
      }),
    );
    const { iniciarDisparo } = await import("@/lib/disparo");
    await iniciarDisparo(["5531911110002"]);
    expect(planilha[1][4]).toBe("pendente");
  });

  it("se a planilha não ficar como esperado, não chama o n8n", async () => {
    const planilha: unknown[][] = [[...CAB], ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""], ["5531911110002", "B", "Empresa", "BH", "pendente", "", ""]];
    const chamadasN8n: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("https://n8n.exemplo.com")) {
          chamadasN8n.push(1);
          return new Response("{}", { status: 200 });
        }
        if (url.includes("values:batchUpdate")) return new Response("{}", { status: 200 }); // "gravou" mas não mudou nada
        return new Response(JSON.stringify({ values: planilha }), { status: 200 });
      }),
    );
    const { iniciarDisparo } = await import("@/lib/disparo");
    await expect(iniciarDisparo(["5531911110001"])).rejects.toThrow(/nada foi enviado/);
    expect(chamadasN8n).toHaveLength(0);
  });

  it("com um modelo escolhido, confere no Meta e manda o modelo para o n8n", async () => {
    vi.stubEnv("META_TOKEN", "token-meta");
    vi.stubEnv("META_WABA_ID", "123");
    const planilha: unknown[][] = [[...CAB], ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""]];
    const corpos: Record<string, unknown>[] = [];
    const modelo = {
      name: "carol_prospeccao_12meses",
      status: "APPROVED",
      category: "MARKETING",
      language: "pt_BR",
      components: [{ type: "BODY", text: "Oi, {{1}}! 12 meses grátis {{2}}." }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("https://graph.facebook.com/")) {
          expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer token-meta");
          expect(url).toContain("/123/message_templates");
          return new Response(JSON.stringify({ data: [modelo, { ...modelo, name: "en_only", language: "en_US" }] }), { status: 200 });
        }
        if (url.startsWith("https://n8n.exemplo.com")) {
          corpos.push(JSON.parse(String(init?.body)));
          return new Response("{}", { status: 200 });
        }
        if (url.includes("values:batchUpdate")) {
          aplicarBatchUpdate(planilha, (JSON.parse(String(init?.body)) as { data: { range: string; values: unknown[][] }[] }).data);
          return new Response("{}", { status: 200 });
        }
        return new Response(JSON.stringify({ values: planilha }), { status: 200 });
      }),
    );
    (globalThis as { __radarModelos?: unknown }).__radarModelos = undefined;
    const { iniciarDisparo } = await import("@/lib/disparo");
    await expect(iniciarDisparo(["5531911110001"], "nao_existe")).rejects.toThrow(/não está disponível/);
    const s = await iniciarDisparo(["5531911110001"], "carol_prospeccao_12meses");
    expect(corpos).toHaveLength(1);
    expect(corpos[0]).toMatchObject({ template_nome: "carol_prospeccao_12meses", template: { name: "carol_prospeccao_12meses" } });
    expect(s.modeloAtual).toBe("carol_prospeccao_12meses");
    expect(planilha[0][7]).toBe("template");
    expect(planilha[1][7]).toBe("carol_prospeccao_12meses");
  });

  it("sem escolha, o n8n segue no automático (sem modelo no pedido)", async () => {
    const chamadas = mockGoogle([[...CAB], ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""]]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    const s = await iniciarDisparo();
    const corpo = JSON.parse(String(chamadas[0].body)) as Record<string, unknown>;
    expect(corpo.template_nome).toBe("automatico");
    expect(corpo.template).toBeUndefined();
    expect(s.modeloAtual).toBeNull();
  });

  it("o n8n avisa um erro de envio: o disparo aparece parado com o motivo", async () => {
    mockGoogle([[...CAB], ["5531911110001", "A", "Empresa", "BH", "pendente", "", ""]]);
    const { iniciarDisparo, registrarErroDoN8n, statusDisparo } = await import("@/lib/disparo");
    await iniciarDisparo();
    registrarErroDoN8n({ codigo: "132001", detalhe: "Template name does not exist in the translation" });
    const s = await statusDisparo();
    expect(s.atual?.estado).toBe("parado");
    expect(s.atual?.erro).toEqual({ codigo: 132001, mensagem: "O modelo não existe ou não está aprovado em português." });
  });

  it("sem pendentes não chama o n8n", async () => {
    const chamadas = mockGoogle([[...CAB], ["5531911110001", "A", "Empresa", "BH", "enviado", "01/09/2026, 10:00:00", ""]]);
    const { iniciarDisparo } = await import("@/lib/disparo");
    await expect(iniciarDisparo()).rejects.toThrow(/Não há ninguém na fila/);
    expect(chamadas).toHaveLength(0);
  });
});
