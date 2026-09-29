"""
main.py — Servidor FastAPI do LeadHunter.

Serve tanto o frontend (HTML/CSS/JS) quanto a API REST + Server-Sent Events (SSE).
Todos os endpoints são documentados automaticamente em /docs (Swagger UI).

Arquitetura de fluxo de dados:
    Frontend → POST /api/search → cria busca no banco → retorna search_id
    Frontend → GET /api/search/{id}/stream → SSE: recebe leads em tempo real
    Scraper  → on_lead callback → salva no banco + envia via SSE

Changelog v2:
- Bug 2:    media_type correto por extensão no /api/download (csv vs xlsx)
- Perf 8:   GZipMiddleware para compressão das respostas JSON grandes
- UX 7:     Endpoint GET / injeta tema inline no HTML para evitar flash
- Feature 4: Evento SSE "duplicado" quando salvar_lead retorna None
- Feature 5: Endpoint GET /api/stats
- Feature 7: Endpoint PATCH /api/leads/{id}
- UX 10:    BuscaRequest aceita múltiplas cidades (uma por linha)
- Feature 6: Campo modo_rapido no BuscaRequest e na config
"""

import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

import json
import uuid
from pathlib import Path
from typing import AsyncGenerator, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware  # Perf 8
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database
import scraper as scraper_module
import exporter
from config import (
    EXPORTS_DIR, FRONTEND_DIR,
    carregar_config, salvar_config, restaurar_config_padrao
)


# ─────────────────────────────────────────────
# INICIALIZAÇÃO
# ─────────────────────────────────────────────

app = FastAPI(
    title="LeadHunter API",
    description="API de prospecção de leads via Google Maps",
    version="2.0.0",
)

# Permite requisições do frontend local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Perf 8: Compressão gzip automática para respostas JSON grandes
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Inicializa banco de dados na partida do servidor
@app.on_event("startup")
async def startup():
    database.inicializar_banco()
    print("\n" + "="*50)
    print("  🎯 LeadHunter v2 está rodando!")
    print("  🌐 Acesse: http://localhost:8000")
    print("="*50 + "\n")


# ─────────────────────────────────────────────
# FILA SSE: Armazena eventos por search_id
# Cada busca ativa tem sua própria fila assíncrona
# ─────────────────────────────────────────────

_sse_queues: dict[str, asyncio.Queue] = {}


def _get_queue(search_id: str) -> asyncio.Queue:
    if search_id not in _sse_queues:
        _sse_queues[search_id] = asyncio.Queue(maxsize=500)
    return _sse_queues[search_id]


def _limpar_queue(search_id: str) -> None:
    _sse_queues.pop(search_id, None)


async def _publicar_evento(search_id: str, tipo: str, dados: dict) -> None:
    """Publica um evento na fila SSE de uma busca."""
    queue = _get_queue(search_id)
    try:
        await queue.put({"tipo": tipo, "dados": dados})
    except asyncio.QueueFull:
        pass  # Se a fila estiver cheia, descarta o evento (não trava)


# ─────────────────────────────────────────────
# MODELOS DE REQUEST (Pydantic)
# ─────────────────────────────────────────────

class BuscaRequest(BaseModel):
    tipo: str          # Pode conter múltiplos tipos separados por \n
    cidade: str        # Pode conter múltiplas cidades separadas por \n (UX 10)
    max_results: int = 50
    modo_rapido: bool = False  # Feature 6: ignora visita ao site


class ExportCsvRequest(BaseModel):
    search_id: Optional[str] = None
    tipo: str
    cidade: str
    campos: Optional[list[str]] = None
    lead_ids: Optional[list[int]] = None  # None = exportar todos


class ExportSheetsRequest(BaseModel):
    search_id: Optional[str] = None
    tipo: str
    cidade: str
    campos: Optional[list[str]] = None
    lead_ids: Optional[list[int]] = None
    planilha_existente_id: Optional[str] = None


class CamposConfigRequest(BaseModel):
    campos: list[dict]
    campos_customizados: Optional[list[dict]] = []


class AtualizarLeadRequest(BaseModel):
    """Campos permitidos para atualização via PATCH (Feature 7)."""
    status_contato: Optional[str] = None
    notas: Optional[str] = None
    custom_fields: Optional[dict] = None


# ─────────────────────────────────────────────
# FRONTEND
# ─────────────────────────────────────────────

@app.get("/")
async def serve_frontend():
    """
    Serve a interface HTML principal.
    UX 7: Injeta o tema salvo no <head> como script inline para evitar
    o flash de tema errado antes do JS carregar.
    """
    index_path = FRONTEND_DIR / "index.html"
    if not index_path.exists():
        return JSONResponse({"erro": "Frontend não encontrado"}, status_code=404)

    # Lê o tema da config e injeta antes do render
    try:
        config = carregar_config()
        tema = config.get("tema", "escuro")
    except Exception:
        tema = "escuro"

    html = index_path.read_text(encoding="utf-8")

    # Injeta script inline no <head> que define o data-theme IMEDIATAMENTE,
    # evitando o flash de tema errado (FOUC — Flash of Unstyled Content)
    script_tema = f'<script>document.documentElement.dataset.theme="{tema}";</script>'
    html = html.replace("</head>", f"{script_tema}\n</head>", 1)

    return HTMLResponse(content=html)


# Serve arquivos estáticos do frontend (CSS, JS)
if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


# ─────────────────────────────────────────────
# API — BUSCA
# ─────────────────────────────────────────────

@app.post("/api/search")
async def iniciar_busca(req: BuscaRequest, background_tasks: BackgroundTasks):
    """
    Inicia uma nova busca no Google Maps.
    UX 10: Aceita múltiplas cidades separadas por nova linha.
    Retorna o search_id para acompanhar via SSE.
    """
    if not req.tipo.strip():
        raise HTTPException(status_code=400, detail="Tipo de negócio é obrigatório")
    if not req.cidade.strip():
        raise HTTPException(status_code=400, detail="Cidade é obrigatória")
    if not (10 <= req.max_results <= 1000):
        raise HTTPException(status_code=400, detail="max_results deve ser entre 10 e 1000")

    # UX 10: Divide múltiplas cidades
    cidades = [c.strip() for c in req.cidade.splitlines() if c.strip()]
    if not cidades:
        raise HTTPException(status_code=400, detail="Nenhuma cidade válida informada")

    # Divide múltiplos tipos de negócio
    tipos = [t.strip() for t in req.tipo.splitlines() if t.strip()]
    if not tipos:
        raise HTTPException(status_code=400, detail="Nenhum tipo de negócio válido informado")

    # Gera combinacoes tipo x cidade (produto cartesiano)
    combinacoes = [(t, c) for t in tipos for c in cidades]

    # Um único search_id agrupa todas as combinações
    search_id = str(uuid.uuid4())
    label_tipos  = " | ".join(tipos)
    label_cidades = " | ".join(cidades)
    database.criar_busca(search_id, label_tipos, label_cidades, req.max_results)
    _get_queue(search_id)  # Cria a fila SSE

    # Persiste modo_rapido na config temporariamente para o scraper ler
    if req.modo_rapido:
        try:
            cfg = carregar_config()
            cfg["modo_rapido"] = True
            salvar_config(cfg)
        except Exception:
            pass

    main_loop = asyncio.get_running_loop()
    import threading
    threading.Thread(
        target=_executar_scraper_thread,
        args=(search_id, combinacoes, req.max_results, main_loop),
        daemon=True
    ).start()

    return {"search_id": search_id, "status": "iniciado", "tipos": tipos, "cidades": cidades, "combinacoes": len(combinacoes)}


def _executar_scraper_thread(
    search_id: str,
    combinacoes: list[tuple[str, str]],  # Lista de (tipo, cidade)
    max_results: int,
    main_loop: asyncio.AbstractEventLoop,
) -> None:
    """
    Roda numa thread separada com um event loop limpo.
    Itera sobre todas as combinações de (tipo × cidade) sequencialmente.
    """
    import sys
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    new_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(new_loop)

    async def on_lead(dados: dict) -> None:
        def _sync_call():
            resultado, acao = database.salvar_lead(search_id, dados)
            if acao == "duplicado_ignorado":
                main_loop.create_task(
                    _publicar_evento(search_id, "duplicado", {"mensagem": f"Lead duplicado ignorado: {dados.get('nome', '')}"})
                )
                return
            if resultado:
                main_loop.create_task(_publicar_evento(search_id, "lead", resultado))
        main_loop.call_soon_threadsafe(_sync_call)

    async def on_status(nivel: str, mensagem: str) -> None:
        def _sync_call():
            main_loop.create_task(_publicar_evento(search_id, "status", {"nivel": nivel, "mensagem": mensagem}))
        main_loop.call_soon_threadsafe(_sync_call)

    async def run_scraper():
        total_global = 0
        total_comb = len(combinacoes)
        # ─── CORREÇÃO BUG: Re-registra a busca no início (garante estado ativo)
        scraper_module.registrar_busca(search_id)
        try:
            for idx, (tipo, cidade) in enumerate(combinacoes):
                # Verifica se o usuário pediu parada EXPLÍCITA (via /stop)
                # busca_foi_parada() diferencia parada manual de busca que terminou naturalmente
                if scraper_module.busca_foi_parada(search_id):
                    break

                # Pára se já atingiu o limite global
                restantes = max_results - total_global
                if restantes <= 0:
                    break

                # Re-registra antes de cada busca parcial
                # (executar_busca chama limpar_busca ao finalizar)
                scraper_module.registrar_busca(search_id)

                # Emite progresso por combinação
                msg = f"🔍 [{idx + 1}/{total_comb}] '{tipo}' em '{cidade}' (buscando até {restantes} leads)"
                def _pub(m=msg):
                    main_loop.create_task(_publicar_evento(search_id, "status", {"nivel": "info", "mensagem": m}))
                main_loop.call_soon_threadsafe(_pub)

                parcial = await scraper_module.executar_busca(
                    search_id, tipo, cidade, restantes, on_lead, on_status
                )
                total_global += parcial

            def _done():
                database.atualizar_status_busca(search_id, "done", total_global)
                main_loop.create_task(_publicar_evento(search_id, "concluido", {"total": total_global}))
            main_loop.call_soon_threadsafe(_done)

        except Exception as e:
            def _err():
                database.atualizar_status_busca(search_id, "error")
                main_loop.create_task(_publicar_evento(search_id, "erro", {"mensagem": str(e)}))
            main_loop.call_soon_threadsafe(_err)
        finally:
            # Garante limpeza final
            scraper_module.limpar_busca(search_id)
            def _fin():
                main_loop.create_task(_publicar_evento(search_id, "fim", {}))
            main_loop.call_soon_threadsafe(_fin)

    new_loop.run_until_complete(run_scraper())
    new_loop.close()


@app.get("/api/search/{search_id}/stream")
async def stream_busca(search_id: str):
    """
    Endpoint SSE (Server-Sent Events): transmite leads em tempo real.
    O frontend se conecta aqui e recebe eventos conforme o scraper extrai.
    """
    busca = database.obter_busca(search_id)
    if not busca:
        raise HTTPException(status_code=404, detail="Busca não encontrada")

    async def gerador_eventos() -> AsyncGenerator[str, None]:
        queue = _get_queue(search_id)
        while True:
            try:
                evento = await asyncio.wait_for(queue.get(), timeout=30.0)
                yield f"data: {json.dumps(evento, ensure_ascii=False)}\n\n"
                if evento.get("tipo") in ("fim", "erro"):
                    break
            except asyncio.TimeoutError:
                # Mantém a conexão viva com um keep-alive
                yield ": keep-alive\n\n"

        _limpar_queue(search_id)

    return StreamingResponse(
        gerador_eventos(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Desativa buffer no Nginx se usar proxy
        },
    )


@app.get("/api/search/{search_id}/status")
async def status_busca(search_id: str):
    """Retorna o status atual de uma busca (running/done/error/stopped)."""
    busca = database.obter_busca(search_id)
    if not busca:
        raise HTTPException(status_code=404, detail="Busca não encontrada")
    return busca


@app.post("/api/search/{search_id}/stop")
async def parar_busca(search_id: str):
    """Interrompe uma busca em andamento."""
    busca = database.obter_busca(search_id)
    if not busca:
        raise HTTPException(status_code=404, detail="Busca não encontrada")

    scraper_module.parar_busca(search_id)
    database.atualizar_status_busca(search_id, "stopped")
    return {"status": "stopped"}


@app.get("/api/results/{search_id}")
async def obter_resultados(search_id: str):
    """Retorna todos os leads de uma busca."""
    busca = database.obter_busca(search_id)
    if not busca:
        raise HTTPException(status_code=404, detail="Busca não encontrada")

    leads = database.listar_leads(search_id)
    return {"busca": busca, "leads": leads, "total": len(leads)}


# ─────────────────────────────────────────────
# API — LEADS INDIVIDUAIS
# ─────────────────────────────────────────────

@app.patch("/api/leads/{lead_id}")
async def atualizar_lead(lead_id: int, req: AtualizarLeadRequest):
    """
    Atualiza campos individuais de um lead existente (Feature 7).
    Aceita: status_contato, notas, custom_fields.
    """
    campos = req.model_dump(exclude_none=True)
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

    lead = database.atualizar_lead(lead_id, campos)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    return lead


# ─────────────────────────────────────────────
# API — EXPORTAÇÃO
# ─────────────────────────────────────────────

@app.post("/api/export/csv")
def exportar_csv(req: ExportCsvRequest):
    """Gera arquivo CSV e retorna o nome do arquivo para download."""
    if not req.search_id:
        raise HTTPException(status_code=400, detail="search_id é obrigatório")

    leads = database.listar_leads(req.search_id)
    if not leads:
        raise HTTPException(status_code=404, detail="Nenhum lead encontrado para esta busca")

    if req.lead_ids:
        leads = [l for l in leads if l["id"] in req.lead_ids]

    resultado = exporter.exportar_csv(leads, req.tipo, req.cidade, req.campos)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=500, detail=resultado.get("erro", "Erro ao gerar CSV"))

    return resultado


@app.post("/api/export/excel")
def exportar_excel_route(req: ExportCsvRequest):
    """Gera arquivo Excel e retorna o nome do arquivo para download."""
    if not req.search_id:
        raise HTTPException(status_code=400, detail="search_id é obrigatório")

    leads = database.listar_leads(req.search_id)
    if not leads:
        raise HTTPException(status_code=404, detail="Nenhum lead encontrado para esta busca")

    if req.lead_ids:
        leads = [l for l in leads if l["id"] in req.lead_ids]

    resultado = exporter.exportar_excel(leads, req.tipo, req.cidade, req.campos)
    if not resultado["sucesso"]:
        raise HTTPException(status_code=500, detail=resultado.get("erro", "Erro ao gerar Excel"))

    return resultado


@app.get("/api/download/{filename}")
async def download_arquivo(filename: str):
    """
    Faz o download de um arquivo da pasta /exports/.
    Bug 2: Detecta a extensão para definir o media_type correto.
    """
    # Segurança: remove path traversal
    filename_seguro = Path(filename).name
    caminho = EXPORTS_DIR / filename_seguro

    if not caminho.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")

    # Bug 2: media_type correto por extensão
    extensao = filename_seguro.rsplit(".", 1)[-1].lower() if "." in filename_seguro else ""
    media_types = {
        "csv":  "text/csv",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "json": "application/json",
    }
    media_type = media_types.get(extensao, "application/octet-stream")

    return FileResponse(
        path=str(caminho),
        filename=filename_seguro,
        media_type=media_type,
        content_disposition_type="attachment",
        headers={
            "Content-Disposition": f'attachment; filename="{filename_seguro}"',
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


@app.post("/api/export/sheets")
def exportar_sheets(req: ExportSheetsRequest):
    """Exporta leads para o Google Sheets."""
    if not req.search_id:
        raise HTTPException(status_code=400, detail="search_id é obrigatório")

    leads = database.listar_leads(req.search_id)
    if not leads:
        raise HTTPException(status_code=404, detail="Nenhum lead encontrado")

    if req.lead_ids:
        leads = [l for l in leads if l["id"] in req.lead_ids]

    resultado = exporter.exportar_google_sheets(
        leads, req.tipo, req.cidade, req.campos, req.planilha_existente_id
    )
    if not resultado.get("sucesso"):
        raise HTTPException(status_code=500, detail=resultado.get("erro", "Erro ao exportar"))

    return resultado


@app.get("/api/export/sheets/status")
def status_credenciais_google():
    """Verifica se as credenciais do Google estão configuradas."""
    return exporter.verificar_credenciais_google()


# ─────────────────────────────────────────────
# API — HISTÓRICO
# ─────────────────────────────────────────────

@app.get("/api/history")
async def listar_historico(limit: int = 20):
    """Retorna as últimas N buscas no histórico."""
    return database.listar_historico(limit)


@app.delete("/api/history/{search_id}")
async def deletar_historico(search_id: str):
    """Remove uma busca e seus leads do banco."""
    if not database.deletar_busca(search_id):
        raise HTTPException(status_code=404, detail="Busca não encontrada")
    return {"deletado": True}


# ─────────────────────────────────────────────
# API — ESTATÍSTICAS (Feature 5)
# ─────────────────────────────────────────────

@app.get("/api/stats")
async def obter_estatisticas():
    """
    Retorna métricas agregadas sobre todas as buscas e leads.
    Inclui: total_buscas, total_leads, top 5 cidades, top 5 tipos,
    taxa de email e taxa de redes sociais.
    """
    return database.obter_estatisticas()


# ─────────────────────────────────────────────
# API — CONFIGURAÇÕES
# ─────────────────────────────────────────────

@app.get("/api/config/fields")
async def obter_config_campos():
    """Retorna a configuração atual dos campos."""
    config = carregar_config()
    return {
        "campos":              config.get("campos", []),
        "campos_customizados": config.get("campos_customizados", []),
        "tema":                config.get("tema", "escuro"),
        "modo_headless":       config.get("modo_headless", True),
        "visitar_site_do_lead": config.get("visitar_site_do_lead", True),
        "delay_min_segundos":  config.get("delay_min_segundos", 1.5),
        "delay_max_segundos":  config.get("delay_max_segundos", 3.0),
        "modo_rapido":         config.get("modo_rapido", False),
    }


@app.post("/api/config/fields")
async def salvar_config_campos(req: CamposConfigRequest):
    """Salva a configuração dos campos no arquivo JSON local."""
    config = carregar_config()
    config["campos"] = req.campos
    config["campos_customizados"] = req.campos_customizados or []
    salvar_config(config)
    return {"salvo": True}


@app.post("/api/config/reset")
async def resetar_config():
    """Restaura todas as configurações para o padrão de fábrica."""
    config = restaurar_config_padrao()
    return {"resetado": True, "config": config}


@app.patch("/api/config")
async def atualizar_config_parcial(dados: dict):
    """Atualiza configurações avulsas (tema, modo_headless, modo_rapido, etc.)."""
    config = carregar_config()
    config.update(dados)
    salvar_config(config)
    return {"atualizado": True}


if __name__ == "__main__":
    import uvicorn

    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    uvicorn.run("main:app", host="0.0.0.0", port=8000)
