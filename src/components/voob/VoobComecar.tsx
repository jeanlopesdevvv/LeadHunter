"use client";

import {
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  FlaskConical,
  MessageCircleQuestion,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Users,
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
import { filtroDoPerfil, mudancasDoFiltro, ROTULO_FILTRO_SITE, SEGMENTOS } from "@/lib/voob/regras";
import type { ConfigVoob, FiltroSite, QuemResponde } from "@/lib/voob/tipos";

import { Chip, Etiqueta, Nota, quando, type Situacao } from "./comum";
import { CamposMarca, type DadosMarca } from "./CriarEmpresa";
import { SeloMarca } from "./marca";
import { PreviaDoModelo } from "./ModelosEmpresa";

/**
 * Primeiros passos (13/11/2026, white label): os 6 passos de toda empresa, os mesmos para qualquer uma (a Voob também).
 *   1 a empresa (nome, cor, logo) · 2 o WhatsApp oficial · 3 a 1ª mensagem · 4 quem responde · 5 o que buscar ·
 *   6 o teste no próprio número e ligar.
 * Cada passo mostra a situação REAL (lida do Voob CRM) e resolve ali mesmo o que dá.
 */

type Erro = { mensagem: string; status: number } | null;
type Salvar = (mudancas: Record<string, unknown>, ok?: string) => Promise<boolean>;

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

// ---------------------------------------------------------------- 1) a empresa

function PassoEmpresa({ empresa, cfg, salvar }: { empresa: Empresa; cfg: ConfigVoob | null; salvar: Salvar }) {
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
    <Passo n={1} titulo="A empresa" situacao="pronto" icone={Users}>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <SeloMarca empresa={{ ...empresa, logo: e?.logo ?? empresa.logo }} className="size-10" />
        <div className="min-w-0">
          <p className="font-semibold text-ink">{e?.nome ?? empresa.nome}</p>
          <p className="text-xs">
            {e?.conta ? <>Conta do Voob CRM: {e.conta}</> : "Conta do Voob CRM ainda não definida"} · quem fala: {e?.agente ?? empresa.agente}
          </p>
        </div>
        <Button variant="outline" size="sm" icon={<Pencil className="size-3.5" />} onClick={abrir} disabled={!cfg}>
          Editar
        </Button>
      </div>
      <Modal open={aberto} onClose={() => setAberto(false)} title="A empresa" wide>
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
          <p>Escolha o número oficial que vai mandar a 1ª mensagem. Ele pode continuar sendo usado em outro sistema (ManyChat, por exemplo).</p>
          {disponiveis.length > 0 && (
            <ul className="mt-3 space-y-2">
              {disponiveis.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ring-line">
                  <span>
                    <b className="text-ink">{d.nome}</b>, final {d.final} · {d.status === "conectado" ? "conectado" : d.status}
                  </span>
                  <Button size="sm" onClick={() => void salvar({ canal_id: d.id }, "Número escolhido.")}>
                    Usar este
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
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

function PassoMensagem({ cfg, onIr }: { cfg: ConfigVoob | null; onIr: (v: View) => void }) {
  const abertura = cfg?.modelos.abertura ?? null;
  const modelo = (cfg?.modelos_conta ?? []).find((m) => m.nome === abertura?.nome) ?? null;
  const motivo = abertura?.motivo === "modelo_em_analise" ? "Na análise da Meta" : abertura?.ok ? undefined : cfg?.numero ? "Falta escolher" : "Depois do número";
  return (
    <Passo n={3} titulo="A 1ª mensagem" situacao={abertura?.ok ? "pronto" : abertura?.motivo === "modelo_em_analise" ? "rascunho" : "falta"} rotulo={motivo} icone={MessageCircleQuestion}>
      {!cfg?.numero ? (
        <p>A 1ª mensagem é um modelo aprovado pela Meta no número da empresa. Escolha o número antes.</p>
      ) : modelo ? (
        <>
          <p>
            “{modelo.titulo}”{abertura?.ok ? ", aprovado pela Meta." : abertura?.motivo === "modelo_em_analise" ? ", esperando a Meta aprovar (costuma ser rápido)." : "."}
          </p>
          <div className="mt-3 max-w-md">
            <PreviaDoModelo modelo={modelo} agente={cfg.empresa.agente} />
          </div>
        </>
      ) : (
        <p>Escolha um modelo pronto do número ou crie um (a IA ajuda a escrever). A Meta aprova antes do primeiro envio.</p>
      )}
      {cfg?.numero && (
        <Button variant="outline" size="sm" className="mt-4" onClick={() => onIr("modelos")} icon={<ArrowRight className="size-3.5" />}>
          {modelo ? "Trocar ou criar outro" : "Escolher ou criar o modelo"}
        </Button>
      )}
    </Passo>
  );
}

// ---------------------------------------------------------------- 4) quem responde

function PassoResponde({ cfg, salvar }: { cfg: ConfigVoob | null; salvar: Salvar }) {
  const atual: QuemResponde = cfg?.empresa.responde ?? "ia";
  const [sistema, setSistema] = useState(cfg?.empresa.responde_sistema ?? "");
  const iaNoNumero = cfg?.numero?.ia_ativa;
  const escolher = (r: QuemResponde) => void salvar({ responde: r, ...(r === "outro" ? { responde_sistema: sistema.trim() || "ManyChat" } : {}) }, "Salvo.");
  return (
    <Passo n={4} titulo="Quem responde" situacao={cfg?.empresa.responde ? "pronto" : "falta"} icone={Bot}>
      <p>Quem conversa com quem responder à 1ª mensagem. O Radar conta as respostas em qualquer um dos casos.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {(Object.keys(ROTULO_RESPONDE) as QuemResponde[]).map((r) => (
          <button
            key={r}
            type="button"
            disabled={!cfg}
            onClick={() => escolher(r)}
            aria-pressed={atual === r}
            className={cx(
              "rounded-xl px-3 py-2.5 text-left text-sm ring-1 transition",
              atual === r ? "bg-brand-50 font-semibold text-brand-700 ring-brand-200" : "text-ink ring-line hover:bg-strong/[0.03]",
            )}
          >
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
      {cfg?.numero && atual === "ia" && iaNoNumero === false && <Nota>A IA está desligada neste número no Voob CRM. Ligue lá (WhatsApp › IA) antes do primeiro disparo.</Nota>}
      {atual === "outro" && (
        <Nota>No {sistema.trim() || "ManyChat"}, a conversa aparece começando pela resposta da pessoa (a 1ª mensagem saiu pelo Radar). Vale criar lá um fluxo para os botões da mensagem.</Nota>
      )}
    </Passo>
  );
}

// ---------------------------------------------------------------- 5) o que buscar

function PassoBusca({ cfg, salvar, onIr }: { cfg: ConfigVoob | null; salvar: Salvar; onIr: (v: View) => void }) {
  const perfil = cfg?.empresa.perfil ?? {};
  const [cidade, setCidade] = useState(perfil.cidade ?? "Belo Horizonte, MG");
  const [termos, setTermos] = useState<string[]>(perfil.termos_extras ?? []);
  const [segmentos, setSegmentos] = useState<string[]>(perfil.segmentos ?? []);
  const [novo, setNovo] = useState("");
  const [filtro, setFiltro] = useState<FiltroSite>(filtroDoPerfil(perfil));
  const [salvando, setSalvando] = useState(false);
  const temAlgo = termos.length > 0 || segmentos.length > 0;
  const add = () => {
    const t = novo.trim().replace(/\s+/g, " ").toLowerCase();
    if (t.length >= 3 && !termos.includes(t)) setTermos([...termos, t]);
    setNovo("");
  };
  const gravar = async () => {
    setSalvando(true);
    const m = mudancasDoFiltro({ ...perfil, cidade: cidade.trim() || "Belo Horizonte, MG", termos_extras: termos, segmentos }, filtro);
    await salvar(m, "Busca salva.");
    setSalvando(false);
  };
  return (
    <Passo n={5} titulo="O que buscar" situacao={temAlgo && (cfg?.base_pronta ?? 0) > 0 ? "pronto" : "falta"} rotulo={temAlgo ? ((cfg?.base_pronta ?? 0) > 0 ? undefined : "Base vazia") : "Falta escolher"} icone={Search}>
      <p>O ramo e a cidade que o Radar procura no Google. Quem já é contato da conta no Voob CRM fica de fora sozinho.</p>
      <div className="mt-3 space-y-3">
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
            <input className={cx(inputClass, "h-8 w-48 rounded-full py-1 text-xs")} value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Ramo (ex.: pizzaria) + Enter" />
          </form>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs">Atalhos:</span>
          {SEGMENTOS.map((s) => (
            <Chip key={s.id} ativo={segmentos.includes(s.id)} onClick={() => setSegmentos(segmentos.includes(s.id) ? segmentos.filter((x) => x !== s.id) : [...segmentos, s.id])} title={s.termos.join(", ")}>
              {s.nome}
            </Chip>
          ))}
        </div>
        <Field label="Cidade">
          <input className={cx(inputClass, "max-w-sm")} value={cidade} onChange={(e) => setCidade(e.target.value)} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-semibold text-ink">Site</p>
          <div className="grid gap-2 sm:grid-cols-3">
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
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={gravar} loading={salvando} disabled={!cfg}>
            Salvar a busca
          </Button>
          <Button size="sm" variant="outline" onClick={() => onIr("buscar")} icon={<ArrowRight className="size-3.5" />}>
            Buscar agora
          </Button>
        </div>
        {cfg && (
          <p className="text-xs">
            Na base agora: <b className="text-ink">{cfg.base_pronta}</b> para chamar. A busca automática (em Disparo) enche a base sozinha nos dias de envio.
          </p>
        )}
      </div>
    </Passo>
  );
}

// ---------------------------------------------------------------- 6) teste e primeiro disparo

function PassoTeste({ cfg, onCfg, onIr }: { cfg: ConfigVoob | null; onCfg: (c: ConfigVoob) => void; onIr: (v: View) => void }) {
  const toast = useToast();
  const [telefone, setTelefone] = useState("");
  const [indo, setIndo] = useState(false);
  const teste = cfg?.empresa.teste ?? null;
  const pronto = Boolean(cfg?.numero && cfg.modelos.abertura?.ok);
  const ligado = Boolean(cfg?.empresa.ligado);
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
    <Passo n={6} titulo="Teste e primeiro disparo" situacao={ligado && !teste ? "pronto" : teste ? "rascunho" : "falta"} rotulo={ligado && !teste ? "Ligado" : teste ? "Testando" : undefined} icone={FlaskConical}>
      {!pronto ? (
        <p>Com o número e a 1ª mensagem aprovada, mande um teste para o seu celular antes de ligar de verdade.</p>
      ) : teste ? (
        <>
          <p>
            Teste ligado para o celular final <b className="text-ink">{teste.final}</b> desde {quando(teste.desde)}. Só ele recebe mensagens automáticas deste número
            enquanto o teste estiver ligado.
            {cfg?.hoje.no_horario === false && cfg.hoje.proxima_abertura && <> Fora do horário: sai {quando(cfg.hoje.proxima_abertura)}.</>}
          </p>
          <Button size="sm" variant="outline" className="mt-3" loading={indo} onClick={() => void mandar(false)}>
            Encerrar o teste
          </Button>
        </>
      ) : (
        <>
          <p>
            {ligado
              ? `Ligado: até ${cfg?.empresa.limite_dia ?? 20} mensagens por dia, no horário do Disparo. Para testar de novo, desligue no Disparo.`
              : `A mensagem vai só para o seu celular, igual vai chegar para as empresas. Depois é só encerrar o teste e ligar com ${cfg?.empresa.limite_dia ?? 20} por dia.`}
          </p>
          {!ligado && (
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
              <Button size="sm" type="submit" loading={indo} disabled={telefone.replace(/\D/g, "").length < 10}>
                Mandar o teste para mim
              </Button>
            </form>
          )}
          <Button size="sm" variant={ligado ? "outline" : "ghost"} className="mt-3" onClick={() => onIr("disparo")} icon={<ArrowRight className="size-3.5" />}>
            {ligado ? "Ver o disparo" : "Ligar no Disparo"}
          </Button>
        </>
      )}
    </Passo>
  );
}

// ---------------------------------------------------------------- a tela

export function VoobComecar({
  empresa,
  cfg,
  erro,
  onIr,
  onRecarregar,
  onCfg,
}: {
  empresa: Empresa;
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
    true,
    Boolean(cfg?.numero?.conectado),
    Boolean(cfg?.modelos.abertura?.ok),
    Boolean(cfg?.empresa.responde),
    Boolean(((perfil?.termos_extras?.length ?? 0) > 0 || (perfil?.segmentos?.length ?? 0) > 0) && (cfg?.base_pronta ?? 0) > 0),
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
            <h1 className="display mt-3 text-3xl sm:text-4xl">Primeiros passos</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
              O Radar acha empresas no Google, manda a 1ª mensagem pelo WhatsApp oficial da {empresa.nome} e quem responde vai para o atendimento. Estes são
              os passos até o primeiro disparo.
            </p>
          </div>
          <RadarSweep ativo pontos={9} tamanho={96} className="hidden ring-1 ring-white/10 sm:block" />
        </div>
        <div className="mt-6">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-white/80">{feitos} de 6 prontos</span>
            <button type="button" onClick={onRecarregar} className="inline-flex items-center gap-1 text-xs text-white/50 transition hover:text-white">
              <RefreshCw className="size-3" /> conferir de novo
            </button>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="barra-cresce h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (feitos / 6) * 100)}%` }} />
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
        <PassoEmpresa empresa={empresa} cfg={cfg} salvar={salvar} />
        <PassoWhatsApp cfg={cfg} salvar={salvar} onCfg={onCfg} onRecarregar={onRecarregar} />
        <PassoMensagem cfg={cfg} onIr={onIr} />
        <PassoResponde key={`r-${cfg?.empresa.updated_at ?? ""}`} cfg={cfg} salvar={salvar} />
        <PassoBusca key={`b-${cfg ? "ok" : "sem"}`} cfg={cfg} salvar={salvar} onIr={onIr} />
        <PassoTeste cfg={cfg} onCfg={onCfg} onIr={onIr} />
      </ol>
    </div>
  );
}
