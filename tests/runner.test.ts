import { afterEach, describe, expect, it, vi } from "vitest";

import { SessaoDeBusca } from "@/lib/client/search-runner";
import type { Lead, PlanResult, Uso } from "@/lib/types";

/**
 * Busca por quantidade: para ao chegar no número pedido, respeita o máximo de
 * consultas e divide o mapa quando o Google esgota os 60 resultados.
 */

const USO: Uso = {
  fonte: "simulacao",
  usadas: 0,
  limite: 1000,
  restantes: 1000,
  bloquear: true,
  inicioPeriodo: "2026-09-01T07:00:00.000Z",
  renovaEm: "2026-10-01T07:00:00.000Z",
  atualizadoEm: "2026-09-29T20:00:00.000Z",
  contandoDesde: "2026-09-29T20:00:00.000Z",
  aviso: "",
};

let seq = 0;
function lead(over: Partial<Lead> = {}): Lead {
  seq++;
  const tel = `55319${String(80000000 + seq).padStart(8, "0")}`;
  return {
    id: `p${seq}`,
    nome: `Lava Jato ${seq}`,
    telefone: tel,
    telefoneKey: tel,
    telefoneTipo: "celular",
    telefoneExibicao: tel,
    tipo: "Empresa",
    tipoMotivos: [],
    cidade: "Belo Horizonte",
    uf: "MG",
    bairro: "",
    endereco: "",
    site: "",
    mapsUrl: "",
    nota: null,
    avaliacoes: null,
    categoria: "",
    situacaoNegocio: "OPERATIONAL",
    semPontoFisico: false,
    termo: "lava jato",
    capturadoEm: "2026-09-29T20:00:00.000Z",
    planilha: "novo",
    ...over,
  };
}

const BH = { low: { latitude: -20, longitude: -44 }, high: { latitude: -19.8, longitude: -43.8 } };

function plano(tarefas = 1): PlanResult {
  return {
    tarefas: Array.from({ length: tarefas }, (_, i) => ({
      id: `t${i}`,
      termo: `termo ${i}`,
      cidade: "Belo Horizonte - MG",
      textQuery: `termo ${i} em Belo Horizonte - MG`,
      nivel: 0,
    })),
    areas: { "Belo Horizonte - MG": BH },
    cidades: [{ entrada: "Belo Horizonte - MG", nome: "Belo Horizonte", erro: "" }],
    uso: USO,
  };
}

type Pedido = { textQuery: string; rect?: unknown; pageToken?: string | null };
function mockPaginas(gerar: (pedido: Pedido, n: number) => { leads: Lead[]; nextPageToken: string | null; status?: number; erro?: unknown }) {
  const pedidos: Pedido[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const pedido = JSON.parse(String(init?.body)) as Pedido;
      pedidos.push(pedido);
      const r = gerar(pedido, pedidos.length);
      if (r.status) return new Response(JSON.stringify(r.erro), { status: r.status });
      return new Response(JSON.stringify({ leads: r.leads, nextPageToken: r.nextPageToken, bruto: r.leads.length }), { status: 200 });
    }),
  );
  return pedidos;
}

afterEach(() => vi.unstubAllGlobals());

describe("busca por quantidade de contatos novos", () => {
  it("para quando chega na quantidade pedida", async () => {
    const pedidos = mockPaginas((p) => ({
      leads: Array.from({ length: 20 }, () => lead()),
      nextPageToken: p.pageToken ? null : "PAG2",
    }));
    const s = new SessaoDeBusca(plano(1), { ignorarFechados: true });
    await s.executar({ alvo: 30, limite: 50, signal: new AbortController().signal, onUpdate: () => {} });
    expect(s.progresso.fim).toBe("alvo");
    expect(s.progresso.novos).toBeGreaterThanOrEqual(30);
    expect(pedidos.length).toBe(2); // 1ª e 2ª página bastaram
    expect(pedidos[1].pageToken).toBe("PAG2");
  });

  it("pedindo 1 contato, faz uma consulta por vez e para na primeira que achar", async () => {
    const pedidos = mockPaginas(() => ({ leads: [lead({ planilha: "existente" }), lead()], nextPageToken: "MAIS" }));
    const s = new SessaoDeBusca(plano(3), { ignorarFechados: true });
    await s.executar({ alvo: 1, limite: 3, signal: new AbortController().signal, onUpdate: () => {} });
    expect(s.progresso.fim).toBe("alvo");
    expect(pedidos.length).toBe(1);
  });

  it("não conta quem já está na planilha, sem celular, fechado ou repetido", async () => {
    const repetido = lead();
    mockPaginas(() => ({
      leads: [
        lead(),
        lead({ planilha: "existente" }),
        lead({ planilha: "optout" }),
        lead({ telefoneTipo: "fixo" }),
        lead({ situacaoNegocio: "CLOSED_PERMANENTLY" }),
        repetido,
        { ...repetido, id: "outro-id" }, // mesmo telefone
      ],
      nextPageToken: null,
    }));
    const s = new SessaoDeBusca(plano(1), { ignorarFechados: true });
    await s.executar({ alvo: 10, limite: 5, signal: new AbortController().signal, onUpdate: () => {} });
    expect(s.progresso).toMatchObject({ novos: 2, jaNaPlanilha: 2, semCelular: 1, fechados: 1, repetidos: 1, vistos: 7, unicos: 5 });
    expect(s.progresso.fim).toBe("esgotado");
  });

  it("com 'incluir telefone fixo', o fixo conta para a quantidade pedida", async () => {
    mockPaginas(() => ({ leads: [lead({ telefoneTipo: "fixo" }), lead()], nextPageToken: null }));
    const s = new SessaoDeBusca(plano(1), { ignorarFechados: false, incluirFixos: true });
    await s.executar({ alvo: 2, limite: 3, signal: new AbortController().signal, onUpdate: () => {} });
    expect(s.progresso).toMatchObject({ novos: 2, semCelular: 0, fim: "alvo" });
  });

  it("respeita o máximo de consultas e dá para continuar depois", async () => {
    const pedidos = mockPaginas(() => ({ leads: [lead({ planilha: "existente" })], nextPageToken: "MAIS" }));
    const s = new SessaoDeBusca(plano(4), { ignorarFechados: true });
    await s.executar({ alvo: 50, limite: 5, signal: new AbortController().signal, onUpdate: () => {} });
    expect(s.progresso.fim).toBe("limite");
    expect(s.progresso.consultas).toBe(5);
    expect(pedidos.length).toBe(5);
    expect(s.temMais).toBe(true);

    await s.executar({ alvo: 50, limite: 8, signal: new AbortController().signal, onUpdate: () => {} });
    expect(s.progresso.consultas).toBe(8);
    expect(pedidos.length).toBe(8);
  });

  it("divide o mapa em 4 quando o Google esgota os 60 resultados", async () => {
    const pedidos = mockPaginas((p) => ({
      leads: Array.from({ length: 20 }, () => lead({ planilha: "existente" })),
      nextPageToken: p.rect ? null : p.pageToken === "P3" ? null : p.pageToken === "P2" ? "P3" : "P2",
    }));
    const s = new SessaoDeBusca(plano(1), { ignorarFechados: true });
    await s.executar({ alvo: 10, limite: 7, signal: new AbortController().signal, onUpdate: () => {} });
    expect(pedidos.slice(0, 3).every((p) => !p.rect)).toBe(true); // 3 páginas da cidade inteira
    const partes = pedidos.slice(3);
    expect(partes).toHaveLength(4);
    expect(partes.every((p) => p.rect && p.textQuery === "termo 0")).toBe(true);
    expect(s.progresso.fim).toBe("esgotado"); // cada parte veio com menos de 60: acabou
  });

  it("para tudo quando as consultas grátis acabam", async () => {
    mockPaginas((_, n) =>
      n >= 2
        ? { leads: [], nextPageToken: null, status: 429, erro: { erro: "As 1.000 consultas grátis deste mês acabaram.", cota: true, uso: { ...USO, restantes: 0 } } }
        : { leads: [lead()], nextPageToken: "MAIS" },
    );
    const s = new SessaoDeBusca(plano(1), { ignorarFechados: true });
    await s.executar({ alvo: 50, limite: 20, signal: new AbortController().signal, onUpdate: () => {} });
    expect(s.progresso.fim).toBe("cota");
    expect(s.progresso.erro).toMatch(/acabaram/);
    expect(s.ultimoUso?.restantes).toBe(0);
    expect(s.progresso.consultas).toBe(1);
  });
});
