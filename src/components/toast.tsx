"use client";

import { CheckCircle2, Info, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type Kind = "success" | "error" | "info";
/** Botão no aviso (ex.: "Desfazer"). */
export interface ToastAcao {
  rotulo: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  kind: Kind;
  text: string;
  acao?: ToastAcao;
}

const Ctx = createContext<(text: string, kind?: Kind, acao?: ToastAcao) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const fechar = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (text: string, kind: Kind = "info", acao?: ToastAcao) => {
      const id = ++seq;
      setItems((list) => [...list.slice(-3), { id, kind, text, acao }]);
      setTimeout(() => fechar(id), kind === "error" ? 7000 : acao ? 7000 : 4000);
    },
    [fechar],
  );

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-24 left-4 z-[60] flex flex-col items-center gap-2 sm:top-4 sm:bottom-auto sm:left-auto sm:items-end" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl bg-navy px-4 py-3 text-sm text-white shadow-2xl animate-slide-up"
          >
            {t.kind === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />}
            {t.kind === "error" && <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />}
            {t.kind === "info" && <Info className="mt-0.5 size-4 shrink-0 text-brand-300" />}
            <span className="flex-1 leading-snug">{t.text}</span>
            {t.acao && (
              <button
                type="button"
                onClick={() => {
                  t.acao?.onClick();
                  fechar(t.id);
                }}
                className="-my-1 shrink-0 rounded-lg px-2 py-1 text-sm font-bold text-brand-300 transition hover:bg-white/10 hover:text-white"
              >
                {t.acao.rotulo}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
