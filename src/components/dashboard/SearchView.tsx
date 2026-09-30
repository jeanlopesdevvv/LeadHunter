"use client";

import {
  AlertTriangle,
  ArrowRight,
  Car,
  Check,
  ChevronDown,
  CircleStop,
  Gauge,
  Layers,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Store,
  Tag,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import { AnimatedNumber, RadarSweep } from "@/components/motion";
import { Button, Card, Toggle, cx } from "@/components/ui";
import type { Progresso } from "@/lib/client/search-runner";
import { QUANTIDADES, splitLines, sugerirLimite } from "@/lib/geo";
import { formatarRenovacaoCurta } from "@/lib/periodo";
import type { Uso } from "@/lib/types";

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

/** Atalhos de "quem procurar": preenchem os termos de busca (que continuam editáveis). */
export const PUBLICOS = {
  lavajatos: { rotulo: "Lava-jatos", termos: ["lava jato", "estética automotiva", "lava rápido"] },
  autonomos: { rotulo: "Lavadores autônomos", termos: ["lavagem a domicílio", "lavador de carros", "lava jato delivery"] },
  todos: { rotulo: "Os dois", termos: ["lava jato", "estética automotiva", "lavagem a domicílio", "lavador de carros"] },
} as const;
type Publico = keyof typeof PUBLICOS;

const VISUAL_PUBLICO: Record<Publico, { icone: typeof Store; detalhe: string; resumo: string; cor: string; gradiente: string }> = {
  lavajatos: {
    icone: Store,
    detalhe: "Estabelecimentos",
    resumo: "Lava-jatos",
    cor: "bg-[#03abc9]/12 text-[#03abc9]",
    gradiente: "from-[#22bedb] to-[#0293ad]",
  },
  autonomos: {
    icone: Car,
    detalhe: "Atendem a domicílio",
    resumo: "Lavadores autônomos",
    cor: "bg-[#7c6cf2]/12 text-[#7c6cf2]",
    gradiente: "from-[#9486f7] to-[#6552e0]",
  },
  todos: {
    icone: Layers,
    detalhe: "Mais alcance",
    resumo: "Lava-jatos e autônomos",
    cor: "bg-[#10b981]/12 text-[#10b981]",
    gradiente: "from-[#34d399] to-[#059669]",
  },
};

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

/** Pontos no radar do resumo: mais oportunidades, mais pontos. */
const PONTOS_POR_QUANTIDADE: Record<number, number> = { 10: 3, 25: 5, 50: 8, 100: 12, 250: 18, 500: 26 };

/** Consultas que esta busca pode gastar (sugestão automática ou valor escolhido, dentro do que resta no mês). */
export function calcularLimite(form: SearchForm, uso: Uso | null, maxPorBusca: number) {
  const combinacoes = splitLines(form.termos).length * splitLines(form.cidades).length;
  const disponivel = uso?.bloquear ? Math.max(0, uso.restantes) : Number.POSITIVE_INFINITY;
  const teto = Math.max(0, Math.min(maxPorBusca, disponivel));
  const sugerido = sugerirLimite(form.alvo, combinacoes, Math.max(1, maxPorBusca));
  const escolhido = form.limite ?? sugerido;
  return { limite: Math.min(escolhido, teto), sugerido, teto, cortadoPelaCota: escolhido > teto && teto === disponivel };
}

/** Cabeçalho numerado de cada passo. */
function Passo({ num, titulo, extra, children, i }: { num: number; titulo: string; extra?: ReactNode; children: ReactNode; i: number }) {
  return (
    <Card className="p-5 sm:p-6" style={{ "--i": i } as CSSProperties}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-base font-bold text-ink sm:text-[17px]">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-extrabold text-white shadow-brand">
            {num}
          </span>
          {titulo}
        </h2>
        {extra}
      </div>
      {children}
    </Card>
  );
}

/** Lista de etiquetas: digite e aperte Enter; clique no × para tirar. */
function Etiquetas({
  id,
  valores,
  onChange,
  sugestoes,
  placeholder,
  icone,
  disabled,
  rotulo,
}: {
  id: string;
  valores: string[];
  onChange: (v: string[]) => void;
  sugestoes: string[];
  placeholder: string;
  icone: ReactNode;
  disabled?: boolean;
  rotulo: string;
}) {
  const [texto, setTexto] = useState("");
  const tem = (v: string) => valores.some((x) => x.toLowerCase() === v.toLowerCase());

  function adicionar(bruto: string) {
    const novos = splitLines(bruto).filter((v) => !tem(v));
    if (novos.length) onChange([...valores, ...novos]);
    setTexto("");
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      adicionar(texto);
    } else if (e.key === "Backspace" && !texto && valores.length) {
      onChange(valores.slice(0, -1));
    }
  }

  function aoColar(e: ClipboardEvent<HTMLInputElement>) {
    const colado = e.clipboardData.getData("text");
    if (/[\n;]/.test(colado)) {
      e.preventDefault();
      adicionar(colado);
    }
  }

  const restantes = sugestoes.filter((s) => !tem(s)).slice(0, 5);

  return (
    <div>
      <div
        className={cx(
          "flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2 transition",
          "focus-within:border-brand focus-within:bg-card focus-within:ring-4 focus-within:ring-brand/10",
          disabled && "opacity-70",
        )}
      >
        {valores.map((v) => (
          <span
            key={v.toLowerCase()}
            className="inline-flex max-w-full animate-pop-in items-center gap-1.5 rounded-full bg-card py-1.5 pr-1.5 pl-3 text-sm font-semibold text-ink shadow-card ring-1 ring-line"
          >
            <span className="text-brand">{icone}</span>
            <span className="truncate">{v}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(valores.filter((x) => x !== v))}
                className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition hover:bg-red-50 hover:text-red-600"
                aria-label={`Tirar ${v}`}
              >
                <X className="size-3.5" />
              </button>
            )}
          </span>
        ))}
        <input
          id={id}
          value={texto}
          disabled={disabled}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={aoTeclar}
          onPaste={aoColar}
          onBlur={() => texto.trim() && adicionar(texto)}
          placeholder={valores.length ? "Adicionar mais…" : placeholder}
          aria-label={rotulo}
          enterKeyHint="done"
          className="h-9 min-w-44 flex-1 bg-transparent px-2 text-base text-ink placeholder:text-muted/70 focus:outline-none sm:text-sm"
        />
      </div>
      {!disabled && restantes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {restantes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...valores, s])}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-brand hover:bg-brand-50 hover:text-brand-700"
            >
              <Plus className="size-3.5" /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
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
  const termos = splitLines(form.termos);
  const cidades = splitLines(form.cidades);
  const publico = publicoAtual(termos);
  const [verTermos, setVerTermos] = useState(publico === null);
  const [opcoes, setOpcoes] = useState(form.limite !== null);
  const set = (patch: Partial<SearchForm>) => onForm({ ...form, ...patch });
  const { limite, sugerido, teto, cortadoPelaCota } = calcularLimite(form, uso, maxPorBusca);
  const semCota = Boolean(uso?.bloquear && uso.restantes <= 0);
  const podeBuscar = termos.length > 0 && cidades.length > 0 && form.alvo > 0 && limite > 0 && placesConfigurada && !semCota;

  // Ao começar a busca, leva o progresso para a vista (no celular o botão fica lá embaixo).
  const progressoRef = useRef<HTMLDivElement>(null);
  const rodandoAntes = useRef(rodando);
  useEffect(() => {
    if (rodando && !rodandoAntes.current) {
      requestAnimationFrame(() => progressoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
    rodandoAntes.current = rodando;
  }, [rodando]);

  const resumoPublico = publico ? VISUAL_PUBLICO[publico].resumo : `${termos.length} ${termos.length === 1 ? "termo" : "termos"} de busca`;
  const resumoCidades = cidades.length === 0 ? "Escolha uma região" : cidades.length === 1 ? cidades[0] : `${cidades[0]} e mais ${cidades.length - 1}`;

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Nova prospecção</p>
        <h1 className="display mt-3 text-[34px] text-strong sm:text-5xl">
          Novos parceiros <span className="texto-marca">para o Lavacar.</span>
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">Escolha quem, onde e quantos. O Radar entrega só contatos novos.</p>
      </header>

      {!placesConfigurada && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>A busca ainda não está disponível. Fale com o administrador do Radar.</span>
        </div>
      )}

      {progresso && (
        <div ref={progressoRef} className="scroll-mt-36 animate-slide-up lg:scroll-mt-8">
          <CartaoProgresso
            p={progresso}
            podeContinuar={podeContinuar && !rodando}
            onContinuar={onContinuar}
            onVerResultados={onVerResultados}
          />
        </div>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="stagger space-y-4">
          <Passo
            i={0}
            num={1}
            titulo="Quem você quer encontrar?"
            extra={
              <button
                type="button"
                onClick={() => setVerTermos((v) => !v)}
                className="hidden items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted transition hover:bg-surface hover:text-brand-700 sm:inline-flex"
                aria-expanded={verTermos}
              >
                <Tag className="size-3.5" /> Termos
                <ChevronDown className={cx("size-3.5 transition-transform", verTermos && "rotate-180")} />
              </button>
            }
          >
            <div className="grid gap-2.5 sm:grid-cols-3" role="radiogroup" aria-label="Quem procurar">
              {(Object.keys(PUBLICOS) as Publico[]).map((k) => {
                const ativo = publico === k;
                const v = VISUAL_PUBLICO[k];
                const Icone = v.icone;
                return (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={rodando}
                    onClick={() => set({ termos: PUBLICOS[k].termos.join("\n") })}
                    className={cx(
                      "group relative flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-all duration-200 sm:flex-col sm:items-start sm:gap-3 sm:p-4",
                      ativo
                        ? "border-brand bg-brand-50 ring-4 ring-brand/10"
                        : "border-line bg-card hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card disabled:hover:translate-y-0",
                    )}
                  >
                    <span
                      className={cx(
                        "grid size-11 shrink-0 place-items-center rounded-xl transition-all duration-300",
                        ativo ? cx("bg-gradient-to-br text-white shadow-lg", v.gradiente) : v.cor,
                        !rodando && "group-hover:scale-105",
                      )}
                    >
                      <Icone className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className={cx("block text-[15px] font-bold", ativo ? "text-brand-700" : "text-ink")}>{PUBLICOS[k].rotulo}</span>
                      <span className="mt-0.5 block text-xs text-muted">{v.detalhe}</span>
                    </span>
                    {ativo && (
                      <span className="absolute top-1/2 right-3.5 grid size-6 -translate-y-1/2 animate-pop-in place-items-center rounded-full bg-brand text-white sm:top-3 sm:translate-y-0">
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setVerTermos((v) => !v)}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-muted transition hover:text-brand-700 sm:hidden"
              aria-expanded={verTermos}
            >
              <Tag className="size-3.5" /> Termos de busca
              <ChevronDown className={cx("size-3.5 transition-transform", verTermos && "rotate-180")} />
            </button>
            {verTermos && (
              <div className="mt-4 animate-slide-up">
                <Etiquetas
                  id="termos"
                  rotulo="Termos de busca"
                  valores={termos}
                  onChange={(v) => set({ termos: v.join("\n") })}
                  sugestoes={SUGESTOES_TERMOS}
                  placeholder="Ex.: lava jato"
                  icone={<Tag className="size-3.5" />}
                  disabled={rodando}
                />
              </div>
            )}
          </Passo>

          <Passo i={1} num={2} titulo="Em qual região?">
            <Etiquetas
              id="cidades"
              rotulo="Cidades ou bairros"
              valores={cidades}
              onChange={(v) => set({ cidades: v.join("\n") })}
              sugestoes={SUGESTOES_CIDADES}
              placeholder="Digite uma cidade ou bairro e aperte Enter"
              icone={<MapPin className="size-3.5" />}
              disabled={rodando}
            />
          </Passo>

          <Passo i={2} num={3} titulo="Quantas oportunidades novas?">
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6" role="radiogroup" aria-label="Quantidade de contatos">
              {QUANTIDADES.map((q) => {
                const ativo = form.alvo === q;
                return (
                  <button
                    key={q}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    disabled={rodando}
                    onClick={() => set({ alvo: q })}
                    className={cx(
                      "h-14 rounded-2xl text-lg font-extrabold tabular-nums transition-all duration-200",
                      ativo
                        ? "scale-[1.03] bg-gradient-to-br from-brand-400 to-brand-600 text-white shadow-brand"
                        : "border border-line bg-card text-ink hover:-translate-y-0.5 hover:border-brand-300 hover:text-brand-700 disabled:hover:translate-y-0",
                    )}
                  >
                    {q}
                  </button>
                );
              })}
            </div>
          </Passo>

          <div className="rounded-2xl border border-line bg-card" style={{ "--i": 3 } as CSSProperties}>
            <button
              type="button"
              onClick={() => setOpcoes((v) => !v)}
              aria-expanded={opcoes}
              className="flex w-full items-center justify-between gap-3 px-5 py-4 text-sm font-semibold text-ink sm:px-6"
            >
              <span className="flex items-center gap-2.5">
                <SlidersHorizontal className="size-4 text-brand" /> Mais opções
              </span>
              <ChevronDown className={cx("size-4 text-muted transition-transform", opcoes && "rotate-180")} />
            </button>
            {opcoes && (
              <div className="grid animate-slide-up gap-5 border-t border-line px-5 py-5 sm:grid-cols-2 sm:px-6">
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
                <div className="sm:col-span-2">
                  <p className="text-sm font-semibold text-ink">Máximo de consultas nesta busca</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={rodando}
                      onClick={() => set({ limite: null })}
                      className={cx(
                        "h-10 rounded-xl border px-3.5 text-sm font-semibold transition",
                        form.limite === null ? "border-brand bg-brand-50 text-brand-700" : "border-line bg-card text-ink hover:border-brand-200",
                      )}
                    >
                      Automático ({n(sugerido)})
                    </button>
                    <label
                      className={cx(
                        "flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold transition",
                        form.limite !== null ? "border-brand bg-brand-50 text-brand-700" : "border-line bg-card text-ink",
                      )}
                    >
                      Definir
                      <input
                        id="limite"
                        type="number"
                        min={1}
                        max={maxPorBusca}
                        inputMode="numeric"
                        disabled={rodando}
                        value={form.limite ?? sugerido}
                        onChange={(e) => set({ limite: Math.max(1, Math.min(maxPorBusca, Math.floor(Number(e.target.value) || 1))) })}
                        className="h-7 w-16 rounded-lg border border-line bg-card px-2 text-center font-bold text-ink tabular-nums focus:border-brand focus:outline-none"
                        aria-label="Máximo de consultas"
                      />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="xl:sticky xl:top-8">
          <div className="cartao-noite relative overflow-hidden rounded-3xl p-6 text-white shadow-[0_24px_60px_-28px_rgb(3_171_201_/_0.65)] ring-1 ring-white/10">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold tracking-[0.18em] text-brand-300 uppercase">Sua busca</p>
                <p className="mt-3 text-6xl leading-none font-extrabold tracking-tight">
                  <AnimatedNumber value={form.alvo} />
                </p>
                <p className="mt-2 text-sm font-medium text-white/65">oportunidades novas</p>
              </div>
              <RadarSweep ativo pontos={PONTOS_POR_QUANTIDADE[form.alvo] ?? 8} tamanho={84} className="ring-1 ring-brand/30" />
            </div>

            <ul className="mt-6 space-y-3 text-sm">
              <LinhaResumo icone={publico ? VISUAL_PUBLICO[publico].icone : Tag}>{resumoPublico}</LinhaResumo>
              <LinhaResumo icone={MapPin} alerta={cidades.length === 0}>
                {resumoCidades}
              </LinhaResumo>
              <LinhaResumo icone={Gauge}>
                {semCota ? (
                  "Consultas do mês esgotadas"
                ) : (
                  <>
                    Até {n(limite)} {limite === 1 ? "consulta" : "consultas"}
                    {uso?.bloquear && <span className="text-white/50"> · {n(uso.restantes)} grátis no mês</span>}
                  </>
                )}
                {uso && uso.fonte !== "simulacao" && (
                  <button
                    type="button"
                    onClick={onAtualizarUso}
                    disabled={atualizandoUso}
                    className="ml-1.5 inline-grid size-6 place-items-center rounded-md align-middle text-white/40 transition hover:bg-white/10 hover:text-white"
                    aria-label="Atualizar consultas grátis"
                    title="Atualizar"
                  >
                    <RefreshCw className={cx("size-3.5", atualizandoUso && "animate-spin")} />
                  </button>
                )}
              </LinhaResumo>
            </ul>

            {semCota && uso ? (
              <p className="mt-5 rounded-xl bg-red-500/15 px-3.5 py-2.5 text-sm text-red-200 ring-1 ring-red-400/25">
                As consultas grátis voltam em <b>{formatarRenovacaoCurta(uso.renovaEm)}</b>.
              </p>
            ) : (
              cortadoPelaCota && (
                <p className="mt-5 rounded-xl bg-amber-400/12 px-3.5 py-2.5 text-sm text-amber-200 ring-1 ring-amber-300/25">
                  Restam só {n(teto)} consultas grátis no mês.
                </p>
              )
            )}

            {!rodando ? (
              <button
                type="button"
                onClick={onBuscar}
                disabled={!podeBuscar}
                className={cx(
                  "botao-brilho mt-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-brand text-base font-bold text-white transition",
                  "hover:-translate-y-0.5 hover:bg-brand-400 active:translate-y-0 active:scale-[0.99]",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300",
                  "disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:hover:translate-y-0",
                  podeBuscar && "animate-glow",
                )}
              >
                <Search className="size-5" />
                Buscar {n(form.alvo)} oportunidades
              </button>
            ) : (
              <button
                type="button"
                onClick={onParar}
                className="mt-6 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-white/10 text-base font-bold text-white ring-1 ring-white/20 transition hover:bg-red-500/25 hover:ring-red-400/40"
              >
                <CircleStop className="size-5" /> Parar a busca
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LinhaResumo({ icone: Icone, alerta, children }: { icone: typeof Store; alerta?: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className={cx("grid size-8 shrink-0 place-items-center rounded-lg", alerta ? "bg-amber-400/15 text-amber-300" : "bg-white/[0.07] text-brand-300")}>
        <Icone className="size-4" />
      </span>
      <span className={cx("min-w-0 font-medium", alerta ? "text-amber-200" : "text-white/90")}>{children}</span>
    </li>
  );
}

function CartaoProgresso({
  p,
  podeContinuar,
  onContinuar,
  onVerResultados,
}: {
  p: Progresso;
  podeContinuar: boolean;
  onContinuar: () => void;
  onVerResultados: () => void;
}) {
  const pct = p.alvo ? Math.min(100, Math.round((p.novos / p.alvo) * 100)) : 0;
  const final = !p.rodando && p.fim;
  const meta = p.fim === "alvo";
  const descartados = p.jaNaPlanilha + p.semCelular + p.repetidos + p.fechados;

  const mensagem = (() => {
    if (!final) return null;
    switch (p.fim) {
      case "alvo":
        return { tom: "ok", texto: "Tudo pronto. Revise a lista e envie para a planilha." };
      case "limite":
        return { tom: "aviso", texto: "Chegou ao máximo de consultas desta busca. Continue para encontrar o resto." };
      case "esgotado":
        return { tom: "aviso", texto: "Não há mais resultados nesta região. Tente outras cidades ou termos." };
      case "parado":
        return { tom: "aviso", texto: "Busca interrompida. Você pode continuar de onde parou." };
      default:
        return { tom: "erro", texto: p.erro || "A busca parou por um erro." };
    }
  })();

  return (
    <Card className={cx("overflow-hidden", meta && "ring-2 ring-emerald-200")}>
      <div className="flex items-center gap-4 p-5 sm:gap-5 sm:p-6">
        <RadarSweep ativo={p.rodando} pontos={p.novos} tamanho={68} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-extrabold text-ink sm:text-lg">
            {p.rodando ? "Buscando no Google Maps…" : meta ? "Meta atingida" : "Busca encerrada"}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted sm:text-sm">
            {p.rodando ? p.etapa || "Preparando a busca…" : `${n(p.unicos)} estabelecimentos na lista`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className={cx("text-3xl font-extrabold tabular-nums sm:text-4xl", meta ? "text-emerald-600" : "text-strong")}>
            <AnimatedNumber value={Math.min(p.novos, p.alvo)} />
            <span className="text-base font-bold text-muted sm:text-lg">/{n(p.alvo)}</span>
          </div>
          <div className="text-[11px] font-semibold text-muted sm:text-xs">novas</div>
        </div>
      </div>

      <div className="mx-5 h-2.5 overflow-hidden rounded-full bg-surface sm:mx-6">
        <div
          className={cx(
            "h-full overflow-hidden rounded-full bg-gradient-to-r transition-all duration-700 ease-out",
            meta ? "from-emerald-400 to-emerald-500" : "from-brand-400 to-brand-600",
          )}
          style={{ width: `${Math.max(pct, p.rodando ? 3 : 0)}%` }}
        >
          {p.rodando && <div className="shine size-full" />}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 py-4 sm:px-6">
        <Numero rotulo="Consultas" valor={`${n(p.consultas)}/${n(p.limite)}`} />
        <Numero rotulo="Analisados" valor={n(p.vistos)} />
        <Numero
          rotulo="Descartados"
          valor={n(descartados)}
          titulo={`${n(p.jaNaPlanilha)} já na planilha · ${n(p.semCelular)} sem telefone válido · ${n(p.repetidos)} repetidos${p.fechados ? ` · ${n(p.fechados)} fechados` : ""}`}
        />
      </div>

      {mensagem && (
        <div
          className={cx(
            "flex flex-col gap-3 border-t px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6",
            mensagem.tom === "ok" && "border-emerald-100 bg-emerald-50 text-emerald-900",
            mensagem.tom === "aviso" && "border-amber-100 bg-amber-50 text-amber-900",
            mensagem.tom === "erro" && "border-red-100 bg-red-50 text-red-800",
          )}
        >
          <p className="font-medium">{mensagem.texto}</p>
          <div className="flex shrink-0 flex-wrap gap-2">
            {podeContinuar && p.fim !== "alvo" && p.fim !== "esgotado" && p.fim !== "cota" && (
              <Button variant="outline" onClick={onContinuar} icon={<Play className="size-4" />}>
                Continuar a busca
              </Button>
            )}
            {p.unicos > 0 && (
              <Button onClick={onVerResultados}>
                Ver a lista <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}

      {p.avisos.length > 0 && (
        <details className="border-t border-line px-5 py-3 text-xs text-amber-900 sm:px-6">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-amber-700">
            <AlertTriangle className="size-3.5" /> {p.avisos.length} {p.avisos.length === 1 ? "aviso" : "avisos"}
          </summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-muted">
            {p.avisos.slice(0, 5).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function Numero({ rotulo, valor, titulo }: { rotulo: string; valor: string; titulo?: string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5" title={titulo}>
      <div className="text-base font-bold text-ink tabular-nums sm:text-lg">{valor}</div>
      <div className="text-[11px] font-medium text-muted sm:text-xs">{rotulo}</div>
    </div>
  );
}
