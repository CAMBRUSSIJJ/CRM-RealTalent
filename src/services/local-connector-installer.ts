// Native Python connector installer. Workspace token is embedded in a private
// one-time script generated inside the authenticated browser, not in source control.
// Downloads are pinned to an immutable commit; the old Node connector is preserved.
const sourceCommit = '1f7e1515f82381744a05a33a89d62ffa61141df1'
const sourceRepo = 'https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git'

export function buildGarimpoLinuxInstaller(environment: string): string {
  if (!/^GARIMPO_CONNECTOR_TOKEN=[a-f0-9]{64}$/m.test(environment) || !/^GARIMPO_WORKSPACE_ID=[a-f0-9-]{36}$/im.test(environment)) {
    throw new Error('Configuração privada inválida para o Garimpo Python.')
  }
  const encoded = btoa(environment)
  return [
    '#!/usr/bin/env bash',
    'set -Eeuo pipefail',
    'umask 077',
    '# Instalação pessoal: este script contém um token do CRM em base64. Não compartilhe.',
    'for tool in bash git python3 base64; do',
    '  command -v "$tool" >/dev/null 2>&1 || { echo "Instale $tool e execute novamente." >&2; exit 1; }',
    'done',
    "python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' || { echo \"O motor requer Python 3.12 ou superior. Instale essa versão e gere o comando novamente.\" >&2; exit 1; }",
    'ROOT="$HOME/Downloads/RealTalent-Garimpo-Python-v06"',
    'SOURCE_SHA="'+sourceCommit+'"',
    'SOURCE_REPO="'+sourceRepo+'"',
    'mkdir -p -- "$(dirname "$ROOT")"',
    'if [[ -e "$ROOT" && ! -f "$ROOT/.realtalent-source-commit" ]]; then',
    '  echo "Destino existente não pertence a este instalador: $ROOT. Preserve a pasta e use um destino diferente." >&2; exit 1',
    'fi',
    'if [[ ! -d "$ROOT" ]]; then',
    '  TEMP="$(mktemp -d)"',
    '  trap \'rm -rf -- "$TEMP"\' EXIT',
    '  echo "Preparando o Garimpo Python (código fixado e verificável)..."',
    '  git -c init.defaultBranch=main init -q "$TEMP/source"',
    '  git -C "$TEMP/source" remote add origin "$SOURCE_REPO"',
    '  git -C "$TEMP/source" fetch --filter=blob:none --depth=1 origin "$SOURCE_SHA"',
    '  [[ "$(git -C "$TEMP/source" rev-parse FETCH_HEAD)" == "$SOURCE_SHA" ]] || { echo "Falha na verificação do commit." >&2; exit 1; }',
    '  git -C "$TEMP/source" sparse-checkout init --cone',
    '  git -C "$TEMP/source" sparse-checkout set deploy/local-garimpo garimpo-engine',
    '  git -C "$TEMP/source" -c advice.detachedHead=false checkout --detach FETCH_HEAD',
    '  [[ -f "$TEMP/source/deploy/local-garimpo/garimpo_engine.py" && -f "$TEMP/source/deploy/local-garimpo/garimpo_connector.py" && -f "$TEMP/source/deploy/local-garimpo/test_garimpo_python.py" ]] || { echo "Motor Python incompleto." >&2; exit 1; }',
    '  mv -- "$TEMP/source" "$ROOT"',
    '  printf "%s\\n" "$SOURCE_SHA" > "$ROOT/.realtalent-source-commit"',
    '  rm -rf -- "$TEMP"',
    '  trap - EXIT',
    'fi',
    '[[ "$(cat "$ROOT/.realtalent-source-commit")" == "$SOURCE_SHA" && "$(git -C "$ROOT" rev-parse HEAD)" == "$SOURCE_SHA" ]] || { echo "Código local diferente do commit verificado. Nada foi sobrescrito." >&2; exit 1; }',
    'CONNECTOR="$ROOT/deploy/local-garimpo"',
    'CONFIG="$CONNECTOR/garimpo.env"',
    'if [[ -f "$CONFIG" ]]; then cp -p -- "$CONFIG" "$CONFIG.backup.$(date +%Y%m%d%H%M%S)"; fi',
    'printf "%s" "'+encoded+'" | base64 --decode > "$CONFIG.new"',
    'chmod 600 -- "$CONFIG.new"',
    'mv -f -- "$CONFIG.new" "$CONFIG"',
    'ENV_DIR="$ROOT/.venv"',
    'if [[ ! -x "$ENV_DIR/bin/python" ]]; then python3 -m venv "$ENV_DIR" || { echo "Instale o suporte python3-venv e execute o comando novamente." >&2; exit 1; }; fi',
    'PY="$ENV_DIR/bin/python"',
    'echo "Preparando o motor 0.6 e suas dependências Python..."',
    '"$PY" -m pip install --disable-pip-version-check -c "$ROOT/garimpo-engine/requirements.lock" "$ROOT/garimpo-engine"',
    'echo "Preparando o coletor Maps verificado e o navegador..."',
    '"$PY" -m garimpo setup-maps --directory "$ROOT/tools"',
    'mkdir -p "$ROOT/data"',
    'printf "GARIMPO_MAPS_BINARY=%s/tools/google-maps-scraper-v1.19.0\\nGARIMPO_DB=%s/data/garimpo.sqlite3\\nGARIMPO_JOB_TIMEOUT=480\\n" "$ROOT" "$ROOT" >> "$CONFIG"',
    'echo "Validando o motor Python e a extração pública..."',
    '"$PY" -m unittest discover -s "$CONNECTOR" -p "test_garimpo*.py" -q',
    'echo "Iniciando Garimpo Python. Não é necessário iniciar Docker, Node ou Ollama."',
    'exec "$PY" -u "$CONNECTOR/garimpo_connector.py" "$CONFIG"',
    '',
  ].join('\n')
}

export function buildGarimpoLinuxCommand(environment: string): string {
  const installer = buildGarimpoLinuxInstaller(environment)
  const utf8 = new TextEncoder().encode(installer)
  const payload = btoa(Array.from(utf8, (byte) => String.fromCharCode(byte)).join(''))
  return `bash -c "$(printf '%s' '${payload}' | base64 --decode)"`
}
