"use client";

import { Activity, AlertTriangle, ArrowUpRight, PauseCircle, Pencil, RefreshCw, Save, ScanSearch, ShieldCheck, TrendingUp, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import type { View } from "@/components/dashboard/Shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Toggle, cx, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { limiteMetaTexto } from "@/lib/disparo-regras";
import { avisoDoLimiteVoob, HORARIOS_ROTINA, itensDaSituacaoVoob, quantoPrecisa, segmentosDoPerfil, textoQualidade, validarLimiteVoob } from "@/lib/voob/busca-auto-regras";
import { BAIRROS_BH, CIDADE_PADRAO, filtroDoPerfil, ROTULO_FILTRO_SITE, SEGMENTOS, textoDias } from "@/lib/voob/regras";
import type { ConfigBuscaAuto, ConfigVoob, EstadoBuscaAuto, PerfilBusca, SaudeVoob } from "@/lib/voob/tipos";

import { n, quando } from "./comum";

/**
 * Disparo da Voob, parte 2 (12/11/2026, pedido do Jean): o limite do dia à mão (como no Lavacar), a sugestão de subir
 * depois de 5 dias bons, a saúde do número na Meta (como no Lavacar) e a busca automática que enche a base sozinha.
 */

// ---------------------------------------------------------------- dados (saúde + busca), lidos juntos pela tela Disparo

export interface ResumoBusca {
  estado: EstadoBuscaAuto;
  precisa: number;
  podeGastar: number;
  cotaRestante: number | null;
  cotaLimite: number;
}

export function useAutomatico(chave: string) {
  const [saude, setSaude] = useState<SaudeVoob | null>(null);
  const [busca, setBusca] = useState<ResumoBusca | null>(null);
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    const [s, b] = await Promise.allSettled([api<SaudeVoob>("/api/voob/saude"), api<ResumoBusca>("/api/voob/busca-auto")]);
    if (s.status === "fulfilled") setSaude(s.value);
    if (b.status === "fulfilled") setBusca(b.value);
    const falha = [s, b].find((x) => x.status === "rejected") as PromiseRejectedResult | undefined;
    setErro(falha ? (falha.reason instanceof ApiError ? falha.reason.message : "Não deu para ler tudo agora.") : "");
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(t);
  }, [carregar, chave]);
  return { saude, setSaude, busca, setBusca, erro, carregar };
}

// ---------------------------------------------------------------- limite do dia, à mão

export function LimiteRapido({ cfg, onCfg }: { cfg: ConfigVoob; onCfg: (c: ConfigVoob) => void }) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(cfg.empresa.limite_dia));
  const [salvando, setSalvando] = useState(false);
  const atual = cfg.empresa.limite_dia;
  const v = validarLimiteVoob(valor);
  const aviso = v.ok ? avisoDoLimiteVoob(v.valor, atual) : null;

  const salvar = async () => {
    if (!v.ok) return toast(v.erro, "error");
    setSalvando(true);
    try {
      onCfg(await api<ConfigVoob>("/api/voob/config", { mudancas: { limite_dia: v.valor } }));
      toast(`Limite da prospecção: ${n(v.valor)} ${v.valor === 1 ? "mensagem" : "mensagens"} por dia.`, "success");
      setEditando(false);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu para salvar agora.", "error");
    } finally {
      setSalvando(false);
    }
  };

  if (!editando) {
    return (
      <button
        type="button"
        onClick={() => {
          setValor(String(atual));
          setEditando(true);
        }}
        className="inline-flex items-center gap-1 rounded-md font-semibold text-brand-700 underline-offset-2 hover:underline"
        title="Mudar o limite de mensagens por dia"
      >
        <Pencil className="size-3" /> mudar o limite
      </button>
    );
  }
  return (
    <span className="mt-2 flex w-full flex-col gap-2 rounded-xl bg-surface p-3 ring-1 ring-line">
      <span className="flex flex-wrap items-center gap-2">
        <label htmlFor="voob-limite-rapido" className="text-xs font-semibold text-ink">
          Mensagens por dia
        </label>
        <input
          id="voob-limite-rapido"
          type="number"
          min={1}
          max={250}
          autoFocus
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void salvar()}
          className={cx(inputClass, "h-9 w-24 tabular-nums")}
        />
        <Button size="sm" onClick={() => void salvar()} loading={salvando} disabled={!v.ok || (v.ok && v.valor === atual)} icon={<Save className="size-3.5" />}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditando(false)} icon={<X className="size-3.5" />}>
          Cancelar
        </Button>
      </span>
      {!v.ok && valor.trim() !== "" && <span className="text-xs text-red-600">{v.erro}</span>}
      {aviso && <span className="text-xs text-amber-700 dark:text-amber-300">{aviso}</span>}
    </span>
  );
}

// ---------------------------------------------------------------- sugestão de subir o limite

const CHAVE_ADIADA = "radar-voob-sugestao-adiada";

export function FaixaSugestao({ saude, onCfg, onSaude }: { saude: SaudeVoob | null; onCfg: (c: ConfigVoob) => void; onSaude: () => void }) {
  const toast = useToast();
  const [subindo, setSubindo] = useState(false);
  const [adiada, setAdiada] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_ADIADA) ?? "";
    } catch {
      return "";
    }
  });
  const s = saude?.sugestao;
  if (!s?.pode) return null;
  const marca = `${s.atual}->${s.novo}:${new Date().toISOString().slice(0, 10)}`;
  if (adiada === marca) return null;
  const subir = async () => {
    setSubindo(true);
    try {
      onCfg(await api<ConfigVoob>("/api/voob/config", { mudancas: { limite_dia: s.novo } }));
      toast(`Limite subiu para ${n(s.novo)} por dia.`, "success");
      onSaude();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu para salvar agora.", "error");
    } finally {
      setSubindo(false);
    }
  };
  return (
    <div className="entrar flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center dark:border-emerald-500/30 dark:bg-emerald-500/10" style={{ "--i": 1 } as CSSProperties}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
        <TrendingUp className="size-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-emerald-900 dark:text-emerald-100">
        <b>Sugestão de limite.</b> {s.texto}
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => {
          setAdiada(marca);
          try {
            localStorage.setItem(CHAVE_ADIADA, marca);
          } catch {
            /* sem armazenamento: some só nesta tela */
          }
        }}>
          Agora não
        </Button>
        <Button size="sm" onClick={() => void subir()} loading={subindo} icon={<ArrowUpRight className="size-4" />}>
          Subir para {n(s.novo)}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- saúde do número

function corDa(s: SaudeVoob): { tone: "green" | "amber" | "red" | "gray"; rotulo: string; ponto: string } {
  if (s.freio === "pausado") return { tone: "red", rotulo: "Vermelha", ponto: "bg-red-500" };
  if (s.freio === "metade") return { tone: "amber", rotulo: "Amarela", ponto: "bg-amber-400" };
  if (s.freio === "sem_numero") return { tone: "gray", rotulo: "Sem número", ponto: "bg-slate-400" };
  if (s.freio === "sem_leitura") return { tone: "gray", rotulo: "Sem leitura", ponto: "bg-slate-400" };
  return { tone: "green", rotulo: "Verde", ponto: "bg-emerald-500" };
}

function textoDoFreio(s: SaudeVoob): string {
  if (s.freio === "sem_numero") return "A leitura começa quando o número estiver escolhido. O Voob CRM lê a Meta de hora em hora.";
  if (s.freio === "pausado") return "Disparo pausado até a Meta liberar o número. Ele não volta sozinho: depois que a qualidade melhorar, ligue de novo.";
  if (s.freio === "metade") return `Limite de hoje reduzido de ${n(s.limite_configurado)} para ${n(s.limite_efetivo)} mensagens. Volta ao normal quando a qualidade voltar ao verde.`;
  if (s.freio === "sem_leitura") return `Sem leitura recente da Meta: vale o limite normal (${n(s.limite_configurado)} por dia).`;
  return `Sem freio: vale o limite de ${n(s.limite_configurado)} por dia.`;
}

/** Faixa no topo da tela quando o freio está ligado (como no Lavacar). */
export function AvisoSaudeVoob({ s }: { s: SaudeVoob | null }) {
  if (!s || (s.freio !== "pausado" && s.freio !== "metade")) return null;
  const vermelho = s.freio === "pausado";
  return (
    <div className={cx("flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm", vermelho ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900")}>
      {vermelho ? <PauseCircle className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      <span>
        <b>{vermelho ? "O número da prospecção está com problema na Meta." : "Qualidade amarela na Meta."}</b> {textoDoFreio(s)}
      </span>
    </div>
  );
}

export function CartaoSaudeVoob({ s, i, onAtualizado }: { s: SaudeVoob | null; i: number; onAtualizado: (s: SaudeVoob) => void }) {
  const toast = useToast();
  const [detalhes, setDetalhes] = useState(false);
  const [lendo, setLendo] = useState(false);
  if (!s) {
    return (
      <Card className="entrar p-5 sm:p-6" style={{ "--i": i } as CSSProperties}>
        <div className="skeleton h-5 w-40 rounded" />
        <div className="skeleton mt-3 h-4 w-full rounded" />
      </Card>
    );
  }
  const cor = corDa(s);
  const l = s.leitura;
  const limiteMeta = limiteMetaTexto(l?.limite_meta ?? null);
  const itens = itensDaSituacaoVoob(l);
  const lerAgora = async () => {
    setLendo(true);
    try {
      onAtualizado(await api<SaudeVoob>("/api/voob/saude", {}));
      // A resposta da Meta chega em segundos: lê de novo um instante depois.
      await new Promise((r) => setTimeout(r, 4000));
      onAtualizado(await api<SaudeVoob>("/api/voob/saude"));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu para ler agora.", "error");
    } finally {
      setLendo(false);
    }
  };
  return (
    <Card className="entrar p-5 sm:p-6" style={{ "--i": i } as CSSProperties}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-strong">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <Activity className="size-4" />
          </span>
          Saúde do número
        </h2>
        <Badge tone={cor.tone} title="Qualidade do número da prospecção na Meta">
          <span className={cx("size-1.5 rounded-full", cor.ponto)} aria-hidden />
          {cor.rotulo}
        </Badge>
      </div>
      {s.numero ? (
        <>
          <p className="text-sm text-muted">
            Qualidade na Meta: <b className="text-ink">{textoQualidade(l?.qualidade)}</b>
          </p>
          {itens.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {itens.map((x) => (
                <li key={x.texto} className="flex items-center gap-2 text-ink">
                  <span className={cx("size-1.5 shrink-0 rounded-full", x.ok ? "bg-emerald-500" : "bg-amber-400")} aria-hidden />
                  {x.texto}
                </li>
              ))}
            </ul>
          )}
          {limiteMeta && <p className="mt-1.5 text-xs text-muted">Limite da Meta: {limiteMeta}</p>}
        </>
      ) : (
        <p className="text-sm text-muted">Ainda sem número conectado.</p>
      )}
      <p
        className={cx(
          "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
          s.freio === "pausado" ? "bg-red-50 text-red-800" : s.freio === "metade" ? "bg-amber-50 text-amber-900" : "bg-surface text-muted",
        )}
      >
        {s.freio === "normal" ? <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />}
        <span>{textoDoFreio(s)}</span>
      </p>
      {l && !l.ok && l.erro && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          Última leitura falhou ({l.erro}){l.falhas > 1 ? `, ${l.falhas} vezes seguidas` : ""}.
        </p>
      )}
      {s.numero && (
        <button type="button" onClick={() => setDetalhes((v) => !v)} className="mt-2 text-xs font-semibold text-brand-700 underline-offset-2 hover:underline" aria-expanded={detalhes}>
          {detalhes ? "Esconder detalhes" : "Ver detalhes"}
        </button>
      )}
      {detalhes && (
        <div className="mt-2 space-y-2 text-xs text-muted">
          {l?.avisos?.length ? (
            <ul className="space-y-1">
              {l.avisos.map((a) => (
                <li key={a} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-amber-900">
                  {a}
                </li>
              ))}
            </ul>
          ) : null}
          <p>
            Hoje: <b className="text-ink tabular-nums">{n(s.enviados_hoje)}</b> enviadas · Últimos 7 dias: <b className="text-ink tabular-nums">{n(s.saidas_7d)}</b>{" "}
            {s.saidas_7d === 1 ? "pediu" : "pediram"} para parar e <b className="text-ink tabular-nums">{n(s.sem_interesse_7d)}</b> sem interesse.
          </p>
          <p>Quem bloqueia ou denuncia derruba a qualidade na Meta. Se as saídas subirem, baixe o limite antes que a Meta baixe.</p>
          <p className="rounded-lg bg-surface px-2.5 py-1.5">
            <b className="text-ink">Sugestão de limite:</b> {s.sugestao.texto}
          </p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span>{l?.checado_em ? <>Lido na Meta {quando(l.checado_em)} · de hora em hora</> : s.numero ? "Ainda sem leitura da Meta." : "O Voob CRM lê a Meta de hora em hora."}</span>
        {s.numero && (
          <button type="button" onClick={() => void lerAgora()} disabled={lendo} className="inline-flex items-center gap-1 font-semibold text-brand-700 disabled:opacity-50">
            <RefreshCw className={cx("size-3", lendo && "animate-spin")} /> Ler agora
          </button>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- busca automática

const MOTIVO: Record<string, string> = {
  alvo: "achou o que a base precisava",
  limite: "parou no máximo de consultas do dia",
  cota: "parou na cota do Google",
  esgotado: "já fez todas as buscas da configuração",
  erro: "erro",
};

/** O que a busca procura, numa linha (os públicos e os ramos escritos à mão). */
function oQueProcura(p: PerfilBusca | undefined): string {
  const nomes = [...SEGMENTOS.filter((s) => segmentosDoPerfil(p).includes(s.id)).map((s) => s.nome), ...(p?.termos_extras ?? [])];
  return nomes.length ? nomes.join(", ") : "nada escolhido ainda (Primeiros passos, passo 5)";
}

export function BlocoBuscaAuto({ resumo, i, onResumo, onIr, onBaseMudou }: { resumo: ResumoBusca | null; i: number; onResumo: (r: ResumoBusca) => void; onIr: (v: View) => void; onBaseMudou: () => void }) {
  const toast = useToast();
  const [edicao, setEdicao] = useState<Partial<ConfigBuscaAuto>>({});
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      onResumo(await api<ResumoBusca>("/api/voob/busca-auto"));
    } catch {
      /* fica o que estava */
    }
  }, [onResumo]);

  // Rodando: confere de 15 em 15 s até terminar (e avisa a base).
  const rodando = Boolean(resumo?.estado.rodando);
  useEffect(() => {
    if (!rodando) return;
    const t = window.setInterval(() => void recarregar(), 15_000);
    return () => window.clearInterval(t);
  }, [rodando, recarregar]);
  // Terminou de buscar: a base mudou (relê a configuração da tela).
  const rodavaAntes = useRef(rodando);
  useEffect(() => {
    if (rodavaAntes.current && !rodando) onBaseMudou();
    rodavaAntes.current = rodando;
  }, [rodando, onBaseMudou]);

  if (!resumo) {
    return (
      <Card className="entrar p-5 sm:p-6" style={{ "--i": i } as CSSProperties}>
        <div className="skeleton h-5 w-48 rounded" />
        <div className="skeleton mt-3 h-4 w-full rounded" />
      </Card>
    );
  }
  const e = resumo.estado;
  const c: ConfigBuscaAuto = { ...e.config, ...edicao };
  const mudou = Object.keys(edicao).some((k) => edicao[k as keyof ConfigBuscaAuto] !== e.config[k as keyof ConfigBuscaAuto]);
  const alvo = e.limite * c.fila_dias;
  const precisa = quantoPrecisa({ ...e, config: c });
  const cidade = e.perfil?.cidade || CIDADE_PADRAO;
  const bairros = e.perfil?.bairros?.length ? e.perfil.bairros : /belo horizonte/i.test(cidade) ? BAIRROS_BH : [];
  const ultima = e.ultimas[0];

  const salvar = async (m: Partial<ConfigBuscaAuto>, ok: string) => {
    setSalvando(true);
    try {
      await api("/api/voob/busca-auto/config", { mudancas: m });
      await recarregar();
      setEdicao({});
      toast(ok, "success");
    } catch (x) {
      toast(x instanceof ApiError ? x.message : "Não deu para salvar agora.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const buscarAgora = async () => {
    setBuscando(true);
    try {
      const r = await api<{ iniciada: boolean; texto: string }>("/api/voob/busca-auto", {});
      toast(r.iniciada ? `Busca começou: ${r.texto}.` : `Não buscou: ${r.texto}.`, r.iniciada ? "success" : "info");
      await recarregar();
    } catch (x) {
      toast(x instanceof ApiError ? x.message : "Não deu para buscar agora.", "error");
    } finally {
      setBuscando(false);
    }
  };

  return (
    <Card className="entrar p-5 sm:p-6" style={{ "--i": i } as CSSProperties}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-bold text-strong">
          <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <ScanSearch className="size-4" />
          </span>
          Busca automática
        </h2>
        {e.rodando ? (
          <Badge tone="brand">
            <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-hidden /> Buscando agora
          </Badge>
        ) : (
          <Badge tone={e.config.ligado ? "green" : "gray"}>{e.config.ligado ? "Ligada" : "Desligada"}</Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Toggle
            checked={e.config.ligado}
            onChange={(v) => void salvar({ ligado: v }, v ? "Busca automática ligada." : "Busca automática desligada.")}
            label="Encher a base sozinho nos dias de disparo"
            hint={`${textoDias(e.dias).replace(/^./, (x) => x.toUpperCase())}, ${HORARIOS_ROTINA}, o Radar busca no Google até a base ter empresas para ${c.fila_dias} ${c.fila_dias === 1 ? "dia" : "dias"} de disparo (${n(alvo)}). Não busca nos feriados.`}
          />
          <div className="rounded-xl bg-surface p-3.5 text-sm ring-1 ring-line">
            <p className="text-ink">
              Base pronta agora: <b className="tabular-nums">{n(e.base_pronta)}</b> de {n(alvo)}
              {precisa > 0 ? (
                <span className="text-muted"> · a próxima busca procura até {n(precisa)}</span>
              ) : (
                <span className="text-muted"> · cheia, a próxima rodada não busca</span>
              )}
            </p>
            <p className="mt-1.5 text-xs text-muted">
              Procura: {oQueProcura(e.perfil)} · {cidade.replace(/,\s*[A-Za-z]{2}$/, "")} inteira{bairros.length ? ` e depois ${n(bairros.length)} bairros` : ""} · {ROTULO_FILTRO_SITE[filtroDoPerfil(e.perfil)].titulo.toLowerCase()}.{" "}
              <button type="button" className="font-semibold text-brand-700 underline" onClick={() => onIr("buscar")}>
                Mudar em Nova prospecção
              </button>
            </p>
          </div>
          {ultima && (
            <p className="text-xs text-muted">
              Última rodada: {quando(ultima.inicio)} ({ultima.origem === "manual" ? `pelo botão, ${ultima.quem ?? "Radar"}` : "automática"}) ·{" "}
              {ultima.fim ? (
                <>
                  <b className="text-ink">{n(ultima.adicionados)}</b> {ultima.adicionados === 1 ? "empresa nova" : "empresas novas"} em {n(ultima.consultas)} consultas ·{" "}
                  {ultima.texto ?? MOTIVO[ultima.motivo ?? ""] ?? ultima.motivo}
                  {ultima.erro ? ` (${ultima.erro})` : ""}
                </>
              ) : (
                "ainda rodando"
              )}
            </p>
          )}
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-muted">
              Base para quantos dias
              <select value={c.fila_dias} onChange={(x) => setEdicao({ ...edicao, fila_dias: Number(x.target.value) })} className={cx(inputClass, "mt-1")}>
                {[1, 2, 3, 5, 7].map((v) => (
                  <option key={v} value={v}>
                    {v} {v === 1 ? "dia" : "dias"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-muted">
              Máximo de consultas por dia
              <select value={c.max_consultas_dia} onChange={(x) => setEdicao({ ...edicao, max_consultas_dia: Number(x.target.value) })} className={cx(inputClass, "mt-1")}>
                {[20, 40, 60, 100].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 block text-xs font-semibold text-muted">
              Guardar da cota do mês para a busca manual
              <select value={c.reserva_cota} onChange={(x) => setEdicao({ ...edicao, reserva_cota: Number(x.target.value) })} className={cx(inputClass, "mt-1")}>
                {[0, 100, 150, 300].map((v) => (
                  <option key={v} value={v}>
                    {v} consultas
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-muted">
            Cota do Google: <b className="text-ink tabular-nums">{resumo.cotaRestante === null ? "—" : n(resumo.cotaRestante)}</b> de {n(resumo.cotaLimite)} livres no mês (uma só para todas
            as empresas do Radar) · hoje a busca automática já usou <b className="text-ink tabular-nums">{n(e.consultas_hoje)}</b> · agora dá para gastar até {n(resumo.podeGastar)}.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {mudou && <span className="text-xs text-muted">Mudanças sem salvar.</span>}
        {mudou && (
          <Button variant="ghost" size="sm" onClick={() => setEdicao({})}>
            Desfazer
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void buscarAgora()} loading={buscando} disabled={e.rodando} icon={<ScanSearch className="size-4" />}>
          Buscar agora
        </Button>
        <Button size="sm" disabled={!mudou} loading={salvando} onClick={() => void salvar(edicao, "Busca automática salva.")} icon={<Save className="size-4" />}>
          Salvar
        </Button>
      </div>
    </Card>
  );
}
