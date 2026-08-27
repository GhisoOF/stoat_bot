#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  medir-modelos.sh — qual modelo responde melhor AQUI
#
#  O tamanho do arquivo não diz a velocidade: um MoE ocupa muito disco e
#  ativa poucos parâmetros (o lfm2.5-8b-a1b tem 8B no disco e ~1B ativos),
#  enquanto um denso menor pode ser mais lento. E nada disso importa se ele
#  não couber junto com o que você usa na máquina.
#
#  ── Por que esta versão existe ────────────────────────────
#
#  A anterior falava a API NATIVA do Ollama (/api/chat, /api/tags, /api/ps,
#  keep_alive, eval_count). O stack migrou para llama-swap com endpoint
#  compatível com OpenAI, que responde 404 nessas rotas — e o script
#  cronometrou o 404: "0.000515s" para todos os modelos, com tok/s vazio.
#  Um resultado impossível que parecia um resultado.
#
#  Agora usa /v1/chat/completions e conta os tokens do campo `usage`, que a
#  API OpenAI devolve. O FRIO mede a troca de modelo do llama-swap (ele
#  descarrega o anterior ao carregar outro), e por isso a ordem importa:
#  medimos um modelo diferente entre as duas chamadas para forçar a descarga.
#
#  Uso:  ./medir-modelos.sh                          (os que o servidor listar)
#        ./medir-modelos.sh lfm2.5-2.6b qwen3.8-27b  (só esses)
#        OLLAMA_URL=http://100.74.70.106:8081 ./medir-modelos.sh
#        PERGUNTA="..." ./medir-modelos.sh
# ══════════════════════════════════════════════════════════
set -u

OLLAMA="${OLLAMA_URL:-http://localhost:8081}"
PERGUNTA="${PERGUNTA:-Explique em dois paragrafos por que o ceu e azul.}"
TOKENS="${TOKENS:-150}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

command -v curl >/dev/null 2>&1 || { echo "Preciso do curl."; exit 1; }

if ! curl -s --max-time 5 "$OLLAMA/v1/models" >/dev/null 2>&1; then
  echo "Não consegui falar com o servidor em $OLLAMA"
  echo "Confira:  curl -s $OLLAMA/v1/models"
  exit 1
fi

MODELOS=("$@")
if [ ${#MODELOS[@]} -eq 0 ]; then
  while IFS= read -r linha; do
    [ -n "$linha" ] && MODELOS+=("$linha")
  done < <(curl -s "$OLLAMA/v1/models" | tr ',' '\n' \
           | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
fi
[ ${#MODELOS[@]} -eq 0 ] && { echo "Nenhum modelo encontrado."; exit 1; }

# Extrai um número do JSON, sem depender de jq nem python.
campo() { grep -o "\"$2\":[0-9]*" "$1" | head -1 | cut -d: -f2; }

chamar() {   # $1 = modelo, $2 = arquivo de saída → imprime o tempo total
  curl -s -o "$2" -w '%{time_total}' --max-time 300 \
    "$OLLAMA/v1/chat/completions" \
    -H 'Content-Type: application/json' \
    -d "{\"model\":\"$1\",\"stream\":false,\"max_tokens\":$TOKENS,
         \"messages\":[{\"role\":\"user\",\"content\":\"$PERGUNTA\"}]}"
}

# Uma resposta vazia ou com erro precisa aparecer como erro, não como 0.0005s.
deu_certo() { grep -q '"choices"' "$1" 2>/dev/null; }

printf '%-18s %9s %10s %9s %9s %s\n' "MODELO" "FRIO(s)" "QUENTE(s)" "tok/s" "TOKENS" "OBS"
printf '%s\n' "--------------------------------------------------------------------------"

anterior=""
for m in "${MODELOS[@]}"; do
  # Força a descarga: o llama-swap troca o modelo residente ao servir outro.
  # Sem isto, o "FRIO" do segundo modelo em diante já viria quente.
  if [ -n "$anterior" ] && [ "$anterior" != "$m" ]; then
    curl -s -o /dev/null --max-time 300 "$OLLAMA/v1/chat/completions" \
      -H 'Content-Type: application/json' \
      -d "{\"model\":\"$anterior\",\"stream\":false,\"max_tokens\":1,
           \"messages\":[{\"role\":\"user\",\"content\":\"oi\"}]}" 2>/dev/null
  fi

  frio=$(chamar "$m" "$TMP/frio.json")
  if ! deu_certo "$TMP/frio.json"; then
    erro=$(grep -o '"message":"[^"]*"' "$TMP/frio.json" | head -1 | cut -d'"' -f4)
    printf '%-18s %9s %10s %9s %9s %s\n' "$m" "-" "-" "-" "-" "ERRO: ${erro:-sem resposta}"
    continue
  fi
  quente=$(chamar "$m" "$TMP/quente.json")

  ct=$(campo "$TMP/quente.json" completion_tokens)
  tps="?"
  if [ -n "${ct:-}" ] && [ "${ct:-0}" -gt 0 ] 2>/dev/null; then
    tps=$(awk -v c="$ct" -v t="$quente" 'BEGIN{ if (t+0>0) printf "%.1f", c/t; else print "?" }')
  fi
  carga=$(awk -v f="$frio" -v q="$quente" 'BEGIN{ d=f-q; printf "%s", (d>0.5 ? sprintf("+%.1fs carga", d) : "sem troca") }')

  printf '%-18s %9.1f %10.1f %9s %9s %s\n' "$m" "$frio" "$quente" "$tps" "${ct:-?}" "$carga"
  anterior="$m"
done

cat << 'FIM'

FRIO   = primeira chamada depois de outro modelo ocupar a placa (inclui a troca)
QUENTE = com o modelo já residente — é este que você sente na conversa
tok/s  = tokens gerados por segundo na chamada quente (maior é melhor)
TOKENS = quantos tokens ele gerou (se vier bem abaixo do teto, parou sozinho)
OBS    = quanto do FRIO foi só para trocar o modelo na placa

Como decidir:
  • OLLAMA_MODEL_LEVE (conversa) — o melhor QUENTE que ainda te deixe usar a
    máquina. É o que aparece para as pessoas no chat.
  • Se a diferença de FRIO for grande, evite alternar modelos a cada mensagem:
    o llama-swap descarrega um para subir o outro, e a troca custa mais que a
    inferência. Usar o MESMO modelo para conversa e ferramentas pode sair mais
    rápido no total, mesmo que ele seja individualmente mais lento.
  • Qualidade não se mede aqui. Depois de escolher pelos números, converse com
    o candidato e veja se ele erra menos.
FIM
