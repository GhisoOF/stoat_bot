#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  medir-classificadores.sh — os classificadores de imagem do P3b cabem na CPU?
#  (31 out 2026, P3a — rodar no MiniPC ANTES de eles entrarem no bot)
#
#  Mede, para cada candidato (ViT de nudez e o CLIP ViT-B/32, em ONNX):
#  RAM de pico, tempo de carga e tempo por imagem, com 1 e 4 threads, e
#  imprime uma tabela curta. As imagens são sintéticas, geradas no container.
#
#  Isolado do bot:
#   • container DESCARTÁVEL (`docker run --rm`) com a MESMA imagem do bot
#     (node 22 bookworm-slim fixada por digest — lida do ARG NODE_IMAGE do
#     Dockerfile, uma fonte só);
#   • fase 1 (com rede) só baixa: modelos com commit fixo + SHA256 conferido,
#     onnxruntime com versão fixa + SHA512 do npm conferido;
#   • fase 2 mede SEM rede (`--network none`), com os arquivos só para leitura;
#   • nenhum volume do bot é montado; nada é instalado no bot nem na imagem;
#   • usuário comum, sem capabilities, raiz só leitura, teto de memória.
#
#  Uso:  ./scripts/medir-classificadores.sh
#        THREADS="1 2 4 8" ./scripts/medir-classificadores.sh
#        CACHE=/outro/dir ./scripts/medir-classificadores.sh   (onde os ~180 MB ficam)
#        LIMPAR=1 ./scripts/medir-classificadores.sh           (apaga o cache no fim)
# ══════════════════════════════════════════════════════════
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MJS="$RAIZ/scripts/medir-classificadores.mjs"
CACHE="${CACHE:-$HOME/.cache/judy-medir-classificadores}"
THREADS="${THREADS:-1 4}"
MEMORIA="${MEMORIA:-6g}"

command -v docker >/dev/null 2>&1 || { echo "✗ Preciso do docker."; exit 1; }
[ -f "$MJS" ] || { echo "✗ Não achei $MJS"; exit 1; }
[ -f "$RAIZ/Dockerfile" ] || { echo "✗ Não achei o Dockerfile em $RAIZ"; exit 1; }

# A imagem: a do bot, com digest (sem digest, não roda)
NODE_IMAGE="$(sed -n 's/^ARG NODE_IMAGE=//p' "$RAIZ/Dockerfile")"
if [[ ! "$NODE_IMAGE" =~ ^node:22[0-9.]*-bookworm-slim@sha256:[0-9a-f]{64}$ ]]; then
  echo "✗ O ARG NODE_IMAGE do Dockerfile não é node:22-bookworm-slim fixado por digest: '$NODE_IMAGE'"
  exit 1
fi
# THREADS: só números
for t in $THREADS; do
  [[ "$t" =~ ^[1-9][0-9]?$ ]] || { echo "✗ THREADS inválido: '$t'"; exit 1; }
done

mkdir -p "$CACHE"
if [ "${LIMPAR:-0}" = "1" ]; then trap 'rm -rf "$CACHE"' EXIT; fi

COMUM=(--rm --user "$(id -u):$(id -g)" --read-only --tmpfs /tmp:rw,size=64m
       --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp
       -v "$MJS:/medir/medir.mjs:ro")

echo "── Fase 1: baixar e conferir (com rede) ──"
docker run "${COMUM[@]}" -v "$CACHE:/dados:rw" "$NODE_IMAGE" \
  node /medir/medir.mjs baixar /dados

echo
echo "── Fase 2: medir (sem rede) ──"
# shellcheck disable=SC2086
docker run "${COMUM[@]}" --network none --memory "$MEMORIA" -v "$CACHE:/dados:ro" "$NODE_IMAGE" \
  node /medir/medir.mjs medir /dados $THREADS

echo
echo "Mande esta tabela de volta. Cache dos downloads: $CACHE (LIMPAR=1 apaga no fim)."
