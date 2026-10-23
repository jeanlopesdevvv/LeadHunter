"use client";

import { AlertTriangle, Check, Copy, MessageSquarePlus, Plus, RefreshCw, Search, Send, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PreviaWhatsApp } from "@/components/dashboard/ModeloWhatsApp";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Modal, Toggle, cx, inputClass } from "@/components/ui";
import {
  CONTAS,
  LIMITES,
  RASCUNHO_VAZIO,
  comandoTemplate,
  contaDaCaixa,
  ehProspeccao,
  nomeTecnico,
  rascunhoComoTemplate,
  statusDoModelo,
  validarRascunho,
  type BotaoRascunho,
  type ContaWhatsApp,
  type RascunhoModelo,
} from "@/lib/modelos-regras";
import { EXEMPLO, analisarTemplate, dadosDoContato, type ModeloWhatsApp } from "@/lib/templates-regras";

/**
 * Aba "Modelos" (Dashboard App do Chatwoot, em /chatwoot/modelos; também abre direto no Radar).
 * O Chatwoot manda a conversa aberta por postMessage ("appContext"): com ela, a aba já escolhe a conta
 * (caixa 2 = Carol, 6 = Sofia) e oferece enviar o modelo para o contato.
 */

interface ModeloDaConta extends ModeloWhatsApp {
  id: string;
  recusa: string;
}
interface ListaDaConta {
  conta: ContaWhatsApp;
  configurado: boolean;
  modelos: ModeloDaConta[];
  erro: string;
  chatwootLigado: boolean;
}
interface Contexto {
  conversa: number;
  caixa: number;
  nome: string;
  telefone: string;
}

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
  const conversa = Number(c.id);
  if (!Number.isInteger(conversa) || conversa <= 0) return null;
  return { conversa, caixa: Number(c.inbox_id), nome: String(contato.name ?? ""), telefone: String(contato.phone_number ?? "") };
}

const CATEGORIAS = [
  { value: "MARKETING" as const, label: "Marketing", hint: "Prospecção, ofertas, retomada de conversa. Custa mais por conversa." },
  { value: "UTILITY" as const, label: "Utilidade", hint: "Aviso de algo que a pessoa já pediu ou usa (agendamento, cadastro). Sem promoção." },
];

async function lerJson<T>(res: Response): Promise<T & { erro?: string }> {
  return (await res.json().catch(() => ({}))) as T & { erro?: string };
}

export function ModelosChatwoot() {
  const toast = useToast();
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [conta, setConta] = useState<ContaWhatsApp>("carol");
  const [aba, setAba] = useState<"lista" | "novo">("lista");
  const [lista, setLista] = useState<ListaDaConta | null>(null);
  const [erroLista, setErroLista] = useState<{ conta: ContaWhatsApp; msg: string } | null>(null);
  const [versao, setVersao] = useState(0);
  const [recarregando, setRecarregando] = useState(false);
  const [semSessao, setSemSessao] = useState(false);

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

  // Lista da conta escolhida (de novo a cada "Atualizar" ou depois de criar um modelo).
  useEffect(() => {
    let vivo = true;
    fetch(`/api/modelos?conta=${conta}`, { cache: "no-store" })
      .then(async (res) => {
        if (!vivo) return;
        if (res.status === 401) return setSemSessao(true);
        const j = await lerJson<ListaDaConta>(res);
        if (!vivo) return;
        if (!res.ok) return setErroLista({ conta, msg: j.erro || "Não foi possível ler os modelos." });
        setLista(j);
        setErroLista(null);
      })
      .catch((e: Error) => {
        if (vivo) setErroLista({ conta, msg: e.message || "Não foi possível ler os modelos." });
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

  if (semSessao) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="text-sm text-muted">Para usar os modelos, entre no Radar (a mesma senha do Radar).</p>
        <a className="mt-4 inline-flex h-10 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white" href="/login?next=%2Fchatwoot%2Fmodelos">
          Entrar no Radar
        </a>
      </main>
    );
  }

  const contaDaConversa = contexto ? contaDaCaixa(contexto.caixa) : null;

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-bold text-ink">
            <MessageSquarePlus className="size-5 text-brand" /> Modelos do WhatsApp
          </h1>
          <p className="text-xs text-muted">
            {contexto ? (
              <>
                <UserRound className="mr-1 inline size-3.5" />
                Conversa com <b className="text-ink">{contexto.nome || contexto.telefone || "contato"}</b>
                {contaDaConversa ? ` · caixa da ${contaDaConversa === "carol" ? "Carol" : "Sofia"}` : " · caixa sem modelos (nem Carol, nem Sofia)"}
              </>
            ) : (
              "Abra pela aba Modelos de uma conversa no Chatwoot para enviar ao contato."
            )}
          </p>
        </div>
        <div className="flex rounded-xl border border-line bg-card p-0.5 text-sm" role="tablist" aria-label="Conta do WhatsApp">
          {(Object.keys(CONTAS) as ContaWhatsApp[]).map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={conta === c}
              onClick={() => setConta(c)}
              className={cx("rounded-lg px-3 py-1.5 font-semibold transition", conta === c ? "bg-brand text-white" : "text-muted hover:text-ink")}
            >
              {c === "carol" ? "Carol" : "Sofia"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex gap-1 border-b border-line text-sm">
        {(
          [
            ["lista", "Modelos"],
            ["novo", "Novo modelo"],
          ] as const
        ).map(([v, rotulo]) => (
          <button
            key={v}
            type="button"
            onClick={() => setAba(v)}
            className={cx("-mb-px border-b-2 px-3 py-2 font-semibold", aba === v ? "border-brand text-brand-700" : "border-transparent text-muted hover:text-ink")}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "lista" ? (
        <ListaModelos
          conta={conta}
          lista={listaDaConta}
          carregando={carregando}
          erro={erro}
          contexto={contaDaConversa === conta ? contexto : null}
          onAtualizar={recarregar}
          onNovo={() => setAba("novo")}
        />
      ) : (
        <NovoModelo
          key={conta}
          conta={conta}
          onCriado={(nome) => {
            toast(`Modelo "${nome}" enviado para a Meta. O status aparece na lista.`, "success");
            setAba("lista");
            recarregar();
          }}
        />
      )}
    </main>
  );
}

function ListaModelos({
  conta,
  lista,
  carregando,
  erro,
  contexto,
  onAtualizar,
  onNovo,
}: {
  conta: ContaWhatsApp;
  lista: ListaDaConta | null;
  carregando: boolean;
  erro: string;
  contexto: Contexto | null;
  onAtualizar: () => void;
  onNovo: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [enviar, setEnviar] = useState<ModeloDaConta | null>(null);
  const modelos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista?.modelos ?? []).filter((m) => !q || m.nome.includes(q) || m.corpo.toLowerCase().includes(q));
  }, [lista, busca]);
  const dados = contexto?.nome ? dadosDoContato(contexto.nome, "") : EXEMPLO;

  if (lista && !lista.configurado) {
    return (
      <Card className="p-4 text-sm text-muted">
        O Radar ainda não está ligado à Meta para a {conta === "carol" ? "Carol" : "Sofia"} (falta o token META_TOKEN no Radar). Fale com o administrador.
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input className={cx(inputClass, "pl-9")} placeholder="Procurar pelo nome ou pelo texto" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Button variant="outline" onClick={onAtualizar} loading={carregando} icon={<RefreshCw className="size-4" />} aria-label="Atualizar">
          <span className="max-sm:hidden">Atualizar</span>
        </Button>
        <Button onClick={onNovo} icon={<Plus className="size-4" />}>
          <span className="max-sm:hidden">Novo</span>
        </Button>
      </div>

      {(erro || lista?.erro) && (
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {erro || lista?.erro}
        </p>
      )}

      {!lista && carregando && <div className="skeleton h-24 rounded-2xl" />}
      {lista && modelos.length === 0 && !carregando && <p className="py-6 text-center text-sm text-muted">Nenhum modelo{busca ? " com esse texto" : ""}.</p>}

      {modelos.map((m) => {
        const st = statusDoModelo(m.status);
        return (
          <Card key={m.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink" title={m.nome}>
                  {m.nome}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {m.categoria === "UTILITY" ? "Utilidade" : m.categoria === "MARKETING" ? "Marketing" : m.categoria}
                  {st.explica && m.status !== "APPROVED" ? ` · ${st.explica}` : ""}
                </p>
              </div>
              <Badge tone={st.tom}>{st.rotulo}</Badge>
            </div>
            {m.status === "REJECTED" && m.recusa && <p className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800">Motivo da Meta: {m.recusa}</p>}
            <div className="mt-3">
              <PreviaWhatsApp modelo={m} compacta dados={dados} />
            </div>
            {m.status === "APPROVED" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {contexto && lista?.chatwootLigado ? (
                  <Button size="sm" icon={<Send className="size-3.5" />} onClick={() => setEnviar(m)}>
                    Enviar para este contato
                  </Button>
                ) : null}
                <CopiarComando nome={m.nome} />
              </div>
            )}
          </Card>
        );
      })}

      <ConfirmarEnvio conta={conta} contexto={contexto} modelo={enviar} onClose={() => setEnviar(null)} />
    </div>
  );
}

function CopiarComando({ nome }: { nome: string }) {
  const [copiado, setCopiado] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const comando = comandoTemplate(nome, false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        icon={copiado ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(comando);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
          } catch {
            setMostrar(true);
          }
        }}
        title="Cole numa nota privada da conversa"
      >
        {copiado ? "Copiado" : "Copiar comando"}
      </Button>
      {mostrar && <input readOnly className={cx(inputClass, "h-8 py-1 text-xs")} value={comando} onFocus={(e) => e.currentTarget.select()} autoFocus />}
    </>
  );
}

function ConfirmarEnvio({ conta, contexto, modelo, onClose }: { conta: ContaWhatsApp; contexto: Contexto | null; modelo: ModeloDaConta | null; onClose: () => void }) {
  const toast = useToast();
  const [ia, setIa] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const quem = conta === "carol" ? "Carol" : "Sofia";
  if (!modelo || !contexto) return null;
  const enviar = async () => {
    setEnviando(true);
    try {
      const res = await fetch("/api/modelos/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conta, conversa: contexto.conversa, nome: modelo.nome, ia }),
      });
      const j = await lerJson<{ ok?: boolean }>(res);
      if (!res.ok) throw new Error(j.erro || "Não foi possível enviar.");
      toast("Pedido enviado. O resultado aparece como nota na conversa (✅ enviado ou ❌ motivo).", "success");
      onClose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Enviar modelo para o contato?">
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          <b className="text-ink">{modelo.nome}</b> vai para <b className="text-ink">{contexto.nome || contexto.telefone || "o contato desta conversa"}</b> pelo número da {quem}.
        </p>
        <PreviaWhatsApp modelo={modelo} dados={contexto.nome ? dadosDoContato(contexto.nome, "") : EXEMPLO} destacar />
        <Toggle
          checked={ia}
          onChange={setIa}
          label={`Quando o contato responder, a ${quem} (IA) continua`}
          hint="Desligado: a conversa fica com a equipe, e você responde por aqui."
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={enviar} loading={enviando} icon={<Send className="size-4" />}>
            Enviar agora
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NovoModelo({ conta, onCriado }: { conta: ContaWhatsApp; onCriado: (nome: string) => void }) {
  const toast = useToast();
  const [r, setR] = useState<RascunhoModelo>({ ...RASCUNHO_VAZIO, conta });
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const mudar = <K extends keyof RascunhoModelo>(k: K, v: RascunhoModelo[K]) => setR((x) => ({ ...x, [k]: v }));
  const nome = nomeTecnico(r.nome, conta);
  const prospeccao = ehProspeccao(nome);
  const v = validarRascunho(r);
  const previa = analisarTemplate(rascunhoComoTemplate(r));
  const dados = { primeiroNome: r.exemploNome || "João", cidadeTexto: r.exemploCidade || "em Belo Horizonte" };
  const temNome = /\{\{\s*1\s*\}\}/.test(r.corpo);
  const temCidade = /\{\{\s*2\s*\}\}/.test(r.corpo);

  const inserir = (variavel: string) => {
    const el = document.getElementById("modelo-corpo") as HTMLTextAreaElement | null;
    if (!el) return mudar("corpo", r.corpo + variavel);
    const ini = el.selectionStart ?? r.corpo.length;
    const fim = el.selectionEnd ?? ini;
    mudar("corpo", r.corpo.slice(0, ini) + variavel + r.corpo.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + variavel.length, ini + variavel.length);
    });
  };
  const mudarBotao = (i: number, b: Partial<BotaoRascunho>) => mudar("botoes", r.botoes.map((x, j) => (j === i ? { ...x, ...b } : x)));

  const criar = async () => {
    setEnviando(true);
    try {
      const res = await fetch("/api/modelos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(r) });
      const j = await lerJson<{ nome?: string }>(res);
      if (!res.ok) throw new Error(j.erro || "A Meta não aceitou o modelo.");
      setConfirmar(false);
      onCriado(j.nome || nome);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="space-y-4">
        <Field label="Nome do modelo" hint={nome ? `Na Meta: ${nome}` : `Começa com ${CONTAS[conta].prefixo}`} htmlFor="modelo-nome">
          <input id="modelo-nome" className={inputClass} value={r.nome} onChange={(e) => mudar("nome", e.target.value)} placeholder="ex.: retomada 12 meses" maxLength={120} />
        </Field>
        {conta === "carol" && (
          <p className="-mt-2 text-xs text-muted">
            Para usar no disparo do Radar, o nome precisa começar com <b>prospeccao</b> (ex.: prospeccao nova cidade). Só esses podem usar a cidade.
          </p>
        )}

        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Categoria</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {CATEGORIAS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => mudar("categoria", c.value)}
                aria-pressed={r.categoria === c.value}
                className={cx(
                  "rounded-xl border px-3 py-2.5 text-left transition",
                  r.categoria === c.value ? "border-brand bg-brand-50 ring-2 ring-brand/15" : "border-line bg-card hover:border-brand-200",
                )}
              >
                <span className="block text-sm font-bold text-ink">{c.label}</span>
                <span className="block text-xs text-muted">{c.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <Field label="Título (opcional)" hint={`${r.cabecalho.length}/${LIMITES.cabecalho}`} htmlFor="modelo-titulo">
          <input id="modelo-titulo" className={inputClass} value={r.cabecalho} onChange={(e) => mudar("cabecalho", e.target.value)} maxLength={80} placeholder="ex.: Lavacar • Parceria para lava-jatos" />
        </Field>

        <Field label="Texto da mensagem" hint={`${r.corpo.length}/${LIMITES.corpo}`} htmlFor="modelo-corpo">
          <textarea
            id="modelo-corpo"
            className={cx(inputClass, "min-h-36 resize-y leading-relaxed")}
            value={r.corpo}
            onChange={(e) => mudar("corpo", e.target.value)}
            placeholder={"Oi, {{1}}! Aqui é a Carol, do Lavacar. 👋\n\n..."}
          />
        </Field>
        <div className="-mt-2 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => inserir("{{1}}")}>
            + nome do contato
          </Button>
          {prospeccao && (
            <Button size="sm" variant="outline" onClick={() => inserir("{{2}}")}>
              + cidade
            </Button>
          )}
          <span className="self-center text-xs text-muted">*negrito*, _itálico_ e emojis funcionam no texto.</span>
        </div>
        {(temNome || temCidade) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {temNome && (
              <Field label="Exemplo do nome" hint="A Meta pede um exemplo">
                <input className={inputClass} value={r.exemploNome} onChange={(e) => mudar("exemploNome", e.target.value)} maxLength={40} />
              </Field>
            )}
            {temCidade && (
              <Field label="Exemplo da cidade">
                <input className={inputClass} value={r.exemploCidade} onChange={(e) => mudar("exemploCidade", e.target.value)} maxLength={60} />
              </Field>
            )}
          </div>
        )}

        <Field label="Rodapé (opcional)" hint={`${r.rodape.length}/${LIMITES.rodape}`} htmlFor="modelo-rodape">
          <input id="modelo-rodape" className={inputClass} value={r.rodape} onChange={(e) => mudar("rodape", e.target.value)} maxLength={80} placeholder="ex.: Lavacar • Resposta rápida, sem compromisso" />
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Botões (opcional, até {LIMITES.botoes})</p>
          <div className="space-y-2">
            {r.botoes.map((b, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[150px_1fr_auto]">
                <select
                  className={cx(inputClass, "py-2 max-sm:col-span-2")}
                  value={b.tipo}
                  onChange={(e) => mudarBotao(i, { tipo: e.target.value === "link" ? "link" : "resposta" })}
                  aria-label={`Tipo do botão ${i + 1}`}
                >
                  <option value="resposta">Resposta rápida</option>
                  <option value="link">Link</option>
                </select>
                <input className={cx(inputClass, "py-2")} value={b.texto} onChange={(e) => mudarBotao(i, { texto: e.target.value })} maxLength={40} placeholder="Texto do botão" />
                <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-red-600" onClick={() => mudar("botoes", r.botoes.filter((_, j) => j !== i))} aria-label="Tirar botão">
                  <Trash2 className="size-4" />
                </button>
                {b.tipo === "link" && (
                  <input className={cx(inputClass, "col-span-2 py-2 sm:col-start-2")} value={b.url ?? ""} onChange={(e) => mudarBotao(i, { url: e.target.value })} placeholder="https://..." />
                )}
              </div>
            ))}
            {r.botoes.length < LIMITES.botoes && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" icon={<Plus className="size-3.5" />} onClick={() => mudar("botoes", [...r.botoes, { tipo: "resposta", texto: "" }])}>
                  Botão
                </Button>
                {!r.botoes.some((b) => /n[aã]o tenho interesse/i.test(b.texto)) && (
                  <Button size="sm" variant="ghost" onClick={() => mudar("botoes", [...r.botoes, { tipo: "resposta", texto: "Não tenho interesse" }])}>
                    + &quot;Não tenho interesse&quot;
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {(v.erros.length > 0 || v.avisos.length > 0) && r.corpo.trim() !== "" && (
          <div className="space-y-1.5 text-xs">
            {v.erros.map((e) => (
              <p key={e} className="rounded-lg bg-red-50 px-2.5 py-1.5 text-red-800">
                {e}
              </p>
            ))}
            {v.avisos.map((a) => (
              <p key={a} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">
                {a}
              </p>
            ))}
          </div>
        )}

      </div>

      <aside className="space-y-2 lg:sticky lg:top-4 lg:row-span-2 lg:self-start">
        <p className="text-xs font-semibold text-muted">Prévia (como o contato vê)</p>
        {r.corpo.trim() ? <PreviaWhatsApp modelo={previa} dados={dados} destacar /> : <div className="zap-fundo rounded-xl p-6 text-center text-xs text-muted">Escreva o texto para ver a prévia.</div>}
      </aside>

      <div className="flex justify-end lg:col-start-1">
        <Button onClick={() => setConfirmar(true)} disabled={!v.ok} icon={<Send className="size-4" />}>
          Enviar para aprovação
        </Button>
      </div>

      <Modal open={confirmar} onClose={() => setConfirmar(false)} title="Mandar para a aprovação da Meta?">
        <div className="space-y-3 text-sm">
          <p className="text-muted">
            <b className="text-ink">{nome}</b> · {r.categoria === "UTILITY" ? "Utilidade" : "Marketing"} · conta da {conta === "carol" ? "Carol" : "Sofia"}
          </p>
          <PreviaWhatsApp modelo={previa} dados={dados} destacar />
          <p className="text-xs text-muted">
            Depois de enviado, o texto não muda: para corrigir, crie outro com outro nome. A Meta costuma responder em minutos (às vezes em até 24 h), e o
            status aparece na lista.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmar(false)}>
              Voltar
            </Button>
            <Button onClick={criar} loading={enviando} icon={<Send className="size-4" />}>
              Enviar para a Meta
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
