#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  medir-modelos.sh — qual modelo responde mais rápido AQUI
#
#  O tamanho do arquivo não diz a velocidade: um modelo MoE ocupa mais
#  disco e ativa poucos parâmetros; um denso menor pode ser mais lento.
#  E nada disso importa se ele não couber na VRAM junto com o que você
#  usa no desktop.
#
#  Sem dependências além do curl: o cronômetro é o `%{time_total}` do
#  próprio curl, e as métricas vêm do JSON que o Ollama já devolve.
#  (A primeira versão usava /usr/bin/time, que o Gentoo não instala.)
#
#  Uso:  ./medir-modelos.sh
#        ./medir-modelos.sh qwen3.5:9b gemma4:12b     (só esses)
#        OLLAMA_URL=http://outra:11434 ./medir-modelos.sh
# ══════════════════════════════════════════════════════════
set -u

OLLAMA="${OLLAMA_URL:-http://localhost:11434}"
PERGUNTA="${PERGUNTA:-Explique em dois paragrafos por que o ceu e azul.}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v curl >/dev/null 2>&1 || { echo "Preciso do curl."; exit 1; }

if ! curl -s --max-time 5 "$OLLAMA/api/tags" >/dev/null 2>&1; then
  echo "Não consegui falar com o Ollama em $OLLAMA"
  echo "Confira se ele está no ar:  ollama list"
  exit 1
fi

MODELOS=("$@")
if [ ${#MODELOS[@]} -eq 0 ]; then
  while IFS= read -r linha; do
    [ -n "$linha" ] && MODELOS+=("$linha")
  done < <(curl -s "$OLLAMA/api/tags" | tr ',' '\n' \
           | grep -o '"name":"[^"]*"' | cut -d'"' -f4)
fi
[ ${#MODELOS[@]} -eq 0 ] && { echo "Nenhum modelo encontrado."; exit 1; }

# Extrai um número do JSON, sem depender de jq nem python.
campo() { grep -o "\"$2\":[0-9]*" "$1" | head -1 | cut -d: -f2; }

chamar() {   # $1 = modelo, $2 = arquivo de saída → imprime o tempo total
  curl -s -o "$2" -w '%{time_total}' "$OLLAMA/api/chat" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$1\",\"stream\":false,\"keep_alive\":\"5m\",
         \"options\":{\"num_ctx\":4096,\"num_predict\":150},
         \"messages\":[{\"role\":\"user\",\"content\":\"$PERGUNTA\"}]}"
}

printf '%-16s %9s %10s %9s %10s %s\n' "MODELO" "FRIO(s)" "QUENTE(s)" "tok/s" "CARGA(s)" "VRAM"
printf '%s\n' "---------------------------------------------------------------------"

for m in "${MODELOS[@]}"; do
  curl -s -o /dev/null "$OLLAMA/api/generate" -d "{\"model\":\"$m\",\"keep_alive\":0}" 2>/dev/null
  sleep 2
  frio=$(chamar "$m" "$TMP/frio.json")
  quente=$(chamar "$m" "$TMP/quente.json")

  ec=$(campo "$TMP/quente.json" eval_count)
  ed=$(campo "$TMP/quente.json" eval_duration)
  ld=$(campo "$TMP/frio.json" load_duration)

  tps="?"
  if [ -n "${ec:-}" ] && [ -n "${ed:-}" ] && [ "${ed:-0}" -gt 0 ] 2>/dev/null; then
    tps=$(awk -v c="$ec" -v d="$ed" 'BEGIN{printf "%.1f", c/(d/1e9)}')
  fi
  carga="?"
  [ -n "${ld:-}" ] && carga=$(awk -v d="$ld" 'BEGIN{printf "%.1f", d/1e9}')

  vram=$(curl -s "$OLLAMA/api/ps" | tr '{' '\n' | grep -F "\"$m\"" \
         | grep -o '"size":[0-9]*' | head -1 | cut -d: -f2)
  if [ -n "${vram:-}" ]; then
    vram=$(awk -v b="$vram" 'BEGIN{printf "%.1f GB", b/1073741824}')
  else
    vram="-"
  fi

  printf '%-16s %9s %10s %9s %10s %s\n' "$m" "$frio" "$quente" "$tps" "$carga" "$vram"
done

cat << 'FIM'

FRIO   = com o modelo fora da VRAM — o que acontece quando ele foi descarregado
QUENTE = com o modelo já carregado — é este que o keep_alive preserva
CARGA  = quanto do tempo FRIO foi só para subir o modelo na placa
tok/s  = velocidade de geração (maior é melhor)
VRAM   = quanto ocupa enquanto residente

Para OLLAMA_MODEL_LEVE: escolha o melhor QUENTE cuja VRAM ainda deixe você
trabalhar na máquina. Se algum suportar ferramentas (a família Qwen suporta),
ele pode servir conversa E ferramentas — e aí só falta o de código.
FIM
