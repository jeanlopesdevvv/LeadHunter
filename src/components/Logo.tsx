import { cx } from "@/lib/cx";

/** Símbolo do Radar. Usa a cor da empresa escolhida (--color-brand). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cx("shrink-0", className)} aria-hidden="true">
      <rect width="64" height="64" rx="16" style={{ fill: "var(--color-brand)" }} />
      <circle cx="32" cy="32" r="15" fill="none" stroke="#fff" strokeWidth="5" />
      <circle cx="32" cy="32" r="5" fill="#fff" />
      <path d="M32 8v8M32 48v8M8 32h8M48 32h8" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Marca da Voob (12/11/2026: o Radar é da Voob, "radar by voob"). Verde sobre fundo escuro, grafite sobre fundo claro.
 * `dark`: sempre sobre fundo escuro (menu). Sem ele, segue o tema (claro: grafite; escuro: verde).
 */
export function MarcaVoob({ dark = false, className }: { dark?: boolean; className?: string }) {
  /* eslint-disable @next/next/no-img-element */
  const verde = <img src="/marca/voob-claro.png" alt="Voob" width={218} height={72} className={cx("w-auto", !dark && "hidden dark:inline", className)} />;
  if (dark) return verde;
  return (
    <>
      <img src="/marca/voob-escuro.png" alt="Voob" width={218} height={72} className={cx("w-auto dark:hidden", className)} />
      {verde}
    </>
  );
  /* eslint-enable @next/next/no-img-element */
}

export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-9" />
      <span className="flex flex-col leading-none">
        <span className={cx("text-[21px] font-extrabold tracking-[-0.04em]", dark ? "text-white" : "text-strong")}>
          ra<span className="text-brand">dar</span>
        </span>
        <span className={cx("mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase", dark ? "text-white/45" : "text-muted")}>
          by <MarcaVoob dark={dark} className="h-[11px]" />
        </span>
      </span>
    </span>
  );
}
