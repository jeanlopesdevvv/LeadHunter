"use client";

import { Headset } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";

import { useToast } from "@/components/toast";
import { cx } from "@/components/ui";
import { api } from "@/lib/client/api";
import { normalizePhone } from "@/lib/phone";

/** Nome da aba do Chatwoot: clicar de novo reaproveita a mesma aba em vez de abrir outra. */
export const ABA_CHATWOOT = "lavacar-chatwoot";

export interface EstadoChatwoot {
  url: string;
  apiLigada: boolean;
}

let estado: EstadoChatwoot | null = null;
let buscando = false;
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((f) => f());
}

export function atualizarChatwoot() {
  if (buscando) return;
  buscando = true;
  api<EstadoChatwoot>("/api/chatwoot")
    .then((e) => {
      estado = e;
      avisar();
    })
    .catch(() => undefined)
    .finally(() => {
      buscando = false;
    });
}

function assinar(f: () => void) {
  ouvintes.add(f);
  if (!estado) atualizarChatwoot();
  return () => ouvintes.delete(f);
}

/** Endereço do atendimento (lido uma vez do servidor). */
export function useChatwoot(): EstadoChatwoot | null {
  return useSyncExternalStore(
    assinar,
    () => estado,
    () => null,
  );
}

/** Abre a tela de atendimento na aba do Chatwoot (reaproveitando a mesma aba). */
export function abrirAtendimento(url: string) {
  const aba = window.open(url, ABA_CHATWOOT);
  aba?.focus();
}

/**
 * Botão "Atender": abre a conversa do contato no Chatwoot. Com token, vai direto na conversa;
 * sem token, abre a tela do atendimento e copia o telefone para colar na busca.
 */
export function BotaoAtender({
  telefone,
  nome,
  children,
  className,
  compacto,
}: {
  telefone: string;
  nome?: string;
  children?: ReactNode;
  className?: string;
  compacto?: boolean;
}) {
  const cw = useChatwoot();
  const toast = useToast();
  if (!cw?.url) return null;
  const digitos = normalizePhone(telefone).digits || telefone.replace(/\D/g, "");

  function abrir() {
    if (!cw) return;
    if (cw.apiLigada) {
      abrirAtendimento(`/api/chatwoot/abrir?telefone=${encodeURIComponent(digitos)}`);
      return;
    }
    const local = digitos.startsWith("55") ? digitos.slice(2) : digitos;
    navigator.clipboard
      ?.writeText(local)
      .then(() => toast(`Telefone de ${nome || "contato"} copiado: cole na busca do Chatwoot.`, "info"))
      .catch(() => undefined);
    abrirAtendimento(cw.url);
  }

  return (
    <button
      type="button"
      onClick={abrir}
      title={cw.apiLigada ? "Abrir a conversa no Chatwoot" : "Abrir o Chatwoot (o telefone é copiado para você colar na busca)"}
      aria-label={`Atender ${nome ?? ""} no Chatwoot`}
      className={cx(
        compacto
          ? "rounded-lg p-1.5 text-muted transition hover:bg-brand-50 hover:text-brand-700"
          : "inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-bold text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100",
        className,
      )}
    >
      <Headset className={compacto ? "size-4" : "size-3.5"} />
      {!compacto && (children ?? "Atender")}
    </button>
  );
}
