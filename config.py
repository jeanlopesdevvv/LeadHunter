"""
config.py — Configurações globais e persistência de preferências do LeadHunter.

Este módulo é o ponto central de configuração da aplicação. Ele:
- Define os campos padrão de extração de leads
- Lê e grava as preferências do usuário em um arquivo JSON local
- Fornece constantes usadas pelos demais módulos
"""

import json
import os
from pathlib import Path
from typing import Any

# ─────────────────────────────────────────────
# CAMINHOS BASE
# ─────────────────────────────────────────────

BASE_DIR = Path(__file__).parent
CREDENTIALS_DIR = BASE_DIR / "credentials"
EXPORTS_DIR = BASE_DIR / "exports"
FRONTEND_DIR = BASE_DIR / "frontend"
CONFIG_FILE = BASE_DIR / "leadhunter_config.json"
DATABASE_FILE = BASE_DIR / "leadhunter.db"
ERROR_LOG = EXPORTS_DIR / "errors.log"

# Garante que as pastas existam
CREDENTIALS_DIR.mkdir(exist_ok=True)
EXPORTS_DIR.mkdir(exist_ok=True)

# ─────────────────────────────────────────────
# CAMPOS PADRÃO DE EXTRAÇÃO
# Cada campo tem: id, label (português), tipo, habilitado, ordem
# ─────────────────────────────────────────────

CAMPOS_PADRAO = [
    {"id": "nome",              "label": "Nome da Empresa",     "tipo": "texto",  "habilitado": True,  "ordem": 1},
    {"id": "telefone",          "label": "Telefone",            "tipo": "texto",  "habilitado": True,  "ordem": 2},
    {"id": "perfil",            "label": "Perfil (Empresa)",    "tipo": "texto",  "habilitado": True,  "ordem": 3},
    {"id": "cidade_busca",      "label": "Cidade da Busca",     "tipo": "texto",  "habilitado": True,  "ordem": 4},
    {"id": "endereco",          "label": "Endereço",            "tipo": "texto",  "habilitado": True,  "ordem": 5},
    {"id": "email",             "label": "E-mail",              "tipo": "texto",  "habilitado": True,  "ordem": 6},
    {"id": "site",              "label": "Site",                "tipo": "link",   "habilitado": True,  "ordem": 7},
    {"id": "instagram",         "label": "Instagram",           "tipo": "link",   "habilitado": True,  "ordem": 8},
    {"id": "facebook",          "label": "Facebook",            "tipo": "link",   "habilitado": True,  "ordem": 9},
    {"id": "linkedin",          "label": "LinkedIn",            "tipo": "link",   "habilitado": False, "ordem": 10},
    {"id": "whatsapp",          "label": "WhatsApp",            "tipo": "link",   "habilitado": True,  "ordem": 11},
    {"id": "avaliacao_nota",    "label": "Nota",                "tipo": "numero", "habilitado": True,  "ordem": 12},
    {"id": "avaliacao_total",   "label": "Qtd. Avaliações",     "tipo": "numero", "habilitado": True,  "ordem": 13},
    {"id": "categoria",         "label": "Categoria",           "tipo": "texto",  "habilitado": True,  "ordem": 14},
    {"id": "horario",           "label": "Horário",             "tipo": "texto",  "habilitado": False, "ordem": 15},
    {"id": "latitude",          "label": "Latitude",            "tipo": "numero", "habilitado": False, "ordem": 16},
    {"id": "longitude",         "label": "Longitude",           "tipo": "numero", "habilitado": False, "ordem": 17},
]

# ─────────────────────────────────────────────
# CONFIGURAÇÃO PADRÃO COMPLETA
# ─────────────────────────────────────────────

CONFIG_PADRAO: dict[str, Any] = {
    # Campos de extração (pode ser sobrescrito pelo usuário)
    "campos": CAMPOS_PADRAO,

    # Campos customizados criados pelo usuário
    "campos_customizados": [],

    # Comportamento do scraper
    "delay_min_segundos": 0.2,
    "delay_max_segundos": 0.8,
    "timeout_por_lead_segundos": 10,
    "modo_headless": True,           # False = janela visível (debug)
    "visitar_site_do_lead": True,    # False = não extrai email/redes sociais

    # Interface
    "tema": "escuro",                # "claro" ou "escuro"
    "max_resultados_padrao": 50,

    # Exportação
    "ultimo_diretorio_export": str(EXPORTS_DIR),
}

# ─────────────────────────────────────────────
# FUNÇÕES DE LEITURA E GRAVAÇÃO
# ─────────────────────────────────────────────

def carregar_config() -> dict[str, Any]:
    """
    Carrega as configurações do arquivo JSON local.
    Se o arquivo não existir, cria com os valores padrão.

    A mesclagem de campos é inteligente: preserva label/tipo/ordem do CAMPOS_PADRAO
    enquanto respeita o estado habilitado/desabilitado salvo pelo usuário.
    Isso evita que campos salvos com apenas {id, habilitado} corrompam o exporter.
    """
    if not CONFIG_FILE.exists():
        salvar_config(CONFIG_PADRAO)
        return CONFIG_PADRAO.copy()

    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            config_salva = json.load(f)

        # Mesclagem segura para campos escalares (delay, tema, etc.)
        config_final = CONFIG_PADRAO.copy()
        config_final.update({k: v for k, v in config_salva.items() if k not in ("campos", "campos_customizados")})

        # ─── MESCLAGEM INTELIGENTE DE CAMPOS ───
        # Se o usuário salvou campos com apenas {id, habilitado}, reconstrói
        # com os dados completos do CAMPOS_PADRAO (label, tipo, ordem)
        campos_padrao_map = {c["id"]: c for c in CAMPOS_PADRAO}
        campos_salvos = config_salva.get("campos", [])

        campos_mesclados = []
        salvos_processados = set()

        for campo_salvo in campos_salvos:
            campo_id = campo_salvo.get("id", "")
            if campo_id in campos_padrao_map:
                # Campo existe no padrão: usa o padrão como base e aplica só habilitado
                campo_completo = campos_padrao_map[campo_id].copy()
                campo_completo["habilitado"] = campo_salvo.get("habilitado", campo_completo["habilitado"])
                campos_mesclados.append(campo_completo)
            else:
                # Campo customizado: mantém como está (pode ter label próprio)
                campos_mesclados.append(campo_salvo)
            salvos_processados.add(campo_id)

        # Garante que novos campos adicionados recentemente no CAMPOS_PADRAO sejam incluídos
        for campo_padrao in CAMPOS_PADRAO:
            if campo_padrao["id"] not in salvos_processados:
                campos_mesclados.append(campo_padrao.copy())

        # Ordena pela chave "ordem"
        campos_mesclados.sort(key=lambda c: c.get("ordem", 999))

        # Se nenhum campo foi salvo anteriormente (vazio), já está usando o mesclado agora completo
        config_final["campos"] = campos_mesclados if campos_mesclados else CAMPOS_PADRAO

        # Campos customizados (mantém como lista bruta)
        config_final["campos_customizados"] = config_salva.get("campos_customizados", [])

        return config_final

    except (json.JSONDecodeError, OSError) as e:
        print(f"[AVISO] Erro ao ler config: {e}. Usando padrão.")
        return CONFIG_PADRAO.copy()


def salvar_config(config: dict[str, Any]) -> None:
    """
    Persiste as configurações no arquivo JSON local.
    """
    try:
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
    except OSError as e:
        print(f"[ERRO] Não foi possível salvar configurações: {e}")


def restaurar_config_padrao() -> dict[str, Any]:
    """
    Reseta o arquivo de configuração para os valores de fábrica.
    """
    salvar_config(CONFIG_PADRAO)
    return CONFIG_PADRAO.copy()


def obter_campos_habilitados() -> list[dict]:
    """
    Retorna apenas os campos que estão habilitados, ordenados.
    """
    config = carregar_config()
    todos_campos = config.get("campos", []) + config.get("campos_customizados", [])
    return sorted(
        [c for c in todos_campos if c.get("habilitado", False)],
        key=lambda c: c.get("ordem", 999),
    )
