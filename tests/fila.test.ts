import { describe, expect, it } from "vitest";

import { comoItemDaFila, tempoDeEspera, urgencia } from "@/lib/fila-regras";

describe("fila do atendente", () => {
  it("lê a linha do banco", () => {
    const i = comoItemDaFila({
      canal: "sofia", remote_jid: "5531988887777@s.whatsapp.net", telefone: "", nome: " Ana ", tipo_espera: "respondeu_depois",
      esperando_desde: new Date("2026-10-29T13:00:00Z"), minutos_total: "75", minutos_uteis: 62, ultima_msg: "e o estorno?",
      link_conversa: "https://chat.lavacar.app/app/accounts/1/conversations/502", lembretes: 1,
    });
    expect(i).toEqual({
      canal: "sofia", telefone: "5531988887777", nome: "Ana", tipo: "respondeu_depois", desde: "2026-10-29T13:00:00.000Z",
      minutosTotal: 75, minutosUteis: 62, ultimaMensagem: "e o estorno?", linkConversa: "https://chat.lavacar.app/app/accounts/1/conversations/502", lembretes: 1,
    });
  });
  it("só aceita link de conversa do Chatwoot do Lavacar", () => {
    const base = { canal: "carol", telefone: "5531988887777", minutos_total: 1, minutos_uteis: 1 };
    expect(comoItemDaFila({ ...base, link_conversa: "https://chat.lavacar.app/app/accounts/1/inbox/6" })?.linkConversa).toBeNull();
    expect(comoItemDaFila({ ...base, link_conversa: "javascript:alert(1)" })?.linkConversa).toBeNull();
    expect(comoItemDaFila({ ...base, tipo_espera: "qualquer" })?.tipo).toBe("pedido");
  });
  it("descarta canal desconhecido ou número curto", () => {
    expect(comoItemDaFila({ canal: "outro", telefone: "5531988887777" })).toBeNull();
    expect(comoItemDaFila({ canal: "carol", telefone: "123" })).toBeNull();
  });
  it("tempo de espera", () => {
    expect(tempoDeEspera(0)).toBe("0 min");
    expect(tempoDeEspera(17)).toBe("17 min");
    expect(tempoDeEspera(60)).toBe("1h");
    expect(tempoDeEspera(75)).toBe("1h15");
    expect(tempoDeEspera(1500)).toBe("1 dia e 1h");
    expect(tempoDeEspera(2880)).toBe("2 dias");
  });
  it("urgência pelos minutos no horário da equipe", () => {
    expect(urgencia(14)).toBe("ok");
    expect(urgencia(15)).toBe("atencao");
    expect(urgencia(59)).toBe("atencao");
    expect(urgencia(60)).toBe("atrasado");
  });
});
