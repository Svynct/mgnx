#!/usr/bin/env bash
set -euo pipefail

BINARY_NAME="mgnx"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
TARGET="$INSTALL_DIR/$BINARY_NAME"
DESKTOP="$DATA_DIR/applications/$BINARY_NAME.desktop"
ICON="$DATA_DIR/icons/hicolor/128x128/apps/$BINARY_NAME.png"

printf '\e[1mmgnx uninstaller\e[0m\n'
echo '─────────────────────────────'

removed=0
for f in "$TARGET" "$DESKTOP" "$ICON"; do
    if [[ -f "$f" ]]; then
        rm -f "$f"
        printf '\e[1;32m✓\e[0m  Removed %s\n' "$f"
        removed=1
    fi
done
[[ "$removed" -eq 0 ]] && printf '\e[1;33m!\e[0m  Nothing found to remove\n'

command -v update-desktop-database >/dev/null 2>&1 && \
    update-desktop-database "$DATA_DIR/applications" >/dev/null 2>&1 || true

echo
echo "System dependencies (Rust, Node.js, GTK/WebKit libraries) were left in place"
echo "— they're shared with other software. Remove them manually if you want."
