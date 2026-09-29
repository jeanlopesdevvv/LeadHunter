"""
scraper.py — Motor de extração de leads via Playwright no Google Maps.

Estratégia:
1. Abre o Google Maps com a busca do usuário
2. Faz scroll na lista lateral até atingir max_results (scroll inteligente: Perf 7)
3. Para cada card: clica, extrai dados
4. Paralelismo (Perf 2): fila asyncio.Queue com 3 workers visitando sites simultaneamente
5. Cache de domínios (Perf 3): evita revisitar o mesmo site na mesma busca
6. Emite cada lead via callback assíncrono (para SSE em tempo real)

Proteções anti-bloqueio:
- User-agents rotativos (5 opções)
- Delay aleatório entre leads (1.5–3s configurável)
- Timeout por lead (15s padrão)
- Trata silenciosamente todos os erros por lead

Changelog v2:
- Bug 5:  Função get_text_fallback() com seletores alternativos
- Perf 1: Captura plus_code e maps_url no script JS inline do card
- Perf 2: Paralelismo com asyncio.Queue + N_WORKERS abas para visitar sites
- Perf 3: Cache de domínios já visitados (_cache_sites)
- Perf 7: Scroll inteligente — detecta fim por estagnação (2 tentativas sem crescimento)
- Feature 6: Respeita flag modo_rapido da config (pula visita ao site)
"""

import asyncio
import json
import random
import re
import traceback
from datetime import datetime
from typing import Callable, Awaitable, Optional
from urllib.parse import quote_plus, urlparse

from playwright.async_api import async_playwright, Page, Browser, BrowserContext

from config import carregar_config, ERROR_LOG


# ─────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
]

# Número de workers paralelos para visitar sites dos leads
N_WORKERS = 3

# Seletores do Google Maps com fallbacks robustos (Bug 5)
SEL_FEED   = 'div[role="feed"]'
SEL_CARDS  = 'div[role="feed"] a[href*="/maps/place/"]'

# Seletores com fallback para cada campo crítico
SELETORES_NOME = [
    'h1.DUwDvf',
    'h1[class*="fontHeadlineLarge"]',
    'h1',
]
SELETORES_TELEFONE = [
    '[data-item-id*="phone:tel"] .fontBodyMedium',
    '[data-tooltip="Copiar número de telefone"] .fontBodyMedium',
    'button[data-item-id*="phone:tel"] .fontBodyMedium',
]
SELETORES_ENDERECO = [
    'button[data-item-id="address"] .fontBodyMedium',
    '[data-tooltip="Copiar endereço"] .fontBodyMedium',
    '[data-item-id="address"] .fontBodyMedium',
]


# ─────────────────────────────────────────────
# ESTADO GLOBAL DE BUSCAS ATIVAS
# Permite que o endpoint /stop interrompa uma busca em andamento
# ─────────────────────────────────────────────

_buscas_ativas: dict[str, bool] = {}  # search_id -> True (rodando) / False (parar)


def registrar_busca(search_id: str) -> None:
    _buscas_ativas[search_id] = True


def parar_busca(search_id: str) -> None:
    _buscas_ativas[search_id] = False


def busca_esta_ativa(search_id: str) -> bool:
    return _buscas_ativas.get(search_id, False)


def busca_foi_parada(search_id: str) -> bool:
    """
    Retorna True APENAS se o usuário parou explicitamente a busca via /stop.
    Diferente de busca_esta_ativa(), que retorna False tanto para buscas
    paradas pelo usuário quanto para buscas que já foram limpas pelo scraper.
    """
    return _buscas_ativas.get(search_id) is False


def limpar_busca(search_id: str) -> None:
    _buscas_ativas.pop(search_id, None)


# ─────────────────────────────────────────────
# LOG DE ERROS
# ─────────────────────────────────────────────

def registrar_erro(search_id: str, url: str, erro: str) -> None:
    """Registra um erro no arquivo de log sem travar a execução."""
    try:
        with open(ERROR_LOG, "a", encoding="utf-8") as f:
            timestamp = datetime.utcnow().isoformat()
            f.write(f"[{timestamp}] search_id={search_id} url={url}\n{erro}\n\n")
    except OSError:
        pass  # Se não conseguir logar, não trava


# ─────────────────────────────────────────────
# SELETOR COM FALLBACK (Bug 5)
# ─────────────────────────────────────────────

async def get_text_fallback(page: Page, seletores: list[str]) -> str:
    """
    Tenta cada seletor em sequência e retorna o texto do primeiro que encontrar.
    Remove caracteres PUA (ícones) e quebras de linha.
    Retorna string vazia se nenhum seletor funcionar.
    """
    for seletor in seletores:
        try:
            el = await page.query_selector(seletor)
            if el:
                texto = await el.inner_text()
                # Remove ícones (caracteres privados Unicode) e normaliza espaços
                texto = re.sub(r'[\ue000-\uf8ff]', '', texto)
                texto = texto.replace('\n', ' ').strip()
                if texto:
                    return texto
        except Exception:
            continue
    return ''


# ─────────────────────────────────────────────
# EXTRAÇÃO DO SITE DO LEAD (email, redes sociais)
# ─────────────────────────────────────────────

async def extrair_dados_site(page: Page, url_site: str, timeout: int = 10) -> dict:
    """
    Visita o site do lead e extrai email, Instagram, Facebook, LinkedIn e WhatsApp.
    Retorna dict vazio se falhar — nunca lança exceção.
    """
    dados = {"email": "", "instagram": "", "facebook": "", "linkedin": "", "whatsapp": ""}

    if not url_site or not url_site.startswith("http"):
        return dados

    try:
        await page.goto(url_site, timeout=timeout * 1000, wait_until="domcontentloaded")

        # Extrai todos os links da página
        links = await page.eval_on_selector_all(
            "a[href]",
            "els => els.map(e => e.href)"
        )

        for link in links:
            link_lower = link.lower()
            if "instagram.com" in link_lower and not dados["instagram"]:
                dados["instagram"] = link
            elif "facebook.com" in link_lower and not dados["facebook"]:
                dados["facebook"] = link
            elif "linkedin.com" in link_lower and not dados["linkedin"]:
                dados["linkedin"] = link
            elif ("wa.me" in link_lower or "whatsapp.com" in link_lower) and not dados["whatsapp"]:
                dados["whatsapp"] = link

        # Extrai emails via regex no HTML completo
        html = await page.content()
        emails = re.findall(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", html)
        # Filtra emails inválidos/genéricos de scripts
        emails_validos = [
            e for e in emails
            if not any(x in e.lower() for x in ["example", "sentry", "email.com", "@2x", "png", "jpg"])
        ]
        if emails_validos:
            dados["email"] = emails_validos[0]

    except Exception:
        pass  # Falha silenciosa — o lead ainda é salvo sem esses dados

    return dados


# ─────────────────────────────────────────────
# WORKER DE VISITA AO SITE (Perf 2)
# ─────────────────────────────────────────────

async def worker_visitar_sites(
    context: BrowserContext,
    fila_entrada: asyncio.Queue,
    fila_saida: asyncio.Queue,
    timeout_lead: int,
) -> None:
    """
    Worker que consome URLs da fila_entrada, visita cada site e coloca
    os dados enriquecidos na fila_saida.
    Roda até receber o sinal de parada (None na fila).
    """
    page = await context.new_page()
    try:
        while True:
            item = await fila_entrada.get()
            if item is None:
                # Sinal de parada recebido — propaga para outros workers
                await fila_entrada.put(None)
                break

            dados, card_url = item
            url_site = dados.get("site", "")

            if url_site and url_site.startswith("http"):
                # Atalho: se o site já é uma rede social, não visita
                site_lower = url_site.lower()
                if "instagram.com" in site_lower:
                    dados["instagram"] = url_site
                elif "facebook.com" in site_lower:
                    dados["facebook"] = url_site
                else:
                    try:
                        dados_site = await asyncio.wait_for(
                            extrair_dados_site(page, url_site, timeout=timeout_lead),
                            timeout=timeout_lead + 2,
                        )
                        dados.update(dados_site)
                    except asyncio.TimeoutError:
                        print(f"⚠️ [TIMEOUT] Visita ao site {url_site} expirou.")
                    except Exception as e:
                        print(f"⚠️ [SITE] Erro ao visitar {url_site}: {e}")

            await fila_saida.put((dados, card_url))
            fila_entrada.task_done()
    finally:
        await page.close()


# ─────────────────────────────────────────────
# EXTRAÇÃO DOS DADOS DO CARD (Google Maps)
# ─────────────────────────────────────────────

async def extrair_dados_card(page: Page, timeout: int = 15) -> dict:
    """
    Extrai os dados do painel de detalhes de um card do Google Maps.
    Usa script JS inline para extração instantânea + fallbacks para seletores.
    Suporta plus_code e maps_url (Perf 1), além dos campos tradicionais.
    """

    # Script JS inline que extrai TUDO de uma só vez (muito mais rápido que N queries Playwright)
    script = r"""() => {
        const getText = (selector) => {
            const el = document.querySelector(selector);
            // Remove ícones (caracteres PUA) e quebras de linha
            return el ? el.innerText.replace(/[\ue000-\uf8ff]/g, '').replace(/\n/g, ' ').trim() : '';
        };

        // Tenta múltiplos seletores para nome (Bug 5)
        const nome = getText('h1.DUwDvf') || getText('h1[class*="fontHeadlineLarge"]') || getText('h1');

        // Tenta múltiplos seletores para endereço (Bug 5)
        const endereco =
            getText('button[data-item-id="address"] .fontBodyMedium') ||
            getText('[data-tooltip="Copiar endereço"] .fontBodyMedium') ||
            getText('[data-item-id="address"] .fontBodyMedium');

        // Tenta múltiplos seletores para telefone (Bug 5)
        const telefone =
            getText('button[data-item-id*="phone:tel"] .fontBodyMedium') ||
            getText('[data-tooltip="Copiar número de telefone"] .fontBodyMedium');

        // Site: procura o primeiro link externo verdadeiro
        const links = Array.from(document.querySelectorAll('a[href^="http"]'));
        const siteLink = links.find(l => !l.href.includes('google') && !l.href.includes('gstatic'));
        const site = siteLink ? siteLink.href : '';

        // Avaliação (nota e total)
        const ratingEl = document.querySelector('div.F7nice');
        let nota = '';
        let total = '';
        if (ratingEl) {
            const text = ratingEl.innerText.replace(/\n/g, '');
            const match = text.match(/(\d[,.]\d).*?\(?([0-9.]+)\)?/);
            if (match) {
                nota  = match[1].replace(',', '.');
                total = match[2].replace('.', '');
            } else {
                const aria = ratingEl.getAttribute('aria-label') || '';
                const m = aria.match(/([\d,.]+)\s*estrelas/i);
                if (m) nota = m[1].replace(',', '.');
            }
        }

        // Plus Code (Perf 1) — aparece como texto expandível em alguns painéis
        const plusCode =
            getText('button[data-item-id="oloc"] .fontBodyMedium') ||
            getText('[data-item-id="oloc"] .fontBodyMedium') || '';

        // URL canônica do Maps (Perf 1) — o link de compartilhamento do estabelecimento
        const mapsUrl = window.location.href || '';

        return {
            nome,
            endereco,
            telefone,
            site,
            avaliacao_nota:  nota,
            avaliacao_total: total,
            categoria: getText('button.DkEaL'),
            horario:   getText('div.t39EBf'),
            plus_code: plusCode,
            maps_url:  mapsUrl,
        };
    }"""

    # Aguarda o h1 nascer no layout antes de avaliar (Maps é um SPA com render assíncrono)
    try:
        await page.wait_for_selector('h1', timeout=2000)
    except Exception:
        pass  # Avalia mesmo assim para não travar

    dados = await page.evaluate(script)

    # Extrai lat/lng da URL atual (mais preciso que innerHTML)
    lat, lng = "", ""
    try:
        url_atual = page.url
        coords = re.search(r"@(-?\d+\.\d+),(-?\d+\.\d+)", url_atual)
        if coords:
            lat, lng = coords.group(1), coords.group(2)
    except Exception:
        pass

    dados["latitude"]  = lat
    dados["longitude"] = lng

    return dados


# ─────────────────────────────────────────────
# MOTOR PRINCIPAL DE SCRAPING
# ─────────────────────────────────────────────

async def executar_busca(
    search_id: str,
    tipo: str,
    cidade: str,
    max_results: int,
    on_lead: Callable[[dict], Awaitable[None]],
    on_status: Callable[[str, str], Awaitable[None]],
) -> int:
    """
    Executa a busca completa no Google Maps.

    Arquitetura do fluxo de dados:
    - Thread principal: navega o Maps e envia URLs para fila_sites
    - N_WORKERS workers: consomem fila_sites, visitam sites, colocam resultado em fila_prontos
    - Thread principal: consome fila_prontos e chama on_lead() para cada lead completo

    Args:
        search_id:   ID único da busca (para controle de parada)
        tipo:        Tipo de negócio (ex: "restaurantes")
        cidade:      Cidade/região (ex: "Belo Horizonte")
        max_results: Número máximo de leads a extrair
        on_lead:     Callback assíncrono chamado a cada lead encontrado
        on_status:   Callback assíncrono para enviar mensagens de status ao frontend

    Returns:
        Número total de leads extraídos com sucesso
    """
    config = carregar_config()
    modo_headless = config.get("modo_headless", True)
    delay_min     = config.get("delay_min_segundos", 1.5)
    delay_max     = config.get("delay_max_segundos", 3.0)
    timeout_lead  = config.get("timeout_por_lead_segundos", 15)
    visitar_site  = config.get("visitar_site_do_lead", True)
    modo_rapido   = config.get("modo_rapido", False)  # Feature 6

    # Modo rápido desabilita visita ao site
    if modo_rapido:
        visitar_site = False
        await on_status("info", "⚡ Modo Rápido ativo — visita a sites desabilitada")

    registrar_busca(search_id)
    total_coletados = 0

    # Cache de domínios já visitados nesta busca (Perf 3)
    _cache_sites: dict[str, dict] = {}

    query     = f"{tipo} {cidade}"
    url_busca = f"https://www.google.com/maps/search/{quote_plus(query)}"

    # Filas para o pipeline paralelo (Perf 2)
    fila_sites   = asyncio.Queue(maxsize=50)   # Cards aguardando visita ao site
    fila_prontos = asyncio.Queue(maxsize=100)  # Leads prontos para salvar

    async with async_playwright() as pw:
        browser: Browser = await pw.chromium.launch(
            headless=modo_headless,
            args=["--lang=pt-BR", "--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )

        context: BrowserContext = await browser.new_context(
            user_agent=random.choice(USER_AGENTS),
            locale="pt-BR",
            viewport={"width": 1280, "height": 800},
        )

        # Aba principal para navegar no Maps
        page_maps = await context.new_page()

        try:
            await on_status("info", f"🔍 Abrindo Google Maps para: {query}")
            await page_maps.goto(url_busca, timeout=30000, wait_until="domcontentloaded")
            await asyncio.sleep(2)

            # Espera o feed de resultados aparecer
            try:
                await page_maps.wait_for_selector(SEL_FEED, timeout=15000)
            except Exception:
                await on_status("erro", "❌ Google Maps não carregou os resultados. Tente novamente.")
                return 0

            # ─── SCROLL INTELIGENTE (Perf 7) ───
            await on_status("info", f"📋 Carregando resultados (máx: {max_results})...")
            cards_url: list[str] = []
            tentativas_sem_crescimento = 0
            total_anterior = 0

            for _ in range(max_results * 5 + 200):  # Limite de segurança genéroso
                if not busca_esta_ativa(search_id):
                    break

                # Coleta links de cards visíveis
                hrefs = await page_maps.eval_on_selector_all(
                    SEL_CARDS,
                    "els => els.map(e => e.href).filter(h => h.includes('maps/place'))"
                )
                cards_url = list(dict.fromkeys(hrefs))  # Remove duplicatas, mantém ordem

                if len(cards_url) >= max_results:
                    break

                # Detecta estagnação: se não cresceu, incrementa contador (Perf 7)
                if len(cards_url) == total_anterior:
                    tentativas_sem_crescimento += 1
                    if tentativas_sem_crescimento >= 6:  # 6 tentativas = fim real da lista
                        break
                else:
                    tentativas_sem_crescimento = 0
                    total_anterior = len(cards_url)

                # Scroll no feed lateral iterativamente buscando o final do feed
                await page_maps.eval_on_selector(
                    SEL_FEED,
                    "el => el.scrollBy(0, 1200)"
                )
                await asyncio.sleep(1.5)

                # Detecta fim de lista por seletores conhecidos do Google Maps
                fim_lista = await page_maps.query_selector('span.HlvSq')
                if fim_lista:
                    break

                # Detecta mensagem de fim em PT-BR e EN (texto variável por versão do Maps)
                try:
                    page_text = await page_maps.eval_on_selector(
                        SEL_FEED,
                        "el => el.innerText"
                    )
                    fim_msgs = [
                        "você chegou ao final",
                        "you've reached the end",
                        "no more results",
                        "não há mais resultados",
                    ]
                    if any(m in page_text.lower() for m in fim_msgs):
                        break
                except Exception:
                    pass

            cards_url = cards_url[:max_results]
            total_cards = len(cards_url)
            await on_status("info", f"✅ {total_cards} estabelecimentos encontrados. Extraindo dados...")

            # ─── PIPELINE PARALELO (Perf 2) ───
            # Inicia os workers de visita ao site (só se não for modo rápido)
            workers = []
            if visitar_site:
                for _ in range(N_WORKERS):
                    task = asyncio.create_task(
                        worker_visitar_sites(context, fila_sites, fila_prontos, timeout_lead)
                    )
                    workers.append(task)

            # ─── EXTRAÇÃO CARD A CARD ───
            cards_processados = 0
            for i, card_url in enumerate(cards_url):
                if not busca_esta_ativa(search_id):
                    await on_status("aviso", "⏹ Busca interrompida pelo usuário.")
                    break

                await on_status("progresso", f"📍 Processando {i + 1}/{total_cards} em {cidade}...")

                try:
                    # Navega para o card específico
                    await page_maps.goto(card_url, timeout=timeout_lead * 1000, wait_until="domcontentloaded")

                    # Extrai dados do card (JS inline, muito rápido)
                    dados = await asyncio.wait_for(
                        extrair_dados_card(page_maps),
                        timeout=timeout_lead,
                    )

                    # Garante que o lead tem pelo menos o nome
                    if not dados.get("nome"):
                        print(f"⚠️ [AVISO] Lead pulado pois 'nome' está vazio. URL: {card_url}")
                        continue

                    dados["search_id"] = search_id

                    if visitar_site and dados.get("site") and dados["site"].startswith("http"):
                        # Verifica cache de domínios (Perf 3)
                        dominio = urlparse(dados["site"]).netloc.lower()
                        if dominio in _cache_sites:
                            # Usa resultado do cache sem visitar novamente
                            dados.update(_cache_sites[dominio])
                        else:
                            # Coloca na fila para os workers visitarem
                            await fila_sites.put((dados, card_url))
                            cards_processados += 1
                            # Drena a fila de prontos sem bloquear
                            while not fila_prontos.empty():
                                dados_pronto, _ = fila_prontos.get_nowait()
                                # Salva no cache
                                dom = urlparse(dados_pronto.get("site", "")).netloc.lower()
                                if dom:
                                    _cache_sites[dom] = {
                                        k: v for k, v in dados_pronto.items()
                                        if k in {"email", "instagram", "facebook", "linkedin", "whatsapp"}
                                    }
                                total_coletados += 1
                                await on_lead(dados_pronto)
                            # Delay anti-ban
                            await asyncio.sleep(random.uniform(delay_min, delay_max))
                            continue  # Aguarda o worker processar e colocar em fila_prontos

                    # Se não visitar site (modo rápido ou sem site), emite direto
                    total_coletados += 1
                    await on_lead(dados)
                    await asyncio.sleep(random.uniform(delay_min, delay_max))

                except asyncio.TimeoutError:
                    print(f"❌ [TIMEOUT] Falha ao extrair card {card_url}")
                    registrar_erro(search_id, card_url, "Timeout ao extrair card")
                    continue
                except Exception as e:
                    erro_trace = traceback.format_exc()
                    print(f"🚨 [ERRO] Falha no scraper!\nURL: {card_url}\nErro:\n{erro_trace}")
                    registrar_erro(search_id, card_url, erro_trace)
                    continue

            # ─── DRENA OS WORKERS (Perf 2) ───
            if visitar_site and workers:
                # Sinaliza o fim da fila para os workers encerrarem
                await fila_sites.put(None)
                await asyncio.gather(*workers, return_exceptions=True)

                # Consome os últimos itens da fila de prontos
                while not fila_prontos.empty():
                    dados_pronto, _ = fila_prontos.get_nowait()
                    dom = urlparse(dados_pronto.get("site", "")).netloc.lower()
                    if dom:
                        _cache_sites[dom] = {
                            k: v for k, v in dados_pronto.items()
                            if k in {"email", "instagram", "facebook", "linkedin", "whatsapp"}
                        }
                    total_coletados += 1
                    await on_lead(dados_pronto)

        finally:
            await browser.close()
            limpar_busca(search_id)

    return total_coletados
