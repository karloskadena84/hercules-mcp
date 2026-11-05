#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "  Hércules MCP - Instalador (macOS / Linux)"
echo "  =========================================="
echo ""

# Detectar raíz del proyecto
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Necesitas Node.js 20+. Instálalo desde https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d. -f1 | tr -d v)
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Se necesita Node.js >= 20"
  exit 1
fi
echo "[OK] Node.js $(node -v)"

cd "$PROJECT_ROOT"
echo "[..] Instalando dependencias..."
npm install --no-audit --no-fund
echo "[OK] Dependencias instaladas"

INDEX_PATH="$PROJECT_ROOT/src/index.ts"

# Configurar Claude Desktop en macOS
CLAUDE_CONFIG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ "$(uname)" = "Darwin" ]; then
  mkdir -p "$(dirname "$CLAUDE_CONFIG")"
  if [ -f "$CLAUDE_CONFIG" ]; then
    # Intento simple: si no existe hercules, lo añadimos con una herramienta ligera
    if ! grep -q '"hercules"' "$CLAUDE_CONFIG" 2>/dev/null; then
      echo "[!] Archivo de Claude Desktop encontrado."
      echo "    Se recomienda añadir manualmente o usar la interfaz de Claude → Settings → Developer → Edit Config"
      echo "    Bloque a añadir:"
      echo ""
      cat <<EOF
    "hercules": {
      "command": "npx",
      "args": ["tsx", "$INDEX_PATH"]
    }
EOF
      echo ""
    else
      echo "[OK] Hércules ya aparece en la configuración de Claude"
    fi
  else
    cat > "$CLAUDE_CONFIG" <<EOF
{
  "mcpServers": {
    "hercules": {
      "command": "npx",
      "args": ["tsx", "$INDEX_PATH"]
    }
  }
}
EOF
    echo "[OK] Configuración de Claude Desktop creada"
  fi
fi

echo ""
echo "  ============================================="
echo "  Instalación completada"
echo "  ============================================="
echo ""
echo "  1. Cierra completamente Claude Desktop"
echo "  2. Vuelve a abrirlo"
echo "  3. Escribe:  optimiza mi sistema"
echo ""
