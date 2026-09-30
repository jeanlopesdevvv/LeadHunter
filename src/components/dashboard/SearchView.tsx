"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, CircleStop, MapPin, Play, Plus, Search, SlidersHorizontal, Tag, Users } from "lucide-react";
import { useState } from "react";

import { Badge, Button, Card, Field, inputClass, Toggle, cx } from "@/components/ui";
import { QUANTIDADES, splitLines, sugerirLimite } from "@/lib/geo";
import { formatarRenovacaoCurta } from "@/lib/periodo";
import type { Progresso } from "@/lib/client/search-runner";
import type { Uso } from "@/lib/types";
import { AnimatedNumber, RadarSweep } from "@/components/motion";

import { UsoCard } from "./UsoCota";

export interface SearchForm {
  termos: string;
  cidades: string;
  /** Quantos contatos novos buscar. */
  alvo: number;
  /** Máximo de consultas desta busca; null = automático. */
  limite: number | null;
  ignorarFechados: boolean;
  /** Fixo também conta (alguns têm WhatsApp Business). */
  incluirFixos: boolean;
}

/** Atalhos de "quem procurar": preenchem o campo de termos (que continua editável). */
export const PUBLICOS = {
  lavajatos: { rotulo: "Lava-jatos", termos: ["lava jato", "estética automotiva", "lava rápido"] },
  autonomos: { rotulo: "Lavadores autônomos", termos: ["lavagem a domicílio", "lavador de carros", "lava jato delivery"] },
  todos: { rotulo: "Os dois", termos: ["lava jato", "estética automotiva", "lavagem a domicílio", "lavador de carros"] },
} as const;
type Publico = keyof typeof PUBLICOS;

function publicoAtual(termos: string[]): Publico | null {
  const atual = termos.map((t) => t.toLowerCase()).sort().join("|");
  for (const k of Object.keys(PUBLICOS) as Publico[]) {
    if ([...PUBLICOS[k].termos].sort().join("|") === atual) return k;
  }
  return null;
}

const SUGESTOES_TERMOS = [
  "lava jato",
  "lava rápido",
  "estética automotiva",
  "lavagem a domicílio",
  "lavador de carros",
  "lava jato delivery",
  "lavagem automotiva",
  "higienização automotiva",
  "polimento automotivo",
];
const SUGESTOES_CIDADES = ["Belo Horizonte - MG", "Contagem - MG", "Nova Lima - MG", "Betim - MG", "São Paulo - SP", "Rio de Janeiro - RJ"];

const n = (v: number) => v.toLocaleString("pt-BR");

function addLine(text: string, value: string) {
  const lines = splitLines(text);
  if (lines.some((l) => l.toLowerCase() === value.toLowerCase())) return text;
  return [...lines, value].join("\n");
}

/** Consultas que esta busca pode gastar (sugestão automática ou valor escolhido, dentro do que resta no mês). */
export function calcularLimite(form: SearchForm, uso: Uso | null, maxPorBusca: number) {
  const combinacoes = splitLines(form.termos).length * splitLines(form.cidades).length;
  const disponivel = uso?.bloquear ? Math.max(0, uso.restantes) : Number.POSITIVE_INFINITY;
  const teto = Math.max(0, Math.min(maxPorBusca, disponivel));
  const sugerido = sugerirLimite(form.alvo, combinacoes, Math.max(1, maxPorBusca));
  const escolhido = form.limite ?? sugerido;
  return { limite: Math.min(escolhido, teto), sugerido, teto, cortadoPelaCota: escolhido > teto && teto === disponivel };
}

function Chip({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-full border border-line bg-card px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand-200 hover:text-brand-700 disabled:opacity-50"
    >
      <Plus className="size-3" /> {children}
    </button>
  );
}

export function SearchView({
  form,
  onForm,
  rodando,
  progresso,
  podeContinuar,
  uso,
  maxPorBusca,
  placesConfigurada,
  atualizandoUso,
  onAtualizarUso,
  onBuscar,
  onParar,
  onContinuar,
  onVerResultados,
}: {
  form: SearchForm;
  onForm: (f: SearchForm) => void;
  rodando: boolean;
  progresso: Progresso | null;
  podeContinuar: boolean;
  uso: Uso | null;
  maxPorBusca: number;
  placesConfigurada: boolean;
  atualizandoUso: boolean;
  onAtualizarUso: () => void;
  onBuscar: () => void;
  onParar: () => void;
  onContinuar: () => void;
  onVerResultados: () => void;
}) {
  const [outro, setOutro] = useState(!QUANTIDADES.includes(form.alvo as (typeof QUANTIDADES)[number]));
  const [ajustar, setAjustar] = useState(form.limite !== null);
  const termos = splitLines(form.termos);
  const cidades = splitLines(form.cidades);
  const set = (patch: Partial<SearchForm>) => onForm({ ...form, ...patch });
  const { limite, sugerido, teto, cortadoPelaCota } = calcularLimite(form, uso, maxPorBusca);
  const semCota = Boolean(uso?.bloquear && uso.restantes <= 0);
  const podeBuscar = termos.length > 0 && cidades.length > 0 && form.alvo > 0 && limite > 0 && placesConfigurada && !semCota;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Nova prospecção</p>
        <h1 className="display mt-3 text-4xl text-strong sm:text-5xl">
          Novos parceiros <span className="text-brand">para o Lavacar.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Defina o perfil, a região e quantos contatos você quer. O Radar busca lava-jatos e lavadores autônomos no Google Maps, remove
          os repetidos e quem já está na planilha, e entrega apenas oportunidades novas, prontas para a Carol.
        </p>
      </header>

      {!placesConfigurada && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            A busca no Google Maps ainda não foi configurada. Veja a página <b>Configuração</b>.
          </span>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-5 sm:p-7">
          <div className="mb-6">
            <p className="text-sm font-semibold text-ink">Qual perfil você quer prospectar?</p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Quem procurar">
              {(Object.keys(PUBLICOS) as Publico[]).map((k) => {
                const ativo = publicoAtual(termos) === k;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={rodando}
                    onClick={() => set({ termos: PUBLICOS[k].termos.join("\n") })}
                    className={cx(
                      "h-10 rounded-xl border px-4 text-sm font-bold transition-all",
                      ativo ? "border-brand bg-brand-50 text-brand-700 ring-2 ring-brand/15" : "border-line bg-card text-ink hover:border-brand-200",
                    )}
                  >
                    {PUBLICOS[k].rotulo}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">Escolha um perfil e os termos de busca são preenchidos. Você pode ajustá-los no campo abaixo.</p>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Field label="1. O que procurar no Google" hint="um por linha" htmlFor="termos">
              <div className="relative">
                <Tag className="pointer-events-none absolute top-3 left-3.5 size-4 text-muted" />
                <textarea
                  id="termos"
                  rows={4}
                  value={form.termos}
                  onChange={(e) => set({ termos: e.target.value })}
                  disabled={rodando}
                  className={cx(inputClass, "resize-y pl-10 leading-relaxed")}
                  placeholder={"lava jato\nestética automotiva"}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGESTOES_TERMOS.filter((s) => !termos.some((t) => t.toLowerCase() === s)).map((s) => (
                  <Chip key={s} disabled={rodando} onClick={() => set({ termos: addLine(form.termos, s) })}>
                    {s}
                  </Chip>
                ))}
              </div>
            </Field>

            <Field label="2. Onde" hint="cidade ou bairro, um por linha" htmlFor="cidades">
              <div className="relative">
                <MapPin className="pointer-events-none absolute top-3 left-3.5 size-4 text-muted" />
                <textarea
                  id="cidades"
                  rows={4}
                  value={form.cidades}
                  onChange={(e) => set({ cidades: e.target.value })}
                  disabled={rodando}
                  className={cx(inputClass, "resize-y pl-10 leading-relaxed")}
                  placeholder={"Belo Horizonte - MG\nContagem - MG"}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {SUGESTOES_CIDADES.filter((s) => !cidades.some((c) => c.toLowerCase() === s.toLowerCase())).map((s) => (
                  <Chip key={s} disabled={rodando} onClick={() => set({ cidades: addLine(form.cidades, s) })}>
                    {s}
                  </Chip>
                ))}
              </div>
            </Field>
          </div>

          <div className="mt-7">
            <p className="text-sm font-semibold text-ink">3. Quantas oportunidades novas você quer?</p>
            <p className="mt-0.5 text-xs text-muted">
              Só conta quem tem {form.incluirFixos ? "celular ou telefone fixo" : "celular"} e ainda não está na planilha. A busca termina assim
              que bater a meta.
            </p>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Quantidade de contatos">
              {QUANTIDADES.map((q) => {
                const ativo = !outro && form.alvo === q;
                return (
                  <button
                    key={q}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={rodando}
                    onClick={() => {
                      setOutro(false);
                      set({ alvo: q });
                    }}
                    className={cx(
                      "h-11 min-w-16 rounded-xl border px-4 text-sm font-bold tabular-nums transition-all",
                      ativo ? "border-brand bg-brand-50 text-brand-700 ring-2 ring-brand/15" : "border-line bg-card text-ink hover:border-brand-200",
                    )}
                  >
                    {q}
                  </button>
                );
              })}
              <div
                className={cx(
                  "flex h-11 items-center gap-2 rounded-xl border pr-2 pl-3 transition-all",
                  outro ? "border-brand bg-brand-50 ring-2 ring-brand/15" : "border-line bg-card",
                )}
              >
                <button
                  type="button"
                  disabled={rodando}
                  onClick={() => setOutro(true)}
                  className={cx("text-sm font-bold", outro ? "text-brand-700" : "text-ink")}
                >
                  Outro
                </button>
                {outro && (
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    inputMode="numeric"
                    autoFocus
                    disabled={rodando}
                    value={form.alvo || ""}
                    onChange={(e) => set({ alvo: Math.max(0, Math.min(2000, Math.floor(Number(e.target.value) || 0))) })}
                    className="h-8 w-20 rounded-lg border border-brand-200 bg-card px-2 text-sm font-bold text-ink tabular-nums focus:border-brand focus:outline-none"
                    aria-label="Quantidade de contatos"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Quanto vai gastar */}
          <div
            className={cx(
              "mt-6 rounded-xl px-4 py-3.5 text-sm",
              semCota ? "bg-red-50 text-red-800" : cortadoPelaCota ? "bg-amber-50 text-amber-900" : "bg-surface text-ink",
            )}
          >
            {semCota && uso ? (
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  As {n(uso.limite)} consultas grátis deste mês acabaram. Elas voltam em <b>{formatarRenovacaoCurta(uso.renovaEm)}</b>.
                </span>
              </p>
            ) : (
              <>
                <p>
                  Usa <b>no máximo {n(limite)} consulta{limite === 1 ? "" : "s"}</b>
                  {form.alvo > 0 && <> para encontrar {form.alvo === 1 ? "1 oportunidade" : `${n(form.alvo)} oportunidades`}</>}. A busca
                  termina ao atingir a meta, então normalmente usa menos.
                  {uso && uso.bloquear && (
                    <span className="text-muted">
                      {" "}
                      Restam {n(uso.restantes)} no mês.
                    </span>
                  )}
                </p>
                {cortadoPelaCota && (
                  <p className="mt-1 text-xs">Só restam {n(teto)} consultas grátis neste mês, então a busca vai parar nelas.</p>
                )}
                {!ajustar ? (
                  <button
                    type="button"
                    onClick={() => setAjustar(true)}
                    disabled={rodando}
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
                  >
                    <SlidersHorizontal className="size-3.5" /> Mudar o máximo de consultas
                  </button>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <label htmlFor="limite" className="font-semibold">
                      Máximo nesta busca:
                    </label>
                    <input
                      id="limite"
                      type="number"
                      min={1}
                      max={maxPorBusca}
                      disabled={rodando}
                      value={form.limite ?? sugerido}
                      onChange={(e) => set({ limite: Math.max(1, Math.min(maxPorBusca, Math.floor(Number(e.target.value) || 1))) })}
                      className="h-8 w-20 rounded-lg border border-line bg-card px-2 text-sm font-bold tabular-nums focus:border-brand focus:outline-none"
                    />
                    <span className="text-muted">consultas (até {n(maxPorBusca)})</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAjustar(false);
                        set({ limite: null });
                      }}
                      className="font-semibold text-brand-700 hover:underline"
                    >
                      Voltar ao automático ({n(sugerido)})
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-5 border-t border-line pt-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
              <Toggle
                checked={form.incluirFixos}
                onChange={(v) => set({ incluirFixos: v })}
                label="Incluir telefone fixo"
                hint="Alguns fixos têm WhatsApp Business."
              />
              <Toggle
                checked={form.ignorarFechados}
                onChange={(v) => set({ ignorarFechados: v })}
                label="Pular estabelecimentos fechados"
                hint="Os que o Google marca como fechados."
              />
            </div>
            <div className="flex flex-wrap gap-3 sm:justify-end">
              {!rodando ? (
                <Button size="lg" onClick={onBuscar} disabled={!podeBuscar} icon={<Search className="size-4" />}>
                  Buscar {form.alvo === 1 ? "1 oportunidade" : `${form.alvo > 0 ? n(form.alvo) : ""} oportunidades`}
                </Button>
              ) : (
                <Button size="lg" variant="danger" onClick={onParar} icon={<CircleStop className="size-4" />}>
                  Parar a busca
                </Button>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <UsoCard uso={uso} onAtualizar={onAtualizarUso} atualizando={atualizandoUso} />
        </div>
      </div>

      {progresso && (
        <CartaoProgresso
          p={progresso}
          ignorarFechados={form.ignorarFechados}
          incluirFixos={form.incluirFixos}
          podeContinuar={podeContinuar && !rodando}
          onContinuar={onContinuar}
          onVerResultados={onVerResultados}
        />
      )}

      {!progresso && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Busque", "Defina perfil, região e quantidade de contatos."],
            ["2", "Revise e envie", "Confira a lista, ajuste empresa ou autônomo e envie os escolhidos para a planilha."],
            ["3", "Dispare", "Escolha quem recebe a mensagem da Carol e acompanhe os resultados em Desempenho."],
          ].map(([num, t, d]) => (
            <div key={num} className="flex gap-3 rounded-2xl border border-dashed border-line p-4">
              <Badge tone="brand" className="size-6 justify-center p-0 text-xs">
                {num}
              </Badge>
              <div>
                <p className="text-sm font-bold text-ink">{t}</p>
                <p className="text-xs text-muted">{d}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoProgresso({
  p,
  ignorarFechados,
  incluirFixos,
  podeContinuar,
  onContinuar,
  onVerResultados,
}: {
  p: Progresso;
  ignorarFechados: boolean;
  incluirFixos: boolean;
  podeContinuar: boolean;
  onContinuar: () => void;
  onVerResultados: () => void;
}) {
  const pct = p.alvo ? Math.min(100, Math.round((p.novos / p.alvo) * 100)) : 0;
  const final = !p.rodando && p.fim;
  const faltam = Math.max(0, p.alvo - p.novos);

  const mensagem = (() => {
    if (!final) return null;
    switch (p.fim) {
      case "alvo":
        return {
          tom: "ok",
          texto: `Meta atingida: ${p.alvo === 1 ? "1 oportunidade nova encontrada" : `${n(p.alvo)} oportunidades novas encontradas`} com ${n(p.consultas)} consulta${p.consultas === 1 ? "" : "s"}. Revise a lista e envie para a planilha.`,
        };
      case "limite":
        return {
          tom: "aviso",
          texto: `Limite de ${n(p.limite)} consultas atingido com ${n(p.novos)} de ${n(p.alvo)} oportunidades. Continue a busca para encontrar as ${n(faltam)} restantes.`,
        };
      case "esgotado":
        return {
          tom: "aviso",
          texto: `O Google não tem mais resultados para esses termos e regiões: ${n(p.novos)} de ${n(p.alvo)} oportunidades. Para encontrar mais, tente outras cidades, bairros ou termos.`,
        };
      case "parado":
        return { tom: "aviso", texto: `Busca interrompida com ${n(p.novos)} de ${n(p.alvo)} oportunidades. Você pode continuar de onde parou.` };
      default:
        return { tom: "erro", texto: p.erro || "A busca parou por um erro." };
    }
  })();

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex min-w-0 items-center gap-5">
          {p.rodando || p.unicos > 0 ? (
            <RadarSweep ativo={p.rodando} pontos={p.novos} tamanho={76} className={cx(p.fim === "alvo" && "ring-4 ring-emerald-200")} />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              {p.fim === "alvo" ? <CheckCircle2 className="size-6" /> : <Users className="size-6" />}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-base font-extrabold text-ink">
              {p.rodando ? "Buscando no Google Maps…" : p.fim === "alvo" ? "Meta atingida" : "Busca encerrada"}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {p.rodando ? p.etapa || "Preparando a busca…" : `${n(p.consultas)} consultas usadas · ${n(p.unicos)} estabelecimentos na lista`}
            </p>
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className={cx("text-4xl font-extrabold tabular-nums", p.fim === "alvo" ? "text-emerald-600" : "text-strong")}>
            <AnimatedNumber value={Math.min(p.novos, p.alvo)} /> <span className="text-lg font-bold text-muted">de {n(p.alvo)}</span>
          </div>
          <div className="text-xs font-semibold text-muted">
            oportunidades novas
            {p.novos > p.alvo && <span className="text-emerald-600"> · +{n(p.novos - p.alvo)} extras na lista</span>}
          </div>
        </div>
      </div>
      <div className="h-2.5 bg-surface">
        <div
          className={cx("h-full rounded-r-full transition-all duration-700 ease-out", p.fim === "alvo" ? "bg-emerald-500" : "bg-brand", p.rodando && "shine")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-5 py-4 text-xs text-muted sm:grid-cols-3 sm:px-7 lg:grid-cols-6">
        <Numero rotulo="consultas usadas" valor={`${n(p.consultas)} / ${n(p.limite)}`} />
        <Numero rotulo="vistos no Google" valor={n(p.vistos)} />
        <Numero rotulo="já na planilha" valor={n(p.jaNaPlanilha)} />
        <Numero rotulo={incluirFixos ? "sem telefone" : "sem celular"} valor={n(p.semCelular)} />
        <Numero rotulo="repetidos" valor={n(p.repetidos)} />
        {ignorarFechados && <Numero rotulo="fechados" valor={n(p.fechados)} />}
      </div>

      {mensagem && (
        <div
          className={cx(
            "flex flex-col gap-3 border-t px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-7",
            mensagem.tom === "ok" && "border-emerald-100 bg-emerald-50/70 text-emerald-900",
            mensagem.tom === "aviso" && "border-amber-100 bg-amber-50/70 text-amber-900",
            mensagem.tom === "erro" && "border-red-100 bg-red-50 text-red-800",
          )}
        >
          <p>{mensagem.texto}</p>
          <div className="flex shrink-0 flex-wrap gap-2">
            {podeContinuar && p.fim !== "alvo" && p.fim !== "esgotado" && p.fim !== "cota" && (
              <Button size="sm" variant="outline" onClick={onContinuar} icon={<Play className="size-3.5" />}>
                Continuar a busca
              </Button>
            )}
            {p.unicos > 0 && (
              <Button size="sm" variant="dark" onClick={onVerResultados}>
                Ver a lista <ArrowRight className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {p.avisos.length > 0 && (
        <div className="border-t border-line bg-amber-50/40 px-5 py-3 text-xs text-amber-900 sm:px-7">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-3.5" /> {p.avisos.length} aviso{p.avisos.length === 1 ? "" : "s"}
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {p.avisos.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="text-base font-bold text-ink tabular-nums">{valor}</div>
      <div>{rotulo}</div>
    </div>
  );
}
