/**
 * As cores de cada empresa (13/11/2026, white label): a partir da cor escolhida, a mesma escala que o globals.css usa
 * (brand-50 a brand-800), no claro e no escuro. A Voob e o Lavacar continuam com as cores feitas à mão no globals.css.
 */

type Rgb = [number, number, number];

const hexParaRgb = (h: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
const rgbParaHex = (c: Rgb) => `#${c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("")}`;
/** Mistura `a` com `b` (t = quanto de b). */
const misturar = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as Rgb;

const BRANCO: Rgb = [255, 255, 255];
const PRETO: Rgb = [0, 0, 0];
const FUNDO_ESCURO: Rgb = [13, 15, 13];

export function escalaDaCor(cor: string) {
  const c = hexParaRgb(/^#[0-9a-f]{6}$/i.test(cor) ? cor : "#4e9a1a");
  const claro = (t: number) => rgbParaHex(misturar(c, BRANCO, t));
  const escuro = (t: number) => rgbParaHex(misturar(c, PRETO, t));
  const noFundo = (t: number) => rgbParaHex(misturar(FUNDO_ESCURO, c, t));
  const c400 = misturar(c, BRANCO, 0.2);
  return {
    rgb: c.join(" "),
    rgb400: c400.map(Math.round).join(" "),
    claro: {
      "50": claro(0.92), "100": claro(0.84), "200": claro(0.65), "300": claro(0.42), "400": rgbParaHex(c400),
      "500": rgbParaHex(c), "600": escuro(0.15), "700": escuro(0.32), "800": escuro(0.5),
    },
    escuro: { "50": noFundo(0.12), "100": noFundo(0.18), "200": noFundo(0.28), "700": claro(0.42), "800": claro(0.65) },
  };
}

/** O CSS da empresa (vai num <style> no <head>, depois do globals.css). `id` já conferido (letras, números e -). */
export function cssDaMarca(id: string, cor: string): string {
  if (!/^[a-z0-9-]{2,30}$/.test(id)) return "";
  const e = escalaDaCor(cor);
  const sel = `html[data-empresa="${id}"]`;
  return [
    `${sel}{--brand-rgb:${e.rgb};--brand-400-rgb:${e.rgb400};`,
    `--color-brand-50:${e.claro["50"]};--color-brand-100:${e.claro["100"]};--color-brand-200:${e.claro["200"]};--color-brand-300:${e.claro["300"]};`,
    `--color-brand-400:${e.claro["400"]};--color-brand:${e.claro["500"]};--color-brand-600:${e.claro["600"]};--color-brand-700:${e.claro["700"]};`,
    `--color-brand-800:${e.claro["800"]};--color-brand-press:${e.claro["700"]};--color-grafico-envio:${e.claro["400"]};--color-grafico-resposta:${e.claro["700"]};`,
    `--shadow-brand:0 10px 30px -10px rgb(${e.rgb} / 0.55);}`,
    `html[data-theme="dark"]${sel.slice(4)}{--color-brand-50:${e.escuro["50"]};--color-brand-100:${e.escuro["100"]};--color-brand-200:${e.escuro["200"]};`,
    `--color-brand-700:${e.escuro["700"]};--color-brand-800:${e.escuro["800"]};--color-grafico-envio:${e.claro["600"]};--color-grafico-resposta:${e.claro["300"]};`,
    `--shadow-brand:0 10px 30px -12px rgb(${e.rgb} / 0.45);}`,
  ].join("");
}
