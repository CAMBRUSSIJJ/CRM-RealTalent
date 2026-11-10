// A private, one-time Linux installer is generated only after workspace admin authentication.
// The connector package itself is public and pinned by commit and archive SHA256.
const sourceCommit = '991bf142a74a61a722aa7265ca96c56c939f3acf'
const archiveSha256 = 'b83b561e17e3324ed906aa9304ea4a2247a1b752ca31f6da0adda693a40ecef1'

export function buildGarimpoLinuxInstaller(environment: string): string {
  if (!/^GARIMPO_CONNECTOR_TOKEN=[a-f0-9]{64}$/m.test(environment) || !/^GARIMPO_WORKSPACE_ID=[a-f0-9-]{36}$/im.test(environment)) {
    throw new Error('Configuração privada inválida para o instalador Linux.')
  }
  // The configuration is *encoded*, not encrypted. Never upload/share the generated script.
  const encoded = btoa(environment)
  return [
    '#!/usr/bin/env bash',
    'set -Eeuo pipefail',
    'umask 077',
    '# Instalador pessoal: contém sua credencial do workspace. Não compartilhe este arquivo.',
    'for tool in bash curl unzip sha256sum base64 node docker; do',
    '  command -v "$tool" >/dev/null 2>&1 || { echo "Instale $tool e execute novamente." >&2; exit 1; }',
    'done',
    'ROOT="$HOME/Downloads/RealTalent-Garimpo-Conexao-'+sourceCommit.slice(0,7)+'"',
    'ARCHIVE_SHA="'+archiveSha256+'"',
    'ARCHIVE_URL="https://raw.githubusercontent.com/CAMBRUSSIJJ/CRM-RealTalent/'+sourceCommit+'/public/downloads/Garimpo-Local.zip"',
    'if [[ -e "$ROOT" && ! -f "$ROOT/.realtalent-archive-sha256" ]]; then',
    '  echo "Pasta de destino existente sem identificação. Preserve-a e renomeie-a antes de instalar: $ROOT" >&2; exit 1',
    'fi',
    'if [[ ! -d "$ROOT" ]]; then',
    '  TEMP="$(mktemp -d)"',
    '  trap \'rm -rf -- "$TEMP"\' EXIT',
    '  echo "Baixando o conector oficial do Garimpo (versão verificada)..."',
    '  curl --fail --location --silent --show-error --retry 2 --connect-timeout 15 --max-time 240 "$ARCHIVE_URL" -o "$TEMP/garimpo.zip"',
    '  printf "%s  %s\\n" "$ARCHIVE_SHA" "$TEMP/garimpo.zip" | sha256sum --check --status || { echo "Falha de integridade do pacote. Instalação interrompida." >&2; exit 1; }',
    '  unzip -q "$TEMP/garimpo.zip" -d "$TEMP/unpacked"',
    '  ENTRY="$(find "$TEMP/unpacked" -maxdepth 6 -type f -path "*/deploy/local-garimpo/CONFIGURAR-LINUX.sh" -print -quit)"',
    '  [[ -n "$ENTRY" ]] || { echo "Instalador ausente no pacote verificado." >&2; exit 1; }',
    '  SOURCE_ROOT="${ENTRY%/deploy/local-garimpo/CONFIGURAR-LINUX.sh}"',
    '  [[ -f "$SOURCE_ROOT/supabase/functions/_shared/prospecting-ai.ts" && -f "$SOURCE_ROOT/supabase/functions/_shared/firecrawl-research.ts" ]] || { echo "Pacote incompleto: contratos de pesquisa ausentes." >&2; exit 1; }',
    '  mkdir -p -- "$(dirname "$ROOT")"',
    '  mv -- "$SOURCE_ROOT" "$ROOT"',
    '  printf "%s\\n" "$ARCHIVE_SHA" > "$ROOT/.realtalent-archive-sha256"',
    '  rm -rf -- "$TEMP"',
    '  trap - EXIT',
    'fi',
    '[[ "$(cat "$ROOT/.realtalent-archive-sha256")" == "$ARCHIVE_SHA" ]] || { echo "A versão local não corresponde ao pacote oficial." >&2; exit 1; }',
    'CONNECTOR="$ROOT/deploy/local-garimpo"',
    '[[ -f "$CONNECTOR/CONFIGURAR-LINUX.sh" ]] || { echo "Arquivos do conector ausentes." >&2; exit 1; }',
    'CONFIG="$CONNECTOR/garimpo.env"',
    'if [[ -f "$CONFIG" ]]; then cp -p -- "$CONFIG" "$CONFIG.backup.$(date +%Y%m%d%H%M%S)"; fi',
    'printf "%s" "'+encoded+'" | base64 --decode > "$CONFIG.new"',
    'chmod 600 -- "$CONFIG.new"',
    'mv -f -- "$CONFIG.new" "$CONFIG"',
    'echo "Credencial preparada em pasta privada. Configurando o Firecrawl e iniciando a conexão..."',
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
