"use client";

import { Check, CirclePause, CirclePlay, Clock, MessageSquareText, RefreshCw, Save, ShieldAlert, Smartphone, X } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";

import type { View } from "@/components/dashboard/Shell";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Modal, Toggle, cx, inputClass } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { DIAS_SEMANA, custoEstimado, reais, textoDias, textoPausa } from "@/lib/voob/regras";
import type { ConfigVoob } from "@/lib/voob/tipos";

import { Carregando, Chip, PreviaMensagem, Titulo, n, quando } from "./comum";

/**
 * Disparo da Voob (12/11/2026): ligar/desligar, o que falta para ligar, o número, as mensagens e o ritmo.
 * Quem manda é o Voob CRM: o Radar só muda a configuração; o pg_cron (a cada 10 min) enche a fila do dia
 * e o motor de sempre envia, com o porteiro da prospecção conferindo cada mensagem na hora de sair.
 */

type Ritmo = Pick<ConfigVoob["empresa"], "limite_dia" | "dias" | "hora_inicio" | "hora_fim" | "intervalo_min" | "retomada_ligada" | "retomada_dias">;

const ritmoDe = (c: ConfigVoob): Ritmo => ({
  limite_dia: c.empresa.limite_dia,
  dias: [...c.empresa.dias].sort(),
  hora_inicio: c.empresa.hora_inicio,
  hora_fim: c.empresa.hora_fim,
  intervalo_min: c.empresa.intervalo_min,
  retomada_ligada: c.empresa.retomada_ligada,
  retomada_dias: c.empresa.retomada_dias,
});

function mudancas(antes: Ritmo, depois: Ritmo): Partial<Ritmo> {
  const m: Partial<Ritmo> = {};
  for (const k of Object.keys(depois) as (keyof Ritmo)[]) {
    if (JSON.stringify(antes[k]) !== JSON.stringify(depois[k])) (m as Record<string, unknown>)[k] = depois[k];
  }
  return m;
}

const SELO = {
  ligado: { texto: "Ligado", selo: "bg-emerald-50 text-emerald-700 ring-emerald-200", ponto: "bg-emerald-500 text-emerald-500" },
  pausado: { texto: "Pausado", selo: "bg-red-50 text-red-700 ring-red-200", ponto: "bg-red-500 text-red-500" },
  desligado: { texto: "Desligado", selo: "bg-slate-100 text-slate-700 ring-slate-200", ponto: "bg-slate-400 text-slate-400" },
};

export function VoobDisparo({
  cfg,
  erro,
  onCfg,
  onRecarregar,
  onIr,
}: {
  cfg: ConfigVoob | null;
  erro: { mensagem: string; status: number } | null;
  onCfg: (c: ConfigVoob) => void;
  onRecarregar: () => void;
  onIr: (v: View) => void;
}) {
  const toast = useToast();
  // O que está sendo editado vale só para a versão da configuração em que foi feito (salvou ou mudou fora: recomeça).
  const [edicao, setEdicao] = useState<{ chave: string; r: Ritmo } | null>(null);
  const chave = cfg?.empresa.updated_at ?? "";
  const ritmo: Ritmo | null = cfg ? (edicao?.chave === chave ? edicao.r : ritmoDe(cfg)) : null;
  const setRitmo = (r: Ritmo) => setEdicao({ chave, r });
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState<null | boolean>(null);
  const [ligando, setLigando] = useState(false);
  const [canal, setCanal] = useState("");

  const pendentes = useMemo(() => (cfg && ritmo ? mudancas(ritmoDe(cfg), ritmo) : {}), [cfg, ritmo]);
  const temMudanca = Object.keys(pendentes).length > 0;

  if (!cfg || !ritmo) {
    return (
      <div className="space-y-4">
        <Titulo titulo="Disparo" texto="A 1ª mensagem da Voob sai sozinha, pelo WhatsApp oficial da prospecção, 20 por dia." />
        {erro ? <ComoLigarOCrm erro={erro.mensagem} onTentar={onRecarregar} /> : <Carregando />}
      </div>
    );
  }

  const e = cfg.empresa;
  const estado = e.ligado ? "ligado" : e.pausado_motivo && e.pausado_motivo !== "manual" ? "pausado" : "desligado";
  const selo = SELO[estado];
  const faltam = cfg.prontidao.filter((p) => p.id !== "ligado" && p.id !== "base" && !p.ok);
  const podeLigar = faltam.length === 0;
  const h = cfg.hoje;

  const salvar = async (m: Record<string, unknown>, ok: string) => {
    setSalvando(true);
    try {
      onCfg(await api<ConfigVoob>("/api/voob/config", { mudancas: m }));
      toast(ok, "success");
    } catch (x) {
      toast(x instanceof ApiError ? x.message : "Não deu para salvar agora.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const ligar = async (ligado: boolean) => {
    setLigando(true);
    try {
      const c = await api<ConfigVoob>("/api/voob/ligar", { ligado });
      onCfg(c);
      toast(ligado ? `Ligado. ${c.hoje.na_fila ? `${n(c.hoje.na_fila)} já estão na fila de hoje.` : "A fila enche no próximo horário de envio."}` : "Desligado. O que estava na fila voltou para a base.", "success");
      setConfirmar(null);
    } catch (x) {
      toast(x instanceof ApiError ? x.message : "Não deu para mudar agora.", "error");
    } finally {
      setLigando(false);
    }
  };

  return (
    <div className="space-y-5">
      <Titulo
        titulo="Disparo"
        texto={`A 1ª mensagem sai sozinha pelo WhatsApp oficial da prospecção, ${textoDias(e.dias)}, das ${e.hora_inicio} às ${e.hora_fim}. A ${e.agente} atende quem responder.`}
      >
        <Button variant="ghost" size="sm" onClick={onRecarregar} icon={<RefreshCw className="size-4" />}>
          Atualizar
        </Button>
      </Titulo>

      {/* Situação + ligar/desligar */}
      <div className={cx("entrar rounded-2xl", e.ligado && "borda-viva p-px")} style={{ "--i": 0 } as CSSProperties}>
        <Card className={cx("overflow-hidden", e.ligado && "border-transparent")}>
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="min-w-0 flex-1">
              <span className={cx("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold ring-1 ring-inset", selo.selo)}>
                <span className={cx("size-2 rounded-full", selo.ponto, e.ligado && "anel-pulso")} />
                {selo.texto}
              </span>
              <p className="mt-2 text-sm text-ink">
                {e.ligado
                  ? h.no_horario
                    ? "Mandando a 1ª mensagem para quem está na base, uma de cada vez."
                    : `Volta a mandar ${quando(h.proxima_abertura)}.`
                  : estado === "pausado"
                    ? textoPausa(e.pausado_motivo)
                    : podeLigar
                      ? "Pronto para ligar."
                      : `Para ligar, falta: ${faltam.map((f) => f.texto.charAt(0).toLowerCase() + f.texto.slice(1)).join("; ")}.`}
              </p>
              <p className="mt-2 text-xs text-muted tabular-nums">
                Hoje: <b className="text-ink">{n(h.enviados)}</b> de <b className="text-ink">{n(h.limite_efetivo)}</b> enviadas
                {h.na_fila > 0 && <> · {n(h.na_fila)} na fila</>}
                {h.limite_efetivo < h.limite && <> · limite pela metade (qualidade do número)</>} · base para chamar: <b className="text-ink">{n(cfg.base_pronta)}</b>
              </p>
              {e.pausado_em && !e.ligado && <p className="mt-1 text-[11px] text-muted">Desde {quando(e.pausado_em)}.</p>}
            </div>
            {e.ligado ? (
              <Button variant="danger" size="lg" onClick={() => setConfirmar(false)} icon={<CirclePause className="size-5" />}>
                Desligar
              </Button>
            ) : (
              <Button size="lg" onClick={() => setConfirmar(true)} disabled={!podeLigar} icon={<CirclePlay className="size-5" />}>
                Ligar a prospecção
              </Button>
            )}
          </div>
          <ul className="grid gap-x-6 gap-y-1.5 border-t border-line bg-surface/60 px-5 py-3 sm:grid-cols-2 sm:px-6">
            {cfg.prontidao.map((p) => (
              <li key={p.id} className={cx("flex items-center gap-2 text-sm", p.ok ? "text-ink" : "text-muted")}>
                {p.ok ? <Check className="size-4 shrink-0 text-emerald-600" /> : <X className="size-4 shrink-0 text-slate-400" />}
                {p.texto}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* O número */}
        <Bloco i={1} icone={<Smartphone className="size-4" />} titulo="Número da prospecção">
          {cfg.numero ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-strong">
                  {cfg.numero.nome} · final {cfg.numero.final}
                </span>
                <Badge tone={cfg.numero.conectado ? "green" : "red"}>{cfg.numero.conectado ? "Conectado" : "Desconectado"}</Badge>
                {cfg.numero.qualidade && (
                  <Badge tone={cfg.numero.qualidade_ruim ? "red" : /yellow|medium/i.test(cfg.numero.qualidade) ? "amber" : "green"}>
                    Qualidade {/green|high/i.test(cfg.numero.qualidade) ? "verde" : /yellow|medium/i.test(cfg.numero.qualidade) ? "amarela" : cfg.numero.qualidade_ruim ? "vermelha" : cfg.numero.qualidade}
                  </Badge>
                )}
                {cfg.numero.teste && <Badge tone="amber">Modo teste: só {n(cfg.numero.teste_qtd)} {cfg.numero.teste_qtd === 1 ? "número recebe" : "números recebem"}</Badge>}
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">CRM</dt>
                <dd className="text-ink">{cfg.numero.crm ?? "—"}</dd>
                <dt className="text-muted">Quem responde vira lead</dt>
                <dd className="text-ink">{cfg.numero.criar_leads ? (cfg.numero.etapa ? `em “${cfg.numero.etapa}”` : "sim") : "não (ligue “criar leads” no número)"}</dd>
                <dt className="text-muted">IA atende</dt>
                <dd className="text-ink">{cfg.numero.ia_ativa ? `sim, a ${e.agente}` : "não (ligue a IA no número)"}</dd>
              </dl>
              {!e.ligado && (
                <button type="button" className="text-xs font-semibold text-brand-700 underline" onClick={() => void salvar({ canal_id: null }, "Número tirado do Radar.")}>
                  Trocar o número
                </button>
              )}
            </div>
          ) : cfg.numeros_disponiveis.length ? (
            <div className="space-y-3">
              <p className="text-sm text-muted">Escolha o número que vai fazer a prospecção (o da Renata não aparece aqui: ele não faz prospecção fria).</p>
              <select value={canal} onChange={(x) => setCanal(x.target.value)} className={inputClass}>
                <option value="">Escolha…</option>
                {cfg.numeros_disponiveis.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome} · final {d.final} · {d.crm} {d.status !== "conectado" ? `(${d.status})` : ""}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!canal} loading={salvando} onClick={() => void salvar({ canal_id: canal }, "Número escolhido.")}>
                Usar este número
              </Button>
            </div>
          ) : (
            <ComoConectar />
          )}
        </Bloco>

        {/* As mensagens */}
        <Bloco i={2} icone={<MessageSquareText className="size-4" />} titulo="Mensagens">
          <div className="space-y-3">
            <SituacaoModelo titulo="1ª mensagem" prefixo={e.modelo_prefixo} m={cfg.modelos.abertura} semNumero={!cfg.numero} />
            <SituacaoModelo titulo="Retomada (opcional)" prefixo={e.retomada_prefixo} m={cfg.modelos.retomada} semNumero={!cfg.numero} />
            <details className="group rounded-xl bg-surface p-3 ring-1 ring-line">
              <summary className="cursor-pointer text-xs font-semibold text-brand-700">Ver o texto e como criar na Meta</summary>
              <div className="mt-3 space-y-3 text-xs text-muted">
                <PreviaMensagem agente={e.agente} botoes={[e.botao_sim, e.botao_nao]} />
                <ol className="list-decimal space-y-1 pl-4">
                  <li>
                    No Voob CRM, no CRM da prospecção, em Modelos: nome começando por <b className="text-ink">{e.modelo_prefixo}</b>, categoria Marketing.
                  </li>
                  <li>
                    Um campo livre <b className="text-ink">{"{{nome_do_negocio}}"}</b> no lugar do nome da empresa (sem o nome da pessoa: o Google não dá).
                  </li>
                  <li>
                    Dois botões de resposta rápida: <b className="text-ink">{e.botao_sim}</b> e <b className="text-ink">{e.botao_nao}</b>.
                  </li>
                  <li>Quando a Meta aprovar, aparece aqui como pronta. Nada mais precisa mudar.</li>
                </ol>
              </div>
            </details>
          </div>
        </Bloco>
      </div>

      {/* Ritmo */}
      <Bloco i={3} icone={<Clock className="size-4" />} titulo="Ritmo e freios">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <label className="text-sm font-semibold text-ink" htmlFor="voob-limite">
                Mensagens por dia
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  id="voob-limite"
                  type="number"
                  min={1}
                  max={250}
                  value={ritmo.limite_dia}
                  onChange={(x) => setRitmo({ ...ritmo, limite_dia: Math.max(1, Math.min(250, Number(x.target.value) || 1)) })}
                  className={cx(inputClass, "w-24 tabular-nums")}
                />
                {[10, 20, 30, 50].map((v) => (
                  <Chip key={v} ativo={ritmo.limite_dia === v} onClick={() => setRitmo({ ...ritmo, limite_dia: v })}>
                    {v}
                  </Chip>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-muted">
                ≈ {reais(custoEstimado(ritmo.limite_dia))} por dia na Meta ({reais(custoEstimado(ritmo.limite_dia * 22))} por mês, em 22 dias úteis). Começar com 20 e subir
                só com a qualidade verde.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Dias</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {DIAS_SEMANA.map((d) => (
                  <Chip
                    key={d.id}
                    ativo={ritmo.dias.includes(d.id)}
                    onClick={() => {
                      const dias = ritmo.dias.includes(d.id) ? ritmo.dias.filter((x) => x !== d.id) : [...ritmo.dias, d.id].sort();
                      if (dias.length) setRitmo({ ...ritmo, dias });
                    }}
                  >
                    {d.curto}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Campo rotulo="Das">
                <input type="time" value={ritmo.hora_inicio} onChange={(x) => setRitmo({ ...ritmo, hora_inicio: x.target.value })} className={inputClass} />
              </Campo>
              <Campo rotulo="Até">
                <input type="time" value={ritmo.hora_fim} onChange={(x) => setRitmo({ ...ritmo, hora_fim: x.target.value })} className={inputClass} />
              </Campo>
              <Campo rotulo="Uma a cada">
                <select value={ritmo.intervalo_min} onChange={(x) => setRitmo({ ...ritmo, intervalo_min: Number(x.target.value) })} className={inputClass}>
                  {[2, 3, 4, 5, 8, 10, 15].map((v) => (
                    <option key={v} value={v}>
                      {v} min
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
          </div>
          <div className="space-y-5">
            <Toggle
              checked={ritmo.retomada_ligada}
              onChange={(v) => setRitmo({ ...ritmo, retomada_ligada: v })}
              label="Uma retomada para quem não respondeu"
              hint={`Uma vez só, ${ritmo.retomada_dias} dias depois da 1ª mensagem. Precisa de uma 2ª mensagem aprovada.`}
            />
            {ritmo.retomada_ligada && (
              <Campo rotulo="Dias até a retomada">
                <select value={ritmo.retomada_dias} onChange={(x) => setRitmo({ ...ritmo, retomada_dias: Number(x.target.value) })} className={cx(inputClass, "w-32")}>
                  {[2, 3, 4, 5, 7].map((v) => (
                    <option key={v} value={v}>
                      {v} dias
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <div className="rounded-xl bg-amber-50/70 p-3.5 text-sm text-amber-900 ring-1 ring-amber-200/70 dark:bg-amber-400/10 dark:text-amber-200">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="size-4" /> Freios automáticos
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs">
                <li>
                  Pausa sozinho se {Number(e.freio_saidas_pct).toLocaleString("pt-BR")}% de quem recebeu desde que ligou pedirem para parar no dia (a partir de {n(e.freio_minimo)} mensagens).
                  “{e.botao_nao}” não conta: só quem pede para sair.
                </li>
                <li>Pausa se a qualidade do número ficar vermelha; com amarela, o limite cai pela metade.</li>
                <li>Nunca chama quem já é cliente, lead ou já conversou com a Voob, nem quem já recebeu.</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
          {temMudanca && <span className="text-xs text-muted">Mudanças sem salvar.</span>}
          {temMudanca && (
            <Button variant="ghost" size="sm" onClick={() => setEdicao(null)}>
              Desfazer
            </Button>
          )}
          <Button size="sm" disabled={!temMudanca} loading={salvando} onClick={() => void salvar(pendentes, "Ritmo salvo.")} icon={<Save className="size-4" />}>
            Salvar
          </Button>
        </div>
      </Bloco>

      <Modal open={confirmar !== null} onClose={() => setConfirmar(null)} title={confirmar ? "Ligar a prospecção da Voob?" : "Desligar a prospecção?"}>
        {confirmar ? (
          <div className="space-y-4 text-sm text-ink">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Até <b>{n(h.limite_efetivo)}</b> mensagens por dia, {textoDias(e.dias)}, das {e.hora_inicio} às {e.hora_fim}, uma a cada {e.intervalo_min} min.
              </li>
              <li>
                Só para quem não tem site ou só tem rede social ({n(cfg.base_pronta)} na base agora).
                {cfg.base_pronta < h.limite_efetivo && (
                  <>
                    {" "}
                    <button type="button" className="font-semibold text-brand-700 underline" onClick={() => onIr("buscar")}>
                      Buscar mais
                    </button>
                  </>
                )}
              </li>
              <li>Pelo número final {cfg.numero?.final}, com a mensagem aprovada pela Meta. Quem responde vira lead e a {e.agente} atende.</li>
              <li>≈ {reais(custoEstimado(h.limite_efetivo))} por dia na Meta.</li>
              {cfg.numero?.teste && <li className="font-semibold text-amber-700">O número está em modo teste: só a lista de teste recebe.</li>}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmar(null)}>
                Agora não
              </Button>
              <Button onClick={() => void ligar(true)} loading={ligando} icon={<CirclePlay className="size-4" />}>
                Ligar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-sm text-ink">
            <p>Para de pôr mensagens na fila. O que ainda não saiu hoje volta para a base e sai depois, quando ligar de novo.</p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmar(null)}>
                Agora não
              </Button>
              <Button variant="danger" onClick={() => void ligar(false)} loading={ligando} icon={<CirclePause className="size-4" />}>
                Desligar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Bloco({ i, icone, titulo, children }: { i: number; icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <Card className="entrar p-5 sm:p-6" style={{ "--i": i } as CSSProperties}>
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-bold text-strong">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-700">{icone}</span>
        {titulo}
      </h2>
      {children}
    </Card>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{rotulo}</span>
      {children}
    </label>
  );
}

function SituacaoModelo({ titulo, prefixo, m, semNumero }: { titulo: string; prefixo: string; m: ConfigVoob["modelos"]["abertura"]; semNumero: boolean }) {
  const ok = Boolean(m?.ok);
  const texto = semNumero
    ? "Criada no número da prospecção, depois que ele entrar."
    : ok
      ? `${m?.nome} · ${m?.categoria === "MARKETING" ? "Marketing" : m?.categoria}`
      : m?.motivo === "modelo_em_analise"
        ? "Em análise na Meta."
        : `Falta criar (nome começando por ${prefixo}).`;
  return (
    <div className="flex items-start gap-3">
      <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", ok ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
        {ok ? <Check className="size-3.5" /> : <Clock className="size-3.5" />}
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{titulo}</p>
        <p className="text-xs text-muted">{texto}</p>
      </div>
    </div>
  );
}

function ComoConectar() {
  return (
    <div className="space-y-2 text-sm text-muted">
      <p>Nenhum número de prospecção conectado ainda. Quando o número for definido:</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>No Voob CRM, abrir um CRM só da prospecção (o Voob CRM aceita 1 WhatsApp oficial por CRM).</li>
        <li>Conectar o número pela janela da Meta (a Voob é Tech Provider), numa conta separada da Renata.</li>
        <li>No número: ligar “criar leads” (etapa de entrada) e a IA.</li>
        <li>Ele aparece aqui para escolher. Antes de ligar, um teste só para o número do Jean.</li>
      </ol>
    </div>
  );
}

function ComoLigarOCrm({ erro, onTentar }: { erro: string; onTentar: () => void }) {
  return (
    <Card className="p-5 sm:p-6">
      <p className="text-sm font-semibold text-ink">O Radar ainda não fala com o Voob CRM.</p>
      <p className="mt-1 text-sm text-muted">{erro}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onTentar} icon={<RefreshCw className="size-3.5" />}>
        Tentar de novo
      </Button>
    </Card>
  );
}
