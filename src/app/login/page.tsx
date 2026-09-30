import { ShieldCheck, Sparkles, Table2 } from "lucide-react";

import { Logo } from "@/components/Logo";
import { senhaDoApp } from "@/lib/session";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar · Radar Lavacar" };

/** Só aceita caminhos deste próprio site (bloqueia "/\\evil.com", "/<tab>/evil.com" etc.). */
function safeNext(raw: string): string {
  try {
    const base = "http://leadhunter.local";
    const url = new URL(raw, base);
    return url.origin === base ? `${url.pathname}${url.search}` : "/";
  } catch {
    return "/";
  }
}

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = safeNext(typeof params.next === "string" ? params.next : "/");
  const semSenha = !senhaDoApp().ok;

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="glow-tl relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex xl:p-16">
        <Logo dark />
        <div className="max-w-lg">
          <p className="eyebrow">Radar Lavacar</p>
          <h1 className="display mt-5 text-6xl xl:text-7xl">
            <span className="block animate-enter">Caça.</span>
            <span className="block animate-enter [animation-delay:120ms]">Dispara.</span>
            <span className="block animate-enter text-brand [animation-delay:240ms]">Fecha negócio.</span>
          </h1>
          <p className="mt-6 max-w-md animate-enter text-[17px] leading-relaxed text-white/65 [animation-delay:360ms]">
            O Radar varre o Google Maps atrás de lava-jatos e lavadores autônomos, tira quem já está na planilha e entrega só oportunidade
            nova para a Carol chamar no WhatsApp.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-8 text-sm">
          <div>
            <Sparkles className="mb-2 size-5 text-brand" />
            <div className="font-bold">Direto do Google</div>
            <div className="text-white/50">telefone, nota e endereço na hora</div>
          </div>
          <div>
            <ShieldCheck className="mb-2 size-5 text-brand" />
            <div className="font-bold">Sem repetir</div>
            <div className="text-white/50">ninguém recebe duas vezes</div>
          </div>
          <div>
            <Table2 className="mb-2 size-5 text-brand" />
            <div className="font-bold">Carol no ataque</div>
            <div className="text-white/50">disparo e placar ao vivo</div>
          </div>
        </div>
      </section>

      <section className="glow-br flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <p className="eyebrow">Acesso restrito</p>
          <h2 className="display mt-3 text-4xl text-navy">Bora caçar?</h2>
          <p className="mt-3 text-[15px] text-muted">Digite a senha da equipe e ligue o radar.</p>
          <LoginForm next={next} semSenha={semSenha} />
        </div>
      </section>
    </main>
  );
}
