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

/** Só campos Pro (cota grátis maior) para descobrir a área da cidade. */
const AREA_FIELDS = "places.displayName,places.formattedAddress,places.viewport,places.types";

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

function explainGoogleError(status: number, body: string): string {
  let reason = "";
  try {
    const json = JSON.parse(body) as { error?: { message?: string; status?: string } };
    reason = `${json.error?.status ?? ""} ${json.error?.message ?? ""}`.trim();
  } catch {
    reason = body.slice(0, 200);
  }
  const r = reason.toLowerCase();
  if (r.includes("api key not valid") || r.includes("api_key_invalid"))
    return "Chave do Google inválida. Confira GOOGLE_MAPS_API_KEY na Vercel.";
  if (r.includes("billing")) return "O projeto do Google Cloud está sem faturamento ativo. Ative o faturamento para usar a Places API.";
  if (r.includes("has not been used") || r.includes("is disabled") || r.includes("service_disabled"))
    return "A Places API (New) não está ativada no projeto do Google Cloud.";
  if (status === 403) return `O Google recusou a chave (restrição de API/referenciador?). Detalhe: ${reason}`;
  if (status === 429 || r.includes("resource_exhausted")) return "Cota da Places API esgotada por hoje. Tente mais tarde ou aumente a cota no Google Cloud.";
  return `Erro do Google (${status}): ${reason || "sem detalhes"}`;
}

async function callTextSearch(body: Record<string, unknown>, fieldMask: string, apiKey: string) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  if (!res.ok) throw new PlacesError(explainGoogleError(res.status, text), res.status === 429 ? 429 : 502);
  return JSON.parse(text || "{}") as { places?: GooglePlace[]; nextPageToken?: string };
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

export async function resolveCityArea(cidade: string, apiKey: string): Promise<CityArea> {
  const data = await callTextSearch(
    { textQuery: cidade, languageCode: "pt-BR", regionCode: "BR", pageSize: 1 },
    AREA_FIELDS,
    apiKey,
  );
  const place = data.places?.[0];
  if (!place?.viewport) return { entrada: cidade, nome: cidade, viewport: null };
  return { entrada: cidade, nome: place.formattedAddress || place.displayName?.text || cidade, viewport: place.viewport };
}
