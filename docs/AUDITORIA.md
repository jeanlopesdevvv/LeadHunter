# Auditoria do LeadHunter v2 (Python) — 29/09/2026

Auditoria feita sobre o commit `bc198f2` (código Python original, preservado na tag `legacy-python-v2`).
Objetivo do produto: captar lava-jatos para o Lavacar e colocar cada lead na aba `leads` da planilha
"Leads Lava-jatos", de onde a Carol dispara a primeira mensagem no WhatsApp.

Legenda de gravidade: **Crítico** (impede o uso ou causa dano), **Alto** (resultado errado), **Médio**, **Baixo**.

---

## 1. Resumo

A v2 era um app **local** (FastAPI + Playwright + SQLite) pensado para rodar no PC com `start.bat`.
Três coisas impediam que ele cumprisse o objetivo:

1. **Não roda na Vercel.** Depende de navegador Chromium, de disco gravável, de thread em segundo
   plano e de memória compartilhada entre requisições. Nada disso existe numa função serverless.
2. **Não grava na aba `leads` no formato da Carol.** A exportação criava uma planilha nova (ou uma aba
   nova) com outras colunas ("Nome", "Perfil", "Cidade"...), e ainda deixava a planilha pública.
3. **A deduplicação só valia dentro da mesma busca.** O mesmo lava-jato podia ir para a planilha
   quantas vezes fosse buscado, e a Carol mandaria mensagem de novo.

Por isso a v3 foi reconstruída (Next.js + Google Places API oficial + Google Sheets por conta de
serviço), mantendo as boas ideias da v2: busca por vários termos × várias cidades, classificação
Autônomo/Empresa, seleção de leads, normalização de telefone para WhatsApp e visual do Lavacar.

---

## 2. Arquitetura e implantação

| # | Gravidade | Problema | Onde | Na v3 |
|---|---|---|---|---|
| A1 | Crítico | Raspagem com Playwright/Chromium: o navegador não existe na Vercel, e IP de servidor recebe CAPTCHA/bloqueio do Google. Raspar o Maps também viola os Termos do Google. | `scraper.py` | Substituído pela **Google Places API (New)** oficial. |
| A2 | Crítico | Busca roda numa `threading.Thread` e os eventos ficam numa fila em memória (`_sse_queues`). Em serverless a execução termina junto com a resposta e cada requisição pode cair numa instância diferente: o SSE nunca receberia os leads. | `main.py` | Sem estado no servidor: o navegador comanda a busca em passos curtos (uma página de resultados por chamada) e mostra o progresso real. |
| A3 | Crítico | Banco SQLite (`leadhunter.db`) e configuração (`leadhunter_config.json`) gravados em disco. Na Vercel o disco é somente leitura (só `/tmp`, que é apagado). | `database.py`, `config.py` | A **planilha é a fonte da verdade** para deduplicação. Histórico de buscas fica no navegador. Configuração vem das variáveis de ambiente. |
| A4 | Crítico | Google Sheets com OAuth de "App para computador" (`run_local_server`) e `webbrowser.open`: abre uma janela de login **no servidor**. `token.json` gravado em disco. | `exporter.py` | **Conta de serviço** do Google; chave nas variáveis da Vercel. |
| A5 | Alto | CSV/Excel gravados em `exports/` e baixados por outra requisição (que pode cair em outra instância). | `main.py`, `exporter.py` | CSV gerado no próprio navegador. |
| A6 | Médio | Sem testes, sem lint, sem versão fixa das dependências; `openpyxl` faltando no `requirements.txt` (exportar Excel falhava). | `requirements.txt` | Testes automatizados (Vitest), TypeScript estrito, lint, versões travadas no `package-lock.json`. |
| A7 | Baixo | `leadhunter_config.json` versionado com caminho absoluto de outra máquina (`C:\Gaveta 2\...`). Logo e favicon são o mesmo PNG de 427 KB, carregado duas vezes. | raiz, `frontend/` | Configuração só por variável de ambiente; logo em SVG (< 1 KB). |

## 3. Planilha e deduplicação (o coração do pedido)

| # | Gravidade | Problema | Onde | Na v3 |
|---|---|---|---|---|
| S1 | Crítico | Exportação cria planilha nova ou aba "Busca dd/mm/aaaa"; nunca escreve na aba `leads`. Colunas com nomes diferentes dos que a Carol lê (`telefone, nome, tipo, cidade, status, mensagem_enviada_em, optout`). | `exportar_google_sheets` | Botão **Enviar para a planilha** acrescenta linhas na aba `leads`, casando as colunas **pelo nome do cabeçalho** (a ordem das colunas pode mudar sem quebrar). `status = pendente`, `mensagem_enviada_em` e `optout` em branco. |
| S2 | Crítico | Planilha nova compartilhada com "qualquer pessoa com o link" (`planilha.share(None, perm_type="anyone")`): dados de leads expostos. | `exporter.py` | Nada é compartilhado. A conta de serviço só enxerga a planilha que você compartilhar com ela. |
| S3 | Crítico | Deduplicação apenas dentro do mesmo `search_id`. Buscas diferentes (ou repetidas) mandavam o mesmo lava-jato de novo. | `salvar_lead` | Antes de gravar, o servidor lê **todos** os telefones da aba `leads` e das abas `historico_carol`/`historico_sofia` (configurável) e descarta quem já existe, inclusive quem pediu `optout`. Também remove repetidos dentro do próprio lote. |
| S4 | Alto | Mesmo número com e sem o 9º dígito (`5531982999779` × `553182999779`) ou com máscara `(31) 98299-9779` era tratado como números diferentes. | `_formatar_telefone` | Todo telefone é normalizado (DDI, zero de operadora, máscara, 9º dígito) antes de comparar; células com dois números são lidas por inteiro. |
| S5 | Alto | Não diferenciava celular de fixo, nem números 0800/4004. A Carol usa WhatsApp: fixo quase sempre falha. | `_formatar_telefone` | Cada telefone é classificado (Celular / Fixo / Especial). Por padrão só celulares são enviados; dá para incluir fixos manualmente. |
| S6 | Alto | Deduplicação por **nome igual** dentro da busca: franquias e nomes genéricos ("Lava Jato") em bairros diferentes eram fundidos ou descartados. | `salvar_lead` | Deduplicação por ID do Google e por telefone, nunca só pelo nome. |
| S7 | Médio | Duas fontes de verdade para o status do contato: coluna `status_contato` no SQLite local × planilha da Carol. | `database.py` | O status vive só na planilha (a Carol atualiza). O app mostra "Já na planilha" para quem já está lá. |
| S8 | Médio | Sem trava entre dois cliques simultâneos. | — | Botão bloqueado durante o envio, envios em fila no servidor, nova checagem na hora de gravar e, depois de gravar, conferência final: se outro envio gravou o mesmo telefone um instante antes, a linha repetida vira `status = duplicado`. |

## 4. Bugs e segurança

| # | Gravidade | Problema | Onde | Na v3 |
|---|---|---|---|---|
| B1 | Crítico | API sem autenticação, `CORS *` e servidor em `0.0.0.0`: qualquer pessoa na rede podia buscar, ler todos os leads, apagar o histórico e alterar a configuração (`PATCH /api/config` aceitava qualquer chave). | `main.py` | **Senha única** (variável `APP_PASSWORD`), sessão em cookie assinado (HMAC) e `httpOnly`, limite de tentativas por IP; todas as rotas de API exigem sessão. |
| B2 | Alto | XSS: `onclick="copiar('${escapeHtml(nome).replace(/'/g, "\\'")}')"`. O `escapeHtml` troca `'` por `&#39;`, que o navegador desfaz **antes** de executar o JS; um estabelecimento chamado `x');alert(1);//` no Maps executaria código. O mesmo vale para o histórico e para `toast()`, que usa `innerHTML` com mensagens do servidor. | `app.js` | React escapa tudo por padrão; nenhum `innerHTML` nem `onclick` em string. |
| B3 | Alto | "Modo rápido" grava `modo_rapido=true` na configuração global e o `POST /api/search` nunca desliga: uma busca rápida deixava todas as seguintes sem visitar sites. | `main.py` | Opções de busca vão na própria requisição, sem efeito colateral. |
| B4 | Médio | Horários do histórico errados em 3 h: datas salvas em UTC sem `Z` (`datetime.utcnow().isoformat()`), e o JavaScript interpreta como horário local. | `database.py`, `app.js` | Datas em ISO com fuso; exibição em `America/Sao_Paulo`. |
| B5 | Médio | Filtro, "Selecionar todos" e ordenação agem só sobre a página visível da tabela (paginação de 50); ordenação de nota/avaliações compara texto ("9" > "10"). | `app.js` | Filtro, seleção e ordenação sobre a lista inteira; números ordenados como números. |
| B6 | Médio | Contador `total_found` também sobe quando um lead duplicado é "atualizado" e depois é sobrescrito no fim da busca. | `database.py`, `main.py` | Contadores calculados a partir da lista final (encontrados, únicos, celulares, novos, já na planilha). |
| B7 | Médio | A tela e o README prometem "o scraper pausa automaticamente em CAPTCHA", mas não existe detecção de CAPTCHA no código. | `README.md`, `index.html` | Não se aplica (API oficial). Erros da API aparecem com mensagem clara (chave inválida, cota, faturamento). |
| B8 | Baixo | Classificação Autônomo/Empresa marca quase tudo como "Empresa" porque as palavras `auto`, `car` e `lavagem` aparecem no nome de quase todo lava-jato; lista de apelidos (`" do z"`, `" gordo"`) frágil. | `exporter.py` | Regra revista (site, volume de avaliações, CNPJ/LTDA, rede/franquia, atendimento só a domicílio) e **editável lead a lead** antes de enviar. |
| B9 | Baixo | `id="duplicados-info"` com dois atributos `style` (o segundo é ignorado); barra de progresso baseada em leads/máximo, não no andamento real. | `index.html` | Progresso pelo número de consultas feitas / planejadas. |
| B10 | Baixo | `@app.on_event("startup")` e `datetime.utcnow()` estão obsoletos. | `main.py` | Não se aplica. |

## 5. Custos e limites da solução nova

- **Google Places API (Text Search, SKU Enterprise, por causa de telefone/site/nota):** 1.000 consultas
  grátis por mês; depois US$ 35 por 1.000 consultas. Cada consulta devolve até 20 estabelecimentos
  (até 20 mil leads/mês sem custo). O app mostra a estimativa de consultas antes de buscar e respeita o
  limite `MAX_REQUESTS_PER_SEARCH`. Recomendado também definir uma cota diária no Google Cloud.
- **Limite do Google:** no máximo 60 resultados por termo e área. Para cidades grandes, use a
  **varredura ampla/máxima** (divide a cidade em 4 ou 9 áreas) ou liste bairros.
- **Vercel:** cada chamada ao servidor é curta (uma página de resultados), bem abaixo do limite de
  300 s do plano Hobby.

## 6. O que ficou para uma próxima etapa (opcional)

- Histórico compartilhado entre usuários (hoje fica no navegador de quem buscou). Se precisar, dá para
  guardar em uma aba `buscas` da própria planilha ou no Supabase.
- Enriquecimento com e-mail/Instagram visitando o site do lead (a v2 fazia; exige navegador ou
  serviço externo e é lento).
- Painel de retorno da Carol (quantos responderam) lendo as abas `historico_carol` e `status_meta_carol`.
