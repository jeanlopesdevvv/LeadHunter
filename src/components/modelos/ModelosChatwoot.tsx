"use client";

import { ChevronDown, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  CONTAS,
  LIMITES,
  RASCUNHO_VAZIO,
  contaDaCaixa,
  ehProspeccao,
  nomeTecnico,
  statusDoModelo,
  validarRascunho,
  type BotaoRascunho,
  type ContaWhatsApp,
  type RascunhoModelo,
} from "@/lib/modelos-regras";
import { comoChamar, ehBotaoDeSaida, type ModeloWhatsApp } from "@/lib/templates-regras";

/**
 * Aba "Modelos" do Chatwoot (Dashboard App, em /chatwoot/modelos): criar templates do WhatsApp da Carol e da Sofia
 * e acompanhar a aprovação da Meta. Enviar ao cliente é na aba "📤 Enviar Template" (n8n), que já existia.
 * Visual igual ao das outras abas (chatwoot.css). O Chatwoot manda a conversa aberta por postMessage ("appContext"):
 * com ela, a aba abre na conta da caixa (2 = Carol, 6 = Sofia) e a prévia usa o nome do contato.
 */

interface ModeloDaConta extends ModeloWhatsApp {
  id: string;
  recusa: string;
  daAssistente: boolean;
  semEnvio: string;
}
interface ListaDaConta {
  conta: ContaWhatsApp;
  configurado: boolean;
  modelos: ModeloDaConta[];
  erro: string;
}
interface Contexto {
  caixa: number;
  nome: string;
}
type Filtro = "todos" | "APPROVED" | "PENDING" | "REJECTED";

/** Só aceitamos o contexto vindo do nosso Chatwoot. */
const ORIGEM_CHATWOOT = /^https:\/\/chat\.lavacar\.app$/;

function lerContexto(dados: unknown): Contexto | null {
  let d = dados;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  const ev = d as { event?: string; data?: { conversation?: Record<string, unknown>; contact?: Record<string, unknown> } };
  if (ev?.event !== "appContext" || !ev.data?.conversation) return null;
  const c = ev.data.conversation;
  const contato = (ev.data.contact ?? (c.meta as { sender?: Record<string, unknown> } | undefined)?.sender ?? {}) as Record<string, unknown>;
  return { caixa: Number(c.inbox_id), nome: String(contato.name ?? "") };
}

const PERFIL: Record<ContaWhatsApp, { nome: string; papel: string; img: string }> = {
  carol: { nome: "Carol", papel: "Vendas", img: "/chatwoot/carol.png" },
  sofia: { nome: "Sofia", papel: "Suporte", img: "/chatwoot/sofia.png" },
};
const CATEGORIA: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Código" };
const TOM: Record<string, string> = { green: "ok", amber: "at", red: "no", gray: "" };
const grupoStatus = (s: string) => (s === "IN_APPEAL" ? "PENDING" : s);

/** "carol_retomada_12_meses" → "Retomada 12 meses" (os da automação ficam com o nome técnico). */
function amigavel(m: { nome: string; daAssistente: boolean }, conta: ContaWhatsApp): string {
  if (!m.daAssistente) return m.nome;
  const t = m.nome.slice(CONTAS[conta].prefixo.length).replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : m.nome;
}

async function lerJson<T>(res: Response): Promise<T & { erro?: string }> {
  return (await res.json().catch(() => ({}))) as T & { erro?: string };
}

// ---------------------------------------------------------------------------------------------------------------
// Prévia do WhatsApp (mesmo desenho do Enviar Template). Variáveis aparecem destacadas; as que o envio não preenche
// ficam como {{n}}.
// ---------------------------------------------------------------------------------------------------------------
const VAR = /\{\{\s*([\w.]+)\s*\}\}/g;

function formatar(texto: string, chave: string): ReactNode {
  return texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <b key={`${chave}${i}`}>{p.slice(1, -1)}</b>;
    if (/^_[^_]+_$/.test(p)) return <i key={`${chave}${i}`}>{p.slice(1, -1)}</i>;
    return <Fragment key={`${chave}${i}`}>{p}</Fragment>;
  });
}

function comVariaveis(texto: string, valores: Record<string, string>): ReactNode {
  const out: ReactNode[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(VAR)) {
    const ini = m.index ?? 0;
    out.push(<Fragment key={`t${ini}`}>{formatar(texto.slice(ultimo, ini), `t${ini}-`)}</Fragment>);
    const v = valores[m[1]];
    out.push(
      <mark key={`v${ini}`} title={v ? "Muda para cada contato" : "Preenchido pela automação"}>
        {v ?? `{{${m[1]}}}`}
      </mark>,
    );
    ultimo = ini + m[0].length;
  }
  out.push(<Fragment key="fim">{formatar(texto.slice(ultimo), "fim-")}</Fragment>);
  return out;
}

function PreviaZap({ cabecalho, corpo, rodape, botoes, valores }: { cabecalho: string; corpo: string; rodape: string; botoes: string[]; valores: Record<string, string> }) {
  if (!corpo.trim())
    return (
      <div className="cw-zap">
        <div className="vazio">Escreva o texto para ver a prévia.</div>
      </div>
    );
  return (
    <div className="cw-zap">
      <div className="cw-bolha">
        {cabecalho && <div className="cab">{cabecalho}</div>}
        <div>{comVariaveis(corpo, valores)}</div>
        {rodape && <div className="rod">{rodape}</div>}
        <div className="hora">agora</div>
      </div>
      {botoes.filter(Boolean).map((b, i) => (
        <div key={`${b}${i}`} className="cw-btnzap">
          {b}
        </div>
      ))}
    </div>
  );
}

/** O que entra em cada variável na prévia: {{1}} = nome; {{2}} = cidade, só em prospecção. */
function valoresDaPrevia(nomeTec: string, nome: string, cidade = "em Belo Horizonte"): Record<string, string> {
  return { "1": nome ? comoChamar(nome) : "João", ...(ehProspeccao(nomeTec) ? { "2": cidade } : {}) };
}

function Aviso({ tom, ic, titulo, children }: { tom: "info" | "ok" | "at" | "no" | "cz"; ic: string; titulo: ReactNode; children?: ReactNode }) {
  return (
    <div className={`cw-aviso ${tom}`}>
      <span className="ic" aria-hidden>
        {ic}
      </span>
      <span>
        <b>{titulo}</b>
        {children && <p>{children}</p>}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

export function ModelosChatwoot() {
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [conta, setConta] = useState<ContaWhatsApp>("carol");
  const [aba, setAba] = useState<"lista" | "novo">("lista");
  const [lista, setLista] = useState<ListaDaConta | null>(null);
  const [erroLista, setErroLista] = useState<{ conta: ContaWhatsApp; msg: string } | null>(null);
  const [versao, setVersao] = useState(0);
  const [recarregando, setRecarregando] = useState(false);
  const [semSessao, setSemSessao] = useState(false);
  const [criado, setCriado] = useState<{ conta: ContaWhatsApp; nome: string } | null>(null);
  const [base, setBase] = useState<Partial<RascunhoModelo> | null>(null);

  // Contexto do Chatwoot (conversa aberta).
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!ORIGEM_CHATWOOT.test(e.origin)) return;
      const ctx = lerContexto(e.data);
      if (!ctx) return;
      setContexto(ctx);
      const c = contaDaCaixa(ctx.caixa);
      if (c) setConta(c);
    };
    window.addEventListener("message", onMsg);
    if (window.parent !== window) window.parent.postMessage("chatwoot-dashboard-app:fetch-info", "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Lista da conta escolhida (de novo a cada "Atualizar" ou depois de criar um template).
  useEffect(() => {
    let vivo = true;
    fetch(`/api/modelos?conta=${conta}`, { cache: "no-store" })
      .then(async (res) => {
        if (!vivo) return;
        if (res.status === 401) return setSemSessao(true);
        const j = await lerJson<ListaDaConta>(res);
        if (!vivo) return;
        if (!res.ok) return setErroLista({ conta, msg: j.erro || "Não foi possível ler os templates." });
        setLista(j);
        setErroLista(null);
      })
      .catch((e: Error) => {
        if (vivo) setErroLista({ conta, msg: e.message || "Não foi possível ler os templates." });
      })
      .finally(() => {
        if (vivo) setRecarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [conta, versao]);
  const recarregar = () => {
    setRecarregando(true);
    setVersao((v) => v + 1);
  };
  const listaDaConta = lista?.conta === conta ? lista : null;
  const erro = erroLista?.conta === conta ? erroLista.msg : "";
  const carregando = recarregando || (!listaDaConta && !erro);
  const perfil = PERFIL[conta];
  const nomeContato = contexto && contaDaCaixa(contexto.caixa) === conta ? contexto.nome : "";

  if (semSessao) {
    return (
      <main className="cw-main">
        <div className="cw-estado">
          <p>Para criar templates, entre no Radar (a mesma senha do Radar).</p>
          <a className="cw-btn prim" href="/login?next=%2Fchatwoot%2Fmodelos">
            Entrar no Radar
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="cw-main">
      <div className="cw-topo">
        <div className="cw-id">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="cw-av" src={perfil.img} alt="" />
          <div>
            <h1>Templates do WhatsApp</h1>
            <p>
              Número da <b>{perfil.nome}</b> ({perfil.papel.toLowerCase()}) · crie templates e acompanhe a aprovação da Meta
            </p>
          </div>
        </div>
        <div className="cw-contas" role="group" aria-label="Número do WhatsApp">
          {(Object.keys(CONTAS) as ContaWhatsApp[]).map((c) => (
            <button key={c} type="button" className="cw-conta" aria-pressed={conta === c} onClick={() => setConta(c)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PERFIL[c].img} alt="" />
              <span>
                <b>{PERFIL[c].nome}</b>
                <small>{PERFIL[c].papel}</small>
              </span>
            </button>
          ))}
        </div>
      </div>

      <Aviso tom="info" ic="📤" titulo="Para mandar ao cliente, use a aba 📤 Enviar Template da conversa.">
        Aqui você cria templates novos e acompanha a aprovação da Meta.
      </Aviso>

      <div className="cw-abas" role="tablist">
        <button type="button" role="tab" className="cw-aba" aria-selected={aba === "lista"} onClick={() => setAba("lista")}>
          Templates da {perfil.nome}
        </button>
        <button
          type="button"
          role="tab"
          className="cw-aba"
          aria-selected={aba === "novo"}
          onClick={() => {
            setBase(null);
            setAba("novo");
          }}
        >
          + Novo template
        </button>
      </div>

      {aba === "lista" ? (
        <Lista
          conta={conta}
          lista={listaDaConta}
          carregando={carregando}
          erro={erro}
          nomeContato={nomeContato}
          criado={criado?.conta === conta ? criado.nome : ""}
          onAtualizar={recarregar}
          onNovo={(b) => {
            setBase(b);
            setAba("novo");
          }}
        />
      ) : (
        <Novo
          key={`${conta}-${JSON.stringify(base)}`}
          conta={conta}
          base={base}
          nomeContato={nomeContato}
          onCriado={(nome) => {
            setCriado({ conta, nome });
            setAba("lista");
            recarregar();
          }}
        />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------------------------------------------

function Lista({
  conta,
  lista,
  carregando,
  erro,
  nomeContato,
  criado,
  onAtualizar,
  onNovo,
}: {
  conta: ContaWhatsApp;
  lista: ListaDaConta | null;
  carregando: boolean;
  erro: string;
  nomeContato: string;
  criado: string;
  onAtualizar: () => void;
  onNovo: (base: Partial<RascunhoModelo> | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [escolhido, setEscolhido] = useState("");
  const [verAutomacao, setVerAutomacao] = useState(false);

  const todos = useMemo(() => lista?.modelos ?? [], [lista]);
  const daAssistente = todos.filter((m) => m.daAssistente);
  const quantos = (s: string) => daAssistente.filter((m) => grupoStatus(m.status) === s).length;
  const q = busca.trim().toLowerCase();
  const casa = (m: ModeloDaConta) => !q || m.nome.includes(q) || m.corpo.toLowerCase().includes(q);
  const visiveis = daAssistente.filter((m) => casa(m) && (filtro === "todos" || grupoStatus(m.status) === filtro));
  const automacao = todos.filter((m) => !m.daAssistente && casa(m));
  const atual = todos.find((m) => m.nome === (escolhido || criado)) ?? visiveis[0] ?? null;

  if (!lista && carregando)
    return (
      <div className="cw-estado">
        <div className="cw-giro" />
        Carregando os templates…
      </div>
    );
  if (lista && !lista.configurado)
    return (
      <Aviso tom="at" ic="⚠️" titulo="O Radar ainda não está ligado à Meta.">
        Falta o token da Meta (META_TOKEN) no Radar. Fale com o administrador.
      </Aviso>
    );

  const kpi = (f: Filtro, tom: string, rotulo: string, n: number) => (
    <button type="button" className={`cw-kpi ${tom}`} aria-pressed={filtro === f} onClick={() => setFiltro(filtro === f && f !== "todos" ? "todos" : f)}>
      <b>{n}</b>
      <span>
        <i />
        {rotulo}
      </span>
    </button>
  );

  return (
    <>
      {criado && (
        <Aviso tom="ok" ic="✅" titulo={`“${criado}” foi para a análise da Meta.`}>
          Costuma levar minutos (às vezes até 24 h). Clique em Atualizar para ver o status.
        </Aviso>
      )}
      {(erro || lista?.erro) && (
        <Aviso tom="no" ic="⚠️" titulo="Não consegui ler tudo da Meta.">
          {erro || lista?.erro}
        </Aviso>
      )}

      <div className="cw-kpis">
        {kpi("todos", "", "Todos", daAssistente.length)}
        {kpi("APPROVED", "ok", "Aprovados", quantos("APPROVED"))}
        {kpi("PENDING", "at", "Em análise", quantos("PENDING"))}
        {kpi("REJECTED", "no", "Recusados", quantos("REJECTED"))}
      </div>

      <div className="cw-barra">
        <input className="cw-busca" type="search" placeholder="Procurar pelo nome ou pelo texto" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Procurar template" />
        <button type="button" className="cw-btn" onClick={onAtualizar} disabled={carregando}>
          <RefreshCw className={carregando ? "animate-spin" : ""} /> Atualizar
        </button>
        <button type="button" className="cw-btn prim" onClick={() => onNovo(null)}>
          <Plus /> Novo template
        </button>
      </div>

      <div className="cw-grade">
        <section>
          <p className="cw-rotulo">Templates da {PERFIL[conta].nome}</p>
          <div className="cw-lista">
            {visiveis.length === 0 && (
              <div className="cw-vazio">
                Nenhum template {filtro === "todos" ? "" : "nessa situação "}
                {q ? "com esse texto" : ""}.
              </div>
            )}
            {visiveis.map((m) => (
              <ItemLista key={m.id} m={m} conta={conta} ativo={atual?.nome === m.nome} onClick={() => setEscolhido(m.nome)} />
            ))}
          </div>

          {automacao.length > 0 && (
            <>
              <button type="button" className="cw-auto" aria-expanded={verAutomacao} onClick={() => setVerAutomacao((v) => !v)}>
                <span>
                  <b>Da automação ({automacao.length})</b> · avisos para a equipe e lembretes automáticos. Não são para mandar ao cliente.
                </span>
                <ChevronDown />
              </button>
              {verAutomacao && (
                <div className="cw-lista" style={{ marginTop: 8 }}>
                  {automacao.map((m) => (
                    <ItemLista key={m.id} m={m} conta={conta} ativo={atual?.nome === m.nome} onClick={() => setEscolhido(m.nome)} />
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="cw-lado" aria-label="Detalhes do template">
          {atual ? <Detalhes m={atual} conta={conta} nomeContato={nomeContato} onRefazer={onNovo} /> : <div className="cw-vazio">Escolha um template à esquerda.</div>}
        </aside>
      </div>
    </>
  );
}

function ItemLista({ m, conta, ativo, onClick }: { m: ModeloDaConta; conta: ContaWhatsApp; ativo: boolean; onClick: () => void }) {
  const st = statusDoModelo(m.status);
  return (
    <button type="button" className="cw-item" aria-current={ativo} onClick={onClick}>
      <div className="l1">
        <span className="nome">{amigavel(m, conta)}</span>
        <span className={`cw-pill ${TOM[st.tom]}`}>{st.rotulo}</span>
      </div>
      {m.daAssistente && <div className="tec">{m.nome}</div>}
      <div className="resumo">{m.corpo.replace(/\s+/g, " ")}</div>
    </button>
  );
}

function Detalhes({ m, conta, nomeContato, onRefazer }: { m: ModeloDaConta; conta: ContaWhatsApp; nomeContato: string; onRefazer: (b: Partial<RascunhoModelo>) => void }) {
  const status = grupoStatus(m.status);
  const refazer = () =>
    onRefazer({
      nome: `${amigavel(m, conta)} v2`,
      categoria: m.categoria === "UTILITY" ? "UTILITY" : "MARKETING",
      cabecalho: m.cabecalho,
      corpo: m.corpo,
      rodape: m.rodape,
      botoes: m.botoes.map((texto) => ({ tipo: "resposta" as const, texto })),
    });

  let aviso: ReactNode;
  if (!m.daAssistente) {
    aviso = (
      <Aviso tom="cz" ic="⚙️" titulo="Usado só pela automação.">
        Avisos para a equipe ou lembretes automáticos. Não é para mandar ao cliente.
      </Aviso>
    );
  } else if (status === "APPROVED" && !m.semEnvio) {
    aviso = (
      <Aviso tom="ok" ic="✅" titulo="Aprovado pela Meta: pronto para enviar.">
        Na conversa, abra a aba 📤 Enviar Template e escolha este template.
      </Aviso>
    );
  } else if (status === "APPROVED") {
    aviso = (
      <Aviso tom="at" ic="⚠️" titulo="Aprovado, mas não dá para enviar à mão.">
        Motivo: {m.semEnvio}.
      </Aviso>
    );
  } else if (status === "PENDING") {
    aviso = (
      <Aviso tom="at" ic="⏳" titulo="Em análise na Meta.">
        Costuma levar minutos (às vezes até 24 h). Clique em Atualizar para ver se mudou.
      </Aviso>
    );
  } else if (status === "REJECTED") {
    aviso = (
      <Aviso tom="no" ic="❌" titulo={`Recusado pela Meta${m.recusa ? `: ${m.recusa}` : ""}.`}>
        Um template não muda depois de enviado: ajuste o texto e crie outro com nome diferente.{" "}
        <button type="button" className="cw-btn link" onClick={refazer}>
          Corrigir e criar de novo →
        </button>
      </Aviso>
    );
  } else {
    const st = statusDoModelo(m.status);
    aviso = (
      <Aviso tom="cz" ic="ℹ️" titulo={st.rotulo}>
        {st.explica || null}
      </Aviso>
    );
  }

  return (
    <>
      <h2>{amigavel(m, conta)}</h2>
      <div className="sub">{m.nome}</div>
      {aviso}
      <p className="cw-rotulo">Como o contato vê{nomeContato ? ` (${comoChamar(nomeContato)})` : ""}</p>
      <PreviaZap cabecalho={m.cabecalho} corpo={m.corpo} rodape={m.rodape} botoes={m.botoes} valores={m.daAssistente ? valoresDaPrevia(m.nome, nomeContato) : {}} />
      <dl className="cw-kv">
        <dt>Categoria</dt>
        <dd>
          <span className={`cw-pill ${m.categoria === "MARKETING" ? "mk" : ""}`}>{CATEGORIA[m.categoria] ?? m.categoria}</span>
        </dd>
        <dt>Idioma</dt>
        <dd>{m.idioma === "pt_BR" ? "Português (Brasil)" : m.idioma}</dd>
      </dl>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------

const CATEGORIAS = [
  { value: "MARKETING" as const, label: "Marketing", hint: "Prospecção, ofertas, retomada de conversa. Custa mais por conversa." },
  { value: "UTILITY" as const, label: "Utilidade", hint: "Aviso de algo que a pessoa já pediu ou usa (agendamento, cadastro). Sem promoção." },
];

function Contador({ n, max }: { n: number; max: number }) {
  return (
    <small className={n > max ? "no" : n > max * 0.85 ? "at" : ""}>
      {n}/{max}
    </small>
  );
}

function Novo({ conta, base, nomeContato, onCriado }: { conta: ContaWhatsApp; base: Partial<RascunhoModelo> | null; nomeContato: string; onCriado: (nome: string) => void }) {
  const [r, setR] = useState<RascunhoModelo>({ ...RASCUNHO_VAZIO, ...(base ?? {}), conta });
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState("");
  const mudar = <K extends keyof RascunhoModelo>(k: K, v: RascunhoModelo[K]) => {
    setConfirmar(false);
    setR((x) => ({ ...x, [k]: v }));
  };
  const nome = nomeTecnico(r.nome, conta);
  const prospeccao = ehProspeccao(nome);
  const v = validarRascunho(r);
  const temNome = /\{\{\s*1\s*\}\}/.test(r.corpo);
  const temCidade = /\{\{\s*2\s*\}\}/.test(r.corpo);
  const quem = PERFIL[conta].nome;
  const opcional = <span style={{ fontWeight: 500, color: "var(--fraco)" }}> (opcional)</span>;

  const inserir = (variavel: string) => {
    const el = document.getElementById("cw-corpo") as HTMLTextAreaElement | null;
    const ini = el?.selectionStart ?? r.corpo.length;
    const fim = el?.selectionEnd ?? ini;
    mudar("corpo", r.corpo.slice(0, ini) + variavel + r.corpo.slice(fim));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + variavel.length, ini + variavel.length);
    });
  };
  const mudarBotao = (i: number, b: Partial<BotaoRascunho>) => mudar("botoes", r.botoes.map((x, j) => (j === i ? { ...x, ...b } : x)));

  const criar = async () => {
    setEnviando(true);
    setFalha("");
    try {
      const res = await fetch("/api/modelos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
      const j = await lerJson<{ nome?: string }>(res);
      if (!res.ok) throw new Error(j.erro || "A Meta não aceitou o template.");
      onCriado(j.nome || nome);
    } catch (e) {
      setFalha((e as Error).message);
      setConfirmar(false);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="cw-grade">
      <section className="cw-form">
        <div>
          <p className="cw-rotulo">1. Nome e tipo</p>
          <div className="cw-sec">
            <div>
              <label className="cw-campo-l" htmlFor="cw-nome">
                Nome do template
                {nome && <span className="cw-tec">{nome}</span>}
              </label>
              <input id="cw-nome" className="cw-campo" value={r.nome} onChange={(e) => mudar("nome", e.target.value)} placeholder="ex.: retomada 12 meses" maxLength={120} />
              <p className="cw-ajuda">
                Só para a equipe achar depois: o cliente não vê.
                {conta === "carol" && (
                  <>
                    {" "}
                    Para usar no disparo do Radar, comece com <b>prospeccao</b> (ex.: prospeccao nova cidade).
                  </>
                )}
              </p>
            </div>
            <div className="cw-opcoes" role="radiogroup" aria-label="Categoria">
              {CATEGORIAS.map((c) => (
                <button key={c.value} type="button" role="radio" className="cw-opcao" aria-checked={r.categoria === c.value} onClick={() => mudar("categoria", c.value)}>
                  <b>{c.label}</b>
                  <small>{c.hint}</small>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="cw-rotulo">2. Mensagem</p>
          <div className="cw-sec">
            <div>
              <label className="cw-campo-l" htmlFor="cw-titulo">
                <span>Título{opcional}</span>
                <Contador n={r.cabecalho.length} max={LIMITES.cabecalho} />
              </label>
              <input id="cw-titulo" className="cw-campo" value={r.cabecalho} onChange={(e) => mudar("cabecalho", e.target.value)} maxLength={80} placeholder="ex.: Lavacar • Parceria para lava-jatos" />
            </div>
            <div>
              <label className="cw-campo-l" htmlFor="cw-corpo">
                Texto
                <Contador n={r.corpo.length} max={LIMITES.corpo} />
              </label>
              <textarea id="cw-corpo" className="cw-campo" value={r.corpo} onChange={(e) => mudar("corpo", e.target.value)} placeholder={`Oi, {{1}}! Aqui é a ${quem}, do Lavacar. 👋\n\n...`} />
              <div className="cw-chips">
                <button type="button" className="cw-chip" onClick={() => inserir("{{1}}")}>
                  + Nome do contato
                </button>
                {prospeccao && (
                  <button type="button" className="cw-chip" onClick={() => inserir("{{2}}")}>
                    + Cidade
                  </button>
                )}
              </div>
              <p className="cw-ajuda">
                <b>*negrito*</b>, <i>_itálico_</i> e emojis funcionam. O nome do contato entra no lugar de <code>{"{{1}}"}</code>.
              </p>
            </div>
            {(temNome || temCidade) && (
              <div className={temNome && temCidade ? "cw-opcoes" : ""}>
                {temNome && (
                  <div>
                    <label className="cw-campo-l" htmlFor="cw-ex-nome">
                      Exemplo do nome <small>a Meta pede</small>
                    </label>
                    <input id="cw-ex-nome" className="cw-campo" value={r.exemploNome} onChange={(e) => mudar("exemploNome", e.target.value)} maxLength={40} />
                  </div>
                )}
                {temCidade && (
                  <div>
                    <label className="cw-campo-l" htmlFor="cw-ex-cidade">
                      Exemplo da cidade
                    </label>
                    <input id="cw-ex-cidade" className="cw-campo" value={r.exemploCidade} onChange={(e) => mudar("exemploCidade", e.target.value)} maxLength={60} />
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="cw-campo-l" htmlFor="cw-rodape">
                <span>Rodapé{opcional}</span>
                <Contador n={r.rodape.length} max={LIMITES.rodape} />
              </label>
              <input id="cw-rodape" className="cw-campo" value={r.rodape} onChange={(e) => mudar("rodape", e.target.value)} maxLength={80} placeholder="ex.: Lavacar • Resposta rápida, sem compromisso" />
            </div>
          </div>
        </div>

        <div>
          <p className="cw-rotulo">3. Botões (opcional, até {LIMITES.botoes})</p>
          <div className="cw-sec">
            {r.botoes.length === 0 && (
              <p className="cw-ajuda" style={{ margin: 0 }}>
                Sem botões, o cliente responde digitando.
              </p>
            )}
            {r.botoes.map((b, i) => (
              <div key={i} className="cw-botao">
                <select className="cw-campo" value={b.tipo} onChange={(e) => mudarBotao(i, { tipo: e.target.value === "link" ? "link" : "resposta" })} aria-label={`Tipo do botão ${i + 1}`}>
                  <option value="resposta">Resposta rápida</option>
                  <option value="link">Abrir link</option>
                </select>
                <input className="cw-campo" value={b.texto} onChange={(e) => mudarBotao(i, { texto: e.target.value })} maxLength={40} placeholder="Texto do botão" aria-label={`Texto do botão ${i + 1}`} />
                <button type="button" className="cw-x" onClick={() => mudar("botoes", r.botoes.filter((_, j) => j !== i))} aria-label="Tirar botão">
                  <Trash2 size={16} />
                </button>
                {b.tipo === "link" && <input className="cw-campo url" value={b.url ?? ""} onChange={(e) => mudarBotao(i, { url: e.target.value })} placeholder="https://..." aria-label="Link" />}
              </div>
            ))}
            {r.botoes.length < LIMITES.botoes && (
              <div className="cw-chips" style={{ marginTop: 0 }}>
                <button type="button" className="cw-chip" onClick={() => mudar("botoes", [...r.botoes, { tipo: "resposta", texto: "" }])}>
                  + Botão
                </button>
                {!r.botoes.some((x) => ehBotaoDeSaida(x.texto)) && (
                  <button type="button" className="cw-chip" onClick={() => mudar("botoes", [...r.botoes, { tipo: "resposta", texto: "Não tenho interesse" }])}>
                    + “Não tenho interesse” (sai da lista sozinho)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="cw-lado" aria-label="Prévia e envio">
        <p className="cw-rotulo">4. Confira e envie para a Meta</p>
        <PreviaZap
          cabecalho={r.cabecalho.trim()}
          corpo={r.corpo}
          rodape={r.rodape.trim()}
          botoes={r.botoes.map((b) => b.texto.trim())}
          valores={{ "1": r.exemploNome || (nomeContato ? comoChamar(nomeContato) : "João"), ...(prospeccao ? { "2": r.exemploCidade || "em Belo Horizonte" } : {}) }}
        />
        <ul className="cw-checks" aria-live="polite">
          {r.corpo.trim() === "" && r.nome.trim() === "" ? (
            <li className="at">Dê um nome e escreva o texto.</li>
          ) : (
            <>
              {v.erros.map((e) => (
                <li key={e} className="no">
                  ✕ {e}
                </li>
              ))}
              {v.avisos.map((a) => (
                <li key={a} className="at">
                  ! {a}
                </li>
              ))}
              {v.ok && <li className="ok">✓ Tudo certo para mandar à Meta</li>}
            </>
          )}
        </ul>
        {falha && (
          <div style={{ marginTop: 12 }}>
            <Aviso tom="no" ic="❌" titulo="A Meta não aceitou.">
              {falha}
            </Aviso>
          </div>
        )}
        {confirmar ? (
          <div className="cw-confirma">
            <b>Mandar para a aprovação da Meta?</b>
            <p>
              <span className="cw-tec">{nome}</span> · {CATEGORIA[r.categoria]} · número da {quem}. Depois de enviado, o texto não muda (para corrigir, crie
              outro).
            </p>
            <div className="acoes">
              <button type="button" className="cw-btn" onClick={() => setConfirmar(false)} disabled={enviando}>
                Voltar
              </button>
              <button type="button" className="cw-btn prim" onClick={criar} disabled={enviando}>
                {enviando ? <span className="cw-giro" /> : <Send />} Sim, enviar
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="cw-enviar" disabled={!v.ok} onClick={() => setConfirmar(true)}>
            <span className="aviao">
              <Send />
            </span>
            <span className="txt">
              <b>Enviar para aprovação</b>
              <small>
                Número da {quem} · {CATEGORIA[r.categoria]}
              </small>
            </span>
          </button>
        )}
      </aside>
    </div>
  );
}
