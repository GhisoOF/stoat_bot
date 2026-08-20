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
pular() { printf '\033[33m! pulando: %s\033[0m\n' "$1" >&2; PULADAS=$((PULADAS+1)); }
PULADAS=0

mkdir -p "$VOZES"

# ── Modo busca: procurar vozes no HuggingFace ─────────────
# `bash scripts/instalar-piper.sh buscar pt` lista modelos Piper de português.
# Existe porque a oferta muda: vozes novas aparecem, links de tutorial
# apodrecem. Melhor perguntar ao HuggingFace na hora do que confiar numa
# lista escrita meses atrás.
if [ "${1:-}" = "buscar" ] || [ "${1:-}" = "search" ]; then
  TERMO="${2:-pt}"
  printf '\033[36m→ procurando vozes Piper para "%s"…\033[0m\n\n' "$TERMO"
  curl -fsL "https://huggingface.co/api/models?search=piper%20${TERMO}&limit=60" \
    | tr '}' '\n' | grep -o '"modelId":"[^"]*"' | cut -d'"' -f4 | sort -u \
    | while read -r repo; do printf '  %s\n' "$repo"; done
  echo
  printf '\033[36m→ também vale olhar estas coleções:\033[0m\n'
  echo "  OpenVoiceOS/pipertts-voices    (vozes 'dii' femininas em várias línguas)"
  echo "  rhasspy/piper-voices           (oficiais — pt_BR só tem masculinas)"
  echo "  BornSaint/piper-TTS            (comunidade, pt-BR)"
  echo
  printf '\033[36m→ para instalar qualquer uma:\033[0m\n'
  echo "  bash scripts/instalar-piper.sh Autor/nome-do-repo"
  echo
  printf '\033[33m! Confira a LICENÇA antes de usar: algumas proíbem uso comercial.\033[0m\n'
  exit 0
fi

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
#   bash scripts/instalar-piper.sh buscar pt    → procura vozes disponíveis
#   bash scripts/instalar-piper.sh portugues    → TODAS as vozes pt compatíveis (~1 GB)
#
# Para vozes da comunidade os nomes de arquivo NÃO seguem a convenção do
# Piper (o OpenVoiceOS publica `dii_pt-BR.onnx`, e às vezes a config vem como
# `.piper.json`). Por isso perguntamos à API do HuggingFace quais arquivos
# existem em vez de montar a URL no chute — foi o que deu 404 na primeira
# tentativa.
#
ESCOLHA="${1:-${PIPER_VOZ_ESCOLHA:-faber}}"

# ── Modo "portugues": todas as vozes pt compatíveis com o Piper ──
# A lista é curada: só repositórios NATIVOS do Piper. Ficam de fora os
# espelhos `csukuangfj/vits-piper-*` (são conversões para sherpa-onnx) e as
# duplicatas do mesmo modelo, que só ocupariam disco sem trazer voz nova.

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
# LOTE=1 faz as falhas serem puladas em vez de abortarem o script — numa
# instalação de várias vozes, uma incompatível não pode derrubar as outras.
baixar_do_hf() {
  local repo="$1" nome_local="$2"
  local falhar="erro"
  [ "${LOTE:-0}" = "1" ] && falhar="pular"
  if [ -f "$VOZES/$nome_local.onnx" ] && [ -f "$VOZES/$nome_local.onnx.json" ]; then
    okay "voz $nome_local já presente"
    return 0
  fi

  info "consultando os arquivos de $repo…"
  local lista
  lista=$(curl -fsL "https://huggingface.co/api/models/$repo" 2>/dev/null) || {
    $falhar "não consegui consultar $repo (existe? https://huggingface.co/$repo)"
    return 1; }

  # extrai os rfilename do JSON sem depender de jq
  local arq_onnx arq_json
  arq_onnx=$(printf '%s' "$lista" | tr ',' '\n' | grep -o '"rfilename":"[^"]*\.onnx"' \
             | head -1 | cut -d'"' -f4)
  arq_json=$(printf '%s' "$lista" | tr ',' '\n' | grep -oE '"rfilename":"[^"]*\.(onnx\.json|piper\.json|json)"' \
             | grep -v 'config.json' | head -1 | cut -d'"' -f4)

  [ -n "$arq_onnx" ] || { $falhar "sem arquivo .onnx em $repo"; return 1; }
  # Repositórios convertidos para sherpa-onnx (csukuangfj/vits-piper-*) trazem
  # `tokens.txt` e `espeak-ng-data/` no lugar do `.onnx.json` — são para outro
  # runtime e não servem ao Piper. Vale detectar e dizer isso, em vez de
  # baixar 60 MB para descobrir depois que não funciona.
  if [ -z "$arq_json" ]; then
    if printf '%s' "$lista" | grep -q 'tokens.txt'; then
      $falhar "$repo é uma conversão para sherpa-onnx (tem tokens.txt, não .onnx.json) — não serve para o Piper"
    else
      $falhar "achei o modelo ($arq_onnx) mas nenhum .json de configuração em $repo"
    fi
    return 1
  fi

  info "  modelo: $arq_onnx"
  info "  config: $arq_json"

  local base="https://huggingface.co/$repo/resolve/main"
  curl -fL "$base/$arq_onnx" -o "$VOZES/$nome_local.onnx" || {
    rm -f "$VOZES/$nome_local.onnx"; $falhar "falha ao baixar $arq_onnx"; return 1; }
  curl -fL "$base/$arq_json" -o "$VOZES/$nome_local.onnx.json" || {
    rm -f "$VOZES/$nome_local.onnx" "$VOZES/$nome_local.onnx.json"
    $falhar "falha ao baixar $arq_json"; return 1; }
  okay "voz $nome_local instalada ($(du -h "$VOZES/$nome_local.onnx" | cut -f1))"
}

RH="https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR"

if [ "$ESCOLHA" = "portugues" ] || [ "$ESCOLHA" = "pt" ] || [ "$ESCOLHA" = "tudo" ]; then
  LOTE=1
  # `set -e` derruba o script quando uma função retorna 1 — e no lote uma voz
  # indisponível NÃO pode interromper as outras. Daí o `|| true` em cada
  # chamada: a falha vira um aviso e a lista continua.
  printf '\033[36m→ instalando as vozes pt compatíveis (~1 GB no total)\033[0m\n\n'

  #        repositório                              nome local          (sexo)
  baixar_do_hf "OpenVoiceOS/pipertts_pt-BR_dii"      "pt_BR-dii" || true          # F
  baixar_do_hf "OpenVoiceOS/pipertts_pt-BR_miro"     "pt_BR-miro" || true         # M
  baixar_do_hf "OpenVoiceOS/pipertts_pt-PT_dii"      "pt_PT-dii" || true          # F
  baixar_do_hf "OpenVoiceOS/pipertts_pt-PT_miro"     "pt_PT-miro" || true         # M
  baixar_do_hf "OpenVoiceOS/pipertts_pt-PT_voice3"   "pt_PT-voice3" || true       # ?
  baixar_do_hf "OpenVoiceOS/pipertts_pt-PT_voice4"   "pt_PT-voice4" || true       # ?
  baixar_do_hf "TarcisoAmorim/piper-pt_BR-miro-high" "pt_BR-miro-high" || true    # M
  baixar_do_hf "cristianoaredes/piper-pt-br"         "pt_BR-aredes" || true       # ?
  baixar_do_hf "freds0/piper-ptbr-brspeech-medium"   "pt_BR-brspeech" || true     # ?
  baixar_do_hf "tigopt/piper-pt_PT-dii-medium"       "pt_PT-dii-medium" || true   # F
  baixar_do_hf "Lucasllfs/Razo-piper-voice"          "pt_BR-razo" || true         # M

  # As oficiais do rhasspy (todas masculinas em pt_BR)
  RH="https://huggingface.co/rhasspy/piper-voices/resolve/main/pt/pt_BR"
  baixar_voz "pt_BR-faber-medium"    "$RH/faber/medium/pt_BR-faber-medium.onnx"       "$RH/faber/medium/pt_BR-faber-medium.onnx.json" || true
  baixar_voz "pt_BR-edresson-low"    "$RH/edresson/low/pt_BR-edresson-low.onnx"       "$RH/edresson/low/pt_BR-edresson-low.onnx.json" || true

  echo
  okay "instaladas: $(ls "$VOZES"/*.onnx 2>/dev/null | wc -l) voz(es)"
  [ "$PULADAS" -gt 0 ] && printf '\033[33m! %s repositório(s) pulado(s) — veja os avisos acima\033[0m\n' "$PULADAS"
  printf '   ocupando %s em %s\n' "$(du -sh "$VOZES" 2>/dev/null | cut -f1)" "$VOZES"
  echo
  info "compare todas de ouvido:"
  echo "   bash scripts/judy-diag.sh comparar \"Olá, eu sou a Judy\" glados"
  exit 0
fi
case "$ESCOLHA" in
  dii|feminina|female)
    baixar_do_hf "OpenVoiceOS/pipertts_pt-BR_dii" "pt_BR-dii-medium"
    VOZ="pt_BR-dii-medium" ;;
  todas|all|ambas)
    baixar_voz "pt_BR-faber-medium" "$RH/faber/medium/pt_BR-faber-medium.onnx" "$RH/faber/medium/pt_BR-faber-medium.onnx.json"
    baixar_do_hf "OpenVoiceOS/pipertts_pt-BR_dii" "pt_BR-dii-medium"
    VOZ="pt_BR-dii-medium" ;;
  */*)
    # qualquer repositório do HuggingFace, com nome local opcional:
    #   bash scripts/instalar-piper.sh OpenVoiceOS/pipertts_pt-PT_dii pt_PT-dii
    NOME_LOCAL="${2:-$(echo "$ESCOLHA" | tr '/' '-')}"
    baixar_do_hf "$ESCOLHA" "$NOME_LOCAL"
    VOZ="$NOME_LOCAL" ;;
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
