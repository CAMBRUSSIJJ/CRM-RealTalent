// One-time installer generated only for a workspace administrator.
// Source is pinned to an immutable Git commit and verified before execution.
// The private configuration is base64 encoded (not encrypted): keep the script private.
const sourceCommit = '157192ebe9131952a9dbed0c252a5c35dc56ffdf'
const sourceRepo = 'https://github.com/CAMBRUSSIJJ/CRM-RealTalent.git'

export function buildGarimpoLinuxInstaller(environment: string): string {
  if (!/^GARIMPO_CONNECTOR_TOKEN=[a-f0-9]{64}$/m.test(environment) || !/^GARIMPO_WORKSPACE_ID=[a-f0-9-]{36}$/im.test(environment)) {
    throw new Error('Configuração privada inválida para o instalador Linux.')
  }
  const encoded = btoa(environment)
  return [
    '#!/usr/bin/env bash',
    'set -Eeuo pipefail',
    'umask 077',
    '# Instalador pessoal: contém sua credencial do workspace. Não compartilhe este arquivo.',
    'for tool in bash git node docker base64; do',
    '  command -v "$tool" >/dev/null 2>&1 || { echo "Instale $tool e execute novamente." >&2; exit 1; }',
    'done',
    'ROOT="$HOME/Downloads/RealTalent-Garimpo-Conexao"',
    'SOURCE_SHA="'+sourceCommit+'"',
    'SOURCE_REPO="'+sourceRepo+'"',
    'if [[ -e "$ROOT" && ! -f "$ROOT/.realtalent-source-commit" ]]; then',
    '  echo "Pasta de destino existente sem identificação. Preserve-a e escolha outro destino antes de instalar: $ROOT" >&2; exit 1',
    'fi',
    'if [[ ! -d "$ROOT" ]]; then',
    '  TEMP="$(mktemp -d)"',
    '  trap \'rm -rf -- "$TEMP"\' EXIT',
    '  echo "Preparando o conector oficial do Garimpo Essencial (commit verificado)..."',
    '  git -c init.defaultBranch=main init -q "$TEMP/source"',
    '  git -C "$TEMP/source" remote add origin "$SOURCE_REPO"',
    '  git -C "$TEMP/source" fetch --depth=1 origin "$SOURCE_SHA"',
    '  [[ "$(git -C "$TEMP/source" rev-parse FETCH_HEAD)" == "$SOURCE_SHA" ]] || { echo "Revisão diferente da esperada." >&2; exit 1; }',
    '  git -C "$TEMP/source" -c advice.detachedHead=false checkout --detach FETCH_HEAD',
    '  [[ -f "$TEMP/source/deploy/local-garimpo/essential_worker.py" && -f "$TEMP/source/deploy/local-garimpo/essential-python.mjs" && -f "$TEMP/source/supabase/functions/_shared/prospecting-ai.ts" ]] || { echo "Pacote Essencial incompleto." >&2; exit 1; }',
    '  mv -- "$TEMP/source" "$ROOT"',
    '  printf "%s\\n" "$SOURCE_SHA" > "$ROOT/.realtalent-source-commit"',
    '  rm -rf -- "$TEMP"',
    '  trap - EXIT',
    'fi',
    '[[ "$(cat "$ROOT/.realtalent-source-commit")" == "$SOURCE_SHA" && "$(git -C "$ROOT" rev-parse HEAD)" == "$SOURCE_SHA" ]] || { echo "Instalação local não corresponde à revisão verificada. Nada foi substituído." >&2; exit 1; }',
    'CONNECTOR="$ROOT/deploy/local-garimpo"',
    '[[ -f "$CONNECTOR/CONFIGURAR-LINUX.sh" ]] || { echo "Configurador ausente." >&2; exit 1; }',
    'CONFIG="$CONNECTOR/garimpo.env"',
    'if [[ -f "$CONFIG" ]]; then cp -p -- "$CONFIG" "$CONFIG.backup.$(date +%Y%m%d%H%M%S)"; fi',
    'printf "%s" "'+encoded+'" | base64 --decode > "$CONFIG.new"',
    'chmod 600 -- "$CONFIG.new"',
    'mv -f -- "$CONFIG.new" "$CONFIG"',
    'echo "Credencial privada preparada. Iniciando Firecrawl e o conector sem exigir Ollama..."',
    'exec bash "$CONNECTOR/CONFIGURAR-LINUX.sh" "$CONFIG"',
    '',
  ].join('\n')
}

// Copy/paste alternative for browsers that block file downloads.
// The base64 wrapper does not encrypt the workspace token: keep it private.
export function buildGarimpoLinuxCommand(environment: string): string {
  const installer = buildGarimpoLinuxInstaller(environment)
  const utf8 = new TextEncoder().encode(installer)
  const payload = btoa(Array.from(utf8, (byte) => String.fromCharCode(byte)).join(''))
  return `bash -c "$(printf '%s' '${payload}' | base64 --decode)"`
}
