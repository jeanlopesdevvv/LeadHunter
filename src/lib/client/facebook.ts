"use client";

/**
 * A janela da Meta "Conectar o WhatsApp" (13/11/2026, white label): a mesma do Voob CRM (src/lib/whatsapp/facebook.ts e
 * oficial.ts de lá), com o app da Voob (Tech Provider). FB.login PRECISA ser chamado direto no clique (senão o navegador
 * bloqueia a janela): o SDK é carregado antes, quando a pessoa abre o passo do WhatsApp.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

const VERSAO = "v25.0";
let carregando: Promise<void> | null = null;
let iniciadoCom: string | null = null;

export function carregarSdkFacebook(appId: string): Promise<void> {
  if (window.FB && iniciadoCom === appId) return Promise.resolve();
  if (window.FB && !iniciadoCom) {
    window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: VERSAO });
    iniciadoCom = appId;
    return Promise.resolve();
  }
  if (carregando) return carregando;
  carregando = new Promise<void>((resolve, reject) => {
    const tempo = window.setTimeout(() => {
      carregando = null;
      reject(new Error("sdk do facebook não carregou"));
    }, 20000);
    window.fbAsyncInit = () => {
      window.clearTimeout(tempo);
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: VERSAO });
      iniciadoCom = appId;
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => {
      window.clearTimeout(tempo);
      carregando = null;
      s.remove();
      reject(new Error("sdk do facebook não carregou"));
    };
    document.body.appendChild(s);
  });
  return carregando;
}

export const sdkFacebookPronto = () => !!window.FB && !!iniciadoCom;

export type OpcaoNumero = "celular" | "novo";

/** O que a janela do Facebook contou (postMessage "WA_EMBEDDED_SIGNUP"). */
export interface SessaoJanela {
  evento: string;
  waba_id: string | null;
  phone_number_id: string | null;
  business_id: string | null;
}

const idMeta = (v: unknown): string | null => (/^\d{5,30}$/.test(String(v ?? "")) ? String(v) : null);

export function lerMensagemDaJanela(origem: string, dados: unknown): SessaoJanela | null {
  let host = "";
  try {
    host = new URL(origem).hostname;
  } catch {
    return null;
  }
  if (!(host === "facebook.com" || host.endsWith(".facebook.com"))) return null;
  let d: Record<string, unknown> | null = null;
  try {
    d = typeof dados === "string" ? JSON.parse(dados) : (dados as Record<string, unknown>);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object" || d.type !== "WA_EMBEDDED_SIGNUP") return null;
  const data = (d.data && typeof d.data === "object" ? d.data : {}) as Record<string, unknown>;
  return { evento: String(d.event ?? ""), waba_id: idMeta(data.waba_id), phone_number_id: idMeta(data.phone_number_id), business_id: idMeta(data.business_id) };
}

/** As opções da janela: o número do celular (coexistência) tem um fluxo próprio da Meta. */
export function extrasDaJanela(opcao: OpcaoNumero): Record<string, unknown> {
  return opcao === "celular" ? { setup: {}, featureType: "whatsapp_business_app_onboarding", sessionInfoVersion: "3" } : { setup: {}, sessionInfoVersion: "3" };
}

/** Abre a janela do Facebook (chamar DIRETO no clique). callback: o código (vale 30 s) ou null (fechou/negou). */
export function abrirJanelaDoFacebook(configId: string, extras: Record<string, unknown>, callback: (codigo: string | null) => void) {
  window.FB.login(
    (r: any) => {
      const codigo = r?.authResponse?.code;
      callback(typeof codigo === "string" && codigo ? codigo : null);
    },
    { config_id: configId, response_type: "code", override_default_response_type: true, extras },
  );
}
