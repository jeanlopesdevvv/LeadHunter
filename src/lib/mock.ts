import "server-only";

import type { CityArea, GooglePlace, SearchPageInput } from "./places";
import { placeToLead } from "./places";
import type { PageResult } from "./types";

/**
 * Modo simulação (MOCK_MODE=1, nunca na produção): dados falsos e uma
 * planilha em memória para testar a tela e o fluxo sem gastar a API.
 */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const PREFIXOS = ["Lava Jato", "Estética Automotiva", "Lava Rápido", "Auto Spa", "Car Wash", "Lavagem", "Ducha", "Centro Automotivo"];
const SUFIXOS = ["Brilho", "Premium", "Savassi", "Express", "do Zé", "Cristal", "Pampulha", "Top Car", "Estrela", "Prime", "BH", "Nova Era", "Garagem 31", "Sul", "Ecológica"];
const PESSOAS = ["Marcos Vinicius", "Ana Paula Souza", "Rafael Lima", "Carlos Henrique", "Juliana Alves"];
const BAIRROS = ["Savassi", "Pampulha", "Barreiro", "Buritis", "Funcionários", "Castelo", "Venda Nova", "Santa Efigênia"];

function mockPlace(seed: number, cidade: string): GooglePlace {
  const r = rng(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const autonomo = r() < 0.18;
  const nome = autonomo
    ? `${pick(PESSOAS)}${r() < 0.5 ? " Lavagem a Domicílio" : ""}`
    : `${pick(PREFIXOS)} ${pick(SUFIXOS)}`;
  const phoneRoll = r();
  // Pool pequeno de números para gerar repetidos entre áreas (como acontece no Google).
  const n = 10000000 + (seed % 700) * 9973;
  let tel: string | undefined;
  if (phoneRoll < 0.62) tel = `+55 31 9${String(n).slice(0, 4)}-${String(n).slice(4, 8)}`;
  else if (phoneRoll < 0.86) tel = `+55 31 3${String(n).slice(1, 4)}-${String(n).slice(4, 8)}`;
  if (seed % 97 === 3) tel = "+55 31 98299-9779"; // já está na planilha simulada
  if (seed % 89 === 5) tel = "+55 31 99111-2233"; // opt-out na planilha simulada
  const bairro = pick(BAIRROS);
  return {
    id: `mock-${seed}`,
    displayName: { text: nome },
    formattedAddress: autonomo ? undefined : `R. ${pick(SUFIXOS)}, ${Math.floor(r() * 2000)} - ${bairro}, ${cidade} - MG`,
    addressComponents: [
      { longText: bairro, types: ["sublocality_level_1", "sublocality"] },
      { longText: cidade, types: ["administrative_area_level_2", "political"] },
      { longText: "Minas Gerais", shortText: "MG", types: ["administrative_area_level_1", "political"] },
    ],
    googleMapsUri: `https://maps.google.com/?cid=${seed}`,
    businessStatus: seed % 41 === 0 ? "CLOSED_PERMANENTLY" : "OPERATIONAL",
    primaryTypeDisplayName: { text: nome.includes("Estética") ? "Serviço de estética automotiva" : "Lava-jato" },
    pureServiceAreaBusiness: autonomo,
    internationalPhoneNumber: tel,
    websiteUri: !autonomo && r() < 0.35 ? `https://www.${nome.toLowerCase().replace(/[^a-z]/g, "")}.com.br` : undefined,
    rating: Math.round((3.6 + r() * 1.4) * 10) / 10,
    userRatingCount: autonomo ? Math.floor(r() * 12) : Math.floor(r() * 400),
  };
}

export async function mockSearchPage(input: SearchPageInput): Promise<PageResult> {
  await new Promise((res) => setTimeout(res, 250 + Math.random() * 350));
  const page = input.pageToken ? Number(input.pageToken.split(":")[1]) : 0;
  const base = hash(`${input.textQuery}|${JSON.stringify(input.rect ?? null)}`);
  // Cidade inteira: 60 resultados (o Google "esgota" e o Radar divide o mapa); pedaços do mapa: menos.
  const count = page < 2 ? 20 : input.rect ? 9 : 20;
  const cidade = input.cidade.split(/[-,/]/)[0].trim() || "Belo Horizonte";
  const places = Array.from({ length: count }, (_, i) => mockPlace((base + page * 20 + i) % 5000, cidade));
  return {
    leads: places.map((p) => placeToLead(p, input.termo, input.cidade)),
    nextPageToken: page < 2 ? `mock:${page + 1}` : null,
    bruto: places.length,
  };
}

export async function mockResolveCityArea(cidade: string): Promise<CityArea> {
  return {
    entrada: cidade,
    nome: `${cidade}, Brasil`,
    viewport: { low: { latitude: -20.06, longitude: -44.06 }, high: { latitude: -19.78, longitude: -43.86 } },
  };
}

/* ---------------- planilha simulada ---------------- */

interface MockSheet {
  title: string;
  tabs: Record<string, string[][]>;
}

const g = globalThis as unknown as { __lhMockSheet?: MockSheet };

/** Data no formato que o n8n grava ("29/09/2026, 21:13:05"), no horário de Brasília. */
export function dataN8n(ms: number): string {
  return new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function mockSheet(): MockSheet {
  if (!g.__lhMockSheet) {
    const agora = Date.now();
    const h = (horas: number) => agora - horas * 3_600_000;
    const iso = (ms: number) => new Date(ms).toISOString();
    // Alguns disparos antigos para o painel da Carol ter o que mostrar.
    const antigos = [
      { tel: "5531977001001", nome: "Lava Jato Estrela Guia", tipo: "Empresa", quando: h(20), resposta: "Sim, atendo", estado: "FALANDO_COM_CAROL" },
      { tel: "5531977001002", nome: "Marcos Lavagem a Domicílio", tipo: "Autônomo", quando: h(19), resposta: "Não tenho interesse", estado: "LEAD_PERDIDO", optout: true },
      { tel: "5531977001003", nome: "Auto Spa Savassi", tipo: "Empresa", quando: h(5), resposta: "Oi Carol, quanto custa pra entrar?", estado: "FALANDO_COM_CAROL" },
      { tel: "5531977001006", nome: "Lava Rápido Central", tipo: "Empresa", quando: h(4.5), resposta: "Prefiro falar com um atendente", estado: "AGUARDANDO_SUPORTE" },
      { tel: "5531977001004", nome: "Ducha Prime", tipo: "Empresa", quando: h(4), resposta: "", estado: "FALANDO_COM_CAROL" },
      { tel: "5531977001005", nome: "Lavador Rafael", tipo: "Autônomo", quando: h(3), resposta: "", estado: "FALANDO_COM_CAROL", falhou: true },
    ];
    g.__lhMockSheet = {
      title: "Leads Lava-jatos (simulação)",
      tabs: {
        leads: [
          ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout"],
          ["5531982999779", "Jean Lopes", "Autônomo", "Belo Horizonte", "pendente", "", ""],
          ["5531991112233", "Lava Jato Teste Opt-out", "Empresa", "Belo Horizonte", "enviado", "10/09/2026 10:00", "sim"],
          ...antigos.map((a) => [a.tel, a.nome, a.tipo, "Belo Horizonte", "enviado", dataN8n(a.quando), a.optout ? dataN8n(a.quando + 41 * 60_000) : ""]),
        ],
        historico_carol: [
          ["telefone", "timestamp", "remetente", "mensagem", "remoteJid"],
          ["5531988776655", iso(h(200)), "carol", "Oi! Aqui é a Carol, do Lavacar.", "5531988776655@s.whatsapp.net"],
          ...antigos.flatMap((a) => {
            const linhas: string[][] = [[a.tel, iso(a.quando + 5_000), "carol", "Oi! Aqui é a Carol, consultora comercial do Lavacar…", `${a.tel}@s.whatsapp.net`]];
            if (a.resposta) linhas.push([a.tel, iso(a.quando + 40 * 60_000), "lead", a.resposta, `${a.tel}@s.whatsapp.net`]);
            return linhas;
          }),
        ],
        // O Fluxo 6 grava só as falhas do Meta.
        status_meta_carol: [
          ["timestamp", "telefone", "wamid", "status", "erro_codigo", "erro_detalhe", "categoria_cobranca"],
          ...antigos
            .filter((a) => a.falhou)
            .map((a, i) => [iso(a.quando + 60_000), a.tel.slice(2), `wamid.mock${i}`, "failed", "131049", "Mensagem não entregue para manter a qualidade", ""]),
        ],
        sessoes_carol: [
          ["remoteJid", "telefone", "nome", "estado", "ultimo_contato", "tentativas_reativacao"],
          ...antigos.map((a) => [`${a.tel}@s.whatsapp.net`, a.tel.slice(2), a.nome, a.estado, iso(a.quando), "0"]),
        ],
        historico_sofia: [["data", "telefone", "mensagem"]],
      },
    };
  }
  return g.__lhMockSheet;
}
