/**
 * As mensagens da prospecção da Voob (12/11/2026, versão 2: pedido do Jean, "extremamente profissional").
 * Um lugar só: a prévia no Radar, o texto para criar o modelo na Meta e os testes leem daqui.
 * O texto que fica na fila do Voob CRM (radar._texto) é o mesmo, sem o negrito.
 *
 * Por que está escrita assim (o que mais pesa em mensagem fria no WhatsApp):
 * 1. Diz quem é e que é assistente virtual: honesto, evita o "era um robô?" depois, e a própria conversa vira a
 *    demonstração do que a Voob vende.
 * 2. Diz de onde veio o contato (Google) e cita o negócio pelo nome: não parece disparo em massa.
 * 3. "Não achei um site" em vez de "vocês não têm site": é o que o Radar de fato viu, e não ofende quem tem.
 * 4. Uma dor concreta em uma frase, sem promessa de resultado e sem preço.
 * 5. Pergunta de sim ou não, com custo baixo ("1 minuto"), e saída em um toque ("Não tenho interesse"):
 *    quem não quer toca no botão em vez de bloquear, e é o bloqueio que derruba a qualidade do número.
 * 6. Um emoji só, no cumprimento. Sem link, sem caixa alta, sem exclamação em série (a Meta e as pessoas leem como spam).
 *
 * Regras da Meta que o texto respeita: não começa nem termina com campo, campos com texto em volta, até 1.024 letras,
 * botões de até 25 letras. Negrito com *asteriscos* funciona no corpo do modelo.
 */

export type TipoMensagem = "abertura" | "site" | "retomada";

/** Os campos do modelo, como se escreve no criador de modelos do Voob CRM ({campo}) e como o motor preenche. */
export const CAMPO_NEGOCIO = "{nome do negócio}";
export const CAMPO_PROBLEMA = "{problema do site}";

export const EXEMPLO_NEGOCIO = "Clínica Bem Estar";
export const EXEMPLO_PROBLEMA = "o site não se adapta à tela do celular";

const CUMPRIMENTO = (agente: string) => `Olá! 👋 Aqui é a ${agente}, assistente virtual da Voob.`;

/** Parágrafos de cada mensagem. `negocio` e `problema` entram como vieram (o campo do modelo ou o valor de exemplo). */
export function paragrafos(tipo: TipoMensagem, agente: string, negocio: string, problema = EXEMPLO_PROBLEMA): string[] {
  if (tipo === "retomada") {
    return [
      `Olá! Aqui é a ${agente}, da Voob, passando só mais esta vez.`,
      `Posso te mostrar como *${negocio}* poderia receber mais contatos pelo Google e pelo WhatsApp, com site profissional e atendimento com IA? Leva 1 minuto, por aqui mesmo.`,
      "Se não fizer sentido agora, é só tocar em “Não tenho interesse” e eu não escrevo mais.",
    ];
  }
  if (tipo === "site") {
    return [
      CUMPRIMENTO(agente),
      `Encontrei *${negocio}* no Google, visitei o site de vocês e notei o seguinte: ${problema}. Isso costuma custar contatos todos os dias.`,
      "A Voob refaz o site e liga ele a um atendimento com IA, como este, que responde seus clientes no WhatsApp na hora, inclusive à noite e nos fins de semana.",
      "Posso te mostrar, em 1 minuto, o que eu mudaria?",
    ];
  }
  return [
    CUMPRIMENTO(agente),
    `Encontrei *${negocio}* no Google, mas não achei um site de vocês.`,
    "Hoje, quem procura um serviço pesquisa no Google, chama no WhatsApp e fecha com quem responde primeiro. A Voob entrega isso pronto: site profissional, seus contatos organizados e um atendimento com IA, como este, que responde seus clientes na hora, inclusive à noite e nos fins de semana.",
    "Posso te mostrar, em 1 minuto, como ficaria para vocês?",
  ];
}

/** A mensagem como a pessoa lê (com o nome do negócio no lugar do campo). */
export function textoDaMensagem(tipo: TipoMensagem, agente: string, negocio = EXEMPLO_NEGOCIO, problema = EXEMPLO_PROBLEMA): string {
  return paragrafos(tipo, agente, negocio, problema).join("\n\n");
}

/** O texto para colar em Modelos › Novo modelo no Voob CRM (com os campos entre chaves). */
export function textoParaOModelo(tipo: TipoMensagem, agente: string): string {
  return paragrafos(tipo, agente, CAMPO_NEGOCIO, CAMPO_PROBLEMA).join("\n\n");
}

/** O nome do modelo no Voob CRM: o nome técnico na Meta sai dele e precisa começar pelo prefixo que o Radar procura. */
export const NOME_DO_MODELO: Record<TipoMensagem, string> = {
  abertura: "Radar Voob abertura",
  site: "Radar Voob site",
  retomada: "Radar Voob retomada",
};

export const ROTULO_MENSAGEM: Record<TipoMensagem, string> = {
  abertura: "1ª mensagem (sem site)",
  site: "1ª mensagem (site desatualizado)",
  retomada: "Retomada",
};

/** Emojis no texto (a Meta recusa modelo com mais de 10; aqui a regra da casa é no máximo 1). */
export function emojis(texto: string): number {
  return (texto.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}
