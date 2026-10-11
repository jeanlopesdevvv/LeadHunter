"use client";

import { CheckCircle2, MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import { Fragment, type ReactNode } from "react";

import { Badge, Button, Modal, cx } from "@/components/ui";
import { AUTOMATICO, EXEMPLO, MODELO_AUTONOMO, MODELO_LAVAJATO, nomeAmigavel, preencher, type ModeloWhatsApp } from "@/lib/templates-regras";

/** O que a tela recebe de /api/disparo/modelos. */
export interface ListaDeModelosTela {
  configurado: boolean;
  modelos: ModeloWhatsApp[];
  erro: string;
}

/** *negrito* e _itálico_ como no WhatsApp. */
function formatar(texto: string): ReactNode {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return partes.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <b key={i}>{p.slice(1, -1)}</b>;
    if (/^_[^_]+_$/.test(p)) return <i key={i}>{p.slice(1, -1)}</i>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

/** Como o contato vê a mensagem no WhatsApp (com nome e cidade de exemplo). */
export function PreviaWhatsApp({ modelo, compacta }: { modelo: ModeloWhatsApp; compacta?: boolean }) {
  const cabecalho = preencher(modelo.cabecalho, EXEMPLO);
  const corpo = preencher(modelo.corpo, EXEMPLO);
  return (
    <div className="zap-fundo rounded-xl p-3">
      <div className="zap-balao max-w-[92%] rounded-lg rounded-tl-none px-3 py-2 text-[13px] leading-snug shadow-sm">
        {cabecalho && <p className="mb-1 font-bold">{cabecalho}</p>}
        <p className={cx("whitespace-pre-line", compacta && "line-clamp-4")}>{formatar(corpo)}</p>
        {modelo.rodape && <p className="mt-1.5 text-[11px] opacity-60">{modelo.rodape}</p>}
      </div>
      {modelo.botoes.length > 0 && !compacta && (
        <div className="mt-1 grid max-w-[92%] gap-1">
          {modelo.botoes.map((b) => (
            <span key={b} className="zap-balao rounded-lg py-1.5 text-center text-[13px] font-semibold text-sky-600 shadow-sm">
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function nomeDoModelo(nome: string | null | undefined): string {
  if (!nome || nome === AUTOMATICO) return "Automática";
  if (nome === MODELO_LAVAJATO) return "Padrão lava-jato";
  if (nome === MODELO_AUTONOMO) return "Padrão autônomo";
  return nomeAmigavel(nome);
}

/** Prévia da escolha "automática": a de lava-jato (a de autônomo é parecida). */
export function previaAutomatica(lista: ListaDeModelosTela | null): ModeloWhatsApp | null {
  return lista?.modelos.find((m) => m.nome === MODELO_LAVAJATO) ?? null;
}

const CATEGORIA: Record<string, string> = { MARKETING: "Marketing", UTILITY: "Utilidade", AUTHENTICATION: "Código" };

/** Janela para escolher qual mensagem a Carol manda no disparo. */
export function EscolherModelo({
  open,
  onClose,
  lista,
  valor,
  onEscolher,
  onAtualizar,
  atualizando,
}: {
  open: boolean;
  onClose: () => void;
  lista: ListaDeModelosTela | null;
  valor: string;
  onEscolher: (nome: string) => void;
  onAtualizar: () => void;
  atualizando: boolean;
}) {
  const usaveis = (lista?.modelos ?? []).filter((m) => m.utilizavel && m.nome !== MODELO_LAVAJATO && m.nome !== MODELO_AUTONOMO);
  const padroes = (lista?.modelos ?? []).filter((m) => m.nome === MODELO_LAVAJATO || m.nome === MODELO_AUTONOMO);
  const fora = (lista?.modelos ?? []).filter((m) => !m.utilizavel);
  const auto = previaAutomatica(lista);

  const opcao = (nome: string, titulo: ReactNode, sub: ReactNode, previa: ModeloWhatsApp | null, destaque?: ReactNode) => {
    const marcado = valor === nome;
    return (
      <button
        key={nome}
        type="button"
        onClick={() => onEscolher(nome)}
        aria-pressed={marcado}
        className={cx(
          "w-full rounded-2xl border p-3.5 text-left transition",
          marcado ? "border-brand bg-brand-50/60 ring-2 ring-brand/30" : "border-line bg-card hover:border-brand-200 hover:bg-surface/60",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
              {titulo}
              {destaque}
            </p>
            <p className="mt-0.5 text-xs text-muted">{sub}</p>
          </div>
          <span
            className={cx(
              "grid size-5 shrink-0 place-items-center rounded-full border-2 transition",
              marcado ? "border-brand bg-brand text-white" : "border-line",
            )}
          >
            {marcado && <CheckCircle2 className="size-3.5" />}
          </span>
        </div>
        {previa && (
          <div className="mt-3">
            <PreviaWhatsApp modelo={previa} compacta={!marcado} />
          </div>
        )}
      </button>
    );
  };

  return (
    <Modal open={open} onClose={onClose} title="Qual mensagem a Carol manda?" wide>
      <div className="space-y-4 text-sm">
        <p className="text-muted">
          Teste mensagens diferentes e compare em <b className="text-ink">Desempenho</b> qual traz mais respostas. Só aparecem os modelos aprovados
          pelo WhatsApp.
        </p>

        <div className="space-y-2.5">
          {opcao(
            AUTOMATICO,
            "Automática",
            "A de lava-jato ou a de autônomo, conforme o contato. É a que a Carol sempre usou.",
            valor === AUTOMATICO ? auto : null,
            <Badge tone="brand">
              <Sparkles className="size-3" /> Recomendada
            </Badge>,
          )}
          {padroes.map((m) =>
            opcao(m.nome, nomeDoModelo(m.nome), "Para todos do disparo, mesmo os de outro tipo.", m, <Badge tone="gray">{CATEGORIA[m.categoria] ?? m.categoria}</Badge>),
          )}
          {usaveis.map((m) =>
            opcao(m.nome, nomeDoModelo(m.nome), m.nome, m, <Badge tone="gray">{CATEGORIA[m.categoria] ?? m.categoria}</Badge>),
          )}
        </div>

        {lista && !lista.configurado && (
          <p className="rounded-xl bg-surface px-3.5 py-3 text-muted">
            Para escolher outros modelos aqui, o administrador do Radar precisa ligar o acesso aos modelos do WhatsApp (variável META_TOKEN).
          </p>
        )}
        {lista?.erro && <p className="rounded-xl bg-amber-50 px-3.5 py-3 text-amber-900">{lista.erro}</p>}

        {fora.length > 0 && (
          <details className="rounded-xl bg-surface px-3.5 py-3">
            <summary className="cursor-pointer font-semibold text-ink">
              {fora.length === 1 ? "1 modelo não pode ser usado" : `${fora.length} modelos não podem ser usados`}
            </summary>
            <ul className="mt-2 space-y-1.5 text-xs text-muted">
              {fora.map((m) => (
                <li key={m.nome}>
                  <b className="text-ink">{nomeDoModelo(m.nome)}</b>: {m.motivo}.
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <MessageSquareText className="size-3.5 shrink-0" /> Modelo novo: crie no WhatsApp Manager com o nome começando por{" "}
            <code className="font-semibold">carol_prospeccao_</code> e espere a aprovação.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onAtualizar} loading={atualizando} icon={<RefreshCw className="size-4" />}>
              Atualizar lista
            </Button>
            <Button onClick={onClose}>Pronto</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
