import { telefonesBloqueados } from "@/lib/bloqueio";
import { handleError, isString, jsonError, readJson } from "@/lib/http";
import { normalizePhone, phoneKey } from "@/lib/phone";
import type { LeadForSheet } from "@/lib/sheet-mapping";
import { appendLeads } from "@/lib/sheets";

export const maxDuration = 60;

const TIPOS = new Set(["Autônomo", "Empresa"]);

function toLead(v: unknown): LeadForSheet | null {
  const l = v as Record<string, unknown>;
  if (!l || !isString(l.telefone) || !isString(l.nome) || !isString(l.tipo) || !isString(l.cidade)) return null;
  if (!TIPOS.has(l.tipo)) return null;
  const s = (x: unknown, max = 300) => (isString(x) ? x.slice(0, max) : "");
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return {
    telefone: normalizePhone(l.telefone).digits, // vazio = ignorado como telefone inválido
    nome: l.nome.trim().slice(0, 200),
    tipo: l.tipo,
    cidade: l.cidade.trim().slice(0, 120),
    endereco: s(l.endereco),
    bairro: s(l.bairro, 120),
    uf: s(l.uf, 2),
    site: s(l.site),
    mapsUrl: s(l.mapsUrl),
    nota: n(l.nota),
    avaliacoes: n(l.avaliacoes),
    categoria: s(l.categoria, 120),
    placeId: s(l.placeId, 200),
    termo: s(l.termo, 80),
  };
}

/**
 * Envio idempotente: o navegador manda um id de lote e, se a conexão cair no meio e ele
 * tentar de novo, recebe a mesma resposta em vez de gravar (ou "pular") duas vezes.
 */
type Lote = { quando: number; resposta: Promise<{ status: number; corpo: unknown }> };
const g = globalThis as { __radarLotes?: Map<string, Lote> };
const LOTES = (g.__radarLotes ??= new Map());
const LOTE_VALIDADE = 15 * 60_000;

export async function POST(request: Request) {
  const body = await readJson<{ leads?: unknown; lote?: unknown }>(request);
  const lote = isString(body?.lote) && /^[\w-]{8,64}$/.test(body.lote) ? body.lote : "";
  const agora = Date.now();
  for (const [id, l] of LOTES) if (agora - l.quando > LOTE_VALIDADE) LOTES.delete(id);
  if (lote && LOTES.has(lote)) {
    const r = await LOTES.get(lote)!.resposta;
    return Response.json(r.corpo, { status: r.status });
  }
  const resposta = processar(body);
  if (lote) LOTES.set(lote, { quando: agora, resposta });
  const r = await resposta;
  // Erro: não guarda, para a próxima tentativa rodar de verdade.
  if (lote && r.status >= 400) LOTES.delete(lote);
  return Response.json(r.corpo, { status: r.status });
}

async function processar(body: { leads?: unknown } | null): Promise<{ status: number; corpo: unknown }> {
  const resp = await enviarLote(body);
  return { status: resp.status, corpo: await resp.json() };
}

async function enviarLote(body: { leads?: unknown } | null): Promise<Response> {
  if (!Array.isArray(body?.leads) || !body.leads.length) return jsonError("Nenhum contato marcado.");
  if (body.leads.length > 1000) return jsonError("Envie no máximo 1.000 contatos por vez.");
  const leads = body.leads.map(toLead);
  if (leads.some((l) => !l)) return jsonError("Algum contato está com dados inválidos (telefone, nome, tipo ou cidade).");
  const bloqueados = telefonesBloqueados();
  const permitidos = (leads as LeadForSheet[]).filter((l) => !bloqueados.has(phoneKey(l.telefone)));
  const barrados = (leads as LeadForSheet[])
    .filter((l) => bloqueados.has(phoneKey(l.telefone)))
    .map((l) => ({ key: phoneKey(l.telefone), telefone: l.telefone, nome: l.nome, motivo: "bloqueado" as const }));
  try {
    const r = await appendLeads(permitidos);
    return Response.json({ ...r, ignorados: [...r.ignorados, ...barrados] });
  } catch (e) {
    return handleError(e);
  }
}
