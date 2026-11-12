"use client";

import { Building2, Check, ImagePlus, Search, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button, cx, Field, inputClass, Modal } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { siglaDe } from "@/lib/empresas";
import { CORES_SUGERIDAS } from "@/lib/voob/marca";
import type { ContaCrm } from "@/lib/voob/tipos";

import { lerLogo, SeloMarca } from "./marca";

/**
 * Criar empresa (13/11/2026, white label; só a equipe da Voob, por enquanto). Passo 1 de 6: nome, cor, logo, quem fala,
 * a conta do Voob CRM e a cidade. A empresa nasce desligada e já abre nos "Primeiros passos" (os outros 5 passos).
 */

export interface DadosMarca {
  nome: string;
  cor: string;
  logo: string | null;
  publico: string;
  agente: string;
}

/** Nome, cor, logo, público e quem fala (criar e editar usam o mesmo formulário). */
export function CamposMarca({ v, onV, onErro }: { v: DadosMarca; onV: (v: DadosMarca) => void; onErro: (m: string) => void }) {
  const id = useId();
  const escolherLogo = async (f: File | undefined) => {
    if (!f) return;
    try {
      onV({ ...v, logo: await lerLogo(f) });
    } catch (e) {
      onErro((e as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <SeloMarca empresa={{ nome: v.nome || "Empresa", sigla: siglaDe(v.nome || "Empresa"), cor: v.cor, logo: v.logo }} className="size-14 text-base" />
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-brand-200 bg-card px-3 text-xs font-semibold text-brand-700 transition hover:border-brand hover:bg-brand-50">
            <ImagePlus className="size-3.5" /> {v.logo ? "Trocar o logo" : "Pôr o logo"}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => void escolherLogo(e.target.files?.[0])} />
          </label>
          {v.logo && (
            <Button type="button" variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => onV({ ...v, logo: null })}>
              Tirar
            </Button>
          )}
        </div>
      </div>
      <Field label="Nome da empresa" htmlFor={`${id}-nome`}>
        <input id={`${id}-nome`} className={inputClass} value={v.nome} maxLength={40} onChange={(e) => onV({ ...v, nome: e.target.value })} placeholder="Ex.: Clínica Bem Estar" />
      </Field>
      <Field label="Cor" hint="Aparece no menu e nos botões">
        <div className="flex flex-wrap items-center gap-2">
          {CORES_SUGERIDAS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Cor ${c}`}
              aria-pressed={v.cor === c}
              onClick={() => onV({ ...v, cor: c })}
              className={cx("grid size-8 place-items-center rounded-full ring-2 transition", v.cor === c ? "ring-ink" : "ring-transparent hover:ring-line")}
              style={{ backgroundColor: c }}
            >
              {v.cor === c && <Check className="size-4 text-white" />}
            </button>
          ))}
          <input type="color" aria-label="Outra cor" value={v.cor} onChange={(e) => onV({ ...v, cor: e.target.value })} className="size-8 cursor-pointer rounded-full border border-line bg-card p-0.5" />
        </div>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quem a empresa procura" hint="Opcional" htmlFor={`${id}-publico`}>
          <input id={`${id}-publico`} className={inputClass} value={v.publico} maxLength={80} onChange={(e) => onV({ ...v, publico: e.target.value })} placeholder="Ex.: Lojas de BH" />
        </Field>
        <Field label="Quem fala na mensagem" hint="Nome da pessoa ou da IA" htmlFor={`${id}-agente`}>
          <input id={`${id}-agente`} className={inputClass} value={v.agente} maxLength={40} onChange={(e) => onV({ ...v, agente: e.target.value })} placeholder="Ex.: Ana" />
        </Field>
      </div>
    </div>
  );
}

export function CriarEmpresa({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [v, setV] = useState<DadosMarca>({ nome: "", cor: CORES_SUGERIDAS[1], logo: null, publico: "", agente: "" });
  const [cidade, setCidade] = useState("Belo Horizonte, MG");
  const [busca, setBusca] = useState("");
  const [contas, setContas] = useState<ContaCrm[] | null>(null);
  const [conta, setConta] = useState<ContaCrm | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const t = window.setTimeout(() => {
      api<{ contas: ContaCrm[] }>(`/api/voob/contas?busca=${encodeURIComponent(busca)}`).then(
        (r) => setContas(r.contas),
        (e) => setErro(e instanceof ApiError ? e.message : "Não deu para ler as contas do Voob CRM."),
      );
    }, 250);
    return () => window.clearTimeout(t);
  }, [aberto, busca]);

  const criar = async () => {
    setErro("");
    if (v.nome.trim().length < 2) return setErro("Escreva o nome da empresa.");
    if (!conta) return setErro("Escolha a conta do Voob CRM da empresa.");
    setSalvando(true);
    try {
      await api("/api/empresas", { ...v, logo: v.logo ?? undefined, agente: v.agente.trim() || undefined, conta: conta.id, cidade });
      try {
        sessionStorage.setItem("radar-voob-tela", "comecar");
      } catch {
        /* sem armazenamento */
      }
      window.location.reload();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não deu para criar a empresa agora.");
      setSalvando(false);
    }
  };

  return (
    <Modal open={aberto} onClose={onFechar} title="Criar empresa" wide>
      <div className="space-y-6">
        <p className="text-sm text-muted">
          Este é o passo 1 de 6. A empresa nasce desligada; depois você conecta o WhatsApp, escolhe a 1ª mensagem, quem responde, o que buscar e
          faz o teste no seu número.
        </p>
        <CamposMarca v={v} onV={setV} onErro={setErro} />
        <Field label="Conta do Voob CRM" hint="Onde ficam o número e as conversas">
          <div className="rounded-xl border border-line">
            <div className="flex items-center gap-2 border-b border-line px-3">
              <Search className="size-4 text-muted" />
              <input
                className="h-10 w-full bg-transparent text-sm text-ink placeholder:text-slate-400 focus:outline-none"
                placeholder="Procurar pelo nome da conta"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <ul className="max-h-52 overflow-y-auto p-1 scrollbar-thin" role="listbox" aria-label="Contas do Voob CRM">
              {contas === null && <li className="px-3 py-2 text-sm text-muted">Carregando…</li>}
              {contas?.length === 0 && <li className="px-3 py-2 text-sm text-muted">Nenhuma conta com esse nome.</li>}
              {contas?.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={conta?.id === c.id}
                    onClick={() => setConta(c)}
                    className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition", conta?.id === c.id ? "bg-brand-50" : "hover:bg-strong/[0.04]")}
                  >
                    <Building2 className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{c.nome}</span>
                      <span className="block truncate text-xs text-muted">
                        {c.oficial ? "Já tem WhatsApp oficial" : c.modulo_oficial ? "Sem WhatsApp oficial ainda" : "WhatsApp oficial não liberado nesta conta"}
                        {c.empresa && ` · já é a conta de “${c.empresa}” no Radar`}
                      </span>
                    </span>
                    {conta?.id === c.id && <Check className="size-4 shrink-0 text-brand" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Field>
        <Field label="Cidade da busca" hint="Dá para mudar depois">
          <input className={inputClass} value={cidade} maxLength={80} onChange={(e) => setCidade(e.target.value)} placeholder="Ex.: Belo Horizonte, MG" />
        </Field>
        {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={criar} loading={salvando}>
            Criar e continuar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
