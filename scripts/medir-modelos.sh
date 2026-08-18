#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  medir-modelos.sh — qual modelo responde mais rápido AQUI
#
#  O tamanho do arquivo não diz a velocidade: um modelo MoE ocupa
#  mais disco e ativa poucos parâmetros; um denso menor pode ser mais
#  lento. E nada disso importa se ele não couber na VRAM junto com o
#  que você usa no desktop.
#
#  Este script mede o que interessa de verdade, na sua placa:
#    · tempo até a primeira resposta COM o modelo já carregado
#    · tempo COM carga fria (o caso real quando ele foi descarregado)
#    · tokens por segundo
#    · quanto de VRAM fica ocupado
#
#  Uso:  ./medir-modelos.sh
#        ./medir-modelos.sh qwen3.5:9b gemma4:12b     (só esses)
# ══════════════════════════════════════════════════════════
set -u

OLLAMA="${OLLAMA_URL:-http://localhost:11434}"
PERGUNTA="${PERGUNTA:-Explique em dois parágrafos por que o céu é azul.}"

MODELOS=("$@")
if [ ${#MODELOS[@]} -eq 0 ]; then
  mapfile -t MODELOS < <(ollama list | awk 'NR>1 && $1 != "" {print $1}')
fi

if [ ${#MODELOS[@]} -eq 0 ]; then
  echo "Nenhum modelo encontrado. O Ollama está no ar? (ollama list)"
  exit 1
fi

printf '%-16s %10s %10s %10s %12s\n' "MODELO" "FRIO(s)" "QUENTE(s)" "tok/s" "VRAM"
printf '%s\n' "----------------------------------------------------------------"

for m in "${MODELOS[@]}"; do
  # ── carga fria: tira da memória e cronometra a primeira resposta ──
  curl -s "$OLLAMA/api/generate" -d "{\"model\":\"$m\",\"keep_alive\":0}" >/dev/null 2>&1
  sleep 2

  frio=$( { /usr/bin/time -f "%e" curl -s "$OLLAMA/api/chat" -d "$(cat <<EOF
{"model":"$m","stream":false,"keep_alive":"5m","options":{"num_ctx":4096,"num_predict":150},
 "messages":[{"role":"user","content":"$PERGUNTA"}]}
EOF
)" -o /tmp/.medir.json ; } 2>&1 )

  # ── carga quente: o modelo já está na VRAM ──
  quente=$( { /usr/bin/time -f "%e" curl -s "$OLLAMA/api/chat" -d "$(cat <<EOF
{"model":"$m","stream":false,"keep_alive":"5m","options":{"num_ctx":4096,"num_predict":150},
 "messages":[{"role":"user","content":"$PERGUNTA"}]}
EOF
)" -o /tmp/.medir2.json ; } 2>&1 )

  # tokens por segundo, direto das métricas que o Ollama devolve
  tps=$(python3 - <<'PY' 2>/dev/null || echo "?"
import json
d = json.load(open("/tmp/.medir2.json"))
c, dur = d.get("eval_count"), d.get("eval_duration")
print(f"{c/(dur/1e9):.1f}" if c and dur else "?")
PY
)

  vram=$(ollama ps 2>/dev/null | awk -v M="$m" '$1==M {print $3" "$4}')
  [ -z "$vram" ] && vram="-"

  printf '%-16s %10s %10s %10s %12s\n' "$m" "$frio" "$quente" "$tps" "$vram"
done

echo
echo "FRIO   = tempo com o modelo fora da VRAM (o que acontece quando ele é descarregado)"
echo "QUENTE = com o modelo já carregado — é este que o keep_alive preserva"
echo "VRAM   = quanto ele ocupa enquanto residente (veja se sobra placa para você usar)"
echo
echo "Escolha para OLLAMA_MODEL_LEVE o que tiver o melhor QUENTE com VRAM que te deixe trabalhar."
