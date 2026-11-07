import "server-only";

import * as banco from "./banco";
import { telefonesBloqueados } from "./bloqueio";
import {
  comoEstadoBusca,
  consultasPermitidas,
  executarBuscaAuto,
  MOTIVO_FIM_TEXTO,
  quantoPrecisa,
  type MotivoFimBusca,
  type ResultadoBuscaAuto,
} from "./busca-auto-regras";
import { getConfig } from "./env";
import { mockResolveCityArea, mockSearchPage } from "./mock";
import { resolveCityArea, searchPage } from "./places";
import { existingKeysCached, appendLeads } from "./sheets";
import type { Lead } from "./types";
import { obterUso, registrarConsulta, reservarConsulta } from "./usage";

/**
 * Busca automática de leads (07/11/2026). Chamada pelo n8n nos dias de disparo ("Radar - Busca automática de leads",
 * de segunda a sexta antes da 1ª rodada) e pelo botão "Buscar agora" da tela Disparo automático.
 * Roda em segundo plano: quem chama recebe na hora se começou e quanto precisava; o resultado fica em
 * atendimento.busca_auto_log (a tela mostra).
 */

const g = globalThis as unknown as { __radarBuscaAuto?: { desde: number; promessa: Promise<ResultadoBuscaAuto | null> } | null };

export interface InicioBuscaAuto {
  iniciada: boolean;
  motivo: MotivoFimBusca | "";
  texto: string;
  precisava: number;
  podeGastar: number;
}

export async function iniciarBuscaAuto(origem: "rotina" | "manual"): Promise<InicioBuscaAuto> {
  const cfg = getConfig();
  if (cfg.mock) return { iniciada: false, motivo: "", texto: "na simulação a busca automática não roda", precisava: 0, podeGastar: 0 };
  if (!cfg.placesApiKey) {
    return { iniciada: false, motivo: "erro", texto: "A chave do Google Maps não está configurada (GOOGLE_MAPS_API_KEY).", precisava: 0, podeGastar: 0 };
  }
  const atual = g.__radarBuscaAuto;
  if (atual && Date.now() - atual.desde < 20 * 60_000) {
    return { iniciada: false, motivo: "rodando", texto: MOTIVO_FIM_TEXTO.rodando, precisava: 0, podeGastar: 0 };
  }
  const estado = comoEstadoBusca(await banco.buscaAutoEstado());
  if (!estado.config.ligado && origem === "rotina") {
    return { iniciada: false, motivo: "desligada", texto: MOTIVO_FIM_TEXTO.desligada, precisava: 0, podeGastar: 0 };
  }
  if (estado.rodando) return { iniciada: false, motivo: "rodando", texto: MOTIVO_FIM_TEXTO.rodando, precisava: 0, podeGastar: 0 };
  // "Buscar agora" pela tela: busca pelo menos 1 dia de disparo, mesmo com a fila cheia.
  const precisa = origem === "manual" ? Math.max(quantoPrecisa(estado), estado.limite || 50) : quantoPrecisa(estado);
  if (precisa <= 0) return { iniciada: false, motivo: "fila_cheia", texto: MOTIVO_FIM_TEXTO.fila_cheia, precisava: 0, podeGastar: 0 };
  const uso = await obterUso();
  const podeGastar = consultasPermitidas(estado, uso.restantes);
  if (podeGastar <= 0) {
    const motivo: MotivoFimBusca = estado.consultasHoje >= estado.config.maxConsultasDia ? "limite" : "cota";
    return { iniciada: false, motivo, texto: MOTIVO_FIM_TEXTO[motivo], precisava: precisa, podeGastar: 0 };
  }
  const log = await banco.buscaAutoIniciar(origem, precisa);
  if (log === null) return { iniciada: false, motivo: "rodando", texto: MOTIVO_FIM_TEXTO.rodando, precisava: precisa, podeGastar };

  const promessa = rodar(log, estado, precisa, podeGastar).finally(() => {
    if (g.__radarBuscaAuto?.promessa === promessa) g.__radarBuscaAuto = null;
  });
  g.__radarBuscaAuto = { desde: Date.now(), promessa };
  return { iniciada: true, motivo: "", texto: `buscando até ${precisa} leads novos (no máximo ${podeGastar} consultas)`, precisava: precisa, podeGastar };
}

async function rodar(log: number, estado: ReturnType<typeof comoEstadoBusca>, precisa: number, podeGastar: number): Promise<ResultadoBuscaAuto | null> {
  const cfg = getConfig();
  const bloqueados = telefonesBloqueados();
  try {
    const r = await executarBuscaAuto(estado, precisa, podeGastar, {
      area: async (cidade) => {
        const a = cfg.mock ? await mockResolveCityArea(cidade) : await resolveCityArea(cidade, cfg.placesApiKey, () => registrarConsulta("area"));
        return a.viewport;
      },
      pagina: (p) => (cfg.mock ? mockSearchPage(p) : searchPage(p, cfg.placesApiKey)),
      reservar: async () => {
        const res = await reservarConsulta();
        return res.ok ? { ok: true, concluir: res.concluir } : { ok: false, concluir: () => undefined };
      },
      existentes: async () => {
        const { keys, optout } = await existingKeysCached(0);
        const todos = new Set<string>([...keys, ...optout]);
        for (const k of bloqueados) todos.add(k);
        return todos;
      },
      gravar: async (leads: Lead[]) => {
        const res = await appendLeads(
          leads.map((l) => ({
            telefone: l.telefone, nome: l.nome, tipo: l.tipo, cidade: l.cidade, endereco: l.endereco, bairro: l.bairro, uf: l.uf,
            site: l.site, mapsUrl: l.mapsUrl, nota: l.nota, avaliacoes: l.avaliacoes, categoria: l.categoria, placeId: l.id, termo: l.termo,
          })),
        );
        return res.adicionados.length;
      },
      feita: (u, x) => banco.buscaAutoFeita(log, u.termo, u.cidade, u.area, x.consultas, x.vistos, x.novos, x.cheia),
    });
    await banco.buscaAutoTerminar(log, r, { cidades: r.cidades, descartes: r.descartes, erro: r.erro ?? null, texto: MOTIVO_FIM_TEXTO[r.motivo] });
    console.log(`[radar] busca automática: ${r.adicionados} leads novos em ${r.consultas} consultas (${r.motivo})`);
    return r;
  } catch (e) {
    console.error("[radar] busca automática falhou:", (e as Error).message);
    await banco.buscaAutoTerminar(log, { consultas: 0, vistos: 0, novos: 0, adicionados: 0, motivo: "erro" }, { erro: (e as Error).message.slice(0, 300) }).catch(() => undefined);
    return null;
  }
}
