/**
 * A marca da empresa (13/11/2026, white label): nome, cor, logo, público, quem fala e quem responde. Sem servidor: vale
 * para as rotas (conferir o que chega) e para a tela (preparar o logo antes de mandar).
 */

import type { QuemResponde } from "./tipos";

export const CORES_SUGERIDAS = ["#4e9a1a", "#1d4ed8", "#0f766e", "#7c3aed", "#db2777", "#ea580c", "#ca8a04", "#0e7490", "#334155"];
/** Logo: imagem pequena (o Radar reduz para 128 px antes de mandar). */
export const LOGO_MAX = 150_000;
export const LOGO_OK = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const ROTULO_RESPONDE: Record<QuemResponde, string> = {
  ia: "A IA da Voob, no Voob CRM",
  crm: "A equipe da empresa, pelo Voob CRM",
  outro: "Outro sistema (ex.: ManyChat)",
};

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Confere os dados da empresa (criar ou mudar). Texto = o que está errado. */
export function lerDadosDaEmpresa(b: Record<string, unknown>, criar: boolean): Record<string, unknown> | string {
  const d: Record<string, unknown> = {};
  if (criar || "nome" in b) {
    const nome = texto(b.nome, 60);
    if (nome.length < 2 || nome.length > 40) return "O nome da empresa precisa ter de 2 a 40 letras.";
    d.nome = nome;
  }
  if (criar) {
    if (typeof b.conta !== "string" || !/^[0-9a-f-]{36}$/i.test(b.conta)) return "Escolha a conta do Voob CRM da empresa.";
    d.conta = b.conta;
    const cidade = texto(b.cidade, 80);
    if (cidade) d.cidade = cidade;
  }
  if ("cor" in b) {
    if (typeof b.cor !== "string" || !/^#[0-9a-f]{6}$/i.test(b.cor)) return "Cor inválida.";
    d.cor = b.cor.toLowerCase();
  }
  if ("logo" in b) {
    if (b.logo === null || b.logo === "") d.logo = null;
    else if (typeof b.logo !== "string" || b.logo.length > LOGO_MAX || !LOGO_OK.test(b.logo)) return "O logo precisa ser uma imagem PNG, JPG ou WebP pequena.";
    else d.logo = b.logo;
  }
  if ("publico" in b) d.publico = texto(b.publico, 80);
  if ("agente" in b) {
    const a = texto(b.agente, 40);
    if (a) d.agente = a;
  }
  if ("responde" in b) {
    if (!["ia", "crm", "outro"].includes(String(b.responde))) return "Escolha quem responde.";
    d.responde = b.responde;
  }
  if ("responde_sistema" in b) d.responde_sistema = texto(b.responde_sistema, 40) || null;
  return d;
}
