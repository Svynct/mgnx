#!/usr/bin/env bash
set -euo pipefail

BINARY_NAME="mgnx"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
TARGET="$INSTALL_DIR/$BINARY_NAME"

printf '\e[1mmgnx uninstaller\e[0m\n'
echo '─────────────────────────────'

if [[ -f "$TARGET" ]]; then
    rm -f "$TARGET"
    printf '\e[1;32m✓\e[0m  Removed %s\n' "$TARGET"
else
    printf '\e[1;33m!\e[0m  No binary at %s (nothing to remove)\n' "$TARGET"
fi

echo
echo "System dependencies (Rust, Node.js, GTK/WebKit libraries) were left in place"
echo "— they're shared with other software. Remove them manually if you want."
