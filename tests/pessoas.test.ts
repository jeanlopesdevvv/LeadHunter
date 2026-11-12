import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/voob/banco", () => ({ VoobError: class extends Error {}, pessoaDoRadar: async () => ({ pode: true, nome: "Jean Lopes" }) }));

import { enderecoDoCrm, motivoDaRecusa, quemFez } from "@/lib/voob/pessoas";

describe("login por pessoa: endereço do Voob CRM e quem fez", () => {
  it("tira o endereço do projeto do usuário do banco (radar_voob.<projeto>), com ou sem senha no meio", () => {
    expect(enderecoDoCrm("postgresql://radar_voob.abcdefghijklmnopqrst:segredo@aws-1-sa-east-1.pooler.supabase.com:6543/postgres")).toBe("https://abcdefghijklmnopqrst.supabase.co");
    expect(enderecoDoCrm("postgres://radar_voob.abcdefghijklmnopqrst@host:6543/postgres")).toBe("https://abcdefghijklmnopqrst.supabase.co");
    expect(enderecoDoCrm("postgresql://postgres:x@localhost:5432/postgres")).toBe("");
    expect(enderecoDoCrm("", "https://outro.supabase.co/")).toBe("https://outro.supabase.co");
  });
  it("sem sessão de pessoa, o histórico grava Radar", async () => {
    expect(await quemFez()).toBe("Radar");
  });
  it("recusas do login do Voob CRM viram frases claras", () => {
    expect(motivoDaRecusa(400, "invalid_credentials")).toEqual(["E-mail ou senha incorretos.", 401]);
    expect(motivoDaRecusa(400, "email_not_confirmed")[1]).toBe(403);
    expect(motivoDaRecusa(400, "")[0]).toBe("E-mail ou senha incorretos.");
    expect(motivoDaRecusa(500, "unexpected_failure")[1]).toBe(502);
  });
});
