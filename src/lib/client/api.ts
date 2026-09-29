"use client";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Corpo da resposta de erro (ex.: { cota: true, uso }). */
    public dados: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown, init?: { signal?: AbortSignal; method?: string }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init?.method ?? (body === undefined ? "GET" : "POST"),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: init?.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Sem conexão com o servidor. Verifique a internet.", 0);
  }
  if (res.status === 401) {
    // Sessão expirou: recarrega a página inteira no login (limpa o estado da tela).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiError("Sessão expirada.", 401);
  }
  const data = (await res.json().catch(() => ({}))) as T & { erro?: string };
  if (!res.ok) throw new ApiError(data.erro || `O servidor respondeu com erro ${res.status}.`, res.status, data as Record<string, unknown>);
  return data;
}
