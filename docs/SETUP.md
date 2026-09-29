# Colocando o LeadHunter no ar (Google Cloud + Planilha + Vercel)

Tempo estimado: 20 a 30 minutos. Você vai precisar de acesso ao Google Cloud (pode ser com a mesma conta
Google dona da planilha), à planilha **Leads Lava-jatos** e à Vercel.

---

## 1. Google Cloud: projeto e faturamento

1. Acesse <https://console.cloud.google.com/> e crie um projeto (ex.: `leadhunter-lavacar`).
2. Menu **Faturamento** → vincule uma conta de faturamento ao projeto.
   A Places API exige faturamento ativo, mesmo dentro da cota grátis.
3. Recomendado: **Faturamento → Orçamentos e alertas** → crie um alerta (ex.: R$ 50/mês).

## 2. Ativar as APIs

Em **APIs e serviços → Biblioteca**, ative:

- **Places API (New)** (atenção: é a "New", não a "Places API" antiga)
- **Google Sheets API**

## 3. Chave da Places API → `GOOGLE_MAPS_API_KEY`

1. **APIs e serviços → Credenciais → Criar credenciais → Chave de API**.
2. Clique na chave criada → **Restrições de API** → *Restringir chave* → marque só **Places API (New)** → Salvar.
   (Não use restrição por site/HTTP referrer: a chave é usada pelo servidor da Vercel, não pelo navegador.)
3. Copie a chave.

**Proteção de custo (recomendado):** em **APIs e serviços → Places API (New) → Cotas e limites do sistema**,
reduza o limite **por dia** das solicitações de *Text Search* (SearchText) para, por exemplo, 300.
Assim, mesmo com erro humano, o gasto diário tem teto.

Referência de custo (set/2026): Text Search com telefone/site/nota = SKU *Enterprise*:
1.000 consultas grátis por mês, depois US$ 35 por 1.000. Cada consulta traz até 20 estabelecimentos.

## 4. Conta de serviço → `GOOGLE_SERVICE_ACCOUNT_JSON`

1. **IAM e administrador → Contas de serviço → Criar conta de serviço**.
   Nome: `leadhunter-sheets`. Não precisa dar nenhum papel (role). Concluir.
2. Abra a conta criada → aba **Chaves → Adicionar chave → Criar nova chave → JSON**. Um arquivo `.json` é baixado.
3. Guarde esse arquivo com cuidado (é uma senha). Ele não deve ir para o GitHub.
4. Anote o e-mail da conta (algo como `leadhunter-sheets@leadhunter-lavacar.iam.gserviceaccount.com`).

> Se aparecer "A criação de chaves de conta de serviço está desativada", a organização do Google Workspace
> bloqueia chaves. Use um projeto numa conta Google pessoal ou peça ao administrador para liberar
> a política `iam.disableServiceAccountKeyCreation` neste projeto.

## 5. Compartilhar a planilha com a conta de serviço

1. Abra a planilha **Leads Lava-jatos**.
2. **Compartilhar** → cole o e-mail da conta de serviço → permissão **Editor** → desmarque "Notificar" → Compartilhar.

A aba `leads` precisa ter na linha 1 os cabeçalhos `telefone, nome, tipo, cidade, status`
(`mensagem_enviada_em` e `optout` são preenchidos pela Carol). A ordem das colunas não importa.
Se você criar colunas extras com estes nomes, o app também preenche: `endereco`, `bairro`, `uf`, `site`,
`maps_url`, `nota`, `avaliacoes`, `categoria`, `place_id`, `origem`, `capturado_em`, `termo`.

## 6. Vercel

1. <https://vercel.com/new> → **Import** o repositório `jeanlopesdevvv/LeadHunter`.
2. Framework: **Next.js** (detectado sozinho). Não mude comandos de build.
3. Em **Environment Variables**, crie:

| Variável | Valor |
|---|---|
| `APP_PASSWORD` | a senha que a equipe vai usar para entrar |
| `GOOGLE_MAPS_API_KEY` | a chave do passo 3 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | o **conteúdo inteiro** do arquivo `.json` do passo 4 (abra no Bloco de Notas, copie tudo e cole) |
| `SHEET_ID` | `180iMVX1oA3oJ0IVBlsnGkFPq_2p4pEtNMZ8zhSUlP1g` (opcional, já é o padrão) |
| `SHEET_TAB` | `leads` (opcional) |
| `SHEET_DEFAULT_STATUS` | `pendente` (opcional) |
| `DEDUP_EXTRA_TABS` | `historico_carol,historico_sofia` (opcional, já é o padrão; `nenhuma` desliga) |
| `MAX_REQUESTS_PER_SEARCH` | `200` (opcional) |

4. **Deploy**.

O `vercel.json` já coloca as funções na região **São Paulo (gru1)**.

## 7. Conferir

1. Abra o endereço da Vercel → entre com a senha.
2. Menu **Configuração**: os três itens devem estar verdes, com as colunas da aba `leads` em verde.
3. Faça uma busca **Rápida** com 1 termo e 1 cidade, selecione **um** lead e envie.
4. Confira a nova linha no fim da aba `leads` com `status = pendente`.
5. Envie o mesmo lead de novo: ele deve aparecer como *Já na planilha* e ser ignorado.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "A Places API (New) não está ativada" | Passo 2: ative a **Places API (New)** no mesmo projeto da chave. |
| "O projeto do Google Cloud está sem faturamento ativo" | Passo 1: vincule uma conta de faturamento. |
| "A conta de serviço não tem acesso à planilha" | Passo 5: compartilhe a planilha com o e-mail da conta como **Editor**. |
| "Aba "leads" não encontrada" | Confira o nome da aba ou ajuste `SHEET_TAB`. |
| "GOOGLE_SERVICE_ACCOUNT_JSON está inválido" | Cole o JSON inteiro, incluindo as chaves `{ }` do começo e do fim. |
| "Esta busca pode usar até N consultas…" | Reduza termos/cidades/profundidade ou aumente `MAX_REQUESTS_PER_SEARCH`. |

Trocar a senha: altere `APP_PASSWORD` na Vercel e faça **Redeploy** (todas as sessões abertas caem).
