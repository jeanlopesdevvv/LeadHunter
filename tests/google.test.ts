import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  caminhoSeguro,
  cookieDoPkce,
  desafioDe,
  enderecoDoGoogle,
  erroDaVolta,
  lerCookieDoPkce,
  MENSAGEM_GOOGLE,
  novoPkce,
  origemDoPedido,
  origemPermitida,
} from "@/lib/voob/google-regras";

describe("entrar com o Google (PKCE)", () => {
  it("verificador de 43 letras e desafio = SHA-256 em base64url", () => {
    const { verificador, desafio } = novoPkce();
    expect(verificador).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const esperado = createHash("sha256").update(verificador).digest("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(desafio).toBe(esperado);
    expect(desafioDe("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(novoPkce().verificador).not.toBe(verificador);
  });
  it("o cookie guarda o verificador e o destino por 10 minutos", () => {
    const agora = 1_800_000_000_000;
    const c = cookieDoPkce("a".repeat(43), "/?x=1", agora);
    expect(lerCookieDoPkce(c, agora + 60_000)).toEqual({ verificador: "a".repeat(43), proximo: "/?x=1" });
    expect(lerCookieDoPkce(c, agora + 11 * 60_000)).toBeNull();
    expect(lerCookieDoPkce("lixo", agora)).toBeNull();
    expect(lerCookieDoPkce(undefined, agora)).toBeNull();
    expect(lerCookieDoPkce(cookieDoPkce("curto", "/", agora), agora)).toBeNull();
  });
  it("só volta para caminhos do próprio Radar", () => {
    expect(caminhoSeguro("/painel?a=1")).toBe("/painel?a=1");
    expect(caminhoSeguro("//evil.com")).toBe("/");
    expect(caminhoSeguro("https://evil.com/x")).toBe("/");
    expect(caminhoSeguro("/\\evil.com")).toBe("/");
    expect(caminhoSeguro(null)).toBe("/");
  });
  it("só aceita o endereço do Radar (e localhost fora de produção)", () => {
    expect(origemPermitida("https://radar.lavacar.app", "", true)).toBe(true);
    expect(origemPermitida("https://evil.com", "", true)).toBe(false);
    expect(origemPermitida("http://localhost:3100", "", true)).toBe(false);
    expect(origemPermitida("http://localhost:3100", "", false)).toBe(true);
    expect(origemPermitida("https://radar.voob.online", "https://radar.voob.online/", true)).toBe(true);
    expect(origemPermitida("https://radar.lavacar.app", "https://radar.voob.online", true)).toBe(false);
  });
  it("o endereço público vem do proxy (x-forwarded-*)", () => {
    const h = new Headers({ "x-forwarded-host": "radar.lavacar.app", "x-forwarded-proto": "https", host: "localhost:3000" });
    expect(origemDoPedido(h, "http://localhost:3000/api/auth/google")).toBe("https://radar.lavacar.app");
    expect(origemDoPedido(new Headers(), "http://localhost:3100/api/auth/google")).toBe("http://localhost:3100");
    expect(origemDoPedido(new Headers({ host: "evil.com/x" }), "http://localhost:3100/")).toBe("");
  });
  it("manda ao login com o Google do Voob CRM, com o desafio e a volta", () => {
    const u = new URL(enderecoDoGoogle("https://abc.supabase.co/", "https://radar.lavacar.app/api/auth/google/volta", "DESAFIO"));
    expect(u.origin + u.pathname).toBe("https://abc.supabase.co/auth/v1/authorize");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      provider: "google",
      redirect_to: "https://radar.lavacar.app/api/auth/google/volta",
      code_challenge: "DESAFIO",
      code_challenge_method: "s256",
    });
  });
  it("erros da volta em português", () => {
    expect(erroDaVolta("access_denied", "User denied access")).toBe("google_cancelado");
    expect(erroDaVolta("access_denied", "Signups not allowed for this instance")).toBe("google_recusado");
    expect(erroDaVolta("server_error", "Unable to exchange external code")).toBe("google_falhou");
    expect(Object.keys(MENSAGEM_GOOGLE)).toHaveLength(6);
  });
});
