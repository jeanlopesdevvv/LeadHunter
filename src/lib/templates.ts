import "server-only";

import { getConfig } from "./env";
import { analisarTemplate, MODELO_AUTONOMO, MODELO_LAVAJATO, type ModeloWhatsApp, type TemplateMeta } from "./templates-regras";

/**
 * Modelos aprovados da conta do WhatsApp da Carol, lidos do Meta (Graph API).
 * Guardados por alguns minutos: abrir o disparo várias vezes não multiplica as chamadas.
 */

export interface ListaDeModelos {
  /** O Radar consegue ler os modelos do Meta (token e conta configurados). */
  configurado: boolean;
  modelos: ModeloWhatsApp[];
  /** Mensagem simples quando a leitura falhou. */
  erro: string;
}

const g = globalThis as unknown as { __radarModelos?: { em: number; valor: Promise<{ lista: ListaDeModelos; brutos: Map<string, TemplateMeta> }> } };

const CORPO_LAVAJATO =
  "Oi, {{1}}! Tudo bem? 👋\n\nAqui é a *Carol*, consultora comercial do Lavacar.\n\nEstamos montando a vitrine de lava-jatos {{2}} — uma lista que conecta donos de carro a estabelecimentos de confiança na região. 🚙✨\n\nVi seu contato e queria confirmar antes de seguir: seu lava-jato ainda está atendendo normalmente?";
const CORPO_AUTONOMO =
  "Oi, {{1}}! Tudo bem? 👋\n\nAqui é a *Carol*, consultora comercial do Lavacar.\n\nEstamos atualizando nossa lista de profissionais de lavagem automotiva {{2}} — quem atende bem ganha visibilidade e recebe clientes direto pelo app. 🚙✨\n\nVi seu contato e queria confirmar antes de seguir: você ainda atende com lavagem automotiva?";
const BOTOES = { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Sim, atendo" }, { type: "QUICK_REPLY", text: "Não tenho interesse" }] };

/** Modelos da simulação (MOCK_MODE): os dois de hoje, um novo para teste e um que não dá para usar. */
export const MODELOS_SIMULACAO: TemplateMeta[] = [
  {
    name: MODELO_LAVAJATO,
    status: "APPROVED",
    category: "MARKETING",
    language: "pt_BR",
    components: [
      { type: "HEADER", format: "TEXT", text: "Lavacar • Parceria para lava-jatos" },
      { type: "BODY", text: CORPO_LAVAJATO },
      { type: "FOOTER", text: "Lavacar • Resposta rápida, sem compromisso" },
      BOTOES,
    ],
  },
  {
    name: MODELO_AUTONOMO,
    status: "APPROVED",
    category: "MARKETING",
    language: "pt_BR",
    components: [
      { type: "HEADER", format: "TEXT", text: "Lavacar • Mais clientes para você" },
      { type: "BODY", text: CORPO_AUTONOMO },
      { type: "FOOTER", text: "Lavacar • Resposta rápida, sem compromisso" },
      BOTOES,
    ],
  },
  {
    name: "carol_prospeccao_12meses",
    status: "APPROVED",
    category: "MARKETING",
    language: "pt_BR",
    components: [
      {
        type: "BODY",
        text: "Oi, {{1}}! Aqui é a Carol, do Lavacar. 👋\n\nEstamos levando novos clientes para lava-jatos {{2}} pelo app, e os primeiros parceiros entram com 12 meses grátis.\n\nPosso te explicar em 2 minutos como funciona?",
      },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Quero saber" }, { type: "QUICK_REPLY", text: "Não tenho interesse" }] },
    ],
  },
  {
    // Só na simulação: o envio falha com o erro 132000 (para testar o aviso de erro no disparo).
    name: "carol_prospeccao_teste_erro",
    status: "APPROVED",
    category: "MARKETING",
    language: "pt_BR",
    components: [{ type: "BODY", text: "Oi, {{1}}! Teste de modelo que o WhatsApp recusa." }],
  },
  {
    // Não é de prospecção (aparece em "não pode ser usado").
    name: "carol_retomada_contato",
    status: "APPROVED",
    category: "MARKETING",
    language: "pt_BR",
    components: [{ type: "BODY", text: "Oi, {{1}}! Aqui é a Carol, do Lavacar. Podemos retomar de onde paramos?" }],
  },
  {
    name: "carol_promo_imagem",
    status: "APPROVED",
    category: "MARKETING",
    language: "pt_BR",
    components: [
      { type: "HEADER", format: "IMAGE" },
      { type: "BODY", text: "Oi, {{1}}! Conheça o Lavacar." },
    ],
  },
];

async function buscarNoMeta(): Promise<{ lista: ListaDeModelos; brutos: Map<string, TemplateMeta> }> {
  const cfg = getConfig();
  const brutos = new Map<string, TemplateMeta>();
  const montar = (ts: TemplateMeta[], configurado: boolean, erro = "") => {
    const modelos = ts
      .filter((t) => t?.name)
      .map((t) => {
        brutos.set(t.name, t);
        return analisarTemplate(t);
      })
      // Os utilizáveis primeiro; dentro de cada grupo, por nome.
      .sort((a, b) => Number(b.utilizavel) - Number(a.utilizavel) || a.nome.localeCompare(b.nome));
    return { lista: { configurado, modelos, erro }, brutos };
  };
  if (cfg.mock) return montar(MODELOS_SIMULACAO, true);
  if (!cfg.metaToken || !cfg.metaWabaId) return montar([], false);

  const todos: TemplateMeta[] = [];
  let url: string | null =
    `https://graph.facebook.com/${cfg.metaApiVersion}/${encodeURIComponent(cfg.metaWabaId)}/message_templates` +
    `?fields=name,status,category,language,components,parameter_format&limit=100`;
  for (let pagina = 0; url && pagina < 10; pagina++) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.metaToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: TemplateMeta[]; paging?: { next?: string }; error?: { message?: string; code?: number } };
    if (!res.ok || json.error) {
      console.error("[radar] Meta recusou a lista de modelos:", res.status, json.error?.code, json.error?.message);
      const erro =
        json.error?.code === 190
          ? "O acesso ao WhatsApp expirou. Fale com o administrador do Radar."
          : "Não foi possível ler os modelos do WhatsApp agora. Fale com o administrador do Radar.";
      return montar(todos, true, erro);
    }
    todos.push(...(json.data ?? []));
    url = json.paging?.next ?? null;
  }
  // Só português (o Fluxo 1 manda pt_BR).
  return montar(todos.filter((t) => String(t.language ?? "").toLowerCase().startsWith("pt")), true);
}

function carregar(forcar = false) {
  const agora = Date.now();
  const atual = g.__radarModelos;
  if (!forcar && atual && agora - atual.em < 5 * 60_000) return atual.valor;
  const valor = buscarNoMeta();
  g.__radarModelos = { em: agora, valor };
  valor.catch(() => {
    if (g.__radarModelos?.valor === valor) g.__radarModelos = undefined;
  });
  return valor;
}

export async function listarModelos(forcar = false): Promise<ListaDeModelos> {
  try {
    return (await carregar(forcar)).lista;
  } catch (e) {
    console.error("[radar] erro ao ler modelos:", (e as Error).message);
    return { configurado: true, modelos: [], erro: "Não foi possível ler os modelos do WhatsApp agora. Tente de novo em instantes." };
  }
}

/** O modelo como o Meta devolveu (vai para o n8n montar o envio). null se não existir ou não puder ser usado. */
export async function modeloParaEnvio(nome: string): Promise<{ modelo: ModeloWhatsApp; bruto: TemplateMeta } | null> {
  const { lista, brutos } = await carregar();
  const modelo = lista.modelos.find((m) => m.nome === nome);
  const bruto = brutos.get(nome);
  if (!modelo || !bruto || !modelo.utilizavel) return null;
  return { modelo, bruto };
}
