import { describe, expect, it } from "vitest";

import { comoPainelAutomatico, descreverMudanca, estadoDoDisparo, hojeEmBrasilia, taxa } from "@/lib/automatico-regras";

const doBanco = {
  agora: "2026-11-17T13:00:00Z",
  dias: 14,
  config: {
    disparo: { ligado: true, inicio: "2026-11-16", rotacao: ["carol_prospeccao_lavajato", "carol_prospeccao_beneficio"], vizinho: "carol_prospeccao_vizinho", ordem_cidades: ["Contagem"] },
    segundo_contato: { ligado: false, dias: 30, peso: 0.3, modelo: null },
    busca: { ligado: true, termos: ["lava jato"], cidades: ["Contagem", "Betim"], fila_dias: 3, max_consultas_dia: 40, reserva_cota: 150 },
    limite: 100,
  },
  situacao: { limite: 100, limite_configurado: 100, enviados_hoje: 37, freio: "normal", motivo: "", rotina_liberada: true, freios: [], saidas_hoje: 1, barradas_hoje: 0 },
  envios: {
    dias: [{ dia: "2026-11-16", enviados: 100, segundos: 0, responderam: 31, saidas: 4, erros: 9 }],
    modelos: [{ modelo: "carol_prospeccao_lavajato", segundo: false, enviados: 50, responderam: 17, saidas: 2, link: 3, conta: 1, erros: 4 }],
    periodo: { enviados: 137, responderam: 40, saidas: 5, link: 6, conta: 1, erros: 12, sem_whatsapp: 10, barradas: 2 },
    hoje: { enviados: 37, segundos: 0, responderam: 9, saidas: 1, erros: 3, rotina: 37, radar: 0 },
  },
  fila: { novos: 245, segundos_na_fila: 0, segundo_prontos: 0, segundo_7dias: 12, segundo_proximo: "2026-11-22", por_cidade: [{ cidade: "Contagem", n: 80 }], dias_de_fila: 2.5, pendentes_fora: { removidos: 47, sem_whatsapp: 2, optout: 20 } },
  busca: { ultimas: [{ inicio: "2026-11-17T11:41:00Z", fim: "2026-11-17T11:43:00Z", origem: "rotina", precisava: 55, consultas: 9, vistos: 160, novos: 58, adicionados: 57, motivo_fim: "alvo", cidades: { Contagem: { consultas: 9, novos: 58, adicionados: 57 } } }], consultas_mes: 9, adicionados_mes: 57, cidades_feitas: ["Contagem"] },
  freios_log: [],
  mudancas: [
    { chave: "disparo_automatico", antes: { ligado: true }, depois: { ligado: false }, por: "Radar (pausar)", em: "2026-11-17T12:00:00Z" },
    { chave: "carol_limite_diario", antes: { valor: 80 }, depois: { valor: 100 }, por: "Jean", em: "2026-11-07T12:00:00Z" },
    { chave: "disparo_automatico", antes: { ligado: true, rotacao: [] }, depois: { ligado: true, rotacao: ["a"] }, por: "Jean", em: "2026-11-07T11:00:00Z" },
  ],
};

describe("painel do disparo automático", () => {
  it("lê o jsonb do banco", () => {
    const p = comoPainelAutomatico(doBanco);
    expect(p.disponivel).toBe(true);
    expect(p.disparo.ligado).toBe(true);
    expect(p.disparo.inicio).toBe("2026-11-16");
    expect(p.segundoContato).toEqual({ ligado: false, dias: 30, peso: 0.3, modelo: null });
    expect(p.situacao.enviadosHoje).toBe(37);
    expect(p.periodo.semWhatsapp).toBe(10);
    expect(p.fila.diasDeFila).toBe(2.5);
    expect(p.fila.segundoProximo).toBe("2026-11-22");
    expect(p.busca.ultimas[0].cidades).toEqual([{ cidade: "Contagem", consultas: 9, novos: 58, adicionados: 57 }]);
    expect(p.mudancas.map((m) => m.texto)).toEqual(["Disparo automático: pausado", "Limite do dia: 80 → 100", "Disparo automático: configuração alterada"]);
  });

  it("aguenta texto, vazio e lixo", () => {
    expect(comoPainelAutomatico(JSON.stringify(doBanco)).fila.novos).toBe(245);
    const v = comoPainelAutomatico(null);
    expect(v.disponivel).toBe(false);
    expect(v.porDia).toEqual([]);
    expect(comoPainelAutomatico("{x").disponivel).toBe(false);
  });

  it("mudanças", () => {
    expect(descreverMudanca("busca_auto", { ligado: false }, { ligado: true })).toBe("Busca automática de leads: continuado");
    expect(descreverMudanca("disparo_segundo_contato", null, { ligado: false })).toBe("2º contato: criado");
    expect(descreverMudanca("carol_limite_diario", { valor: 100 }, { valor: 100 })).toBe("");
  });

  it("situação do topo da tela", () => {
    const p = comoPainelAutomatico(doBanco);
    // terça, 17/11/2026, 10h em Brasília
    expect(estadoDoDisparo(p, new Date("2026-11-17T13:00:00Z")).estado).toBe("ligado");
    expect(estadoDoDisparo(p, new Date("2026-11-14T13:00:00Z")).titulo).toBe("Começa em 16/11");
    expect(estadoDoDisparo(p, new Date("2026-11-21T13:00:00Z")).estado).toBe("sem_rodada"); // sábado
    expect(estadoDoDisparo(p, new Date("2026-11-20T13:00:00Z")).estado).toBe("sem_rodada"); // feriado
    expect(estadoDoDisparo({ ...p, disparo: { ...p.disparo, ligado: false } }, new Date("2026-11-17T13:00:00Z")).estado).toBe("pausado");
    const freio = { ...p, situacao: { ...p.situacao, freio: "pausado", freios: [{ motivo: "saidas", nivel: "pausa", texto: "9 pediram para sair" }] } };
    expect(estadoDoDisparo(freio, new Date("2026-11-17T13:00:00Z"))).toMatchObject({ estado: "freio", detalhe: "9 pediram para sair" });
    expect(hojeEmBrasilia(new Date("2026-11-17T02:30:00Z")).dia).toBe("2026-11-16");
    expect(taxa(1, 3)).toBe(33.3);
    expect(taxa(1, 0)).toBeNull();
  });
});
