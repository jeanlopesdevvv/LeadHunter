import { beforeEach, describe, expect, it } from "vitest";

import type { Lead } from "@/lib/types";
import * as sim from "@/lib/voob/mock";
import {
  SEGMENTOS,
  consultasMaximas,
  custoEstimado,
  funil,
  lugaresDaBusca,
  motivoLegivel,
  paraBase,
  planoDeBusca,
  podeIrParaBase,
  resultadoDaBusca,
  resumoInsercao,
  rotuloConferida,
  situacaoDoSite,
  termosDosSegmentos,
  textoAbertura,
  textoDias,
} from "@/lib/voob/regras";

function lead(p: Partial<Lead> = {}): Lead {
  return {
    id: "place-1", nome: "Clínica Bem Estar", telefone: "5531988880001", telefoneKey: "5531988880001", telefoneTipo: "celular",
    telefoneExibicao: "(31) 98888-0001", tipo: "lava_jato" as Lead["tipo"], tipoMotivos: [], cidade: "Belo Horizonte", uf: "MG", bairro: "Savassi",
    endereco: "R. X, 1", site: "", mapsUrl: "https://maps.google.com/?cid=1", nota: 4.7, avaliacoes: 31, categoria: "Clínica de estética",
    situacaoNegocio: "OPERATIONAL", semPontoFisico: false, termo: "clínica de estética", capturadoEm: "2026-11-12T12:00:00Z", planilha: "desconhecido", ...p,
  };
}

describe("Radar · Voob: o site de cada empresa (12/11/2026)", () => {
  it("sem endereço ou site do Google que saiu do ar = sem site", () => {
    expect(situacaoDoSite("")).toBe("sem_site");
    expect(situacaoDoSite(null)).toBe("sem_site");
    expect(situacaoDoSite("https://clinica.business.site/")).toBe("sem_site");
    expect(situacaoDoSite("g.page/clinica")).toBe("sem_site");
  });
  it("rede social, link de bio, WhatsApp e perfis em plataforma = só rede social", () => {
    for (const u of ["https://www.instagram.com/clinica", "http://facebook.com/x", "linktr.ee/x", "https://wa.me/5531988880001", "https://api.whatsapp.com/send?phone=1",
      "https://www.doctoralia.com.br/x", "m.facebook.com/x", "https://beacons.ai/x"]) {
      expect(situacaoDoSite(u)).toBe("rede_social");
    }
  });
  it("site de verdade = tem site (sem confundir domínio parecido)", () => {
    expect(situacaoDoSite("https://www.clinicabemestar.com.br")).toBe("com_site");
    expect(situacaoDoSite("instagram.com.meusite.com.br")).toBe("com_site");
    expect(situacaoDoSite("https://notinstagram.com")).toBe("com_site");
  });
});

describe("Radar · Voob: quem procurar", () => {
  it("termos dos segmentos + extras, sem repetir e sem termo curto", () => {
    const t = termosDosSegmentos(["imobiliarias"], [" Imobiliária ", "ab", "personal  trainer"]);
    expect(t).toEqual(["imobiliária", "corretor de imóveis", "personal trainer"]);
    expect(termosDosSegmentos([], [])).toEqual([]);
    expect(SEGMENTOS.every((s) => s.termos.length > 0)).toBe(true);
  });
  it("lugares: a cidade inteira ou cada bairro; plano = termos × lugares; até 3 consultas por busca", () => {
    expect(lugaresDaBusca("Belo Horizonte, MG")).toEqual(["Belo Horizonte, MG"]);
    expect(lugaresDaBusca("", ["Savassi", "Savassi", " Sion "])).toEqual(["Savassi, Belo Horizonte, MG", "Sion, Belo Horizonte, MG"]);
    const plano = planoDeBusca(["dentista", "imobiliária"], ["Savassi, BH", "Sion, BH"]);
    expect(plano).toHaveLength(4);
    expect(plano[0].textQuery).toBe("dentista em Savassi, BH");
    expect(consultasMaximas(plano.length)).toBe(12);
  });
});

describe("Radar · Voob: do Google para a base", () => {
  it("celular novo sem site pode ir; fixo, já na base ou já da Voob, não", () => {
    expect(podeIrParaBase(resultadoDaBusca(lead(), "novo"))).toBe(true);
    expect(podeIrParaBase(resultadoDaBusca(lead({ telefoneTipo: "fixo" }), "fixo"))).toBe(false);
    expect(podeIrParaBase(resultadoDaBusca(lead(), "base:novo"))).toBe(false);
    expect(podeIrParaBase(resultadoDaBusca(lead(), "ja_no_crm"))).toBe(false);
    expect(podeIrParaBase(resultadoDaBusca(lead(), "sem_conferir"))).toBe(false);
  });
  it("paraBase leva o que o banco guarda (situação do site, nota, place id)", () => {
    const b = paraBase(resultadoDaBusca(lead({ site: "https://instagram.com/x" }), "novo"));
    expect(b).toMatchObject({ telefone: "5531988880001", negocio: "Clínica Bem Estar", site_situacao: "rede_social", nota: 4.7, avaliacoes: 31, place_id: "place-1", bairro: "Savassi" });
  });
  it("nomes na tela", () => {
    expect(rotuloConferida("base:na_fila").rotulo).toBe("Na base · Na fila de hoje");
    expect(rotuloConferida("ja_conversa").rotulo).toBe("Já conversou com a Voob");
    expect(resumoInsercao({ repetido: 2, novo: 5, ja_no_crm: 1 })).toBe("5 entraram na base, 2 já estavam na base, 1 já são leads da Voob");
    expect(resumoInsercao({})).toBe("nada mudou");
    expect(motivoLegivel("ja_e_lead")).toBe("Já é lead no CRM da Voob");
    expect(motivoLegivel("(#131049) This message was not delivered")).toMatch(/Meta segurou/);
    expect(motivoLegivel("algo_novo")).toBe("algo novo");
    expect(textoDias([5, 4, 3, 2, 1])).toBe("de segunda a sexta");
    expect(textoDias([1, 3])).toBe("seg, qua");
    expect(custoEstimado(20)).toBe(6.43);
  });
  it("a 1ª mensagem não tem preço e diz de onde veio o contato", () => {
    const t = textoAbertura("Renata", "Clínica Bem Estar");
    expect(t).toContain("Aqui é a Renata, da Voob");
    expect(t).toContain("Encontrei Clínica Bem Estar no Google");
    expect(t).not.toMatch(/R\$|\d+,\d{2}/);
  });
});

describe("Radar · Voob: simulação do motor (mesmas regras do banco)", () => {
  beforeEach(() => {
    sim.__reiniciarSimulacao();
    delete process.env.VOOB_MOCK_CENARIO;
  });
  it("hoje: sem número, não liga, e diz o que falta", () => {
    const c = sim.config();
    expect(c.numero).toBeNull();
    expect(c.prontidao.find((p) => p.id === "numero")?.ok).toBe(false);
    expect(() => sim.ligar(true)).toThrow(/Falta escolher o número/);
    expect(() => sim.definir({ xyz: 1 })).toThrow(/Campo desconhecido/);
  });
  it("base: novo entra, repetido não, fixo não", () => {
    const r = sim.inserir([
      { telefone: "5531977771111", negocio: "Nova", site_situacao: "sem_site" },
      { telefone: "5531977771111", negocio: "Repetida", site_situacao: "sem_site" },
      { telefone: "553133331111", negocio: "Fixo", site_situacao: "sem_site" },
    ]);
    expect(r.contagem).toEqual({ novo: 1, repetido: 1, nao_e_celular: 1 });
    expect(sim.lista({ busca: "nova" }).itens.map((l) => l.negocio)).toEqual(["Nova"]);
  });
  it("rodando: número e mensagem prontos, funil com respostas e trocar o número ligado é recusado", () => {
    process.env.VOOB_MOCK_CENARIO = "rodando";
    sim.__reiniciarSimulacao();
    const c = sim.config();
    expect(c.empresa.ligado).toBe(true);
    expect(c.prontidao.every((p) => p.ok)).toBe(true);
    expect(() => sim.definir({ canal_id: null })).toThrow(/Desligue o Radar/);
    const p = sim.painel(14);
    expect(p.serie).toHaveLength(14);
    const f = funil(p);
    expect(f[1].valor).toBeGreaterThan(0);
    expect(f[2].valor).toBeLessThanOrEqual(f[1].valor);
    const fila = sim.lista({ status: ["na_fila"] }).itens.map((l) => l.id);
    expect(sim.acao(fila.slice(0, 2), "tirar_da_fila").afetados).toBe(2);
    expect(sim.ligar(false).hoje.na_fila).toBe(0);
  });
});
