"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Logo } from "@/components/Logo";

/** Quem entrou e ainda não tem nenhuma empresa no Radar (ou o Voob CRM não respondeu). */
export function SemEmpresa({ erro, nome }: { erro: string | null; nome: string | null }) {
  const router = useRouter();
  const sair = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  };
  return (
    <main data-empresa="voob" className="grid min-h-screen place-items-center bg-surface px-4">
      <div className="w-full max-w-md rounded-3xl bg-card p-8 text-center shadow-card ring-1 ring-line">
        <div className="mx-auto mb-6 w-fit">
          <Logo />
        </div>
        <h1 className="text-lg font-bold text-strong">{erro ? "O Radar não conseguiu abrir agora" : `${nome ? `${nome}, a` : "A"} sua conta ainda não tem empresa no Radar`}</h1>
        <p className="mt-2 text-sm text-muted">
          {erro ?? "A equipe da Voob cria a empresa e liga à sua conta do Voob CRM. Depois disso, é só entrar de novo."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          {erro && (
            <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">
              Tentar de novo
            </button>
          )}
          <button type="button" onClick={sair} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-muted ring-1 ring-line hover:text-ink">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </div>
    </main>
  );
}
