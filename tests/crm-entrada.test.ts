import { describe, expect, it } from "vitest";

import { destinoSeguro, origemPermitida, origensDoCrm, pareceJwt, vencimentoDoJwt } from "@/lib/voob/crm-entrada-regras";
import { abrirTokens, fecharTokens } from "@/lib/voob/crm-sessao-regras";

const jwt = (corpo: object) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(corpo)).toString("base64url")}.assinatura-de-teste`;

describe("abrir o Radar pelo menu do Voob CRM (19/11/2026)", () => {
  it("só aceita a origem do CRM (com e sem www) e as da variável", () => {
    const ok = origensDoCrm("https://voob.online", "https://app.voob.online, http://inseguro.com, lixo");
    expect(ok).toEqual(["https://voob.online", "https://www.voob.online", "https://app.voob.online"]);
    expect(origemPermitida("https://voob.online", ok)).toBe(true);
    expect(origemPermitida("https://www.voob.online", ok)).toBe(true);
    expect(origemPermitida("https://voob.online.golpe.com", ok)).toBe(false);
    expect(origemPermitida(null, ok)).toBe(false);
    expect(origemPermitida("null", ok)).toBe(false);
  });

  it("confere o formato do token e lê quando vence", () => {
    const agora = Date.UTC(2026, 10, 19, 12);
    const t = jwt({ sub: "x", exp: agora / 1000 + 1800 });
    expect(pareceJwt(t)).toBe(true);
    expect(pareceJwt("abc")).toBe(false);
    expect(pareceJwt(`${t}"<script>`)).toBe(false);
    expect(vencimentoDoJwt(t, agora)).toBe(agora + 1800_000);
    // Já vencido ou sem exp: 50 min (o CRM confere de novo a cada chamada).
    expect(vencimentoDoJwt(jwt({ sub: "x", exp: agora / 1000 - 10 }), agora)).toBe(agora + 50 * 60_000);
  });

  it("depois de entrar, vai só para caminhos do próprio Radar", () => {
    expect(destinoSeguro("/")).toBe("/");
    expect(destinoSeguro("/?tela=comecar")).toBe("/?tela=comecar");
    expect(destinoSeguro("//golpe.com")).toBe("/");
    expect(destinoSeguro("https://golpe.com")).toBe("/");
    expect(destinoSeguro(null)).toBe("/");
  });

  it("o login do CRM sem refresh_token abre (vale até vencer)", () => {
    const fechado = fecharTokens({ a: "token", r: "", e: 123 });
    expect(abrirTokens(fechado)).toEqual({ a: "token", r: "", e: 123 });
    expect(abrirTokens(fecharTokens({ a: "", r: "", e: 1 }))).toBeNull();
  });
});
