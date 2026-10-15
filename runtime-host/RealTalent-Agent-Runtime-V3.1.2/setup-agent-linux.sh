#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/realtalent-agent"
CONFIG_FILE="$CONFIG_DIR/agent.env"
mkdir -p "$CONFIG_DIR"

printf '\nRealTalent Agent V3.1.2 — CRM Native Tools Read Only V1\n\n'
printf 'Analisando hardware local...\n'
PROFILE_JSON="$(node "$HERE/hardware-profiler.mjs" --write --json 2>/dev/null || echo '{}')"
PROFILE="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).profile||'unknown')}catch{console.log('unknown')}})")"
RAM="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).memory?.totalGB||'?')}catch{console.log('?')}})")"
GPU="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).gpu?.name||'não detectada')}catch{console.log('não detectada')}})")"
REC_CODER="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendedModels?.coder||'qwen2.5-coder:3b')}catch{console.log('qwen2.5-coder:3b')}})")"
REC_FAST="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendedModels?.fast||'qwen3:1.7b')}catch{console.log('qwen3:1.7b')}})")"
REC_GENERAL="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendedModels?.general||'qwen3:4b')}catch{console.log('qwen3:4b')}})")"
REC_REASON="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendedModels?.reasoning||'qwen3:4b')}catch{console.log('qwen3:4b')}})")"
REC_VISION="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendedModels?.vision||'')}catch{console.log('')}})")"
REC_EMBED="$(printf '%s' "$PROFILE_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendedModels?.embedding||'nomic-embed-text')}catch{console.log('nomic-embed-text')}})")"
CALIBRATION_FILE="$CONFIG_DIR/model-calibration.json"
if [[ -f "$CALIBRATION_FILE" ]]; then
  CALIBRATED_JSON="$(cat "$CALIBRATION_FILE" 2>/dev/null || echo '{}')"
  CAL_GENERAL="$(printf '%s' "$CALIBRATED_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendations?.general||'')}catch{console.log('')}})")"
  CAL_FAST="$(printf '%s' "$CALIBRATED_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendations?.fast||'')}catch{console.log('')}})")"
  CAL_CODER="$(printf '%s' "$CALIBRATED_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendations?.coder||'')}catch{console.log('')}})")"
  CAL_REASON="$(printf '%s' "$CALIBRATED_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendations?.reasoning||'')}catch{console.log('')}})")"
  CAL_VISION="$(printf '%s' "$CALIBRATED_JSON" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).recommendations?.vision||'')}catch{console.log('')}})")"
  [[ -n "$CAL_GENERAL" ]] && REC_GENERAL="$CAL_GENERAL"
  [[ -n "$CAL_FAST" ]] && REC_FAST="$CAL_FAST"
  [[ -n "$CAL_CODER" ]] && REC_CODER="$CAL_CODER"
  [[ -n "$CAL_REASON" ]] && REC_REASON="$CAL_REASON"
  [[ -n "$CAL_VISION" ]] && REC_VISION="$CAL_VISION"
fi
printf 'Perfil: %s · RAM: %s GB · GPU: %s\n\n' "$PROFILE" "$RAM" "$GPU"

printf '  1) IA Local (Ollama) — sem cobrança por token\n'
printf '  2) OpenAI API — cobrança separada\n'
printf '  3) Híbrido — Ollama primeiro, OpenAI como fallback\n\n'
read -r -p 'Escolha [1]: ' CHOICE
CHOICE="${CHOICE:-1}"
case "$CHOICE" in
  1) PROVIDER=ollama ;;
  2) PROVIDER=openai ;;
  3) PROVIDER=hybrid ;;
  *) echo 'Opção inválida.' >&2; exit 2 ;;
esac

OPENAI_KEY=''
OPENAI_MODEL_VALUE="${OPENAI_MODEL:-gpt-5.6-sol}"
OLLAMA_URL_VALUE="${OLLAMA_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL_VALUE="${OLLAMA_MODEL:-$REC_CODER}"
OLLAMA_GENERAL_VALUE="${OLLAMA_GENERAL_MODEL:-$REC_GENERAL}"
OLLAMA_FAST_VALUE="${OLLAMA_FAST_MODEL:-$REC_FAST}"
OLLAMA_CODER_VALUE="${OLLAMA_CODER_MODEL:-$REC_CODER}"
OLLAMA_REASON_VALUE="${OLLAMA_REASONING_MODEL:-$REC_REASON}"
OLLAMA_VISION_VALUE="${OLLAMA_VISION_MODEL:-$REC_VISION}"
OLLAMA_EMBED_VALUE="${OLLAMA_EMBED_MODEL:-$REC_EMBED}"

if [[ "$PROVIDER" == openai || "$PROVIDER" == hybrid ]]; then
  printf 'Cole sua OPENAI_API_KEY (Enter para deixar sem chave): '
  IFS= read -r -s OPENAI_KEY
  printf '\n'
  if [[ "$PROVIDER" == openai && -z "$OPENAI_KEY" ]]; then
    echo 'Modo OpenAI exige uma chave. Configuração cancelada.' >&2
    exit 1
  fi
fi

if [[ "$PROVIDER" == ollama || "$PROVIDER" == hybrid ]]; then
  printf 'Perfil Model Calibration V3.1.1: rápido=%s · geral=%s · código=%s · raciocínio=%s · embeddings=%s\n' "$REC_FAST" "$REC_GENERAL" "$REC_CODER" "$REC_REASON" "$REC_EMBED"
  read -r -p 'Usar roteamento especializado por tarefa? Os modelos são carregados alternadamente na RAM [S/n]: ' SPECIALIZED
  SPECIALIZED="${SPECIALIZED:-s}"
  if [[ "${SPECIALIZED,,}" == s || "${SPECIALIZED,,}" == sim ]]; then
    read -r -p "Modelo geral/conversa [$REC_GENERAL]: " X; OLLAMA_GENERAL_VALUE="${X:-$REC_GENERAL}"
    read -r -p "Modelo rápido [$REC_FAST]: " X; OLLAMA_FAST_VALUE="${X:-$REC_FAST}"
    read -r -p "Modelo de código [$REC_CODER]: " X; OLLAMA_CODER_VALUE="${X:-$REC_CODER}"
    read -r -p "Modelo de raciocínio [$REC_REASON]: " X; OLLAMA_REASON_VALUE="${X:-$REC_REASON}"
    OLLAMA_MODEL_VALUE="$OLLAMA_CODER_VALUE"
  else
    read -r -p "Modelo local único [$OLLAMA_MODEL_VALUE]: " INPUT_MODEL
    OLLAMA_MODEL_VALUE="${INPUT_MODEL:-$OLLAMA_MODEL_VALUE}"
    OLLAMA_GENERAL_VALUE="$OLLAMA_MODEL_VALUE"; OLLAMA_FAST_VALUE="$OLLAMA_MODEL_VALUE"; OLLAMA_CODER_VALUE="$OLLAMA_MODEL_VALUE"; OLLAMA_REASON_VALUE="$OLLAMA_MODEL_VALUE"
  fi
  if [[ -n "$REC_VISION" ]]; then
    read -r -p "Modelo local de visão [$REC_VISION / digite nenhum para desativar]: " INPUT_VISION
    if [[ "${INPUT_VISION,,}" == "nenhum" || "${INPUT_VISION,,}" == "none" ]]; then OLLAMA_VISION_VALUE=""; else OLLAMA_VISION_VALUE="${INPUT_VISION:-$REC_VISION}"; fi
  else
    read -r -p 'Modelo local de visão [gemma3:4b / digite nenhum para desativar]: ' INPUT_VISION
    if [[ "${INPUT_VISION,,}" == "nenhum" || "${INPUT_VISION,,}" == "none" ]]; then OLLAMA_VISION_VALUE=""; else OLLAMA_VISION_VALUE="${INPUT_VISION:-gemma3:4b}"; fi
  fi
  read -r -p "Modelo de embeddings/RAG [$REC_EMBED]: " INPUT_EMBED
  OLLAMA_EMBED_VALUE="${INPUT_EMBED:-$REC_EMBED}"
fi

{
  printf 'REALTALENT_AI_PROVIDER=%q\n' "$PROVIDER"
  printf 'OLLAMA_URL=%q\n' "$OLLAMA_URL_VALUE"
  printf 'OLLAMA_MODEL=%q\n' "$OLLAMA_MODEL_VALUE"
  printf 'OLLAMA_GENERAL_MODEL=%q\n' "$OLLAMA_GENERAL_VALUE"
  printf 'OLLAMA_FAST_MODEL=%q\n' "$OLLAMA_FAST_VALUE"
  printf 'OLLAMA_CODER_MODEL=%q\n' "$OLLAMA_CODER_VALUE"
  printf 'OLLAMA_REASONING_MODEL=%q\n' "$OLLAMA_REASON_VALUE"
  printf 'OLLAMA_VISION_MODEL=%q\n' "$OLLAMA_VISION_VALUE"
  printf 'OLLAMA_EMBED_MODEL=%q\n' "$OLLAMA_EMBED_VALUE"
  printf 'OPENAI_API_KEY=%q\n' "$OPENAI_KEY"
  printf 'OPENAI_MODEL=%q\n' "$OPENAI_MODEL_VALUE"
} > "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

echo
printf 'Configuração salva em: %s\n' "$CONFIG_FILE"
printf 'Provider: %s · perfil de hardware: %s\n' "$PROVIDER" "$PROFILE"
if [[ "$PROVIDER" == ollama ]]; then
  echo 'Cobrança por token da OpenAI: DESATIVADA.'
elif [[ "$PROVIDER" == hybrid ]]; then
  if [[ -n "$OPENAI_KEY" ]]; then echo 'Modo híbrido: Ollama primeiro; OpenAI só em fallback.'; else echo 'Modo híbrido sem chave: funciona como local até uma chave ser adicionada.'; fi
else
  echo 'OpenAI API ativa: pode haver cobrança por uso.'
fi

if [[ "$PROVIDER" != openai ]]; then
  echo
  read -r -p 'Deseja preparar a IA Local agora? [s/N]: ' PREPARE
  if [[ "${PREPARE,,}" == s || "${PREPARE,,}" == sim ]]; then
    exec "$HERE/install-local-ai-linux.sh"
  else
    echo 'Depois execute: ./instalar-ia-local.sh'
  fi
fi
