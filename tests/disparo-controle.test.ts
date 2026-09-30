import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pausar, cancelar e continuar o disparo, e a trava que o n8n consulta antes de cada mensagem.
 * A planilha e o n8n são simulados: o teste faz o papel do Fluxo 1.
 */

vi.mock("google-auth-library", () => ({
  JWT: class {
    async getAccessToken() {
      return { token: "token-de-teste" };
    }
  },
}));

const CAB = ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout"];
const A = "5531911110001";
const B = "5531911110002";
const C = "5531911110003";

type G = { __radarDisparo?: unknown; __radarTrava?: unknown; __radarDisparoSim?: unknown };

function agoraN8n() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

let planilha: unknown[][];
let chamadasN8n: number;

function montar(linhas: unknown[][]) {
  planilha = [CAB, ...linhas];
  chamadasN8n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("https://n8n.exemplo.com")) {
        chamadasN8n++;
        return new Response("{}", { status: 200 });
      }
      if (url.includes("values:batchUpdate")) {
        const body = JSON.parse(String(init?.body)) as { data: { range: string; values: string[][] }[] };
        for (const d of body.data) planilha[Number(/(\d+)$/.exec(d.range)![1]) - 1][4] = d.values[0][0];
        return new Response("{}", { status: 200 });
      }
      return new Response(JSON.stringify({ values: planilha }), { status: 200 });
    }),
  );
}

/** O "n8n" mandou a mensagem para este telefone. */
function enviou(tel: string) {
  const row = planilha.find((r) => r[0] === tel)!;
  row[4] = "enviado";
  row[5] = agoraN8n();
}

function statusDe(tel: string) {
  return planilha.find((r) => r[0] === tel)![4];
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MOCK_MODE", "");
  vi.stubEnv(
    "GOOGLE_SERVICE_ACCOUNT_JSON",
    JSON.stringify({ client_email: "robo@proj.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n" }),
  );
  vi.stubEnv("N8N_DISPARO_URL", "https://n8n.exemplo.com/webhook/radar-disparo");
  vi.stubEnv("AUTH_SECRET", "segredo-dos-testes");
  const g = globalThis as G;
  g.__radarDisparo = null;
  g.__radarTrava = undefined;
  (globalThis as { __radarMovimentoConhecido?: number }).__radarMovimentoConhecido = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("trava do n8n", () => {
  it("devolve o próprio contato e libera quem ainda está pendente", async () => {
    montar([[A, "Lava A", "Empresa", "BH", "pendente", "", ""]]);
    const { consultarTrava } = await import("@/lib/disparo");
    const r = await consultarTrava({ telefone: A, nome: "Lava A", tipo: "Empresa", cidade: "BH", row_number: 2 }, "e1");
    expect(r).toMatchObject({ telefone: A, nome: "Lava A", row_number: 2, radar_parar: false });
  });

  it("para quando o contato não está mais pendente ou pediu optout", async () => {
    montar([
      [A, "Lava A", "Empresa", "BH", "aguardando", "", ""],
      [B, "Lava B", "Empresa", "BH", "pendente", "", "sim"],
    ]);
    const { consultarTrava } = await import("@/lib/disparo");
    expect((await consultarTrava({ telefone: A }, "e1")).radar_parar).toBe(true);
    expect((await consultarTrava({ telefone: B }, "e2")).radar_motivo).toMatch(/optout/);
  });

  it("uma execução que recebeu 'parar' não passa mais", async () => {
    montar([
      [A, "Lava A", "Empresa", "BH", "aguardando", "", ""],
      [B, "Lava B", "Empresa", "BH", "pendente", "", ""],
    ]);
    const { consultarTrava } = await import("@/lib/disparo");
    expect((await consultarTrava({ telefone: A }, "e1")).radar_parar).toBe(true);
    expect((await consultarTrava({ telefone: B }, "e1")).radar_parar).toBe(true);
    expect((await consultarTrava({ telefone: B }, "e2")).radar_parar).toBe(false);
  });

  it("a rota exige a chave da trava", async () => {
    montar([[A, "Lava A", "Empresa", "BH", "pendente", "", ""]]);
    const { POST } = await import("@/app/api/n8n/trava/route");
    const { chaveDaTrava } = await import("@/lib/trava");
    const pedir = (chave: string) =>
      POST(new Request(`https://radar.lavacar.app/api/n8n/trava?chave=${chave}&exec=9`, { method: "POST", body: JSON.stringify({ telefone: A }) }));
    expect((await pedir("errada")).status).toBe(401);
    const ok = await pedir(chaveDaTrava());
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ telefone: A, radar_parar: false });
  });
});

describe("pausar, continuar e cancelar", () => {
  it("pausar devolve quem falta para 'aguardando' e a trava encerra a execução", async () => {
    montar([
      [A, "Lava A", "Empresa", "BH", "pendente", "", ""],
      [B, "Lava B", "Empresa", "BH", "pendente", "", ""],
      [C, "Lava C", "Empresa", "BH", "pendente", "", ""],
    ]);
    const { iniciarDisparo, interromperDisparo, consultarTrava } = await import("@/lib/disparo");
    await iniciarDisparo();
    expect((await consultarTrava({ telefone: A }, "exec-1")).radar_parar).toBe(false);
    enviou(A);

    const s = await interromperDisparo("pausado");
    expect([statusDe(A), statusDe(B), statusDe(C)]).toEqual(["enviado", "aguardando", "aguardando"]);
    expect(s.atual).toMatchObject({ estado: "pausado", enviados: 1, aguardando: 2, total: 3 });
    expect(s.atual!.podeContinuarEm).toBeGreaterThan(Date.now()); // ainda não sabe se o n8n parou
    expect(s.itensFila).toHaveLength(0); // continuam no disparo pausado, não na fila solta

    // O n8n chega no próximo contato e a trava manda parar: agora dá para continuar.
    expect((await consultarTrava({ telefone: B }, "exec-1")).radar_parar).toBe(true);
    const { statusDisparo } = await import("@/lib/disparo");
    expect((await statusDisparo()).atual!.podeContinuarEm).toBe(0);
  });

  it("continuar manda só quem faltou, no mesmo disparo", async () => {
    montar([
      [A, "Lava A", "Empresa", "BH", "pendente", "", ""],
      [B, "Lava B", "Empresa", "BH", "pendente", "", ""],
      [C, "Lava C", "Empresa", "BH", "pendente", "", ""],
    ]);
    const { iniciarDisparo, interromperDisparo, consultarTrava, continuarDisparo } = await import("@/lib/disparo");
    await iniciarDisparo();
    await consultarTrava({ telefone: A }, "exec-1");
    enviou(A);
    await interromperDisparo("pausado");
    await consultarTrava({ telefone: B }, "exec-1"); // execução antiga encerrada

    const s = await continuarDisparo();
    expect(chamadasN8n).toBe(2);
    expect([statusDe(A), statusDe(B), statusDe(C)]).toEqual(["enviado", "pendente", "pendente"]);
    expect(s.atual).toMatchObject({ estado: "enviando", total: 3, enviados: 1, aguardando: 2 });
    // A execução antiga continua barrada; a nova passa.
    expect((await consultarTrava({ telefone: B }, "exec-1")).radar_parar).toBe(true);
    expect((await consultarTrava({ telefone: B }, "exec-2")).radar_parar).toBe(false);
  });

  it("não continua enquanto o n8n pode estar mandando a mensagem que já tinha saído", async () => {
    montar([
      [A, "Lava A", "Empresa", "BH", "pendente", "", ""],
      [B, "Lava B", "Empresa", "BH", "pendente", "", ""],
    ]);
    const { iniciarDisparo, interromperDisparo, continuarDisparo, consultarTrava } = await import("@/lib/disparo");
    await iniciarDisparo();
    await consultarTrava({ telefone: A }, "exec-1");
    enviou(A);
    await interromperDisparo("pausado");
    await expect(continuarDisparo()).rejects.toThrow(/terminando a mensagem/);
    expect(chamadasN8n).toBe(1);
  });

  it("cancelar devolve todo mundo para a fila e dá para fechar o cartão", async () => {
    montar([
      [A, "Lava A", "Empresa", "BH", "pendente", "", ""],
      [B, "Lava B", "Empresa", "BH", "pendente", "", ""],
    ]);
    const { iniciarDisparo, interromperDisparo, encerrarDisparo, continuarDisparo } = await import("@/lib/disparo");
    await iniciarDisparo();
    await expect(encerrarDisparo()).rejects.toThrow(/Pause ou cancele/);
    const s = await interromperDisparo("cancelado");
    expect(s.atual?.estado).toBe("cancelado");
    expect(s.itensFila.map((i) => [i.nome, i.situacao])).toEqual([
      ["Lava A", "aguardando"],
      ["Lava B", "aguardando"],
    ]);
    await expect(continuarDisparo()).rejects.toThrow(/cancelado/);
    expect((await encerrarDisparo()).atual).toBeNull();
  });

  it("pausar depois de pausado e depois cancelar não mexe de novo na planilha", async () => {
    montar([[A, "Lava A", "Empresa", "BH", "pendente", "", ""]]);
    const { iniciarDisparo, interromperDisparo } = await import("@/lib/disparo");
    await iniciarDisparo();
    await interromperDisparo("pausado");
    const s = await interromperDisparo("cancelado");
    expect(s.atual?.estado).toBe("cancelado");
    expect(statusDe(A)).toBe("aguardando");
  });

  it("nunca desfaz um 'enviado' que o n8n acabou de gravar", async () => {
    montar([[A, "Lava A", "Empresa", "BH", "enviado", agoraN8n(), ""]]);
    const { atualizarStatusLinhas } = await import("@/lib/sheets");
    await atualizarStatusLinhas([{ linha: 2, key: A, status: "aguardando", de: "pendente" }]);
    expect(statusDe(A)).toBe("enviado");
  });

  it("depois de fechar um disparo concluído, dá para disparar de novo na hora", async () => {
    montar([
      [A, "Lava A", "Empresa", "BH", "pendente", "", ""],
      [B, "Lava B", "Empresa", "BH", "aguardando", "", ""],
    ]);
    const { iniciarDisparo, encerrarDisparo, statusDisparo } = await import("@/lib/disparo");
    await iniciarDisparo([A]);
    enviou(A);
    (await import("@/lib/sheets")).esquecerAbaLeads();
    expect((await statusDisparo()).atual?.estado).toBe("concluido");
    const s = await encerrarDisparo();
    expect(s.movimentoRecente).toBe(false);
    await iniciarDisparo([B]);
    expect(chamadasN8n).toBe(2);
  });

});

describe("chave da trava e limite do n8n", () => {
  it("a chave vem do código do webhook (trocar a senha não quebra a trava)", async () => {
    vi.stubEnv("N8N_DISPARO_URL", "https://n8n.exemplo.com/webhook/radar-disparo-abc123/");
    vi.stubEnv("APP_PASSWORD", "senha-1");
    const { chaveDaTrava, chaveDoWebhook } = await import("@/lib/trava");
    const antes = chaveDaTrava();
    expect(antes).toBe(chaveDoWebhook("radar-disparo-abc123"));
    vi.stubEnv("APP_PASSWORD", "senha-2");
    vi.stubEnv("AUTH_SECRET", "outro");
    expect(chaveDaTrava()).toBe(antes);
    vi.stubEnv("N8N_TRAVA_CHAVE", "fixa");
    expect(chaveDaTrava()).toBe("fixa");
  });

  it("o Radar aprende o limite diário que o n8n usa", async () => {
    montar([[A, "Lava A", "Empresa", "BH", "pendente", "", ""]]);
    const { consultarTrava, statusDisparo } = await import("@/lib/disparo");
    expect((await statusDisparo()).limiteDiario).toBe(10);
    await consultarTrava({ telefone: A, limite_diario: 12, disparos_enviados_hoje: 3 }, "e1");
    expect((await statusDisparo()).limiteDiario).toBe(12);
  });
});
