import { describe, expect, it } from "vitest";

import { comoFunilConvites, maiorQueda } from "@/lib/convites-regras";

describe("funil Do link à conta", () => {
  const j = {
    desde: "2026-11-09T13:00:00Z", dias: 14,
    etapas: { enviados: 10, abriram: 8, formulario: 7, comecaram: 6, enviaram: 3, conta: 2 },
    faltou: [{ campo: "address", n: 1 }, { campo: "document", n: 3 }, { campo: "xyz", n: 0 }],
    erros: [{ em: "2026-11-09T14:00:00Z", mensagem: "E-mail já cadastrado." }, { em: null, mensagem: "" }],
    ultimos: [{ nome: "", enviado_em: "2026-11-09T13:00:00Z", aberturas: 2, etapa: "comecou", ultimo_passo: null }],
  };
  it("lê o que o banco devolve", () => {
    const f = comoFunilConvites(j);
    expect(f.disponivel).toBe(true);
    expect(f.etapas.conta).toBe(2);
    expect(f.faltou.map((c) => c.texto)).toEqual(["CPF ou CNPJ", "Endereço"]);
    expect(f.erros).toHaveLength(1);
    expect(f.ultimos[0]).toMatchObject({ nome: "Lead sem nome", texto: "Começou a preencher", aberturas: 2 });
  });
  it("aceita texto JSON e esconde quando o banco ainda não tem a função", () => {
    expect(comoFunilConvites(JSON.stringify(j)).etapas.enviados).toBe(10);
    expect(comoFunilConvites(null).disponivel).toBe(false);
    expect(comoFunilConvites({}).disponivel).toBe(false);
  });
  it("aponta a maior queda", () => {
    expect(maiorQueda(comoFunilConvites(j))).toEqual({ de: "Começaram a preencher", para: "Tentaram criar a conta", perderam: 3, pct: 50 });
    expect(maiorQueda(comoFunilConvites({ etapas: {} }))).toBeNull();
  });
});
