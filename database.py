"""
database.py — Camada de persistência local com SQLite.

Responsabilidades:
- Criar e manter as tabelas do banco de dados
- CRUD de buscas (searches) e leads
- Isolamento total: nenhum outro módulo acessa o SQLite diretamente

Tabelas:
    searches  → Registro de cada busca executada
    leads     → Leads coletados por busca

Changelog v2:
- Bug 4: incrementar_total_busca() consolidado dentro de salvar_lead() na mesma transação
- Perf 1: Novas colunas plus_code e maps_url
- Perf 6: Índice idx_leads_nome para acelerar buscas históricas
- Feature 1: Coluna status_contato com migração automática
- Feature 2: Coluna notas com migração automática
- Feature 4: Deduplicação automática — atualiza registro existente se houver dados novos
- Feature 5: Função obter_estatisticas() com métricas agregadas
- Feature 7: Função atualizar_lead() para PATCH de campos individuais
"""

import sqlite3
import json
from datetime import datetime
from pathlib import Path
from typing import Optional
from contextlib import contextmanager

from config import DATABASE_FILE


# ─────────────────────────────────────────────
# GERENCIADOR DE CONEXÃO
# ─────────────────────────────────────────────

@contextmanager
def get_conexao():
    """
    Context manager que abre e fecha a conexão com o banco automaticamente.
    Garante que a conexão seja sempre fechada, mesmo em caso de erro.
    """
    conn = sqlite3.connect(str(DATABASE_FILE))
    conn.row_factory = sqlite3.Row  # Permite acesso por nome de coluna
    conn.execute("PRAGMA journal_mode=WAL")   # Melhora performance com múltiplas escritas
    conn.execute("PRAGMA busy_timeout=5000")  # Aguarda até 5s se banco estiver bloqueado
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─────────────────────────────────────────────
# INICIALIZAÇÃO DO BANCO
# ─────────────────────────────────────────────

def inicializar_banco() -> None:
    """
    Cria as tabelas e índices se não existirem.
    Aplica migrações automáticas para colunas novas (ALTER TABLE seguro).
    Chamado uma única vez na inicialização do servidor.
    """
    with get_conexao() as conn:
        # Criação das tabelas base
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS searches (
                id          TEXT PRIMARY KEY,
                tipo        TEXT NOT NULL,
                cidade      TEXT NOT NULL,
                max_results INTEGER NOT NULL,
                total_found INTEGER DEFAULT 0,
                status      TEXT DEFAULT 'running',
                created_at  TEXT NOT NULL,
                finished_at TEXT
            );

            CREATE TABLE IF NOT EXISTS leads (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                search_id       TEXT NOT NULL,
                nome            TEXT DEFAULT '',
                endereco        TEXT DEFAULT '',
                telefone        TEXT DEFAULT '',
                email           TEXT DEFAULT '',
                site            TEXT DEFAULT '',
                instagram       TEXT DEFAULT '',
                facebook        TEXT DEFAULT '',
                linkedin        TEXT DEFAULT '',
                whatsapp        TEXT DEFAULT '',
                avaliacao_nota  TEXT DEFAULT '',
                avaliacao_total TEXT DEFAULT '',
                categoria       TEXT DEFAULT '',
                horario         TEXT DEFAULT '',
                latitude        TEXT DEFAULT '',
                longitude       TEXT DEFAULT '',
                custom_fields   TEXT DEFAULT '{}',
                created_at      TEXT NOT NULL,
                FOREIGN KEY (search_id) REFERENCES searches(id)
            );

            CREATE INDEX IF NOT EXISTS idx_leads_search_id ON leads(search_id);
        """)

        # ─── MIGRAÇÕES AUTOMÁTICAS ───
        # Verifica quais colunas já existem e adiciona as novas com segurança
        colunas_existentes = {
            row[1] for row in conn.execute("PRAGMA table_info(leads)").fetchall()
        }

        migracoes = [
            # (nome_coluna, definição SQL)
            ("status_contato", "TEXT DEFAULT 'Novo'"),   # Feature 1
            ("notas",          "TEXT DEFAULT ''"),        # Feature 2
            ("plus_code",      "TEXT DEFAULT ''"),        # Perf 1
            ("maps_url",       "TEXT DEFAULT ''"),        # Perf 1
        ]

        for nome_col, definicao in migracoes:
            if nome_col not in colunas_existentes:
                conn.execute(f"ALTER TABLE leads ADD COLUMN {nome_col} {definicao}")
                print(f"  ✅ Migração: coluna '{nome_col}' adicionada à tabela leads.")

        # ─── ÍNDICES ───
        conn.execute("CREATE INDEX IF NOT EXISTS idx_leads_nome ON leads(nome)")      # Perf 6
        conn.execute("CREATE INDEX IF NOT EXISTS idx_leads_telefone ON leads(telefone)")  # Feature 4


# ─────────────────────────────────────────────
# OPERAÇÕES DE BUSCA (searches)
# ─────────────────────────────────────────────

def criar_busca(search_id: str, tipo: str, cidade: str, max_results: int) -> dict:
    """Registra o início de uma nova busca no banco."""
    agora = datetime.utcnow().isoformat()
    with get_conexao() as conn:
        conn.execute(
            """INSERT INTO searches (id, tipo, cidade, max_results, status, created_at)
               VALUES (?, ?, ?, ?, 'running', ?)""",
            (search_id, tipo, cidade, max_results, agora),
        )
    return {"id": search_id, "tipo": tipo, "cidade": cidade,
            "max_results": max_results, "status": "running", "created_at": agora}


def atualizar_status_busca(search_id: str, status: str, total_found: int = 0) -> None:
    """Atualiza o status de uma busca (running / done / error / stopped)."""
    agora = datetime.utcnow().isoformat()
    with get_conexao() as conn:
        conn.execute(
            """UPDATE searches
               SET status = ?, total_found = ?, finished_at = ?
               WHERE id = ?""",
            (status, total_found, agora, search_id),
        )


def obter_busca(search_id: str) -> Optional[dict]:
    """Retorna os dados de uma busca pelo ID."""
    with get_conexao() as conn:
        row = conn.execute(
            "SELECT * FROM searches WHERE id = ?", (search_id,)
        ).fetchone()
    return dict(row) if row else None


def listar_historico(limit: int = 20) -> list[dict]:
    """Retorna as últimas N buscas, da mais recente para a mais antiga."""
    with get_conexao() as conn:
        rows = conn.execute(
            "SELECT * FROM searches ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def deletar_busca(search_id: str) -> bool:
    """Remove uma busca e todos os seus leads do banco."""
    with get_conexao() as conn:
        conn.execute("DELETE FROM leads WHERE search_id = ?", (search_id,))
        cursor = conn.execute("DELETE FROM searches WHERE id = ?", (search_id,))
    return cursor.rowcount > 0


# ─────────────────────────────────────────────
# OPERAÇÕES DE LEADS
# ─────────────────────────────────────────────

def salvar_lead(search_id: str, dados: dict) -> tuple[Optional[dict], str]:
    """
    Persiste um lead extraído no banco com deduplicação inteligente.

    Estratégia de deduplicação (Feature 4):
    - Se existe um lead com o mesmo telefone (não vazio), atualiza com dados novos.
    - Se existe um lead com mesmo nome+cidade similares, atualiza com dados novos.
    - "Atualizar" significa mesclar: só sobrescreve campos que antes estavam vazios
      OU que agora chegaram com mais informação.

    Returns:
        Tuple (lead_dict_ou_none, acao)
        Onde acao pode ser: 'criado', 'atualizado', 'duplicado_ignorado'
    """
    campos_conhecidos = {
        "nome", "endereco", "telefone", "email", "site",
        "instagram", "facebook", "linkedin", "whatsapp",
        "avaliacao_nota", "avaliacao_total", "categoria",
        "horario", "latitude", "longitude",
        "plus_code", "maps_url",
    }

    # Separa campos conhecidos de customizados
    campos_db = {k: str(v) for k, v in dados.items() if k in campos_conhecidos}
    campos_custom = {k: v for k, v in dados.items() if k not in campos_conhecidos}

    agora = datetime.utcnow().isoformat()

    with get_conexao() as conn:
        # ─── VERIFICAÇÃO DE DUPLICATA ───
        lead_existente = None

        # 1. Verifica por telefone (se não vazio)
        telefone = campos_db.get("telefone", "").strip()
        if telefone:
            row = conn.execute(
                "SELECT * FROM leads WHERE telefone = ? AND search_id = ?",
                (telefone, search_id)
            ).fetchone()
            if row:
                lead_existente = dict(row)

        # 2. Verifica por nome+endereco similares (se não encontrou por telefone)
        if not lead_existente:
            nome = campos_db.get("nome", "").strip().lower()
            endereco = campos_db.get("endereco", "").strip().lower()
            if nome:
                row = conn.execute(
                    """SELECT * FROM leads
                       WHERE lower(nome) = ? AND search_id = ?
                       LIMIT 1""",
                    (nome, search_id)
                ).fetchone()
                if row:
                    lead_existente = dict(row)

        if lead_existente:
            # ─── ATUALIZAÇÃO INTELIGENTE ───
            # Só atualiza campos que antes estavam vazios OU que agora têm mais info
            atualizacoes = {}
            for campo, valor_novo in campos_db.items():
                valor_atual = str(lead_existente.get(campo, "") or "").strip()
                valor_novo_strip = valor_novo.strip()
                # Atualiza se: anterior estava vazio E novo tem valor
                if not valor_atual and valor_novo_strip:
                    atualizacoes[campo] = valor_novo_strip
                # Atualiza também se o novo tem mais caracteres (mais completo)
                elif valor_novo_strip and len(valor_novo_strip) > len(valor_atual):
                    atualizacoes[campo] = valor_novo_strip

            # Mescla custom_fields
            try:
                custom_antigo = json.loads(lead_existente.get("custom_fields", "{}") or "{}")
            except (json.JSONDecodeError, TypeError):
                custom_antigo = {}
            custom_mesclado = {**custom_antigo, **campos_custom}  # novo sobrescreve antigo
            atualizacoes["custom_fields"] = json.dumps(custom_mesclado, ensure_ascii=False)

            if atualizacoes:
                set_clause = ", ".join(f"{k} = ?" for k in atualizacoes)
                valores = list(atualizacoes.values()) + [lead_existente["id"]]
                conn.execute(f"UPDATE leads SET {set_clause} WHERE id = ?", valores)

                # Também atualiza o contador da busca
                conn.execute(
                    "UPDATE searches SET total_found = total_found + 1 WHERE id = ?",
                    (search_id,)
                )

                # Retorna o lead atualizado
                lead_atualizado = dict(lead_existente)
                lead_atualizado.update(atualizacoes)
                try:
                    lead_atualizado["custom_fields"] = json.loads(atualizacoes["custom_fields"])
                except Exception:
                    lead_atualizado["custom_fields"] = {}
                return lead_atualizado, "atualizado"
            else:
                # Existe mas não tem nada novo para atualizar
                return None, "duplicado_ignorado"

        # ─── INSERÇÃO DE NOVO LEAD ───
        cursor = conn.execute(
            """INSERT INTO leads
               (search_id, nome, endereco, telefone, email, site,
                instagram, facebook, linkedin, whatsapp,
                avaliacao_nota, avaliacao_total, categoria,
                horario, latitude, longitude,
                plus_code, maps_url,
                status_contato, notas,
                custom_fields, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Novo', '', ?, ?)""",
            (
                search_id,
                campos_db.get("nome", ""),
                campos_db.get("endereco", ""),
                campos_db.get("telefone", ""),
                campos_db.get("email", ""),
                campos_db.get("site", ""),
                campos_db.get("instagram", ""),
                campos_db.get("facebook", ""),
                campos_db.get("linkedin", ""),
                campos_db.get("whatsapp", ""),
                campos_db.get("avaliacao_nota", ""),
                campos_db.get("avaliacao_total", ""),
                campos_db.get("categoria", ""),
                campos_db.get("horario", ""),
                campos_db.get("latitude", ""),
                campos_db.get("longitude", ""),
                campos_db.get("plus_code", ""),
                campos_db.get("maps_url", ""),
                json.dumps(campos_custom, ensure_ascii=False),
                agora,
            ),
        )
        lead_id = cursor.lastrowid

        # Bug 4: incrementa o contador na MESMA transação (evita race condition)
        conn.execute(
            "UPDATE searches SET total_found = total_found + 1 WHERE id = ?",
            (search_id,)
        )

    return {
        "id": lead_id,
        "search_id": search_id,
        **campos_db,
        "status_contato": "Novo",
        "notas": "",
        "custom_fields": campos_custom,
        "created_at": agora,
    }, "criado"


def listar_leads(search_id: str) -> list[dict]:
    """Retorna todos os leads de uma busca específica."""
    with get_conexao() as conn:
        rows = conn.execute(
            "SELECT * FROM leads WHERE search_id = ? ORDER BY id ASC",
            (search_id,),
        ).fetchall()

    resultado = []
    for row in rows:
        lead = dict(row)
        # Desserializa custom_fields de JSON para dict
        try:
            lead["custom_fields"] = json.loads(lead.get("custom_fields", "{}"))
        except (json.JSONDecodeError, TypeError):
            lead["custom_fields"] = {}
        resultado.append(lead)

    return resultado


def atualizar_lead(lead_id: int, campos: dict) -> Optional[dict]:
    """
    Atualiza campos individuais de um lead existente (Feature 7).
    Apenas campos da lista permitida podem ser alterados para segurança.

    Returns:
        dict do lead atualizado, ou None se não encontrado.
    """
    campos_permitidos = {"status_contato", "notas", "custom_fields"}
    campos_validos = {k: v for k, v in campos.items() if k in campos_permitidos}

    if not campos_validos:
        return None

    # Serializa custom_fields se for dict
    if "custom_fields" in campos_validos and isinstance(campos_validos["custom_fields"], dict):
        campos_validos["custom_fields"] = json.dumps(campos_validos["custom_fields"], ensure_ascii=False)

    with get_conexao() as conn:
        set_clause = ", ".join(f"{k} = ?" for k in campos_validos)
        valores = list(campos_validos.values()) + [lead_id]
        cursor = conn.execute(
            f"UPDATE leads SET {set_clause} WHERE id = ?",
            valores
        )
        if cursor.rowcount == 0:
            return None

        row = conn.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()

    if not row:
        return None

    lead = dict(row)
    try:
        lead["custom_fields"] = json.loads(lead.get("custom_fields", "{}"))
    except (json.JSONDecodeError, TypeError):
        lead["custom_fields"] = {}
    return lead


# ─────────────────────────────────────────────
# ESTATÍSTICAS (Feature 5)
# ─────────────────────────────────────────────

def obter_estatisticas() -> dict:
    """
    Retorna métricas agregadas sobre todas as buscas e leads.

    Returns:
        dict com total_buscas, total_leads, top_cidades, top_tipos,
        taxa_email e taxa_redes_sociais.
    """
    with get_conexao() as conn:
        # Totais gerais
        total_buscas = conn.execute("SELECT COUNT(*) FROM searches").fetchone()[0]
        total_leads  = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]

        # Top 5 cidades mais buscadas
        top_cidades = conn.execute("""
            SELECT cidade, COUNT(*) as total
            FROM searches
            GROUP BY lower(cidade)
            ORDER BY total DESC
            LIMIT 5
        """).fetchall()

        # Top 5 tipos mais buscados
        top_tipos = conn.execute("""
            SELECT tipo, COUNT(*) as total
            FROM searches
            GROUP BY lower(tipo)
            ORDER BY total DESC
            LIMIT 5
        """).fetchall()

        # Leads com email preenchido
        leads_com_email = conn.execute(
            "SELECT COUNT(*) FROM leads WHERE email != ''"
        ).fetchone()[0]

        # Leads com alguma rede social
        leads_com_social = conn.execute(
            """SELECT COUNT(*) FROM leads
               WHERE instagram != '' OR facebook != '' OR linkedin != '' OR whatsapp != ''"""
        ).fetchone()[0]

    taxa_email  = round((leads_com_email  / total_leads * 100), 1) if total_leads > 0 else 0
    taxa_social = round((leads_com_social / total_leads * 100), 1) if total_leads > 0 else 0

    return {
        "total_buscas":      total_buscas,
        "total_leads":       total_leads,
        "top_cidades":       [{"cidade": r[0], "total": r[1]} for r in top_cidades],
        "top_tipos":         [{"tipo": r[0], "total": r[1]} for r in top_tipos],
        "taxa_email":        taxa_email,
        "taxa_redes_sociais": taxa_social,
    }
