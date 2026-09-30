import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Envio para a planilha é idempotente: se a conexão cair e o navegador repetir o mesmo lote,
 * a planilha é gravada uma vez só e a resposta é a mesma.
 */

const appendLeads = vi.fn();
vi.mock("@/lib/sheets", () => ({
  appendLeads: (...a: unknown[]) => appendLeads(...a),
  SheetsError: class extends Error {
    status = 500;
  },
}));
vi.mock("@/lib/bloqueio", () => ({ telefonesBloqueados: () => new Set<string>() }));

const LEAD = { telefone: "31988887777", nome: "Lava Jato Teste", tipo: "Empresa", cidade: "Belo Horizonte" };

function pedido(body: unknown) {
  return new Request("http://radar.local/api/sheets/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  appendLeads.mockReset();
  (globalThis as { __radarLotes?: Map<string, unknown> }).__radarLotes?.clear();
});

describe("envio para a planilha em lote", () => {
  it("repetir o mesmo lote não grava de novo", async () => {
    appendLeads.mockResolvedValue({ adicionados: [{ key: "5531988887777" }], ignorados: [], aba: "leads", planilhaUrl: "x" });
    const { POST } = await import("@/app/api/sheets/send/route");
    const a = await POST(pedido({ lote: "lote-abc-123", leads: [LEAD] }));
    const b = await POST(pedido({ lote: "lote-abc-123", leads: [LEAD] }));
    expect(appendLeads).toHaveBeenCalledTimes(1);
    expect(await a.json()).toEqual(await b.json());
  });

  it("duas tentativas ao mesmo tempo esperam a mesma gravação", async () => {
    let soltar!: (v: unknown) => void;
    appendLeads.mockReturnValue(new Promise((r) => (soltar = r)));
    const { POST } = await import("@/app/api/sheets/send/route");
    const p1 = POST(pedido({ lote: "lote-simultaneo", leads: [LEAD] }));
    const p2 = POST(pedido({ lote: "lote-simultaneo", leads: [LEAD] }));
    await new Promise((r) => setTimeout(r, 10));
    soltar({ adicionados: [{ key: "k" }], ignorados: [], aba: "leads", planilhaUrl: "x" });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(appendLeads).toHaveBeenCalledTimes(1);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
  });

  it("se deu erro, a próxima tentativa roda de verdade", async () => {
    appendLeads.mockRejectedValueOnce(new Error("falhou")).mockResolvedValueOnce({ adicionados: [], ignorados: [], aba: "leads", planilhaUrl: "x" });
    const { POST } = await import("@/app/api/sheets/send/route");
    const a = await POST(pedido({ lote: "lote-com-erro", leads: [LEAD] }));
    expect(a.status).toBe(500);
    const b = await POST(pedido({ lote: "lote-com-erro", leads: [LEAD] }));
    expect(b.status).toBe(200);
    expect(appendLeads).toHaveBeenCalledTimes(2);
  });

  it("sem lote continua funcionando como antes", async () => {
    appendLeads.mockResolvedValue({ adicionados: [], ignorados: [], aba: "leads", planilhaUrl: "x" });
    const { POST } = await import("@/app/api/sheets/send/route");
    await POST(pedido({ leads: [LEAD] }));
    await POST(pedido({ leads: [LEAD] }));
    expect(appendLeads).toHaveBeenCalledTimes(2);
  });
});
