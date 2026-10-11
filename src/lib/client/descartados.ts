import type { Lead } from "@/lib/types";

/**
 * Contatos que o usuário descartou nas Oportunidades (não vão para a planilha).
 * Ficam lembrados neste navegador: numa próxima busca, quem já foi descartado não volta
 * como oportunidade nova (aparece em "Descartados", de onde dá para restaurar).
 */

const CHAVE = "radar:descartados:v1";
const MAX = 5000;

/** Pelo telefone (o mesmo lugar pode aparecer com outro id do Google) ou, sem telefone, pelo id. */
export function chaveDoDescarte(lead: Pick<Lead, "id" | "telefoneKey">): string {
  return lead.telefoneKey || `id:${lead.id}`;
}

function ler(): string[] {
  try {
    const raw = localStorage.getItem(CHAVE);
    const lista = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function gravar(lista: string[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(lista.slice(-MAX)));
  } catch {
    /* sem acesso ao armazenamento: vale só nesta tela */
  }
}

export function carregarDescartados(): Set<string> {
  return new Set(ler());
}

export function lembrarDescartados(chaves: string[]) {
  const atuais = ler().filter((k) => !chaves.includes(k));
  gravar([...atuais, ...chaves]);
}

export function esquecerDescartados(chaves: string[]) {
  const tirar = new Set(chaves);
  gravar(ler().filter((k) => !tirar.has(k)));
}

/** Marca na lista quem já tinha sido descartado antes. */
export function aplicarDescartados(leads: Lead[], descartados: Set<string> = carregarDescartados()): Lead[] {
  if (!descartados.size) return leads;
  return leads.map((l) => (descartados.has(chaveDoDescarte(l)) && !l.descartado && l.planilha !== "enviado" ? { ...l, descartado: true } : l));
}
