"use client";

import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { useState } from "react";

import { Button, inputClass } from "@/components/ui";

/**
 * Entrar no Radar (12/11/2026): com a conta do Voob CRM (e-mail e senha) e, enquanto estiver liberada, com a senha da
 * equipe. Com a conta, o histórico mostra o nome de quem fez cada coisa.
 */
export function LoginForm({ next, semSenha, comConta, comSenhaUnica }: { next: string; semSenha: boolean; comConta: boolean; comSenhaUnica: boolean }) {
  const [modo, setModo] = useState<"conta" | "equipe">(comConta ? "conta" : "equipe");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ver, setVer] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const conta = modo === "conta";
  const pronto = Boolean(senha) && (!conta || Boolean(email.trim()));

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    if (!pronto) return;
    setErro("");
    setCarregando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conta ? { email: email.trim(), senha } : { senha }),
      });
      const data = (await res.json().catch(() => ({}))) as { erro?: string };
      if (!res.ok) throw new Error(data.erro || "Não foi possível entrar.");
      window.location.assign(next);
    } catch (err) {
      setErro((err as Error).message);
      setCarregando(false);
    }
  }

  const trocar = (m: "conta" | "equipe") => {
    setModo(m);
    setErro("");
    setSenha("");
  };

  return (
    <form onSubmit={entrar} className="mt-8 space-y-4">
      {semSenha && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          O acesso ao Radar ainda não foi configurado. Fale com o administrador.
        </div>
      )}
      {conta && (
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
          <input
            type="email"
            autoFocus
            autoComplete="username"
            placeholder="E-mail do Voob CRM"
            aria-label="E-mail do Voob CRM"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${inputClass} h-12 pl-10 text-[15px]`}
          />
        </div>
      )}
      <div className="relative">
        <Lock className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" />
        <input
          type={ver ? "text" : "password"}
          autoFocus={!conta}
          autoComplete="current-password"
          placeholder={conta ? "Senha do Voob CRM" : "Senha da equipe"}
          aria-label={conta ? "Senha do Voob CRM" : "Senha da equipe"}
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
      <Button type="submit" size="lg" className="w-full" loading={carregando} disabled={!pronto || semSenha}>
        Entrar <ArrowRight className="size-4" />
      </Button>
      {comConta && comSenhaUnica && (
        <p className="text-center text-sm text-muted">
          {conta ? (
            <button type="button" className="font-semibold text-brand-700 underline-offset-2 hover:underline" onClick={() => trocar("equipe")}>
              Entrar com a senha da equipe
            </button>
          ) : (
            <button type="button" className="font-semibold text-brand-700 underline-offset-2 hover:underline" onClick={() => trocar("conta")}>
              Entrar com a minha conta do Voob CRM
            </button>
          )}
        </p>
      )}
    </form>
  );
}
