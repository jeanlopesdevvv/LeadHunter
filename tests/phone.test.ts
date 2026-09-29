import { describe, expect, it } from "vitest";

import { normalizePhone, phoneKey, phoneKeysFromCell } from "@/lib/phone";

describe("normalizePhone", () => {
  it("celular com +55 e máscara vira o formato da planilha", () => {
    const p = normalizePhone("+55 31 98299-9779");
    expect(p).toMatchObject({ digits: "5531982999779", kind: "celular", display: "(31) 98299-9779" });
  });

  it("aceita formato nacional, só dígitos e número salvo como número", () => {
    expect(normalizePhone("(31) 98299-9779").digits).toBe("5531982999779");
    expect(normalizePhone("31982999779").digits).toBe("5531982999779");
    expect(normalizePhone(5531982999779).digits).toBe("5531982999779");
  });

  it("remove zero de discagem e código de operadora", () => {
    expect(normalizePhone("031 98299-9779").digits).toBe("5531982999779");
    expect(normalizePhone("0 15 31 98299-9779").digits).toBe("5531982999779");
  });

  it("classifica fixo", () => {
    const p = normalizePhone("(31) 3333-4444");
    expect(p).toMatchObject({ digits: "553133334444", kind: "fixo" });
  });

  it("celular antigo sem o 9º dígito ganha o 9", () => {
    expect(normalizePhone("(31) 8299-9779")).toMatchObject({ digits: "5531982999779", kind: "celular" });
  });

  it("DDD 55 (Santa Maria/RS) não é confundido com o DDI", () => {
    expect(normalizePhone("55 99123-4567")).toMatchObject({ digits: "5555991234567", kind: "celular" });
    expect(normalizePhone("+55 55 99123-4567").digits).toBe("5555991234567");
  });

  it("0800 e 4004 são especiais (sem WhatsApp)", () => {
    expect(normalizePhone("0800 123 4567").kind).toBe("especial");
    expect(normalizePhone("4004-1234").kind).toBe("especial");
    expect(normalizePhone("+55 4004-1234").kind).toBe("especial"); // formato internacional do Google
    expect(normalizePhone("(31) 4004-1234").kind).toBe("especial");
  });

  it("vazio e lixo", () => {
    expect(normalizePhone("").kind).toBe("ausente");
    expect(normalizePhone(null).kind).toBe("ausente");
    expect(normalizePhone("12345").kind).toBe("invalido");
    expect(normalizePhone("(10) 99999-9999").kind).toBe("invalido"); // DDD inexistente
  });
});

describe("phoneKey (deduplicação)", () => {
  it("mesmo número em formatos diferentes gera a mesma chave", () => {
    const variants = ["5531982999779", "553182999779", "(31) 98299-9779", "+55 (31) 9 8299-9779", "31 8299-9779", 5531982999779];
    const keys = new Set(variants.map(phoneKey));
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBe("5531982999779");
  });

  it("fixo e celular com os mesmos 8 dígitos finais não colidem", () => {
    expect(phoneKey("(31) 3333-4444")).not.toBe(phoneKey("(31) 93333-4444"));
  });

  it("acha vários telefones numa célula", () => {
    expect(phoneKeysFromCell("(31) 98299-9779 / (31) 3333-4444").sort()).toEqual(["553133334444", "5531982999779"]);
    expect(phoneKeysFromCell("31 98299-9779 ramal 2")).toEqual(["5531982999779"]);
    expect(phoneKeysFromCell("5531982999779@s.whatsapp.net")).toEqual(["5531982999779"]);
    expect(phoneKeysFromCell("")).toEqual([]);
  });

  it("números diferentes geram chaves diferentes", () => {
    expect(phoneKey("31982999779")).not.toBe(phoneKey("31982999778"));
    expect(phoneKey("31982999779")).not.toBe(phoneKey("11982999779"));
  });
});
