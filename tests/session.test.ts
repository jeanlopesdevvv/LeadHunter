import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionToken, passwordMatches, senhaDoApp, verifySessionToken } from "@/lib/session";

afterEach(() => vi.unstubAllEnvs());

describe("senha do app", () => {
  it("recusa vazia, curta e a de exemplo", () => {
    for (const v of ["", "abc123", "TROQUE_POR_UMA_SENHA", "escolha-uma-senha-forte"]) {
      vi.stubEnv("APP_PASSWORD", v);
      expect(senhaDoApp().ok).toBe(false);
      expect(passwordMatches(v)).toBe(false);
    }
  });

  it("aceita senha real e valida a sessão", () => {
    vi.stubEnv("APP_PASSWORD", "Lavacar#Radar2026");
    expect(senhaDoApp().ok).toBe(true);
    expect(passwordMatches("Lavacar#Radar2026")).toBe(true);
    expect(passwordMatches("errada")).toBe(false);
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
    expect(verifySessionToken(token + "x")).toBe(false);
    vi.stubEnv("APP_PASSWORD", "OutraSenha#2026");
    expect(verifySessionToken(token)).toBe(false); // trocar a senha derruba as sessões
  });
});
