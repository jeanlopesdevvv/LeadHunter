import "server-only";

import { crmNoRadar } from "@/lib/empresas";
import { getConfig } from "@/lib/env";
import { searchPage } from "@/lib/places";
import { obterUso, reservarConsulta } from "@/lib/usage";

import * as banco from "./banco";
import {
  consultasPermitidas,
  executarBuscaVoob,
  MOTIVO_FIM_VOOB,
  quantoPrecisa,
  unidadesDaBusca,
  type MotivoFimVoob,
  type ResultadoBuscaVoob,
} from "./busca-auto-regras";
import { buscaSimulada } from "./mock";
import { examinarVarios } from "./raio-x";
import type { EstadoBuscaAuto } from "./tipos";

/**
 * Busca automática da Voob (12/11/2026). Começa pelo mesmo fluxo do n8n do Lavacar ("Radar - Busca automática de leads",
 * de segunda a sexta às 8h41 e às 13h41, pulando feriado), que chama /api/n8n/busca-auto, e pelo botão "Buscar agora"
 * da tela Disparo da Voob. Roda em segundo plano: quem chama recebe na hora se começou; o resultado fica no Voob CRM
 * (radar.busca_rodadas) e a tela mostra.
 */

type Rodando = { desde: number; promessa: Promise<ResultadoBuscaVoob | null> };
/** Uma busca por vez em cada empresa (13/11/2026: várias empresas). */
const g = globalThis as unknown as { __radarBuscaVoobPor?: Map<string, Rodando> };
const rodandoAgora = () => (g.__radarBuscaVoobPor ??= new Map());

export interface InicioBuscaVoob {
  iniciada: boolean;
  motivo: MotivoFimVoob | "";
  texto: string;
  precisava: number;
  podeGastar: number;
}

const nao = (motivo: MotivoFimVoob | "", texto: string, precisava = 0, podeGastar = 0): InicioBuscaVoob => ({ iniciada: false, motivo, texto, precisava, podeGastar });

export async function iniciarBuscaVoob(empresa: string, origem: "rotina" | "manual", quem = "Radar"): Promise<InicioBuscaVoob> {
  const cfg = getConfig();
  if (!crmNoRadar(process.env.RADAR_EMPRESAS)) return nao("", "as empresas do Voob CRM não estão neste Radar");
  if (!cfg.mock && !cfg.voobCrmDbUrl) return nao("", "o Radar ainda não fala com o Voob CRM");
  if (!cfg.mock && !cfg.placesApiKey) return nao("erro", "A chave do Google Maps não está configurada (GOOGLE_MAPS_API_KEY).");
  const atual = rodandoAgora().get(empresa);
  if (atual && Date.now() - atual.desde < 20 * 60_000) return nao("rodando", MOTIVO_FIM_VOOB.rodando);
  const estado = await banco.buscaAutoEstado(empresa);
  if (origem === "rotina") {
    if (!estado.config.ligado) return nao("desligada", MOTIVO_FIM_VOOB.desligada);
    if (!estado.dia_de_disparo) return nao("nao_e_dia", MOTIVO_FIM_VOOB.nao_e_dia);
  }
  if (estado.rodando) return nao("rodando", MOTIVO_FIM_VOOB.rodando);
  if (!unidadesDaBusca(estado.perfil).length) return nao("esgotado", "falta escolher quem procurar (Começar, passo 1)");
  // "Buscar agora" pela tela: busca pelo menos 1 dia de disparo, mesmo com a base cheia.
  const precisa = origem === "manual" ? Math.max(quantoPrecisa(estado), estado.limite || 20) : quantoPrecisa(estado);
  if (precisa <= 0) return nao("base_cheia", MOTIVO_FIM_VOOB.base_cheia);
  const uso = await obterUso();
  const daEmpresa = await banco.cota(empresa).catch(() => null);
  const podeGastar = Math.min(consultasPermitidas(estado, uso.restantes), daEmpresa?.restantes ?? Infinity);
  if (podeGastar <= 0) {
    const motivo: MotivoFimVoob = estado.consultas_hoje >= estado.config.max_consultas_dia ? "limite" : "cota";
    if (daEmpresa?.restantes === 0) return nao("cota", `as ${daEmpresa.limite} buscas do mês desta empresa acabaram`, precisa);
    return nao(motivo, MOTIVO_FIM_VOOB[motivo], precisa);
  }
  const rodada = await banco.buscaAutoIniciar(empresa, origem, quem, precisa, podeGastar);
  if (rodada === null) return nao("rodando", MOTIVO_FIM_VOOB.rodando, precisa, podeGastar);

  const promessa = rodar(empresa, rodada, estado, precisa, podeGastar, quem).finally(() => {
    if (rodandoAgora().get(empresa)?.promessa === promessa) rodandoAgora().delete(empresa);
  });
  rodandoAgora().set(empresa, { desde: Date.now(), promessa });
  return { iniciada: true, motivo: "", texto: `buscando até ${precisa} empresas novas (no máximo ${podeGastar} consultas)`, precisava: precisa, podeGastar };
}

async function rodar(empresa: string, rodada: number, estado: EstadoBuscaAuto, precisa: number, podeGastar: number, quem: string): Promise<ResultadoBuscaVoob | null> {
  const cfg = getConfig();
  try {
    const r = await executarBuscaVoob(estado, precisa, podeGastar, {
      pagina: (p) => (cfg.mock ? buscaSimulada(p) : searchPage(p, cfg.placesApiKey)),
      reservar: async () => {
        const res = await reservarConsulta();
        if (!res.ok) return { ok: false, concluir: () => undefined };
        // 19/11/2026: cada consulta feita conta também na cota da empresa.
        return {
          ok: true,
          concluir: (feita: boolean) => {
            res.concluir(feita);
            if (feita) void banco.cotaRegistrar(empresa, 1);
          },
        };
      },
      raioX: async (urls) => {
        const saida = [];
        for (let i = 0; i < urls.length; i += 10) saida.push(...(await examinarVarios(urls.slice(i, i + 10))));
        return saida;
      },
      conferir: (telefones) => banco.conferir(empresa, telefones),
      gravar: async (entradas) => {
        let novos = 0;
        for (let i = 0; i < entradas.length; i += 200) novos += (await banco.inserir(empresa, entradas.slice(i, i + 200), quem)).contagem.novo ?? 0;
        return novos;
      },
      feita: (u, x) => banco.buscaAutoFeita(rodada, u, x),
    });
    await banco.buscaAutoTerminar(rodada, {
      consultas: r.consultas, vistos: r.vistos, novos: r.novos, adicionados: r.adicionados, motivo: r.motivo,
      texto: MOTIVO_FIM_VOOB[r.motivo], erro: r.erro ?? null, lugares: r.lugares, descartes: r.descartes,
    });
    console.log(`[radar-voob] busca automática (${empresa}): ${r.adicionados} empresas novas em ${r.consultas} consultas (${r.motivo})`);
    return r;
  } catch (e) {
    console.error("[radar-voob] busca automática falhou:", (e as Error).message);
    await banco
      .buscaAutoTerminar(rodada, { consultas: 0, vistos: 0, novos: 0, adicionados: 0, motivo: "erro", erro: (e as Error).message.slice(0, 300) })
      .catch(() => undefined);
    return null;
  }
}

/** O que a tela mostra antes de buscar: quanto a base precisa e quanto dá para gastar agora. */
export async function resumoBuscaVoob(empresa: string): Promise<{ estado: EstadoBuscaAuto; precisa: number; podeGastar: number; cotaRestante: number | null; cotaLimite: number }> {
  const estado = await banco.buscaAutoEstado(empresa);
  const uso = await obterUso();
  const daEmpresa = await banco.cota(empresa).catch(() => null);
  const podeGastar = Math.min(consultasPermitidas(estado, uso.restantes), daEmpresa?.restantes ?? Infinity);
  // Empresa com cota própria: a tela mostra a cota dela (a comum do Google é assunto da equipe).
  if (daEmpresa?.limite != null) return { estado, precisa: quantoPrecisa(estado), podeGastar, cotaRestante: daEmpresa.restantes, cotaLimite: daEmpresa.limite };
  return { estado, precisa: quantoPrecisa(estado), podeGastar, cotaRestante: uso.restantes, cotaLimite: uso.limite };
}

/**
 * O fluxo do n8n (8h41 e 13h41): busca para todas as empresas com a busca automática ligada, uma depois da outra (a cota
 * grátis do Google é uma só e cada busca respeita o que sobrou). Começa em segundo plano; a resposta diz quem vai buscar.
 */
export async function iniciarBuscasDeTodas(origem: "rotina" | "manual"): Promise<{ empresas: string[]; texto: string }> {
  const cfg = getConfig();
  if (!crmNoRadar(process.env.RADAR_EMPRESAS)) return { empresas: [], texto: "as empresas do Voob CRM não estão neste Radar" };
  if (!cfg.mock && !cfg.voobCrmDbUrl) return { empresas: [], texto: "o Radar ainda não fala com o Voob CRM" };
  const empresas = await banco.buscaAutoEmpresas();
  if (!empresas.length) return { empresas, texto: "nenhuma empresa com a busca automática ligada" };
  void (async () => {
    for (const id of empresas) {
      try {
        const r = await iniciarBuscaVoob(id, origem);
        if (r.iniciada) await rodandoAgora().get(id)?.promessa;
        else console.log(`[radar-voob] busca automática (${id}): ${r.texto}`);
      } catch (e) {
        console.error(`[radar-voob] busca automática (${id}) não começou:`, (e as Error).message);
      }
    }
  })();
  return { empresas, texto: `buscando para ${empresas.length === 1 ? "1 empresa" : `${empresas.length} empresas`}, uma depois da outra` };
}
