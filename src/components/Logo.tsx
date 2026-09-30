import { cx } from "@/lib/cx";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cx("shrink-0", className)} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#03abc9" />
      <circle cx="32" cy="32" r="15" fill="none" stroke="#fff" strokeWidth="5" />
      <circle cx="32" cy="32" r="5" fill="#fff" />
      <path d="M32 8v8M32 48v8M8 32h8M48 32h8" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-9" />
      <span className="flex flex-col leading-none">
        <span className={cx("text-[21px] font-extrabold tracking-[-0.04em]", dark ? "text-white" : "text-strong")}>
          ra<span className="text-brand">dar</span>
        </span>
        <span className={cx("mt-1 text-[10px] font-semibold tracking-[0.14em] uppercase", dark ? "text-white/45" : "text-muted")}>
          by lavacar
        </span>
      </span>
    </span>
  );
}
