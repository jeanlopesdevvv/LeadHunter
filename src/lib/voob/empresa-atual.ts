import "server-only";

import { cookies } from "next/headers";

import { COOKIE_EMPRESA, idValido, motorDoId, type ResumoEmpresaCrm } from "@/lib/empresas";
import { lerSessao, sessaoDaEquipe, SESSION_COOKIE } from "@/lib/session";

import { empresasLista, empresaVer, VoobError } from "./banco";

/**
 * A empresa do Voob CRM em que a pessoa está (13/11/2026, white label). Toda rota /api/voob passa por aqui antes de
 * chamar o banco: confere no banco se a pessoa vê a empresa escolhida no seletor (o cliente só vê as dele).
 */
export interface EmpresaAtual extends ResumoEmpresaCrm {
  /** Quem está usando: id da conta do Voob CRM (null = senha da equipe). */
  usuario: string | null;
  equipe: boolean;
}

export async function quemUsa(): Promise<{ usuario: string | null; equipe: boolean; nome: string }> {
  const jar = await cookies();
  const s = lerSessao(jar.get(SESSION_COOKIE)?.value);
  if (!s.ok) throw new VoobError("Sessão expirada. Entre novamente.", 401);
  return { usuario: s.pessoa?.id ?? null, equipe: sessaoDaEquipe(s), nome: s.pessoa?.nome ?? "Radar" };
}

export async function empresaAtual(): Promise<EmpresaAtual> {
  const jar = await cookies();
  const { usuario, equipe } = await quemUsa();
  const pedida = jar.get(COOKIE_EMPRESA)?.value;
  if (idValido(pedida) && motorDoId(pedida) === "voob-crm") {
    const r = await empresaVer(pedida, usuario, equipe);
    if (r) return { ...r, usuario, equipe };
    throw new VoobError("Você não tem acesso a esta empresa. Escolha outra no menu.", 403);
  }
  const [primeira] = await empresasLista(usuario, equipe);
  if (!primeira) throw new VoobError("Nenhuma empresa do Radar ligada à sua conta ainda. Fale com a Voob.", 404);
  return { ...primeira, usuario, equipe };
}

/** Só a equipe da Voob (criar empresa, ver as contas do CRM). */
export async function exigirEquipe(): Promise<{ usuario: string | null; nome: string }> {
  const q = await quemUsa();
  if (!q.equipe) throw new VoobError("Só a equipe da Voob pode fazer isso.", 403);
  return q;
}
