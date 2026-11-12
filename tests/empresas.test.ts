import { describe, expect, it } from "vitest";

import { EMPRESAS, empresaPorId, empresasDisponiveis, escolherEmpresa, idsDisponiveis, rotaPermitida, rotuloDaTela, temRecurso } from "@/lib/empresas";

const lavacar = empresaPorId("lavacar")!;
const voob = empresaPorId("voob")!;

describe("empresas do Radar (12/11/2026)", () => {
  it("Lavacar continua com todas as telas de hoje; a Voob com as telas do motor do Voob CRM", () => {
    for (const r of ["buscar", "resultados", "disparo", "automatico", "leads", "painel", "historico", "config", "atendimento"] as const) {
      expect(temRecurso(lavacar, r)).toBe(true);
    }
    expect(temRecurso(lavacar, "comecar")).toBe(false);
    expect(voob.motor).toBe("voob-crm");
    expect(voob.recursos).toEqual(["comecar", "buscar", "leads", "disparo", "painel"]);
    expect(temRecurso(voob, "atendimento")).toBe(false);
    expect(rotuloDaTela(voob, "leads", "Leads")).toBe("Base");
    expect(rotuloDaTela(lavacar, "leads", "Leads")).toBe("Leads");
  });

  it("ids únicos, sigla de 2 letras e cor em hexadecimal", () => {
    expect(new Set(EMPRESAS.map((e) => e.id)).size).toBe(EMPRESAS.length);
    for (const e of EMPRESAS) {
      expect(e.sigla).toMatch(/^[A-Z]{2}$/);
      expect(e.cor).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("RADAR_EMPRESAS: sem a variável mostra todas; aceita ordem, maiúsculas e ignora o que não existe", () => {
    expect(idsDisponiveis(undefined)).toEqual(["lavacar", "voob"]);
    expect(idsDisponiveis("")).toEqual(["lavacar", "voob"]);
    expect(idsDisponiveis(" Voob , lavacar ,voob")).toEqual(["voob", "lavacar"]);
    expect(idsDisponiveis("lavacar,qualquer")).toEqual(["lavacar"]);
    expect(idsDisponiveis("qualquer")).toEqual(["lavacar"]);
    expect(empresasDisponiveis("lavacar").map((e) => e.nome)).toEqual(["Lavacar"]);
  });

  it("escolhe a empresa do cookie só se ela estiver disponível; senão, a primeira", () => {
    expect(escolherEmpresa("voob", ["lavacar", "voob"]).id).toBe("voob");
    expect(escolherEmpresa("VOOB", ["lavacar", "voob"]).id).toBe("voob");
    expect(escolherEmpresa(undefined, ["lavacar", "voob"]).id).toBe("lavacar");
    expect(escolherEmpresa("voob", ["lavacar"]).id).toBe("lavacar");
    expect(escolherEmpresa("outra", ["voob", "lavacar"]).id).toBe("voob");
  });

  it("com a Voob escolhida, as rotas do motor do Lavacar ficam fechadas", () => {
    for (const r of ["/api/disparo", "/api/search/page", "/api/sheets/send", "/api/automatico/ligar", "/api/leads", "/api/status"]) {
      expect(rotaPermitida(voob, r)).toBe(false);
      expect(rotaPermitida(lavacar, r)).toBe(true);
    }
  });

  it("entrar, sair, trocar de empresa, saúde e as abas do Chatwoot do Lavacar valem com qualquer empresa", () => {
    for (const r of ["/api/auth/login", "/api/auth/logout", "/api/empresa", "/api/health", "/api/chatwoot", "/api/chatwoot/abrir", "/api/modelos"]) {
      expect(rotaPermitida(voob, r)).toBe(true);
    }
    expect(rotaPermitida(voob, "/api/chatwootx")).toBe(false);
    expect(rotaPermitida(voob, "/api/uso")).toBe(true);
    expect(rotaPermitida(lavacar, "/api/uso")).toBe(true);
    expect(rotaPermitida(voob, "/")).toBe(true);
    expect(rotaPermitida(voob, "/login")).toBe(true);
  });

  it("o motor da Voob (/api/voob) só abre com a Voob escolhida", () => {
    for (const r of ["/api/voob/config", "/api/voob/ligar", "/api/voob/busca", "/api/voob/base", "/api/voob/base/acao", "/api/voob/painel"]) {
      expect(rotaPermitida(voob, r)).toBe(true);
      expect(rotaPermitida(lavacar, r)).toBe(false);
    }
    expect(rotaPermitida(voob, "/api/voobx")).toBe(false);
  });
});
