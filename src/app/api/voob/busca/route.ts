import { getConfig } from "@/lib/env";
import { handleError, isString, jsonError, readJson } from "@/lib/http";
import { searchPage } from "@/lib/places";
import { obterUso, reservarConsulta } from "@/lib/usage";
import { conferir, cota, cotaRegistrar, VoobError } from "@/lib/voob/banco";
import { empresaAtual } from "@/lib/voob/empresa-atual";
import { erroVoob } from "@/lib/voob/http";
import { buscaSimulada } from "@/lib/voob/mock";
import { resultadoDaBusca } from "@/lib/voob/regras";
import type { ResultadoBusca } from "@/lib/voob/tipos";

export const maxDuration = 60;

/**
 * Uma página da busca da Voob no Google (até 20 empresas). Corpo: { termo, lugar, pageToken? }.
 * Gasta 1 consulta das grátis do mês (a mesma cota do Lavacar) e, desde 19/11/2026, 1 busca da cota da empresa
 * (300 por mês para cliente; a equipe aumenta). Cada celular volta conferido no Voob CRM:
 * já está na base? já é lead, cliente ou já conversou com a empresa?
 */
export async function POST(request: Request) {
  const cfg = getConfig();
  if (!cfg.mock && !cfg.placesApiKey) return jsonError("A chave do Google Maps ainda não foi configurada (GOOGLE_MAPS_API_KEY).", 503);
  const body = await readJson<{ termo?: unknown; lugar?: unknown; pageToken?: unknown }>(request);
  if (!body || !isString(body.termo) || body.termo.trim().length < 3 || !isString(body.lugar) || !body.lugar.trim()) {
    return jsonError("Pedido de busca inválido.");
  }
  const termo = body.termo.trim().slice(0, 60);
  const lugar = body.lugar.trim().slice(0, 100);
  const input = { textQuery: `${termo} em ${lugar}`, termo, cidade: lugar, pageToken: isString(body.pageToken) ? body.pageToken : null };

  // Quem não vê a empresa não gasta consulta do Google.
  let emp: Awaited<ReturnType<typeof empresaAtual>>;
  try {
    emp = await empresaAtual();
  } catch (e) {
    return erroVoob(e);
  }
  // A cota da empresa (banco sem a migração de 19/11: null, vale só a cota comum).
  let daEmpresa = await cota(emp.id).catch(() => null);
  if (daEmpresa?.restantes === 0) {
    const renova = new Date(`${daEmpresa.renova}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "numeric" });
    return Response.json(
      { erro: `As ${daEmpresa.limite} buscas deste mês acabaram. Renovam em ${renova}. Para buscar mais agora, fale com a Voob.`, cota: true, cotaEmpresa: daEmpresa },
      { status: 429 },
    );
  }
  const reserva = await reservarConsulta();
  if (!reserva.ok) {
    // A cota comum do Google é assunto da equipe; o cliente vê só que hoje não deu.
    const erro = emp.equipe ? reserva.mensagem : "A busca no Google está pausada por hoje. Tente amanhã ou fale com a Voob.";
    return Response.json({ erro, cota: true, uso: emp.equipe ? reserva.uso : undefined }, { status: 429 });
  }
  let pagina;
  try {
    pagina = cfg.mock ? await buscaSimulada(input) : await searchPage(input, cfg.placesApiKey);
    reserva.concluir(true);
    const contada = await cotaRegistrar(emp.id, 1);
    if (contada) daEmpresa = contada;
  } catch (e) {
    reserva.concluir(false);
    return handleError(e);
  }

  const abertos = pagina.leads.filter((l) => l.situacaoNegocio === "OPERATIONAL");
  const celulares = [...new Set(abertos.filter((l) => l.telefoneTipo === "celular").map((l) => l.telefone))];
  let conferidos = new Map<string, ResultadoBusca["situacao"]>();
  let aviso = "";
  try {
    conferidos = await conferir(emp.id, celulares);
  } catch (e) {
    // Sem o Voob CRM ainda dá para ver a busca; só não dá para saber quem já é da Voob (nem pôr na base).
    if (!(e instanceof VoobError)) return erroVoob(e);
    aviso = e.message;
  }
  const itens: ResultadoBusca[] = abertos.map((l) =>
    resultadoDaBusca(l, l.telefoneTipo !== "celular" ? "fixo" : (conferidos.get(l.telefone) ?? (aviso ? "sem_conferir" : "novo"))),
  );
  return Response.json({
    itens,
    nextPageToken: pagina.nextPageToken,
    bruto: pagina.bruto,
    uso: emp.equipe ? await obterUso() : undefined,
    cotaEmpresa: daEmpresa ?? undefined,
    aviso: aviso || undefined,
  });
}
