#!/usr/bin/env bash
# Install ForgeLocal application menu + optional Desktop launcher (Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ICON="$ROOT/resources/icons/icon.png"
EXEC="$ROOT/scripts/forgelocal-dev.sh"
APP_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_DIR="$HOME/Desktop"

chmod +x "$EXEC"

mkdir -p "$APP_DIR"
cat >"$APP_DIR/forgelocal.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=ForgeLocal
GenericName=IDE
Comment=Local-first desktop IDE with LM Studio AI assistant
Exec=$EXEC
Icon=$ICON
Path=$ROOT
Terminal=false
Categories=Development;IDE;
Keywords=forge;ide;lmstudio;code;editor;
StartupNotify=true
StartupWMClass=forgelocal
EOF
chmod +x "$APP_DIR/forgelocal.desktop"

# hicolor theme icons (helps menus that ignore absolute Icon= paths)
for pair in 512:512 256:256 128:128 48:48; do
  size="${pair%%:*}"
  mkdir -p "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/${size}x${size}/apps"
  src="$ROOT/resources/icons/icon-${size}.png"
  if [[ -f "$src" ]]; then
    cp "$src" "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/${size}x${size}/apps/forgelocal.png"
  fi
done
gtk-update-icon-cache -f "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" 2>/dev/null || true
update-desktop-database "$APP_DIR" 2>/dev/null || true

if [[ "${1:-}" == "--desktop" || "${1:-}" == "-d" ]]; then
  mkdir -p "$DESKTOP_DIR"
  cp "$APP_DIR/forgelocal.desktop" "$DESKTOP_DIR/ForgeLocal.desktop"
  chmod +x "$DESKTOP_DIR/ForgeLocal.desktop"
  if command -v gio >/dev/null; then
    gio set "$DESKTOP_DIR/ForgeLocal.desktop" metadata::trusted true 2>/dev/null || true
  fi
  echo "Installed Desktop launcher: $DESKTOP_DIR/ForgeLocal.desktop"
fi

echo "Installed application entry: $APP_DIR/forgelocal.desktop"
echo "Icon: $ICON"
echo "If the icon does not appear yet, log out/in (or restart the session on Wayland)."
