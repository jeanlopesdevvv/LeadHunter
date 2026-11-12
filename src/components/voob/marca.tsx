"use client";

import { cx } from "@/components/ui";
import type { Empresa } from "@/lib/empresas";

/** O selo da empresa: o logo, ou a sigla na cor dela. */
export function SeloMarca({ empresa, className }: { empresa: Pick<Empresa, "sigla" | "cor" | "nome"> & { logo?: string | null }; className?: string }) {
  if (empresa.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={empresa.logo} alt="" aria-hidden className={cx("shrink-0 rounded-lg bg-white object-contain ring-1 ring-white/15", className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cx("grid shrink-0 place-items-center rounded-lg text-[11px] font-extrabold tracking-wide text-white ring-1 ring-white/15", className)}
      style={{ backgroundColor: empresa.cor }}
    >
      {empresa.sigla}
    </span>
  );
}

/** Lê a imagem escolhida e reduz para no máximo 128 px (PNG): o logo fica pequeno no banco. */
export function lerLogo(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(arquivo.type)) return reject(new Error("Escolha uma imagem (PNG, JPG ou WebP)."));
    if (arquivo.size > 5_000_000) return reject(new Error("Imagem grande demais (máximo 5 MB)."));
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const lado = 128;
      const escala = Math.min(1, lado / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * escala));
      c.height = Math.max(1, Math.round(img.height * escala));
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não deu para abrir essa imagem."));
    };
    img.src = url;
  });
}
