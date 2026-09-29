import "server-only";

import { PlacesError } from "./places";
import { SheetsError } from "./sheets";

export function jsonError(message: string, status = 400) {
  return Response.json({ erro: message }, { status });
}

export function handleError(e: unknown) {
  if (e instanceof PlacesError || e instanceof SheetsError) return jsonError(e.message, e.status);
  console.error("[leadhunter]", e);
  return jsonError("Algo deu errado no servidor. Tente de novo.", 500);
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const isString = (v: unknown): v is string => typeof v === "string";
