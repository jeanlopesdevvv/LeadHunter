import { describe, expect, it } from "vitest";

import {
  RASCUNHO_VAZIO,
  contaDaCaixa,
  ehDaAssistente,
  motivoDaRecusa,
  motivoSemEnvio,
  nomeTecnico,
  payloadMeta,
  statusDoModelo,
  validarRascunho,
  type RascunhoModelo,
} from "@/lib/modelos-regras";

/** Aba "Modelos": o formulário só manda para a Meta o que ela aceita e o que o n8n sabe preencher depois. */

const base = (x: Partial<RascunhoModelo> = {}): RascunhoModelo => ({
  ...RASCUNHO_VAZIO,
  conta: "carol",
  nome: "retomada 12 meses",
  corpo: "Oi, {{1}}! Aqui é a Carol, do Lavacar. Podemos retomar de onde paramos?",
  botoes: [{ tipo: "resposta", texto: "Quero saber" }, { tipo: "resposta", texto: "Não tenho interesse" }],
  ...x,
});

describe("nome técnico", () => {
  it("minúsculas, sem acento, com o prefixo da conta", () => {
    expect(nomeTecnico("Retomada 12 Meses!", "carol")).toBe("carol_retomada_12_meses");
    expect(nomeTecnico("Lembrete de agendamento", "sofia")).toBe("sofia_lembrete_de_agendamento");
    expect(nomeTecnico("carol_prospeccao nova", "carol")).toBe("carol_prospeccao_nova");
    expect(nomeTecnico("  ", "carol")).toBe("");
  });
});

describe("caixa do Chatwoot → conta", () => {
  it("2 = Carol, 6 = Sofia, outra = nenhuma", () => {
    expect(contaDaCaixa(2)).toBe("carol");
    expect(contaDaCaixa("6")).toBe("sofia");
    expect(contaDaCaixa(9)).toBeNull();
  });
});

describe("validação", () => {
  it("rascunho bom passa sem erro", () => {
    const v = validarRascunho(base());
    expect(v.erros).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("cidade ({{2}}) só em prospecção", () => {
    expect(validarRascunho(base({ corpo: "Oi, {{1}}! Lava-jatos {{2}} estão entrando no Lavacar agora." })).ok).toBe(false);
    expect(validarRascunho(base({ nome: "prospeccao nova cidade", corpo: "Oi, {{1}}! Lava-jatos {{2}} estão entrando no Lavacar agora." })).ok).toBe(true);
  });

  it("variáveis que o n8n não preenche são recusadas", () => {
    expect(validarRascunho(base({ corpo: "Oi, {{nome}}! Tudo bem por aí com o seu lava-jato?" })).erros[0]).toMatch(/não sabe preencher/);
    expect(validarRascunho(base({ corpo: "Oi, {{3}}! Tudo bem por aí com o seu lava-jato?" })).ok).toBe(false);
  });

  it("regras da Meta: começo/fim com variável, variáveis coladas, limites", () => {
    expect(validarRascunho(base({ corpo: "{{1}}, tudo bem? Aqui é a Carol do Lavacar." })).ok).toBe(false);
    expect(validarRascunho(base({ corpo: "Aqui é a Carol do Lavacar, tudo bem {{1}}" })).ok).toBe(false);
    expect(validarRascunho(base({ nome: "prospeccao x", corpo: "Oi {{1}}{{2}} tudo bem com o seu lava-jato hoje?" })).ok).toBe(false);
    expect(validarRascunho(base({ corpo: "x".repeat(1025) })).ok).toBe(false);
    expect(validarRascunho(base({ cabecalho: "Título com emoji 🚗" })).ok).toBe(false);
    expect(validarRascunho(base({ cabecalho: "*Negrito*" })).ok).toBe(false);
    expect(validarRascunho(base({ rodape: "Rodapé {{1}}" })).ok).toBe(false);
  });

  it("exemplo obrigatório quando há variável", () => {
    expect(validarRascunho(base({ exemploNome: " " })).ok).toBe(false);
    expect(validarRascunho(base({ corpo: "Aqui é a Carol, do Lavacar. Podemos retomar de onde paramos?", exemploNome: "" })).ok).toBe(true);
  });

  it("botões: texto, limite, link https, sem intercalar tipos", () => {
    expect(validarRascunho(base({ botoes: [{ tipo: "resposta", texto: "" }] })).ok).toBe(false);
    expect(validarRascunho(base({ botoes: [{ tipo: "resposta", texto: "x".repeat(26) }] })).ok).toBe(false);
    expect(validarRascunho(base({ botoes: [{ tipo: "link", texto: "Ver planos", url: "http://x.com" }] })).ok).toBe(false);
    expect(validarRascunho(base({ botoes: [{ tipo: "link", texto: "Ver planos", url: "https://meu.lavacar.app/planos" }] })).ok).toBe(true);
    expect(
      validarRascunho(
        base({
          botoes: [
            { tipo: "resposta", texto: "A" },
            { tipo: "link", texto: "B", url: "https://lavacar.app" },
            { tipo: "resposta", texto: "C" },
          ],
        }),
      ).ok,
    ).toBe(false);
    expect(validarRascunho(base({ botoes: [1, 2, 3, 4].map((i) => ({ tipo: "resposta" as const, texto: `B${i}` })) })).ok).toBe(false);
    expect(validarRascunho(base({ botoes: [{ tipo: "resposta", texto: "Sim" }, { tipo: "resposta", texto: "sim" }] })).ok).toBe(false);
  });

  it("avisos: promoção em utilidade; marketing sem botão de saída", () => {
    expect(validarRascunho(base({ categoria: "UTILITY", corpo: "Oi, {{1}}! Ative agora e ganhe 12 meses grátis no Lavacar." })).avisos.join(" ")).toMatch(/promoção/);
    expect(validarRascunho(base({ botoes: [{ tipo: "resposta", texto: "Quero saber" }] })).avisos.join(" ")).toMatch(/Não tenho interesse/);
  });
});

describe("payload para a Meta", () => {
  it("monta componentes com exemplos, botões e o nome técnico", () => {
    const p = payloadMeta(
      base({
        nome: "prospeccao nova",
        cabecalho: "Lavacar • Parceria",
        corpo: "Oi, {{1}}! Lava-jatos {{2}} estão entrando no Lavacar.",
        rodape: "Lavacar",
        exemploCidade: "em Contagem",
        botoes: [{ tipo: "resposta", texto: "Quero saber" }, { tipo: "link", texto: "Ver planos", url: "https://meu.lavacar.app/planos" }],
      }),
    );
    expect(p.name).toBe("carol_prospeccao_nova");
    expect(p.language).toBe("pt_BR");
    expect(p.category).toBe("MARKETING");
    expect(p.components).toEqual([
      { type: "HEADER", format: "TEXT", text: "Lavacar • Parceria" },
      { type: "BODY", text: "Oi, {{1}}! Lava-jatos {{2}} estão entrando no Lavacar.", example: { body_text: [["João", "em Contagem"]] } },
      { type: "FOOTER", text: "Lavacar" },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Quero saber" }, { type: "URL", text: "Ver planos", url: "https://meu.lavacar.app/planos" }] },
    ]);
  });

  it("sem variável: sem exemplo; sem cabeçalho/rodapé/botões: só o corpo", () => {
    const p = payloadMeta(base({ corpo: "Aqui é a Carol, do Lavacar. Podemos retomar?", botoes: [] }));
    expect(p.components).toEqual([{ type: "BODY", text: "Aqui é a Carol, do Lavacar. Podemos retomar?" }]);
  });
});

describe("textos da tela", () => {
  it("status e motivo da recusa em português", () => {
    expect(statusDoModelo("APPROVED").rotulo).toBe("Aprovado");
    expect(statusDoModelo("PENDING").rotulo).toBe("Em análise");
    expect(statusDoModelo("REJECTED").tom).toBe("red");
    expect(motivoDaRecusa("INCORRECT_CATEGORY")).toMatch(/categoria/);
    expect(motivoDaRecusa("ALGO_NOVO")).toBe("algo novo");
    expect(motivoDaRecusa(undefined)).toBe("");
  });

});

describe("da assistente x da automação", () => {
  it("avisos internos e templates da outra assistente nunca são da assistente", () => {
    expect(ehDaAssistente("sofia_retomada_contato", "sofia")).toBe(true);
    expect(ehDaAssistente("alerta_chargeback_v1", "sofia")).toBe(false);
    expect(ehDaAssistente("alerta_retencao_carol", "sofia")).toBe(false);
    expect(ehDaAssistente("dono_novo_agendamento", "sofia")).toBe(false);
    expect(ehDaAssistente("carol_abertura_handoff", "sofia")).toBe(false);
    expect(ehDaAssistente("carol_prospeccao_lavajato", "carol")).toBe(true);
  });

  it("motivo para não aparecer no Enviar Template", () => {
    const t = (nome: string, corpo: string, status = "APPROVED") => ({ nome, status, cabecalho: "", corpo });
    expect(motivoSemEnvio(t("sofia_retomada_contato", "Oi, {{1}}! Podemos retomar?"), "sofia")).toBe("");
    expect(motivoSemEnvio(t("alerta_falha_automacao", "Fluxo: {{1}} O que aconteceu: {{2}}"), "sofia")).toMatch(/automação/);
    expect(motivoSemEnvio(t("sofia_novo", "Oi, {{1}}!", "PENDING"), "sofia")).toMatch(/aprovado/);
    expect(motivoSemEnvio(t("carol_abertura_x", "Oi {{1}}, a {{2}} te passou: {{3}}"), "carol")).toMatch(/\{\{2\}\}, \{\{3\}\}/);
    expect(motivoSemEnvio(t("carol_prospeccao_x", "Oi, {{1}}! Lava-jatos {{2}} estão entrando."), "carol")).toBe("");
  });
});
