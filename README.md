# 🎯 LeadHunter

Ferramenta profissional de prospecção de leads via Google Maps. Extraia nome, telefone, e-mail, redes sociais e muito mais — 100% local, sem custos de API.

---

## 🚀 Como Iniciar

### Windows (duplo clique)
```
start.bat
```

### Linux / Mac (terminal)
```bash
bash start.sh
```

Após iniciar, acesse: **http://localhost:8000**

---

## 📋 Fazendo uma Busca

1. Clique em **Nova Busca** na sidebar
2. Digite o tipo de negócio (pode digitar vários, um por linha)
3. Digite as cidades/regiões (pode digitar várias, uma por linha)
4. Ajuste o slider de quantidade (10 a 1000 resultados)
5. Clique em **Iniciar Busca**
6. Acompanhe os leads aparecendo em tempo real
7. Os resultados ficam na aba **Resultados** automaticamente

---

## ⬇️ Exportando Leads

### Excel (.xlsx) e CSV
- Clique em **Exportar Excel** ou **Exportar CSV** na tela de Resultados
- O arquivo é salvo na pasta `exports/` e baixado automaticamente
- No Excel, as colunas vêm organizadas com formatação profissional, detecção de perfil (Empresa / Autônomo) e telefones normalizados para disparo WhatsApp (DDI + DDD + Número)

### Google Sheets
1. Configure as credenciais (veja abaixo)
2. Clique em **Google Sheets** na tela de Resultados
3. Escolha criar nova planilha ou adicionar a uma existente
4. A planilha abre automaticamente no seu browser

---

## 📊 Configuração do Google Sheets (uma vez só)

1. Acesse https://console.cloud.google.com/
2. Crie um projeto → vá em **APIs e Serviços → Biblioteca**
3. Ative **Google Sheets API** e **Google Drive API**
4. Vá em **Credenciais → + Criar Credenciais → ID do cliente OAuth 2.0**
5. Tipo: **App para computador** → baixe o arquivo JSON
6. Renomeie para `credentials.json` e coloque na pasta `credentials/`
7. Na primeira exportação, uma janela abrirá para você autorizar — é uma vez só!

---

## ⚙️ Estrutura de Pastas

```
leadhunter/
├── main.py          # Servidor FastAPI (API + frontend)
├── scraper.py       # Motor de scraping (Playwright)
├── exporter.py      # Exportação CSV e Google Sheets
├── database.py      # Banco de dados SQLite local
├── config.py        # Configurações e campos
├── frontend/        # Interface web (HTML/CSS/JS)
├── credentials/     # Credenciais do Google (não compartilhe!)
├── exports/         # CSVs gerados
└── leadhunter.db    # Banco SQLite (criado automaticamente)
```

---

## 💡 Dicas

| Dica | Detalhe |
|---|---|
| Seja específico | `"lava-jatos"` em `"Contagem - MG"` > buscas genéricas |
| Limite seguro | Até 200 leads por busca reduz risco de CAPTCHA |
| Sem e-mail? | Ative "Visitar Site do Lead" nas Configurações |
| Mais rápido? | Desative "Visitar Site do Lead" se não precisar de e-mail |
| CAPTCHA | O scraper pausa automaticamente — aguarde alguns minutos |

---

## 🛠 Requisitos

- Python 3.10 ou superior
- Conexão com a internet (para acessar Google Maps)
- Windows 10+ / Linux / MacOS

---

## 📁 Histórico de Buscas

Todas as buscas ficam salvas no banco local `leadhunter.db`.  
Acesse pelo menu **Histórico** para reabrir resultados anteriores sem refazer a busca.

---

*LeadHunter — Desenvolvido para prospecção profissional de leads.*
