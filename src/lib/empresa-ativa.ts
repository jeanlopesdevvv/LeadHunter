import "server-only";

import { cookies } from "next/headers";

import { COOKIE_EMPRESA, empresasDisponiveis, escolherEmpresa, idsDisponiveis, type Empresa } from "./empresas";

/** Empresas deste Radar (variável RADAR_EMPRESAS; sem ela, todas). */
export function disponiveis(): Empresa[] {
  return empresasDisponiveis(process.env.RADAR_EMPRESAS);
}

/** A empresa escolhida no seletor (cookie), ou a primeira disponível. */
export async function empresaAtiva(): Promise<Empresa> {
  const jar = await cookies();
  return escolherEmpresa(jar.get(COOKIE_EMPRESA)?.value, idsDisponiveis(process.env.RADAR_EMPRESAS));
}
