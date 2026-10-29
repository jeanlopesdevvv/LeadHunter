import { describe, expect, it } from "vitest";

import { comoFunil, periodoValido, taxa } from "@/lib/funil-regras";

describe("funil de ativação", () => {
  const doBanco = {
    dias: 30,
    etapas: [
      { chave: "conversaram", rotulo: "Conversaram com a Carol", n: 48 },
      { chave: "link", rotulo: "Receberam o link de cadastro", n: 8 },
      { chave: "conta", rotulo: "Criaram a conta de parceiro", n: 1 },
      { chave: "pronto", rotulo: "Lava-jato pronto para clientes", n: 1 },
      { chave: "agendamento", rotulo: "Primeiro agendamento", n: 0 },
    ],
    conta_sem_link: 2,
    ja_parceiros: 3,
    cadastros: { total: 2, prontos: 1, com_agendamento: 0, pela_carol: 1 },
    parados: [{ unidade: "Lava Rápido Centro", dias: 3.4, pronto: false, agendamentos: 0, falta: "cadastrar os serviços com preço", pela_carol: true }],
    gerado_em: "2026-10-30T12:00:00Z",
  };

  it("lê o jsonb do banco", () => {
    const f = comoFunil(doBanco, 30);
    expect(f.disponivel).toBe(true);
    expect(f.etapas.map((e) => e.n)).toEqual([48, 8, 1, 1, 0]);
    expect(f.contaSemLink).toBe(2);
    expect(f.jaParceiros).toBe(3);
    expect(f.cadastros).toEqual({ total: 2, prontos: 1, comAgendamento: 0, pelaCarol: 1 });
    expect(f.parados[0]).toEqual({ unidade: "Lava Rápido Centro", dias: 3, pronto: false, agendamentos: 0, falta: "cadastrar os serviços com preço", pelaCarol: true });
  });

  it("aguenta texto, campo faltando e lixo", () => {
    expect(comoFunil(JSON.stringify(doBanco), 30).etapas).toHaveLength(5);
    const vazio = comoFunil(null, 7);
    expect(vazio.dias).toBe(7);
    expect(vazio.etapas).toEqual([]);
    expect(vazio.parados).toEqual([]);
    expect(vazio.cadastros.total).toBe(0);
    expect(vazio.jaParceiros).toBe(0);
    expect(comoFunil("{nada", 30).etapas).toEqual([]);
    expect(comoFunil({ etapas: [{ chave: "x" }, { chave: "y", rotulo: "Y", n: -3 }] }, 30).etapas).toEqual([{ chave: "y", rotulo: "Y", n: 0 }]);
    expect(comoFunil({ parados: [{}] }, 30).parados[0].unidade).toBe("(sem nome)");
  });

  it("período só 7, 30 ou 90 dias", () => {
    expect(periodoValido("7")).toBe(7);
    expect(periodoValido(90)).toBe(90);
    expect(periodoValido("365")).toBe(30);
    expect(periodoValido(null)).toBe(30);
    expect(periodoValido("abc")).toBe(30);
  });

  it("taxa da etapa anterior", () => {
    expect(taxa(8, 48)).toBe(17);
    expect(taxa(1, 1)).toBe(100);
    expect(taxa(0, 0)).toBeNull();
  });
});
