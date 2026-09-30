"use client";

import dynamic from "next/dynamic";

import { Logo } from "@/components/Logo";

/**
 * O painel roda só no navegador: ele recupera do armazenamento local o que estava na tela
 * (lista, seleção, busca em andamento), então não faz sentido desenhá-lo no servidor.
 */
const Dashboard = dynamic(() => import("./Dashboard").then((m) => m.Dashboard), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-screen place-items-center bg-surface">
      <div className="flex flex-col items-center gap-5 animate-fade-in">
        <div className="animate-float">
          <Logo />
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line">
          <div className="h-full w-1/2 rounded-full bg-brand shine" />
        </div>
      </div>
    </div>
  ),
});

export function DashboardCliente() {
  return <Dashboard />;
}
