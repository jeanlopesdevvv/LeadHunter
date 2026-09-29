#!/bin/bash
# start.sh — Inicializador do LeadHunter para Linux/Mac

echo ""
echo " =============================================="
echo "  🎯  LeadHunter — Ferramenta de Leads"
echo " =============================================="
echo ""

# ─── Verifica Python ───
if ! command -v python3 &> /dev/null; then
    echo " ❌ Python3 não encontrado!"
    echo " Instale com: sudo apt install python3 python3-pip (Linux)"
    echo " ou via https://python.org (Mac)"
    exit 1
fi
echo " ✅ Python encontrado."

# ─── Instala dependências ───
echo " 📦 Instalando dependências..."
pip3 install -r requirements.txt -q
echo " ✅ Dependências instaladas."

# ─── Playwright ───
echo " 🌐 Instalando browser Playwright..."
playwright install chromium 2>/dev/null || python3 -m playwright install chromium
echo " ✅ Browser pronto."

# ─── Cria pastas ───
mkdir -p exports credentials

# ─── Abre browser ───
(sleep 3 && (xdg-open http://localhost:8000 2>/dev/null || open http://localhost:8000 2>/dev/null)) &

# ─── Inicia servidor ───
echo ""
echo " ─────────────────────────────────────────────"
echo "  🚀 Servidor iniciando..."
echo "  🌐 Acesse: http://localhost:8000"
echo "  📌 Pressione Ctrl+C para encerrar"
echo " ─────────────────────────────────────────────"
echo ""

python3 main.py
