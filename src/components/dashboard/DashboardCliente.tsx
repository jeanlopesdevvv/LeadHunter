"use client";

import dynamic from "next/dynamic";

import { Logo } from "@/components/Logo";
import type { Empresa } from "@/lib/empresas";


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

/** Telas da Voob (motor do Voob CRM). Também só no navegador: lembram a tela aberta e a busca em andamento. */
const VoobApp = dynamic(() => import("@/components/voob/VoobApp").then((m) => m.VoobApp), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-screen place-items-center bg-surface">
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line">
        <div className="h-full w-1/2 rounded-full bg-brand shine" />
      </div>
    </div>
  ),
});

/**
 * 12/11/2026: o Radar tem várias empresas. Cada uma abre com o motor dela: o Lavacar com o painel de sempre
 * (banco "atendimento", n8n, Carol), a Voob com as telas do Voob CRM.
 */
export function DashboardCliente({ empresa, empresas, pessoa, equipe = true }: { empresa: Empresa; empresas: Empresa[]; pessoa?: string | null; equipe?: boolean }) {
  if (empresa.motor === "voob-crm") return <VoobApp empresa={empresa} empresas={empresas} pessoa={pessoa} equipe={equipe} />;
  return <Dashboard empresa={empresa} empresas={empresas} pessoa={pessoa} />;
}
