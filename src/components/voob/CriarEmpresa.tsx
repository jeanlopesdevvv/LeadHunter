"use client";

import { Building2, Check, Gauge, ImagePlus, Inbox, Search, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button, cx, Field, inputClass, Modal } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { siglaDe } from "@/lib/empresas";
import { CORES_SUGERIDAS } from "@/lib/voob/marca";
import type { ConfigVoob, ContaCrm, PedidoRadar } from "@/lib/voob/tipos";

import { lerLogo, SeloMarca } from "./marca";

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

/** Os limites de cliente ao liberar (a equipe muda por empresa quando precisar). */
export const LIMITES_PADRAO = { cota_buscas_mes: 300, envios_max_dia: 50 };

const haQuanto = (iso: string) => {
  const min = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return min < 60 ? `há ${min} min` : min < 48 * 60 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} dias`;
};

/**
 * Liberar o Radar (19/11/2026; antes "Criar empresa", 13/11/2026; só a equipe). A equipe escolhe a conta do Voob CRM (ou
 * um pedido de "Quero usar o Radar") e os limites; o nome e o logo vêm da conta. O cliente monta o resto no Começar.
 */
export function CriarEmpresa({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const [v, setV] = useState<DadosMarca>({ nome: "", cor: CORES_SUGERIDAS[1], logo: null, publico: "", agente: "" });
  const [personalizar, setPersonalizar] = useState(false);
  const [busca, setBusca] = useState("");
  const [contas, setContas] = useState<ContaCrm[] | null>(null);
  const [conta, setConta] = useState<ContaCrm | null>(null);
  const [pedidos, setPedidos] = useState<PedidoRadar[]>([]);
  const [pedido, setPedido] = useState<number | null>(null);
  const [cota, setCota] = useState(String(LIMITES_PADRAO.cota_buscas_mes));
  const [envios, setEnvios] = useState(String(LIMITES_PADRAO.envios_max_dia));
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    api<{ pedidos?: PedidoRadar[] }>("/api/empresas").then(
      (r) => setPedidos(r.pedidos ?? []),
      () => setPedidos([]),
    );
  }, [aberto]);

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

  const escolher = (c: ContaCrm, deQualPedido: number | null = null) => {
    setConta(c);
    setPedido(deQualPedido);
    setV((x) => ({ ...x, nome: c.nome.slice(0, 40), logo: c.logo ?? null }));
    setErro("");
  };

  const criar = async () => {
    setErro("");
    if (!conta) return setErro("Escolha a conta do Voob CRM.");
    const nCota = Number(cota);
    const nEnvios = Number(envios);
    if (!Number.isInteger(nCota) || nCota < 1 || nCota > 100000) return setErro("Buscas por mês: de 1 a 100.000.");
    if (!Number.isInteger(nEnvios) || nEnvios < 1 || nEnvios > 250) return setErro("Envios por dia: de 1 a 250.");
    if (personalizar && v.nome.trim().length < 2) return setErro("Escreva o nome da empresa.");
    setSalvando(true);
    try {
      await api("/api/empresas", {
        conta: conta.id,
        ...(personalizar ? { ...v, logo: v.logo ?? undefined, agente: v.agente.trim() || undefined } : { logo: conta.logo ?? undefined }),
        cota_buscas_mes: nCota,
        envios_max_dia: nEnvios,
        ...(pedido ? { pedido } : {}),
      });
      try {
        sessionStorage.setItem("radar-voob-tela", "comecar");
      } catch {
        /* sem armazenamento */
      }
      window.location.reload();
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não deu para liberar agora.");
      setSalvando(false);
    }
  };

  return (
    <Modal open={aberto} onClose={onFechar} title="Liberar o Radar para uma conta" wide>
      <div className="space-y-6">
        <p className="text-sm text-muted">
          Escolha a conta do Voob CRM. O nome e o logo vêm da conta; quem usa a conta entra no Radar e monta o resto no Começar (o que oferece, WhatsApp,
          mensagem, quem responde e ligar).
        </p>

        {pedidos.length > 0 && (
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
              <Inbox className="size-4" /> {pedidos.length === 1 ? "1 pedido para usar o Radar" : `${pedidos.length} pedidos para usar o Radar`}
            </p>
            <ul className="mt-2 space-y-1.5">
              {pedidos.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900">
                  <span className="min-w-0">
                    <b>{p.nome}</b> · {p.contas.map((c) => c.nome).join(", ") || "sem conta no CRM"} · {haQuanto(p.em)}
                  </span>
                  {p.contas.length > 0 && (
                    <Button
                      size="sm"
                      variant={pedido === p.id ? "primary" : "outline"}
                      onClick={() => {
                        const c = p.contas[0];
                        escolher(contas?.find((x) => x.id === c.id) ?? { id: c.id, nome: c.nome, oficial: false, modulo_oficial: true, empresa: null, logo: null }, p.id);
                      }}
                    >
                      {pedido === p.id ? "Escolhido" : "Escolher"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

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
                    onClick={() => escolher(c)}
                    className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition", conta?.id === c.id ? "bg-brand-50" : "hover:bg-strong/[0.04]")}
                  >
                    {c.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logo} alt="" className="size-6 shrink-0 rounded-md bg-white object-contain ring-1 ring-line" />
                    ) : (
                      <Building2 className="size-4 shrink-0 text-muted" />
                    )}
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buscas no Google por mês" hint="Padrão 300">
            <input className={cx(inputClass, "tabular-nums")} inputMode="numeric" value={cota} onChange={(e) => setCota(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Máximo de envios por dia" hint="Padrão 50">
            <input className={cx(inputClass, "tabular-nums")} inputMode="numeric" value={envios} onChange={(e) => setEnvios(e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>

        {conta && (
          <div className="rounded-xl ring-1 ring-line">
            <button type="button" onClick={() => setPersonalizar((x) => !x)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
              <SeloMarca empresa={{ nome: v.nome || conta.nome, sigla: siglaDe(v.nome || conta.nome), cor: v.cor, logo: v.logo }} className="size-8" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{personalizar ? v.nome || conta.nome : conta.nome}</span>
                <span className="block text-xs text-muted">{personalizar ? "Nome, cor e logo personalizados" : "Nome e logo da conta · o cliente pode mudar depois"}</span>
              </span>
              <span className="text-xs font-semibold text-brand-700">{personalizar ? "Usar os da conta" : "Personalizar"}</span>
            </button>
            {personalizar && (
              <div className="border-t border-line p-3">
                <CamposMarca v={v} onV={setV} onErro={setErro} />
              </div>
            )}
          </div>
        )}

        {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erro}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={criar} loading={salvando} disabled={!conta}>
            Liberar o Radar
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Limites de uma empresa (só a equipe): buscas por mês e máximo de envios por dia. */
export function LimitesEmpresa({ empresa, cota, envios, onSalvo }: { empresa: string; cota: number | null | undefined; envios: number | null | undefined; onSalvo: (c: ConfigVoob) => void }) {
  const [aberto, setAberto] = useState(false);
  const [vc, setVc] = useState("");
  const [ve, setVe] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const abrir = () => {
    setVc(cota ? String(cota) : "");
    setVe(envios ? String(envios) : "");
    setErro("");
    setAberto(true);
  };
  const salvar = async () => {
    setErro("");
    setSalvando(true);
    try {
      onSalvo(await api<ConfigVoob>("/api/empresas", { empresa, cota_buscas_mes: vc ? Number(vc) : null, envios_max_dia: ve ? Number(ve) : null }, { method: "PATCH" }));
      setAberto(false);
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não deu para salvar agora.");
    } finally {
      setSalvando(false);
    }
  };
  return (
    <>
      <button type="button" onClick={abrir} className="inline-flex items-center gap-1.5 text-xs text-white/60 underline-offset-2 transition hover:text-white hover:underline">
        <Gauge className="size-3.5" /> Limites (equipe): {cota ? `${cota.toLocaleString("pt-BR")} buscas/mês` : "buscas sem teto"} · {envios ? `${envios} envios/dia` : "envios sem teto"}
      </button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Limites desta empresa">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Buscas no Google por mês" hint="Vazio = sem teto">
              <input className={cx(inputClass, "tabular-nums")} inputMode="numeric" value={vc} onChange={(e) => setVc(e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Máximo de envios por dia" hint="Vazio = sem teto (até 250)">
              <input className={cx(inputClass, "tabular-nums")} inputMode="numeric" value={ve} onChange={(e) => setVe(e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <p className="text-xs text-muted">Se o limite do dia da empresa estiver acima do novo máximo, ele desce junto.</p>
          {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} loading={salvando}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
