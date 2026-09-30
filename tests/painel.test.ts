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

// O Fluxo 6 grava só as falhas do Meta (entregue/lida não vão para a planilha).
const META = [
  ["timestamp", "telefone", "wamid", "status", "erro_codigo", "erro_detalhe", "categoria_cobranca"],
  ["2026-09-30T00:05:00Z", "31900000008", "w8", "failed", "131049", "qualidade", ""],
];

const SESSOES = [
  ["remoteJid", "telefone", "nome", "estado", "ultimo_contato"],
  ["5531900000001@s.whatsapp.net", "31900000001", "Lava A", "FALANDO_COM_CAROL", ""],
  ["5531900000002@s.whatsapp.net", "31900000002", "Lava B", "LEAD_PERDIDO", ""],
  ["5531900000003@s.whatsapp.net", "31900000003", "Lava C", "FALANDO_COM_CAROL", ""],
  ["5531900000009@s.whatsapp.net", "31900000009", "Lava I", "AGUARDANDO_SUPORTE", ""],
  ["5531900000010@s.whatsapp.net", "31900000010", "Lava J", "CLIENTE_ATIVO", ""],
];

const LEADS_HOJE = [
  ...LEADS,
  ["5531900000008", "Lava H", "Empresa", "BH", "enviado", "29/09/2026, 21:04:30", ""], // o Meta não entregou
  ["5531900000009", "Lava I", "Empresa", "BH", "enviado", "29/09/2026, 21:05:00", ""], // pediu atendente
  ["5531900000010", "Lava J", "Empresa", "BH", "enviado", "29/09/2026, 21:06:00", ""], // já é cliente
  ["5531900000011", "Lava K", "Empresa", "BH", "enviado", "29/09/2026, 21:07:00", ""], // não respondeu
];

const HIST_HOJE = [...HIST, ["31900000009", "2026-09-30T00:20:00Z", "lead", "quero falar com uma pessoa", ""]];

describe("painel da Carol", () => {
  it("coloca cada contato numa situação usando só o que os fluxos gravam", () => {
    const p = montarPainel({ leads: LEADS_HOJE, historico: HIST_HOJE, statusMeta: META, sessoes: SESSOES }, "hoje", AGORA);
    const sit = Object.fromEntries(p.contatos.map((c) => [c.nome, c.situacao]));
    expect(sit).toEqual({
      "Lava A": "sim",
      "Lava B": "sem_interesse", // clicou em "Não tenho interesse"
      "Lava C": "conversando",
      "Lava D": "nao_recebeu", // sem WhatsApp na aba leads
      "Lava G": "sem_interesse", // optout na aba leads
      "Lava H": "nao_recebeu", // falha gravada pelo Fluxo 6
      "Lava I": "atendente",
      "Lava J": "cliente",
      "Lava K": "sem_resposta",
    });
    expect(p.resumo).toMatchObject({ disparadas: 9, receberam: 7, responderam: 5, sim: 1, semInteresse: 2, naoRecebeu: 2 });
    expect(p.resumo.porSituacao).toEqual({ atendente: 1, sim: 1, conversando: 1, cliente: 1, sem_resposta: 1, sem_interesse: 2, nao_recebeu: 2 });
    // quem precisa de atenção vem primeiro
    expect(p.contatos.slice(0, 3).map((c) => c.nome)).toEqual(["Lava I", "Lava A", "Lava C"]);
    const a = p.contatos.find((c) => c.nome === "Lava A")!;
    expect(a.ultima?.texto).toBe("Sim, atendo");
    expect(a.mensagensDoContato).toBe(1);
    expect(p.contatos.some((c) => c.nome === "Lava F")).toBe(false); // pendente não conta
  });

  it("quem respondeu recebeu, mesmo se houver uma falha antiga do Meta", () => {
    const meta = [...META, ["2026-09-30T00:00:10Z", "31900000001", "w1", "failed", "131047", "janela", ""]];
    const p = montarPainel({ leads: LEADS, historico: HIST, statusMeta: meta }, "hoje", AGORA);
    expect(p.contatos.find((c) => c.nome === "Lava A")?.situacao).toBe("sim");
  });

  it("período 'tudo' inclui os antigos e funciona sem as abas opcionais", () => {
    const p = montarPainel({ leads: LEADS, historico: HIST }, "tudo", AGORA);
    expect(p.resumo.disparadas).toBe(6);
    expect(p.fontes.statusMeta.aba).toBe(false);
    expect(p.contatos.find((c) => c.nome === "Lava E")?.situacao).toBe("sem_resposta");
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
