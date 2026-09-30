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

const PASSAGEIROS = new Set([0, 500, 502, 504]);

function esperar(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(Object.assign(new Error("Cancelado"), { name: "AbortError" }));
      },
      { once: true },
    );
  });
}

async function umaVez<T>(path: string, body: unknown, init?: { signal?: AbortSignal; method?: string }): Promise<T> {
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
    throw new ApiError(
      typeof navigator !== "undefined" && !navigator.onLine ? "Sem internet no momento." : "Sem conexão com o servidor. Verifique a internet.",
      0,
    );
  }
  if (res.status === 401) {
    // Sessão expirou: recarrega a página inteira no login (o que estava na tela fica salvo no navegador).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    throw new ApiError("Sessão expirada.", 401);
  }
  const data = (await res.json().catch(() => ({}))) as T & { erro?: string };
  if (!res.ok) throw new ApiError(data.erro || `O servidor respondeu com erro ${res.status}.`, res.status, data as Record<string, unknown>);
  return data;
}

/**
 * Chama uma rota do Radar. Leituras (GET) tentam de novo sozinhas quando a conexão cai ou o
 * servidor falha por um instante. Envios (POST) só repetem se `tentativas` for pedido
 * (use só onde repetir é seguro).
 */
export async function api<T>(
  path: string,
  body?: unknown,
  init?: { signal?: AbortSignal; method?: string; tentativas?: number },
): Promise<T> {
  const leitura = body === undefined && (!init?.method || init.method === "GET");
  const tentativas = init?.tentativas ?? (leitura ? 3 : 1);
  for (let i = 0; ; i++) {
    try {
      return await umaVez<T>(path, body, init);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : -1;
      if (i + 1 >= tentativas || !PASSAGEIROS.has(status)) throw e;
      await esperar(800 * 2 ** i, init?.signal);
    }
  }
}
