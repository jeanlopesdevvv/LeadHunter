import { readJson } from "@/lib/http";
import { inserir, lista } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";
import { ORDEM_STATUS } from "@/lib/voob/regras";
import type { EntradaBase, SituacaoSite, StatusLead } from "@/lib/voob/tipos";

export const maxDuration = 60;

const STATUS = new Set<string>(ORDEM_STATUS);
const SITUACOES = new Set<SituacaoSite>(["sem_site", "rede_social", "desatualizado", "com_site", "nao_conferido"]);

/** A base. `?status=novo,na_fila&busca=texto&limite=200`. */
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const status = (p.get("status") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => STATUS.has(s)) as StatusLead[];
  const busca = (p.get("busca") ?? "").trim().slice(0, 60);
  const limite = Math.min(500, Math.max(1, Number.parseInt(p.get("limite") ?? "300", 10) || 300));
  try {
    const emp = await empresaAtual();
    return Response.json(await lista(emp.id, { status: status.length ? status : undefined, busca: busca || undefined, limite }));
  } catch (e) {
    return erroVoob(e);
  }
}

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Põe empresas achadas no Google na base. Corpo: { leads: EntradaBase[] } (até 500). Quem já é contato da empresa não entra. */
export async function POST(request: Request) {
  const body = await readJson<{ leads?: unknown }>(request);
  if (!Array.isArray(body?.leads) || !body.leads.length) return Response.json({ erro: "Nenhuma empresa para pôr na base." }, { status: 400 });
  if (body.leads.length > 500) return Response.json({ erro: "Mande no máximo 500 de cada vez." }, { status: 400 });
  const leads: EntradaBase[] = [];
  for (const x of body.leads as Record<string, unknown>[]) {
    const telefone = texto(x?.telefone, 30);
    const negocio = texto(x?.negocio, 160);
    if (!telefone || !negocio) continue;
    const sit = x.site_situacao as SituacaoSite;
    leads.push({
      telefone,
      negocio,
      categoria: texto(x.categoria, 80),
      termo: texto(x.termo, 80),
      cidade: texto(x.cidade, 80),
      uf: texto(x.uf, 4),
      bairro: texto(x.bairro, 80),
      endereco: texto(x.endereco, 200),
      site_url: texto(x.site_url, 300),
      site_situacao: SITUACOES.has(sit) ? sit : "nao_conferido",
      site_problemas: Array.isArray(x.site_problemas)
        ? (x.site_problemas as unknown[]).filter((p): p is string => typeof p === "string" && p.trim().length > 0).slice(0, 6).map((p) => p.trim().slice(0, 100))
        : undefined,
      nota: numero(x.nota),
      avaliacoes: numero(x.avaliacoes),
      place_id: texto(x.place_id, 300),
      maps_url: texto(x.maps_url, 300),
    });
  }
  if (!leads.length) return Response.json({ erro: "Nenhuma empresa com telefone e nome." }, { status: 400 });
  try {
    const emp = await empresaAtual();
    return Response.json(await inserir(emp.id, leads, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
