# Colocando o Radar no ar em radar.lavacar.app

O Radar (LeadHunter v3) roda no **servidor do Lavacar** (EasyPanel, o mesmo do n8n, Evolution e Chatwoot).

```
GitHub (push na main)
  └─ GitHub Actions: testes + imagem Docker → ghcr.io/jeanlopesdevvv/leadhunter:latest
        └─ EasyPanel do Lavacar baixa a imagem e roda (≈ 50 MB de RAM)
              └─ https://radar.lavacar.app  (DNS na Hostinger, HTTPS automático)
```

Por que a imagem é montada no GitHub e não no servidor: o VPS está com ~80% da memória em uso e
compilar o Next.js usa ~1,3 GB. Compilar lá poderia derrubar o n8n da Carol/Sofia ou o Chatwoot.
No servidor, o EasyPanel só baixa a imagem pronta.

Tempo estimado: 30 minutos, uma vez só.

---

## 1. GitHub (uma vez)

1. **Workflow**: o arquivo `.github/workflows/imagem-docker.yml` precisa estar no repositório
   (ele testa o código e publica a imagem). Se ainda não estiver, crie pelo link que o Claude enviou
   ou em *Add file → Create new file* com esse caminho, colando o conteúdo de `docs/imagem-docker.yml`.
2. Aba **Actions** do repositório: espere o "Testes e imagem Docker" ficar verde (2–4 min).
3. **Tornar a imagem pública** (para o EasyPanel baixar sem senha; o código já é público):
   <https://github.com/users/jeanlopesdevvv/packages/container/leadhunter/settings> →
   *Danger Zone → Change visibility → Public*. A imagem não contém nenhuma chave: tudo que é segredo
   fica só no EasyPanel.

## 2. Google Cloud — projeto **LAVACAR - SISTEMA**

O projeto já tem faturamento, Sheets API e Places API. Falta:

1. **Places API (New)**: *APIs e serviços → Biblioteca* → pesquise `Places API (New)`.
   Se aparecer **Ativar**, ative. (A "Places API" sem "(New)" é a versão antiga e não serve.)
2. **Chave só do Radar** → `GOOGLE_MAPS_API_KEY`
   - *Credenciais → Criar credenciais → Chave de API*. Renomeie para `RADAR_PLACES_SERVER`.
   - *Restrições de aplicativo*: **Endereços IP** → `187.127.3.103` (o servidor do Lavacar).
   - *Restrições de API*: **Places API (New)**.
   - Não reutilize a `GOOGLE_MAPS_BROWSER_KEY_MAPA` (só funciona no navegador do site).
3. **Conta de serviço** → `GOOGLE_SERVICE_ACCOUNT_JSON`
   - *Credenciais → Gerenciar contas de serviço → Criar conta de serviço*.
     Nome `radar-planilha`. Não precisa dar papel (role). Concluir.
   - Abra a conta → *Chaves → Adicionar chave → Criar nova chave → JSON*. O arquivo baixa na pasta Downloads.
   - Guarde o arquivo com cuidado: é uma senha. Nunca coloque no GitHub nem mande no chat.
4. **Compartilhar a planilha** "Leads Lava-jatos" com o e-mail da conta
   (`radar-planilha@...iam.gserviceaccount.com`) como **Editor**, sem notificar.
5. **Contador de consultas grátis**: *IAM e administrador → IAM → Conceder acesso*.
   Novos principais: o e-mail da conta de serviço. Papel: **Visualizador de monitoramento**
   (`roles/monitoring.viewer`). Salvar. Com isso o Radar lê no Google Cloud quantas buscas o projeto já fez
   no mês e mostra o número exato de consultas restantes. Sem esse papel, o Radar conta sozinho
   (só as buscas feitas por ele desde o último reinício) e avisa na tela.
   Se aparecer "Cloud Monitoring API desativada", ative-a em *APIs e serviços → Biblioteca*.
6. (Opcional) *Places API (New) → Cotas e limites do sistema*: limite **por dia** de *Text Search*
   (ex.: 300), como segunda trava além da do próprio Radar.

### Cota grátis do Google

- A busca usa o *Text Search* com telefone, site e nota: SKU **Enterprise**, **1.000 consultas grátis por mês**;
  depois disso cerca de US$ 35 a cada 1.000. Cada consulta traz até 20 estabelecimentos.
- O mês do Google fecha no horário do Pacífico (EUA): as consultas voltam no **dia 1º às 04:00 de Brasília**
  (05:00 nas renovações de dezembro a março, quando os EUA estão fora do horário de verão).
- Descobrir o contorno da cidade (para dividir o mapa) usa Autocomplete + Place Details, com cota grátis própria
  (5.000/mês), e não gasta as 1.000 da busca.
- Com `BLOQUEAR_NO_LIMITE=1` (padrão) o Radar para de buscar quando as grátis acabam.
- A cota grátis é por conta de faturamento: se outro sistema do mesmo projeto também usar *Text Search*,
  o contador do Radar inclui essas buscas.

## 3. DNS na Hostinger

*Domínios → lavacar.app → DNS / Nameservers → Adicionar registro*:

| Tipo | Nome | Aponta para | TTL |
|---|---|---|---|
| A | `radar` | `187.127.3.103` | 3600 |

Não mexa nos outros registros (o `lavacar.app` principal aponta para o Lovable).

## 4. EasyPanel

1. Abra o projeto **n8n** (ou crie um projeto `radar`) → **+ Serviço → App** → nome `radar`.
2. **Fonte → Imagem Docker**: `ghcr.io/jeanlopesdevvv/leadhunter:latest` → Salvar.
3. **Ambiente** (formato `.env`, uma variável por linha):

   ```
   APP_PASSWORD=escolha-uma-senha-forte
   GOOGLE_MAPS_API_KEY=cole-a-chave-RADAR_PLACES_SERVER
   GOOGLE_SERVICE_ACCOUNT_JSON=cole-a-linha-base64
   SHEET_ID=180iMVX1oA3oJ0IVBlsnGkFPq_2p4pEtNMZ8zhSUlP1g
   SHEET_TAB=leads
   SHEET_DEFAULT_STATUS=pendente
   DEDUP_EXTRA_TABS=historico_carol,historico_sofia
   MAX_REQUESTS_PER_SEARCH=200
   LIMITE_MENSAL_CONSULTAS=1000
   BLOQUEAR_NO_LIMITE=1
   ```

   O `.env` do EasyPanel não aceita valores em várias linhas, então o JSON da conta de serviço vai em
   **base64** (uma linha só). No Windows, abra o PowerShell e rode (troque o nome do arquivo):

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:USERPROFILE\Downloads\NOME-DO-ARQUIVO.json")) | Set-Clipboard
   ```

   O resultado vai direto para a área de transferência: cole depois de `GOOGLE_SERVICE_ACCOUNT_JSON=`.
4. **Domínios → Adicionar domínio**: host `radar.lavacar.app`, HTTPS ligado, caminho `/`,
   **porta 3000** (protocolo HTTP). Marque como principal.
5. **Recursos**: limite de memória **384 MB** (o app usa ~50 MB; o limite protege o n8n e o Chatwoot).
6. **Implantar**.
7. (Opcional) Deploy automático: copie a URL de *Implantações → Deployment Trigger* e crie no GitHub o secret
   `EASYPANEL_DEPLOY_WEBHOOK` (*Settings → Secrets and variables → Actions → New repository secret*).
   A cada push na `main`, o GitHub testa, publica a imagem e avisa o EasyPanel.

## 5. Botão de disparo (n8n)

A tela **Disparo** manda o n8n rodar o *Fluxo 1 - Disparo de Leads* e mostra o progresso lendo a aba `leads`
(`status` vira `enviado` ou `sem_whatsapp` e `mensagem_enviada_em` é preenchida). O fluxo continua igual; só ganha
uma segunda forma de começar, além do botão *Execute workflow*.

O passo a passo também aparece dentro do Radar, na tela **Disparo**, enquanto o botão não está ligado:

1. Na tela Disparo do Radar, clique em **Copiar o nó**. Ele copia um nó Webhook chamado **Disparo pelo Radar**
   (POST), com um código aleatório no endereço: só quem tem o endereço consegue começar o disparo.
   Modelo em [`docs/n8n-no-disparo-pelo-radar.json`](n8n-no-disparo-pelo-radar.json); troque o código do `path` se usar esse.
2. No n8n, abra o Fluxo 1, clique num espaço vazio do quadro e aperte **Ctrl+V**. Se a linha até
   **Inicializar Limite Diário** não aparecer, arraste da bolinha do novo nó até ele.
3. Clique em **Publish** (sem publicar, o endereço de produção não responde).
4. Abra o nó e copie a **Production URL** (termina em `/webhook/radar-disparo-…`).
5. **EasyPanel → radar → Ambiente**: acrescente e clique em **Implantar**:

   ```
   N8N_DISPARO_URL=cole-a-Production-URL
   LIMITE_DIARIO_CAROL=5
   ```

Opcional: para uma senha a mais, ligue *Header Auth* no nó (credencial com *Name* `X-Radar-Token`) e coloque o
mesmo valor em `N8N_DISPARO_TOKEN`.

Como o disparo escolhe quem recebe:
- A fila do Radar mostra quem está `pendente` ou `aguardando` na planilha (com telefone e sem optout). Você marca quem vai
  receber (um, alguns ou todos) e clica em **Disparar**.
- O n8n manda mensagem para todo `pendente`. Por isso, antes de chamar o n8n, o Radar deixa como `pendente` só os marcados
  e muda os outros pendentes para `aguardando` (status `STATUS_AGUARDANDO`). Eles continuam na fila do Radar para o próximo
  disparo. Depois o Radar relê a planilha e só chama o n8n se os pendentes forem exatamente os marcados.
- Quem ficou `aguardando` não é pego pelo botão manual do n8n; para disparar, use o Radar (ou volte o status para `pendente`).

Proteções:
- O Radar nunca começa um segundo disparo enquanto o primeiro está enviando, nem se a Carol mandou mensagem nos
  últimos 90 segundos (alguém rodando o fluxo direto no n8n). Assim ninguém recebe duas vezes.
- Números bloqueados (`TELEFONES_BLOQUEADOS`, padrão: o do próprio Lavacar) não aparecem nas buscas, não vão para a
  planilha e nunca entram num disparo (se estiverem pendentes na planilha, viram `aguardando`).
- O progresso vem da planilha: se ficar mais de 4 minutos sem novidade com gente aguardando, a tela mostra
  "O disparo parou" (quase sempre o limite diário da Carol; quem sobrou continua `pendente`).

Limite diário: o nó *Checar Limite Diário* usa `CAROL_LIMITE_DIARIO` (ou **5**, se a variável não existir no n8n).
Para aumentar, crie/ajuste `CAROL_LIMITE_DIARIO` no n8n e `LIMITE_DIARIO_CAROL` no Radar com o mesmo número.
O contador do dia só é guardado em execuções de produção (webhook): pelo botão do Radar, o limite vale para o dia inteiro.

## 6. Conferir

1. Abra <https://radar.lavacar.app> (o certificado HTTPS pode levar 1–2 minutos na primeira vez) e entre com a senha.
2. Menu **Configuração**: senha, busca no Google Maps, contador de consultas e planilha devem ficar verdes, com as
   colunas da aba `leads` em verde e as abas `historico_carol` e `historico_sofia` lidas.
3. Faça uma busca de **20** contatos com 1 termo e 1 cidade, deixe marcado só **um** e envie.
4. Confira a nova linha no fim da aba `leads` com `status = pendente` e veja se a Carol dispara a mensagem.
5. Envie o mesmo lead de novo: ele deve aparecer como *Já na planilha* e ser ignorado.

## Atualizações

- Com o webhook do passo 4.7: é automático a cada push na `main`.
- Sem o webhook: espere o Actions ficar verde e clique **Implantar** no serviço `radar` do EasyPanel.
- Voltar para uma versão anterior: em *Fonte*, troque `latest` pela tag `sha-xxxxxxx` da versão desejada.

## Problemas comuns

| Mensagem ou sintoma | O que fazer |
|---|---|
| EasyPanel não baixa a imagem ("denied"/"unauthorized") | Passo 1.3: deixe o pacote público. |
| Site não abre / erro de certificado | Confira o registro A `radar` (passo 3) e se a porta do domínio no EasyPanel é **3000**. |
| "A Places API (New) não está ativada" | Passo 2.1. |
| "O Google recusou a chave (restrição de API ou de IP…)" | A restrição de IP da chave precisa ser `187.127.3.103`, e a API precisa ser a Places API (New). |
| "A conta de serviço não tem acesso à planilha" | Passo 2.4: compartilhe a planilha com o e-mail da conta como **Editor**. |
| "GOOGLE_SERVICE_ACCOUNT_JSON está inválido" | Gere de novo a linha base64 (passo 4.3) e cole sem espaços extras. |
| "Faltam colunas na linha 1 da aba leads" | A linha 1 precisa ter `telefone, nome, tipo, cidade, status`. |
| Contador amarelo: "Contando só as buscas feitas pelo Radar…" | Passo 2.5: papel **Visualizador de monitoramento** para a conta de serviço. |
| Disparo: "O n8n não reconheceu o endereço" | O Fluxo 1 precisa estar publicado (**Publish**) e `N8N_DISPARO_URL` tem que ser a *Production URL*. |
| Disparo: "O n8n recusou o pedido" | Se o nó usa Header Auth, `N8N_DISPARO_TOKEN` precisa ser igual ao *Value* da credencial. |
| "As 1.000 consultas grátis deste mês acabaram" | Espere a renovação (dia 1º, 04:00) ou, se aceitar pagar o excedente, `BLOQUEAR_NO_LIMITE=0`. |

Trocar a senha: altere `APP_PASSWORD` no *Ambiente* do EasyPanel e clique **Implantar** (todas as sessões abertas caem).

---

## Alternativa: Vercel

O projeto também roda na Vercel sem mudanças (importe o repositório e cadastre as mesmas variáveis).
Atenção: o plano grátis da Vercel (Hobby) é só para uso não comercial; para uma ferramenta da empresa
é preciso o plano Pro. Na Vercel, a chave do Google **não** pode ter restrição por IP (os IPs mudam).
