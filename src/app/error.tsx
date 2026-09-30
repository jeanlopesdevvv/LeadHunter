"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui";

const CHAVE = "radar:recarregou-versao";

/** Aba aberta de uma versão antiga depois de uma atualização: os arquivos antigos não existem mais. */
function ehVersaoNova(error: Error): boolean {
  return error?.name === "ChunkLoadError" || /Failed to load chunk|Loading chunk|dynamically imported module/i.test(error?.message ?? "");
}

/** Se alguma tela quebrar, mostra isto em vez de uma página em branco. O que estava na tela fica salvo. */
export default function Erro({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const versaoNova = ehVersaoNova(error);

  // Saiu versão nova do Radar: recarrega sozinho uma vez (a lista e a seleção ficam guardadas no navegador).
  useEffect(() => {
    if (!versaoNova) return;
    try {
      const ultima = Number(sessionStorage.getItem(CHAVE) || 0);
      if (Date.now() - ultima < 60_000) return; // já tentou há pouco: deixa a pessoa decidir
      sessionStorage.setItem(CHAVE, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [versaoNova]);

  return (
    <main className="glow-br grid min-h-screen place-items-center px-6">
      <div className="max-w-md animate-enter text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="display mt-8 text-3xl text-navy">{versaoNova ? "Saiu uma versão nova do Radar!" : "Opa, algo travou aqui."}</h1>
        <p className="mt-3 text-sm text-muted">
          {versaoNova
            ? "Recarregando para você pegar a novidade. Nada foi perdido: sua lista e sua seleção ficam guardadas neste navegador."
            : "Nada foi perdido: sua lista e sua seleção ficam guardadas neste navegador. Tente de novo; se continuar, recarregue a página."}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={reset} icon={<RefreshCw className="size-4" />}>
            Tentar de novo
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Recarregar
          </Button>
        </div>
      </div>
    </main>
  );
}
