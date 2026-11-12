import "server-only";

import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import zlib from "node:zlib";

import { getConfig } from "@/lib/env";

import { NAO_CONFERIDO, analisarPagina, enderecoPermitido, fechar, ipInterno, type ProblemaSite, type RaioX } from "./raio-x-regras";

/**
 * Raio-X do site (12/11/2026): baixa a página inicial e lê com analisarPagina.
 * Travas (o endereço vem do Google, mas é de terceiros): só http/https na porta padrão, nome público, e o IP é
 * conferido NA HORA de conectar (lookup próprio: se o nome resolver para rede interna, a conexão nem abre, mesmo
 * que o DNS mude entre uma consulta e outra), a cada redirecionamento. Até 8 s, 1,5 MB e 4 redirecionamentos.
 * Só afirma o que viu: site que barra robô, lento ou com erro passageiro fica "não conferido".
 */

const LIMITE_BYTES = 1_500_000;
const TEMPO_MS = 8_000;
const MAX_SALTOS = 4;
const CABECALHOS = {
  "User-Agent": "Mozilla/5.0 (compatible; RadarVoob/1.0; +https://voob.online)",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
  "Accept-Language": "pt-BR,pt;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
};

class Bloqueado extends Error {}

/** Resolve o nome e recusa se QUALQUER endereço for de rede interna. É o lookup que o próprio http/https usa para conectar. */
const lookupSeguro: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, enderecos) => {
    if (err) return callback(err, "", 0);
    const lista = enderecos as LookupAddress[];
    if (!lista.length || lista.some((a) => ipInterno(a.address))) {
      return callback(Object.assign(new Bloqueado("endereço interno"), { code: "EBLOQUEADO" }), "", 0);
    }
    if (options.all) (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, lista);
    else callback(null, lista[0].address, lista[0].family);
  });
};

interface Resposta {
  status: number;
  destino: string | null;
  html: string;
  /** Não é página (PDF, imagem...): não dá para ler. */
  outroTipo: boolean;
}

function pedir(u: URL): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const mod = u.protocol === "https:" ? https : http;
    let acabou = false;
    const fim = (r: Resposta) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(relogio);
      resolve(r);
    };
    const erro = (e: unknown) => {
      if (acabou) return;
      acabou = true;
      clearTimeout(relogio);
      reject(e);
    };
    const req = mod.request(u, { method: "GET", lookup: lookupSeguro, headers: CABECALHOS, timeout: TEMPO_MS }, (res) => {
      const status = res.statusCode ?? 0;
      const destino = typeof res.headers.location === "string" ? res.headers.location : null;
      const tipo = String(res.headers["content-type"] ?? "");
      const outroTipo = Boolean(tipo) && !/html|text\/plain|xml/i.test(tipo);
      if (status >= 300 || outroTipo) {
        res.destroy();
        return fim({ status, destino, html: "", outroTipo });
      }
      const cod = String(res.headers["content-encoding"] ?? "").toLowerCase();
      const fluxo = cod.includes("br") ? res.pipe(zlib.createBrotliDecompress()) : cod.includes("gzip") ? res.pipe(zlib.createGunzip()) : cod.includes("deflate") ? res.pipe(zlib.createInflate()) : res;
      const partes: Buffer[] = [];
      let total = 0;
      const pronto = () => fim({ status, destino, html: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(partes)), outroTipo: false });
      fluxo.on("data", (c: Buffer) => {
        partes.push(c);
        total += c.length;
        if (total >= LIMITE_BYTES) {
          res.destroy();
          pronto();
        }
      });
      fluxo.on("end", pronto);
      // Página cortada no meio (ou compactação quebrada): lê o que chegou.
      fluxo.on("error", () => (partes.length ? pronto() : erro(Object.assign(new Error("leitura"), { code: "ELEITURA" }))));
      res.on("error", () => (partes.length ? pronto() : erro(Object.assign(new Error("leitura"), { code: "ELEITURA" }))));
    });
    const relogio = setTimeout(() => req.destroy(Object.assign(new Error("tempo"), { code: "ETIMEDOUT" })), TEMPO_MS + 2_000);
    req.on("timeout", () => req.destroy(Object.assign(new Error("tempo"), { code: "ETIMEDOUT" })));
    req.on("error", erro);
    req.end();
  });
}

async function baixar(inicio: URL): Promise<Resposta & { finalUrl: string }> {
  let atual = inicio;
  for (let salto = 0; ; salto++) {
    if (!enderecoPermitido(atual.toString())) throw new Bloqueado("endereço não permitido");
    const r = await pedir(atual);
    if (r.status >= 300 && r.status < 400 && r.destino && salto < MAX_SALTOS) {
      atual = new URL(r.destino, atual);
      continue;
    }
    return { ...r, finalUrl: atual.toString() };
  }
}

const codigo = (e: unknown) => `${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? ""}`;
/** O nome não existe ou ninguém atende na porta: o endereço não abre para ninguém. (Lento, reset e DNS instável não contam.) */
const naoExiste = (e: unknown) => /\b(ENOTFOUND|ECONNREFUSED)\b/.test(codigo(e));

async function umaVez(base: URL, anoAtual: number): Promise<RaioX> {
  const comHttps = new URL(base.toString());
  comHttps.protocol = "https:";
  try {
    const r = await baixar(comHttps);
    if (r.outroTipo) return NAO_CONFERIDO;
    return analisarPagina({ ...r, httpsFunciona: r.status < 400, anoAtual });
  } catch (e) {
    if (e instanceof Bloqueado) return NAO_CONFERIDO;
    // Sem https (certificado vencido ou de outro nome, porta fechada): tenta em http.
    try {
      const semHttps = new URL(base.toString());
      semHttps.protocol = "http:";
      const r = await baixar(semHttps);
      if (r.outroTipo) return NAO_CONFERIDO;
      return analisarPagina({ ...r, httpsFunciona: false, anoAtual });
    } catch (e2) {
      if (e2 instanceof Bloqueado) return NAO_CONFERIDO;
      return naoExiste(e) && naoExiste(e2) ? fechar(["fora_do_ar"], null) : NAO_CONFERIDO;
    }
  }
}

export async function examinarSite(url: string, anoAtual = new Date().getFullYear()): Promise<RaioX> {
  const base = enderecoPermitido(url);
  if (!base) return NAO_CONFERIDO;
  if (getConfig().mock) return simulado(base.hostname, anoAtual);
  const r = await umaVez(base, anoAtual);
  if (!r.problemas.includes("fora_do_ar")) return r;
  // "Não abre" é a afirmação mais forte: só vale se der a mesma coisa de novo, um instante depois.
  await new Promise((ok) => setTimeout(ok, 1_500));
  const de_novo = await umaVez(base, anoAtual);
  return de_novo.problemas.includes("fora_do_ar") ? de_novo : de_novo.situacao === "nao_conferido" ? NAO_CONFERIDO : de_novo;
}

/** Simulação (MOCK_MODE=1): o mesmo endereço dá sempre o mesmo resultado; uns 60% desatualizados. */
function simulado(host: string, anoAtual: number): RaioX {
  let h = 0;
  for (const c of host) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const todos: ProblemaSite[] = ["sem_celular", "ano_antigo", "sem_https", "fora_do_ar", "em_construcao"];
  if (h % 10 < 4) return fechar([], null);
  const qtd = 1 + (h % 2);
  const escolhidos = todos.filter((_, i) => (h >> i) % 3 === 0).slice(0, qtd);
  const problemas = escolhidos.length ? escolhidos : [todos[h % todos.length]];
  const unico = problemas.includes("fora_do_ar") ? (["fora_do_ar"] as ProblemaSite[]) : problemas;
  return fechar(unico, unico.includes("ano_antigo") ? anoAtual - 3 - (h % 5) : null);
}

/** Vários sites, 5 de cada vez. */
export async function examinarVarios(urls: string[]): Promise<RaioX[]> {
  const saida: RaioX[] = new Array(urls.length);
  let i = 0;
  const trabalhar = async () => {
    while (i < urls.length) {
      const k = i++;
      saida[k] = await examinarSite(urls[k]).catch(() => NAO_CONFERIDO);
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, urls.length) }, trabalhar));
  return saida;
}
