import { describe, expect, it } from "vitest";

import { mudancasParaDisparo, linhasDaFila, mensagemDoErro, progressoDoDisparo } from "@/lib/disparo-regras";
import { buildHeaderMap } from "@/lib/sheet-mapping";
import {
  analisarTemplate,
  comoChamar,
  dadosDoContato,
  ehBotaoDeSaida,
  montarComponentes,
  preencher,
  templateAutomatico,
  type TemplateMeta,
} from "@/lib/templates-regras";

/** Modelos do WhatsApp para o disparo: o Radar só oferece o que o Fluxo 1 sabe preencher. */

const LAVAJATO: TemplateMeta = {
  name: "carol_prospeccao_lavajato",
  status: "APPROVED",
  category: "MARKETING",
  language: "pt_BR",
  components: [
    { type: "HEADER", format: "TEXT", text: "Lavacar • Parceria" },
    { type: "BODY", text: "Oi, {{1}}! Lava-jatos {{2}}..." },
    { type: "FOOTER", text: "Lavacar" },
    { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Sim, atendo" }, { type: "QUICK_REPLY", text: "Não tenho interesse" }] },
  ],
};

describe("modelos do WhatsApp", () => {
  it("automático segue a mesma regra do Fluxo 1 (autônomo ou lava-jato)", () => {
    expect(templateAutomatico("Autônomo")).toBe("carol_prospeccao_autonomo");
    expect(templateAutomatico("individual")).toBe("carol_prospeccao_autonomo");
    expect(templateAutomatico("Empresa")).toBe("carol_prospeccao_lavajato");
    expect(templateAutomatico("")).toBe("carol_prospeccao_lavajato");
  });

  it("preenche nome e cidade como o Fluxo 1", () => {
    const d = dadosDoContato("Lava Jato do Bahia", "Contagem");
    expect(d).toEqual({ primeiroNome: "pessoal do Lava Jato do Bahia", cidadeTexto: "em Contagem" });
    expect(dadosDoContato("", "")).toEqual({ primeiroNome: "pessoal", cidadeTexto: "na sua região" });
    expect(preencher("Oi, {{1}}! {{ cidade }}", d)).toBe("Oi, pessoal do Lava Jato do Bahia! em Contagem");
  });

  it("chama gente pelo nome e estabelecimento pelo 'pessoal do/da'", () => {
    expect(comoChamar("Marcos Lavagem a Domicílio")).toBe("Marcos");
    expect(comoChamar("Estética Automotiva Savassi")).toBe("pessoal da Estética Automotiva Savassi");
    expect(comoChamar("Lava-Jato Estrela Guia (Barreiro)")).toBe("pessoal do Lava-Jato Estrela Guia");
    expect(comoChamar("LAVA RÁPIDO CENTRAL - BH")).toBe("pessoal do LAVA RÁPIDO CENTRAL");
    expect(comoChamar("Ana-Paula Lavagens")).toBe("Ana-Paula");
  });

  it("mostra a prévia e deixa usar um modelo aprovado com {{1}} e {{2}}", () => {
    const m = analisarTemplate(LAVAJATO);
    expect(m.utilizavel).toBe(true);
    expect(m.botoes).toEqual(["Sim, atendo", "Não tenho interesse"]);
    expect(m.previa).toContain("Oi, João! Lava-jatos em Belo Horizonte");
  });

  it("explica por que um modelo não pode ser usado", () => {
    const base = { name: "x", status: "APPROVED", category: "MARKETING", language: "pt_BR" };
    const motivo = (t: Partial<TemplateMeta>) => analisarTemplate({ ...base, ...t } as TemplateMeta).motivo;
    expect(motivo({ status: "PENDING", components: [{ type: "BODY", text: "oi" }] })).toMatch(/aprovado/);
    expect(motivo({ category: "AUTHENTICATION", components: [{ type: "BODY", text: "{{1}}" }] })).toMatch(/verificação/);
    expect(motivo({ components: [{ type: "HEADER", format: "IMAGE" }, { type: "BODY", text: "oi" }] })).toMatch(/imagem/);
    expect(motivo({ components: [{ type: "BODY", text: "Oi {{1}}, seu cupom {{3}}" }] })).toMatch(/\{\{3\}\}/);
    expect(motivo({ components: [{ type: "BODY", text: "oi" }, { type: "BUTTONS", buttons: [{ type: "URL", text: "Ver", url: "https://x/{{1}}" }] }] })).toMatch(
      /link com variável/,
    );
    expect(motivo({ components: [{ type: "BODY", text: "oi" }, { type: "BUTTONS", buttons: [{ type: "COPY_CODE", text: "Copiar" }] }] })).toMatch(/botão/);
  });

  it("monta o envio: parâmetros na ordem e botões com os payloads que o Fluxo 2 entende", () => {
    const comp = montarComponentes(LAVAJATO, dadosDoContato("Ana Paula", "BH"));
    expect(comp).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "em BH" }] },
      { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "SIM_ATENDE" }] },
      { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: "OPTOUT_PROSPECCAO" }] },
    ]);
  });

  it("modelo com variáveis nomeadas manda parameter_name", () => {
    const t: TemplateMeta = {
      name: "carol_nomeado",
      parameter_format: "NAMED",
      components: [
        { type: "HEADER", format: "TEXT", text: "Oi {{nome}}" },
        { type: "BODY", text: "Lava-jatos {{cidade}}" },
        { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: "Quero saber" }, { type: "QUICK_REPLY", text: "Talvez depois" }, { type: "QUICK_REPLY", text: "Parar de receber" }] },
      ],
    };
    const comp = montarComponentes(t, dadosDoContato("Bia", ""));
    expect(comp[0]).toEqual({ type: "header", parameters: [{ type: "text", text: "Bia", parameter_name: "nome" }] });
    expect(comp[1]).toEqual({ type: "body", parameters: [{ type: "text", text: "na sua região", parameter_name: "cidade" }] });
    expect(comp.slice(2).map((c) => (c.parameters as { payload: string }[])[0].payload)).toEqual(["SIM_ATENDE", "RESPOSTA_2", "OPTOUT_PROSPECCAO"]);
  });

  it("reconhece botão de saída", () => {
    expect(ehBotaoDeSaida("Não tenho interesse")).toBe(true);
    expect(ehBotaoDeSaida("Nao tenho interesse")).toBe(true);
    expect(ehBotaoDeSaida("Sair da lista")).toBe(true);
    expect(ehBotaoDeSaida("Quero saber")).toBe(false);
  });
});

describe("disparo com modelo escolhido", () => {
  const CAB = ["telefone", "nome", "tipo", "cidade", "status", "mensagem_enviada_em", "optout", "template"];
  const linhas = linhasDaFila(
    [
      ["5531911110001", "A", "Empresa", "BH", "pendente", "", "", "carol_prospeccao_lavajato"],
      ["5531911110002", "B", "Autônomo", "BH", "aguardando", "", "", ""],
      ["5531911110003", "C", "Empresa", "BH", "pendente", "", "", "carol_novo"],
    ],
    buildHeaderMap(CAB),
  );

  it("grava o modelo de cada escolhido e não mexe em quem já está certo", () => {
    const escolhidos = new Set(["5531911110001", "5531911110002", "5531911110003"]);
    const auto = mudancasParaDisparo(linhas, escolhidos, "aguardando", (l) => templateAutomatico(l.tipo));
    expect(auto).toEqual([
      { linha: 3, key: "5531911110002", status: "pendente", de: "aguardando", template: "carol_prospeccao_autonomo" },
      { linha: 4, key: "5531911110003", status: "pendente", de: "pendente", template: "carol_prospeccao_lavajato" },
    ]);
    const novo = mudancasParaDisparo(linhas, escolhidos, "aguardando", () => "carol_novo");
    expect(novo.map((m) => [m.linha, m.template])).toEqual([
      [2, "carol_novo"],
      [3, "carol_novo"],
    ]);
  });

  it("erro avisado pelo n8n para o disparo na hora, com explicação simples", () => {
    const inicio = Date.parse("2026-10-10T12:00:00Z");
    const agora = inicio + 30_000;
    const p = progressoDoDisparo(["5531911110001"], inicio, linhas, agora, {
      erro: { em: inicio + 10_000, codigo: 132000, detalhe: "Number of parameters does not match" },
    });
    expect(p.estado).toBe("parado");
    expect(p.erro?.mensagem).toMatch(/variáveis/);
    expect(p.podeContinuarEm).toBe(0); // o n8n já encerrou: não precisa esperar
    // Um erro de antes do disparo não conta.
    const antigo = progressoDoDisparo(["5531911110001"], inicio, linhas, agora, { erro: { em: inicio - 60_000, codigo: 132000, detalhe: "" } });
    expect(antigo.estado).toBe("enviando");
    expect(antigo.erro).toBeNull();
  });

  it("explica erros desconhecidos sem esconder o código", () => {
    expect(mensagemDoErro(999999, "Something odd")).toBe("O WhatsApp recusou o envio (erro 999999): Something odd");
    expect(mensagemDoErro(null)).toBe("O WhatsApp recusou o envio.");
  });
});
