"use client";

import { Database, ExternalLink, MapPin, Plus, Search, Square, Star, X } from "lucide-react";
import { useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";

import type { View } from "@/components/dashboard/Shell";
import { RadarSweep } from "@/components/motion";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Toggle, cx, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import type { Uso } from "@/lib/types";
import {
  BAIRROS_BH,
  CIDADE_PADRAO,
  PAGINAS_POR_BUSCA,
  SEGMENTOS,
  SERVE_PARA_ABERTURA,
  consultasMaximas,
  lugaresDaBusca,
  paraBase,
  planoDeBusca,
  podeIrParaBase,
  resumoInsercao,
  rotuloConferida,
  termosDosSegmentos,
} from "@/lib/voob/regras";
import type { ConfigVoob, RespostaInsercao, ResultadoBusca, SituacaoConferida } from "@/lib/voob/tipos";

import { Chip, SeloSite, Titulo, n } from "./comum";

/**
 * Nova prospecção da Voob (12/11/2026): escolhe o público, o Radar busca no Google (cada página = 1 consulta das grátis,
 * a mesma cota do Lavacar), mostra quem não tem site e já confere no Voob CRM quem já é cliente, lead ou já conversou.
 * O que servir vai para a base com um toque; o disparo chama de lá, 20 por dia.
 */

export interface EstadoBusca {
  resultados: ResultadoBusca[];
  feitas: number;
  total: number;
  rodando: boolean;
  aviso: string;
}

interface RespostaBusca {
  itens: ResultadoBusca[];
  nextPageToken: string | null;
  uso: Uso;
  aviso?: string;
}

// A busca continua mesmo trocando de tela; "Parar" vale de qualquer lugar.
let controle: AbortController | null = null;

const MOSTRAR = 150;

export function VoobBusca({
  cfg,
  uso,
  onUso,
  estado,
  onEstado,
  onResultados,
  onBaseMudou,
  onIr,
}: {
  cfg: ConfigVoob | null;
  uso: Uso | null;
  onUso: (u: Uso) => void;
  estado: EstadoBusca;
  onEstado: Dispatch<SetStateAction<EstadoBusca>>;
  onResultados: (f: (r: ResultadoBusca[]) => ResultadoBusca[]) => void;
  onBaseMudou: () => void;
  onIr: (v: View) => void;
}) {
  const toast = useToast();
  const perfil = cfg?.empresa.perfil;
  const [segmentos, setSegmentos] = useState<string[]>(perfil?.segmentos ?? ["clinicas", "imobiliarias", "servicos"]);
  const [extras, setExtras] = useState<string[]>(perfil?.termos_extras ?? []);
  const [novoTermo, setNovoTermo] = useState("");
  const [cidade, setCidade] = useState(perfil?.cidade ?? CIDADE_PADRAO);
  const [bairros, setBairros] = useState<string[]>(perfil?.bairros ?? []);
  const [soSemSite, setSoSemSite] = useState(perfil?.so_sem_site ?? true);
  const [filtro, setFiltro] = useState<"chamar" | "todos">("chamar");
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [mostrar, setMostrar] = useState(MOSTRAR);
  const [gravando, setGravando] = useState(false);

  const termos = useMemo(() => termosDosSegmentos(segmentos, extras), [segmentos, extras]);
  const lugares = useMemo(() => lugaresDaBusca(cidade, bairros), [cidade, bairros]);
  const tarefas = useMemo(() => planoDeBusca(termos, lugares), [termos, lugares]);
  const maximo = consultasMaximas(tarefas.length);
  const semCota = uso ? maximo > uso.restantes : false;

  const serve = (r: ResultadoBusca) => !soSemSite || SERVE_PARA_ABERTURA.includes(r.siteSituacao);
  const paraChamar = estado.resultados.filter((r) => podeIrParaBase(r) && serve(r));
  const escolhidos = paraChamar.filter((r) => !fora.has(r.placeId));
  const visiveis = filtro === "chamar" ? paraChamar : estado.resultados;
  const semSite = estado.resultados.filter((r) => SERVE_PARA_ABERTURA.includes(r.siteSituacao)).length;
  const jaDaVoob = estado.resultados.filter((r) => ["ja_no_crm", "ja_conversa", "cliente_ou_equipe"].includes(r.situacao) || r.situacao.startsWith("base:")).length;

  const alternar = <T,>(lista: T[], x: T) => (lista.includes(x) ? lista.filter((y) => y !== x) : [...lista, x]);

  const addTermo = () => {
    const t = novoTermo.trim().replace(/\s+/g, " ");
    if (t.length < 3) return;
    setExtras((e) => (e.includes(t.toLowerCase()) ? e : [...e, t.toLowerCase()]));
    setNovoTermo("");
  };

  const buscar = async () => {
    if (!tarefas.length) return;
    controle?.abort();
    const meu = new AbortController();
    controle = meu;
    setFora(new Set());
    setMostrar(MOSTRAR);
    onEstado({ resultados: [], feitas: 0, total: tarefas.length, rodando: true, aviso: "" });
    // Guarda o público escolhido (a próxima vez já abre assim). Sem o Voob CRM, só não guarda.
    if (cfg) {
      void api("/api/voob/config", { mudancas: { perfil: { cidade, segmentos, termos_extras: extras, bairros, so_sem_site: soSemSite } } }).catch(() => {});
    }
    const vistos = new Set<string>();
    let parou = false;
    for (const t of tarefas) {
      let token: string | null = null;
      for (let pag = 0; pag < PAGINAS_POR_BUSCA && !meu.signal.aborted; pag++) {
        try {
          const r: RespostaBusca = await api<RespostaBusca>("/api/voob/busca", { termo: t.termo, lugar: t.lugar, pageToken: token }, { signal: meu.signal });
          const novos = r.itens.filter((x) => {
            const chaves = [x.placeId, x.celular ? `tel:${x.telefone}` : ""].filter(Boolean);
            if (chaves.some((k) => vistos.has(k))) return false;
            chaves.forEach((k) => vistos.add(k));
            return true;
          });
          onEstado((e) => ({ ...e, resultados: [...e.resultados, ...novos], aviso: r.aviso ?? e.aviso }));
          onUso(r.uso);
          token = r.nextPageToken;
          if (!token) break;
        } catch (e) {
          if ((e as Error).name === "AbortError") break;
          if (e instanceof ApiError && (e.status === 429 || e.status === 503)) {
            onEstado((x) => ({ ...x, aviso: e.message }));
            parou = true;
            break;
          }
          toast(e instanceof ApiError ? e.message : "Uma das buscas falhou; o Radar seguiu com as outras.", "error");
          break;
        }
      }
      onEstado((e) => ({ ...e, feitas: e.feitas + 1 }));
      if (parou || meu.signal.aborted) break;
    }
    if (controle === meu) controle = null;
    onEstado((e) => ({ ...e, rodando: false }));
  };

  const parar = () => {
    controle?.abort();
    controle = null;
    onEstado((e) => ({ ...e, rodando: false }));
  };

  const porNaBase = async () => {
    if (!escolhidos.length) return;
    setGravando(true);
    try {
      const lote = escolhidos.slice(0, 500);
      const r = await api<RespostaInsercao>("/api/voob/base", { leads: lote.map(paraBase) });
      const porTel = new Map(r.itens.map((x) => [x.telefone, x.resultado]));
      onResultados((lista) =>
        lista.map((x) => {
          const res = porTel.get(x.telefone);
          if (!res) return x;
          const situacao: ResultadoBusca["situacao"] =
            res === "novo" || res === "repetido" ? "base:novo" : res === "nao_e_celular" ? "fixo" : (res as SituacaoConferida);
          return { ...x, situacao };
        }),
      );
      toast(`Base: ${resumoInsercao(r.contagem)}.`, "success", (r.contagem.novo ?? 0) > 0 ? { rotulo: "Ver a base", onClick: () => onIr("leads") } : undefined);
      onBaseMudou();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu para pôr na base agora.", "error");
    } finally {
      setGravando(false);
    }
  };

  const progresso = estado.total ? Math.round((estado.feitas / estado.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <Titulo
        titulo="Nova prospecção"
        texto="Escolha quem procurar. O Radar busca no Google, separa quem não tem site e já tira quem é cliente, lead ou já conversou com a Voob."
      />

      {/* O público */}
      <Card className="entrar p-5 sm:p-6" style={{ "--i": 0 } as CSSProperties}>
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-ink">Segmentos</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {SEGMENTOS.map((s) => (
                  <Chip key={s.id} ativo={segmentos.includes(s.id)} onClick={() => setSegmentos((x) => alternar(x, s.id))} title={s.termos.join(", ")}>
                    {s.nome}
                  </Chip>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {extras.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full bg-navy px-2.5 py-1 text-xs font-semibold text-white">
                    {t}
                    <button type="button" onClick={() => setExtras((x) => x.filter((y) => y !== t))} aria-label={`Tirar ${t}`} className="text-white/60 hover:text-white">
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTermo();
                  }}
                >
                  <input
                    value={novoTermo}
                    onChange={(e) => setNovoTermo(e.target.value)}
                    placeholder="Outro termo (ex.: pilates)"
                    maxLength={60}
                    className={cx(inputClass, "h-8 w-56 py-1 text-xs")}
                  />
                  <Button type="submit" variant="ghost" size="sm" icon={<Plus className="size-3.5" />} disabled={novoTermo.trim().length < 3}>
                    Pôr
                  </Button>
                </form>
              </div>
              <p className="mt-2 text-xs text-muted">{termos.length ? `${termos.length} termos: ${termos.join(", ")}.` : "Escolha pelo menos um segmento ou termo."}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="voob-cidade" className="text-sm font-semibold text-ink">
                  Cidade
                </label>
                <div className="relative mt-2">
                  <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                  <input id="voob-cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} className={cx(inputClass, "pl-9")} maxLength={80} />
                </div>
              </div>
              <div className="sm:pt-7">
                <Toggle checked={soSemSite} onChange={setSoSemSite} label="Só quem não tem site" hint="Sem site ou só com rede social: é para eles a 1ª mensagem." />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-ink">
                Bairros <span className="font-normal text-muted">(opcional: o Google mostra até 60 por busca; por bairro acha mais)</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {BAIRROS_BH.map((b) => (
                  <Chip key={b} ativo={bairros.includes(b)} onClick={() => setBairros((x) => alternar(x, b))}>
                    {b}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          {/* Resumo e botão */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
            <div className="space-y-2 text-sm">
              <p className="font-bold text-ink">Esta busca</p>
              <p className="text-muted">
                <b className="text-ink">{n(tarefas.length)}</b> {tarefas.length === 1 ? "busca" : "buscas"} ({n(termos.length)} termos × {n(lugares.length)}{" "}
                {lugares.length === 1 ? "lugar" : "lugares"}), até <b className="text-ink">{n(maximo)}</b> consultas do Google.
              </p>
              {uso && (
                <p className={cx("text-xs", semCota ? "font-semibold text-red-600" : "text-muted")}>
                  {semCota
                    ? `Passa das ${n(uso.restantes)} consultas grátis que restam no mês. Tire termos ou bairros.`
                    : `Restam ${n(uso.restantes)} consultas grátis no mês (a cota é uma só para o Lavacar e a Voob).`}
                </p>
              )}
            </div>
            {estado.rodando ? (
              <Button variant="danger" size="lg" onClick={parar} icon={<Square className="size-4" />}>
                Parar a busca
              </Button>
            ) : (
              <Button size="lg" onClick={() => void buscar()} disabled={!tarefas.length || semCota} icon={<Search className="size-5" />}>
                Buscar no Google
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Andamento */}
      {(estado.rodando || estado.total > 0) && (
        <Card className="entrar flex items-center gap-4 p-4 sm:p-5" style={{ "--i": 1 } as CSSProperties}>
          <RadarSweep ativo={estado.rodando} pontos={Math.min(12, Math.ceil(estado.resultados.length / 8))} tamanho={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-bold text-ink">
                {estado.rodando ? "Buscando…" : "Busca concluída"} {n(estado.feitas)} de {n(estado.total)}
              </span>
              <span className="text-xs text-muted tabular-nums">
                {n(estado.resultados.length)} achadas · {n(semSite)} sem site · {n(jaDaVoob)} já da Voob · <b className="text-ink">{n(paraChamar.length)} para chamar</b>
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.max(3, progresso)}%` }} />
            </div>
            {estado.aviso && <p className="mt-2 text-xs font-semibold text-amber-700">{estado.aviso}</p>}
          </div>
        </Card>
      )}

      {/* Resultados */}
      {estado.resultados.length > 0 && (
        <Card className="entrar overflow-hidden" style={{ "--i": 2 } as CSSProperties}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:px-5">
            <div className="flex gap-1" role="group" aria-label="Mostrar">
              {(
                [
                  ["chamar", `Para chamar (${n(paraChamar.length)})`],
                  ["todos", `Todas (${n(estado.resultados.length)})`],
                ] as const
              ).map(([id, rotulo]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFiltro(id)}
                  aria-pressed={filtro === id}
                  className={cx("rounded-lg px-3 py-1.5 text-xs font-semibold transition", filtro === id ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100" : "text-muted hover:bg-strong/5")}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {!cfg && <span className="text-xs text-amber-700">Sem o Voob CRM ligado, dá para ver a busca mas não pôr na base.</span>}
              <Button onClick={() => void porNaBase()} loading={gravando} disabled={!cfg || !escolhidos.length || estado.rodando} icon={<Database className="size-4" />}>
                Pôr {n(Math.min(500, escolhidos.length))} na base
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-line">
            {visiveis.slice(0, mostrar).map((r) => {
              const pode = podeIrParaBase(r) && serve(r);
              const marcado = pode && !fora.has(r.placeId);
              const conf = rotuloConferida(r.situacao);
              return (
                <li key={r.placeId} className={cx("flex items-start gap-3 px-4 py-3 sm:px-5", !pode && "opacity-70")}>
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--color-brand)]"
                    checked={marcado}
                    disabled={!pode}
                    onChange={() =>
                      setFora((f) => {
                        const x = new Set(f);
                        if (x.has(r.placeId)) x.delete(r.placeId);
                        else x.add(r.placeId);
                        return x;
                      })
                    }
                    aria-label={`Escolher ${r.negocio}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-strong">{r.negocio}</span>
                      <SeloSite situacao={r.siteSituacao} url={r.site || null} />
                      <Badge tone={conf.tom}>{conf.rotulo}</Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <span>{r.categoria || r.termo}</span>
                      {r.bairro && <span>· {r.bairro}</span>}
                      <span className="tabular-nums">· {r.telefoneExibicao || "sem telefone"}</span>
                      {r.nota !== null && (
                        <span className="inline-flex items-center gap-0.5 tabular-nums">
                          · <Star className="size-3 fill-amber-400 text-amber-400" /> {r.nota.toLocaleString("pt-BR")} ({n(r.avaliacoes ?? 0)})
                        </span>
                      )}
                    </p>
                  </div>
                  {r.mapsUrl && (
                    <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-strong/5 hover:text-ink" title="Abrir no Google Maps">
                      <ExternalLink className="size-4" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          {visiveis.length > mostrar && (
            <div className="border-t border-line p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setMostrar((m) => m + MOSTRAR)}>
                Mostrar mais {n(Math.min(MOSTRAR, visiveis.length - mostrar))}
              </Button>
            </div>
          )}
          {!visiveis.length && <p className="p-6 text-center text-sm text-muted">Ninguém para chamar nesta busca ainda.</p>}
        </Card>
      )}
    </div>
  );
}
