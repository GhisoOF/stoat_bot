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
#   bash scripts/instalar-piper.sh Autor/repo   → qualquer voz do HuggingFace
#
# Para vozes da comunidade os nomes de arquivo NÃO seguem a convenção do
# Piper (o OpenVoiceOS publica `dii_pt-BR.onnx`, e às vezes a config vem como
# `.piper.json`). Por isso perguntamos à API do HuggingFace quais arquivos
# existem em vez de montar a URL no chute — foi o que deu 404 na primeira
# tentativa.
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

# ── Descobrir os arquivos de um repositório do HuggingFace ──
#
# Vozes da comunidade não seguem a convenção de nomes do Piper: o OpenVoiceOS
# publica como `dii_pt-BR.onnx` e às vezes `.piper.json` em vez de
# `.onnx.json`. Adivinhar o nome deu 404 e uma mensagem inútil. Aqui
# perguntamos à API do HuggingFace quais arquivos existem de verdade e
# pegamos o .onnx e o .json que estiverem lá, qualquer que seja o nome.
baixar_do_hf() {
  local repo="$1" nome_local="$2"
  if [ -f "$VOZES/$nome_local.onnx" ] && [ -f "$VOZES/$nome_local.onnx.json" ]; then
    okay "voz $nome_local já presente"
    return 0
  fi

  info "consultando os arquivos de $repo…"
  local lista
  lista=$(curl -fsL "https://huggingface.co/api/models/$repo" 2>/dev/null) \
    || erro "não consegui consultar o repositório $repo
   Confira se ele existe: https://huggingface.co/$repo"

  # extrai os rfilename do JSON sem depender de jq
  local arq_onnx arq_json
  arq_onnx=$(printf '%s' "$lista" | tr ',' '\n' | grep -o '"rfilename":"[^"]*\.onnx"' \
             | head -1 | cut -d'"' -f4)
  arq_json=$(printf '%s' "$lista" | tr ',' '\n' | grep -oE '"rfilename":"[^"]*\.(onnx\.json|piper\.json|json)"' \
             | grep -v 'config.json' | head -1 | cut -d'"' -f4)

  [ -n "$arq_onnx" ] || erro "não achei nenhum arquivo .onnx em $repo"
  [ -n "$arq_json" ] || erro "achei o modelo ($arq_onnx) mas nenhum .json de configuração em $repo"

  info "  modelo: $arq_onnx"
  info "  config: $arq_json"

  local base="https://huggingface.co/$repo/resolve/main"
  curl -fL "$base/$arq_onnx" -o "$VOZES/$nome_local.onnx" || {
    rm -f "$VOZES/$nome_local.onnx"; erro "falha ao baixar $arq_onnx"; }
  curl -fL "$base/$arq_json" -o "$VOZES/$nome_local.onnx.json" || {
    rm -f "$VOZES/$nome_local.onnx" "$VOZES/$nome_local.onnx.json"
    erro "falha ao baixar $arq_json"; }
  okay "voz $nome_local instalada"
}

RH="https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR"

case "$ESCOLHA" in
  dii|feminina|female)
    baixar_do_hf "OpenVoiceOS/pipertts_pt-BR_dii" "pt_BR-dii-medium"
    VOZ="pt_BR-dii-medium" ;;
  todas|all|ambas)
    baixar_voz "pt_BR-faber-medium" "$RH/faber/medium/pt_BR-faber-medium.onnx" "$RH/faber/medium/pt_BR-faber-medium.onnx.json"
    baixar_do_hf "OpenVoiceOS/pipertts_pt-BR_dii" "pt_BR-dii-medium"
    VOZ="pt_BR-dii-medium" ;;
  */*)
    # qualquer repositório do HuggingFace:
    #   bash scripts/instalar-piper.sh OpenVoiceOS/pipertts_pt-PT_dii
    baixar_do_hf "$ESCOLHA" "$(echo "$ESCOLHA" | tr '/' '-')"
    VOZ="$(echo "$ESCOLHA" | tr '/' '-')" ;;
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
