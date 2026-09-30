import { describe, expect, it } from "vitest";

import { acharColuna, ehDaCarol, lerQuando, lerResposta, montarPainel } from "@/lib/painel-regras";

/** Painel da Carol: junta a aba leads com o histórico de conversa e o status do Meta. */

const AGORA = Date.parse("2026-09-30T01:00:00Z"); // 29/09 22:00 em Brasília

const LEADS = [
  ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout"],
  ["5531900000001", "Lava A", "Empresa", "BH", "enviado", "29/09/2026, 21:00:00", ""],
  ["5531900000002", "Lava B", "Autônomo", "BH", "enviado", "29/09/2026, 21:01:00", ""],
  ["5531900000003", "Lava C", "Empresa", "BH", "enviado", "29/09/2026, 21:02:00", ""],
  ["5531900000004", "Lava D", "Empresa", "BH", "sem_whatsapp", "erro: número não existe no WhatsApp - 29/09/2026, 21:03:00", ""],
  ["5531900000005", "Lava E", "Empresa", "BH", "enviado", "01/09/2026, 10:00:00", ""], // antigo
  ["5531900000006", "Lava F", "Empresa", "BH", "pendente", "", ""], // ainda não recebeu
  ["5531900000007", "Lava G", "Empresa", "BH", "enviado", "29/09/2026, 21:04:00", "sim"],
];

const HIST = [
  ["telefone", "timestamp", "remetente", "mensagem", "remoteJid"],
  ["5531900000001", "2026-09-30T00:00:05Z", "carol", "Oi, aqui é a Carol", "5531900000001@s.whatsapp.net"],
  ["5531900000001", "2026-09-30T00:10:00Z", "lead", "Sim, atendo", "5531900000001@s.whatsapp.net"],
  ["", "2026-09-30T00:11:00Z", "lead", "Não tenho interesse", "5531900000002@s.whatsapp.net"], // só o remoteJid
  ["5531900000003", "2026-09-30T00:12:00Z", "lead", "quanto custa?", ""],
];

const META = [
  ["telefone", "wamid", "status", "timestamp"],
  ["5531900000001", "w1", "sent", ""],
  ["5531900000001", "w1", "read", ""],
  ["5531900000002", "w2", "delivered", ""],
  ["5531900000003", "w3", "read", ""],
];

describe("painel da Carol", () => {
  it("monta o funil de hoje: disparadas, entregues, lidas, responderam, sim e não", () => {
    const p = montarPainel({ leads: LEADS, historico: HIST, statusMeta: META, sessoes: [["telefone", "estado"], ["5531900000001", "FALANDO_COM_CAROL"]] }, "hoje", AGORA);
    expect(p.funil).toEqual({ disparadas: 5, entregues: 3, lidas: 2, responderam: 3, sim: 1, nao: 1, semWhatsapp: 1, optout: 1 });
    const a = p.contatos.find((c) => c.nome === "Lava A")!;
    expect(a).toMatchObject({ resposta: "sim", entrega: "lida", etapa: "FALANDO_COM_CAROL", mensagensDoContato: 1 });
    expect(a.ultima?.texto).toBe("Sim, atendo");
    expect(p.contatos.find((c) => c.nome === "Lava C")?.resposta).toBe("respondeu");
    expect(p.contatos.find((c) => c.nome === "Lava D")).toMatchObject({ semWhatsapp: true, entrega: "falhou" });
    expect(p.contatos[0].nome).toBe("Lava A"); // "Sim, atendo" aparece primeiro
    expect(p.contatos.some((c) => c.nome === "Lava F")).toBe(false); // pendente não conta
  });

  it("período 'tudo' inclui os antigos; sem aba de status do Meta, entregues/lidas ficam em branco", () => {
    const p = montarPainel({ leads: LEADS, historico: HIST }, "tudo", AGORA);
    expect(p.funil.disparadas).toBe(6);
    expect(p.funil.entregues).toBeNull();
    expect(p.funil.lidas).toBeNull();
    expect(p.fontes.statusMeta.aba).toBe(false);
  });

  it("aponta colunas que faltam para o painel ler", () => {
    const p = montarPainel({ leads: LEADS, historico: [["data", "texto"]] }, "hoje", AGORA);
    expect(p.fontes.historico.faltando).toEqual(["telefone", "remetente"]);
  });
});

describe("leitura flexível", () => {
  it("reconhece as respostas dos botões e respostas equivalentes", () => {
    expect(lerResposta("Sim, atendo")).toBe("sim");
    expect(lerResposta("sim")).toBe("sim");
    expect(lerResposta("Não tenho interesse")).toBe("nao");
    expect(lerResposta("nao, obrigado")).toBe("nao");
    expect(lerResposta("quanto custa?")).toBeNull();
  });

  it("sabe quem mandou a mensagem", () => {
    expect(ehDaCarol("carol")).toBe(true);
    expect(ehDaCarol("IA")).toBe(true);
    expect(ehDaCarol("lead")).toBe(false);
    expect(ehDaCarol("cliente")).toBe(false);
    expect(ehDaCarol("")).toBeNull();
  });

  it("acha colunas por vários nomes", () => {
    expect(acharColuna(["Remote JID", "Texto", "Data/Hora"], ["telefone", "remotejid"])).toBe(0);
    expect(acharColuna(["Remote JID", "Texto", "Data/Hora"], ["mensagem", "texto"])).toBe(1);
    expect(acharColuna(["Remote JID", "Texto", "Data/Hora"], ["timestamp", "data_hora"])).toBe(2);
  });

  it("lê datas em vários formatos", () => {
    const esperado = Date.parse("2026-09-30T00:13:05Z");
    expect(lerQuando("29/09/2026, 21:13:05")).toBe(esperado);
    expect(lerQuando("2026-09-30T00:13:05.000Z")).toBe(esperado);
    expect(lerQuando(esperado / 1000)).toBe(esperado);
    expect(lerQuando(String(esperado))).toBe(esperado);
  });
});
