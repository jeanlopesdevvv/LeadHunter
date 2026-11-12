import { describe, expect, it } from "vitest";

import {
  crmNoRadar,
  EMPRESAS,
  empresaDoCrm,
  empresaPorId,
  idValido,
  LAVACAR,
  lavacarNoRadar,
  motorDaEscolha,
  motorDoId,
  rotaPermitida,
  rotaSoDaEquipe,
  rotuloDaTela,
  siglaDe,
  temRecurso,
} from "@/lib/empresas";
import { cssDaMarca, escalaDaCor } from "@/lib/cores";
import { lerDadosDaEmpresa } from "@/lib/voob/marca";
import { filtroDoPerfil, mudancasDoFiltro, situacoesDoFiltro } from "@/lib/voob/regras";

const voob = empresaDoCrm({
  id: "voob", nome: "Voob", cor: "#4e9a1a", logo: null, publico: "Empresas que vendem pelo WhatsApp", agente: "Renata",
  ligado: false, pausado: false, numero: false, conta: "Voob Prospecção", teste: false, situacao: "preparando",
});
const clinica = empresaDoCrm({
  id: "clinica-bem-estar", nome: "Clínica Bem Estar", cor: "#1D4ED8", logo: "data:image/png;base64,AAAA", publico: "", agente: "Bia",
  ligado: true, pausado: false, numero: true, conta: "Clínica Bem Estar", teste: false, situacao: "ativa",
});

describe("empresas do Radar (white label, 13/11/2026)", () => {
  it("o Lavacar continua com as telas de sempre; toda empresa do Voob CRM tem as mesmas telas", () => {
    for (const r of ["buscar", "resultados", "disparo", "automatico", "leads", "painel", "historico", "config", "atendimento"] as const) {
      expect(temRecurso(LAVACAR, r)).toBe(true);
    }
    expect(EMPRESAS).toEqual([LAVACAR]);
    expect(empresaPorId("LAVACAR")).toBe(LAVACAR);
    expect(empresaPorId("voob")).toBeNull();
    for (const e of [voob, clinica]) {
      expect(e.motor).toBe("voob-crm");
      expect(e.recursos).toEqual(["comecar", "buscar", "leads", "disparo", "modelos", "painel"]);
      expect(rotuloDaTela(e, "leads", "Leads")).toBe("Base");
    }
    expect(clinica.sigla).toBe("CB");
    expect(voob.sigla).toBe("VO");
    expect(siglaDe("Pet Shop da Ana")).toBe("PS");
    expect(clinica.situacao).toBe("ativa");
    expect(clinica.publico).toBe("Conta Clínica Bem Estar");
  });

  it("RADAR_EMPRESAS: o Lavacar e as do Voob CRM ligam e desligam pela lista", () => {
    expect(lavacarNoRadar(undefined)).toBe(true);
    expect(crmNoRadar(undefined)).toBe(true);
    expect(lavacarNoRadar("lavacar,voob")).toBe(true);
    expect(crmNoRadar("lavacar,voob")).toBe(true);
    expect(crmNoRadar("lavacar")).toBe(false);
    expect(lavacarNoRadar("voob")).toBe(false);
  });

  it("o motor pelo id e pelo cookie: o Lavacar só para a equipe", () => {
    expect(motorDoId("lavacar")).toBe("lavacar");
    expect(motorDoId("clinica-bem-estar")).toBe("voob-crm");
    const equipe = { equipe: true, lavacar: true, crm: true };
    const cliente = { equipe: false, lavacar: true, crm: true };
    expect(motorDaEscolha(undefined, equipe)).toBe("lavacar");
    expect(motorDaEscolha("voob", equipe)).toBe("voob-crm");
    expect(motorDaEscolha("lavacar", cliente)).toBe("voob-crm");
    expect(motorDaEscolha(undefined, cliente)).toBe("voob-crm");
    expect(motorDaEscolha("<script>", equipe)).toBe("lavacar");
    expect(motorDaEscolha("voob", { equipe: true, lavacar: true, crm: false })).toBe("lavacar");
    expect(idValido("clinica-2")).toBe(true);
    expect(idValido("../x")).toBe(false);
  });

  it("com uma empresa do Voob CRM escolhida, as rotas do Lavacar ficam fechadas (e o contrário)", () => {
    for (const r of ["/api/disparo", "/api/search/page", "/api/sheets/send", "/api/automatico/ligar", "/api/leads", "/api/status"]) {
      expect(rotaPermitida(voob, r)).toBe(false);
      expect(rotaPermitida(LAVACAR, r)).toBe(true);
    }
    for (const r of ["/api/voob/config", "/api/voob/modelos", "/api/voob/whatsapp", "/api/voob/teste", "/api/voob/contas"]) {
      expect(rotaPermitida(clinica, r)).toBe(true);
      expect(rotaPermitida(LAVACAR, r)).toBe(false);
    }
    for (const r of ["/api/auth/login", "/api/auth/logout", "/api/empresa", "/api/empresas", "/api/health", "/api/uso"]) {
      expect(rotaPermitida(voob, r)).toBe(true);
      expect(rotaPermitida(LAVACAR, r)).toBe(true);
    }
    expect(rotaPermitida(voob, "/api/voobx")).toBe(false);
  });

  it("cliente (não é da equipe) não chama nada do Lavacar, nem as abas do Chatwoot", () => {
    for (const r of ["/api/disparo", "/api/chatwoot", "/api/modelos", "/api/search/page", "/api/n8n/trava"]) expect(rotaSoDaEquipe(r)).toBe(true);
    for (const r of ["/api/voob/config", "/api/empresa", "/api/empresas", "/api/uso", "/", "/login"]) expect(rotaSoDaEquipe(r)).toBe(false);
  });
});

describe("marca da empresa", () => {
  it("a escala de cor sai da cor escolhida, no claro e no escuro", () => {
    const e = escalaDaCor("#1d4ed8");
    expect(e.rgb).toBe("29 78 216");
    expect(e.claro["500"]).toBe("#1d4ed8");
    expect(e.claro["50"]).toBe("#edf1fc");
    const css = cssDaMarca("clinica-bem-estar", "#1d4ed8");
    expect(css).toContain('html[data-empresa="clinica-bem-estar"]{--brand-rgb:29 78 216;');
    expect(css).toContain('html[data-theme="dark"][data-empresa="clinica-bem-estar"]');
    expect(cssDaMarca('x"]{}*{color:red', "#1d4ed8")).toBe("");
  });

  it("confere o que chega para criar ou mudar a empresa", () => {
    expect(lerDadosDaEmpresa({ nome: "A" }, true)).toMatch(/2 a 40/);
    expect(lerDadosDaEmpresa({ nome: "Clínica", conta: "x" }, true)).toMatch(/conta/);
    const ok = lerDadosDaEmpresa({ nome: "  Clínica   Bem Estar ", conta: "50000000-0000-0000-0000-00000000000c", cor: "#1D4ED8", cidade: "Contagem, MG" }, true);
    expect(ok).toEqual({ nome: "Clínica Bem Estar", conta: "50000000-0000-0000-0000-00000000000c", cor: "#1d4ed8", cidade: "Contagem, MG" });
    expect(lerDadosDaEmpresa({ logo: "javascript:alert(1)" }, false)).toMatch(/logo/);
    expect(lerDadosDaEmpresa({ logo: null, responde: "outro", responde_sistema: " ManyChat " }, false)).toEqual({ logo: null, responde: "outro", responde_sistema: "ManyChat" });
    expect(lerDadosDaEmpresa({ responde: "robô" }, false)).toMatch(/quem responde/);
  });

  it("filtro de site da campanha", () => {
    expect(situacoesDoFiltro("sem_site")).toEqual(["sem_site", "rede_social"]);
    expect(situacoesDoFiltro("tanto_faz")).toContain("com_site");
    expect(filtroDoPerfil({})).toBe("sem_site");
    expect(filtroDoPerfil({ so_sem_site: false })).toBe("tanto_faz");
    expect(filtroDoPerfil({ com_desatualizado: true })).toBe("desatualizado");
    expect(mudancasDoFiltro({ cidade: "BH" }, "desatualizado")).toEqual({
      perfil: { cidade: "BH", site: "desatualizado", so_sem_site: true, com_desatualizado: true },
      situacoes_site: ["sem_site", "rede_social", "desatualizado"],
    });
  });
});
