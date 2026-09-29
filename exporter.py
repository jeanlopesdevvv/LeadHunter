"""
exporter.py — Exportação de leads para CSV, Excel e Google Sheets.

Três métodos de exportação:
1. CSV: via pandas, UTF-8 BOM, pronto para abrir no Excel brasileiro
2. Excel: via openpyxl com formatação profissional (Feature 3)
3. Google Sheets: via gspread + OAuth2, com formatação, autoResize e linha de total

Changelog v2:
- Feature 3:   Export Excel profissional com openpyxl (cores, hiperlinks, rodapé, estrelas)
- Exporter 1:  Google Sheets com autoResizeDimensions após inserção
- Exporter 2:  Google Sheets com linha de total (texto + fórmulas COUNTA)
- Exporter 3:  _gerar_nome_arquivo() com normalização unicode (remove acentos corretamente)
- Feature 1:   Inclui status_contato e notas no CSV/Excel/Sheets
- Perf 1:      Inclui plus_code e maps_url no CSV/Excel/Sheets
"""

import json
import os
import re
import unicodedata
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd

from config import CREDENTIALS_DIR, EXPORTS_DIR, carregar_config


# ─────────────────────────────────────────────
# MAPEAMENTO DE CAMPOS INTERNOS → CABEÇALHOS PT-BR
# ─────────────────────────────────────────────

CABECALHOS_PTBR: dict[str, str] = {
    "nome":             "Nome",
    "telefone":         "Telefone",
    "perfil":           "Perfil",
    "cidade_busca":     "Cidade",
    "endereco":         "Endereço",
    "email":            "E-mail",
    "site":             "Site",
    "instagram":        "Instagram",
    "facebook":         "Facebook",
    "linkedin":         "LinkedIn",
    "whatsapp":         "WhatsApp",
    "avaliacao_nota":   "Avaliação",
    "avaliacao_total":  "Total de Avaliações",
    "categoria":        "Categoria",
    "horario":          "Horário de Funcionamento",
    "latitude":         "Latitude",
    "longitude":        "Longitude",
    "plus_code":        "Plus Code",          # Perf 1
    "maps_url":         "Link Google Maps",   # Perf 1
    "status_contato":   "Status de Contato",  # Feature 1
    "notas":            "Notas",              # Feature 1
}

# Campos que contêm URLs e devem virar hiperlinks no Excel
CAMPOS_URL = {"site", "instagram", "facebook", "linkedin", "whatsapp", "maps_url"}

def _formatar_telefone(tel_str: str) -> str:
    """Extrai dígitos e garante que contém o código do país do Brasil (55) se for um DD local."""
    if not tel_str or tel_str == "Não disponível":
        return tel_str
    digitos = "".join(c for c in tel_str if c.isdigit())
    if not digitos:
        return tel_str
    if len(digitos) in [10, 11] and not digitos.startswith("55"):
        return f"55{digitos}"
    return digitos


def _remover_acentos(texto: str) -> str:
    """
    Exporter 3: Normaliza unicode e remove acentos/diacríticos.
    Exemplo: "Belo Horizonte" → "Belo Horizonte" (sem acentos na saída)
    """
    normalizado = unicodedata.normalize('NFD', texto)
    return ''.join(c for c in normalizado if unicodedata.category(c) != 'Mn')


def _preparar_dataframe(leads: list[dict], cidade_str: str, campos_selecionados: Optional[list[str]] = None) -> pd.DataFrame:
    """
    Converte a lista de leads em um DataFrame pandas.
    Filtra apenas os campos solicitados e renomeia colunas para português.
    Injeta heuristicas e reordena as colunas primárias.
    """
    if not leads:
        return pd.DataFrame()

    if not campos_selecionados:
        campos_selecionados = list(CABECALHOS_PTBR.keys())

    # Garante as colunas prioritárias nas 4 primeiras posições, APENAS se elas estiverem habilitadas/ativas
    colunas_prioritarias = ["nome", "telefone", "perfil", "cidade_busca"]
    
    # A prioridade real que aparece depende de estarem na seleção ativa
    prios_ativas = [c for c in colunas_prioritarias if c in campos_selecionados]
    resto_colunas = [c for c in campos_selecionados if c not in colunas_prioritarias]

    campos_ordenados = prios_ativas + resto_colunas

    registros = []
    for lead in leads:
        registro = {}
        
        # ─── Heuristica Híbrida de Perfil Avançada ───
        nome = lead.get("nome", "").lower()
        site = lead.get("site", "")
        
        # Tenta extrair a quantidade de avaliações de forma segura
        try:
            avaliacoes = int(lead.get("avaliacao_total", 0) or 0)
        except (ValueError, TypeError):
            avaliacoes = 0
            
        is_empresa = False
        is_autonomo_forcado = False
        
        # 1. Identificadores FORTES de Pessoa Física/Apelidos informais
        palavras_informais = [
            " do z", " da m", " do j", " sr ", " tio ", " dona ", " menino ", " gordo", 
            " careca", " irmao ", " seu "
        ]
        if any(kw in nome for kw in palavras_informais):
            is_autonomo_forcado = True
            
        if not is_autonomo_forcado:
            # 2. Métricas oficiais corporativas: Site ou Volume de clientes (>50 avaliações)
            if site and site != "Não disponível" and site != "":
                is_empresa = True
            elif avaliacoes >= 50:
                is_empresa = True
            else:
                # 3. Vocabulário Corporativo / Termos Premium do nicho automotivo
                palavras_empresa = [
                    "ltda", "estética", "estetica", "center", "premium", "auto", "car", 
                    "detail", "lavagem", "estacionamento", "oficina", "motors", "posto", 
                    "garage", "company", "serviço", "servico", "grupo", "ducha", "spa", "wash"
                ]
                if any(kw in nome for kw in palavras_empresa):
                    is_empresa = True

        perfil = "Empresa" if is_empresa else "Autônomo"

        lead_processado = {**lead}
        lead_processado["cidade_busca"] = cidade_str.replace("\n", " | ")
        lead_processado["perfil"] = perfil
        
        if lead_processado.get("telefone"):
            lead_processado["telefone"] = _formatar_telefone(str(lead_processado["telefone"]))
            
        for campo in campos_ordenados:
            if campo in CABECALHOS_PTBR:
                registro[CABECALHOS_PTBR[campo]] = lead_processado.get(campo, "") or ""
        registros.append(registro)

    return pd.DataFrame(registros)


def _gerar_nome_arquivo(tipo: str, cidade: str, extensao: str) -> str:
    """
    Gera um nome de arquivo seguro com tipo, cidade e timestamp.
    - Remove acentos (Exporter 3)
    - Remove TODOS os caracteres inválidos no Windows (incluindo | < > : " / \ ? *)
    - Trunca a 50 chars para evitar paths muito longos
    """
    # Caracteres inválidos no Windows para nomes de arquivo
    INVALIDOS_WINDOWS = set('\\/:*?"<>|')

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    tipo_sem_acento   = _remover_acentos(tipo)
    cidade_sem_acento = _remover_acentos(cidade)

    def _limpar(texto: str) -> str:
        # Remove caracteres inválidos do Windows e normaliza
        limpo = "".join(
            c if (c.isalnum() or c in " -_") and c not in INVALIDOS_WINDOWS else "_"
            for c in texto
        ).strip()
        # Colapsa múltiplos underscores/espaços consecutivos
        limpo = re.sub(r'[_\s]+', '_', limpo).strip('_')
        return limpo

    tipo_limpo   = _limpar(tipo_sem_acento)[:30]   # Máx 30 chars para o tipo
    cidade_limpa = _limpar(cidade_sem_acento)[:30]  # Máx 30 chars para a cidade

    return f"leads_{tipo_limpo}_{cidade_limpa}_{timestamp}.{extensao}"


def _nota_para_estrelas(nota_str: str) -> str:
    """Converte nota numérica (ex: '4.2') em representação de estrelas unicode."""
    try:
        nota = float(nota_str)
        cheias = int(nota)
        meia   = 1 if (nota - cheias) >= 0.5 else 0
        vazias = 5 - cheias - meia
        return "★" * cheias + ("½" if meia else "") + "☆" * vazias
    except (ValueError, TypeError):
        return nota_str or ""


# ─────────────────────────────────────────────
# EXPORTAÇÃO CSV
# ─────────────────────────────────────────────

def exportar_csv(
    leads: list[dict],
    tipo: str,
    cidade: str,
    campos_selecionados: Optional[list[str]] = None,
) -> dict:
    """
    Gera um arquivo CSV com os leads fornecidos.

    Returns:
        dict com 'sucesso', 'filename', 'filepath', 'total' e 'erro' (se houver)
    """
    try:
        if not leads:
            return {"sucesso": False, "erro": "Nenhum lead para exportar"}

        df = _preparar_dataframe(leads, cidade, campos_selecionados)
        nome_arquivo = _gerar_nome_arquivo(tipo, cidade, "csv")
        caminho = EXPORTS_DIR / nome_arquivo

        # UTF-8 BOM para abrir corretamente no Excel brasileiro
        df.to_csv(caminho, index=False, encoding="utf-8-sig", sep=",")

        return {
            "sucesso":  True,
            "filename": nome_arquivo,
            "filepath": str(caminho),
            "total":    len(df),
        }

    except Exception as e:
        return {"sucesso": False, "erro": str(e)}


# ─────────────────────────────────────────────
# EXPORTAÇÃO EXCEL PROFISSIONAL (Feature 3)
# ─────────────────────────────────────────────

def exportar_excel(
    leads: list[dict],
    tipo: str,
    cidade: str,
    campos_selecionados: Optional[list[str]] = None,
) -> dict:
    """
    Gera um arquivo Excel (.xlsx) com formatação profissional usando openpyxl.

    Formatação aplicada:
    - Cabeçalhos em negrito, fundo azul LeadHunter (#2563EB), texto branco
    - Linhas alternadas em cinza clarinho (#F8F9FA)
    - Largura de colunas ajustada automaticamente (máximo 50 chars)
    - Coluna de avaliação com estrelas unicode (★★★★☆)
    - Links de site/instagram/facebook como hiperlinks clicáveis
    - Aba nomeada com tipo + cidade + data
    - Linha de total no rodapé em negrito
    """
    try:
        from openpyxl import Workbook
        from openpyxl.styles import (
            Font, Fill, PatternFill, Alignment, Border, Side, GradientFill
        )
        from openpyxl.utils import get_column_letter
        from openpyxl.styles.numbers import FORMAT_NUMBER

        if not leads:
            return {"sucesso": False, "erro": "Nenhum lead para exportar"}

        # ─── PREPARAÇÃO DOS DADOS ───
        df = _preparar_dataframe(leads, cidade, campos_selecionados)

        nome_arquivo = _gerar_nome_arquivo(tipo, cidade, "xlsx")
        caminho = EXPORTS_DIR / nome_arquivo
        data_hoje = datetime.now().strftime("%d/%m/%Y")

        wb = Workbook()
        ws = wb.active

        # Nome da aba: tipo + cidade + data (Feature 3)
        nome_aba_raw = f"{tipo[:15]} - {cidade[:15]} - {datetime.now().strftime('%d-%m')}"
        ws.title = _remover_acentos(nome_aba_raw)[:30]

        # ─── ESTILOS ───
        # Azul LeadHunter
        azul_header = "2563EB"
        cinza_linha_par = "F8F9FA"
        cinza_linha_impar = "FFFFFF"
        cinza_rodape = "E5E7EB"

        fill_header    = PatternFill("solid", fgColor=azul_header)
        fill_linha_par = PatternFill("solid", fgColor=cinza_linha_par)
        fill_rodape    = PatternFill("solid", fgColor=cinza_rodape)

        font_header  = Font(bold=True, color="FFFFFF", name="Calibri", size=11)
        font_normal  = Font(name="Calibri", size=10)
        font_link    = Font(name="Calibri", size=10, color="2563EB", underline="single")
        font_rodape  = Font(bold=True, name="Calibri", size=10)

        align_center = Alignment(horizontal="center", vertical="center", wrap_text=False)
        align_esq    = Alignment(horizontal="left",   vertical="center", wrap_text=False)

        borda_fina = Border(
            left=Side(style="thin", color="E5E7EB"),
            right=Side(style="thin", color="E5E7EB"),
            bottom=Side(style="thin", color="E5E7EB"),
        )

        # ─── CABEÇALHOS ───
        cabecalhos = list(df.columns)
        ws.row_dimensions[1].height = 28

        for col_idx, cab in enumerate(cabecalhos, start=1):
            cel = ws.cell(row=1, column=col_idx, value=cab)
            cel.fill      = fill_header
            cel.font      = font_header
            cel.alignment = align_center
            cel.border    = borda_fina

        # Colunas que precisam virar hiperlink no Excel
        map_urls = {"Site", "Instagram", "Facebook", "LinkedIn", "WhatsApp", "Link Google Maps"}

        # ─── DADOS ───
        for row_idx, row_series in enumerate(df.itertuples(index=False), start=2):
            fill_linha = fill_linha_par if row_idx % 2 == 0 else PatternFill("solid", fgColor=cinza_linha_impar)
            ws.row_dimensions[row_idx].height = 20

            for col_idx, cabecalho in enumerate(cabecalhos, start=1):
                valor = str(row_series[col_idx - 1])
                if valor == "nan" or valor == "None" or not valor:
                    valor = ""

                # Estrelas para avaliação
                if cabecalho == "Avaliação" and valor:
                    valor_exibido = _nota_para_estrelas(valor)
                else:
                    valor_exibido = valor

                cel = ws.cell(row=row_idx, column=col_idx, value=valor_exibido)
                cel.fill      = fill_linha
                cel.alignment = align_esq
                cel.border    = borda_fina

                # Hiperlinks para campos de URL
                if cabecalho in map_urls and valor.startswith("http"):
                    cel.value     = valor
                    cel.hyperlink = valor
                    cel.font      = font_link
                else:
                    cel.font = font_normal

        # ─── LINHA DE TOTAL NO RODAPÉ ───
        linha_total = len(df) + 2
        ws.row_dimensions[linha_total].height = 22

        cel_total = ws.cell(row=linha_total, column=1, value=f"Total: {len(df)} leads")
        cel_total.fill      = fill_rodape
        cel_total.font      = font_rodape
        cel_total.alignment = align_esq
        cel_total.border    = borda_fina

        # Preenche o restante da linha de rodapé com fundo cinza
        for col_idx in range(2, len(cabecalhos) + 1):
            cel = ws.cell(row=linha_total, column=col_idx, value="")
            cel.fill   = fill_rodape
            cel.border = borda_fina

        # ─── LARGURA DAS COLUNAS (ajuste automático) ───
        for col_idx, cabecalho in enumerate(cabecalhos, start=1):
            col_letra = get_column_letter(col_idx)
            # Calcula largura máxima entre cabeçalho e dados da coluna
            col_dados = df[cabecalho].astype(str)
            max_dado_len = col_dados.map(len).max() if not df.empty else 0
            max_len = max(len(cabecalho), max_dado_len)
            
            # Limita a 50 caracteres e adiciona padding
            ws.column_dimensions[col_letra].width = min(max_len + 3, 50)

        # Congela a linha do cabeçalho
        ws.freeze_panes = "A2"

        # Filtros automáticos no cabeçalho
        ws.auto_filter.ref = f"A1:{get_column_letter(len(cabecalhos))}1"

        wb.save(caminho)

        return {
            "sucesso":  True,
            "filename": nome_arquivo,
            "filepath": str(caminho),
            "total":    len(leads),
        }

    except ImportError:
        return {"sucesso": False, "erro": "Biblioteca openpyxl não instalada. Execute: pip install openpyxl"}
    except Exception as e:
        return {"sucesso": False, "erro": str(e)}


# ─────────────────────────────────────────────
# EXPORTAÇÃO GOOGLE SHEETS
# ─────────────────────────────────────────────

def verificar_credenciais_google() -> dict:
    """
    Verifica se o arquivo credentials.json existe na pasta /credentials/.
    Retorna status com instruções se não existir.
    """
    cred_file  = CREDENTIALS_DIR / "credentials.json"
    token_file = CREDENTIALS_DIR / "token.json"

    return {
        "credentials_existe": cred_file.exists(),
        "token_existe":       token_file.exists(),
        "credentials_path":   str(cred_file),
        "instrucoes":         _instrucoes_setup_google() if not cred_file.exists() else None,
    }


def _instrucoes_setup_google() -> str:
    """Retorna instruções passo a passo para configurar credenciais do Google."""
    return """
Para exportar para Google Sheets, siga estes passos:

1. Acesse: https://console.cloud.google.com/
2. Crie um novo projeto (ou selecione um existente)
3. No menu lateral: APIs e Serviços → Biblioteca
4. Ative 'Google Sheets API' e 'Google Drive API'
5. Vá em: APIs e Serviços → Credenciais
6. Clique em '+ Criar Credenciais' → 'ID do cliente OAuth 2.0'
7. Tipo de aplicativo: 'App para computador'
8. Baixe o arquivo JSON e renomeie para 'credentials.json'
9. Coloque o arquivo na pasta 'credentials/' do LeadHunter
10. Na próxima exportação, uma janela abrirá para você autorizar o acesso
"""


def exportar_google_sheets(
    leads: list[dict],
    tipo: str,
    cidade: str,
    campos_selecionados: Optional[list[str]] = None,
    planilha_existente_id: Optional[str] = None,
) -> dict:
    """
    Exporta leads para uma planilha do Google Sheets com formatação profissional.

    Melhorias v2:
    - Exporter 1: autoResizeDimensions após inserção
    - Exporter 2: linha de total no rodapé com fórmulas COUNTA

    Returns:
        dict com 'sucesso', 'link', 'planilha_id', 'total' e 'erro' (se houver)
    """
    try:
        # Importação tardia para não quebrar se gspread não estiver instalado
        import gspread
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from google.auth.transport.requests import Request

        SCOPES = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.file",
        ]

        cred_file  = CREDENTIALS_DIR / "credentials.json"
        token_file = CREDENTIALS_DIR / "token.json"

        if not cred_file.exists():
            return {
                "sucesso": False,
                "erro": "Arquivo credentials.json não encontrado na pasta /credentials/",
                "instrucoes": _instrucoes_setup_google(),
            }

        # ─── AUTENTICAÇÃO ───
        import json as _json
        with open(cred_file, "r", encoding="utf-8") as f:
            cred_data = _json.load(f)

        if cred_data.get("type") == "service_account":
            gc = gspread.service_account(filename=str(cred_file), scopes=SCOPES)
        else:
            creds = None
            if token_file.exists():
                creds = Credentials.from_authorized_user_file(str(token_file), SCOPES)

            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    flow = InstalledAppFlow.from_client_secrets_file(str(cred_file), SCOPES)
                    creds = flow.run_local_server(port=0)

                with open(token_file, "w") as f:
                    f.write(creds.to_json())

            gc = gspread.authorize(creds)

        # ─── PLANILHA ───
        data_atual = datetime.now().strftime("%d/%m/%Y")
        nome_planilha = f"LeadHunter — {tipo} {cidade} {data_atual}"

        if planilha_existente_id:
            planilha = gc.open_by_key(planilha_existente_id)
            aba = planilha.add_worksheet(
                title=f"Busca {data_atual}",
                rows=len(leads) + 10,
                cols=25
            )
        else:
            planilha = gc.create(nome_planilha)
            planilha.share(None, perm_type="anyone", role="reader")
            aba = planilha.get_worksheet(0)
            aba.update_title(f"Leads {data_atual}")

        # ─── DADOS ───
        df = _preparar_dataframe(leads, cidade, campos_selecionados)
        if df.empty:
            return {"sucesso": False, "erro": "Nenhum dado para exportar"}

        cabecalhos = list(df.columns)
        n_linhas   = len(df)
        n_cols     = len(cabecalhos)

        # Linha 1: cabeçalhos; linhas 2..N+1: dados; linha N+2: total
        valores = [cabecalhos] + df.values.tolist()
        aba.update(values=valores, range_name="A1")

        # ─── LINHA DE TOTAL (Exporter 2) ───
        n_data = n_linhas + 1  # índice da última linha de dados (1-based é n_linhas + 1)
        linha_total_idx = n_linhas + 2

        # Identifica as colunas de telefone e email pelo cabeçalho
        col_telefone = cabecalhos.index("Telefone") + 1 if "Telefone" in cabecalhos else None
        col_email    = cabecalhos.index("E-mail")   + 1 if "E-mail" in cabecalhos else None

        rodape = [""] * n_cols
        rodape[0] = f"Total: {n_linhas} leads"
        if col_telefone and col_telefone <= n_cols:
            from openpyxl.utils import get_column_letter as gcl
            col_letra_tel = chr(64 + col_telefone)  # A=65, B=66...
            rodape[col_telefone - 1] = f"=COUNTA({col_letra_tel}2:{col_letra_tel}{n_data})"
        if col_email and col_email <= n_cols:
            col_letra_email = chr(64 + col_email)
            rodape[col_email - 1] = f"=COUNTA({col_letra_email}2:{col_letra_email}{n_data})"

        aba.append_row(rodape)

        # ─── FORMATAÇÃO DO CABEÇALHO ───
        ultima_col_letra = chr(64 + n_cols) if n_cols <= 26 else "Z"
        aba.format(
            f"A1:{ultima_col_letra}1",
            {
                "backgroundColor": {"red": 0.145, "green": 0.388, "blue": 0.922},  # #2563EB
                "textFormat": {"bold": True, "foregroundColor": {"red": 1, "green": 1, "blue": 1}},
                "horizontalAlignment": "CENTER",
            },
        )

        # Negrito na linha de total
        aba.format(
            f"A{linha_total_idx}:{ultima_col_letra}{linha_total_idx}",
            {"textFormat": {"bold": True}},
        )

        # ─── AUTO-RESIZE DAS COLUNAS (Exporter 1) ───
        planilha.batch_update({
            "requests": [{
                "autoResizeDimensions": {
                    "dimensions": {
                        "sheetId":     aba.id,
                        "dimension":   "COLUMNS",
                        "startIndex":  0,
                        "endIndex":    n_cols,
                    }
                }
            }]
        })

        link = f"https://docs.google.com/spreadsheets/d/{planilha.id}"
        webbrowser.open(link)

        return {
            "sucesso":      True,
            "link":         link,
            "planilha_id":  planilha.id,
            "total":        n_linhas,
        }

    except ImportError:
        return {
            "sucesso": False,
            "erro": "Biblioteca gspread não instalada. Execute: pip install gspread google-auth google-auth-oauthlib",
        }
    except Exception as e:
        return {"sucesso": False, "erro": str(e)}
