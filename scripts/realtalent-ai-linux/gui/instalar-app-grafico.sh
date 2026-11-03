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
cat > "$BIN/realtalent-ai-local" <<'LAUNCHER'
#!/bin/sh
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
  <path d="M18 20h28v8H28v5h16v8H28v5H18V20Z" fill="white"/>
  <circle cx="48" cy="47" r="6" fill="#8fe5cb"/>
</svg>
SVG
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$DESKTOP" >/dev/null 2>&1 || true
echo ""
echo "✓ RealTalent IA Local instalado no menu de aplicativos."
echo "✓ Nenhum arquivo anterior do Agent foi excluído."
echo "Para abrir pelo terminal:"
echo "  $BIN/realtalent-ai-local"
echo ""
echo "A janela oferece Ativar IA, Conectar navegador, Testar resposta e Reparar."
