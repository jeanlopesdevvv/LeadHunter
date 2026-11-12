import { afterEach, describe, expect, it, vi } from "vitest";

import { createPersonToken, createSessionToken, lerSessao, passwordMatches, senhaDoApp, senhaUnicaLiberada, verifySessionToken } from "@/lib/session";

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

describe("sessão por pessoa (12/11/2026)", () => {
  const jean = { id: "0b6d3c1e-1111-4222-8333-444455556666", nome: "Jean" };

  it("guarda quem entrou; a sessão da senha da equipe continua valendo e não tem pessoa", () => {
    vi.stubEnv("APP_PASSWORD", "Lavacar#Radar2026");
    const t = createPersonToken(jean);
    expect(lerSessao(t)).toEqual({ ok: true, pessoa: jean });
    expect(verifySessionToken(t)).toBe(true);
    expect(lerSessao(createSessionToken())).toEqual({ ok: true, pessoa: null });
  });

  it("não aceita token mexido, de outra senha, vencido ou malformado", () => {
    vi.stubEnv("APP_PASSWORD", "Lavacar#Radar2026");
    const agora = Date.now();
    const t = createPersonToken(jean, agora);
    const [p1, exp, dados, sig] = t.split(".");
    const outro = Buffer.from(JSON.stringify({ u: jean.id, n: "Pedro" })).toString("base64url");
    expect(lerSessao(`${p1}.${exp}.${outro}.${sig}`).ok).toBe(false); // trocou o nome
    expect(lerSessao(`${p1}.${Number(exp) + 1000}.${dados}.${sig}`).ok).toBe(false); // esticou a validade
    expect(lerSessao(`${exp}.${sig}`).ok).toBe(false); // tentou virar sessão da equipe
    expect(lerSessao(`p1.${exp}.${dados}`).ok).toBe(false);
    expect(lerSessao("p1...").ok).toBe(false);
    expect(lerSessao(t, agora + 15 * 24 * 60 * 60 * 1000).ok).toBe(false); // 14 dias
    expect(lerSessao(t, agora + 13 * 24 * 60 * 60 * 1000).ok).toBe(true);
    vi.stubEnv("APP_PASSWORD", "OutraSenha#2026");
    expect(lerSessao(t).ok).toBe(false);
  });

  it("a sessão da equipe não vira sessão de pessoa", () => {
    vi.stubEnv("APP_PASSWORD", "Lavacar#Radar2026");
    const [exp, sig] = createSessionToken().split(".");
    const dados = Buffer.from(JSON.stringify({ u: jean.id, n: "Jean" })).toString("base64url");
    expect(lerSessao(`p1.${exp}.${dados}.${sig}`).ok).toBe(false);
  });

  it("RADAR_SENHA_UNICA=0 desliga a senha da equipe; sem a variável, ela vale", () => {
    expect(senhaUnicaLiberada()).toBe(true);
    for (const v of ["0", "nao", "não", "false", "OFF"]) {
      vi.stubEnv("RADAR_SENHA_UNICA", v);
      expect(senhaUnicaLiberada()).toBe(false);
    }
    vi.stubEnv("RADAR_SENHA_UNICA", "1");
    expect(senhaUnicaLiberada()).toBe(true);
  });
});
