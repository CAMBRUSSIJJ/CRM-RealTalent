#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
CONF="$HOME/.config/realtalent-ai"
TOKEN_FILE="$CONF/tunnel.token"
UNIT="realtalent-ai-tunnel.service"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo 'ERRO: cloudflared não está instalado.'
  echo 'Instale pelo guia oficial: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/'
  exit 2
fi
if ! systemctl --user list-unit-files "$UNIT" --no-legend 2>/dev/null | grep -q "realtalent-ai-tunnel";then
  echo "ERRO: $UNIT não foi encontrado. Execute o instalador do RealTalent IA primeiro."
  exit 2
fi
if [[ ! -t 0 ]];then
  echo 'ERRO: execute no terminal interativo. Não passe token como argumento.'
  exit 2
fi
mkdir -p "$CONF"
chmod 700 "$CONF"
if [[ -s "$TOKEN_FILE" ]];then
  printf 'Já existe token de Tunnel salvo. Deseja substituí-lo? (s/N): '
  read -r replace
  [[ "$replace" =~ ^[sS]$ ]] || { echo 'Mantendo a configuração existente.'; exit 0; }
fi
echo
echo 'No painel Cloudflare > Networking > Tunnels > seu tunnel > Add a replica:'
echo 'Copie APENAS o token (eyJ...), não o comando completo.'
echo 'O token ficará no seu computador com permissão 600 e não aparecerá no terminal.'
printf 'Cole o token do Tunnel (entrada oculta): '
IFS= read -r -s tunnel_token
echo
tunnel_token="${tunnel_token%$'\r'}"
if [[ "${#tunnel_token}" -lt 80 || "$tunnel_token" != eyJ* ]];then
  echo 'ERRO: token inválido ou parece ser o comando completo. Nenhuma alteração realizada.' >&2
  unset tunnel_token
  exit 2
fi
TMP_FILE="$(mktemp "$CONF/.tunnel-token.XXXXXX")"
trap 'rm -f "$TMP_FILE"' EXIT
printf '%s' "$tunnel_token" > "$TMP_FILE"
unset tunnel_token
chmod 600 "$TMP_FILE"
mv -f "$TMP_FILE" "$TOKEN_FILE"
trap - EXIT

systemctl --user daemon-reload
systemctl --user enable --now "$UNIT"
sleep 3
if systemctl --user is-active --quiet "$UNIT";then
  echo 'Tunnel ativo. Ele reiniciará automaticamente se falhar.'
else
  echo 'O Tunnel ainda não está ativo. Veja registros locais:'
  journalctl --user -u "$UNIT" -n 15 --no-pager -o cat | sed -E 's/eyJ[A-Za-z0-9._=-]+/[TOKEN_OCULTO]/g'
  exit 1
fi
echo
echo 'Próximo passo: hostname HTTPS + Cloudflare Access (Service Auth).'
echo 'Origin obrigatório: http://127.0.0.1:8798 (NUNCA 11434).'
