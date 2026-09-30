"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";

import { AnimatedNumber } from "@/components/motion";

import { cx } from "@/lib/cx";

export { cx };

type Variant = "primary" | "dark" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "lift bg-brand text-white shadow-brand hover:bg-brand-600 hover:shadow-[0_14px_34px_-10px_rgb(3_171_201_/_0.7)] active:bg-brand-700",
  dark: "lift bg-navy text-white hover:bg-navy-800",
  outline: "bg-white text-brand-700 border border-brand-200 hover:border-brand hover:bg-brand-50",
  ghost: "text-muted hover:text-ink hover:bg-navy/5",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2.5 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading,
  icon,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-300",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ className, children, style }: { className?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className={cx("rounded-2xl border border-line bg-white shadow-card", className)} style={style}>
      {children}
    </div>
  );
}

type Tone = "brand" | "green" | "amber" | "red" | "gray" | "navy";
const TONES: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  gray: "bg-slate-100 text-slate-600 ring-slate-200/70",
  navy: "bg-navy text-white ring-navy",
};

export function Badge({ tone = "gray", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap", TONES[tone], className)}
    >
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-slate-300",
        )}
      >
        <span className={cx("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", checked && "translate-x-5")} />
      </button>
      <span className="leading-tight">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-xl border px-3.5 py-3 text-left transition-all",
              active ? "border-brand bg-brand-50 ring-2 ring-brand/15" : "border-line bg-white hover:border-brand-200",
            )}
          >
            <span className={cx("block text-sm font-bold", active ? "text-brand-700" : "text-ink")}>{o.label}</span>
            {o.hint && <span className="mt-0.5 block text-xs text-muted">{o.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/60 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className={cx(
          "max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl animate-slide-up scrollbar-thin sm:rounded-2xl",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-white/95 px-5 py-4 backdrop-blur sm:px-6">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-ink" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 py-5 sm:px-6">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone = "ink", icon }: { label: string; value: ReactNode; hint?: string; tone?: "ink" | "brand" | "green" | "amber"; icon?: ReactNode }) {
  const color = { ink: "text-ink", brand: "text-brand-700", green: "text-emerald-600", amber: "text-amber-600" }[tone];
  return (
    <Card className="lift p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted">{label}</span>
        {icon && <span className="text-muted/70">{icon}</span>}
      </div>
      <div className={cx("mt-1.5 text-2xl font-extrabold tracking-tight tabular-nums sm:text-[28px]", color)}>
        {typeof value === "number" ? <AnimatedNumber value={value} /> : value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-400 transition focus:border-brand focus:ring-4 focus:ring-brand/10 focus:outline-none";
