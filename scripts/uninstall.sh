#!/usr/bin/env bash
set -e

APPLET_UUID="radioviva@alexander"
TARGET_DIR="$HOME/.local/share/cinnamon/applets/$APPLET_UUID"

echo "=== Desinstalador do RadioViva ($APPLET_UUID) ==="

# 1. Encerra qualquer processo mpv do radioviva
pkill -f "radioviva" || true

# 2. Remove da lista de applets ativos
CURRENT_APPLETS=$(gsettings get org.cinnamon enabled-applets)
if [[ "$CURRENT_APPLETS" == *"$APPLET_UUID"* ]]; then
    echo "[*] Removendo do painel do Cinnamon..."
    NEW_LIST=$(python3 -c '
import ast
raw = """'"$CURRENT_APPLETS"'"""
arr = ast.literal_eval(raw)
filtered = [x for x in arr if "'"$APPLET_UUID"'" not in x]
print(str(filtered))
')
    gsettings set org.cinnamon enabled-applets "$NEW_LIST"
fi

# 3. Remove pasta do applet
if [ -d "$TARGET_DIR" ]; then
    rm -rf "$TARGET_DIR"
    echo "[✓] Diretório $TARGET_DIR removido."
fi

# 4. Recarrega Cinnamon
if command -v cinnamon-dbus-command &> /dev/null; then
    cinnamon-dbus-command RestartCinnamon 0 || true
fi

echo "[✓] RadioViva desinstalado com sucesso."
