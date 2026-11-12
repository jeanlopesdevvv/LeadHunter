"use client";

import { Bot, Check, CircleDashed, Hammer, MessageCircleQuestion, Radar, Search, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, type CSSProperties, type ReactNode } from "react";

import { RadarSweep } from "@/components/motion";
import { useToast } from "@/components/toast";
import { Card, cx } from "@/components/ui";
import type { Empresa } from "@/lib/empresas";

import { Shell, type View } from "./Shell";

/**
 * Empresa em preparação (12/11/2026): a Voob como segunda empresa do Radar, pedido do Pedro e do Henrique.
 * Mostra, com a situação real de cada um, os passos até o primeiro disparo. Não chama nada do motor do Lavacar.
 */

type Situacao = "pronto" | "rascunho" | "decidir" | "construindo";

const SITUACAO: Record<Situacao, { rotulo: string; classe: string; icone: typeof Check }> = {
  pronto: { rotulo: "Pronto", classe: "bg-emerald-50 text-emerald-700 ring-emerald-200", icone: Check },
  rascunho: { rotulo: "Rascunho", classe: "bg-brand-50 text-brand-700 ring-brand-200", icone: Sparkles },
  decidir: { rotulo: "Falta decidir", classe: "bg-amber-50 text-amber-700 ring-amber-200", icone: MessageCircleQuestion },
  construindo: { rotulo: "Em construção", classe: "bg-slate-100 text-slate-600 ring-slate-200", icone: Hammer },
};

interface Passo {
  id: string;
  titulo: string;
  situacao: Situacao;
  icone: typeof Check;
  texto: string;
  extra?: ReactNode;
  nota?: string;
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-strong/[0.05] px-2.5 py-1 text-xs font-semibold text-ink ring-1 ring-line">{children}</span>;
}

/** Prévia da primeira mensagem, no formato do WhatsApp (rascunho: ainda vai para a aprovação da Meta). */
function PreviaMensagem({ agente }: { agente: string }) {
  return (
    <div className="mt-4 max-w-md rounded-2xl bg-[#e9e3d8] p-3 dark:bg-[#0b141a]">
      <div className="relative rounded-xl rounded-tl-sm bg-white px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
        <p>
          Oi, <b>Marina</b>! Aqui é a {agente}, da Voob. Encontrei a <b>Clínica Bem Estar</b> no Google e vi que vocês ainda não têm site.
        </p>
        <p className="mt-2">
          A gente monta o site, o CRM e uma IA que responde os seus clientes no WhatsApp na hora, até à noite e no fim de semana. Posso te
          mostrar como ficaria para vocês?
        </p>
        <span className="mt-1 block text-right text-[11px] text-[#667781] dark:text-[#8696a0]">09:41</span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <span className="rounded-xl bg-white py-2 text-center text-[13px] font-semibold text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]">Quero ver</span>
        <span className="rounded-xl bg-white py-2 text-center text-[13px] font-semibold text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]">
          Não tenho interesse
        </span>
      </div>
    </div>
  );
}

function passosDa(empresa: Empresa): Passo[] {
  return [
    {
      id: "radar",
      titulo: `A ${empresa.nome} no Radar`,
      situacao: "pronto",
      icone: Radar,
      texto: "O Radar agora é da Voob e separa cada empresa, com o nome, a cor e as telas dela. O Lavacar continua funcionando igual.",
    },
    {
      id: "whatsapp",
      titulo: "WhatsApp oficial da prospecção",
      situacao: "decidir",
      icone: Smartphone,
      texto:
        "Um número só para a prospecção, numa conta da Meta separada da Renata, para um não arriscar o outro. A conexão é pela janela da Meta: a Voob já é Tech Provider.",
      nota: "Falta escolher qual número usar.",
    },
    {
      id: "busca",
      titulo: "Quem vamos procurar",
      situacao: "rascunho",
      icone: Search,
      texto:
        "A IA monta o perfil de busca a partir de uma frase. Antes de citar o site na mensagem, o Raio-X confere se ele está mesmo desatualizado.",
      extra: (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>Clínicas e estética</Chip>
          <Chip>Imobiliárias</Chip>
          <Chip>Prestadores de serviço</Chip>
          <Chip>Belo Horizonte</Chip>
          <Chip>Sem site ou com site desatualizado</Chip>
        </div>
      ),
    },
    {
      id: "mensagem",
      titulo: "A primeira mensagem",
      situacao: "rascunho",
      icone: MessageCircleQuestion,
      texto: "Curta, diz de onde veio o contato e dá a saída em um toque.",
      extra: <PreviaMensagem agente={empresa.agente} />,
      nota: "Vai para a aprovação da Meta antes do primeiro envio. A oferta e o nome de quem chama ainda estão em aberto.",
    },
    {
      id: "agente",
      titulo: "Quem atende quem responde",
      situacao: "construindo",
      icone: Bot,
      texto: `A ${empresa.agente}, no modo prospecção: sabe que foi ela quem chamou primeiro, tira dúvidas, qualifica e manda o link. Quando pedem uma pessoa, passa para a equipe com aviso no WhatsApp.`,
    },
    {
      id: "freios",
      titulo: "Disparo com freios",
      situacao: "construindo",
      icone: ShieldCheck,
      texto: "Começa devagar e só sobe com os números bons. Pausa sozinho se muita gente pedir para sair ou se a qualidade do número cair.",
      extra: (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>20 por dia no começo</Chip>
          <Chip>Pausa com 8% de saídas no dia</Chip>
          <Chip>No máximo 1 retomada</Chip>
        </div>
      ),
    },
  ];
}

function Etiqueta({ situacao }: { situacao: Situacao }) {
  const s = SITUACAO[situacao];
  const Icone = s.icone;
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset whitespace-nowrap", s.classe)}>
      <Icone className="size-3" />
      {s.rotulo}
    </span>
  );
}

export function EmpresaPreparando({ empresa, empresas }: { empresa: Empresa; empresas: Empresa[] }) {
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<View>("comecar");
  const passos = passosDa(empresa);
  const prontos = passos.filter((p) => p.situacao === "pronto").length;

  const sair = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }, [router]);

  return (
    <Shell
      empresa={empresa}
      empresas={empresas}
      onErro={(m) => toast(m, "error")}
      view={view}
      onView={setView}
      totalResultados={0}
      rodando={false}
      simulacao={false}
      uso={null}
      onSair={sair}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="cartao-noite relative overflow-hidden rounded-3xl p-6 text-white ring-1 ring-white/10 sm:p-8">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="eyebrow">{empresa.nome} · em preparação</p>
              <h1 className="display mt-3 text-3xl sm:text-4xl">A máquina de vendas da {empresa.nome}</h1>
              <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
                O Radar vai achar empresas no Google, mandar a primeira mensagem pelo WhatsApp oficial da {empresa.nome} e a {empresa.agente}{" "}
                atende quem responder. Estes são os passos até o primeiro disparo.
              </p>
            </div>
            <RadarSweep ativo pontos={9} tamanho={96} className="hidden ring-1 ring-white/10 sm:block" />
          </div>
          <div className="mt-6">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-white/80">
                {prontos} de {passos.length} prontos
              </span>
              <span className="text-xs text-white/50">atualizado conforme cada parte fica pronta</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="barra-cresce h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (prontos / passos.length) * 100)}%` }} />
            </div>
          </div>
        </div>

        <ol className="space-y-3">
          {passos.map((p, i) => {
            const Icone = p.icone;
            return (
              <li key={p.id} className="entrar" style={{ "--i": i + 1 } as CSSProperties}>
                <Card className="p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <span
                      className={cx(
                        "grid size-10 shrink-0 place-items-center rounded-xl ring-1",
                        p.situacao === "pronto" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-brand-50 text-brand-700 ring-brand-100",
                      )}
                    >
                      {p.situacao === "pronto" ? <Check className="size-5" /> : <Icone className="size-5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs font-bold text-muted tabular-nums">{i + 1}</span>
                        <h2 className="text-[15.5px] font-bold text-strong">{p.titulo}</h2>
                        <Etiqueta situacao={p.situacao} />
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.texto}</p>
                      {p.extra}
                      {p.nota && (
                        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
                          <CircleDashed className="mt-px size-3.5 shrink-0" />
                          {p.nota}
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>

        <p className="text-center text-sm text-muted">
          Enquanto isso, o Lavacar continua funcionando igual. Para voltar a ele, troque a empresa no menu.
        </p>
      </div>
    </Shell>
  );
}
