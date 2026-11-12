"use client";

import { ArrowRight, Bot, Check, Database, MessageCircleQuestion, Radar, RefreshCw, Search, ShieldCheck, Smartphone } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import type { View } from "@/components/dashboard/Shell";
import { RadarSweep } from "@/components/motion";
import { Button, Card, cx } from "@/components/ui";
import type { Empresa } from "@/lib/empresas";
import { SEGMENTOS } from "@/lib/voob/regras";
import type { ConfigVoob } from "@/lib/voob/tipos";

import { Chip, Etiqueta, Nota, PreviaMensagem, type Situacao } from "./comum";

/**
 * Primeiros passos da Voob (12/11/2026): o caminho até o primeiro disparo, com a situação REAL de cada parte
 * (lida do Voob CRM). Quando o CRM ainda não responde, diz o que falta, sem fingir que está pronto.
 */

interface Passo {
  id: string;
  titulo: string;
  situacao: Situacao;
  rotulo?: string;
  icone: typeof Check;
  texto: ReactNode;
  extra?: ReactNode;
  nota?: ReactNode;
  acao?: { texto: string; ir: View };
}

function passos(empresa: Empresa, cfg: ConfigVoob | null, erro: { mensagem: string; status: number } | null): Passo[] {
  const crmOk = Boolean(cfg);
  const numero = cfg?.numero ?? null;
  const modelo = cfg?.modelos.abertura ?? null;
  const segs = cfg?.empresa.perfil.segmentos ?? ["clinicas", "imobiliarias", "servicos"];
  return [
    {
      id: "radar",
      titulo: `A ${empresa.nome} no Radar`,
      situacao: "pronto",
      icone: Radar,
      texto: "O Radar agora é da Voob e separa cada empresa, com o nome, a cor e as telas dela. O Lavacar continua funcionando igual.",
    },
    {
      id: "motor",
      titulo: "O motor no Voob CRM",
      situacao: crmOk ? "pronto" : "falta",
      rotulo: crmOk ? undefined : "Falta ligar",
      icone: Database,
      texto: crmOk
        ? "A base, a fila, os freios e o porteiro da prospecção rodam dentro do Voob CRM, no mesmo motor das outras mensagens automáticas."
        : "A parte do Radar no Voob CRM está pronta e testada; falta aplicar no banco e pôr o endereço no EasyPanel.",
      nota: !crmOk && erro ? erro.mensagem : undefined,
    },
    {
      id: "busca",
      titulo: "Quem vamos procurar",
      situacao: "pronto",
      icone: Search,
      texto: "Empresas de BH no Google, começando por quem não tem site (ou só tem Instagram). Quem já é cliente, lead ou já conversou com a Voob fica de fora.",
      extra: (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SEGMENTOS.filter((s) => segs.includes(s.id)).map((s) => (
            <Chip key={s.id}>{s.nome}</Chip>
          ))}
          <Chip>{cfg?.empresa.perfil.cidade ?? "Belo Horizonte, MG"}</Chip>
          <Chip>Sem site ou só rede social</Chip>
        </div>
      ),
      nota: cfg ? <>Na base agora: <b>{cfg.base_pronta}</b> para chamar.</> : undefined,
      acao: { texto: "Fazer uma busca", ir: "buscar" },
    },
    {
      id: "whatsapp",
      titulo: "WhatsApp oficial da prospecção",
      situacao: numero?.conectado ? "pronto" : "falta",
      rotulo: numero ? (numero.conectado ? undefined : "Desconectado") : "Falta conectar",
      icone: Smartphone,
      texto: numero ? (
        <>
          {numero.nome}, final <b>{numero.final}</b>
          {numero.crm && <> · CRM {numero.crm}</>}. Quem responde vira lead {numero.etapa ? <>em “{numero.etapa}”</> : "no CRM"}.
        </>
      ) : (
        "Um número só para a prospecção, numa conta da Meta separada da Renata, para um não arriscar o outro. O Voob CRM aceita 1 número oficial por CRM, então ele entra num CRM próprio da prospecção."
      ),
      nota: numero ? undefined : "Assim que o número for conectado no Voob CRM, ele aparece em Disparo para escolher. Nada mais muda.",
      acao: { texto: numero ? "Ver o número" : "Como conectar", ir: "disparo" },
    },
    {
      id: "mensagem",
      titulo: "A primeira mensagem",
      situacao: modelo?.ok ? "pronto" : "rascunho",
      rotulo: modelo?.ok ? undefined : "Falta aprovar",
      icone: MessageCircleQuestion,
      texto: "Diz quem é, de onde veio o contato e o que a Voob resolve, sem preço. Termina com uma pergunta e dá a saída em um toque.",
      extra: (
        <div className="mt-4">
          <PreviaMensagem agente={empresa.agente} />
        </div>
      ),
      nota: modelo?.ok ? (
        <>Aprovada pela Meta: {modelo.nome} ({modelo.categoria === "MARKETING" ? "Marketing" : modelo.categoria}).</>
      ) : (
        <>Vai para a aprovação da Meta no número da prospecção, com o nome começando por “{cfg?.empresa.modelo_prefixo ?? "radar_voob_abertura"}”.</>
      ),
    },
    {
      id: "agente",
      titulo: "Quem atende quem responde",
      situacao: "construindo",
      icone: Bot,
      texto: `A ${empresa.agente}, no modo prospecção: sabe que foi ela quem chamou primeiro, tira dúvidas, qualifica e mostra como ficaria. Quando pedem uma pessoa, passa para a equipe com aviso no WhatsApp.`,
    },
    {
      id: "freios",
      titulo: "Disparo com freios",
      situacao: "pronto",
      icone: ShieldCheck,
      texto: "Começa devagar e só sobe com os números bons. Pausa sozinho se muita gente pedir para parar ou se a qualidade do número cair.",
      extra: (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip>{cfg?.empresa.limite_dia ?? 20} por dia no começo</Chip>
          <Chip>Pausa com {cfg?.empresa.freio_saidas_pct ?? 8}% de saídas no dia</Chip>
          <Chip>No máximo 1 retomada</Chip>
        </div>
      ),
      acao: { texto: "Abrir o disparo", ir: "disparo" },
    },
  ];
}

export function VoobComecar({
  empresa,
  cfg,
  erro,
  onIr,
  onRecarregar,
}: {
  empresa: Empresa;
  cfg: ConfigVoob | null;
  erro: { mensagem: string; status: number } | null;
  onIr: (v: View) => void;
  onRecarregar: () => void;
}) {
  const lista = passos(empresa, cfg, erro);
  const prontos = lista.filter((p) => p.situacao === "pronto").length;
  const ligado = cfg?.empresa.ligado ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="cartao-noite relative overflow-hidden rounded-3xl p-6 text-white ring-1 ring-white/10 sm:p-8">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="eyebrow">
              {empresa.nome} · {ligado ? "prospectando" : "em preparação"}
            </p>
            <h1 className="display mt-3 text-3xl sm:text-4xl">A máquina de vendas da {empresa.nome}</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/70">
              O Radar acha empresas no Google, manda a primeira mensagem pelo WhatsApp oficial da {empresa.nome} e a {empresa.agente} atende
              quem responder. Estes são os passos até o primeiro disparo.
            </p>
          </div>
          <RadarSweep ativo pontos={9} tamanho={96} className="hidden ring-1 ring-white/10 sm:block" />
        </div>
        <div className="mt-6">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold text-white/80">
              {prontos} de {lista.length} prontos
            </span>
            <button type="button" onClick={onRecarregar} className="inline-flex items-center gap-1 text-xs text-white/50 transition hover:text-white">
              <RefreshCw className="size-3" /> conferir de novo
            </button>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="barra-cresce h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (prontos / lista.length) * 100)}%` }} />
          </div>
        </div>
      </div>

      <ol className="space-y-3">
        {lista.map((p, i) => {
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
                      <Etiqueta situacao={p.situacao} texto={p.rotulo} />
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.texto}</p>
                    {p.extra}
                    {p.nota && <Nota>{p.nota}</Nota>}
                    {p.acao && (
                      <Button variant="outline" size="sm" className="mt-4" onClick={() => onIr(p.acao!.ir)} icon={<ArrowRight className="size-3.5" />}>
                        {p.acao.texto}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      <p className="text-center text-sm text-muted">O Lavacar continua funcionando igual. Para voltar a ele, troque a empresa no menu.</p>
    </div>
  );
}
