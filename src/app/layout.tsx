import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

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
  title: "Radar · Lavacar",
  description: "Radar Lavacar: encontra lava-jatos no Google, remove repetidos e envia os novos para a planilha da Carol.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#081021",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full`}>
      <body className="min-h-full">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
