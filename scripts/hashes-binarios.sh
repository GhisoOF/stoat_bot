#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  hashes-binarios.sh — o SHA256 dos binários que o Dockerfile baixa
#
#  Lê as versões fixadas no Dockerfile (YTDLP_VERSAO, LLAMA_CPP_VERSAO,
#  LLAMA_SWAP_VERSAO, PIPER_VERSAO), baixa cada arquivo e imprime as linhas
#  `ARG …_SHA256_…=<hash>` prontas para colar no Dockerfile.
#
#  Usar (na raiz do repositório):
#     scripts/hashes-binarios.sh
#
#  Para ATUALIZAR um binário: troque a versão no Dockerfile, rode isto, cole
#  os hashes novos e confira o build. Nunca no mesmo deploy de uma troca de
#  modelo (se algo quebrar, dá para saber qual dos dois foi).
# ══════════════════════════════════════════════════════════
set -euo pipefail

DF="${1:-Dockerfile}"
[ -f "$DF" ] || { echo "não achei o $DF (rode na raiz do repositório)" >&2; exit 1; }
versao() { sed -n "s/^ARG $1=//p" "$DF" | head -1; }
YT="$(versao YTDLP_VERSAO)"; LL="$(versao LLAMA_CPP_VERSAO)"; SW="$(versao LLAMA_SWAP_VERSAO)"; PI="$(versao PIPER_VERSAO)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

hash() {   # $1 = nome do ARG, $2 = URL
  if curl -fsSL --proto =https --proto-redir =https --max-time 900 "$2" -o "$TMP/arq"; then
    printf 'ARG %s=%s\n' "$1" "$(sha256sum "$TMP/arq" | cut -d' ' -f1)"
  else
    printf '# %s: o download falhou (%s)\n' "$1" "$2" >&2
  fi
  rm -f "$TMP/arq"
}

G=https://github.com
hash YTDLP_SHA256_AMD64        "$G/yt-dlp/yt-dlp/releases/download/$YT/yt-dlp_linux"
hash YTDLP_SHA256_ARM64        "$G/yt-dlp/yt-dlp/releases/download/$YT/yt-dlp_linux_aarch64"
hash LLAMA_SHA256_VULKAN_AMD64 "$G/ggml-org/llama.cpp/releases/download/$LL/llama-$LL-bin-ubuntu-vulkan-x64.tar.gz"
hash LLAMA_SHA256_CPU_AMD64    "$G/ggml-org/llama.cpp/releases/download/$LL/llama-$LL-bin-ubuntu-x64.tar.gz"
hash LLAMA_SHA256_VULKAN_ARM64 "$G/ggml-org/llama.cpp/releases/download/$LL/llama-$LL-bin-ubuntu-vulkan-arm64.tar.gz"
hash LLAMA_SHA256_CPU_ARM64    "$G/ggml-org/llama.cpp/releases/download/$LL/llama-$LL-bin-ubuntu-arm64.tar.gz"
hash LLAMA_SWAP_SHA256_AMD64   "$G/mostlygeek/llama-swap/releases/download/v$SW/llama-swap_${SW}_linux_amd64.tar.gz"
hash LLAMA_SWAP_SHA256_ARM64   "$G/mostlygeek/llama-swap/releases/download/v$SW/llama-swap_${SW}_linux_arm64.tar.gz"
hash PIPER_SHA256_AMD64        "$G/rhasspy/piper/releases/download/$PI/piper_linux_x86_64.tar.gz"
hash PIPER_SHA256_ARM64        "$G/rhasspy/piper/releases/download/$PI/piper_linux_aarch64.tar.gz"
