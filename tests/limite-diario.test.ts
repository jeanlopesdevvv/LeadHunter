import { describe, expect, it } from "vitest";

import { LIMITE_DIARIO_MAX, avisoDoLimite, validarLimiteDiario } from "@/lib/disparo-regras";

describe("limite diário da Carol", () => {
  it("aceita inteiros de 1 a 250 (número ou texto)", () => {
    expect(validarLimiteDiario(1)).toEqual({ ok: true, valor: 1 });
    expect(validarLimiteDiario("30")).toEqual({ ok: true, valor: 30 });
    expect(validarLimiteDiario(" 250 ")).toEqual({ ok: true, valor: LIMITE_DIARIO_MAX });
  });

  it("recusa vazio, zero, negativo, quebrado e acima do teto", () => {
    for (const v of ["", " ", 0, -5, 12.5, "abc", 251, null, undefined]) {
      expect(validarLimiteDiario(v).ok).toBe(false);
    }
    const r = validarLimiteDiario(300);
    expect(r.ok === false && /250/.test(r.erro)).toBe(true);
  });

  it("avisa acima de 50 e em aumento grande de uma vez", () => {
    expect(avisoDoLimite(20, 10)).toBeNull();
    expect(avisoDoLimite(25, 10)).toMatch(/aumento grande/);
    expect(avisoDoLimite(60, 50)).toMatch(/aos poucos/);
    expect(avisoDoLimite(5, 10)).toBeNull();
  });
});
