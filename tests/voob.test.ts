import { beforeEach, describe, expect, it } from "vitest";

import type { Lead } from "@/lib/types";
import { emojis, textoDaMensagem, textoParaOModelo } from "@/lib/voob/mensagens";
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
    expect(rotuloConferida("ja_conversa").rotulo).toBe("Já conversou");
    expect(resumoInsercao({ repetido: 2, novo: 5, ja_no_crm: 1 })).toBe("5 entraram na base, 2 já estavam na base, 1 já são leads no CRM");
    expect(resumoInsercao({})).toBe("nada mudou");
    expect(motivoLegivel("ja_e_lead")).toBe("Já é lead no CRM");
    expect(motivoLegivel("(#131049) This message was not delivered")).toMatch(/Meta segurou/);
    expect(motivoLegivel("algo_novo")).toBe("algo novo");
    expect(textoDias([5, 4, 3, 2, 1])).toBe("de segunda a sexta");
    expect(textoDias([1, 3])).toBe("seg, qua");
    expect(custoEstimado(20)).toBe(6.43);
  });
  it("as mensagens: quem é, de onde veio o contato, sem preço, sem link, 1 emoji no máximo e dentro das regras da Meta", () => {
    for (const tipo of ["abertura", "site", "retomada"] as const) {
      const t = textoDaMensagem(tipo, "Renata");
      expect(t).toContain("Renata");
      expect(t).toContain("Voob");
      expect(t).toContain("*Clínica Bem Estar*");
      expect(t).not.toMatch(/R\$|\d+,\d{2}|https?:|www\./);
      expect(t.length).toBeLessThanOrEqual(1024);
      expect(emojis(t)).toBeLessThanOrEqual(1);
      // O modelo não começa nem termina com campo, e nenhum parágrafo é só um campo.
      const m = textoParaOModelo(tipo, "Renata");
      expect(m.startsWith("{")).toBe(false);
      expect(m.trimEnd().endsWith("}")).toBe(false);
      expect(m).toContain("{nome do negócio}");
      expect(m.split("\n\n").some((p) => /^\{[^}]+\}$/.test(p.trim()))).toBe(false);
    }
    const abertura = textoDaMensagem("abertura", "Renata");
    expect(abertura).toContain("assistente virtual da Voob");
    expect(abertura).toContain("no Google, mas não achei um site de vocês");
    expect(abertura.trimEnd().endsWith("?")).toBe(true);
    expect(textoDaMensagem("site", "Renata", "Casa Mineira", "o site não abre")).toContain("notei o seguinte: o site não abre. Isso");
    expect(textoParaOModelo("site", "Renata")).toContain("{problema do site}");
    expect(textoDaMensagem("retomada", "Renata")).toContain("Não tenho interesse");
  });
});

describe("Radar · Voob: simulação do motor (mesmas regras do banco)", () => {
  beforeEach(() => {
    sim.__reiniciarSimulacao();
    delete process.env.VOOB_MOCK_CENARIO;
  });
  it("hoje: sem número, não liga, e diz o que falta", () => {
    const c = sim.config("voob");
    expect(c.numero).toBeNull();
    expect(c.prontidao.find((p) => p.id === "numero")?.ok).toBe(false);
    expect(() => sim.ligar("voob", true)).toThrow(/Falta escolher o número/);
    expect(() => sim.definir("voob", { xyz: 1 })).toThrow(/Campo desconhecido/);
  });
  it("base: novo entra, repetido não, fixo não", () => {
    const r = sim.inserir("voob", [
      { telefone: "5531977771111", negocio: "Nova", site_situacao: "sem_site" },
      { telefone: "5531977771111", negocio: "Repetida", site_situacao: "sem_site" },
      { telefone: "553133331111", negocio: "Fixo", site_situacao: "sem_site" },
    ]);
    expect(r.contagem).toEqual({ novo: 1, repetido: 1, nao_e_celular: 1 });
    expect(sim.lista("voob", { busca: "nova" }).itens.map((l) => l.negocio)).toEqual(["Nova"]);
  });
  it("rodando: número e mensagem prontos, funil com respostas e trocar o número ligado é recusado", () => {
    process.env.VOOB_MOCK_CENARIO = "rodando";
    sim.__reiniciarSimulacao();
    const c = sim.config("voob");
    expect(c.empresa.ligado).toBe(true);
    expect(c.prontidao.every((p) => p.ok)).toBe(true);
    expect(() => sim.definir("voob", { canal_id: null })).toThrow(/Desligue o Radar/);
    const p = sim.painel("voob", 14);
    expect(p.serie).toHaveLength(14);
    const f = funil(p);
    expect(f[1].valor).toBeGreaterThan(0);
    expect(f[2].valor).toBeLessThanOrEqual(f[1].valor);
    const fila = sim.lista("voob", { status: ["na_fila"] }).itens.map((l) => l.id);
    expect(sim.acao("voob", fila.slice(0, 2), "tirar_da_fila").afetados).toBe(2);
    expect(sim.ligar("voob", false).hoje.na_fila).toBe(0);
  });

  it("white label: a empresa nova da simulação começa sem número; a conta tem um para escolher, e o teste liga só para o celular", () => {
    const c = sim.config("clinica-exemplo");
    expect(c.numero).toBeNull();
    expect(c.numeros_disponiveis).toHaveLength(1);
    expect(c.empresa.cor).toBe("#1d4ed8");
    expect(() => sim.definir("clinica-exemplo", { canal_id: "outro" })).toThrow(/não é da conta/);
    const d = sim.definir("clinica-exemplo", { canal_id: c.numeros_disponiveis[0].id });
    expect(d.numero?.final).toBe(c.numeros_disponiveis[0].final);
    expect(() => sim.teste("clinica-exemplo", "12", true)).toThrow(/Telefone inválido/);
    const t = sim.teste("clinica-exemplo", "(31) 98888-0001", true);
    expect(t.empresa.ligado).toBe(true);
    expect(t.empresa.teste?.final).toBe("0001");
    expect(() => sim.definir("clinica-exemplo", { canal_id: null })).toThrow(/Desligue o Radar|Encerre o teste/);
    const fim = sim.teste("clinica-exemplo", null, false);
    expect(fim.empresa.ligado).toBe(false);
    expect(fim.empresa.teste).toBeNull();
  });
  it("white label: quem vê o quê, criar empresa e modelos", () => {
    expect(sim.empresasLista(null, true).map((e) => e.id)).toEqual(["voob", "clinica-exemplo"]);
    expect(sim.empresasLista(sim.CLIENTE_SIMULADO, false).map((e) => e.id)).toEqual(["clinica-exemplo"]);
    expect(sim.empresaVer("voob", sim.CLIENTE_SIMULADO, false)).toBeNull();
    expect(() => sim.empresaCriar({ nome: "X", conta: "50000000-0000-4000-8000-0000000000c2" }, "Jean")).toThrow(/2 a 40/);
    const nova = sim.empresaCriar({ nome: "Lavacar", conta: "50000000-0000-4000-8000-0000000000c2", cor: "#0f766e" }, "Jean");
    expect(nova.empresa.id).toBe("lavacar-2");
    expect(nova.empresa.ligado).toBe(false);
    const cfg = sim.definir("clinica-exemplo", { canal_id: sim.config("clinica-exemplo").numeros_disponiveis[0].id });
    expect(cfg.modelos.abertura?.ok).toBe(false);
    const m = sim.modeloSalvarSimulado("clinica-exemplo", { titulo: "Abertura", categoria: "MARKETING", texto: "Oi, {Nome do negócio}! Aqui é a {Nome de quem atende}.", botoes: ["Quero ver"] });
    expect(m.corpo).toBe("Oi, {{nome_do_negocio}}! Aqui é a {{atendente}}.");
    expect(m.status).toBe("PENDING");
    sim.definir("clinica-exemplo", { modelo_prefixo: m.nome });
    expect(sim.config("clinica-exemplo").modelos.abertura?.motivo).toBe("modelo_em_analise");
    expect(sim.modeloRenomear("clinica-exemplo", m.id, "Primeira").find((x) => x.id === m.id)?.titulo).toBe("Primeira");
    expect(() => sim.modeloArquivar("clinica-exemplo", m.id, true)).toThrow(/mensagem do Radar/);
  });
});
