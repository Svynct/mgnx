#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_NAME="mgnx"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

info()  { printf '\e[1;34m=>\e[0m %s\n' "$*"; }
ok()    { printf '\e[1;32m✓\e[0m  %s\n' "$*"; }
die()   { printf '\e[1;31mError:\e[0m %s\n' "$*" >&2; exit 1; }

# ── Detect distro ────────────────────────────────────────────────────────────
detect_distro() {
    if command -v pacman &>/dev/null; then echo arch
    elif command -v apt-get &>/dev/null; then echo debian
    elif command -v dnf &>/dev/null; then echo fedora
    else echo unknown
    fi
}

# ── System dependencies ───────────────────────────────────────────────────────
install_system_deps() {
    local distro
    distro="$(detect_distro)"

    info "Installing system dependencies ($distro)..."

    case "$distro" in
        arch)
            sudo pacman -S --needed --noconfirm \
                base-devel curl wget file openssl \
                webkit2gtk-4.1 gtk3 libappindicator-gtk3 librsvg \
                appmenu-gtk-module
            ;;
        debian)
            sudo apt-get update -qq
            sudo apt-get install -y \
                build-essential curl wget file libssl-dev \
                libwebkit2gtk-4.1-dev libgtk-3-dev \
                libayatana-appindicator3-dev librsvg2-dev
            ;;
        fedora)
            sudo dnf install -y \
                curl wget file openssl-devel \
                webkit2gtk4.1-devel gtk3-devel \
                libappindicator-gtk3 librsvg2-devel
            ;;
        *)
            die "Unsupported distro. Install Tauri v2 deps manually: https://tauri.app/start/prerequisites/"
            ;;
    esac

    ok "System dependencies installed"
}

# ── Rust ──────────────────────────────────────────────────────────────────────
install_rust() {
    if command -v cargo &>/dev/null; then
        ok "Rust $(rustc --version | cut -d' ' -f2) already installed"
        return
    fi

    info "Installing Rust via rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env"
    ok "Rust installed"
}

# ── Node.js ───────────────────────────────────────────────────────────────────
install_node() {
    if command -v node &>/dev/null && command -v npm &>/dev/null; then
        ok "Node.js $(node --version) already installed"
        return
    fi

    info "Installing Node.js..."
    local distro
    distro="$(detect_distro)"
    case "$distro" in
        arch)   sudo pacman -S --needed --noconfirm nodejs npm ;;
        debian) sudo apt-get install -y nodejs npm ;;
        fedora) sudo dnf install -y nodejs npm ;;
        *)      die "Install Node.js manually: https://nodejs.org" ;;
    esac
    ok "Node.js $(node --version) installed"
}

# ── Build ─────────────────────────────────────────────────────────────────────
build() {
    info "Installing frontend dependencies..."
    cd "$REPO_ROOT"
    npm install --silent

    info "Building mgnx (this takes a few minutes)..."
    cargo tauri build

    ok "Build complete"
}

# ── Install binary ────────────────────────────────────────────────────────────
install_binary() {
    # Prefer AppImage (self-contained), fall back to raw binary
    local appimage
    appimage="$(find "$REPO_ROOT/src-tauri/target/release/bundle/appimage" \
        -name "*.AppImage" 2>/dev/null | head -1 || true)"

    mkdir -p "$INSTALL_DIR"

    if [[ -n "$appimage" ]]; then
        cp "$appimage" "$INSTALL_DIR/$BINARY_NAME"
        chmod +x "$INSTALL_DIR/$BINARY_NAME"
        ok "Installed AppImage → $INSTALL_DIR/$BINARY_NAME"
    else
        local bin="$REPO_ROOT/src-tauri/target/release/$BINARY_NAME"
        [[ -f "$bin" ]] || die "Build artifact not found at $bin"
        cp "$bin" "$INSTALL_DIR/$BINARY_NAME"
        chmod +x "$INSTALL_DIR/$BINARY_NAME"
        ok "Installed binary → $INSTALL_DIR/$BINARY_NAME"
    fi

    if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
        printf '\n\e[1;33mNote:\e[0m Add %s to your PATH:\n' "$INSTALL_DIR"
        printf '  echo '"'"'export PATH="$HOME/.local/bin:$PATH"'"'"' >> ~/.bashrc\n\n'
    fi
}

# ── Main ──────────────────────────────────────────────────────────────────────
main() {
    echo
    printf '\e[1mmgnx installer\e[0m\n'
    echo '─────────────────────────────'

    install_system_deps
    install_rust
    install_node
    build
    install_binary

    echo
    ok "mgnx is ready. Run: $BINARY_NAME"
    echo
}

main "$@"
