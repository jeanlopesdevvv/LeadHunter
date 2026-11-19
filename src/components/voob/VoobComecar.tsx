"use client";

import {
  ArrowRight,
  Bot,
  Check,
  CirclePause,
  CirclePlay,
  ExternalLink,
  FlaskConical,
  MessageCircleQuestion,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { View } from "@/components/dashboard/Shell";
import { RadarSweep } from "@/components/motion";
import { useToast } from "@/components/toast";
import { Button, Card, cx, Field, inputClass, Modal, Segmented } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import {
  abrirJanelaDoFacebook,
  carregarSdkFacebook,
  extrasDaJanela,
  lerMensagemDaJanela,
  sdkFacebookPronto,
  type OpcaoNumero,
  type SessaoJanela,
} from "@/lib/client/facebook";
import type { Empresa } from "@/lib/empresas";
import { ROTULO_RESPONDE } from "@/lib/voob/marca";
import { CIDADE_PADRAO, filtroDoPerfil, mudancasDoFiltro, ROTULO_FILTRO_SITE, SEGMENTOS } from "@/lib/voob/regras";
import type { ConfigVoob, FiltroSite, ModeloConta, QuemResponde } from "@/lib/voob/tipos";

import { Chip, Etiqueta, Nota, quando, type Situacao } from "./comum";
import { CamposMarca, LimitesEmpresa, type DadosMarca } from "./CriarEmpresa";
import { LigarRadar } from "./LigarRadar";
import { SeloMarca } from "./marca";
import { EXEMPLOS, marcasParaMeta, PreviaDoModelo } from "./ModelosEmpresa";

/**
 * Começar (19/11/2026; antes "Primeiros passos", 13/11/2026): 5 passos, os mesmos para qualquer empresa (a Voob também).
 *   1 quem procurar (o que a empresa oferece, o ramo e a cidade) · 2 o WhatsApp oficial (de preferência um número só
 *   para prospecção) · 3 a 1ª mensagem (a IA escreve a partir do que a empresa oferece) · 4 quem responde ·
 *   5 testar e ligar (com o aceite e as mensagens por dia).
 * Cada passo mostra a situação REAL (lida do Voob CRM) e resolve ali mesmo o que dá. Nome, cor e logo ficam num botão
 * no topo (já vêm da conta do Voob CRM).
 */

type Erro = { mensagem: string; status: number } | null;
type Salvar = (mudancas: Record<string, unknown>, ok?: string) => Promise<boolean>;

const TOTAL = 5;

function Passo({
  n,
  titulo,
  situacao,
  rotulo,
  icone: Icone,
  children,
}: {
  n: number;
  titulo: string;
  situacao: Situacao;
  rotulo?: string;
  icone: typeof Check;
  children: ReactNode;
}) {
  return (
    <li className="entrar" style={{ "--i": n } as CSSProperties}>
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span
            className={cx(
              "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
              situacao === "pronto" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-brand-50 text-brand-700 ring-brand-100",
            )}
          >
            {situacao === "pronto" ? <Check className="size-5" /> : <Icone className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-xs font-bold text-muted tabular-nums">{n}</span>
              <h2 className="text-[15.5px] font-bold text-strong">{titulo}</h2>
              <Etiqueta situacao={situacao} texto={rotulo} />
            </div>
            <div className="mt-1.5 text-sm leading-relaxed text-muted">{children}</div>
          </div>
        </div>
      </Card>
    </li>
  );
}

// ---------------------------------------------------------------- nome, cor e logo (botão no topo)

function EditarMarca({ empresa, cfg, salvar }: { empresa: Empresa; cfg: ConfigVoob | null; salvar: Salvar }) {
  const [aberto, setAberto] = useState(false);
  const e = cfg?.empresa;
  const [v, setV] = useState<DadosMarca>({ nome: "", cor: "", logo: null, publico: "", agente: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const abrir = () => {
    setV({ nome: e?.nome ?? empresa.nome, cor: e?.cor ?? empresa.cor, logo: e?.logo ?? empresa.logo ?? null, publico: e?.publico ?? empresa.publico, agente: e?.agente ?? empresa.agente });
    setErro("");
    setAberto(true);
  };
  const gravar = async () => {
    setSalvando(true);
    const ok = await salvar({ nome: v.nome, cor: v.cor, logo: v.logo, publico: v.publico, agente: v.agente });
    setSalvando(false);
    // Nome, cor e logo aparecem no menu inteiro: recarrega a página.
    if (ok) window.location.reload();
  };
  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={!cfg}
        className="inline-flex items-center gap-2 rounded-full bg-white/[0.06] py-1 pr-3 pl-1 text-xs font-semibold text-white/80 ring-1 ring-white/10 transition hover:bg-white/[0.1] hover:text-white disabled:opacity-50"
      >
        <SeloMarca empresa={{ ...empresa, logo: e?.logo ?? empresa.logo }} className="size-6" />
        <Palette className="size-3.5" /> Nome, cor e logo
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Nome, cor e logo" wide>
        <div className="space-y-5">
          <CamposMarca v={v} onV={setV} onErro={setErro} />
          {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={gravar} loading={salvando}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------- 1) quem procurar

function PassoQuem({ cfg, salvar, onIr }: { cfg: ConfigVoob | null; salvar: Salvar; onIr: (v: View) => void }) {
  const perfil = cfg?.empresa.perfil ?? {};
  const [oferta, setOferta] = useState(cfg?.empresa.oferta ?? "");
  const [cidade, setCidade] = useState(perfil.cidade ?? CIDADE_PADRAO);
  const [termos, setTermos] = useState<string[]>(perfil.termos_extras ?? []);
  const [segmentos, setSegmentos] = useState<string[]>(perfil.segmentos ?? []);
  const [novo, setNovo] = useState("");
  const [filtro, setFiltro] = useState<FiltroSite>(filtroDoPerfil(perfil));
  const [salvando, setSalvando] = useState(false);
  const temRamo = termos.length > 0 || segmentos.length > 0;
  const salvo = Boolean(cfg?.empresa.oferta?.trim()) && ((perfil.termos_extras?.length ?? 0) > 0 || (perfil.segmentos?.length ?? 0) > 0);
  const add = () => {
    const t = novo.trim().replace(/\s+/g, " ").toLowerCase();
    if (t.length >= 3 && !termos.includes(t)) setTermos([...termos, t]);
    setNovo("");
  };
  const gravar = async () => {
    // O ramo escrito e ainda sem Enter também vale.
    const t = novo.trim().replace(/\s+/g, " ").toLowerCase();
    const todos = t.length >= 3 && !termos.includes(t) ? [...termos, t] : termos;
    if (todos !== termos) setTermos(todos);
    setNovo("");
    setSalvando(true);
    const m = mudancasDoFiltro({ ...perfil, cidade: cidade.trim() || CIDADE_PADRAO, termos_extras: todos, segmentos }, filtro);
    await salvar({ ...m, oferta: oferta.trim() }, "Salvo.");
    setSalvando(false);
  };
  const podeSalvar = Boolean(cfg) && oferta.trim().length >= 5 && (temRamo || novo.trim().length >= 3);
  return (
    <Passo n={1} titulo="Quem você quer encontrar" situacao={salvo ? "pronto" : "falta"} icone={Search}>
      <p>Conte o que a empresa oferece e para quem. O Radar procura no Google e a IA usa isso para escrever a 1ª mensagem.</p>
      <div className="mt-4 space-y-4">
        <Field label="O que vocês oferecem, numa frase" hint={`${oferta.length} de 200`}>
          <input
            className={inputClass}
            value={oferta}
            maxLength={200}
            onChange={(e) => setOferta(e.target.value)}
            placeholder="Ex.: agenda online para clínicas atenderem mais pelo WhatsApp"
          />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Que tipo de empresa</p>
          <div className="flex flex-wrap gap-1.5">
            {termos.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">
                {t}
                <button type="button" aria-label={`Tirar ${t}`} onClick={() => setTermos(termos.filter((x) => x !== t))}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
            <form
              className="inline-flex"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input
                className={cx(inputClass, "h-8 w-56 rounded-full py-1 text-xs")}
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                placeholder="Ex.: pizzaria, academia + Enter"
                aria-label="Tipo de empresa"
              />
            </form>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="self-center text-xs">Ou escolha:</span>
            {SEGMENTOS.map((s) => (
              <Chip key={s.id} ativo={segmentos.includes(s.id)} onClick={() => setSegmentos(segmentos.includes(s.id) ? segmentos.filter((x) => x !== s.id) : [...segmentos, s.id])} title={s.termos.join(", ")}>
                {s.nome}
              </Chip>
            ))}
          </div>
        </div>
        <Field label="Cidade">
          <input className={cx(inputClass, "max-w-sm")} value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={80} />
        </Field>
        <details className="group rounded-xl ring-1 ring-line">
          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-ink">
            Mais opções <span className="font-normal text-muted">· {ROTULO_FILTRO_SITE[filtro].titulo.toLowerCase()}</span>
          </summary>
          <div className="grid gap-2 px-3 pb-3 sm:grid-cols-3">
            {(Object.keys(ROTULO_FILTRO_SITE) as FiltroSite[]).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={cx("rounded-xl px-3 py-2 text-left ring-1 transition", filtro === f ? "bg-brand-50 ring-brand-200" : "ring-line hover:bg-strong/[0.03]")}
              >
                <span className={cx("block text-sm font-semibold", filtro === f ? "text-brand-700" : "text-ink")}>{ROTULO_FILTRO_SITE[f].titulo}</span>
                <span className="block text-xs">{ROTULO_FILTRO_SITE[f].texto}</span>
              </button>
            ))}
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={gravar} loading={salvando} disabled={!podeSalvar}>
            Salvar
          </Button>
          {salvo && (
            <Button size="sm" variant="ghost" onClick={() => onIr("buscar")} icon={<ArrowRight className="size-3.5" />}>
              Ver quem aparece no Google
            </Button>
          )}
        </div>
        {!podeSalvar && cfg && <p className="text-xs">Escreva o que vocês oferecem e pelo menos um tipo de empresa.</p>}
      </div>
    </Passo>
  );
}

// ---------------------------------------------------------------- 2) o WhatsApp oficial

type ConfigJanela = { pode: boolean; app_id?: string | null; config_id?: string | null; motivo?: string | null; crm: string; simulacao?: boolean };

function PassoWhatsApp({ cfg, salvar, onCfg, onRecarregar }: { cfg: ConfigVoob | null; salvar: Salvar; onCfg: (c: ConfigVoob) => void; onRecarregar: () => void }) {
  const toast = useToast();
  const numero = cfg?.numero ?? null;
  const disponiveis = cfg?.numeros_disponiveis ?? [];
  const ligado = Boolean(cfg?.empresa.ligado);
  // 19/11/2026: o número escolhido também atende os clientes da conta (conversas fora do Radar nos últimos 30 dias)?
  const atende = Boolean(numero && disponiveis.find((d) => d.id === numero.id)?.atende);
  const [janela, setJanela] = useState<ConfigJanela | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [ligando, setLigando] = useState(false);
  const [opcao, setOpcao] = useState<OpcaoNumero>("novo");
  const sessao = useRef<SessaoJanela | null>(null);

  useEffect(() => {
    const ouvir = (ev: MessageEvent) => {
      const s = lerMensagemDaJanela(ev.origin, ev.data);
      if (s) sessao.current = s;
    };
    window.addEventListener("message", ouvir);
    return () => window.removeEventListener("message", ouvir);
  }, []);

  // Prepara a janela da Meta antes do clique (o clique precisa abrir na hora).
  const preparar = async () => {
    setPreparando(true);
    try {
      const c = await api<ConfigJanela>("/api/voob/whatsapp", { acao: "config" });
      if (c.pode && c.app_id) await carregarSdkFacebook(c.app_id);
      setJanela(c);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu para preparar a janela da Meta.", "error");
    } finally {
      setPreparando(false);
    }
  };

  const conectar = () => {
    if (!janela?.config_id || !sdkFacebookPronto()) return;
    sessao.current = null;
    abrirJanelaDoFacebook(janela.config_id, extrasDaJanela(opcao), (codigo) => {
      if (!codigo) return toast("A janela da Meta foi fechada antes de terminar.", "info");
      void (async () => {
        setLigando(true);
        for (let i = 0; i < 20 && !sessao.current?.evento?.startsWith("FINISH"); i++) await new Promise((r) => setTimeout(r, 150));
        const s = sessao.current;
        try {
          onCfg(
            await api<ConfigVoob>("/api/voob/whatsapp", {
              acao: "conectar", code: codigo, evento: s?.evento ?? null, waba_id: s?.waba_id ?? null, phone_number_id: s?.phone_number_id ?? null,
              business_id: s?.business_id ?? null, opcao, pagina: window.location.origin + window.location.pathname,
            }),
          );
          toast("WhatsApp conectado.", "success");
        } catch (e) {
          toast(e instanceof ApiError ? e.message : "Não deu para conectar agora.", "error");
        } finally {
          setLigando(false);
        }
      })();
    });
  };

  const simular = async () => {
    setLigando(true);
    try {
      onCfg(await api<ConfigVoob>("/api/voob/whatsapp", { acao: "simular" }));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu.", "error");
    } finally {
      setLigando(false);
    }
  };

  return (
    <Passo
      n={2}
      titulo="O WhatsApp oficial"
      situacao={numero?.conectado ? "pronto" : "falta"}
      rotulo={numero ? (numero.conectado ? undefined : "Desconectado") : "Falta escolher"}
      icone={Smartphone}
    >
      {numero ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p>
            <b className="text-ink">{numero.nome}</b>, final <b className="text-ink">{numero.final}</b>
            {numero.crm && <> · conta {numero.crm}</>}
            {numero.teste && <> · em teste</>}
          </p>
          <Button variant="ghost" size="sm" disabled={ligado || Boolean(cfg?.empresa.teste)} onClick={() => void salvar({ canal_id: null }, "Número tirado.")} title={ligado ? "Desligue o Radar antes" : undefined}>
            Trocar
          </Button>
        </div>
      ) : (
        <>
          <p>Escolha o WhatsApp oficial que vai mandar a 1ª mensagem.</p>
          {disponiveis.length > 0 && (
            <ul className="mt-3 space-y-2">
              {disponiveis.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ring-line">
                  <span>
                    <b className="text-ink">{d.nome}</b>, final {d.final} · {d.status === "conectado" ? "conectado" : d.status}
                    {d.atende && <span className="ml-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-amber-700 ring-1 ring-amber-200">atende clientes</span>}
                  </span>
                  <Button size="sm" variant={d.atende ? "outline" : "primary"} onClick={() => void salvar({ canal_id: d.id }, "Número escolhido.")}>
                    Usar este
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {(atende || (!numero && disponiveis.some((d) => d.atende))) && (
        <Nota>
          {atende ? "Este número também atende os seus clientes. " : ""}O melhor é um número só para prospecção: se algumas empresas bloquearem as mensagens, a Meta
          limita o número que enviou, e o do atendimento fica protegido.
        </Nota>
      )}
      {!numero && (
        <div className="mt-4 rounded-xl bg-strong/[0.03] p-4 ring-1 ring-line">
          <p className="font-semibold text-ink">{disponiveis.length ? "Ou conectar outro número" : "Conectar o número"}</p>
          {!janela ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={preparar} loading={preparando} icon={<Plus className="size-3.5" />}>
              Conectar pela Meta
            </Button>
          ) : janela.pode ? (
            <div className="mt-3 space-y-3">
              <Segmented<OpcaoNumero>
                value={opcao}
                onChange={setOpcao}
                options={[
                  { value: "novo", label: "Número novo ou já na API" },
                  { value: "celular", label: "O do app WhatsApp Business" },
                ]}
              />
              <Button size="sm" onClick={conectar} loading={ligando} icon={<ExternalLink className="size-3.5" />}>
                Abrir a janela da Meta
              </Button>
              <p className="text-xs">Na janela, entre no Facebook da empresa, escolha a conta e o número. Para um número que já está no ManyChat, escolha a conta e o número que já existem.</p>
            </div>
          ) : janela.simulacao ? (
            <Button size="sm" className="mt-3" onClick={simular} loading={ligando}>
              Simular a conexão (modo de teste)
            </Button>
          ) : (
            <div className="mt-2 space-y-2">
              <p>
                {janela.motivo === "endereco"
                  ? "Neste endereço do Radar a Meta ainda não abre a janela. Conecte pelo Voob CRM (WhatsApp › Conectar o WhatsApp oficial) e volte aqui."
                  : (janela.motivo ?? "O WhatsApp oficial ainda não está liberado para esta conta.")}
              </p>
              <div className="flex flex-wrap gap-2">
                <a href={`${janela.crm}/whatsapp`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-200 bg-card px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50">
                  Abrir o Voob CRM <ExternalLink className="size-3.5" />
                </a>
                <Button variant="ghost" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onRecarregar}>
                  Já conectei
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Passo>
  );
}

// ---------------------------------------------------------------- 3) a 1ª mensagem

const TITULO_MODELO = "1ª mensagem do Radar";
const BOTOES_PADRAO = ["Quero saber mais", "Agora não"];

/** O pedido para a IA escrever a 1ª mensagem, com o que a empresa disse no passo 1. */
function pedidoParaIa(cfg: ConfigVoob): string {
  const p = cfg.empresa.perfil;
  const ramos = [...(p.termos_extras ?? []), ...SEGMENTOS.filter((s) => p.segmentos?.includes(s.id)).map((s) => s.nome.toLowerCase())].slice(0, 6).join(", ");
  return [
    `Primeira mensagem de prospecção da ${cfg.empresa.nome} para ${ramos || "empresas"}${p.cidade ? ` de ${p.cidade}` : ""}, encontradas no Google.`,
    `O que a ${cfg.empresa.nome} oferece: ${cfg.empresa.oferta}.`,
    "Curta, educada, sem cara de propaganda, cita o nome do negócio e termina com uma pergunta simples.",
  ]
    .join(" ")
    .slice(0, 600);
}

function PassoMensagem({
  cfg,
  salvar,
  onCfg,
  onRecarregar,
  onIr,
}: {
  cfg: ConfigVoob | null;
  salvar: Salvar;
  onCfg: (c: ConfigVoob) => void;
  onRecarregar: () => void;
  onIr: (v: View) => void;
}) {
  const toast = useToast();
  const [agente, setAgente] = useState(cfg?.empresa.agente ?? "");
  const abertura = cfg?.modelos.abertura ?? null;
  const modelo = (cfg?.modelos_conta ?? []).find((m) => m.nome === abertura?.nome) ?? null;
  const recusado = modelo?.status?.toUpperCase() === "REJECTED";
  const [texto, setTexto] = useState<string | null>(null);
  const [escrevendo, setEscrevendo] = useState(false);
  const [mandando, setMandando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [erro, setErro] = useState("");
  const oferta = cfg?.empresa.oferta?.trim() ?? "";

  const escrever = async () => {
    if (!cfg) return;
    setErro("");
    setEscrevendo(true);
    try {
      const x = await api<{ texto: string; problemas?: string[] }>("/api/voob/modelos", { acao: "escrever_ia", pedido: pedidoParaIa(cfg), categoria: "MARKETING" });
      setTexto(x.texto);
      if (x.problemas?.length) setErro(x.problemas[0]);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "A IA não respondeu agora.");
    } finally {
      setEscrevendo(false);
    }
  };

  // Manda para a Meta e já deixa como a 1ª mensagem do Radar (sai quando a Meta aprovar).
  const mandar = async () => {
    if (!texto || !cfg) return;
    setErro("");
    setMandando(true);
    try {
      // Quem fala na mensagem ({Nome de quem atende}).
      if (agente.trim() && agente.trim() !== cfg.empresa.agente && !(await salvar({ agente: agente.trim() }))) return;
      const x = await api<{ modelo?: ModeloConta; aviso?: string }>("/api/voob/modelos", {
        acao: "criar", titulo: TITULO_MODELO, categoria: "MARKETING", texto, botoes: BOTOES_PADRAO, exemplos: EXEMPLOS,
      });
      let id = x.modelo?.id ?? null;
      if (!id) {
        const lista = await api<{ modelos: ModeloConta[] }>("/api/voob/modelos");
        id = lista.modelos.filter((m) => m.titulo === TITULO_MODELO).sort((a, b) => b.criado_em.localeCompare(a.criado_em))[0]?.id ?? null;
      }
      if (id) {
        onCfg(await api<ConfigVoob>("/api/voob/modelos", { acao: "usar", modelo_id: id, para: "abertura" }));
        toast("Mandada para a Meta. A aprovação costuma sair em minutos; pode seguir os outros passos.", "success");
        setTexto(null);
      } else {
        toast(x.aviso ?? "Mandada para a Meta. Quando aparecer em Mensagens, toque em Usar.", "success");
        onRecarregar();
      }
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não deu para mandar agora.");
    } finally {
      setMandando(false);
    }
  };

  const conferir = async () => {
    setConferindo(true);
    await api("/api/voob/modelos").catch(() => null);
    onRecarregar();
    setConferindo(false);
  };

  const situacao: Situacao = abertura?.ok ? "pronto" : modelo && !recusado ? "rascunho" : "falta";
  const rotulo = abertura?.ok ? undefined : !cfg?.numero ? "Depois do número" : recusado ? "Recusada pela Meta" : modelo ? "Na análise da Meta" : undefined;
  const [agora] = useState(() => Date.now());
  const nova = modelo && agora - new Date(modelo.criado_em).getTime() < 7 * 86_400_000;

  return (
    <Passo n={3} titulo="A 1ª mensagem" situacao={situacao} rotulo={rotulo} icone={MessageCircleQuestion}>
      {!cfg?.numero ? (
        <p>A mensagem fica no número oficial e a Meta aprova antes do primeiro envio. Conecte o número antes.</p>
      ) : texto !== null ? (
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-3">
            <Field label="A mensagem" hint="Pode mudar o que quiser">
              <textarea className={cx(inputClass, "min-h-36 resize-y leading-relaxed")} value={texto} maxLength={1024} onChange={(e) => setTexto(e.target.value)} />
            </Field>
            <Field label="Quem fala na mensagem" hint="Entra no lugar de {Nome de quem atende}">
              <input className={cx(inputClass, "max-w-xs")} value={agente} maxLength={40} onChange={(e) => setAgente(e.target.value)} placeholder="Ex.: Ana" />
            </Field>
            <p className="text-xs">
              {"{Nome do negócio}"} vira o nome de cada empresa encontrada. Botões: “{BOTOES_PADRAO[0]}” e “{BOTOES_PADRAO[1]}” (quem toca no segundo sai da lista).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={mandar} loading={mandando} disabled={texto.trim().length < 10}>
                Mandar para a Meta aprovar
              </Button>
              <Button size="sm" variant="ghost" onClick={escrever} loading={escrevendo} icon={<Sparkles className="size-3.5" />}>
                Escrever outra
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTexto(null)}>
                Cancelar
              </Button>
            </div>
          </div>
          <PreviaDoModelo modelo={{ corpo: marcasParaMeta(texto, cfg.empresa.nome), botoes: BOTOES_PADRAO }} agente={agente.trim() || cfg.empresa.agente} />
        </div>
      ) : modelo && !recusado ? (
        <>
          <p>
            {abertura?.ok ? "Aprovada pela Meta." : "Esperando a Meta aprovar (costuma levar minutos). Pode seguir os outros passos."}
          </p>
          <div className="mt-3 max-w-md">
            <PreviaDoModelo modelo={modelo} agente={cfg.empresa.agente} />
          </div>
          {abertura?.ok && nova && <Nota>Mensagem nova: nos primeiros dias a Meta pode entregar aos poucos enquanto avalia. É normal e passa sozinho.</Nota>}
          <div className="mt-4 flex flex-wrap gap-2">
            {!abertura?.ok && (
              <Button size="sm" variant="outline" onClick={conferir} loading={conferindo} icon={<RefreshCw className="size-3.5" />}>
                Conferir de novo
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onIr("modelos")} icon={<ArrowRight className="size-3.5" />}>
              Trocar a mensagem
            </Button>
          </div>
        </>
      ) : (
        <>
          {recusado && (
            <p className="mb-2 rounded-xl bg-red-50 px-3 py-2 text-red-700 ring-1 ring-red-200">
              A Meta recusou a mensagem{modelo?.motivo ? ` (${modelo.motivo})` : ""}. Peça outra para a IA, com outras palavras.
            </p>
          )}
          {oferta ? (
            <p>A IA escreve a mensagem a partir do que vocês oferecem: “{oferta}”. Você confere, muda o que quiser e manda para a Meta aprovar.</p>
          ) : (
            <p>Preencha o passo 1 (o que vocês oferecem) e a IA escreve a mensagem para você.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={escrever} loading={escrevendo} disabled={!oferta} icon={<Sparkles className="size-3.5" />}>
              Escrever com a IA
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onIr("modelos")} icon={<ArrowRight className="size-3.5" />}>
              Já tenho uma mensagem aprovada
            </Button>
          </div>
        </>
      )}
      {erro && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erro}</p>}
    </Passo>
  );
}

// ---------------------------------------------------------------- 4) quem responde

function PassoResponde({ cfg, salvar }: { cfg: ConfigVoob | null; salvar: Salvar }) {
  const atual: QuemResponde = cfg?.empresa.responde ?? "ia";
  const [sistema, setSistema] = useState(cfg?.empresa.responde_sistema ?? "");
  const iaNoNumero = cfg?.numero?.ia_ativa;
  const confirmado = Boolean(cfg?.empresa.responde_confirmado);
  const escolher = (r: QuemResponde) => void salvar({ responde: r, ...(r === "outro" ? { responde_sistema: sistema.trim() || "ManyChat" } : {}) }, "Salvo.");
  return (
    <Passo n={4} titulo="Quem responde" situacao={cfg?.empresa.responde_confirmado ? "pronto" : "falta"} rotulo={cfg?.empresa.responde_confirmado ? undefined : "Falta confirmar"} icone={Bot}>
      <p>Quem conversa com as empresas que responderem. Toque na opção certa para confirmar.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(Object.keys(ROTULO_RESPONDE) as QuemResponde[]).map((r) => (
          <button
            key={r}
            type="button"
            disabled={!cfg}
            onClick={() => escolher(r)}
            aria-pressed={confirmado && atual === r}
            className={cx(
              "rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition",
              confirmado && atual === r ? "bg-brand-50 font-semibold text-brand-700 ring-brand-200" : "text-ink ring-line hover:bg-strong/[0.03]",
            )}
          >
            {confirmado && atual === r && <Check className="mr-1 inline size-3.5" />}
            {ROTULO_RESPONDE[r]}
          </button>
        ))}
      </div>
      {atual === "outro" && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Field label="Qual sistema">
            <input className={cx(inputClass, "h-9 py-1.5")} value={sistema} maxLength={40} onChange={(e) => setSistema(e.target.value)} placeholder="ManyChat" />
          </Field>
          <Button size="sm" variant="outline" onClick={() => void salvar({ responde_sistema: sistema.trim() || "ManyChat" }, "Salvo.")}>
            Salvar
          </Button>
        </div>
      )}
      {cfg?.numero && atual === "outro" && iaNoNumero && (
        <Nota>A IA do Voob CRM está ligada neste número. Desligue no CRM para não responderem duas vezes.</Nota>
      )}
      {cfg?.numero && atual === "ia" && iaNoNumero === false && <Nota>A IA está desligada neste número no Voob CRM. Ligue lá (WhatsApp › IA) antes do primeiro envio.</Nota>}
      {atual === "outro" && (
        <Nota>No {sistema.trim() || "ManyChat"}, a conversa aparece começando pela resposta da pessoa (a 1ª mensagem saiu pelo Radar). Vale criar lá um fluxo para os botões da mensagem.</Nota>
      )}
    </Passo>
  );
}

// ---------------------------------------------------------------- 5) testar e ligar

function PassoLigar({ cfg, onCfg, onIr }: { cfg: ConfigVoob | null; onCfg: (c: ConfigVoob) => void; onIr: (v: View) => void }) {
  const toast = useToast();
  const [telefone, setTelefone] = useState("");
  const [indo, setIndo] = useState(false);
  const [janela, setJanela] = useState<null | "ligar" | "desligar">(null);
  const teste = cfg?.empresa.teste ?? null;
  const ligado = Boolean(cfg?.empresa.ligado);
  const faltam = [
    !cfg?.numero?.conectado && "o WhatsApp (passo 2)",
    !cfg?.modelos.abertura?.ok && "a mensagem aprovada (passo 3)",
    !cfg?.empresa.responde_confirmado && "quem responde (passo 4)",
  ].filter(Boolean) as string[];
  const podeTestar = Boolean(cfg?.numero && cfg.modelos.abertura?.ok);
  const mandar = async (ligar: boolean) => {
    setIndo(true);
    try {
      onCfg(await api<ConfigVoob>("/api/voob/teste", { ligar, telefone }));
      toast(ligar ? "Teste ligado: a mensagem sai para o seu número em instantes." : "Teste encerrado.", "success");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu agora.", "error");
    } finally {
      setIndo(false);
    }
  };
  return (
    <Passo
      n={5}
      titulo="Testar e ligar"
      situacao={ligado && !teste ? "pronto" : teste ? "rascunho" : "falta"}
      rotulo={ligado && !teste ? "Ligado" : teste ? "Testando" : faltam.length ? undefined : "Pronto para ligar"}
      icone={FlaskConical}
    >
      {ligado && !teste ? (
        <>
          <p>
            Ligado: até <b className="text-ink">{cfg?.empresa.limite_dia}</b> mensagens por dia, no horário comercial.
            {cfg?.hoje.no_horario === false && cfg.hoje.proxima_abertura && <> Volta a mandar {quando(cfg.hoje.proxima_abertura)}.</>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onIr("disparo")} icon={<ArrowRight className="size-3.5" />}>
              Ver os envios
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setJanela("desligar")} icon={<CirclePause className="size-3.5" />}>
              Desligar
            </Button>
          </div>
        </>
      ) : teste ? (
        <>
          <p>
            Teste ligado para o celular final <b className="text-ink">{teste.final}</b> desde {quando(teste.desde)}. Só ele recebe mensagens deste número enquanto o
            teste estiver ligado.
            {cfg?.hoje.no_horario === false && cfg.hoje.proxima_abertura && <> Fora do horário: sai {quando(cfg.hoje.proxima_abertura)}.</>}
          </p>
          <Button size="sm" variant="outline" className="mt-3" loading={indo} onClick={() => void mandar(false)}>
            Recebi, encerrar o teste
          </Button>
        </>
      ) : faltam.length ? (
        <p>Para ligar, falta {faltam.join(", ").replace(/, ([^,]*)$/, " e $1")}.</p>
      ) : (
        <>
          <p>Mande um teste para o seu celular e veja como chega. Depois é só ligar: o Radar procura as empresas e manda aos poucos, no horário comercial.</p>
          {podeTestar && (
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void mandar(true);
              }}
            >
              <div className="w-52">
                <input className={cx(inputClass, "h-9 py-1.5")} inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(31) 99999-9999" aria-label="Seu celular" />
              </div>
              <Button size="sm" variant="outline" type="submit" loading={indo} disabled={telefone.replace(/\D/g, "").length < 10}>
                Mandar o teste para mim
              </Button>
            </form>
          )}
          <Button className="mt-4" onClick={() => setJanela("ligar")} icon={<CirclePlay className="size-4" />}>
            Ligar o Radar
          </Button>
        </>
      )}
      {cfg && janela && <LigarRadar cfg={cfg} aberto desligar={janela === "desligar"} onFechar={() => setJanela(null)} onCfg={onCfg} />}
    </Passo>
  );
}

// ---------------------------------------------------------------- a tela

export function VoobComecar({
  empresa,
  cfg,
  erro,
  equipe = false,
  onIr,
  onRecarregar,
  onCfg,
}: {
  empresa: Empresa;
  /** Equipe da Voob: vê e muda os limites da empresa. */
  equipe?: boolean;
  cfg: ConfigVoob | null;
  erro: Erro;
  onIr: (v: View) => void;
  onRecarregar: () => void;
  onCfg: (c: ConfigVoob) => void;
}) {
  const toast = useToast();
  const salvar: Salvar = useCallback(
    async (mudancas, ok) => {
      try {
        onCfg(await api<ConfigVoob>("/api/voob/config", { mudancas }));
        if (ok) toast(ok, "success");
        return true;
      } catch (e) {
        toast(e instanceof ApiError ? e.message : "Não deu para salvar agora.", "error");
        return false;
      }
    },
    [onCfg, toast],
  );

  const perfil = cfg?.empresa.perfil;
  const feitos = [
    Boolean(cfg?.empresa.oferta?.trim() && ((perfil?.termos_extras?.length ?? 0) > 0 || (perfil?.segmentos?.length ?? 0) > 0)),
    Boolean(cfg?.numero?.conectado),
    Boolean(cfg?.modelos.abertura?.ok),
    Boolean(cfg?.empresa.responde_confirmado),
    Boolean(cfg?.empresa.ligado && !cfg.empresa.teste),
  ].filter(Boolean).length;
  const ligado = cfg?.empresa.ligado ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="cartao-noite relative overflow-hidden rounded-3xl p-6 text-white ring-1 ring-white/10 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="eyebrow">
              {empresa.nome} · {ligado ? (cfg?.empresa.teste ? "em teste" : "prospectando") : "em preparação"}
            </p>
            <h1 className="display mt-3 text-3xl sm:text-4xl">{ligado && !cfg?.empresa.teste ? "Tudo pronto" : "Começar"}</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
              O Radar encontra empresas no Google, manda a 1ª mensagem pelo WhatsApp oficial da {empresa.nome} e quem responde vai para o atendimento. São{" "}
              {TOTAL} passos.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <EditarMarca empresa={empresa} cfg={cfg} salvar={salvar} />
              {equipe && cfg && <LimitesEmpresa empresa={cfg.empresa.id} cota={cfg.empresa.cota_buscas_mes} envios={cfg.empresa.envios_max_dia} onSalvo={onCfg} />}
            </div>
          </div>
          <RadarSweep ativo pontos={9} tamanho={96} className="hidden ring-1 ring-white/10 sm:block" />
        </div>
        <div className="mt-6">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-white/80">
              {feitos} de {TOTAL} prontos
            </span>
            <button type="button" onClick={onRecarregar} className="inline-flex items-center gap-1 text-xs text-white/50 transition hover:text-white">
              <RefreshCw className="size-3" /> conferir de novo
            </button>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="barra-cresce h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (feitos / TOTAL) * 100)}%` }} />
          </div>
        </div>
      </div>

      {erro && !cfg && (
        <Card className="p-5">
          <p className="text-sm font-semibold text-ink">O Radar não conseguiu ler esta empresa no Voob CRM.</p>
          <p className="mt-1 text-sm text-muted">{erro.mensagem}</p>
        </Card>
      )}

      <ol className="space-y-3">
        <PassoQuem key={`q-${cfg ? "ok" : "sem"}`} cfg={cfg} salvar={salvar} onIr={onIr} />
        <PassoWhatsApp cfg={cfg} salvar={salvar} onCfg={onCfg} onRecarregar={onRecarregar} />
        <PassoMensagem key={`m-${cfg ? "ok" : "sem"}`} cfg={cfg} salvar={salvar} onCfg={onCfg} onRecarregar={onRecarregar} onIr={onIr} />
        <PassoResponde key={`r-${cfg?.empresa.updated_at ?? ""}`} cfg={cfg} salvar={salvar} />
        <PassoLigar cfg={cfg} onCfg={onCfg} onIr={onIr} />
      </ol>
    </div>
  );
}
