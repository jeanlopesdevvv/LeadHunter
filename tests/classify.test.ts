import { describe, expect, it } from "vitest";

import { classifyLead } from "@/lib/classify";
import { cityFromInput, splitLines, splitRect, sugerirLimite } from "@/lib/geo";

describe("classifyLead", () => {
  it("lava-jato com ponto físico e muitas avaliações é Empresa", () => {
    expect(classifyLead({ nome: "Lava Jato Brilho", endereco: "R. X, 10", avaliacoes: 180 }).tipo).toBe("Empresa");
  });

  it("lava-jato pequeno com ponto físico continua Empresa (plano Lava Jato)", () => {
    expect(classifyLead({ nome: "Lava Jato do Zé", endereco: "R. X, 10", avaliacoes: 4 }).tipo).toBe("Empresa");
  });

  it("atendimento a domicílio sem ponto físico é Autônomo", () => {
    expect(classifyLead({ nome: "Lavagem a Domicílio BH", semPontoFisico: true, avaliacoes: 3 }).tipo).toBe("Autônomo");
  });

  it("nome de pessoa sem site é Autônomo", () => {
    expect(classifyLead({ nome: "Jean Lopes", avaliacoes: 2 }).tipo).toBe("Autônomo");
  });

  it("'automóvel' não é confundido com 'móvel'", () => {
    expect(classifyLead({ nome: "Estética de Automóvel Premium", endereco: "Av. Y", avaliacoes: 60 }).tipo).toBe("Empresa");
  });
});

describe("geo", () => {
  it("extrai a cidade do texto digitado", () => {
    expect(cityFromInput("Belo Horizonte - MG")).toBe("Belo Horizonte");
    expect(cityFromInput("São Paulo/SP")).toBe("São Paulo");
    expect(cityFromInput("Contagem, MG")).toBe("Contagem");
    expect(cityFromInput("Nova Lima")).toBe("Nova Lima");
  });

  it("divide a área em n×n sem buracos", () => {
    const cells = splitRect({ low: { latitude: 0, longitude: 0 }, high: { latitude: 3, longitude: 3 } }, 3);
    expect(cells).toHaveLength(9);
    expect(cells[8].high).toEqual({ latitude: 3, longitude: 3 });
  });

  it("sugere um limite de consultas proporcional à quantidade pedida", () => {
    expect(sugerirLimite(20, 2, 200)).toBe(8);
    expect(sugerirLimite(50, 2, 200)).toBe(20);
    expect(sugerirLimite(500, 2, 200)).toBe(200); // respeita o máximo
    expect(sugerirLimite(5, 1, 200)).toBe(5); // mínimo de 5
    expect(sugerirLimite(20, 12, 200)).toBe(12); // ao menos 1 por termo × cidade
    expect(sugerirLimite(50, 2, 3)).toBe(3); // poucas consultas restantes
  });

  it("quebra linhas e remove repetidos", () => {
    expect(splitLines("lava jato\nLava Jato\n\n estética ")).toEqual(["lava jato", "estética"]);
  });
});
