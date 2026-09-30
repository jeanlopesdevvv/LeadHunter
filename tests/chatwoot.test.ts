import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Atalho do atendimento: tela padrão e conversa do contato. */

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("CHATWOOT_URL", "https://chat.exemplo.app/app/accounts/1/custom_view/6");
  vi.stubEnv("CHATWOOT_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("atalho do Chatwoot", () => {
  it("lê conta e visão do endereço; sem token, não chama a API", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { infoChatwoot, linkDaConversa } = await import("@/lib/chatwoot");
    expect(infoChatwoot()).toMatchObject({ origem: "https://chat.exemplo.app", conta: "1", visao: "6", apiLigada: false });
    expect(await linkDaConversa("5531982999779")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("com token, acha a conversa mais recente do contato pelo telefone (com ou sem o 9)", async () => {
    vi.stubEnv("CHATWOOT_TOKEN", "token-de-teste");
    const chamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        chamadas.push(url);
        if (url.includes("/contacts/search")) {
          return Response.json({ payload: url.includes("q=5531982999779") ? [] : [{ id: 7, phone_number: "+553182999779" }] });
        }
        if (url.includes("/contacts/7/conversations")) {
          return Response.json({ payload: [{ id: 10, last_activity_at: 100 }, { id: 42, last_activity_at: 900 }] });
        }
        return new Response("{}", { status: 404 });
      }),
    );
    const { linkDaConversa } = await import("@/lib/chatwoot");
    expect(await linkDaConversa("(31) 98299-9779")).toBe("https://chat.exemplo.app/app/accounts/1/conversations/42");
    expect(chamadas[0]).toContain("/api/v1/accounts/1/contacts/search?q=5531982999779");
  });

  it("não abre a conversa de outro contato que só parece com o número buscado", async () => {
    vi.stubEnv("CHATWOOT_TOKEN", "token-de-teste");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/contacts/search") ? Response.json({ payload: [{ id: 9, phone_number: "+5531982999770" }] }) : Response.json({ payload: [{ id: 1 }] }),
      ),
    );
    const { linkDaConversa } = await import("@/lib/chatwoot");
    expect(await linkDaConversa("5531982999779")).toBeNull();
  });

  it("a rota de abrir redireciona para a tela padrão quando não acha a conversa", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { GET } = await import("@/app/api/chatwoot/abrir/route");
    const r = await GET(new Request("https://radar.exemplo.app/api/chatwoot/abrir?telefone=5531982999779"));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://chat.exemplo.app/app/accounts/1/custom_view/6");
  });
});
