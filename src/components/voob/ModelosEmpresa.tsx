"use client";

import { Archive, ArchiveRestore, Copy, Pencil, Plus, RefreshCw, Sparkles, Star, Type, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import type { View } from "@/components/dashboard/Shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, cx, Field, inputClass, Modal, Segmented } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { EXEMPLO_NEGOCIO } from "@/lib/voob/mensagens";
import type { ConfigVoob, ModeloConta, SituacaoModelo } from "@/lib/voob/tipos";

import { Carregando, Nota, Titulo } from "./comum";

/**
 * Modelos (13/11/2026, white label): as mensagens aprovadas pela Meta no número da empresa. Aqui a pessoa escolhe a 1ª
 * mensagem do Radar, cria (a IA ajuda a escrever), edita, renomeia e arquiva. Criar e editar passam pelo Voob CRM, com o
 * login de quem está usando; renomear muda só o nome que aparece (a Meta não deixa trocar o nome técnico).
 */

interface RespostaModelos {
  modelos: ModeloConta[];
  escolhidos: ConfigVoob["modelos"];
  prefixos: { abertura: string; site: string | null; retomada: string };
  numero: boolean;
  podeCriar: boolean;
  comConta: boolean;
  empresa: string;
  aviso: string | null;
}

/** Os exemplos que vão para a Meta junto com o modelo (a Meta pede um de cada campo). */
const EXEMPLOS: Record<string, string> = { nome_do_negocio: EXEMPLO_NEGOCIO, bairro: "Savassi", cidade: "Belo Horizonte", categoria: "Clínica de estética" };
const MARCAS = [
  { marca: "{Nome do negócio}", dica: "O nome da empresa achada no Google" },
  { marca: "{bairro}", dica: "O bairro dela" },
  { marca: "{cidade}", dica: "A cidade dela" },
  { marca: "{Nome de quem atende}", dica: "Quem fala na mensagem" },
  { marca: "{empresa}", dica: "O nome da sua empresa (entra escrito)" },
];

function situacao(status: string): { rotulo: string; tom: "green" | "amber" | "red" | "gray" } {
  const s = status.toUpperCase();
  if (s === "APPROVED") return { rotulo: "Aprovado", tom: "green" };
  if (s === "PENDING" || s === "IN_APPEAL") return { rotulo: "Em análise", tom: "amber" };
  if (s === "REJECTED") return { rotulo: "Recusado", tom: "red" };
  if (s === "PAUSED") return { rotulo: "Pausado", tom: "amber" };
  return { rotulo: "Indisponível", tom: "gray" };
}

/** O texto do modelo como chega: os campos preenchidos com um exemplo. */
export function textoDeExemplo(corpo: string, agente: string): string {
  return corpo
    .replace(/\{\{\s*(nome|nome_do_negocio|negocio|empresa|1)\s*\}\}/g, EXEMPLO_NEGOCIO)
    .replace(/\{\{\s*atendente\s*\}\}/g, agente)
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => EXEMPLOS[k] ?? `[${k}]`);
}

/** Do jeito que se escreve na tela ({Nome do negócio}) para como vai para a Meta ({{nome_do_negocio}}), só para a prévia. */
function marcasParaMeta(texto: string, empresa: string): string {
  return texto
    .replace(/\{\s*(Nome do contato|nome)\s*\}/gi, "{{nome}}")
    .replace(/\{\s*(Nome de quem atende|atendente)\s*\}/gi, "{{atendente}}")
    .replace(/\{\s*(empresa|Nome da empresa)\s*\}/gi, empresa)
    .replace(/(?<!\{)\{([^{}]+)\}(?!\})/g, (_, k: string) => `{{${k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "")}}}`);
}

/** E o contrário: o texto do modelo para editar. */
function metaParaMarcas(corpo: string): string {
  return corpo
    .replace(/\{\{\s*nome\s*\}\}/g, "{Nome do contato}")
    .replace(/\{\{\s*atendente\s*\}\}/g, "{Nome de quem atende}")
    .replace(/\{\{\s*nome_do_negocio\s*\}\}/g, "{Nome do negócio}")
    .replace(/\{\{\s*(\w+)\s*\}\}/g, "{$1}");
}

export function PreviaDoModelo({ modelo, agente }: { modelo: Pick<ModeloConta, "corpo" | "botoes">; agente: string }) {
  return (
    <div className="rounded-2xl bg-[#e9e3d8] p-3 dark:bg-[#0b141a]">
      <div className="rounded-xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-line text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
        {textoDeExemplo(modelo.corpo ?? "", agente) || "(sem texto)"}
        <span className="block text-right text-[11px] text-[#667781] dark:text-[#8696a0]">09:41</span>
      </div>
      {modelo.botoes.length > 0 && (
        <div className={cx("mt-1.5 grid gap-1.5", modelo.botoes.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {modelo.botoes.map((b) => (
            <span key={b} className="rounded-xl bg-white py-2 text-center text-[13px] font-semibold text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]">
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface Rascunho {
  modelo_id?: string;
  titulo: string;
  categoria: "MARKETING" | "UTILITY";
  texto: string;
  botoes: string[];
}

function Editor({
  aberto,
  inicial,
  empresa,
  agente,
  onFechar,
  onSalvo,
}: {
  aberto: boolean;
  inicial: Rascunho;
  empresa: string;
  agente: string;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const toast = useToast();
  const [r, setR] = useState<Rascunho>(inicial);
  const [pedido, setPedido] = useState("");
  const [escrevendo, setEscrevendo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const previa = useMemo(() => ({ corpo: marcasParaMeta(r.texto, empresa), botoes: r.botoes.filter((b) => b.trim()) }), [r, empresa]);

  const inserir = (marca: string) => setR((x) => ({ ...x, texto: `${x.texto}${x.texto && !x.texto.endsWith(" ") ? " " : ""}${marca}` }));
  const escrever = async () => {
    setErro("");
    setEscrevendo(true);
    try {
      const x = await api<{ texto: string; problemas?: string[] }>("/api/voob/modelos", { acao: "escrever_ia", pedido, categoria: r.categoria });
      setR((v) => ({ ...v, texto: x.texto }));
      if (x.problemas?.length) setErro(x.problemas[0]);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "A IA não respondeu agora.");
    } finally {
      setEscrevendo(false);
    }
  };
  const salvar = async () => {
    setErro("");
    setSalvando(true);
    try {
      const x = await api<{ aviso?: string }>("/api/voob/modelos", {
        acao: r.modelo_id ? "editar" : "criar",
        modelo_id: r.modelo_id,
        titulo: r.titulo,
        categoria: r.categoria,
        texto: r.texto,
        botoes: r.botoes.filter((b) => b.trim()),
        exemplos: EXEMPLOS,
      });
      toast(x.aviso ?? "Modelo mandado para a Meta. A aprovação costuma sair em minutos.", "success");
      onSalvo();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não deu para salvar agora.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal open={aberto} onClose={onFechar} title={r.modelo_id ? "Editar modelo" : "Novo modelo"} wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <Field label="Nome do modelo" hint="Só para vocês acharem depois">
            <input className={inputClass} value={r.titulo} maxLength={60} onChange={(e) => setR({ ...r, titulo: e.target.value })} placeholder="Ex.: Primeira mensagem" />
          </Field>
          <Field label="Para que serve">
            <Segmented<"MARKETING" | "UTILITY">
              value={r.categoria}
              onChange={(c) => setR({ ...r, categoria: c })}
              options={[
                { value: "MARKETING", label: "Marketing", hint: "Prospecção, oferta, novidade" },
                { value: "UTILITY", label: "Aviso", hint: "Algo que a pessoa pediu" },
              ]}
            />
          </Field>
          <div className="rounded-xl bg-strong/[0.03] p-3 ring-1 ring-line">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Sparkles className="size-4 text-brand" /> Escrever com a IA
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input className={cx(inputClass, "h-9 flex-1 py-1.5")} value={pedido} onChange={(e) => setPedido(e.target.value)} placeholder="Ex.: apresentar a clínica e oferecer uma avaliação grátis" />
              <Button size="sm" variant="outline" onClick={escrever} loading={escrevendo} disabled={pedido.trim().length < 5}>
                Escrever
              </Button>
            </div>
          </div>
          <Field label="Texto" hint={`${r.texto.length} de 1.024`}>
            <textarea className={cx(inputClass, "min-h-40 resize-y leading-relaxed")} value={r.texto} maxLength={1024} onChange={(e) => setR({ ...r, texto: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-1.5">
            {MARCAS.map((m) => (
              <button key={m.marca} type="button" title={m.dica} onClick={() => inserir(m.marca)} className="inline-flex items-center gap-1 rounded-full bg-strong/[0.04] px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-line hover:bg-strong/[0.07]">
                <Type className="size-3" /> {m.marca}
              </button>
            ))}
          </div>
          <Field label="Botões" hint="Até 3, com até 25 letras. O 1º é o “sim”, o 2º é o “não”.">
            <div className="space-y-2">
              {r.botoes.map((b, i) => (
                <div key={i} className="flex gap-2">
                  <input className={cx(inputClass, "h-9 py-1.5")} value={b} maxLength={25} onChange={(e) => setR({ ...r, botoes: r.botoes.map((x, j) => (j === i ? e.target.value : x)) })} />
                  <Button variant="ghost" size="sm" aria-label="Tirar o botão" onClick={() => setR({ ...r, botoes: r.botoes.filter((_, j) => j !== i) })} icon={<X className="size-3.5" />} />
                </div>
              ))}
              {r.botoes.length < 3 && (
                <Button variant="ghost" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setR({ ...r, botoes: [...r.botoes, ""] })}>
                  Botão
                </Button>
              )}
            </div>
          </Field>
          {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando} disabled={r.titulo.trim().length < 2 || r.texto.trim().length < 10}>
              Mandar para a Meta
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-bold tracking-wide text-muted uppercase">Como chega</p>
          <PreviaDoModelo modelo={previa} agente={agente} />
          <p className="text-xs text-muted">Comece e termine com texto (a Meta recusa mensagem que começa ou termina com um campo).</p>
        </div>
      </div>
    </Modal>
  );
}

export function ModelosEmpresa({ cfg, onIr, onCfg }: { cfg: ConfigVoob | null; onIr: (v: View) => void; onCfg: (c: ConfigVoob) => void }) {
  const toast = useToast();
  const [r, setR] = useState<RespostaModelos | null>(null);
  const [erro, setErro] = useState("");
  const [arquivados, setArquivados] = useState(false);
  const [editor, setEditor] = useState<Rascunho | null>(null);
  const [renomear, setRenomear] = useState<{ id: string; titulo: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const agente = cfg?.empresa.agente ?? "Atendimento";

  const carregar = useCallback(async () => {
    try {
      setR(await api<RespostaModelos>("/api/voob/modelos"));
      setErro("");
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não deu para ler os modelos agora.");
    }
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(t);
  }, [carregar]);

  const agir = async (id: string, corpo: Record<string, unknown>, ok: string) => {
    setOcupado(id);
    try {
      const x = await api<ConfigVoob | { modelos: ModeloConta[] }>("/api/voob/modelos", corpo);
      if ("empresa" in x) onCfg(x);
      toast(ok, "success");
      await carregar();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu agora.", "error");
    } finally {
      setOcupado(null);
    }
  };

  const escolhido = (m: ModeloConta, s: SituacaoModelo | null | undefined, prefixo: string | null | undefined) =>
    Boolean(prefixo && m.nome.startsWith(prefixo) && (!s?.nome || s.nome === m.nome));
  const lista = (r?.modelos ?? []).filter((m) => arquivados || !m.arquivado);
  const novo = (): Rascunho => ({ titulo: "", categoria: "MARKETING", texto: "", botoes: ["Quero ver", "Não tenho interesse"] });

  return (
    <div className="space-y-6">
      <Titulo titulo="Modelos" texto={<>As mensagens aprovadas pela Meta no número da {cfg?.empresa.nome ?? "empresa"}. A 1ª mensagem do Radar é uma delas.</>}>
        <Button variant="ghost" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={() => void carregar()}>
          Atualizar
        </Button>
        {r?.podeCriar && (
          <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setEditor(novo())}>
            Novo modelo
          </Button>
        )}
      </Titulo>

      {erro && <Nota>{erro}</Nota>}
      {r?.aviso && <Nota>{r.aviso}</Nota>}
      {r && !r.numero && (
        <Card className="p-6">
          <p className="font-semibold text-ink">Escolha o número antes</p>
          <p className="mt-1 text-sm text-muted">Os modelos ficam no número oficial da empresa. Escolha ou conecte o número em Primeiros passos.</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => onIr("comecar")}>
            Ir para os Primeiros passos
          </Button>
        </Card>
      )}
      {r?.numero && !r.comConta && <Nota>Para criar e editar modelos, entre no Radar com a sua conta do Voob CRM (e-mail e senha ou Google).</Nota>}
      {!r && !erro && <Carregando />}

      {r?.numero && (
        <>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} /> Mostrar os arquivados
          </label>
          {lista.length === 0 && (
            <Card className="p-6 text-sm text-muted">Nenhum modelo neste número ainda.{r.podeCriar ? " Crie o primeiro: a IA ajuda a escrever." : ""}</Card>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {lista.map((m, i) => {
              const s = situacao(m.status);
              const eAbertura = escolhido(m, r.escolhidos.abertura, r.prefixos.abertura);
              const eSite = !eAbertura && escolhido(m, r.escolhidos.site, r.prefixos.site);
              return (
                <Card key={m.id} className={cx("entrar flex flex-col p-5", m.arquivado && "opacity-60")} style={{ "--i": i } as CSSProperties}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] font-bold text-strong">{m.titulo}</h2>
                      <p className="text-xs text-muted">{m.categoria === "UTILITY" ? "Aviso" : m.categoria === "MARKETING" ? "Marketing" : m.categoria}</p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {eAbertura && (
                        <Badge tone="brand">
                          <Star className="mr-1 inline size-3" />
                          1ª mensagem
                        </Badge>
                      )}
                      {eSite && <Badge tone="brand">Site desatualizado</Badge>}
                      <Badge tone={s.tom}>{s.rotulo}</Badge>
                    </div>
                  </div>
                  {m.status === "REJECTED" && m.motivo && <p className="mt-2 text-xs text-red-600">Motivo da Meta: {m.motivo}</p>}
                  <div className="mt-3 flex-1">
                    <PreviaDoModelo modelo={m} agente={agente} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {!eAbertura && !m.arquivado && (
                      <Button size="sm" loading={ocupado === m.id} onClick={() => void agir(m.id, { acao: "usar", modelo_id: m.id, para: "abertura" }, "Esta é a 1ª mensagem do Radar agora.")}>
                        Usar como 1ª mensagem
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setRenomear({ id: m.id, titulo: m.titulo })}>
                      Renomear
                    </Button>
                    {r.podeCriar && ["APPROVED", "REJECTED", "PAUSED"].includes(m.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditor({ modelo_id: m.id, titulo: m.titulo, categoria: m.categoria === "UTILITY" ? "UTILITY" : "MARKETING", texto: metaParaMarcas(m.corpo ?? ""), botoes: [...m.botoes] })}
                      >
                        Editar
                      </Button>
                    )}
                    {r.podeCriar && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Copy className="size-3.5" />}
                        onClick={() => setEditor({ titulo: `${m.titulo} (cópia)`.slice(0, 60), categoria: m.categoria === "UTILITY" ? "UTILITY" : "MARKETING", texto: metaParaMarcas(m.corpo ?? ""), botoes: [...m.botoes] })}
                      >
                        Duplicar
                      </Button>
                    )}
                    {!eAbertura && !eSite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={m.arquivado ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                        onClick={() => void agir(m.id, { acao: "arquivar", modelo_id: m.id, arquivar: !m.arquivado }, m.arquivado ? "Modelo de volta na lista." : "Modelo arquivado.")}
                      >
                        {m.arquivado ? "Desarquivar" : "Arquivar"}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          <p className="text-xs text-muted">
            Arquivar só tira da lista (o modelo continua na Meta). Renomear muda o nome que aparece aqui e no Voob CRM; o nome técnico da Meta não muda.
          </p>
        </>
      )}

      {editor && (
        <Editor
          key={editor.modelo_id ?? "novo"}
          aberto
          inicial={editor}
          empresa={r?.empresa ?? cfg?.empresa.nome ?? ""}
          agente={agente}
          onFechar={() => setEditor(null)}
          onSalvo={() => {
            setEditor(null);
            void carregar();
          }}
        />
      )}
      <Modal open={renomear !== null} onClose={() => setRenomear(null)} title="Renomear modelo">
        {renomear && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const x = renomear;
              setRenomear(null);
              void agir(x.id, { acao: "renomear", modelo_id: x.id, titulo: x.titulo }, "Nome trocado.");
            }}
          >
            <input className={inputClass} value={renomear.titulo} maxLength={60} autoFocus onChange={(e) => setRenomear({ ...renomear, titulo: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={() => setRenomear(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={renomear.titulo.trim().length < 2}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
