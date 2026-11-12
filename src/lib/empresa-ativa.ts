import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { getConfig } from "./env";
import { COOKIE_EMPRESA, crmNoRadar, empresaDoCrm, LAVACAR, lavacarNoRadar, type Empresa } from "./empresas";
import { lerSessao, sessaoDaEquipe, SESSION_COOKIE, type Pessoa } from "./session";
import { empresasLista } from "./voob/banco";

/**
 * O Radar desta pessoa (13/11/2026, white label): quem é, se é da equipe da Voob, as empresas que ela vê (o Lavacar só
 * para a equipe; as do Voob CRM pelo banco) e a escolhida no seletor (cookie). Uma vez por pedido (cache do React).
 */
export interface ContextoRadar {
  pessoa: Pessoa | null;
  equipe: boolean;
  empresas: Empresa[];
  ativa: Empresa | null;
  /** O Voob CRM não respondeu: a lista mostra só o que deu (o Lavacar). */
  erroCrm: string | null;
}

export const contextoDoRadar = cache(async (): Promise<ContextoRadar> => {
  const jar = await cookies();
  const sessao = lerSessao(jar.get(SESSION_COOKIE)?.value);
  const equipe = sessaoDaEquipe(sessao);
  const env = process.env.RADAR_EMPRESAS;
  const cfg = getConfig();
  const empresas: Empresa[] = [];
  if (equipe && lavacarNoRadar(env)) empresas.push(LAVACAR);
  let erroCrm: string | null = null;
  if (sessao.ok && crmNoRadar(env) && (cfg.mock || cfg.voobCrmDbUrl)) {
    try {
      empresas.push(...(await empresasLista(sessao.pessoa?.id ?? null, equipe)).map(empresaDoCrm));
    } catch (e) {
      erroCrm = e instanceof Error ? e.message : "O Voob CRM não respondeu.";
    }
  }
  const pedida = jar.get(COOKIE_EMPRESA)?.value;
  const ativa = empresas.find((e) => e.id === pedida) ?? empresas[0] ?? null;
  return { pessoa: sessao.pessoa, equipe, empresas, ativa, erroCrm };
});

/** As empresas deste Radar para a pessoa. */
export async function disponiveis(): Promise<Empresa[]> {
  return (await contextoDoRadar()).empresas;
}

/** A empresa escolhida no seletor (cookie), ou a primeira que a pessoa vê. Sem nenhuma: o Lavacar (só para as cores). */
export async function empresaAtiva(): Promise<Empresa> {
  return (await contextoDoRadar()).ativa ?? LAVACAR;
}
