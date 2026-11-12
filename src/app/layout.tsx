import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { cssDaMarca } from "@/lib/cores";
import { empresaAtiva } from "@/lib/empresa-ativa";
import { SCRIPT_TEMA } from "@/lib/tema-script";
import { ToastProvider } from "@/components/toast";

import "./globals.css";

// Inter servida pelo próprio app (pacote @fontsource-variable/inter): o build não depende do Google Fonts.
const inter = localFont({
  // Subconjunto "latin" (U+0000–00FF): cobre todos os acentos do português.
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Radar · Voob",
  description: "Radar by Voob: encontra empresas no Google, tira quem já foi contatado e manda só contatos novos para o WhatsApp da empresa.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#081021",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 12/11/2026: as cores seguem a empresa escolhida no seletor (cookie), já no primeiro desenho, sem piscar.
  // 13/11/2026 (white label): toda empresa do Voob CRM usa a base de cores da Voob (data-motor) com a cor dela por cima.
  const empresa = await empresaAtiva();
  const marca = empresa.motor === "voob-crm" && empresa.id !== "voob" ? cssDaMarca(empresa.id, empresa.cor) : "";
  return (
    <html lang="pt-BR" data-empresa={empresa.id} data-motor={empresa.motor} className={`${inter.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Aplica o tema (claro/escuro) antes de pintar a página, sem piscar. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        {marca && <style dangerouslySetInnerHTML={{ __html: marca }} />}
      </head>
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
