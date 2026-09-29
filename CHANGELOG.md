# CHANGELOG — LeadHunter v2.0

**Data:** 03/04/2026  
**Backup:** `leadhunter_backup_20260403_XXXXXX` criado antes de qualquer alteração.

---

## 🐛 BUGS CORRIGIDOS

### Bug 1 — Toast duplicado no export CSV (`app.js`)
- Removida a chamada duplicada de `toast()` na linha ~525 do export CSV.

### Bug 2 — media_type errado para Excel (`main.py`)
- O endpoint `/api/download/{filename}` agora detecta a extensão do arquivo.
- `.csv` → `text/csv`
- `.xlsx` → `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Outros → `application/octet-stream`

### Bug 3 — Ordenação quebrada durante busca ativa (`app.js`)
- Implementada flag `App.ordenacaoAtiva` e `App.bufferLeads`.
- Novos leads do SSE são acumulados no buffer enquanto há ordenação ativa.
- Buffer é drenado automaticamente ao concluir a busca.

### Bug 4 — Race condition no banco de dados (`database.py`)
- `incrementar_total_busca()` eliminada como função separada.
- O contador é agora incrementado dentro da **mesma transação** que `salvar_lead()`.
- Adicionado `PRAGMA busy_timeout=5000` para evitar erros de `database is locked`.

### Bug 5 — Seletores desatualizados do Google Maps (`scraper.py`)
- Implementada função `get_text_fallback(page, seletores)` que tenta cada seletor em sequência.
- Seletores alternativos adicionados para: nome, telefone, endereço.
- Script JS inline também atualizado com múltiplos seletores de fallback.

### Bug 6 — Injeção de XSS no innerHTML (`app.js`)
- Criada função `escapeHtml(str)` que escapa `&`, `<`, `>`, `"`, `'`.
- Aplicada em todos os campos interpolados no `innerHTML` da tabela e modais.

---

## ⚡ MELHORIAS DE PERFORMANCE

### Perf 1 — Extração de Plus Code e Maps URL (`scraper.py`, `database.py`, `exporter.py`)
- Novas colunas `plus_code` e `maps_url` adicionadas à tabela `leads` com migração automática.
- Script JS inline do scraper extrai ambos os campos.
- Campos incluídos no CSV, Excel e Google Sheets.

### Perf 2 — Paralelismo na visita ao site (`scraper.py`)
- Implementado pipeline com `asyncio.Queue` e `N_WORKERS = 3` workers paralelos.
- Workers consomem sites da `fila_sites` enquanto o Maps continua sendo navegado.
- Resultados enriquecidos são colocados em `fila_prontos` para o loop principal.

### Perf 3 — Cache de domínios já visitados (`scraper.py`)
- Dicionário `_cache_sites` criado por busca, indexado por domínio.
- Antes de visitar um site, verifica o cache. Redes de franquias ganham muito desempenho.

### Perf 4 — Paginação virtual na tabela (`app.js`, `index.html`)
- Exibe 50 leads por vez com botões "Anterior" / "Próximo".
- Indicador "Página X de Y" atualizado dinamicamente.
- Paginação oculta quando há menos de 50 leads.

### Perf 5 — Debounce no filtro da tabela (`app.js`)
- Adicionado debounce de 200ms no `input` do filtro.
- Evita iteração em todos os `tr` a cada keystroke.

### Perf 6 — Índice no SQLite (`database.py`)
- `CREATE INDEX IF NOT EXISTS idx_leads_nome ON leads(nome)` adicionado.
- `CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads(telefone)` adicionado (usado na deduplicação).

### Perf 7 — Scroll inteligente no Maps (`scraper.py`)
- Loop de scroll agora monitora `len(cards_url)` antes e depois de cada scroll.
- Se não cresceu em 2 tentativas consecutivas, considera-se o fim real da lista.

### Perf 8 — Compressão GZip (`main.py`)
- `GZipMiddleware` adicionado ao FastAPI com `minimum_size=1000`.
- Respostas JSON grandes são comprimidas automaticamente.

---

## 🎨 MELHORIAS DE UX/UI

### UX 1 — Coluna "Endereço" via CSS ellipsis (`style.css`, `app.js`)
- Classe `.col-endereco` com `overflow:hidden`, `text-overflow:ellipsis`, `max-width:200px`.
- `title=""` agora está no `<td>`, não num span interno.

### UX 2 — Modal de detalhes ampliado (`app.js`)
- Botão "Copiar tudo" que copia todos os dados em texto.
- Botão "Abrir no Maps" com link direto.
- Botão "Marcar como Contatado" que adiciona classe visual na linha.
- Campo "Notas" salvo via PATCH ao sair do campo (Feature 2).

### UX 3 — Exportação sem busca ativa (`app.js`)
- Botões de exportar habilitados quando `App.leads.length > 0`, independente de `searchId`.

### UX 4 — Contador de leads selecionados (`app.js`)
- Texto dos botões de exportar muda para "Exportar X selecionados" quando há seleção ativa.

### UX 5 — Feedback visual no botão "Parar busca" (`app.js`)
- Ao clicar em parar, botão entra imediatamente em estado "Parando..." com spinner.
- Botão é desabilitado para evitar cliques duplos.

### UX 6 — Preview de leads no histórico (`app.js`, `style.css`)
- Estrutura para exibir os 3 primeiros nomes de leads no card do histórico.
- Estilo `.history-preview` em fonte menor e cor secundária.

### UX 7 — Tema sem flash ao recarregar (`main.py`)
- Endpoint `GET /` lê a config e injeta `<script>document.documentElement.dataset.theme="..."</script>` no `<head>` antes de qualquer render.
- Elimina o FOUC (Flash of Unstyled Content) do tema.

### UX 8 — Título dinâmico na sidebar (`app.js`)
- Nav-item "Resultados" atualiza para "Resultados (buscando...)" durante busca.
- Atualiza para "Resultados (123)" ao concluir.

### UX 9 — Indicadores de campos vazios (`app.js`, `style.css`)
- `—` em cinza claro (`.campo-nao-coletado`) para campos não coletados.
- 🚫 (`.campo-nao-encontrado`) para site visitado mas campo não encontrado.

### UX 10 — Múltiplas cidades (`index.html`, `app.js`, `main.py`)
- Campo de cidade trocado de `<input>` para `<textarea>` (uma cidade por linha).
- Backend processa sequencialmente com o mesmo `search_id`.
- Progresso exibido como "Cidade 1/3: Belo Horizonte".

### UX 11 — Botão "Nova busca" na página de resultados (`index.html`, `app.js`)
- Botão no cabeçalho da página de resultados.
- Navega para a busca e pré-preenche tipo e cidade da última busca.

---

## 🆕 NOVAS FUNCIONALIDADES

### Feature 1 — Status de contato por lead (`database.py`, `app.js`, `style.css`)
- Nova coluna `status_contato TEXT DEFAULT 'Novo'` com migração automática.
- Select por linha na tabela: "Novo", "Contatado", "Sem resposta", "Cliente", "Descartado".
- Salvo via `PATCH /api/leads/{id}` ao mudar.
- Cores distintas por status no CSS.
- Incluído no CSV, Excel e Google Sheets.

### Feature 2 — Notas por lead (`database.py`, `app.js`)
- Nova coluna `notas TEXT DEFAULT ''` com migração automática.
- Textarea no modal de detalhes, salvo via `PATCH` ao sair do campo (`onblur`).

### Feature 3 — Export Excel profissional (`exporter.py`)
- Reescrito com `openpyxl` puro:
  - Cabeçalhos em negrito, fundo azul `#2563EB`, texto branco.
  - Linhas alternadas em cinza `#F8F9FA`.
  - Largura de colunas ajustada automaticamente (máx 50 chars).
  - Coluna de avaliação com estrelas unicode (★★★★☆).
  - Links de site/instagram/facebook como hiperlinks clicáveis.
  - Aba nomeada com tipo + cidade + data.
  - Linha de total no rodapé.
  - Cabeçalho fixo e filtros automáticos.

### Feature 4 — Deduplicação inteligente (`database.py`, `main.py`, `app.js`)
- `salvar_lead()` verifica duplicatas por telefone e por nome (same search_id).
- Se duplicado with new data: **atualiza** o registro existente (campos vazios preenchidos, custom_fields mesclados).
- Se duplicado sem dados novos: retorna `None` e emite evento SSE `duplicado`.
- Frontend mostra contador de duplicatas ignoradas em tempo real.

### Feature 5 — Endpoint de estatísticas (`database.py`, `main.py`, `index.html`, `app.js`)
- Novo `GET /api/stats` retorna: total de buscas, leads, top 5 cidades/tipos, taxa de email, taxa de redes sociais.
- Cards de estatísticas exibidos no topo da página de Histórico.

### Feature 6 — Modo Rápido (`index.html`, `app.js`, `scraper.py`, `main.py`)
- Toggle "Modo Rápido" na tela de busca com badge amarela animada.
- Quando ativo, desabilita visita ao site, tornando a busca 3–5× mais rápida.
- Enviado como `modo_rapido: true` no `POST /api/search`.
- Persiste na config do servidor.

### Feature 7 — Endpoint PATCH /api/leads/{id} (`database.py`, `main.py`)
- Nova função `atualizar_lead(lead_id, campos)` em `database.py`.
- Campos permitidos: `status_contato`, `notas`, `custom_fields`.
- Endpoint `PATCH /api/leads/{lead_id}` com modelo Pydantic `AtualizarLeadRequest`.

---

## 📤 MELHORIAS NO EXPORTER

### Exporter 1 — Google Sheets com auto-resize (`exporter.py`)
- Após inserir dados, chama `autoResizeDimensions` via `batch_update`.

### Exporter 2 — Google Sheets com linha de total (`exporter.py`)
- Linha de rodapé com "Total: X leads".
- Fórmulas `=COUNTA(C2:C{n})` para telefone e email.
- Negrito na linha de total.

### Exporter 3 — Nome de arquivo sem acentos (`exporter.py`)
- Função `_remover_acentos()` com `unicodedata.normalize('NFD')`.
- Nomes gerados corretamente: `leads_farmacias_Belo_Horizonte_20260403.csv`.

---

## 🗄️ BANCO DE DADOS — MIGRAÇÕES AUTOMÁTICAS

As seguintes colunas são adicionadas automaticamente via `PRAGMA table_info` na inicialização:

| Coluna | Tipo | Padrão |
|--------|------|--------|
| `status_contato` | TEXT | `'Novo'` |
| `notas` | TEXT | `''` |
| `plus_code` | TEXT | `''` |
| `maps_url` | TEXT | `''` |

Índices adicionados:
- `idx_leads_nome` — acelera buscas históricas por nome
- `idx_leads_telefone` — usado na deduplicação

---

*LeadHunter v2.0 — Build 2026-04-03*
