"use client";

import { ArrowUpToLine, Ban, ExternalLink, RefreshCw, RotateCcw, Search, Star, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import type { View } from "@/components/dashboard/Shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, cx, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { ORDEM_STATUS, STATUS, motivoLegivel } from "@/lib/voob/regras";
import type { AcaoBase, ConfigVoob, LeadBase, ListaBase, StatusLead } from "@/lib/voob/tipos";

import { Carregando, SeloSite, SeloStatus, Titulo, n, quando } from "./comum";

/**
 * A base da Voob (12/11/2026): todas as empresas que o Radar achou, com a situação de cada uma
 * (na base, na fila de hoje, recebeu, respondeu, quer ver...). Dá para chamar primeiro, tirar da fila, descartar e voltar.
 */

const ACOES: { id: AcaoBase; rotulo: string; icone: typeof Ban; de: StatusLead[]; variante: "outline" | "ghost" | "danger" }[] = [
  { id: "priorizar", rotulo: "Chamar primeiro", icone: ArrowUpToLine, de: ["novo"], variante: "outline" },
  { id: "tirar_da_fila", rotulo: "Tirar da fila", icone: Undo2, de: ["na_fila"], variante: "ghost" },
  { id: "restaurar", rotulo: "Voltar para a base", icone: RotateCcw, de: ["descartado", "pulado", "erro"], variante: "ghost" },
  { id: "descartar", rotulo: "Descartar", icone: Ban, de: ["novo", "pulado", "erro"], variante: "danger" },
];

function linhaDeTempo(l: LeadBase): string {
  if (l.status === "na_fila") return l.sai_em ? `sai ${quando(l.sai_em)}` : "na fila de hoje";
  if (l.saiu_em) return `pediu para parar ${quando(l.saiu_em)}`;
  if (l.respondeu_em) return `respondeu ${quando(l.respondeu_em)}`;
  if (l.retomada_em) return `retomada ${quando(l.retomada_em)}`;
  if (l.enviado_em) return `recebeu ${quando(l.enviado_em)}`;
  return `achada ${quando(l.created_at)}`;
}

export function VoobBase({
  cfg,
  erroCfg,
  onMudou,
  onIr,
}: {
  cfg: ConfigVoob | null;
  erroCfg: { mensagem: string } | null;
  onMudou: () => void;
  onIr: (v: View) => void;
}) {
  const toast = useToast();
  const [filtro, setFiltro] = useState<StatusLead | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [buscaFeita, setBuscaFeita] = useState("");
  const [dados, setDados] = useState<ListaBase | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [agindo, setAgindo] = useState<AcaoBase | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const qs = new URLSearchParams({ limite: "500" });
      if (filtro !== "todos") qs.set("status", filtro);
      if (buscaFeita) qs.set("busca", buscaFeita);
      setDados(await api<ListaBase>(`/api/voob/base?${qs}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não deu para ler a base agora.");
    } finally {
      setCarregando(false);
    }
  }, [filtro, buscaFeita]);

  useEffect(() => {
    const t = window.setTimeout(() => void carregar(), 0);
    return () => window.clearTimeout(t);
  }, [carregar]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const b = busca.trim();
      setBuscaFeita((atual) => {
        if (atual !== b) setMarcados(new Set());
        return b;
      });
    }, 350);
    return () => window.clearTimeout(t);
  }, [busca]);

  const filtrar = (f: StatusLead | "todos") => {
    setFiltro(f);
    setMarcados(new Set());
  };

  const itens = useMemo(() => dados?.itens ?? [], [dados]);
  const selecionados = useMemo(() => itens.filter((l) => marcados.has(l.id)), [itens, marcados]);
  const total = Object.values(dados?.contagem ?? {}).reduce((a, b) => a + (b ?? 0), 0);

  const agir = async (acao: AcaoBase) => {
    const def = ACOES.find((a) => a.id === acao)!;
    const ids = selecionados.filter((l) => def.de.includes(l.status)).map((l) => l.id);
    if (!ids.length) return;
    setAgindo(acao);
    try {
      const r = await api<{ afetados: number; na_fila: number }>("/api/voob/base/acao", { ids, acao });
      const extra = acao === "priorizar" ? (r.na_fila ? ` ${n(r.na_fila)} já entraram na fila de hoje.` : " Entram primeiro no próximo dia de envio.") : "";
      toast(`${def.rotulo}: ${n(r.afetados)} ${r.afetados === 1 ? "empresa" : "empresas"}.${extra}`, "success");
      setMarcados(new Set());
      await carregar();
      onMudou();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Não deu para fazer isso agora.", "error");
    } finally {
      setAgindo(null);
    }
  };

  const alternar = (id: string) =>
    setMarcados((m) => {
      const x = new Set(m);
      if (x.has(id)) x.delete(id);
      else x.add(id);
      return x;
    });

  return (
    <div className="space-y-5">
      <Titulo titulo="Base" texto="Todas as empresas que o Radar achou para a Voob e o que aconteceu com cada uma. O disparo chama daqui, na ordem em que entraram.">
        <Button variant="ghost" size="sm" onClick={() => void carregar()} loading={carregando} icon={<RefreshCw className="size-4" />}>
          Atualizar
        </Button>
      </Titulo>

      {!dados && !erro && <Carregando />}
      {erro && (
        <Card className="p-5 text-sm text-muted">
          {erro || erroCfg?.mensagem}{" "}
          <button className="font-semibold text-brand-700 underline" onClick={() => void carregar()}>
            Tentar de novo
          </button>
        </Card>
      )}

      {dados && (
        <>
          <div className="entrar flex flex-wrap gap-1.5" style={{ "--i": 0 } as CSSProperties}>
            <FiltroBotao ativo={filtro === "todos"} onClick={() => filtrar("todos")} rotulo="Todas" qtd={total} />
            {ORDEM_STATUS.filter((s) => (dados.contagem[s] ?? 0) > 0 || s === filtro).map((s) => (
              <FiltroBotao key={s} ativo={filtro === s} onClick={() => filtrar(s)} rotulo={STATUS[s].rotulo} qtd={dados.contagem[s] ?? 0} titulo={STATUS[s].dica} />
            ))}
          </div>

          <Card className="entrar overflow-hidden" style={{ "--i": 1 } as CSSProperties}>
            <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:px-5">
              <div className="relative min-w-52 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar por nome, bairro ou segmento" className={cx(inputClass, "pl-9")} />
              </div>
              <div className="flex flex-wrap gap-2">
                {ACOES.map((a) => {
                  const qtd = selecionados.filter((l) => a.de.includes(l.status)).length;
                  if (!qtd) return null;
                  const Icone = a.icone;
                  return (
                    <Button key={a.id} variant={a.variante} size="sm" onClick={() => void agir(a.id)} loading={agindo === a.id} icon={<Icone className="size-3.5" />}>
                      {a.rotulo} ({n(qtd)})
                    </Button>
                  );
                })}
              </div>
            </div>

            {itens.length ? (
              <ul className="divide-y divide-line">
                {itens.map((l) => (
                  <li key={l.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--color-brand)]"
                      checked={marcados.has(l.id)}
                      onChange={() => alternar(l.id)}
                      aria-label={`Escolher ${l.negocio}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold text-strong">{l.negocio}</span>
                        <SeloStatus status={l.status} />
                        <SeloSite situacao={l.site_situacao} url={l.site_url} problemas={l.site_problemas} />
                        {l.prioridade > 0 && l.status === "novo" && <Badge tone="brand">Primeiro da fila</Badge>}
                        {l.crm_lead_id && <Badge tone="green">No CRM</Badge>}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>{l.categoria || l.termo || "—"}</span>
                        {l.bairro && <span>· {l.bairro}</span>}
                        {l.nota !== null && (
                          <span className="inline-flex items-center gap-0.5 tabular-nums">
                            · <Star className="size-3 fill-amber-400 text-amber-400" /> {Number(l.nota).toLocaleString("pt-BR")} ({n(l.avaliacoes ?? 0)})
                          </span>
                        )}
                        <span>· {linhaDeTempo(l)}</span>
                      </p>
                      {l.site_situacao === "desatualizado" && l.site_problemas?.length ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Raio-X: {l.site_problemas.join("; ")}.</p>
                      ) : null}
                      {l.motivo && ["pulado", "erro", "novo", "descartado"].includes(l.status) && l.motivo !== "descartado" && (
                        <p className="mt-1 text-xs text-amber-700">{motivoLegivel(l.motivo)}</p>
                      )}
                    </div>
                    {l.maps_url && (
                      <a href={l.maps_url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg p-1.5 text-muted transition hover:bg-strong/5 hover:text-ink" title="Abrir no Google Maps">
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-8 text-center text-sm text-muted">
                {total ? "Nada com esse filtro." : "A base está vazia."}{" "}
                {!total && (
                  <button className="font-semibold text-brand-700 underline" onClick={() => onIr("buscar")}>
                    Fazer uma busca
                  </button>
                )}
              </div>
            )}
            {itens.length >= 500 && <p className="border-t border-line p-3 text-center text-xs text-muted">Mostrando as 500 primeiras. Use o filtro ou a procura para achar as outras.</p>}
          </Card>
          {cfg && (
            <p className="text-center text-xs text-muted">
              Para chamar agora: <b className="text-ink">{n(cfg.base_pronta)}</b> na base · hoje {n(cfg.hoje.enviados)} de {n(cfg.hoje.limite_efetivo)} já saíram
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FiltroBotao({ ativo, onClick, rotulo, qtd, titulo }: { ativo: boolean; onClick: () => void; rotulo: string; qtd: number; titulo?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      title={titulo}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
        ativo ? "bg-brand text-white ring-brand" : "bg-card text-ink ring-line hover:ring-brand-200",
      )}
    >
      {rotulo}
      <span className={cx("tabular-nums", ativo ? "text-white/80" : "text-muted")}>{n(qtd)}</span>
    </button>
  );
}
