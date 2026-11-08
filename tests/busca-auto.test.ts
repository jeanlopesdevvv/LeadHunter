import { describe, expect, it } from "vitest";

import {
  categoriaFora,
  chaveUnidade,
  comoEstadoBusca,
  consultasPermitidas,
  executarBuscaAuto,
  filhas,
  foraDoPerfil,
  motivoDescarte,
  quantoPrecisa,
  retanguloDaArea,
  type DependenciasBusca,
  type EstadoBuscaAuto,
} from "@/lib/busca-auto-regras";
import type { Lead, PageResult, Rect } from "@/lib/types";

const RECT: Rect = { low: { latitude: -20, longitude: -44 }, high: { latitude: -19.8, longitude: -43.8 } };

let seq = 0;
function lead(p: Partial<Lead> = {}): Lead {
  seq++;
  const tel = p.telefone ?? `55319${String(80000000 + seq).padStart(8, "0")}`;
  return {
    id: `p${seq}`, nome: `Lava Jato ${seq}`, telefone: tel, telefoneKey: p.telefoneKey ?? tel.slice(-11), telefoneTipo: "celular",
    telefoneExibicao: "", tipo: "Empresa", tipoMotivos: [], cidade: "Contagem", uf: "MG", bairro: "", endereco: "Rua A", site: "", mapsUrl: "",
    nota: 4.5, avaliacoes: 10, categoria: "Lava-jato", situacaoNegocio: "OPERATIONAL", semPontoFisico: false, termo: "lava jato",
    capturadoEm: "", planilha: "novo", ...p,
  };
}

function estado(p: Partial<EstadoBuscaAuto> = {}, cfg: Record<string, unknown> = {}): EstadoBuscaAuto {
  return {
    ...comoEstadoBusca({ config: { ligado: true, termos: ["lava jato"], cidades: ["Contagem", "Betim"], fila_dias: 3, max_consultas_dia: 40, reserva_cota: 150, ...cfg } }),
    limite: 100, filaNovos: 0, ...p,
  };
}

/** Google de mentira: `por` diz quantos lugares cada consulta (texto|área) tem. */
function deps(por: Record<string, number>, extra: Partial<DependenciasBusca> = {}) {
  const chamadas: string[] = [];
  const feitas: string[] = [];
  const gravados: Lead[] = [];
  let cota = 1000;
  const d: DependenciasBusca = {
    area: async () => RECT,
    pagina: async (p): Promise<PageResult> => {
      const area = p.rect ? `${p.rect.low.latitude.toFixed(3)},${p.rect.low.longitude.toFixed(3)}` : "";
      const k = `${p.textQuery}|${area}`;
      const pag = p.pageToken ? Number(p.pageToken) : 0;
      chamadas.push(`${k}#${pag}`);
      const total = por[p.rect ? "area" : p.textQuery] ?? 0;
      const aqui = Math.max(0, Math.min(20, total - pag * 20));
      return { leads: Array.from({ length: aqui }, () => lead({ cidade: p.cidade })), nextPageToken: total > (pag + 1) * 20 && pag < 2 ? String(pag + 1) : null, bruto: aqui };
    },
    reservar: async () => (cota-- > 0 ? { ok: true, concluir: () => undefined } : { ok: false, concluir: () => undefined }),
    existentes: async () => new Set<string>(),
    gravar: async (ls) => {
      gravados.push(...ls);
      return ls.length;
    },
    feita: async (u, r) => {
      feitas.push(`${chaveUnidade(u)}:${r.consultas}:${r.cheia ? "cheia" : ""}`);
    },
    ...extra,
  };
  return { d, chamadas, feitas, gravados, setCota: (c: number) => (cota = c) };
}

describe("busca automática: regras", () => {
  it("lê a configuração com padrões e limites", () => {
    const e = comoEstadoBusca({ config: { ligado: true, termos: ["lava jato", " lava jato ", ""], cidades: ["Contagem"], max_consultas_dia: 9999 }, limite: 100, fila_novos: 40 });
    expect(e.config.termos).toEqual(["lava jato"]);
    expect(e.config.maxConsultasDia).toBe(300);
    expect(e.config.filaDias).toBe(3);
    expect(e.config.uf).toBe("MG");
    expect(comoEstadoBusca(JSON.stringify({ limite: 5 })).limite).toBe(5);
    expect(comoEstadoBusca("{lixo").config.ligado).toBe(false);
  });

  it("precisa = limite × dias de fila − novos na fila", () => {
    expect(quantoPrecisa(estado({ filaNovos: 282 }))).toBe(18);
    expect(quantoPrecisa(estado({ filaNovos: 400 }))).toBe(0);
    expect(quantoPrecisa(estado({ limite: 0 }))).toBe(0);
  });

  it("consultas permitidas: o que sobra do dia e da cota menos a reserva", () => {
    expect(consultasPermitidas(estado({ consultasHoje: 10 }), 1000)).toBe(30);
    expect(consultasPermitidas(estado(), 170)).toBe(20);
    expect(consultasPermitidas(estado(), 100)).toBe(0);
    expect(consultasPermitidas(estado(), null)).toBe(40);
  });

  it("descarta fixo, fechado, outro estado, fora do perfil, sem nome e quem já está na lista", () => {
    const ex = new Set(["31999990000"]);
    const vistos = new Set<string>();
    expect(motivoDescarte(lead({ telefoneTipo: "fixo" }), "MG", ex, vistos)).toBe("sem_celular");
    expect(motivoDescarte(lead({ situacaoNegocio: "CLOSED_PERMANENTLY" }), "MG", ex, vistos)).toBe("fechado");
    expect(motivoDescarte(lead({ uf: "SP" }), "MG", ex, vistos)).toBe("outro_estado");
    expect(motivoDescarte(lead({ nome: "Lavanderia Roupa Limpa" }), "MG", ex, vistos)).toBe("fora_do_perfil");
    expect(motivoDescarte(lead({ nome: "(sem nome)" }), "MG", ex, vistos)).toBe("sem_nome");
    expect(motivoDescarte(lead({ telefoneKey: "31999990000" }), "MG", ex, vistos)).toBe("ja_na_lista");
    expect(motivoDescarte(lead(), "MG", ex, vistos)).toBeNull();
    expect(foraDoPerfil("Lavanderia e Lava Jato Automotivo")).toBe(false);
    expect(foraDoPerfil("Estofados Prime")).toBe(true);
  });

  it("pedaços do mapa", () => {
    expect(retanguloDaArea(RECT, "")).toBeUndefined();
    expect(retanguloDaArea(null, "1")).toBeNull();
    const r = retanguloDaArea(RECT, "4")!;
    expect(r.high.latitude).toBeCloseTo(-19.8);
    expect(r.low.latitude).toBeCloseTo(-19.9);
    expect(retanguloDaArea(RECT, "2.5")).toBeNull();
    expect(filhas({ termo: "t", cidade: "c", area: "", nivel: 0 }).map((f) => f.area)).toEqual(["1", "2", "3", "4"]);
    expect(filhas({ termo: "t", cidade: "c", area: "3.1.2", nivel: 3 })).toEqual([]);
  });
});

describe("busca automática: rodada", () => {
  it("para quando acha o que precisa e grava cada busca terminada", async () => {
    const t = deps({ "lava jato em Contagem": 30, "lava jato em Betim": 50 });
    const r = await executarBuscaAuto(estado(), 25, 40, t.d);
    expect(r.motivo).toBe("alvo");
    expect(r.adicionados).toBe(30);
    expect(t.feitas).toEqual(["contagem|lava jato|:2:"]);
    expect(t.chamadas.some((c) => c.startsWith("lava jato em Betim"))).toBe(false);
  });

  it("não repete o que já foi buscado e divide o mapa quando a busca vem cheia", async () => {
    const t = deps({ "lava jato em Contagem": 60, area: 10, "lava jato em Betim": 20 });
    const e = estado({ feitas: [{ termo: "lava jato", cidade: "Contagem", area: "", cheia: true }, { termo: "lava jato", cidade: "Contagem", area: "1", cheia: false }] });
    const r = await executarBuscaAuto(e, 1000, 40, t.d);
    expect(t.chamadas.filter((c) => c.startsWith("lava jato em Contagem"))).toEqual([]);
    expect(t.feitas.slice(0, 3)).toEqual(["contagem|lava jato|2:1:", "contagem|lava jato|3:1:", "contagem|lava jato|4:1:"]);
    expect(t.feitas[3]).toBe("betim|lava jato|:1:");
    expect(r.motivo).toBe("esgotado");
    expect(r.adicionados).toBe(50);
  });

  it("cidade inteira cheia: busca os 4 pedaços logo depois, antes da próxima cidade", async () => {
    const t = deps({ "lava jato em Contagem": 60, area: 5, "lava jato em Betim": 5 });
    await executarBuscaAuto(estado(), 1000, 40, t.d);
    expect(t.feitas).toEqual(["contagem|lava jato|:3:cheia", "contagem|lava jato|1:1:", "contagem|lava jato|2:1:", "contagem|lava jato|3:1:", "contagem|lava jato|4:1:", "betim|lava jato|:1:"]);
  });

  it("BH primeiro e por camadas: todos os termos na cidade inteira, depois os pedaços, só então a próxima cidade", async () => {
    const t = deps({ "lava jato em Belo Horizonte": 60, "lava rápido em Belo Horizonte": 60, area: 5, "lava jato em Contagem": 5, "lava rápido em Contagem": 5 });
    await executarBuscaAuto(estado({}, { cidades: ["Belo Horizonte", "Contagem"], termos: ["lava jato", "lava rápido"] }), 1000, 100, t.d);
    expect(t.feitas).toEqual([
      "belo horizonte|lava jato|:3:cheia", "belo horizonte|lava rápido|:3:cheia",
      "belo horizonte|lava jato|1:1:", "belo horizonte|lava jato|2:1:", "belo horizonte|lava jato|3:1:", "belo horizonte|lava jato|4:1:",
      "belo horizonte|lava rápido|1:1:", "belo horizonte|lava rápido|2:1:", "belo horizonte|lava rápido|3:1:", "belo horizonte|lava rápido|4:1:",
      "contagem|lava jato|:1:", "contagem|lava rápido|:1:",
    ]);
  });

  it("pedaço cheio que quase não rende leads novos não é dividido de novo", async () => {
    const conhecidos = new Set<string>();
    const t = deps({}, {
      pagina: async (p) => {
        // cidade inteira: 60 lugares novos; cada pedaço: 60 lugares que já estão na lista
        const ls = Array.from({ length: 20 }, () => lead({ cidade: p.cidade }));
        if (p.rect) ls.forEach((l) => conhecidos.add(l.telefoneKey));
        const pag = p.pageToken ? Number(p.pageToken) : 0;
        return { leads: ls, nextPageToken: pag < 2 ? String(pag + 1) : null, bruto: 20 };
      },
      existentes: async () => conhecidos,
    });
    const r = await executarBuscaAuto(estado({}, { cidades: ["Belo Horizonte"] }), 1000, 100, t.d);
    expect(t.feitas.filter((f) => f.startsWith("belo horizonte|lava jato|") && f.split("|")[2].includes("."))).toEqual([]);
    expect(r.consultas).toBe(3 + 4 * 3); // cidade inteira + 4 pedaços, sem os 16
    expect(r.motivo).toBe("esgotado");
  });

  it("categoria do Google que não é lavagem fica de fora, a não ser que o nome diga que lava", () => {
    expect(categoriaFora("Estacionamento", "Estacionamento Central")).toBe(true);
    expect(categoriaFora("Estacionamento", "Estacionamento e Lava Jato do Zé")).toBe(false);
    expect(categoriaFora("Oficina mecânica", "Auto Center Silva")).toBe(true);
    expect(categoriaFora("Lava-rápido", "Brilho Car")).toBe(false);
    expect(categoriaFora("", "Qualquer")).toBe(false);
    expect(motivoDescarte(lead({ categoria: "Loja de autopeças", nome: "Peças do João" }), "MG", new Set(), new Set())).toBe("fora_do_perfil");
  });

  it("respeita o máximo de consultas e não guarda a busca que parou no meio", async () => {
    const t = deps({ "lava jato em Contagem": 60 });
    const r = await executarBuscaAuto(estado(), 1000, 2, t.d);
    expect(r.motivo).toBe("limite");
    expect(r.consultas).toBe(2);
    expect(t.feitas).toEqual([]);
    expect(r.adicionados).toBe(40);
  });

  it("cota acabou: para sem erro", async () => {
    const t = deps({ "lava jato em Contagem": 60 });
    t.setCota(1);
    const r = await executarBuscaAuto(estado(), 1000, 40, t.d);
    expect(r.motivo).toBe("cota");
    expect(r.consultas).toBe(1);
  });

  it("erro de configuração do Google para a rodada; erro passageiro segue para a próxima busca", async () => {
    const fatal = deps({}, { pagina: async () => { throw Object.assign(new Error("chave errada"), { status: 503 }); } });
    const r1 = await executarBuscaAuto(estado(), 10, 40, fatal.d);
    expect(r1.motivo).toBe("erro");
    expect(r1.erro).toBe("chave errada");
    let i = 0;
    const passageiro = deps({ "lava jato em Betim": 5 });
    const pag = passageiro.d.pagina;
    passageiro.d.pagina = async (p) => { if (i++ === 0) throw Object.assign(new Error("timeout"), { status: 502 }); return pag(p); };
    const r2 = await executarBuscaAuto(estado(), 10, 40, passageiro.d);
    expect(r2.adicionados).toBe(5);
    expect(passageiro.feitas).toEqual(["betim|lava jato|:1:"]);
  });

  it("não grava quem já está na lista nem o mesmo telefone duas vezes", async () => {
    const repetido = lead({ telefoneKey: "31911112222", telefone: "5531911112222" });
    const jaNaLista = lead({ telefoneKey: "31933334444", telefone: "5531933334444" });
    const t = deps({}, {
      existentes: async () => new Set(["31933334444"]),
      pagina: async () => ({ leads: [repetido, { ...repetido, id: "outro" }, jaNaLista, lead({ telefoneTipo: "fixo" })], nextPageToken: null, bruto: 4 }),
    });
    const r = await executarBuscaAuto(estado({}, { cidades: ["Contagem"] }), 10, 40, t.d);
    expect(t.gravados.map((l) => l.telefoneKey)).toEqual(["31911112222"]);
    expect(r.descartes).toEqual({ repetido: 1, ja_na_lista: 1, sem_celular: 1 });
  });
});
