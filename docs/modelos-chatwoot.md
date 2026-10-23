# Aba "Modelos" no Chatwoot

Página do Radar em `/chatwoot/modelos`, aberta como **Dashboard App** do Chatwoot (uma aba ao lado da conversa).

## O que faz

- Lista os modelos (templates) do WhatsApp da **Carol** e da **Sofia**, com o status da Meta (aprovado, em análise, recusado com o motivo).
- Cria um modelo novo e manda para a aprovação da Meta. O formulário confere as regras antes de enviar:
  - variáveis: `{{1}}` = nome do contato; `{{2}}` = cidade, só em modelos `carol_prospeccao_*`;
  - limites de tamanho;
  - título sem emoji;
  - botões.
- Envia um modelo aprovado ao contato da conversa aberta. Para isso, escreve `#template nome` (ou `#template nome ia`) numa nota privada. Quem envia é o n8n (Fluxos 4 e S4), que responde na conversa com ✅ ou ❌.
  - Sem `CHATWOOT_TOKEN` no Radar, a aba só oferece **Copiar comando**.

A conta é escolhida pela caixa da conversa: caixa 2 = Carol, caixa 6 = Sofia. Também dá para trocar no seletor.

## Configuração

### Radar (EasyPanel)

- `META_TOKEN` (ou `META_WHATSAPP_TOKEN`):
  - é o mesmo token do n8n;
  - precisa ter `whatsapp_business_management` nas duas contas.
- `META_WABA_ID`: conta da Carol. O padrão é `940955865200631`.
- `META_WABA_ID_SOFIA`: conta da Sofia. O padrão é `1352869003322561`.
- `CHATWOOT_TOKEN` (opcional): token de um agente, para o botão "Enviar para este contato".

### Chatwoot

Em Configurações → Integrações → Dashboard apps → Configurar:

- nome: **Modelos**;
- URL: `https://radar.lavacar.app/chatwoot/modelos`.

## Segurança

- A página exige a sessão do Radar. Sem sessão, mostra o login dentro da própria aba.
- Só `/chatwoot/*` e `/login` podem ser abertos dentro de outra página, e só pelo `https://chat.lavacar.app` (`frame-ancestors`). O resto do Radar segue com `X-Frame-Options: DENY`.
- O contexto da conversa só é aceito por `postMessage` vindo de `https://chat.lavacar.app`.
- O servidor confere se a conversa é mesmo da caixa da conta antes de escrever a nota.
