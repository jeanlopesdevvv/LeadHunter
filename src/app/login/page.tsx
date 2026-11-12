import { ShieldCheck, Sparkles, Table2 } from "lucide-react";

import { Logo } from "@/components/Logo";
import { senhaDoApp, senhaUnicaLiberada } from "@/lib/session";
import { loginPorContaDisponivel } from "@/lib/voob/pessoas";

import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar · Radar Voob" };

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
  const comConta = loginPorContaDisponivel();
  // Sem o login por conta configurado, a senha da equipe é o único jeito de entrar (nunca tranca todo mundo para fora).
  const comSenhaUnica = senhaUnicaLiberada() || !comConta;

  return (
    // 12/11/2026: a entrada é sempre da Voob ("radar by voob"); depois de entrar, as cores seguem a empresa escolhida.
    <main data-empresa="voob" className="grid min-h-screen bg-surface lg:grid-cols-2">
      <section className="glow-tl relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex xl:p-16">
        <Logo dark />
        <div className="max-w-lg">
          <p className="eyebrow">Radar by Voob</p>
          <h1 className="display mt-5 text-6xl xl:text-7xl">
            <span className="block animate-enter">Encontre.</span>
            <span className="block animate-enter [animation-delay:120ms]">Conecte.</span>
            <span className="block animate-enter text-brand [animation-delay:240ms]">Feche negócio.</span>
          </h1>
          <p className="mt-6 max-w-md animate-enter text-[17px] leading-relaxed text-white/65 [animation-delay:360ms]">
            O Radar encontra empresas no Google Maps, tira quem já foi contatado e entrega só contatos novos para o WhatsApp
            oficial da sua empresa, com a IA atendendo quem responde.
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
            <div className="font-bold">Disparo acompanhado</div>
            <div className="text-white/50">envio e respostas ao vivo</div>
          </div>
        </div>
      </section>

      <section className="glow-br flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          <p className="eyebrow">Acesso restrito</p>
          <h2 className="display mt-3 text-4xl text-strong">Acesse o Radar</h2>
          <p className="mt-3 text-[15px] text-muted">
            {comConta ? "Entre com o e-mail e a senha que você usa no Voob CRM." : "Digite a senha da equipe para entrar."}
          </p>
          <LoginForm next={next} semSenha={semSenha} comConta={comConta} comSenhaUnica={comSenhaUnica} />
        </div>
      </section>
    </main>
  );
}
