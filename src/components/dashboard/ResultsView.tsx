"use client";

import {
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  Loader2,
  MapPinned,
  MessageCircle,
  Play,
  RefreshCw,
  Search,
  Send,
  Star,
  X,
} from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { AnimatedNumber } from "@/components/motion";
import { Badge, Button, Card, Stat, Toggle, cx, inputClass } from "@/components/ui";
import { downloadCsv } from "@/lib/client/csv";
import type { Progresso } from "@/lib/client/search-runner";
import { PHONE_KIND_LABEL, whatsappLink } from "@/lib/phone";
import type { Lead, LeadTipo } from "@/lib/types";

import { podeEnviar, type CheckState, type SearchMeta, type SearchStats } from "./Dashboard";

type FiltroFone = "todos" | "celular" | "fixo" | "sem";
type FiltroSituacao = "todos" | "novos" | "planilha" | "enviados";
type Ordem = "relevancia" | "nome" | "avaliacoes" | "nota" | "cidade";

const POR_PAGINA = 50;

function situacaoBadge(lead: Lead) {
  if (!lead.telefone && lead.planilha !== "enviado") return <span className="text-xs text-muted">—</span>;
  switch (lead.planilha) {
    case "enviado":
      return (
        <Badge tone="green">
          <CheckCircle2 className="size-3" /> Enviado
        </Badge>
      );
    case "existente":
      return (
        <Badge tone="gray" title="Este telefone já está na planilha: não é enviado de novo">
          Já na planilha
        </Badge>
      );
    case "optout":
      return (
        <Badge tone="red" title="Na planilha, pediu para não receber mensagens (optout)">
          Não quer contato
        </Badge>
      );
    case "novo":
      return <Badge tone="brand">Novo</Badge>;
    default:
      return (
        <Badge tone="gray" title="Ainda não deu para conferir na planilha">
          Não conferido
        </Badge>
      );
  }
}

function foneBadge(lead: Lead) {
  const tone = lead.telefoneTipo === "celular" ? "green" : lead.telefoneTipo === "fixo" ? "amber" : "gray";
  return <Badge tone={tone}>{PHONE_KIND_LABEL[lead.telefoneTipo]}</Badge>;
}

function motivoBloqueio(lead: Lead, incluirFixos: boolean): string {
  if (!lead.telefone) return "Sem telefone que dê para usar";
  if (lead.telefoneTipo === "fixo" && !incluirFixos) return "Telefone fixo: ligue 'Permitir telefone fixo' para escolher";
  if (lead.planilha === "existente") return "Já está na planilha";
  if (lead.planilha === "optout") return "Pediu para não receber mensagens";
  if (lead.planilha === "enviado") return "Já foi enviado agora";
  return "";
}

export function ResultsView({
  leads,
  onLeads,
  meta,
  stats,
  rodando,
  progresso,
  podeContinuar,
  onContinuar,
  check,
  selecionados,
  onSelecionados,
  incluirFixos,
  onIncluirFixos,
  paraEnviar,
  podeEnviarParaPlanilha,
  onEnviar,
  onReconferir,
  onNovaBusca,
  onConfig,
}: {
  leads: Lead[];
  onLeads: (l: Lead[]) => void;
  meta: SearchMeta | null;
  stats: SearchStats;
  rodando: boolean;
  progresso: Progresso | null;
  podeContinuar: boolean;
  onContinuar: () => void;
  check: CheckState;
  selecionados: Set<string>;
  onSelecionados: (s: Set<string>) => void;
  incluirFixos: boolean;
  onIncluirFixos: (v: boolean) => void;
  paraEnviar: number;
  podeEnviarParaPlanilha: boolean;
  onEnviar: () => void;
  onReconferir: () => void;
  onNovaBusca: () => void;
  onConfig: () => void;
}) {
  const [q, setQ] = useState("");
  const [fone, setFone] = useState<FiltroFone>("todos");
  const [tipo, setTipo] = useState<"todos" | LeadTipo>("todos");
  const [situacao, setSituacao] = useState<FiltroSituacao>("todos");
  const [ordem, setOrdem] = useState<Ordem>("relevancia");
  const [pagina, setPagina] = useState(1);

  const filtrados = useMemo(() => {
    const termo = q
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    let lista = leads.filter((l) => {
      if (fone === "celular" && l.telefoneTipo !== "celular") return false;
      if (fone === "fixo" && l.telefoneTipo !== "fixo") return false;
      if (fone === "sem" && l.telefone) return false;
      if (tipo !== "todos" && l.tipo !== tipo) return false;
      if (situacao === "novos" && l.planilha !== "novo" && l.planilha !== "desconhecido") return false;
      if (situacao === "planilha" && l.planilha !== "existente" && l.planilha !== "optout") return false;
      if (situacao === "enviados" && l.planilha !== "enviado") return false;
      if (termo) {
        const alvo = `${l.nome} ${l.telefone} ${l.telefoneExibicao} ${l.cidade} ${l.bairro} ${l.endereco} ${l.categoria}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
    if (ordem !== "relevancia") {
      lista = [...lista].sort((a, b) => {
        if (ordem === "nome") return a.nome.localeCompare(b.nome, "pt-BR");
        if (ordem === "cidade") return a.cidade.localeCompare(b.cidade, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR");
        if (ordem === "avaliacoes") return (b.avaliacoes ?? -1) - (a.avaliacoes ?? -1);
        return (b.nota ?? -1) - (a.nota ?? -1);
      });
    }
    return lista;
  }, [leads, q, fone, tipo, situacao, ordem]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);

  const elegiveisFiltrados = filtrados.filter((l) => podeEnviar(l, incluirFixos));
  const todosMarcados = elegiveisFiltrados.length > 0 && elegiveisFiltrados.every((l) => selecionados.has(l.id));
  const algunsMarcados = elegiveisFiltrados.some((l) => selecionados.has(l.id));

  const celulares = leads.filter((l) => l.telefoneTipo === "celular").length;
  const novos = leads.filter((l) => podeEnviar(l, incluirFixos)).length;
  const naPlanilha = leads.filter((l) => l.planilha === "existente" || l.planilha === "optout").length;
  const enviados = leads.filter((l) => l.planilha === "enviado").length;

  function alternar(id: string) {
    const s = new Set(selecionados);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    onSelecionados(s);
  }

  function marcarTodos() {
    const s = new Set(selecionados);
    if (todosMarcados) elegiveisFiltrados.forEach((l) => s.delete(l.id));
    else elegiveisFiltrados.forEach((l) => s.add(l.id));
    onSelecionados(s);
  }

  function trocarTipo(id: string, novo: LeadTipo) {
    onLeads(leads.map((l) => (l.id === id ? { ...l, tipo: novo } : l)));
  }

  function exportar() {
    const base = meta ? `${meta.termos[0]}-${meta.cidades[0]}` : "leads";
    const nome = `radar-lavacar-${base.normalize("NFD").replace(/[^\w-]+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filtrados, nome);
  }

  if (!leads.length) {
    return (
      <div className="grid place-items-center py-24 text-center">
        <div className="grid size-16 animate-float place-items-center rounded-2xl bg-brand-50 text-brand">
          {rodando ? <Loader2 className="size-7 animate-spin" /> : <Search className="size-7" />}
        </div>
        <h1 className="display mt-6 text-3xl text-navy">{rodando ? "Radar ligado…" : "O mapa está esperando você"}</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          {rodando
            ? "As oportunidades pingam aqui assim que o radar encontra."
            : "Faça uma caçada e os lava-jatos e lavadores autônomos que o radar achar aparecem aqui, prontos para a Carol."}
        </p>
        {!rodando && (
          <Button className="mt-6" onClick={onNovaBusca} icon={<Search className="size-4" />}>
            Começar uma caçada
          </Button>
        )}
      </div>
    );
  }

  const quando = meta ? new Date(meta.criadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Oportunidades na mesa</p>
          <h1 className="display mt-3 text-4xl text-navy">
            <AnimatedNumber value={leads.length} /> <span className="text-brand">{leads.length === 1 ? "lava-jato no radar" : "lava-jatos no radar"}</span>
          </h1>
          {meta && (
            <p className="mt-2 truncate text-sm text-muted">
              {meta.termos.join(", ")} · {meta.cidades.join(", ")} · {quando}
              {stats.repetidos > 0 && ` · ${stats.repetidos} repetido${stats.repetidos === 1 ? "" : "s"} tirado${stats.repetidos === 1 ? "" : "s"}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onReconferir} disabled={rodando || check.estado === "checando"} icon={<RefreshCw className="size-4" />}>
            Conferir planilha de novo
          </Button>
          <Button variant="outline" onClick={exportar} icon={<Download className="size-4" />} title="Baixa a lista (com os filtros atuais) para abrir no Excel">
            Baixar lista
          </Button>
          <Button variant="dark" onClick={onNovaBusca} icon={<Search className="size-4" />}>
            Nova caçada
          </Button>
        </div>
      </header>

      {progresso && !rodando && progresso.fim && (
        <ResumoBusca p={progresso} podeContinuar={podeContinuar} onContinuar={onContinuar} />
      )}

      {check.estado === "checando" && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <Loader2 className="size-4 animate-spin" /> Batendo com a planilha para ninguém receber mensagem repetida…
        </div>
      )}
      {check.estado === "erro" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              <b>A planilha não respondeu.</b> {check.erro} Por segurança, o envio fica travado até ela voltar: assim ninguém recebe
              mensagem repetida.
            </span>
          </span>
          <Button size="sm" variant="danger" onClick={onConfig}>
            Ver configuração
          </Button>
        </div>
      )}

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div style={{ "--i": 0 } as CSSProperties}>
          <Stat label="No radar" value={leads.length} hint={`sem repetidos (${stats.brutos} vistos no Google)`} />
        </div>
        <div style={{ "--i": 1 } as CSSProperties}>
          <Stat label="Com celular" value={celulares} hint="grande chance de ter WhatsApp" tone="green" />
        </div>
        <div style={{ "--i": 2 } as CSSProperties}>
          <Stat label="Prontos para a Carol" value={novos} hint={incluirFixos ? "celular ou fixo, fora da planilha" : "celular e fora da planilha"} tone="brand" />
        </div>
        <div style={{ "--i": 3 } as CSSProperties}>
          <Stat label="Já na planilha" value={naPlanilha} hint={enviados ? `+ ${enviados} enviados agora` : "ficam de fora, sem repetir"} tone="amber" />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPagina(1);
              }}
              placeholder="Achar alguém na lista: nome, telefone, bairro…"
              className={cx(inputClass, "pl-10")}
            />
            {q && (
              <button onClick={() => setQ("")} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink" aria-label="Limpar filtro">
                <X className="size-4" />
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
            <select value={fone} onChange={(e) => (setFone(e.target.value as FiltroFone), setPagina(1))} className={cx(inputClass, "lg:w-auto")} aria-label="Telefone">
              <option value="todos">Todo telefone</option>
              <option value="celular">Só celular</option>
              <option value="fixo">Só fixo</option>
              <option value="sem">Sem telefone</option>
            </select>
            <select value={tipo} onChange={(e) => (setTipo(e.target.value as "todos" | LeadTipo), setPagina(1))} className={cx(inputClass, "lg:w-auto")} aria-label="Tipo">
              <option value="todos">Empresa e autônomo</option>
              <option value="Empresa">Só empresa</option>
              <option value="Autônomo">Só autônomo</option>
            </select>
            <select
              value={situacao}
              onChange={(e) => (setSituacao(e.target.value as FiltroSituacao), setPagina(1))}
              className={cx(inputClass, "lg:w-auto")}
              aria-label="Situação"
            >
              <option value="todos">Todos</option>
              <option value="novos">Só novos</option>
              <option value="planilha">Só já na planilha</option>
              <option value="enviados">Só enviados agora</option>
            </select>
            <div className="relative">
              <ArrowDownUp className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={cx(inputClass, "pl-8 lg:w-auto")} aria-label="Ordenar">
                <option value="relevancia">Ordem do Google</option>
                <option value="avaliacoes">Mais avaliações</option>
                <option value="nota">Melhor nota</option>
                <option value="nome">Nome (A–Z)</option>
                <option value="cidade">Cidade</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/60 px-4 py-2.5">
          <label className="flex items-center gap-2.5 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              className="check"
              checked={todosMarcados}
              ref={(el) => {
                if (el) el.indeterminate = !todosMarcados && algunsMarcados;
              }}
              onChange={marcarTodos}
              disabled={!elegiveisFiltrados.length}
            />
            Marcar todos os {elegiveisFiltrados.length} prontos para a Carol{filtrados.length !== leads.length && " (com este filtro)"}
          </label>
          <Toggle checked={incluirFixos} onChange={onIncluirFixos} label="Permitir telefone fixo" hint="Fixo quase nunca tem WhatsApp." />
        </div>

        {/* Tabela (desktop) */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-sm">
            <thead className="text-[11px] font-bold tracking-wider text-muted uppercase">
              <tr className="border-b border-line">
                <th className="w-10 py-3 pl-4" />
                <th className="py-3 pr-4">Estabelecimento</th>
                <th className="py-3 pr-4">Telefone</th>
                <th className="py-3 pr-4">Tipo</th>
                <th className="py-3 pr-4">Cidade</th>
                <th className="py-3 pr-4">Avaliação</th>
                <th className="py-3 pr-4">Planilha</th>
                <th className="py-3 pr-4 text-right">Links</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => {
                const elegivel = podeEnviar(l, incluirFixos);
                const marcado = selecionados.has(l.id) && elegivel;
                return (
                  <tr key={l.id} className={cx("border-b border-line/70 align-top transition-colors last:border-0", marcado ? "bg-brand-50/50" : "hover:bg-surface/70")}>
                    <td className="py-3.5 pl-4">
                      <input
                        type="checkbox"
                        className="check mt-0.5"
                        checked={marcado}
                        disabled={!elegivel}
                        title={motivoBloqueio(l, incluirFixos)}
                        onChange={() => alternar(l.id)}
                        aria-label={`Selecionar ${l.nome}`}
                      />
                    </td>
                    <td className="max-w-[320px] py-3.5 pr-4">
                      <div className="truncate font-semibold text-ink" title={l.nome}>
                        {l.nome}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted" title={l.endereco}>
                        {[l.categoria, l.bairro].filter(Boolean).join(" · ") || l.endereco || (l.semPontoFisico ? "Atende no endereço do cliente" : "")}
                      </div>
                    </td>
                    <td className="py-3.5 pr-4 whitespace-nowrap">
                      {l.telefone ? (
                        <div className="font-medium text-ink tabular-nums">{l.telefoneExibicao}</div>
                      ) : (
                        <div className="text-muted">{l.telefoneExibicao || "—"}</div>
                      )}
                      <div className="mt-1">{foneBadge(l)}</div>
                    </td>
                    <td className="py-3.5 pr-4">
                      <select
                        value={l.tipo}
                        onChange={(e) => trocarTipo(l.id, e.target.value as LeadTipo)}
                        title={l.tipoMotivos.join(" · ")}
                        className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-ink focus:border-brand focus:outline-none"
                      >
                        <option>Empresa</option>
                        <option>Autônomo</option>
                      </select>
                    </td>
                    <td className="py-3.5 pr-4 whitespace-nowrap text-ink">
                      {l.cidade}
                      {l.uf && <span className="text-muted"> · {l.uf}</span>}
                    </td>
                    <td className="py-3.5 pr-4 whitespace-nowrap">
                      {l.nota != null ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Star className="size-3.5 fill-amber-400 text-amber-400" />
                          {l.nota.toFixed(1).replace(".", ",")}
                          <span className="font-normal text-muted">({l.avaliacoes ?? 0})</span>
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="py-3.5 pr-4">{situacaoBadge(l)}</td>
                    <td className="py-3.5 pr-4">
                      <div className="flex justify-end gap-1">
                        {l.telefoneTipo === "celular" && (
                          <a href={whatsappLink(l.telefone)} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-emerald-50 hover:text-emerald-600" title="Abrir no WhatsApp">
                            <MessageCircle className="size-4" />
                          </a>
                        )}
                        {l.site && (
                          <a href={l.site} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-brand-50 hover:text-brand-700" title="Site">
                            <Globe className="size-4" />
                          </a>
                        )}
                        {l.mapsUrl && (
                          <a href={l.mapsUrl} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-muted hover:bg-brand-50 hover:text-brand-700" title="Google Maps">
                            <MapPinned className="size-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cartões (celular) */}
        <ul className="divide-y divide-line md:hidden">
          {visiveis.map((l) => {
            const elegivel = podeEnviar(l, incluirFixos);
            const marcado = selecionados.has(l.id) && elegivel;
            return (
              <li key={l.id} className={cx("flex gap-3 p-4", marcado && "bg-brand-50/50")}>
                <input
                  type="checkbox"
                  className="check mt-1"
                  checked={marcado}
                  disabled={!elegivel}
                  onChange={() => alternar(l.id)}
                  aria-label={`Selecionar ${l.nome}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink">{l.nome}</p>
                    {situacaoBadge(l)}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted">{[l.bairro, l.cidade].filter(Boolean).join(" · ")}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink tabular-nums">{l.telefoneExibicao || "Sem telefone"}</span>
                    {foneBadge(l)}
                    <select
                      value={l.tipo}
                      onChange={(e) => trocarTipo(l.id, e.target.value as LeadTipo)}
                      className="rounded-lg border border-line bg-white px-2 py-0.5 text-xs font-semibold"
                      aria-label="Tipo"
                    >
                      <option>Empresa</option>
                      <option>Autônomo</option>
                    </select>
                    {l.nota != null && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <Star className="size-3 fill-amber-400 text-amber-400" /> {l.nota.toFixed(1).replace(".", ",")} ({l.avaliacoes ?? 0})
                      </span>
                    )}
                    {l.mapsUrl && (
                      <a href={l.mapsUrl} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-700">
                        Maps <ExternalLink className="inline size-3" />
                      </a>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {!filtrados.length && <p className="px-4 py-12 text-center text-sm text-muted">Ninguém aparece com esses filtros. Afrouxa um pouco que eles voltam.</p>}

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm">
            <span className="text-muted tabular-nums">
              {(paginaAtual - 1) * POR_PAGINA + 1}–{Math.min(paginaAtual * POR_PAGINA, filtrados.length)} de {filtrados.length}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Barra de envio */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6 sm:pb-5 lg:left-64 lg:px-10">
        <div className="mx-auto flex max-w-7xl animate-slide-up items-center justify-between gap-3 rounded-2xl bg-navy py-2.5 pr-2.5 pl-4 text-white shadow-2xl sm:py-3 sm:pr-3 sm:pl-5">
          <div className="min-w-0 text-sm leading-tight">
            <AnimatedNumber value={paraEnviar} className="text-base font-extrabold" />{" "}
            <span className="text-white/60">
              {paraEnviar === 1 ? "oportunidade marcada" : "oportunidades marcadas"}
              <span className="hidden sm:inline"> para a planilha</span>
            </span>
            {!podeEnviarParaPlanilha && check.estado === "erro" && <span className="block text-xs text-red-300">Planilha indisponível</span>}
          </div>
          <div className="flex gap-2">
            {paraEnviar > 0 && (
              <Button variant="ghost" className="hidden text-white/60 hover:bg-white/10 hover:text-white sm:inline-flex" onClick={() => onSelecionados(new Set())}>
                Desmarcar
              </Button>
            )}
            <Button
              onClick={onEnviar}
              disabled={!paraEnviar || !podeEnviarParaPlanilha || rodando}
              icon={<Send className="size-4" />}
              className={cx(paraEnviar > 0 && podeEnviarParaPlanilha && !rodando && "animate-glow")}
            >
              <span className="sm:hidden">Mandar</span>
              <span className="hidden sm:inline">Mandar para a planilha</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResumoBusca({ p, podeContinuar, onContinuar }: { p: Progresso; podeContinuar: boolean; onContinuar: () => void }) {
  const n = (v: number) => v.toLocaleString("pt-BR");
  const faltam = Math.max(0, p.alvo - p.novos);
  const completo = p.novos >= p.alvo;
  const continuar = podeContinuar && !completo && p.fim !== "esgotado" && p.fim !== "cota";
  return (
    <div
      className={cx(
        "flex animate-enter flex-col gap-3 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        completo ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      <p className="flex items-start gap-2.5">
        {completo ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
        <span>
          {completo ? (
            <>
              <b>Meta batida!</b> {p.alvo === 1 ? "A oportunidade nova já está marcada" : `As ${n(p.alvo)} oportunidades novas já estão marcadas`}.
              Dá uma conferida e manda ver em <b>Mandar para a planilha</b>.
            </>
          ) : p.fim === "esgotado" ? (
            <>
              Varremos tudo: <b>{n(p.novos)}</b> de {n(p.alvo)} oportunidades. O Google não tem mais nada para esses termos e lugares.
              Bora abrir o mapa com outras cidades, bairros ou termos.
            </>
          ) : p.fim === "cota" ? (
            <>
              Pegamos <b>{n(p.novos)}</b> de {n(p.alvo)} oportunidades. {p.erro}
            </>
          ) : (
            <>
              Pegamos <b>{n(p.novos)}</b> de {n(p.alvo)} oportunidades
              {p.fim === "limite" ? ` (bateu o teto de ${n(p.limite)} consultas)` : ""}. Faltam {n(faltam)}: quer ir atrás?
            </>
          )}
        </span>
      </p>
      {continuar && (
        <Button size="sm" variant="outline" onClick={onContinuar} icon={<Play className="size-3.5" />}>
          Continuar a caçada
        </Button>
      )}
    </div>
  );
}
