#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  baixar-modelos.sh — trazer os candidatos do HuggingFace
#
#  Baixar 7 modelos à mão é digitar muito e errar em algum. Pior: metade
#  dos repositórios "de modelo" no HF não tem GGUF nenhum — são safetensors,
#  que o llama.cpp não carrega direto. Descobrir isso DEPOIS de esperar
#  20 GB de download é irritante.
#
#  Então: `--listar` primeiro (rápido, só metadados), `--baixar` depois.
#
#  Uso:
#    ./baixar-modelos.sh --listar              # o que existe em cada repo
#    ./baixar-modelos.sh --baixar              # baixa todos os que têm GGUF
#    ./baixar-modelos.sh --baixar unsloth/gemma-4-12B-it-qat-GGUF
#    QUANT=Q5_K_M ./baixar-modelos.sh --baixar # outro nível de quantização
#    DESTINO=/mnt/modelos ./baixar-modelos.sh --baixar
# ══════════════════════════════════════════════════════════
set -u

DESTINO="${DESTINO:-$HOME/modelos}"
QUANT="${QUANT:-Q4_K_M}"

# Os candidatos. A ordem é a da conversa; comente o que não quiser.
REPOS_PADRAO=(
  "empero-ai/Qwythos-9B-v2-GGUF"                  # v2: o loop em temperatura baixa foi corrigido
  "unsloth/gemma-4-12B-it-qat-GGUF"               # Google DeepMind + QAT, quant do unsloth
  "empero-ai/Qwen3.8-9B-Distill-GGUF"
  "empero-ai/Qwen3.8-2B-Distill-GGUF"
  "yuxinlu1/gemma-4-12B-agentic-fable5-composer2.5-v2-3.5x-tau2-GGUF"
  "HauhauCS/Gemma-4-E4B-Uncensored-HauhauCS-Aggressive"
  "OBLITERATUS/Ornith-1.5-9B-OBLITERATED"
)

# A CLI só é necessária para BAIXAR. Listar usa a API pública via curl, para
# você poder inspecionar os repositórios antes de instalar qualquer coisa.
exigir_cli() {
  command -v hf >/dev/null 2>&1 && return 0
  echo "Preciso da CLI do HuggingFace para baixar. Instale com:"
  echo "  pip install --user 'huggingface_hub[hf_transfer]'"
  echo "  (no Gentoo, se o pip reclamar de ambiente gerenciado:"
  echo "     python -m venv ~/.hf && ~/.hf/bin/pip install 'huggingface_hub[hf_transfer]'"
  echo "     e rode:  PATH=\"$HOME/.hf/bin:$PATH\" ./baixar-modelos.sh --baixar )"
  exit 1
}
export HF_HUB_ENABLE_HF_TRANSFER=1   # download paralelo, bem mais rápido

# ── Listar ────────────────────────────────────────────────
listar() {
  for repo in "$@"; do
    printf '\n\033[1m%s\033[0m\n' "$repo"
    arquivos="$(curl -s "https://huggingface.co/api/models/$repo" \
      | tr ',' '\n' | grep -o '"rfilename":"[^"]*"' | cut -d'"' -f4)"
    if [ -z "$arquivos" ]; then
      echo "  ⚠️  não consegui listar (repo privado, inexistente ou sem rede?)"
      continue
    fi
    ggufs="$(printf '%s\n' "$arquivos" | grep -i '\.gguf$' | grep -vi 'mmproj\|/')"
    if [ -z "$ggufs" ]; then
      echo "  ❌ SEM GGUF — provavelmente safetensors; precisaria converter com llama.cpp/convert_hf_to_gguf.py"
      printf '%s\n' "$arquivos" | head -5 | sed 's/^/     /'
      continue
    fi
    echo "  ✓ GGUF disponíveis:"
    printf '%s\n' "$ggufs" | sed 's/^/     /'
    if printf '%s\n' "$arquivos" | grep -qi 'mmproj'; then
      echo "     (tem mmproj — suporta imagem; baixe junto se for usar o ver_imagem)"
    fi
  done
}

# ── Baixar ────────────────────────────────────────────────
baixar() {
  exigir_cli
  mkdir -p "$DESTINO"
  for repo in "$@"; do
    printf '\n\033[1m%s\033[0m\n' "$repo"
    nome="$(basename "$repo")"
    alvo="$DESTINO/$nome"

    disponiveis="$(curl -s "https://huggingface.co/api/models/$repo" \
      | tr ',' '\n' | grep -o '"rfilename":"[^"]*"' | cut -d'"' -f4 | grep -i '\.gguf$')"
    if [ -z "$disponiveis" ]; then
      echo "  ❌ sem GGUF neste repo — pulando (use --listar para ver o que tem)"
      continue
    fi

    # O padrão pedido, ou o primeiro Q4 que existir. Repos diferentes usam
    # nomes diferentes (Q4_K_M, UD-Q4_K_XL…), então não dá para chutar um só.
    padrao="$QUANT"
    if ! printf '%s\n' "$disponiveis" | grep -qi "$padrao"; then
      alternativo="$(printf '%s\n' "$disponiveis" | grep -io 'UD-Q4_K_XL\|Q4_K_M\|Q4_K_S\|Q4_0' | head -1)"
      if [ -n "$alternativo" ]; then
        echo "  ℹ️  $QUANT não existe aqui; usando $alternativo"
        padrao="$alternativo"
      else
        echo "  ⚠️  nenhum Q4 encontrado; baixando o menor .gguf disponível"
        padrao="$(printf '%s\n' "$disponiveis" | head -1)"
      fi
    fi

    echo "  → baixando *$padrao* para $alvo"
    hf download "$repo" --include "*${padrao}*.gguf" --local-dir "$alvo" || {
      echo "  ❌ falhou"; continue; }

    # mmproj: só se o repo tiver. É pequeno e habilita imagem.
    if curl -s "https://huggingface.co/api/models/$repo" | grep -qi 'mmproj'; then
      hf download "$repo" --include "*mmproj*F16*.gguf" --local-dir "$alvo" 2>/dev/null \
        || hf download "$repo" --include "*mmproj*.gguf" --local-dir "$alvo" 2>/dev/null || true
    fi

    find "$alvo" -name '*.gguf' -printf '     %f  %s bytes\n' 2>/dev/null \
      | awk '{ printf "     %s  %.1f GB\n", $1, $2/1073741824 }'
  done

  echo
  echo "Baixados em: $DESTINO"
  echo "Espaço usado: $(du -sh "$DESTINO" 2>/dev/null | cut -f1)"
  echo
  echo "Agora adicione cada um ao llama-swap.yaml. Modelo de entrada:"
  echo
  for f in "$DESTINO"/*/*.gguf; do
    [ -e "$f" ] || continue
    case "$f" in *mmproj*) continue;; esac
    id="$(basename "$(dirname "$f")" | tr 'A-Z' 'a-z' | sed 's/-gguf$//')"
    cat << FIM
  "$id":
    cmd: >
      /caminho/para/llama-server --port \${PORT}
      -m $f
      -c 16384 -ngl 999 --jinja
    ttl: 300
FIM
  done
}

case "${1:---listar}" in
  --listar) shift; listar "${@:-${REPOS_PADRAO[@]}}" ;;
  --baixar) shift
    if [ $# -gt 0 ]; then baixar "$@"; else baixar "${REPOS_PADRAO[@]}"; fi ;;
  *) sed -n '2,25p' "$0" | sed 's|^# \{0,1\}||' ;;
esac
