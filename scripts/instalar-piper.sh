#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  instalar-piper.sh — TTS offline em português, no Gentoo
#
#  Instala o binário do Piper e uma voz pt-BR em ~/.local/share/piper.
#  Não precisa de root e não mexe em nada do sistema.
#
#  Uso:  bash scripts/instalar-piper.sh
# ══════════════════════════════════════════════════════════
set -euo pipefail

DESTINO="${PIPER_DIR:-$HOME/.local/share/piper}"
VOZES="$DESTINO/vozes"
VERSAO="${PIPER_VERSAO:-2023.11.14-2}"

info() { printf '\033[36m→ %s\033[0m\n' "$1"; }
okay() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
erro() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

mkdir -p "$VOZES"
cd "$DESTINO"

# ── Binário ──
if [ -x "$DESTINO/piper" ]; then
  okay "Piper já instalado em $DESTINO/piper"
else
  info "baixando o Piper ($VERSAO, amd64)…"
  URL="https://github.com/rhasspy/piper/releases/download/${VERSAO}/piper_linux_x86_64.tar.gz"
  curl -fL "$URL" -o piper.tar.gz || erro "falha ao baixar de $URL
   Veja as versões em https://github.com/rhasspy/piper/releases
   e rode de novo com:  PIPER_VERSAO=<tag> bash scripts/instalar-piper.sh"
  tar xzf piper.tar.gz --strip-components=1 2>/dev/null || tar xzf piper.tar.gz
  rm -f piper.tar.gz
  [ -x "$DESTINO/piper" ] || erro "o arquivo baixou mas não achei o executável 'piper'"
  okay "Piper instalado"
fi

# ── Voz pt-BR ──
# faber-medium: boa relação qualidade/velocidade para conversa.
VOZ="${PIPER_VOZ:-pt_BR-faber-medium}"
BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR/faber/medium"

if [ -f "$VOZES/$VOZ.onnx" ]; then
  okay "voz $VOZ já presente"
else
  info "baixando a voz $VOZ…"
  curl -fL "$BASE/pt_BR-faber-medium.onnx"      -o "$VOZES/$VOZ.onnx" \
    || erro "falha ao baixar o modelo da voz"
  curl -fL "$BASE/pt_BR-faber-medium.onnx.json" -o "$VOZES/$VOZ.onnx.json" \
    || erro "falha ao baixar a config da voz"
  okay "voz instalada"
fi

# ── Teste ──
info "testando a síntese…"
echo "Olá! Aqui é a Judy falando pela primeira vez." \
  | "$DESTINO/piper" --model "$VOZES/$VOZ.onnx" --output_file /tmp/judy-teste.wav 2>/dev/null \
  || erro "o Piper não conseguiu sintetizar — rode sem 2>/dev/null para ver o erro"

TAM=$(stat -c%s /tmp/judy-teste.wav 2>/dev/null || echo 0)
[ "$TAM" -gt 1000 ] || erro "o WAV saiu vazio ($TAM bytes)"
okay "síntese ok — /tmp/judy-teste.wav ($TAM bytes)"

echo
info "ouça com:  aplay /tmp/judy-teste.wav"
echo
echo "Coloque no voz-servico/.env:"
echo "  PIPER_BIN=$DESTINO/piper"
echo "  PIPER_VOZES=$VOZES"
echo "  PIPER_VOZ=$VOZ"
echo
info "outras vozes pt-BR: https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR"
