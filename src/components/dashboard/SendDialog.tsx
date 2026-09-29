"use client";

import { CheckCircle2, ExternalLink, Info, Send } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Badge, Button, Modal } from "@/components/ui";
import { api } from "@/lib/client/api";
import type { CheckResult, Lead, SendResult } from "@/lib/types";

const MOTIVOS: Record<string, string> = {
  ja_na_planilha: "já estavam na planilha",
  optout: "pediram opt-out",
  repetido_no_lote: "repetidos no envio",
  telefone_invalido: "telefone inválido",
};

export function SendDialog({
  aberto,
  onFechar,
  leads,
  check,
  onEnviado,
}: {
  aberto: boolean;
  onFechar: () => void;
  leads: Lead[];
  check?: CheckResult;
  onEnviado: (r: SendResult) => void;
}) {
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<SendResult | null>(null);

  const fixos = leads.filter((l) => l.telefoneTipo === "fixo").length;
  const aba = check?.aba ?? "leads";
  const status = check?.statusPadrao ?? "pendente";

  function fechar() {
    if (enviando) return;
    setResultado(null);
    onFechar();
  }

  async function enviar() {
    setEnviando(true);
    try {
      const r = await api<SendResult>("/api/sheets/send", {
        leads: leads.map((l) => ({
          telefone: l.telefone,
          nome: l.nome,
          tipo: l.tipo,
          cidade: l.cidade,
          endereco: l.endereco,
          bairro: l.bairro,
          uf: l.uf,
          site: l.site,
          mapsUrl: l.mapsUrl,
          nota: l.nota,
          avaliacoes: l.avaliacoes,
          categoria: l.categoria,
          placeId: l.id,
          termo: l.termo,
        })),
      });
      setResultado(r);
      onEnviado(r);
      toast(`${r.adicionados.length} leads adicionados à planilha.`, "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setEnviando(false);
    }
  }

  const agrupados = resultado
    ? Object.entries(
        resultado.ignorados.reduce<Record<string, number>>((acc, i) => {
          acc[i.motivo ?? "outro"] = (acc[i.motivo ?? "outro"] ?? 0) + 1;
          return acc;
        }, {}),
      )
    : [];

  return (
    <Modal open={aberto} onClose={fechar} title={resultado ? "Envio concluído" : `Enviar ${leads.length} leads para a planilha`} wide>
      {!resultado ? (
        <div className="space-y-5">
          <div className="flex gap-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              As linhas entram no fim da aba <b>{aba}</b> com status <b>{status}</b>. A Carol usa esse status para mandar a primeira mensagem no
              WhatsApp. Antes de gravar, a planilha é conferida de novo: quem já estiver lá é ignorado.
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold tracking-wider text-muted uppercase">Como vai ficar na planilha</p>
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface text-xs text-muted">
                  <tr>
                    {["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout"].map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 6).map((l) => (
                    <tr key={l.id} className="border-t border-line">
                      <td className="px-3 py-2 tabular-nums">{l.telefone}</td>
                      <td className="max-w-[220px] truncate px-3 py-2">{l.nome}</td>
                      <td className="px-3 py-2">{l.tipo}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{l.cidade}</td>
                      <td className="px-3 py-2">{status}</td>
                      <td className="px-3 py-2 text-muted" />
                      <td className="px-3 py-2 text-muted" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {leads.length > 6 && <p className="mt-2 text-xs text-muted">+ {leads.length - 6} linhas</p>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="green">{leads.length - fixos} celulares</Badge>
            {fixos > 0 && <Badge tone="amber">{fixos} fixos (podem não ter WhatsApp)</Badge>}
            <Badge tone="gray">{leads.filter((l) => l.tipo === "Autônomo").length} autônomos</Badge>
            <Badge tone="gray">{leads.filter((l) => l.tipo === "Empresa").length} empresas</Badge>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={fechar} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={enviar} loading={enviando} icon={<Send className="size-4" />} disabled={!leads.length}>
              Confirmar envio
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-8" />
          </div>
          <div>
            <p className="display text-5xl text-navy tabular-nums">{resultado.adicionados.length}</p>
            <p className="mt-1 text-sm text-muted">
              leads adicionados na aba <b>{resultado.aba}</b> como <b>{status}</b>
            </p>
          </div>
          {agrupados.length > 0 && (
            <div className="mx-auto max-w-sm rounded-xl bg-surface px-4 py-3 text-left text-sm">
              <p className="mb-1 font-semibold text-ink">Ignorados para não repetir mensagem:</p>
              <ul className="space-y-0.5 text-muted">
                {agrupados.map(([motivo, n]) => (
                  <li key={motivo}>
                    <b className="text-ink tabular-nums">{n}</b> {MOTIVOS[motivo] ?? motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col-reverse justify-center gap-2 sm:flex-row">
            <Button variant="ghost" onClick={fechar}>
              Fechar
            </Button>
            <a
              href={resultado.planilhaUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-navy px-4 text-sm font-semibold text-white hover:bg-navy-800"
            >
              <ExternalLink className="size-4" /> Abrir planilha
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
