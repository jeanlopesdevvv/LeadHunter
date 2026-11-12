import { describe, expect, it } from "vitest";

import {
  avisoDoLimiteVoob,
  CHEIA,
  chaveVoob,
  consultasPermitidas,
  descarte,
  executarBuscaVoob,
  itensDaSituacaoVoob,
  quantoPrecisa,
  textoQualidade,
  ufDaCidade,
  unidadesDaBusca,
  validarLimiteVoob,
  type DependenciasVoob,
} from "@/lib/voob/busca-auto-regras";
import type { RaioX } from "@/lib/voob/raio-x-regras";
import { custoPor, funil } from "@/lib/voob/regras";
import type { ConfigBuscaAuto, EntradaBase, EstadoBuscaAuto, PainelVoob, SituacaoConferida } from "@/lib/voob/tipos";
import type { Lead, PageResult } from "@/lib/types";

let seq = 0;
function lead(p: Partial<Lead> = {}): Lead {
  seq++;
  const tel = p.telefone ?? `55319${String(70000000 + seq).padStart(8, "0")}`;
  return {
    id: `v${seq}`, nome: `Clínica ${seq}`, telefone: tel, telefoneKey: p.telefoneKey ?? tel.slice(-11), telefoneTipo: "celular",
    telefoneExibicao: "", tipo: "Empresa", tipoMotivos: [], cidade: "Belo Horizonte", uf: "MG", bairro: "", endereco: "Rua A", site: "", mapsUrl: "",
    nota: 4.5, avaliacoes: 10, categoria: "Clínica", situacaoNegocio: "OPERATIONAL", semPontoFisico: false, termo: "clínica de estética",
    capturadoEm: "", planilha: "novo", ...p,
  };
}

const CFG: ConfigBuscaAuto = { ligado: true, fila_dias: 3, max_consultas_dia: 40, reserva_cota: 150, refazer_dias: 60 };

function estado(p: Partial<EstadoBuscaAuto> = {}): EstadoBuscaAuto {
  return {
    config: CFG, perfil: { cidade: "Belo Horizonte, MG", segmentos: ["imobiliarias"] }, limite: 20, dias: [1, 2, 3, 4, 5],
    situacoes_site: ["sem_site", "rede_social"], ligado: true, dia_de_disparo: true, base_pronta: 0, consultas_hoje: 0, rodando: false,
    feitas: [], ultimas: [], ...p,
  };
}

/** Google de mentira: `por` diz quantos lugares cada busca (texto) tem; `site` decide o site de cada lugar. */
function deps(por: Record<string, number>, opcoes: { site?: (i: number) => string; conferido?: (tel: string) => SituacaoConferida; raio?: (url: string) => RaioX; cota?: number } = {}) {
  const chamadas: string[] = [];
  const feitas: string[] = [];
  const gravados: EntradaBase[] = [];
  let cota = opcoes.cota ?? 1000;
  const d: DependenciasVoob = {
    pagina: async (p): Promise<PageResult> => {
      chamadas.push(p.textQuery);
      const total = por[p.textQuery] ?? 0;
      const pag = p.pageToken ? Number(p.pageToken) : 0;
      const qtd = Math.max(0, Math.min(20, total - pag * 20));
      const leads = Array.from({ length: qtd }, (_, i) => lead({ site: opcoes.site?.(i) ?? "" }));
      return { leads, bruto: qtd, nextPageToken: total > (pag + 1) * 20 && pag < 2 ? String(pag + 1) : null };
    },
    reservar: async () => (cota-- > 0 ? { ok: true, concluir: () => undefined } : { ok: false, concluir: () => undefined }),
    raioX: async (urls) => urls.map((u) => opcoes.raio?.(u) ?? { situacao: "ok", problemas: [], textos: [], ano: null }),
    conferir: async (tels) => new Map(tels.map((t) => [t, opcoes.conferido?.(t) ?? "novo"])),
    gravar: async (e) => {
      gravados.push(...e);
      return e.length;
    },
    feita: async (u) => {
      feitas.push(chaveVoob(u));
    },
  };
  return { d, chamadas, feitas, gravados };
}

describe("busca automática da Voob: quanto buscar", () => {
  it("precisa = limite × dias − base pronta", () => {
    expect(quantoPrecisa(estado({ base_pronta: 10 }))).toBe(50);
    expect(quantoPrecisa(estado({ base_pronta: 80 }))).toBe(0);
    expect(quantoPrecisa(estado({ limite: 0 }))).toBe(0);
  });
  it("pode gastar o que sobra do dia e da cota (menos a reserva da busca manual)", () => {
    expect(consultasPermitidas(estado({ consultas_hoje: 10 }), 900)).toBe(30);
    expect(consultasPermitidas(estado(), 170)).toBe(20);
    expect(consultasPermitidas(estado(), 100)).toBe(0);
    expect(consultasPermitidas(estado(), null)).toBe(40);
  });
});

describe("busca automática da Voob: o que buscar", () => {
  it("cada termo na cidade inteira primeiro; depois os 15 bairros de BH", () => {
    const u = unidadesDaBusca({ cidade: "Belo Horizonte, MG", segmentos: ["imobiliarias"] });
    expect(u.slice(0, 2)).toEqual([
      { termo: "imobiliária", lugar: "Belo Horizonte, MG", camada: 0 },
      { termo: "corretor de imóveis", lugar: "Belo Horizonte, MG", camada: 0 },
    ]);
    expect(u.filter((x) => x.camada === 1)).toHaveLength(30);
    expect(u[2]).toEqual({ termo: "imobiliária", lugar: "Savassi, Belo Horizonte, MG", camada: 1 });
  });
  it("usa os bairros escolhidos e os termos a mais; fora de BH sem bairros, só a cidade", () => {
    const u = unidadesDaBusca({ cidade: "Belo Horizonte, MG", segmentos: ["imobiliarias"], termos_extras: ["Pilates"], bairros: ["Sion"] });
    expect(u.map((x) => x.lugar)).toContain("Sion, Belo Horizonte, MG");
    expect(u.some((x) => x.termo === "pilates")).toBe(true);
    expect(unidadesDaBusca({ cidade: "Contagem, MG", segmentos: ["imobiliarias"] }).every((x) => x.camada === 0)).toBe(true);
    expect(unidadesDaBusca(null).length).toBeGreaterThan(10);
  });
  it("UF da cidade", () => {
    expect(ufDaCidade("Belo Horizonte, MG")).toBe("MG");
    expect(ufDaCidade("Belo Horizonte")).toBe("");
  });
  it("descarta fixo, fechado, outro estado, sem nome e repetido", () => {
    const vistos = new Set(["31970000999"]);
    expect(descarte(lead({ telefoneTipo: "fixo" }), "MG", vistos)).toBe("sem_celular");
    expect(descarte(lead({ situacaoNegocio: "CLOSED_PERMANENTLY" }), "MG", vistos)).toBe("fechado");
    expect(descarte(lead({ uf: "SP" }), "MG", vistos)).toBe("outro_estado");
    expect(descarte(lead({ nome: "(sem nome)" }), "MG", vistos)).toBe("sem_nome");
    expect(descarte(lead({ telefoneKey: "31970000999" }), "MG", vistos)).toBe("repetido");
    expect(descarte(lead(), "MG", vistos)).toBeNull();
  });
});

describe("busca automática da Voob: a rodada", () => {
  const cidade = (t: string) => `${t} em Belo Horizonte, MG`;
  it("para no alvo e grava na base só quem não tem site ou só tem rede social", async () => {
    const { d, gravados, chamadas } = deps({ [cidade("imobiliária")]: 60, [cidade("corretor de imóveis")]: 60 }, { site: (i) => (i % 3 === 0 ? "https://imob.com.br" : i % 3 === 1 ? "https://instagram.com/x" : "") });
    const r = await executarBuscaVoob(estado(), 20, 40, d);
    expect(r.motivo).toBe("alvo");
    expect(r.adicionados).toBeGreaterThanOrEqual(20);
    expect(gravados.every((g) => g.site_situacao === "sem_site" || g.site_situacao === "rede_social")).toBe(true);
    expect(r.descartes.tem_site).toBeGreaterThan(0);
    expect(chamadas[0]).toBe(cidade("imobiliária"));
  });
  it("bairro só para o termo que veio cheio na cidade", async () => {
    const { d, chamadas } = deps({ [cidade("imobiliária")]: 60, [cidade("corretor de imóveis")]: 12 });
    await executarBuscaVoob(estado(), 10_000, 400, d);
    expect(chamadas.some((c) => c.startsWith("imobiliária em Savassi"))).toBe(true);
    expect(chamadas.some((c) => c.startsWith("corretor de imóveis em Savassi"))).toBe(false);
  });
  it("não repete o que já foi buscado; sem saber se a cidade veio cheia, não vai aos bairros", async () => {
    const { d, chamadas } = deps({});
    const r = await executarBuscaVoob(estado({ feitas: [{ termo: "imobiliária", lugar: "Belo Horizonte, MG", cheia: false, novos: 3 }, { termo: "corretor de imóveis", lugar: "Belo Horizonte, MG", cheia: false, novos: 0 }] }), 50, 40, d);
    expect(chamadas).toEqual([]);
    expect(r.motivo).toBe("esgotado");
  });
  it("para no máximo de consultas e não guarda a busca que ficou pela metade", async () => {
    const { d, feitas } = deps({ [cidade("imobiliária")]: 60 });
    const r = await executarBuscaVoob(estado(), 1000, 2, d);
    expect(r.motivo).toBe("limite");
    expect(r.consultas).toBe(2);
    expect(feitas).toEqual([]);
  });
  it("para na cota", async () => {
    const { d } = deps({ [cidade("imobiliária")]: 60 }, { cota: 1 });
    const r = await executarBuscaVoob(estado(), 1000, 40, d);
    expect(r.motivo).toBe("cota");
    expect(r.consultas).toBe(1);
  });
  it("quem já é da Voob (cliente, lead, conversa, base) não entra", async () => {
    const { d, gravados } = deps({ [cidade("imobiliária")]: 10 }, { conferido: (t) => (Number(t.slice(-1)) % 2 ? "ja_no_crm" : "novo") });
    const r = await executarBuscaVoob(estado(), 100, 40, d);
    expect(gravados.length).toBe(r.adicionados);
    expect(r.descartes.ja_da_voob).toBe(10 - gravados.length);
  });
  it("com 'também site desatualizado': passa no Raio-X e entra só o desatualizado, com o que foi achado", async () => {
    const raio = (u: string): RaioX => (u.endsWith("velho.com.br") ? { situacao: "desatualizado", problemas: ["sem_celular"], textos: ["o site não se adapta à tela do celular"], ano: null } : { situacao: "ok", problemas: [], textos: [], ano: null });
    const { d, gravados } = deps({ [cidade("imobiliária")]: 4 }, { site: (i) => (i === 0 ? "https://velho.com.br" : i === 1 ? "https://novo.com.br" : ""), raio });
    const r = await executarBuscaVoob(estado({ perfil: { cidade: "Belo Horizonte, MG", segmentos: ["imobiliarias"], com_desatualizado: true } }), 100, 40, d);
    const velho = gravados.find((g) => g.site_url === "https://velho.com.br");
    expect(velho?.site_situacao).toBe("desatualizado");
    expect(velho?.site_problemas).toEqual(["o site não se adapta à tela do celular"]);
    expect(gravados.some((g) => g.site_url === "https://novo.com.br")).toBe(false);
    expect(r.descartes.site_em_dia).toBe(1);
  });
  it("busca cheia: CHEIA perto dos 60", () => expect(CHEIA).toBe(55));
});

describe("limite, saúde e vendas", () => {
  it("limite por dia de 1 a 250, inteiro", () => {
    expect(validarLimiteVoob("30")).toEqual({ ok: true, valor: 30 });
    expect(validarLimiteVoob(0).ok).toBe(false);
    expect(validarLimiteVoob(251).ok).toBe(false);
    expect(validarLimiteVoob("2,5").ok).toBe(false);
  });
  it("avisa subida de mais de 50% de uma vez", () => {
    expect(avisoDoLimiteVoob(30, 20)).toBeNull();
    expect(avisoDoLimiteVoob(50, 20)).toMatch(/no máximo 50% por vez \(até 30\)/);
  });
  it("qualidade e situação da Meta em português", () => {
    expect(textoQualidade("GREEN")).toBe("verde (alta)");
    expect(textoQualidade("UNKNOWN")).toMatch(/sem nota/);
    expect(itensDaSituacaoVoob({ status: "FLAGGED", nome_status: "DECLINED", pode_enviar: "LIMITED" })).toEqual([
      { texto: "Sinalizado pela Meta", ok: false },
      { texto: "Envio limitado pela Meta", ok: false },
      { texto: "Nome de exibição recusado", ok: false },
    ]);
    expect(itensDaSituacaoVoob({ status: "CONNECTED", nome_status: "APPROVED", pode_enviar: "AVAILABLE" })).toEqual([
      { texto: "Conectado", ok: true },
      { texto: "Nome de exibição aprovado", ok: true },
    ]);
  });
  it("custo por venda e funil termina em Compraram", () => {
    expect(custoPor(100, 4)).toBe(8.04);
    expect(custoPor(100, 0)).toBeNull();
    const p = { total: { base: 10, na_fila: 2, enviados: 100, responderam: 20, interessados: 8, vendas: 2 } } as unknown as PainelVoob;
    expect(funil(p).at(-1)).toEqual({ id: "vendas", rotulo: "Compraram", valor: 2 });
  });
});
