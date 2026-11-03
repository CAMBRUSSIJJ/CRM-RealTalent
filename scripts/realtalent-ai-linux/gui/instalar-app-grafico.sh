#!/usr/bin/env bash
# RealTalent IA Local — per-user graphical installer, no .deb needed.
set -Eeuo pipefail
umask 077
BRANCH="feat/tasks-team-recipient-routing-20261102"
BASE="https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/${BRANCH}"
APPDIR="$HOME/.local/share/realtalent-ai-app"
BIN="$HOME/.local/bin"
DESKTOP="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/scalable/apps"
if [[ "$(uname -s)" != Linux ]];then
  echo "Este aplicativo é para Linux." >&2
  exit 2
fi
for cmd in curl python3;do
  command -v "$cmd" >/dev/null 2>&1 || { echo "Instale $cmd primeiro." >&2;exit 2; }
done
# Qt WebEngine is needed to display the CRM inside the app itself.
# The legacy Tk window remains available if dependencies cannot be installed.
if ! /usr/bin/python3 -c 'from PyQt5.QtWebEngineWidgets import QWebEngineView' >/dev/null 2>&1;then
  echo "Preparando visualização do CRM dentro do aplicativo (Qt WebEngine)..."
  if command -v apt-get >/dev/null 2>&1;then
    sudo apt-get update && sudo apt-get install -y python3-pyqt5 python3-pyqt5.qtwebengine || \
      echo "Aviso: Qt WebEngine indisponível. Interface anterior continuará disponível."
  else
    echo "Para abrir o CRM na mesma janela, instale PyQt5 e QtWebEngine pela distribuição."
  fi
fi

if ! python3 -c 'import tkinter' >/dev/null 2>&1;then
  echo "A interface gráfica do Python (python3-tk) não está instalada."
  if command -v apt-get >/dev/null 2>&1;then
    echo "Instalando apenas a dependência da interface gráfica..."
    sudo apt-get update
    sudo apt-get install -y python3-tk
  else
    echo "Instale python3-tk pelo gerenciador da sua distribuição e execute novamente." >&2
    exit 2
  fi
fi
mkdir -p "$APPDIR" "$BIN" "$DESKTOP" "$ICONS"
TEMP="$(mktemp "$APPDIR/.realtalent-gui.XXXXXX")"
trap 'rm -f "$TEMP"' EXIT
echo "Baixando a interface RealTalent IA diretamente do GitHub..."
curl --fail --location --silent --show-error --retry 3 --connect-timeout 12 \
  "$BASE/scripts/realtalent-ai-linux/gui/realtalent_gui.py" --output "$TEMP"
[[ -s "$TEMP" ]] || { echo "Arquivo da interface veio vazio." >&2;exit 2; }
python3 -m py_compile "$TEMP" 2>/dev/null || {
  # Python ignores non-.py extensions for py_compile on some versions;
  # validate source without writing bytecode if necessary.
  python3 - "$TEMP" <<'PY'
import ast,sys
ast.parse(open(sys.argv[1],encoding="utf-8").read())
PY
}
install -m 600 "$TEMP" "$APPDIR/realtalent_gui.py"

TEMP_DESKTOP="$(mktemp "$APPDIR/.realtalent-desktop.XXXXXX")"
trap 'rm -f "$TEMP" "$TEMP_DESKTOP"' EXIT
echo "Baixando o RealTalent Desktop com CRM integrado..."
curl --fail --location --silent --show-error --retry 3 --connect-timeout 12 \
  "$BASE/scripts/realtalent-ai-linux/gui/realtalent_desktop.py" --output "$TEMP_DESKTOP"
[[ -s "$TEMP_DESKTOP" ]] || { echo "Arquivo do CRM integrado veio vazio." >&2;exit 2; }
python3 - "$TEMP_DESKTOP" <<'PY'
import ast,sys
ast.parse(open(sys.argv[1],encoding="utf-8").read())
PY
install -m 600 "$TEMP_DESKTOP" "$APPDIR/realtalent_desktop.py"

cat > "$BIN/realtalent-ai-local" <<'LAUNCHER'
#!/bin/sh
# Single-app window when Qt WebEngine is installed; old Tk GUI is fallback.
/usr/bin/python3 -c 'from PyQt5.QtWebEngineWidgets import QWebEngineView' >/dev/null 2>&1
if [ "$?" -eq 0 ]; then
  exec /usr/bin/python3 "$HOME/.local/share/realtalent-ai-app/realtalent_desktop.py" "$@"
fi
exec /usr/bin/python3 "$HOME/.local/share/realtalent-ai-app/realtalent_gui.py" "$@"
LAUNCHER
chmod 755 "$BIN/realtalent-ai-local"
cat > "$DESKTOP/realtalent-ai-local.desktop" <<DESKTOPFILE
[Desktop Entry]
Type=Application
Version=1.0
Name=RealTalent IA Local
Comment=Ativar IA no CRM com um clique
Exec=$BIN/realtalent-ai-local
Icon=realtalent-ai-local
Terminal=false
Categories=Utility;Office;
StartupNotify=true
DESKTOPFILE
cat > "$ICONS/realtalent-ai-local.svg" <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#1959bb"/>
  <path d="M17 17h19c8 0 13 4 13 11 0 5-3 8-7 10l9 11H39L29 36h-2v13H17V17Zm10 8v6h10c2 0 3-1 3-3s-1-3-3-3H27Z" fill="#fff"/>
  <circle cx="50" cy="13" r="6" fill="#8fe5cb"/>
</svg>
SVG
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP" >/dev/null 2>&1 || true
# Create an additional clickable desktop icon when the desktop folder exists.
USER_DESKTOP=""
if command -v xdg-user-dir >/dev/null 2>&1;then USER_DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || true)";fi
if [[ -z "$USER_DESKTOP" || ! -d "$USER_DESKTOP" ]];then
  for candidate in "$HOME/Área de trabalho" "$HOME/Desktop";do
    if [[ -d "$candidate" ]];then USER_DESKTOP="$candidate";break;fi
  done
fi
if [[ -n "$USER_DESKTOP" && -d "$USER_DESKTOP" ]];then
  cp "$DESKTOP/realtalent-ai-local.desktop" "$USER_DESKTOP/RealTalent-IA-Local.desktop"
  chmod 755 "$USER_DESKTOP/RealTalent-IA-Local.desktop"
  command -v gio >/dev/null 2>&1 && gio set "$USER_DESKTOP/RealTalent-IA-Local.desktop" metadata::trusted true >/dev/null 2>&1 || true
fi
echo ""
echo "✓ RealTalent Desktop instalado com ícone no menu do Linux."
if /usr/bin/python3 -c 'from PyQt5.QtWebEngineWidgets import QWebEngineView' >/dev/null 2>&1;then
  echo "✓ CRM integrado na mesma janela; login e pareamento salvos neste aplicativo."
else
  echo "⚠ A visualização integrada requer python3-pyqt5.qtwebengine; tela anterior permanece disponível."
fi
echo "✓ Nenhum arquivo anterior do Agent foi excluído."
echo "Abra pelo menu 'RealTalent IA Local' ou execute:"
echo "  $BIN/realtalent-ai-local"
echo "O aplicativo contém o botão 'Atualizar aplicativo' para futuras versões."
