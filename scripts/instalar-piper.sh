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

# ── Vozes pt-BR ──
#
# ATENÇÃO: o repositório OFICIAL do Piper (rhasspy/piper-voices) não tem
# nenhuma voz feminina em português — faber, edresson, cadu e jeff são todas
# masculinas, e há uma issue aberta pedindo uma feminina há mais de um ano.
# A opção feminina vem da comunidade (OpenVoiceOS), por isso mora noutro
# endereço e é tratada como um caso à parte aqui.
#
#   bash scripts/instalar-piper.sh              → instala faber (masculina)
#   bash scripts/instalar-piper.sh dii          → instala dii (FEMININA)
#   bash scripts/instalar-piper.sh todas        → instala as duas
#
ESCOLHA="${1:-${PIPER_VOZ_ESCOLHA:-faber}}"

baixar_voz() {
  local nome="$1" url_onnx="$2" url_json="$3"
  if [ -f "$VOZES/$nome.onnx" ] && [ -f "$VOZES/$nome.onnx.json" ]; then
    okay "voz $nome já presente"
    return 0
  fi
  info "baixando a voz $nome…"
  curl -fL "$url_onnx" -o "$VOZES/$nome.onnx" || {
    rm -f "$VOZES/$nome.onnx"; erro "falha ao baixar o modelo de $nome"; }
  curl -fL "$url_json" -o "$VOZES/$nome.onnx.json" || {
    rm -f "$VOZES/$nome.onnx" "$VOZES/$nome.onnx.json"
    erro "falha ao baixar a config de $nome (sem o .onnx.json o Piper não roda)"; }
  okay "voz $nome instalada"
}

RH="https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR"
OVOS="https://huggingface.co/OpenVoiceOS/pipertts_pt-BR_dii/resolve/main"

case "$ESCOLHA" in
  dii|feminina|female)
    baixar_voz "pt_BR-dii-medium" "$OVOS/pt-BR-dii-medium.onnx" "$OVOS/pt-BR-dii-medium.onnx.json"
    VOZ="pt_BR-dii-medium" ;;
  todas|all|ambas)
    baixar_voz "pt_BR-faber-medium" "$RH/faber/medium/pt_BR-faber-medium.onnx" "$RH/faber/medium/pt_BR-faber-medium.onnx.json"
    baixar_voz "pt_BR-dii-medium" "$OVOS/pt-BR-dii-medium.onnx" "$OVOS/pt-BR-dii-medium.onnx.json"
    VOZ="pt_BR-dii-medium" ;;
  *)
    baixar_voz "pt_BR-faber-medium" "$RH/faber/medium/pt_BR-faber-medium.onnx" "$RH/faber/medium/pt_BR-faber-medium.onnx.json"
    VOZ="pt_BR-faber-medium" ;;
esac

# ── Dependência do sistema ──
# O Piper converte texto em FONEMAS usando o espeak-ng. Sem ele o binário
# instala normalmente, aparece na lista, e falha em toda síntese com um
# "Command failed" que não diz nada. É a causa nº 1 de "instalei mas não fala".
if ! ldconfig -p 2>/dev/null | grep -q espeak-ng && [ ! -d "$DESTINO/espeak-ng-data" ]; then
  aviso_espeak=1
  printf '\033[33m! espeak-ng não encontrado — o Piper precisa dele para gerar fala\033[0m\n'
  printf '\033[33m  No Gentoo:  sudo emerge app-accessibility/espeak-ng\033[0m\n'
fi

# ── Teste ──
# SEM engolir o stderr: se falhar, a mensagem do Piper é justamente o que
# se precisa ler. A versão anterior mandava tudo para /dev/null e deixava
# você sem pista nenhuma.
info "testando a síntese…"
if ! echo "Olá! Aqui é a Judy falando pela primeira vez." \
     | "$DESTINO/piper" --model "$VOZES/$VOZ.onnx" --output_file /tmp/judy-teste.wav; then
  echo
  erro "o Piper não conseguiu sintetizar — a mensagem dele está logo acima.
   Se fala em espeak/phonemize:  sudo emerge app-accessibility/espeak-ng
   Se fala em onnx/model:        apague $VOZES e rode este script de novo"
fi

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
info "trocar a voz sem reiniciar nada:  &tts voz <nome>  no chat"
echo
echo "Vozes pt-BR conhecidas:"
echo "  masculinas (oficiais): faber, edresson, cadu, jeff"
echo "    https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR"
echo "  feminina (comunidade): dii"
echo "    https://huggingface.co/OpenVoiceOS/pipertts_pt-BR_dii"
