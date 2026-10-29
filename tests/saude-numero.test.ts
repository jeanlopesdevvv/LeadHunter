import { describe, expect, it } from "vitest";

import { limiteMetaTexto, motivoDaSaude, saudeDoBanco, saudeSimulada, situacaoVisivel } from "@/lib/disparo-regras";

// Formato devolvido por atendimento.carol_saude_atual() (23/10/2026).
const doBanco = {
  freio: "normal",
  limite_configurado: 30,
  limite_efetivo: 30,
  motivo: "",
  checado_em: "2026-10-23T17:36:32.957165+00:00",
  qualidade: "GREEN",
  qualidade_pt: "verde (alta)",
  situacao: "CONNECTED",
  pode_enviar: "LIMITED",
  nome_status: "DECLINED",
  nome: "Carol do Lavacar",
  limite_meta: null,
  situacao_pt: "conectado; envio limitado pela Meta; nome de exibição recusado",
  avisos: ["O nome de exibição ainda não foi aprovado; o limite de mensagens da Meta sobe depois da aprovação."],
  ultima_tentativa_em: "2026-10-23T17:36:32.957165+00:00",
  ultima_tentativa_ok: true,
  ultimo_erro: null,
  enviados_hoje: 10,
  sem_whatsapp_hoje: 0,
  optouts_7d: 0,
};

describe("saúde do número da Carol", () => {
  it("lê o jsonb do banco (objeto ou texto)", () => {
    const s = saudeDoBanco(doBanco);
    expect(s).not.toBeNull();
    expect(s!.freio).toBe("normal");
    expect(s!.limiteEfetivo).toBe(30);
    expect(s!.qualidade).toBe("GREEN");
    // 29/10: "envio limitado pela Meta" e "nome de exibição recusado" não aparecem mais no Radar
    expect(s!.situacaoTexto).toBe("conectado");
    expect(s!.avisos).toHaveLength(0);
    expect(s!.checadoEm).toBe("2026-10-23T17:36:32.957Z");
    expect(saudeDoBanco(JSON.stringify(doBanco))?.enviadosHoje).toBe(10);
  });

  it("recusa o que não é a resposta esperada", () => {
    for (const v of [null, undefined, "", "{", [], 5, { freio: "outro", limite_configurado: 30, limite_efetivo: 30 }, { freio: "normal" }]) {
      expect(saudeDoBanco(v)).toBeNull();
    }
    expect(saudeDoBanco({ ...doBanco, limite_efetivo: null })).toBeNull();
    expect(saudeDoBanco({ ...doBanco, qualidade: "ROXO" })?.qualidade).toBeNull();
  });

  it("a trava para tudo quando pausado e no limite reduzido quando amarela", () => {
    const pausado = saudeDoBanco({ ...doBanco, freio: "pausado", limite_efetivo: 0 });
    expect(motivoDaSaude(pausado, 0)).toMatch(/pausados pela saúde/);
    const metade = saudeDoBanco({ ...doBanco, freio: "metade", limite_efetivo: 15 });
    expect(motivoDaSaude(metade, 14)).toBe("");
    expect(motivoDaSaude(metade, 15)).toMatch(/15 de 15/);
    expect(motivoDaSaude(saudeDoBanco(doBanco), 100)).toBe("");
    expect(motivoDaSaude(saudeDoBanco({ ...doBanco, freio: "sem_leitura" }), 100)).toBe("");
    expect(motivoDaSaude(null, 100)).toBe("");
  });

  it("traduz o limite de conversas da Meta", () => {
    expect(limiteMetaTexto("TIER_250")).toBe("250 conversas novas por dia");
    expect(limiteMetaTexto("TIER_1K")).toBe("1.000 conversas novas por dia");
    expect(limiteMetaTexto("TIER_UNLIMITED")).toMatch(/sem limite/);
    expect(limiteMetaTexto(null)).toBeNull();
    expect(limiteMetaTexto("OUTRO")).toBeNull();
  });

  it("simulação cobre os quatro estados", () => {
    expect(saudeSimulada("amarela", 30, 0).limiteEfetivo).toBe(15);
    expect(saudeSimulada("vermelha", 30, 0).limiteEfetivo).toBe(0);
    expect(saudeSimulada("sem", 30, 0).freio).toBe("sem_leitura");
    expect(saudeSimulada(undefined, 30, 0).freio).toBe("normal");
  });
  it("esconde os avisos permanentes da conta e mantém o resto", () => {
    expect(situacaoVisivel("conectado; envio limitado pela Meta; nome de exibição recusado")).toBe("conectado");
    expect(situacaoVisivel("sinalizado; envio limitado pela Meta")).toBe("sinalizado");
    expect(situacaoVisivel("restrito; nome de exibição pendente; desconectado")).toBe("restrito; desconectado");
    expect(situacaoVisivel("")).toBe("");
    const s = saudeDoBanco({ ...doBanco, avisos: ["O nome de exibição ainda não foi aprovado.", "Número sinalizado pela Meta: revise as mensagens."] });
    expect(s!.avisos).toEqual(["Número sinalizado pela Meta: revise as mensagens."]);
  });
});
