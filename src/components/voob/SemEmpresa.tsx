"use client";

import { Check, LogOut, Radar, Search, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Logo } from "@/components/Logo";

/**
 * Quem entrou e ainda não tem nenhuma empresa no Radar (ou o Voob CRM não respondeu). 19/11/2026: em vez de um beco sem
 * saída, a pessoa vê o que o Radar faz e pede a liberação com um clique; a equipe vê o pedido ao criar a empresa.
 */
export function SemEmpresa({ erro, nome }: { erro: string | null; nome: string | null }) {
  const router = useRouter();
  const [pedido, setPedido] = useState<"nada" | "enviando" | "feito" | "erro">("nada");
  const [aviso, setAviso] = useState("");
  const sair = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };
  const pedir = async () => {
    setPedido("enviando");
    setAviso("");
    try {
      const res = await fetch("/api/voob/pedido", { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { ja_tem?: boolean; erro?: string };
      if (!res.ok) throw new Error(d.erro ?? "Não deu para mandar o pedido agora.");
      if (d.ja_tem) {
        window.location.reload();
        return;
      }
      setPedido("feito");
    } catch (e) {
      setPedido("erro");
      setAviso((e as Error).message);
    }
  };

  if (erro) {
    return (
      <Moldura>
        <h1 className="text-lg font-bold text-strong">O Radar não conseguiu abrir agora</h1>
        <p className="mt-2 text-sm text-muted">{erro}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
            Tentar de novo
          </button>
          <BotaoSair onClick={sair} />
        </div>
      </Moldura>
    );
  }

  return (
    <Moldura>
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand/10 text-brand">
        <Radar className="size-6" />
      </span>
      <h1 className="mt-4 text-xl font-bold text-strong">{nome ? `${nome}, conheça o Radar` : "Conheça o Radar"}</h1>
      <p className="mt-2 text-sm text-muted">O Radar encontra empresas que combinam com o que você vende e chama cada uma no seu WhatsApp oficial.</p>
      <ul className="mt-5 space-y-2.5 text-left text-sm text-ink">
        <Item icone={Search} texto="Procura no Google as empresas da sua cidade e do seu ramo" />
        <Item icone={Sparkles} texto="Escreve a mensagem com você, a partir do que você oferece" />
        <Item icone={Send} texto="Envia aos poucos, no horário comercial, e quem responde cai no seu Voob CRM" />
      </ul>
      {pedido === "feito" ? (
        <div className="mt-6 rounded-2xl bg-brand/10 p-4 text-sm text-ink">
          <p className="flex items-center justify-center gap-2 font-semibold text-brand">
            <Check className="size-4" /> Pedido enviado
          </p>
          <p className="mt-1 text-muted">A Voob libera o Radar para a sua conta. Quando estiver pronto, é só entrar de novo.</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={pedir}
          disabled={pedido === "enviando"}
          className="mt-6 w-full rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pedido === "enviando" ? "Enviando..." : "Quero usar o Radar"}
        </button>
      )}
      {aviso && <p className="mt-3 text-sm text-red-600">{aviso}</p>}
      <div className="mt-4 flex justify-center">
        <BotaoSair onClick={sair} />
      </div>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main data-empresa="voob" className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 text-center shadow-card ring-1 ring-line">
        <div className="mx-auto mb-6 w-fit">
          <Logo />
        </div>
        {children}
      </div>
    </main>
  );
}

function Item({ icone: Icone, texto }: { icone: typeof Search; texto: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icone className="mt-0.5 size-4 shrink-0 text-brand" />
      <span>{texto}</span>
    </li>
  );
}

function BotaoSair({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-muted ring-1 ring-line hover:text-ink">
      <LogOut className="size-4" /> Sair
    </button>
  );
}
