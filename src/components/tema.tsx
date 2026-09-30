"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

import { cx } from "@/components/ui";
import { CHAVE_TEMA as CHAVE } from "@/lib/tema-script";

/** Preferência de aparência: segue o sistema, sempre claro ou sempre escuro. */
export type Tema = "auto" | "claro" | "escuro";

const ouvintes = new Set<() => void>();

function lerPreferencia(): Tema {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === "claro" || t === "escuro" ? t : "auto";
  } catch {
    return "auto";
  }
}

function sistemaEscuro(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

function aplicarTema(pref: Tema, suave = false) {
  const escuro = pref === "escuro" || (pref === "auto" && sistemaEscuro());
  const html = document.documentElement;
  if (suave) {
    html.classList.add("trocando-tema");
    window.setTimeout(() => html.classList.remove("trocando-tema"), 350);
  }
  html.setAttribute("data-theme", escuro ? "dark" : "light");
}

export function mudarTema(pref: Tema) {
  try {
    if (pref === "auto") localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, pref);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
  aplicarTema(pref, true);
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void) {
  ouvintes.add(f);
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const aoMudarSistema = () => {
    if (lerPreferencia() === "auto") aplicarTema("auto", true);
    f();
  };
  mq?.addEventListener("change", aoMudarSistema);
  return () => {
    ouvintes.delete(f);
    mq?.removeEventListener("change", aoMudarSistema);
  };
}

export function useTema(): Tema {
  const pref = useSyncExternalStore(assinar, lerPreferencia, () => "auto" as Tema);
  // Garante o atributo certo depois de hidratar (ex.: armazenamento bloqueado no script do <head>).
  useEffect(() => aplicarTema(pref), [pref]);
  return pref;
}

const OPCOES: { id: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { id: "claro", rotulo: "Claro", Icone: Sun },
  { id: "escuro", rotulo: "Escuro", Icone: Moon },
  { id: "auto", rotulo: "Sistema", Icone: Monitor },
];

/** Seletor de aparência para a barra lateral (fundo escuro). */
export function SeletorTema({ className }: { className?: string }) {
  const tema = useTema();
  return (
    <div className={cx("rounded-xl bg-white/[0.04] p-1", className)} role="radiogroup" aria-label="Aparência">
      <div className="grid grid-cols-3 gap-1">
        {OPCOES.map(({ id, rotulo, Icone }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={tema === id}
            onClick={() => mudarTema(id)}
            title={id === "auto" ? "Segue o tema do computador" : `Modo ${rotulo.toLowerCase()}`}
            className={cx(
              "flex items-center justify-center gap-1.5 rounded-lg px-1 py-1.5 text-[11px] font-semibold transition-colors",
              tema === id ? "bg-white/[0.12] text-white" : "text-white/45 hover:bg-white/[0.06] hover:text-white/80",
            )}
          >
            <Icone className={cx("size-3.5 shrink-0", tema === id && "text-brand-300")} />
            {rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Botão compacto (topo no celular): alterna claro → escuro → automático. */
export function BotaoTema({ className }: { className?: string }) {
  const tema = useTema();
  const proximo: Tema = tema === "claro" ? "escuro" : tema === "escuro" ? "auto" : "claro";
  const atual = OPCOES.find((o) => o.id === tema)!;
  return (
    <button
      type="button"
      onClick={() => mudarTema(proximo)}
      className={cx("rounded-lg p-2 text-white/60 hover:text-white", className)}
      aria-label={`Aparência: ${atual.rotulo}. Tocar para mudar.`}
      title={`Aparência: ${atual.rotulo}`}
    >
      <atual.Icone className="size-5" />
    </button>
  );
}
