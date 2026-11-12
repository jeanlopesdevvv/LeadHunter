import { readJson } from "@/lib/http";
import { teste } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { quemFez } from "@/lib/voob/pessoas";

export const maxDuration = 30;

/**
 * Teste no próprio número (13/11/2026). Corpo: { ligar: true, telefone } liga o modo teste do número (só esse celular
 * recebe), põe o celular na base e liga o Radar; { ligar: false } encerra (a lista do número volta a ser a de antes).
 */
export async function POST(request: Request) {
  const b = await readJson<{ ligar?: unknown; telefone?: unknown }>(request);
  if (typeof b?.ligar !== "boolean") return Response.json({ erro: "Diga se é para ligar ou encerrar o teste." }, { status: 400 });
  const telefone = typeof b.telefone === "string" ? b.telefone.trim().slice(0, 30) : "";
  if (b.ligar && telefone.replace(/\D/g, "").length < 10) return Response.json({ erro: "Escreva o celular com DDD." }, { status: 400 });
  try {
    const emp = await empresaAtual();
    return Response.json(await teste(emp.id, b.ligar ? telefone : null, b.ligar, await quemFez()));
  } catch (e) {
    return erroVoob(e);
  }
}
