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

export async function POST(request: Request) {
  const body = await readJson<{ leads?: unknown }>(request);
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
