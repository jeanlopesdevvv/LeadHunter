@echo off
chcp 65001 > nul
title LeadHunter — Iniciando...

echo.
echo  ==============================================
echo   🎯  LeadHunter — Ferramenta de Leads
echo  ==============================================
echo.

:: ─── Verifica se o Python está instalado ───
python --version > nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Python nao encontrado!
    echo  Instale em: https://python.org/downloads
    echo  Ative a opcao "Add Python to PATH" durante a instalacao.
    pause
    exit /b 1
)

echo  ✅ Python encontrado.
echo.

:: ─── Instala dependências ───
echo  📦 Instalando dependencias Python...
pip install -r requirements.txt --quiet
if %errorlevel% neq 0 (
    echo  ❌ Erro ao instalar dependencias. Verifique sua conexao com a internet.
    pause
    exit /b 1
)
echo  ✅ Dependencias instaladas.
echo.

:: ─── Instala o browser do Playwright ───
echo  🌐 Verificando browser do Playwright (Chromium)...
playwright install chromium --quiet 2>nul
if %errorlevel% neq 0 (
    python -m playwright install chromium
)
echo  ✅ Browser pronto.
echo.

:: ─── Cria pastas necessárias ───
if not exist "exports" mkdir exports
if not exist "credentials" mkdir credentials

:: ─── Inicia o servidor ───
echo  ─────────────────────────────────────────────
echo   🚀 Iniciando servidor...
echo   🌐 Acesse: http://localhost:8000
echo   📌 Pressione Ctrl+C para encerrar
echo  ─────────────────────────────────────────────
echo.

:: Abre o browser automaticamente após 3 segundos
start /min cmd /c "timeout /t 3 > nul && start http://localhost:8000"

:: Sobe o servidor
python main.py

pause
