# mgnx

System monitor for Linux. Built with Tauri v2 + React.

**Tabs:** Processes · Resources · Network · Disk · GPU

**Features:**
- Live process table with CPU heat coloring, sort, filter, and signal controls (kill / term / suspend / resume / renice)
- Per-core CPU bars, RAM/swap usage, sparkline history
- Network interface cards with rx/tx rates and active connections
- Disk usage per mount with inode stats
- NVIDIA (nvml) and AMD (rocm-smi) GPU metrics
- Full keyboard navigation — Tab cycles zones, arrows move within
- Catppuccin Macchiato theme

---

## Install

```bash
git clone https://github.com/Svynct/mgnx.git
cd mgnx
./install.sh
```

Supports Arch, Debian/Ubuntu, and Fedora. Installs Rust and Node.js if missing, builds the app, and places the binary at `~/.local/bin/mgnx`.

Override the install directory:

```bash
INSTALL_DIR=/usr/local/bin ./install.sh
```

Uninstall (removes the binary; leaves shared system deps):

```bash
./uninstall.sh
```

---

## Requirements

- Linux (Wayland or X11)
- Rust 1.70+
- Node.js 18+
- For NVIDIA GPU tab: `nvidia-smi` available
- For AMD GPU tab: `rocm-smi` available

---

## Dev

```bash
npm install
npm run tauri -- dev
```

Run tests:

```bash
cd src-tauri && cargo test  # Rust backend
npm test                    # Frontend (vitest)
```
