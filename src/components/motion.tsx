"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { cx } from "@/lib/cx";

function prefereMenosMovimento(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Número que "sobe contando" até o valor novo. */
export function useCountUp(valor: number, duracao = 700): number {
  const [mostrado, setMostrado] = useState(valor);
  const atual = useRef(valor);
  useEffect(() => {
    const inicio = atual.current;
    if (inicio === valor || prefereMenosMovimento()) {
      atual.current = valor;
      const id = requestAnimationFrame(() => setMostrado(valor));
      return () => cancelAnimationFrame(id);
    }
    const t0 = performance.now();
    let raf = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / duracao);
      const suave = 1 - Math.pow(1 - p, 3);
      const v = Math.round(inicio + (valor - inicio) * suave);
      atual.current = v;
      setMostrado(v);
      if (p < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [valor, duracao]);
  return mostrado;
}

export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const v = useCountUp(value);
  return <span className={cx("tabular-nums", className)}>{v.toLocaleString("pt-BR")}</span>;
}

/** Entrada escalonada: envolve itens de lista/grade. */
export function Stagger({ children, className, as = "div" }: { children: ReactNode[]; className?: string; as?: "div" | "ul" }) {
  const Tag = as;
  return (
    <Tag className={cx("stagger", className)}>
      {children.map((c, i) => (
        <StaggerItem key={i} i={i}>
          {c}
        </StaggerItem>
      ))}
    </Tag>
  );
}

function StaggerItem({ i, children }: { i: number; children: ReactNode }) {
  return <div style={{ "--i": i } as CSSProperties}>{children}</div>;
}

/** Posição "aleatória" mas estável para cada ponto do radar. */
function pontoDoRadar(i: number) {
  const angulo = ((i * 137.508) % 360) * (Math.PI / 180);
  const raio = 18 + ((i * 53) % 70) * 0.42;
  return { x: 50 + Math.cos(angulo) * raio, y: 50 + Math.sin(angulo) * raio };
}

/**
 * Radar girando: cada estabelecimento encontrado vira um ponto que "acende".
 * `pontos` = quantos achados (até 36 aparecem).
 */
export function RadarSweep({ ativo, pontos, tamanho = 88, className }: { ativo: boolean; pontos: number; tamanho?: number; className?: string }) {
  const n = Math.min(36, pontos);
  return (
    <div className={cx("relative shrink-0 overflow-hidden rounded-full bg-navy", className)} style={{ width: tamanho, height: tamanho }} aria-hidden>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        {[46, 32, 18].map((r) => (
          <circle key={r} cx="50" cy="50" r={r} fill="none" stroke="rgb(3 171 201 / 0.28)" strokeWidth="0.8" />
        ))}
        <line x1="50" y1="4" x2="50" y2="96" stroke="rgb(3 171 201 / 0.18)" strokeWidth="0.6" />
        <line x1="4" y1="50" x2="96" y2="50" stroke="rgb(3 171 201 / 0.18)" strokeWidth="0.6" />
      </svg>
      {ativo && (
        <div
          className="absolute inset-0 animate-radar rounded-full"
          style={{ background: "conic-gradient(from 0deg, rgb(3 171 201 / 0.55), rgb(3 171 201 / 0.08) 22%, transparent 30%)" }}
        />
      )}
      {Array.from({ length: n }, (_, i) => {
        const { x, y } = pontoDoRadar(i);
        return (
          <span
            key={i}
            className="absolute size-[7%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300 shadow-[0_0_8px_rgb(95_211_234)] animate-blip"
            style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${(i % 6) * 0.35}s`, animationIterationCount: ativo ? "infinite" : 1 }}
          />
        );
      })}
      <span className="absolute top-1/2 left-1/2 size-[9%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand" />
    </div>
  );
}

/** Chuva de confete (comemorações). Ignorado para quem prefere menos movimento. */
export async function confete(intensidade: "leve" | "forte" = "forte") {
  if (typeof window === "undefined" || prefereMenosMovimento()) return;
  // Sem confete não é problema (ex.: versão nova publicada com a aba aberta).
  const mod = await import("canvas-confetti").catch(() => null);
  if (!mod) return;
  const confetti = mod.default;
  const cores = ["#03abc9", "#5fd3ea", "#ffffff", "#081021", "#22bedb", "#fbbf24"];
  const base = { colors: cores, disableForReducedMotion: true, zIndex: 80 };
  if (intensidade === "leve") {
    confetti({ ...base, particleCount: 70, spread: 70, origin: { y: 0.7 } });
    return;
  }
  confetti({ ...base, particleCount: 110, spread: 80, origin: { y: 0.65 } });
  setTimeout(() => confetti({ ...base, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 180);
  setTimeout(() => confetti({ ...base, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 320);
}
