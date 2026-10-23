# Aba "Modelos" no Chatwoot

É uma página do Radar em `/chatwoot/modelos`. No Chatwoot, ela aparece como **Dashboard App**: uma aba ao lado da conversa, junto com "📤 Enviar Template" e "Agendamentos".

## O que faz

- **Criar templates** do WhatsApp da **Carol** e da **Sofia** e mandar para a aprovação da Meta. O formulário confere as regras antes de enviar:
  - variáveis: `{{1}}` = nome do contato; `{{2}}` = cidade, só em `carol_prospeccao_*`;
  - limites de tamanho;
  - título sem emoji;
  - botões.
  - Também avisa sobre a categoria (promoção marcada como "utilidade") e sobre a falta de botão de saída.
- **Acompanhar a aprovação.** Mostra quantos templates estão aprovados, em análise e recusados (clicar no número filtra a lista) e o motivo de cada recusa. Um template recusado tem o atalho "Corrigir e criar de novo".
- **Os da automação ficam separados.** Avisos para a equipe (`alerta_*`, `dono_*`), lembretes e templates de repasse ficam numa seção fechada, sem nada para enviar.
- **Não envia nada ao cliente.** O envio é na aba **📤 Enviar Template** (n8n), que já existia e mostra a janela de 24h e quem continua a conversa. Cada template aprovado diz se aparece lá; se não aparecer, diz o motivo.

Ao abrir, a aba vai para a conta da caixa da conversa (caixa 2 = Carol, caixa 6 = Sofia). A prévia usa o nome do contato.

## Visual

O visual é o mesmo das outras abas: superfícies e fonte do Chatwoot, ciano do Lavacar, avatares da Carol e da Sofia, e tema claro ou escuro conforme o sistema. Fica em `src/app/chatwoot/chatwoot.css`, com classes `cw-*`.

## Configuração

### Radar (EasyPanel)

- `META_TOKEN` (ou `META_WHATSAPP_TOKEN`): o mesmo token do n8n, com `whatsapp_business_management` nas duas contas.
- `META_WABA_ID`: conta da Carol. O padrão é `940955865200631`.
- `META_WABA_ID_SOFIA`: conta da Sofia. O padrão é `1352869003322561`.

### Chatwoot

Em Configurações → Integrações → Dashboard apps:

- nome: **Modelos**;
- URL: `https://radar.lavacar.app/chatwoot/modelos`.

## Segurança

- A página exige a sessão do Radar. Sem sessão, mostra o login dentro da própria aba.
- Só `/chatwoot/*` e `/login` podem ser abertos dentro de outra página, e só pelo `https://chat.lavacar.app` (`frame-ancestors`). O resto do Radar segue com `X-Frame-Options: DENY`.
- O contexto da conversa só é aceito por `postMessage` vindo de `https://chat.lavacar.app`.
