import { getConfig } from "@/lib/env";
import { readJson } from "@/lib/http";
import { config, definir } from "@/lib/voob/banco";
import { funcaoDoCrm } from "@/lib/voob/crm-funcoes";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { conectarSimulado } from "@/lib/voob/mock";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 60;

/**
 * Conectar o WhatsApp oficial da empresa pelo Radar (13/11/2026, white label): a mesma janela da Meta do Voob CRM
 * (Tech Provider), com o login de quem está usando. A Meta só abre a janela nos endereços liberados no app da Voob
 * (META_JANELA_HOSTS); fora deles, o Radar manda conectar pelo Voob CRM e depois escolher o número aqui.
 *   { acao: "config" }  → { pode, app_id, config_id } ou { pode: false, motivo, crm }
 *   { acao: "conectar", code, waba_id?, phone_number_id?, business_id?, opcao: "celular" | "novo", pagina }
 *     → liga o número no Voob CRM e já escolhe ele para esta empresa (se o Radar estiver desligado).
 */
export async function POST(request: Request) {
  const b = await readJson<Record<string, unknown>>(request);
  const acao = b?.acao;
  const cfgApp = getConfig();
  try {
    const emp = await empresaAtual();
    const cfg = await config(emp.id);
    const site = cfg.empresa.site_id;
    if (!site) return Response.json({ erro: "Esta empresa ainda não tem conta no Voob CRM." }, { status: 409 });
    const crm = cfgApp.voobCrmSite;
    if (acao === "config") {
      if (cfgApp.mock) return Response.json({ pode: false, motivo: "simulacao", crm, simulacao: true });
      const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0].toLowerCase();
      if (!cfgApp.metaJanelaHosts.includes(host)) return Response.json({ pode: false, motivo: "endereco", crm });
      const r = await funcaoDoCrm<{ pode?: boolean; app_id?: string; config_id?: string; motivo?: string }>("whatsapp-oficial", { acao: "config", site_id: site });
      return Response.json({ pode: r.pode === true, app_id: r.app_id ?? null, config_id: r.config_id ?? null, motivo: r.motivo ?? null, crm });
    }
    if (acao === "simular" && cfgApp.mock) {
      const r = conectarSimulado(emp.id);
      return Response.json(cfg.empresa.ligado ? await config(emp.id) : await definir(emp.id, { canal_id: r.canal.id }, await quemFez()));
    }
    if (acao !== "conectar") return Response.json({ erro: "Ação desconhecida." }, { status: 400 });
    if (typeof b?.code !== "string" || !b.code) return Response.json({ erro: "A janela da Meta não devolveu o código. Tente de novo." }, { status: 400 });
    const id = (v: unknown) => (typeof v === "string" && /^\d{5,30}$/.test(v) ? v : null);
    const r = await funcaoDoCrm<{ canal?: { id?: string } }>("whatsapp-oficial", {
      acao: "conectar", site_id: site, code: b.code, evento: typeof b.evento === "string" ? b.evento.slice(0, 60) : null,
      waba_id: id(b.waba_id), phone_number_id: id(b.phone_number_id), business_id: id(b.business_id),
      opcao: b.opcao === "celular" ? "celular" : "novo", pagina: typeof b.pagina === "string" ? b.pagina.slice(0, 300) : null,
    });
    const canal = r.canal?.id;
    if (!canal || cfg.empresa.ligado || cfg.empresa.teste) return Response.json(await config(emp.id));
    return Response.json(await definir(emp.id, { canal_id: canal }, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
