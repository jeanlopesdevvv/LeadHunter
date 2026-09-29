"use client";

import { AlertTriangle, ArrowRight, CircleStop, MapPin, Plus, Radar, Search, Tag } from "lucide-react";

import { Badge, Button, Card, Field, inputClass, Segmented, Toggle, cx } from "@/components/ui";
import { DEPTHS, estimateRequests, splitLines, type Depth } from "@/lib/geo";
import type { Progress } from "@/lib/client/search-runner";

import type { SearchStats } from "./Dashboard";

export interface SearchForm {
  termos: string;
  cidades: string;
  profundidade: Depth;
  ignorarFechados: boolean;
}

const SUGESTOES_TERMOS = [
  "lava jato",
  "lava rápido",
  "estética automotiva",
  "lavagem automotiva",
  "higienização automotiva",
  "polimento automotivo",
  "lavagem a domicílio",
];
const SUGESTOES_CIDADES = ["Belo Horizonte - MG", "Contagem - MG", "Nova Lima - MG", "Betim - MG", "São Paulo - SP", "Rio de Janeiro - RJ"];

const COTA_GRATIS = 1000;
const USD_POR_MIL = 35;

function addLine(text: string, value: string) {
  const lines = splitLines(text);
  if (lines.some((l) => l.toLowerCase() === value.toLowerCase())) return text;
  return [...lines, value].join("\n");
}

export function SearchView({
  form,
  onForm,
  rodando,
  progress,
  stats,
  totalUnicos,
  maxConsultas,
  placesConfigurada,
  onBuscar,
  onParar,
  onVerResultados,
}: {
  form: SearchForm;
  onForm: (f: SearchForm) => void;
  rodando: boolean;
  progress: Progress | null;
  stats: SearchStats;
  totalUnicos: number;
  maxConsultas: number;
  placesConfigurada: boolean;
  onBuscar: () => void;
  onParar: () => void;
  onVerResultados: () => void;
}) {
  const termos = splitLines(form.termos);
  const cidades = splitLines(form.cidades);
  const consultas = estimateRequests(termos.length, cidades.length, form.profundidade);
  const grid = DEPTHS[form.profundidade].grid;
  const potencial = termos.length * cidades.length * grid * grid * 60;
  const acimaDoLimite = consultas > maxConsultas;
  const pct = progress ? Math.min(100, Math.round((progress.feitas / Math.max(1, progress.previstas)) * 100)) : 0;
  const set = (patch: Partial<SearchForm>) => onForm({ ...form, ...patch });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Prospecção</p>
        <h1 className="display mt-3 text-4xl text-navy sm:text-5xl">
          Encontre lava-jatos. <span className="text-brand">Envie para a Carol.</span>
        </h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          Busca no Google Maps pela API oficial, junta os resultados sem repetidos e confere na planilha quem já recebeu mensagem.
        </p>
      </header>

      {!placesConfigurada && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            A chave da Google Places API ainda não foi configurada. Veja a aba <b>Configuração</b>.
          </span>
        </div>
      )}

      <Card className="p-5 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-2">
          <Field label="O que buscar" hint="um termo por linha" htmlFor="termos">
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
                <button
                  key={s}
                  type="button"
                  disabled={rodando}
                  onClick={() => set({ termos: addLine(form.termos, s) })}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand-200 hover:text-brand-700"
                >
                  <Plus className="size-3" /> {s}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Onde" hint="uma cidade ou bairro por linha" htmlFor="cidades">
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
                <button
                  key={s}
                  type="button"
                  disabled={rodando}
                  onClick={() => set({ cidades: addLine(form.cidades, s) })}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-xs font-medium text-muted transition hover:border-brand-200 hover:text-brand-700"
                >
                  <Plus className="size-3" /> {s}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-7">
          <p className="mb-2 text-sm font-semibold text-ink">Profundidade</p>
          <Segmented
            value={form.profundidade}
            onChange={(v) => !rodando && set({ profundidade: v })}
            options={(Object.keys(DEPTHS) as Depth[]).map((k) => ({ value: k, label: DEPTHS[k].label, hint: DEPTHS[k].descricao }))}
          />
          <p className="mt-2 text-xs text-muted">
            O Google entrega no máximo 60 resultados por consulta. Em cidades grandes, a varredura Ampla ou Máxima divide o mapa em áreas e
            encontra muito mais lava-jatos.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-5 border-t border-line pt-6 lg:flex-row lg:items-center lg:justify-between">
          <Toggle
            checked={form.ignorarFechados}
            onChange={(v) => set({ ignorarFechados: v })}
            label="Ignorar estabelecimentos fechados"
            hint="Remove os marcados como fechados temporária ou definitivamente."
          />
          <div className={cx("rounded-xl px-4 py-3 text-sm", acimaDoLimite ? "bg-red-50 text-red-800" : "bg-surface text-muted")}>
            <span className="font-bold text-ink tabular-nums">até {consultas}</span> consultas ·{" "}
            <span className="tabular-nums">até {potencial.toLocaleString("pt-BR")}</span> resultados
            <span className="block text-xs">
              {acimaDoLimite
                ? `Acima do limite de ${maxConsultas} consultas por busca.`
                : `Cota grátis: ${COTA_GRATIS.toLocaleString("pt-BR")} consultas/mês. Acima disso ≈ US$ ${((consultas / 1000) * USD_POR_MIL).toFixed(2).replace(".", ",")}.`}
            </span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {!rodando ? (
            <Button size="lg" onClick={onBuscar} disabled={!termos.length || !cidades.length || acimaDoLimite || !placesConfigurada} icon={<Search className="size-4" />}>
              Buscar leads
            </Button>
          ) : (
            <Button size="lg" variant="danger" onClick={onParar} icon={<CircleStop className="size-4" />}>
              Parar busca
            </Button>
          )}
          {!rodando && totalUnicos > 0 && (
            <Button size="lg" variant="outline" onClick={onVerResultados}>
              Ver últimos resultados <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </Card>

      {progress && (
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
            <div className="flex items-center gap-4">
              <div className={cx("grid size-12 place-items-center rounded-2xl", rodando ? "bg-brand-50 text-brand" : "bg-emerald-50 text-emerald-600")}>
                <Radar className={cx("size-6", rodando && "animate-pulse")} />
              </div>
              <div>
                <p className="text-sm font-bold text-ink">{rodando ? "Buscando…" : progress.etapa}</p>
                <p className="mt-0.5 max-w-md truncate text-xs text-muted">{rodando ? progress.etapa : `${progress.feitas} consultas feitas`}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6 text-right">
              <div>
                <div className="text-2xl font-extrabold text-ink tabular-nums">{totalUnicos}</div>
                <div className="text-[11px] font-semibold text-muted">únicos</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-muted tabular-nums">{stats.repetidos}</div>
                <div className="text-[11px] font-semibold text-muted">repetidos</div>
              </div>
              <div>
                <div className="text-2xl font-extrabold text-muted tabular-nums">{stats.fechados}</div>
                <div className="text-[11px] font-semibold text-muted">fechados</div>
              </div>
            </div>
          </div>
          <div className="h-1.5 bg-surface">
            <div className="h-full bg-brand transition-all duration-500" style={{ width: `${rodando ? pct : 100}%` }} />
          </div>
          <div className="flex items-center justify-between px-5 py-2.5 text-xs text-muted sm:px-7">
            <span className="tabular-nums">
              {progress.feitas}/{Math.max(progress.feitas, progress.previstas)} consultas
            </span>
            <span className="tabular-nums">{rodando ? `${pct}%` : "100%"}</span>
          </div>
          {progress.erros.length > 0 && (
            <div className="border-t border-line bg-amber-50/60 px-5 py-3 text-xs text-amber-900 sm:px-7">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-3.5" /> {progress.erros.length} aviso(s)
              </p>
              <ul className="list-disc space-y-0.5 pl-5">
                {progress.erros.slice(0, 5).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {!progress && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["1", "Busque", "Termos × cidades direto na base oficial do Google."],
            ["2", "Revise", "Veja celular ou fixo, tipo e quem já está na planilha."],
            ["3", "Envie", "Os novos vão para a aba leads como pendente."],
          ].map(([n, t, d]) => (
            <div key={n} className="flex gap-3 rounded-2xl border border-dashed border-line p-4">
              <Badge tone="brand" className="size-6 justify-center p-0 text-xs">
                {n}
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
