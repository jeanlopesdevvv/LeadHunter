import { getConfig } from "@/lib/env";
import { readJson } from "@/lib/http";
import { config, definir, modeloArquivar, modeloRenomear } from "@/lib/voob/banco";
import { tokenDoCrm } from "@/lib/voob/crm-sessao";
import { funcaoDoCrm } from "@/lib/voob/crm-funcoes";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { escreverSimulado, modeloSalvarSimulado } from "@/lib/voob/mock";
import { quemFez } from "@/lib/voob/pessoas";
import type { ModeloConta } from "@/lib/voob/tipos";

export const maxDuration = 60;

/**
 * Modelos (templates) do número da empresa (13/11/2026, white label). A lista vem da cópia do Voob CRM; quem entrou com
 * a conta do CRM atualiza pela Meta, cria e edita (as funções do próprio CRM, com o login da pessoa). Renomear (só o
 * nome que aparece), arquivar e escolher a mensagem do Radar passam pelo banco do Radar.
 */
export async function GET() {
  try {
    const emp = await empresaAtual();
    let cfg = await config(emp.id);
    const token = getConfig().mock ? "simulado" : await tokenDoCrm();
    let podeCriar = false;
    let aviso: string | null = null;
    if (token && cfg.numero && cfg.empresa.site_id && !getConfig().mock) {
      try {
        const r = await funcaoDoCrm<{ pode_criar?: boolean; atualizado?: boolean; aviso_meta?: string | null }>("whatsapp-modelos", { acao: "listar", site_id: cfg.empresa.site_id });
        podeCriar = r.pode_criar === true;
        if (r.atualizado === false) aviso = r.aviso_meta ?? "A Meta não respondeu agora: a lista pode estar desatualizada.";
        cfg = await config(emp.id);
      } catch (e) {
        aviso = e instanceof Error ? e.message : "Não deu para atualizar pela Meta agora.";
      }
    } else if (getConfig().mock) podeCriar = Boolean(cfg.numero);
    return Response.json({
      modelos: cfg.modelos_conta ?? [],
      escolhidos: cfg.modelos,
      prefixos: { abertura: cfg.empresa.modelo_prefixo, site: cfg.empresa.modelo_prefixo_site ?? null, retomada: cfg.empresa.retomada_prefixo },
      numero: Boolean(cfg.numero),
      podeCriar,
      comConta: Boolean(token),
      empresa: cfg.empresa.nome,
      aviso,
    });
  } catch (e) {
    return erroVoob(e);
  }
}

type Acao = "criar" | "editar" | "escrever_ia" | "renomear" | "arquivar" | "usar";
const ACOES = new Set<Acao>(["criar", "editar", "escrever_ia", "renomear", "arquivar", "usar"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(request: Request) {
  const b = await readJson<Record<string, unknown>>(request);
  const acao = b?.acao as Acao;
  if (!b || !ACOES.has(acao)) return Response.json({ erro: "Ação desconhecida." }, { status: 400 });
  const mock = getConfig().mock;
  try {
    const emp = await empresaAtual();
    const cfg = await config(emp.id);
    const site = cfg.empresa.site_id;
    if (acao === "escrever_ia") {
      const pedido = texto(b.pedido, 600).trim();
      if (pedido.length < 5) return Response.json({ erro: "Conte em poucas palavras o que a mensagem deve dizer." }, { status: 400 });
      if (mock) return Response.json(escreverSimulado(pedido, cfg.empresa.nome));
      if (!site || !cfg.numero) return Response.json({ erro: "Escolha o número da empresa antes." }, { status: 409 });
      return Response.json(await funcaoDoCrm("whatsapp-modelos", { acao: "escrever_ia", site_id: site, pedido, categoria: b.categoria === "UTILITY" ? "UTILITY" : "MARKETING", empresa: cfg.empresa.nome }));
    }
    if (acao === "criar" || acao === "editar") {
      const titulo = texto(b.titulo, 60).trim();
      const corpo = texto(b.texto, 1100);
      const botoes = Array.isArray(b.botoes) ? (b.botoes as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3).map((x) => x.trim().slice(0, 25)) : [];
      if (titulo.length < 2 || corpo.trim().length < 10) return Response.json({ erro: "Escreva o nome e o texto do modelo." }, { status: 400 });
      if (acao === "editar" && (typeof b.modelo_id !== "string" || !UUID.test(b.modelo_id))) return Response.json({ erro: "Modelo inválido." }, { status: 400 });
      const categoria = b.categoria === "UTILITY" ? "UTILITY" : "MARKETING";
      if (mock) return Response.json({ modelo: modeloSalvarSimulado(emp.id, { modelo_id: acao === "editar" ? String(b.modelo_id) : undefined, titulo, categoria, texto: corpo, botoes }) });
      if (!site || !cfg.numero) return Response.json({ erro: "Escolha o número da empresa antes." }, { status: 409 });
      const exemplos = b.exemplos && typeof b.exemplos === "object" && !Array.isArray(b.exemplos) ? b.exemplos : undefined;
      return Response.json(
        await funcaoDoCrm("whatsapp-modelos", {
          acao, site_id: site, titulo, categoria, texto: corpo, botoes, exemplos, empresa: cfg.empresa.nome,
          ...(acao === "editar" ? { modelo_id: b.modelo_id } : {}),
        }),
      );
    }
    if (typeof b.modelo_id !== "string" || !UUID.test(b.modelo_id)) return Response.json({ erro: "Modelo inválido." }, { status: 400 });
    if (acao === "renomear") return Response.json({ modelos: await modeloRenomear(emp.id, b.modelo_id, texto(b.titulo, 80), await quemFez()) });
    if (acao === "arquivar") return Response.json({ modelos: await modeloArquivar(emp.id, b.modelo_id, b.arquivar !== false, await quemFez()) });
    // usar: a 1ª mensagem do Radar (e, se for o caso, a de site desatualizado), ou a retomada.
    const m = (cfg.modelos_conta ?? []).find((x: ModeloConta) => x.id === b.modelo_id);
    if (!m) return Response.json({ erro: "Modelo não encontrado neste número." }, { status: 404 });
    const para = b.para === "retomada" ? "retomada" : b.para === "site" ? "site" : "abertura";
    const mudancas: Record<string, unknown> =
      para === "retomada" ? { retomada_prefixo: m.nome } : para === "site" ? { modelo_prefixo_site: m.nome } : { modelo_prefixo: m.nome };
    if (para === "abertura") {
      // Sem um modelo próprio para site desatualizado, o mesmo serve para todos.
      if (b.tambem_site !== false) mudancas.modelo_prefixo_site = m.nome;
      if (m.botoes[0]) mudancas.botao_sim = m.botoes[0];
      if (m.botoes[1]) mudancas.botao_nao = m.botoes[1];
    }
    return Response.json(await definir(emp.id, mudancas, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
