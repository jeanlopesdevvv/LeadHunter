"use client";

import { ArrowRight, Eye, EyeOff, Lock } from "lucide-react";
import { useState } from "react";

import { Button, inputClass } from "@/components/ui";

export function LoginForm({ next, semSenha }: { next: string; semSenha: boolean }) {
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!senha) return;
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha }),
      });
      const data = (await res.json().catch(() => ({}))) as { erro?: string };
      if (!res.ok) throw new Error(data.erro || "Não foi possível entrar.");
      window.location.assign(next);
    } catch (err) {
      setErro((err as Error).message);
      setCarregando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="mt-8 space-y-4">
      {semSenha && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          A senha do Radar ainda não foi definida no servidor (ou é a de exemplo). No EasyPanel, coloque em <b>APP_PASSWORD</b> uma senha com 8
          ou mais caracteres e clique em Implantar.
        </div>
      )}
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input
          type={ver ? "text" : "password"}
          autoFocus
          autoComplete="current-password"
          placeholder="Senha"
          aria-label="Senha"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className={`${inputClass} h-12 pr-11 pl-10 text-[15px]`}
        />
        <button
          type="button"
          onClick={() => setVer((v) => !v)}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-2 text-muted hover:text-ink"
          aria-label={ver ? "Esconder senha" : "Mostrar senha"}
        >
          {ver ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}
      <Button type="submit" size="lg" className="w-full" loading={carregando} disabled={!senha || semSenha}>
        Ligar o radar <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
