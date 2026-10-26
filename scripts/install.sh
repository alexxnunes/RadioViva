#!/usr/bin/env bash
set -e

APPLET_UUID="radioviva@alexander"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/src"
TARGET_DIR="$HOME/.local/share/cinnamon/applets/$APPLET_UUID"

echo "=== Instalador do RadioViva ($APPLET_UUID) ==="
echo "Origem: $SOURCE_DIR"
echo "Destino: $TARGET_DIR"

# 1. Cria diretório de destino
mkdir -p "$TARGET_DIR"

# 2. Sincroniza arquivos (cópia limpa mantendo atualizações)
rsync -av --delete "$SOURCE_DIR/" "$TARGET_DIR/"

echo "[✓] Arquivos instalados em $TARGET_DIR"

# 3. Verifica dependência do MPV
if ! command -v mpv &> /dev/null; then
    echo "[!] Aviso: MPV não encontrado. Instalando mpv..."
    sudo apt-get update && sudo apt-get install -y mpv
else
    echo "[✓] MPV verificado: $(mpv --version | head -n 1)"
fi

# 4. Habilitar o applet no Cinnamon (se ainda não estiver ativo)
CURRENT_APPLETS=$(gsettings get org.cinnamon enabled-applets)

if [[ "$CURRENT_APPLETS" == *"$APPLET_UUID"* ]]; then
    echo "[✓] Applet já está habilitado na barra do Cinnamon."
else
    echo "[*] Adicionando RadioViva ao painel do Cinnamon..."
    # Adiciona ao lado direito do painel
    # Obtém o próximo ID livre
    NEW_ID=$(python3 -c '
import ast
raw = """'"$CURRENT_APPLETS"'"""
try:
    arr = ast.literal_eval(raw)
    ids = [int(x.split(":")[-1]) for x in arr if x.split(":")[-1].isdigit()]
    next_id = max(ids) + 1 if ids else 25
except Exception:
    next_id = 30
arr.append(f"panel1:right:4:'"$APPLET_UUID"':{next_id}")
print(str(arr))
')
    gsettings set org.cinnamon enabled-applets "$NEW_ID"
    echo "[✓] RadioViva adicionado à lista de applets do painel."
fi

# 5. Encerra qualquer processo anterior do MPV para evitar reprodução órfã
pkill -u "$UID" -f "mpv.*radioviva" || true

# 6. Recarrega Cinnamon para aplicar as mudanças
if command -v cinnamon-dbus-command &> /dev/null; then
    echo "[*] Recarregando painel do Cinnamon..."
    cinnamon-dbus-command RestartCinnamon 0 || true
fi

echo "=============================================="
echo " RadioViva instalado e pronto na barra! 📻🇧🇷"
echo "=============================================="
