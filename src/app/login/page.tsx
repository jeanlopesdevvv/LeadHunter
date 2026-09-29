import { ShieldCheck, Sparkles, Table2 } from "lucide-react";

import { Logo } from "@/components/Logo";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar · LeadHunter" };

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
  const semSenha = !process.env.APP_PASSWORD?.trim();

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="glow-tl relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex xl:p-16">
        <Logo dark />
        <div className="max-w-lg">
          <p className="eyebrow">Prospecção Lavacar</p>
          <h1 className="display mt-5 text-6xl xl:text-7xl">
            Encontre.
            <br />
            Filtre.
            <br />
            <span className="text-brand">Venda mais.</span>
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/65">
            Busca lava-jatos no Google, remove quem já está na planilha e entrega os novos direto para a Carol, com um clique.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-8 text-sm">
          <div>
            <Sparkles className="mb-2 size-5 text-brand" />
            <div className="font-bold">Google oficial</div>
            <div className="text-white/50">dados limpos, sem bloqueio</div>
          </div>
          <div>
            <ShieldCheck className="mb-2 size-5 text-brand" />
            <div className="font-bold">Zero repetidos</div>
            <div className="text-white/50">ninguém recebe duas vezes</div>
          </div>
          <div>
            <Table2 className="mb-2 size-5 text-brand" />
            <div className="font-bold">Direto na planilha</div>
            <div className="text-white/50">aba leads, status pendente</div>
          </div>
        </div>
      </section>

      <section className="glow-br flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <p className="eyebrow">Acesso restrito</p>
          <h2 className="display mt-3 text-4xl text-navy">Entre no LeadHunter</h2>
          <p className="mt-3 text-[15px] text-muted">Use a senha da equipe comercial.</p>
          <LoginForm next={next} semSenha={semSenha} />
        </div>
      </section>
    </main>
  );
}
