# Radar Lavacar (LeadHunter v3)

**https://radar.lavacar.app** — prospecção de lava-jatos para o Lavacar. Busca estabelecimentos no Google (Places API oficial),
remove repetidos, confere na planilha **Leads Lava-jatos** quem já recebeu mensagem e envia os novos
para a aba `leads` com um clique, no formato que a Carol usa para disparar a primeira mensagem no WhatsApp.

```
telefone        nome              tipo       cidade           status    mensagem_enviada_em  optout
5531982999779   Jean Lopes        Autônomo   Belo Horizonte   pendente
```

## Como funciona

1. **Buscar**: quem procurar (lava-jatos, lavadores autônomos ou os dois), onde, e **quantos contatos novos**
   você quer (20, 50, 100, 200, 500 ou outro número). A busca vai por rodadas (1ª página de cada termo × cidade,
   depois as seguintes) e para assim que achar essa quantidade de contatos com celular que ainda não estão na
   planilha. Quando o Google esgota os 60 resultados de uma consulta, o Radar divide o mapa da cidade em 4
   (e de novo, até 64 pedaços) para achar mais.
2. **Revisar**: cada lead mostra se o telefone é celular ou fixo, a sugestão de tipo (Autônomo/Empresa,
   editável), nota, site e link do Maps. Os que já estão na planilha aparecem como *Já na planilha*.
   Exatamente a quantidade pedida já vem marcada.
3. **Enviar**: os marcados vão para o fim da aba `leads` com `status = pendente`.
4. **Disparar**: na tela *Disparo*, você marca quem recebe (um, alguns ou todos da fila) e um botão manda o n8n
   (Fluxo 1) enviar a primeira mensagem da Carol; a tela acompanha o envio lendo a planilha (enviado / sem WhatsApp).
   Os não marcados ficam como `aguardando` na planilha, para um próximo disparo.
   Nunca começa um segundo disparo por cima do primeiro. Configuração em [docs/SETUP.md](docs/SETUP.md#5-botão-de-disparo-n8n).

### Consultas grátis do mês

O painel mostra quantas das **1.000 consultas grátis** do Google ainda restam e quando renovam
(dia 1º, 00:00 no horário do Pacífico = 04:00 de Brasília). O número vem do Cloud Monitoring do projeto
(o mesmo do painel "APIs e serviços"); nos últimos minutos, que o Google ainda não mostrou, vale o registro do
próprio Radar. Antes de buscar, a tela mostra o máximo de consultas que a busca pode gastar, e o Radar para de
buscar quando as grátis acabam (`BLOQUEAR_NO_LIMITE=1`).

### Deduplicação (ninguém recebe duas vezes)

- Durante a busca: mesmo lugar do Google ou mesmo telefone aparece uma vez só.
- Antes de enviar: o servidor relê a planilha **na hora de gravar** e ignora quem já está na aba `leads`
  (inclusive quem marcou `optout`) e quem aparece em `historico_carol` / `historico_sofia`.
- Telefones são normalizados antes de comparar (o 9º dígito é colocado quando falta): `5531982999779`,
  `553182999779`, `(31) 98299-9779` e `+55 31 9 8299-9779` são o mesmo contato.
- Dois envios ao mesmo tempo: os envios são feitos um de cada vez e, depois de gravar, o app confere a
  planilha de novo; se outro envio gravou o mesmo telefone um instante antes, a linha repetida recebe
  `status = duplicado` (a Carol só dispara `pendente`).
- Por padrão só celulares são enviados (fixo quase nunca tem WhatsApp); dá para incluir fixos.

## Tecnologia

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4.
- Roda como container Docker no EasyPanel do servidor do Lavacar; a imagem é montada pelo GitHub Actions
  (`ghcr.io/jeanlopesdevvv/leadhunter`). Também roda na Vercel sem mudanças.
- Google Places API (New) — Text Search.
- Google Sheets API com conta de serviço.
- Acesso por senha única (cookie assinado, `httpOnly`).
- Testes com Vitest (`npm test`).

## Implantação

Siga **[docs/SETUP.md](docs/SETUP.md)**: Google Cloud do Lavacar, DNS na Hostinger e serviço no EasyPanel,
passo a passo. A cada push na `main`, o GitHub Actions roda os testes e publica uma imagem nova.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local   # preencha APP_PASSWORD e, para testar sem chaves, MOCK_MODE=1
npm run dev                  # http://localhost:3000
npm test                     # testes automatizados
npm run lint && npm run typecheck
```

Com `MOCK_MODE=1` o app usa dados falsos e uma planilha em memória (ignorado na imagem Docker e na produção da Vercel).

Imagem local: `docker build -t radar-lavacar . && docker run -p 3000:3000 --env-file .env.local radar-lavacar`.

## Estrutura

```
src/
  app/                  telas (login e painel) e rotas da API
    api/search/plan     planeja a busca (termos × cidades) e acha o contorno de cada cidade
    api/search/page     uma página de resultados da Places API (confere a cota antes)
    api/uso             consultas grátis usadas/restantes no mês e data da renovação
    api/disparo         fila da Carol, chama o webhook do n8n e acompanha o progresso
    api/sheets/check    quem já está na planilha
    api/sheets/send     grava os novos (com nova checagem de duplicados)
    api/status          diagnóstico das conexões
  components/           interface (visual do Lavacar)
  lib/                  regras: telefone, classificação, planilha, Places, sessão
  proxy.ts              exige a senha em todas as páginas e APIs
tests/                  testes automatizados
docs/                   AUDITORIA.md (v2 → v3) e SETUP.md
Dockerfile              imagem de produção (servidor Node enxuto, ~50 MB de RAM)
.github/workflows/      testes + publicação da imagem no GitHub Container Registry
```

A versão anterior (Python + Playwright, local) está preservada na tag `legacy-python-v2`.
