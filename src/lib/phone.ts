/**
 * Telefones brasileiros: normalização para o formato que a Carol usa
 * (55 + DDD + número, só dígitos) e chave de deduplicação.
 *
 * A chave é o próprio número normalizado. Como o celular antigo sem o 9º
 * dígito (8 dígitos começando com 6-9) ganha o 9 na normalização, o mesmo
 * contato com ou sem o 9, com máscara, com +55 ou com zero de operadora gera
 * a mesma chave — e um fixo (31) 3333-4444 nunca colide com o celular
 * (31) 93333-4444.
 */

export type PhoneKind = "celular" | "fixo" | "especial" | "invalido" | "ausente";

export interface NormalizedPhone {
  /** Formato da planilha: 5531982999779 (vazio quando não dá para usar). */
  digits: string;
  /** Chave de deduplicação (igual a digits quando o número é válido). */
  key: string;
  kind: PhoneKind;
  /** Exibição: (31) 98299-9779 */
  display: string;
}

const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const EMPTY: NormalizedPhone = { digits: "", key: "", kind: "ausente", display: "" };

function onlyDigits(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\D+/g, "");
}

const SPECIAL_8 = /^(3003|3004|4003|4004|4020|4062)\d{4}$/;

/** Números não geográficos: 0800, 0300, 0500, 0900 e 3003/4003/4004/4020 etc. */
function isSpecial(d: string): boolean {
  return /^0?(800|300|500|900)\d{6,8}$/.test(d) || SPECIAL_8.test(d);
}

function formatDisplay(ddd: string, sub: string): string {
  if (sub.length === 9) return `(${ddd}) ${sub.slice(0, 5)}-${sub.slice(5)}`;
  return `(${ddd}) ${sub.slice(0, 4)}-${sub.slice(4)}`;
}

/** Remove DDI 55, zero de discagem e código de operadora (0 + 2 dígitos). */
function toNational(d: string): string | null {
  let n = d;
  if ((n.length === 12 || n.length === 13) && n.startsWith("55")) n = n.slice(2);
  else if ((n.length === 14 || n.length === 15) && n.startsWith("0055")) n = n.slice(4);
  else if (n.length === 11 && n.startsWith("0") && !n.startsWith("00")) n = n.slice(1);
  else if (n.length === 12 && n.startsWith("0")) n = n.slice(1);
  else if ((n.length === 13 || n.length === 14) && n.startsWith("0")) n = n.slice(3); // 0 + operadora
  if (n.length === 10 || n.length === 11) return n;
  return null;
}

export function normalizePhone(raw: unknown): NormalizedPhone {
  const d = onlyDigits(raw);
  if (!d) return EMPTY;
  if (isSpecial(d)) return { digits: "", key: "", kind: "especial", display: String(raw ?? "").trim() };

  const national = toNational(d);
  if (!national) return { digits: "", key: "", kind: "invalido", display: String(raw ?? "").trim() };
  // "+55 4004-1234" / "+55 800 123 4567": especial também depois de tirar o 55.
  if (isSpecial(national) || SPECIAL_8.test(national.slice(2))) {
    return { digits: "", key: "", kind: "especial", display: String(raw ?? "").trim() };
  }

  const ddd = national.slice(0, 2);
  let sub = national.slice(2);
  if (!VALID_DDD.has(Number(ddd))) {
    return { digits: "", key: "", kind: "invalido", display: String(raw ?? "").trim() };
  }

  let kind: PhoneKind;
  if (sub.length === 9) {
    if (sub[0] !== "9") return { digits: "", key: "", kind: "invalido", display: String(raw ?? "").trim() };
    kind = "celular";
  } else {
    // 8 dígitos: 2-5 = fixo; 6-9 = celular antigo, sem o 9º dígito.
    const first = Number(sub[0]);
    if (first >= 2 && first <= 5) kind = "fixo";
    else if (first >= 6) {
      kind = "celular";
      sub = `9${sub}`;
    } else {
      return { digits: "", key: "", kind: "invalido", display: String(raw ?? "").trim() };
    }
  }

  const digits = `55${ddd}${sub}`;
  return { digits, key: digits, kind, display: formatDisplay(ddd, sub) };
}

/**
 * Todas as chaves de telefone dentro de uma célula: "(31) 98299-9779 / (31) 3333-4444",
 * "31 98299-9779 ramal 2", "5531982999779@s.whatsapp.net", texto livre com números.
 */
export function phoneKeysFromCell(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  const text = String(value);
  const keys = new Set<string>();
  const whole = phoneKey(text);
  if (whole) keys.add(whole);
  for (const part of text.split(/[^\d+()\s.-]+/)) {
    const k = phoneKey(part);
    if (k) keys.add(k);
  }
  return [...keys];
}

/** Chave de deduplicação de qualquer valor vindo da planilha (número, texto, máscara). */
export function phoneKey(raw: unknown): string {
  return normalizePhone(raw).key;
}

export function whatsappLink(digits: string): string {
  return digits ? `https://wa.me/${digits}` : "";
}

export const PHONE_KIND_LABEL: Record<PhoneKind, string> = {
  celular: "Celular",
  fixo: "Fixo",
  especial: "0800/4004",
  invalido: "Inválido",
  ausente: "Sem telefone",
};
