"use client";

import { Copy, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";

import { useToast } from "@/components/toast";
import { Button, cx } from "@/components/ui";
import { api } from "@/lib/client/api";

/**
 * Passo a passo para ligar a trava de segurança no Fluxo 1 do n8n. Sem ela, o n8n já tem a
 * lista inteira na memória e Pausar/Cancelar no Radar não conseguem parar o envio no meio.
 */
export function InstalarTrava({ className, aberto = false }: { className?: string; aberto?: boolean }) {
  const toast = useToast();
  const [nos, setNos] = useState<string | null>(null);

  // Busca antes do clique: o navegador só deixa copiar logo depois do clique.
  useEffect(() => {
    let ativo = true;
    api<{ nos: string }>("/api/disparo/trava")
      .then((r) => ativo && setNos(r.nos))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, []);

  function copiar() {
    if (!nos) return toast("Ainda carregando os nós. Tente de novo em um segundo.", "info");
    navigator.clipboard
      .writeText(nos)
      .then(() => toast("Nós da trava copiados. Cole no Fluxo 1 do n8n com Ctrl+V.", "success"))
      .catch(() => toast("Não deu para copiar. Tente de novo.", "error"));
  }

  return (
    <details open={aberto} className={cx("group rounded-xl border border-line bg-card px-4 py-3 text-sm", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-semibold text-ink">
        <ShieldAlert className="size-4 text-amber-500" />
        Como instalar a trava no n8n (uma vez só, 3 minutos)
      </summary>
      <div className="mt-3 space-y-3 text-muted">
        <p>
          O Fluxo 1 lê a lista inteira quando começa. Com a trava, ele pergunta ao Radar antes de cada mensagem se ainda pode enviar:
          é isso que faz <b className="text-ink">Pausar</b> e <b className="text-ink">Cancelar</b> pararem o envio no meio.
        </p>
        <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed">
          <li>Clique em <b className="text-ink">Copiar os nós da trava</b> (abaixo).</li>
          <li>
            No n8n, abra o <b className="text-ink">Fluxo 1</b>, clique num espaço vazio perto do nó <i>Delay - Antiblock</i> e aperte{" "}
            <b className="text-ink">Ctrl+V</b>. Aparecem <i>Radar: Pode Enviar?</i> e <i>Radar Mandou Parar?</i>, já ligados entre si.
          </li>
          <li>
            Apague a linha que vai de <i>Delay - Antiblock</i> até <i>Montar Mensagem</i> (passe o mouse na linha e clique na lixeira).
          </li>
          <li>
            Ligue <i>Delay - Antiblock</i> → <i>Radar: Pode Enviar?</i>.
          </li>
          <li>
            Ligue a saída <b className="text-ink">false</b> de <i>Radar Mandou Parar?</i> → <i>Montar Mensagem</i>. A saída <b className="text-ink">true</b>{" "}
            fica vazia (é ela que encerra o disparo).
          </li>
          <li>
            Clique em <b className="text-ink">Publish</b>.
          </li>
        </ol>
        <p className="text-[13px]">
          No próximo disparo, a tela mostra <b className="text-ink">Trava ativa</b>. Se o Radar estiver fora do ar, o n8n para o disparo por
          segurança (quem faltou continua na fila).
        </p>
        <Button size="sm" variant="outline" icon={<Copy className="size-3.5" />} onClick={copiar}>
          Copiar os nós da trava
        </Button>
      </div>
    </details>
  );
}
