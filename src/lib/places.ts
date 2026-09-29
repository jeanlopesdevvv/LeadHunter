import "server-only";

import { classifyLead } from "./classify";
import { cityFromInput } from "./geo";
import { normalizePhone } from "./phone";
import type { Lead, PageResult, Rect } from "./types";

/**
 * Google Places API (New) — Text Search.
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 *
 * Cada chamada devolve até 20 lugares; com nextPageToken chega a 60 por consulta.
 * Telefone, site, nota e nº de avaliações são campos do SKU "Enterprise".
 */

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const LEAD_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.addressComponents",
  "places.googleMapsUri",
  "places.businessStatus",
  "places.primaryTypeDisplayName",
  "places.pureServiceAreaBusiness",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "nextPageToken",
].join(",");

const AUTOCOMPLETE = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS = "https://places.googleapis.com/v1/places/";

interface AddressComponent {
  longText?: string;
  shortText?: string;
  types?: string[];
}

export interface GooglePlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  shortFormattedAddress?: string;
  addressComponents?: AddressComponent[];
  googleMapsUri?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text?: string };
  pureServiceAreaBusiness?: boolean;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  viewport?: Rect;
  types?: string[];
}

export class PlacesError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Mensagem clara + código: 503 = problema de configuração (não adianta tentar de novo). */
function explainGoogleError(status: number, body: string): { mensagem: string; status: number } {
  let reason = "";
  try {
    const json = JSON.parse(body) as { error?: { message?: string; status?: string } };
    reason = `${json.error?.status ?? ""} ${json.error?.message ?? ""}`.trim();
  } catch {
    reason = body.slice(0, 200);
  }
  const r = reason.toLowerCase();
  if (r.includes("api key not valid") || r.includes("api_key_invalid"))
    return { status: 503, mensagem: "A chave do Google Maps está errada. Confira GOOGLE_MAPS_API_KEY no EasyPanel." };
  if (r.includes("billing"))
    return { status: 503, mensagem: "O projeto do Google Cloud está sem faturamento ativo. Sem ele o Google não libera a busca." };
  if (r.includes("has not been used") || r.includes("is disabled") || r.includes("service_disabled"))
    return { status: 503, mensagem: "A Places API (New) não está ativada no projeto do Google Cloud." };
  if (status === 403)
    return { status: 503, mensagem: `O Google recusou a chave (restrição de API ou de IP na chave?). Detalhe: ${reason}` };
  if (status === 429 || r.includes("resource_exhausted"))
    return {
      status: 429,
      mensagem: "O Google atingiu o limite de consultas configurado no Google Cloud (cota diária ou por minuto). Tente mais tarde.",
    };
  if (status === 400 && (r.includes("page_token") || r.includes("pagetoken") || r.includes("page token")))
    return { status: 400, mensagem: "O Google não aceitou continuar esta lista (próxima página expirou)." };
  return { status: status === 400 ? 400 : 502, mensagem: `O Google respondeu com erro (${status}): ${reason || "sem detalhes"}` };
}

async function callPlaces<T>(url: string, apiKey: string, opts: { body?: Record<string, unknown>; fieldMask?: string }): Promise<T> {
  const headers: Record<string, string> = { "X-Goog-Api-Key": apiKey };
  if (opts.fieldMask) headers["X-Goog-FieldMask"] = opts.fieldMask;
  if (opts.body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method: opts.body ? "POST" : "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  if (!res.ok) {
    const erro = explainGoogleError(res.status, text);
    throw new PlacesError(erro.mensagem, erro.status);
  }
  return JSON.parse(text || "{}") as T;
}

function callTextSearch(body: Record<string, unknown>, fieldMask: string, apiKey: string) {
  return callPlaces<{ places?: GooglePlace[]; nextPageToken?: string }>(ENDPOINT, apiKey, { body, fieldMask });
}

function component(place: GooglePlace, type: string): AddressComponent | undefined {
  return place.addressComponents?.find((c) => c.types?.includes(type));
}

export function placeToLead(place: GooglePlace, termo: string, cidadeBusca: string, now = new Date()): Lead {
  const phone = normalizePhone(place.internationalPhoneNumber || place.nationalPhoneNumber || "");
  const nome = place.displayName?.text?.trim() || "(sem nome)";
  const cidade =
    component(place, "administrative_area_level_2")?.longText ||
    component(place, "locality")?.longText ||
    cityFromInput(cidadeBusca);
  const endereco = place.pureServiceAreaBusiness ? "" : place.formattedAddress || "";
  const site = place.websiteUri || "";
  const { tipo, motivos } = classifyLead({
    nome,
    site,
    avaliacoes: place.userRatingCount ?? null,
    semPontoFisico: Boolean(place.pureServiceAreaBusiness),
    endereco,
  });
  return {
    id: place.id,
    nome,
    telefone: phone.digits,
    telefoneKey: phone.key,
    telefoneTipo: phone.kind,
    telefoneExibicao: phone.display || place.nationalPhoneNumber || "",
    tipo,
    tipoMotivos: motivos,
    cidade,
    uf: component(place, "administrative_area_level_1")?.shortText || "",
    bairro: component(place, "sublocality_level_1")?.longText || component(place, "sublocality")?.longText || "",
    endereco,
    site,
    mapsUrl: place.googleMapsUri || "",
    nota: typeof place.rating === "number" ? place.rating : null,
    avaliacoes: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    categoria: place.primaryTypeDisplayName?.text || "",
    situacaoNegocio: place.businessStatus || "OPERATIONAL",
    semPontoFisico: Boolean(place.pureServiceAreaBusiness),
    termo,
    capturadoEm: now.toISOString(),
    planilha: "desconhecido",
  };
}

export interface SearchPageInput {
  textQuery: string;
  termo: string;
  cidade: string;
  rect?: Rect;
  pageToken?: string | null;
}

export async function searchPage(input: SearchPageInput, apiKey: string): Promise<PageResult> {
  const body: Record<string, unknown> = {
    textQuery: input.textQuery,
    languageCode: "pt-BR",
    regionCode: "BR",
    pageSize: 20,
    // Sem isso o Google omite quem atende só a domicílio (os autônomos).
    includePureServiceAreaBusinesses: true,
  };
  if (input.rect) body.locationRestriction = { rectangle: input.rect };
  if (input.pageToken) body.pageToken = input.pageToken;
  const data = await callTextSearch(body, LEAD_FIELDS, apiKey);
  const places = data.places ?? [];
  return {
    leads: places.map((p) => placeToLead(p, input.termo, input.cidade)),
    nextPageToken: data.nextPageToken || null,
    bruto: places.length,
  };
}

export interface CityArea {
  entrada: string;
  nome: string;
  viewport: Rect | null;
}

const g = globalThis as unknown as { __radarAreas?: Map<string, { em: number; area: CityArea }> };
const AREA_TTL_MS = 24 * 60 * 60_000;

/**
 * Descobre o retângulo da cidade/bairro (para dividir o mapa quando o Google
 * esgota os 60 resultados de uma consulta).
 * Usa Autocomplete + Place Details (sessão): cota grátis própria, não gasta as
 * 1.000 consultas de busca do mês. Guardado por 24 h.
 */
export async function resolveCityArea(cidade: string, apiKey: string, onChamada?: () => void): Promise<CityArea> {
  const chave = cidade.trim().toLowerCase();
  const cache = (g.__radarAreas ??= new Map());
  const salvo = cache.get(chave);
  if (salvo && Date.now() - salvo.em < AREA_TTL_MS) return salvo.area;

  const sessionToken = crypto.randomUUID();
  const ac = await callPlaces<{ suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[] }>(AUTOCOMPLETE, apiKey, {
    body: { input: cidade, languageCode: "pt-BR", includedRegionCodes: ["br"], includedPrimaryTypes: ["(regions)"], sessionToken },
  });
  onChamada?.();
  const placeId = ac.suggestions?.find((s) => s.placePrediction?.placeId)?.placePrediction?.placeId;
  let area: CityArea = { entrada: cidade, nome: cidade, viewport: null };
  if (placeId) {
    const qs = new URLSearchParams({ languageCode: "pt-BR", regionCode: "BR", sessionToken });
    const place = await callPlaces<GooglePlace>(`${DETAILS}${encodeURIComponent(placeId)}?${qs}`, apiKey, {
      fieldMask: "id,displayName,formattedAddress,viewport",
    });
    onChamada?.();
    if (place.viewport) area = { entrada: cidade, nome: place.formattedAddress || place.displayName?.text || cidade, viewport: place.viewport };
  }
  cache.set(chave, { em: Date.now(), area });
  return area;
}
