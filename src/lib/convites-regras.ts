/**
 * Funil "Do link à conta" (09/11/2026, pedido do Jean): a Carol manda o link de cadastro com o convite do lead (&c=),
 * a página de planos abre já preenchida e conta cada passo. Aqui vira o funil da tela Disparo automático.
 * Fonte: atendimento.convite_funil(dias).
 */

export const ETAPAS_CONVITE = [
  { id: "enviados", rotulo: "Receberam o link", explica: "A Carol mandou o link de cadastro com o convite." },
  { id: "abriram", rotulo: "Abriram o link", explica: "Abriram a página de planos pelo link." },
  { id: "formulario", rotulo: "Viram o cadastro", explica: "Chegaram ao formulário do plano." },
  { id: "comecaram", rotulo: "Começaram a preencher", explica: "Digitaram alguma coisa no formulário." },
  { id: "enviaram", rotulo: "Tentaram criar a conta", explica: "Tocaram no botão com tudo certo." },
  { id: "conta", rotulo: "Criaram a conta", explica: "A conta de parceiro foi criada." },
] as const;
export type EtapaConvite = (typeof ETAPAS_CONVITE)[number]["id"];

/** Nome dos campos do cadastro, como aparece na página. */
export const CAMPO_TEXTO: Record<string, string> = {
  unitName: "Nome do lava jato",
  email: "E-mail",
  password: "Senha",
  phone: "WhatsApp",
  document: "CPF ou CNPJ",
  legalName: "Nome completo ou razão social",
  address: "Endereço",
  termos: "Termos de uso",
};

/** Onde cada lead parou (o passo mais avançado). */
export const PAROU_TEXTO: Record<string, string> = {
  enviado: "Ainda não abriu",
  abriu: "Abriu o link",
  formulario: "Viu o cadastro",
  comecou: "Começou a preencher",
  enviou: "Tentou criar a conta",
  conta: "Criou a conta",
};

export interface FunilConvites {
  disponivel: boolean;
  desde: string | null;
  dias: number;
  etapas: Record<EtapaConvite, number>;
  faltou: { campo: string; texto: string; n: number }[];
  erros: { em: string; mensagem: string }[];
  ultimos: { nome: string; enviadoEm: string; aberturas: number; etapa: string; texto: string; ultimoPasso: string | null }[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : 0;
};
const txt = (v: unknown) => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));

export function comoFunilConvites(v: unknown): FunilConvites {
  let j: unknown = v;
  if (typeof v === "string") {
    try {
      j = JSON.parse(v);
    } catch {
      j = null;
    }
  }
  const o = obj(j);
  const e = obj(o.etapas);
  const etapas = Object.fromEntries(ETAPAS_CONVITE.map((x) => [x.id, num(e[x.id])])) as Record<EtapaConvite, number>;
  return {
    disponivel: j !== null && typeof j === "object" && "etapas" in o,
    desde: txt(o.desde) || null,
    dias: num(o.dias) || 30,
    etapas,
    faltou: arr(o.faltou)
      .map((x) => obj(x))
      .map((x) => ({ campo: txt(x.campo), texto: CAMPO_TEXTO[txt(x.campo)] ?? txt(x.campo), n: num(x.n) }))
      .filter((x) => x.campo && x.n > 0)
      .sort((a, b) => b.n - a.n),
    erros: arr(o.erros)
      .map((x) => obj(x))
      .map((x) => ({ em: txt(x.em), mensagem: txt(x.mensagem).slice(0, 200) }))
      .filter((x) => x.mensagem),
    ultimos: arr(o.ultimos)
      .map((x) => obj(x))
      .map((x) => ({
        nome: txt(x.nome) || "Lead sem nome",
        enviadoEm: txt(x.enviado_em),
        aberturas: num(x.aberturas),
        etapa: txt(x.etapa) || "enviado",
        texto: PAROU_TEXTO[txt(x.etapa)] ?? txt(x.etapa),
        ultimoPasso: txt(x.ultimo_passo) || null,
      })),
  };
}

/** Maior queda entre duas etapas seguidas (onde mais gente desiste), ou null sem dados. */
export function maiorQueda(f: FunilConvites): { de: string; para: string; perderam: number; pct: number } | null {
  let pior: { de: string; para: string; perderam: number; pct: number } | null = null;
  for (let i = 1; i < ETAPAS_CONVITE.length; i++) {
    const antes = f.etapas[ETAPAS_CONVITE[i - 1].id];
    const depois = f.etapas[ETAPAS_CONVITE[i].id];
    if (antes <= 0) continue;
    const perderam = Math.max(0, antes - depois);
    const pct = Math.round((perderam / antes) * 100);
    if (perderam > 0 && (!pior || perderam > pior.perderam || (perderam === pior.perderam && pct > pior.pct))) {
      pior = { de: ETAPAS_CONVITE[i - 1].rotulo, para: ETAPAS_CONVITE[i].rotulo, perderam, pct };
    }
  }
  return pior;
}
