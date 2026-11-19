"use client";

import { CirclePause, CirclePlay, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { useToast } from "@/components/toast";
import { Button, cx, Modal, Toggle } from "@/components/ui";
import { api, ApiError } from "@/lib/client/api";
import { custoEstimado, reais, textoDias } from "@/lib/voob/regras";
import type { ConfigVoob } from "@/lib/voob/tipos";

import { Chip, n } from "./comum";

/**
 * Ligar e desligar o Radar (19/11/2026), igual em Começar e em Envios: quantas mensagens por dia (até o máximo da
 * empresa), se o Radar procura empresas novas sozinho e o aceite de responsabilidade (obrigatório, guardado no banco).
 * Ligar com a base vazia já começa a primeira busca.
 */

export const OPCOES_LIMITE = [10, 20, 30, 50];

/** As opções de mensagens por dia que cabem no máximo da empresa (sem máximo: todas). */
export function opcoesDoLimite(maximo: number | null | undefined): number[] {
  if (!maximo) return OPCOES_LIMITE;
  const cabem = OPCOES_LIMITE.filter((v) => v <= maximo);
  return cabem.includes(maximo) || maximo > OPCOES_LIMITE[OPCOES_LIMITE.length - 1] ? cabem : [...cabem, maximo];
}

export function LigarRadar({
  cfg,
  aberto,
  desligar = false,
  onFechar,
  onCfg,
}: {
  cfg: ConfigVoob;
  aberto: boolean;
  /** true = a janela de desligar. */
  desligar?: boolean;
  onFechar: () => void;
  onCfg: (c: ConfigVoob) => void;
}) {
  const toast = useToast();
  const e = cfg.empresa;
  const opcoes = opcoesDoLimite(e.envios_max_dia);
  const inicial = Math.min(e.limite_dia, e.envios_max_dia ?? e.limite_dia);
  const [limite, setLimite] = useState(opcoes.includes(inicial) ? inicial : (opcoes.find((v) => v >= inicial) ?? opcoes[opcoes.length - 1]));
  const [buscar, setBuscar] = useState(true);
  const [aceito, setAceito] = useState(Boolean(e.aceite));
  const [indo, setIndo] = useState(false);
  const jaAceitou = Boolean(e.aceite);

  const ligar = async () => {
    setIndo(true);
    try {
      if (!jaAceitou) await api<ConfigVoob>("/api/voob/aceite", { aceito: true });
      if (limite !== e.limite_dia) await api<ConfigVoob>("/api/voob/config", { mudancas: { limite_dia: limite } });
      const c = await api<ConfigVoob>("/api/voob/ligar", { ligado: true, buscar });
      onCfg(c);
      // Base vazia: já começa a procurar as primeiras empresas (sem esperar a rotina da manhã).
      let buscando = false;
      if (buscar && c.base_pronta < Math.min(limite, 20)) {
        buscando = await api<{ iniciada: boolean }>("/api/voob/busca-auto", {}).then(
          (r) => r.iniciada,
          () => false,
        );
      }
      toast(
        buscando
          ? "Ligado. O Radar já está procurando as primeiras empresas; as mensagens saem no próximo horário de envio."
          : `Ligado. ${c.hoje.na_fila ? `${n(c.hoje.na_fila)} já estão na fila de hoje.` : "As mensagens saem no próximo horário de envio."}`,
        "success",
      );
      onFechar();
    } catch (x) {
      toast(x instanceof ApiError ? x.message : "Não deu para ligar agora.", "error");
    } finally {
      setIndo(false);
    }
  };

  const fazerDesligar = async () => {
    setIndo(true);
    try {
      onCfg(await api<ConfigVoob>("/api/voob/ligar", { ligado: false, buscar: false }));
      toast("Desligado. Nada mais sai e o Radar parou de procurar. O que estava na fila de hoje volta para as encontradas.", "success");
      onFechar();
    } catch (x) {
      toast(x instanceof ApiError ? x.message : "Não deu para desligar agora.", "error");
    } finally {
      setIndo(false);
    }
  };

  if (desligar) {
    return (
      <Modal open={aberto} onClose={onFechar} title="Desligar o Radar?">
        <div className="space-y-4 text-sm text-ink">
          <p>Para de mandar mensagens e de procurar empresas novas. O que ainda não saiu hoje volta para as encontradas e sai quando ligar de novo.</p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onFechar}>
              Agora não
            </Button>
            <Button variant="danger" onClick={() => void fazerDesligar()} loading={indo} icon={<CirclePause className="size-4" />}>
              Desligar
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={aberto} onClose={onFechar} title={`Ligar o Radar da ${e.nome}`}>
      <div className="space-y-5 text-sm text-ink">
        <div>
          <p className="font-semibold">Quantas mensagens por dia?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {opcoes.map((v) => (
              <Chip key={v} ativo={limite === v} onClick={() => setLimite(v)}>
                {v}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {textoDias(e.dias).replace(/^./, (x) => x.toUpperCase())}, das {e.hora_inicio} às {e.hora_fim}, uma de cada vez. ≈ {reais(custoEstimado(limite))} por dia na Meta. Começar com 20 e subir aos
            poucos protege o número{e.envios_max_dia ? ` (o máximo desta empresa é ${e.envios_max_dia})` : ""}.
          </p>
        </div>

        <Toggle
          checked={buscar}
          onChange={setBuscar}
          label="Procurar empresas novas sozinho"
          hint={`Nos dias de envio o Radar busca no Google ${e.perfil.cidade ? `em ${e.perfil.cidade}` : "na cidade escolhida"} e enche a lista, sem você precisar buscar.`}
        />

        <label className={cx("flex cursor-pointer items-start gap-3 rounded-xl p-3 ring-1", aceito ? "bg-brand-50 ring-brand-200" : "ring-line")}>
          <input type="checkbox" className="mt-0.5 size-4 accent-brand-600" checked={aceito} disabled={jaAceitou} onChange={(x) => setAceito(x.target.checked)} />
          <span>
            <span className="flex items-center gap-1.5 font-semibold">
              <ShieldCheck className="size-4 text-brand" /> {jaAceitou ? "Aceite confirmado" : "Estou de acordo"}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted">
              A {e.nome} é responsável pelas mensagens que envia e por quem recebe. Quem pedir para não receber mais sai da lista na hora e não é chamado de novo.
              As mensagens seguem as regras do WhatsApp.
            </span>
          </span>
        </label>

        {cfg.numero?.teste && <p className="text-xs font-semibold text-amber-700">O número está em modo teste: só a lista de teste da Meta recebe.</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onFechar}>
            Agora não
          </Button>
          <Button onClick={() => void ligar()} loading={indo} disabled={!aceito} icon={<CirclePlay className="size-4" />}>
            Ligar o Radar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
