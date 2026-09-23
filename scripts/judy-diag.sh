#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  judy-diag.sh — diagnóstico do bot na máquina onde ele roda
#
#  Hoje é UM container (bot + ia-servico + voz opcional). Quando algo não
#  funciona, o sintoma costuma ser o mesmo — "o bot não falou" — e este
#  script diz onde quebrou: container, IA, voz ou configuração.
#
#  Uso:
#    judy-diag.sh              → diagnóstico completo (padrão)
#    judy-diag.sh logs         → acompanha o log do container ao vivo
#    judy-diag.sh logs voz     → só as linhas de voz/TTS/música
#    judy-diag.sh logs ia      → só as linhas de IA/chat/ferramentas
#    judy-diag.sh erros        → só as linhas de erro das últimas 24h
#    judy-diag.sh reiniciar    → reinicia o container
#    judy-diag.sh falar "oi"   → testa a síntese do Piper direto
#
#  Variáveis: CONTAINER (padrão stoat-bot), IA_PORTA (8090), VOZ_PORTA (8091).
#  Os testes de voz (falar/comparar/tom) usam o Piper da MÁQUINA: servem para
#  quem mantém a voz nativa (VOZ_ATIVA=0 + VOZ_SERVICO_URL).
# ══════════════════════════════════════════════════════════

set -uo pipefail

CONTAINER="${CONTAINER:-stoat-bot}"
VOZ_PORTA="${VOZ_PORTA:-8091}"
IA_PORTA="${IA_PORTA:-8090}"
IA_PORTA="${IA_PORTA:-8090}"
VOZ_DIR="${VOZ_DIR:-$HOME/Downloads/github/voz-servico}"

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_INFO=$'\033[36m'; C_OFF=$'\033[0m'
ok()   { printf '%s✓%s %s\n' "$C_OK" "$C_OFF" "$1"; }
falha(){ printf '%s✗%s %s\n' "$C_ERR" "$C_OFF" "$1"; }
aviso(){ printf '%s!%s %s\n' "$C_WARN" "$C_OFF" "$1"; }
titulo(){ printf '\n%s── %s ──%s\n' "$C_INFO" "$1" "$C_OFF"; }

# ── Diagnóstico ───────────────────────────────────────────
diagnostico() {
  local problemas=0

  # Tudo roda num container só (bot + ia-servico + voz opcional). A versão
  # antiga desta função checava uma cadeia que não existe mais — Ollama nativo,
  # judy-ia em container e judy-voz por OpenRC — e mandava rodar
  # `rc-service ollama start`, conselho errado desde a migração.
  titulo "Container"
  if ! command -v docker >/dev/null 2>&1; then
    falha "docker não encontrado nesta máquina"
    return 1
  fi
  local st
  st=$(docker ps --filter "name=$CONTAINER" --format '{{.Status}}' | head -1)
  if [ -n "$st" ]; then
    ok "$CONTAINER — $st"
  else
    falha "$CONTAINER não está rodando  →  docker compose up -d"
    problemas=$((problemas+1))
  fi

  titulo "IA (dentro do container)"
  local saude
  saude=$(docker exec "$CONTAINER" curl -sf --max-time 5 "http://127.0.0.1:$IA_PORTA/saude" 2>/dev/null)
  if [ -n "$saude" ]; then
    if echo "$saude" | grep -q '"alcancavel":true'; then
      ok "ia-servico responde e alcança o LLM"
    else
      aviso "ia-servico responde, mas NÃO alcança o LLM (confira LLM_URL / IA_MODO)"
      problemas=$((problemas+1))
    fi
    echo "$saude" | grep -o '"ferramentas":\[[^]]*\]' | head -1
  else
    falha "ia-servico mudo na porta $IA_PORTA  →  docker logs $CONTAINER"
    problemas=$((problemas+1))
  fi

  titulo "Voz"
  if docker exec "$CONTAINER" curl -sf --max-time 5 "http://127.0.0.1:$VOZ_PORTA/saude" >/dev/null 2>&1; then
    ok "voz embutida respondendo na porta $VOZ_PORTA"
  elif [ -n "${VOZ_SERVICO_URL:-}" ] && curl -sf --max-time 5 "$VOZ_SERVICO_URL/saude" >/dev/null 2>&1; then
    ok "voz externa respondendo em $VOZ_SERVICO_URL"
  else
    aviso "voz não responde — normal se VOZ_ATIVA=0 e não há serviço externo"
  fi

  titulo "Configuração que CHEGOU ao container"
  # O .env inteiro entra pelo env_file; o que vale é o que está aqui dentro.
  docker exec "$CONTAINER" printenv 2>/dev/null \
    | grep -E '^(IA|IA_MODO|MODELO|MODELO_VISAO|LLM_URL|VOZ_ATIVA|IMAGEM|SD_MODELO_TIPO|SEARXNG_URL|LLAMA_CTX)=' \
    | sed 's/^/   /' || aviso "não consegui ler o ambiente do container"

  titulo "Erros recentes"
  local erros
  erros=$(docker logs --since 24h "$CONTAINER" 2>&1 | grep -ciE '\[(ERRO|FATAL)\]|Error:' || true)
  if [ "${erros:-0}" -gt 0 ]; then
    aviso "$erros linha(s) de erro nas últimas 24h  →  $0 erros"
  else
    ok "nenhum erro nas últimas 24h"
  fi

  echo
  if [ "$problemas" -eq 0 ]; then
    printf '%s════ tudo no lugar ════%s\n' "$C_OK" "$C_OFF"
  else
    printf '%s════ %s problema(s) — veja as sugestões acima ════%s\n' "$C_ERR" "$problemas" "$C_OFF"
  fi
}

# ── Logs ao vivo ──────────────────────────────────────────
# Com tudo num container só, o log é um só: o do docker. Os arquivos
# /var/log/judy-*.log eram da época dos serviços nativos e não existem mais.
logs() {
  local filtro=""
  case "${1:-tudo}" in
    voz) filtro='\[(VOZ|TTS|MUSICA)\]' ;;
    ia)  filtro='\[(IA|CHAT|FERRAMENTA)\]' ;;
  esac
  echo "Acompanhando ${1:-tudo} em $CONTAINER (Ctrl-C para sair)"
  if [ -n "$filtro" ]; then
    docker logs -f --tail 50 "$CONTAINER" 2>&1 | grep -E --line-buffered "$filtro"
  else
    docker logs -f --tail 50 "$CONTAINER" 2>&1
  fi
}

erros() {
  titulo "Erros nas últimas 24h"
  docker logs --since 24h "$CONTAINER" 2>&1 \
    | grep -iE "erro|error|falha|failed|ECONN|timeout" \
    | tail -40 | sed 's/^/   /' || echo "   nenhum"
}

reiniciar() {
  printf '%s→ reiniciando %s%s\n' "$C_INFO" "$CONTAINER" "$C_OFF"
  # `restart` NÃO aplica variável nova do .env: para isso é --force-recreate.
  docker restart "$CONTAINER"
  sleep 2
  diagnostico
}

falar() {
  local texto="${1:-Teste da voz da Judy.}"
  local voz_pedida="${2:-}"
  local efeito="${3:-}"
  local env_file="$VOZ_DIR/.env"
  local bin vozes voz
  bin=$(grep -s '^PIPER_BIN=' "$env_file" | cut -d= -f2-)
  vozes=$(grep -s '^PIPER_VOZES=' "$env_file" | cut -d= -f2-)
  voz=$(grep -s '^PIPER_VOZ=' "$env_file" | cut -d= -f2-)
  bin="${bin:-$HOME/.local/share/piper/piper}"
  vozes="${vozes:-$HOME/.local/share/piper/vozes}"
  voz="${voz_pedida:-${voz:-pt_BR-faber-medium}}"

  [ -x "$bin" ] || { falha "Piper não encontrado em $bin"; exit 1; }
  [ -f "$vozes/$voz.onnx" ] || {
    falha "voz '$voz' não encontrada em $vozes"
    aviso "instaladas: $(ls "$vozes"/*.onnx 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/\.onnx$//' | tr '\n' ' ')"
    exit 1; }

  printf '%s→ voz: %s%s%s\n' "$C_INFO" "$voz" "${efeito:+  |  efeito: $efeito}" "$C_OFF"
  echo "$texto" | "$bin" --model "$vozes/$voz.onnx" --output_file /tmp/judy-diag.wav || {
    falha "a síntese falhou"; exit 1; }

  # Aplica o mesmo efeito que o bot aplicaria — a cadeia vive no tts.js, e
  # duplicá-la aqui só criaria duas versões para desincronizar. Lemos de lá.
  if [ -n "$efeito" ] && [ "$efeito" != "nenhum" ]; then
    # A cadeia de filtros vive no serviço, que a expõe em /efeitos. Buscar
    # de lá garante que o teste soe igual ao que a call vai ouvir — copiar a
    # cadeia para cá criaria duas versões para desincronizar.
    # Ler com o Node, não com grep: as cadeias de filtro CONTÊM vírgulas
    # (`highpass=f=200,lowpass=f=6500,...`), então qualquer recorte por
    # vírgula parte a cadeia no meio e devolve lixo.
    local cadeia node_bin
    node_bin=$(command -v node || echo /usr/bin/node)
    cadeia=$(curl -fsL "http://localhost:$VOZ_PORTA/efeitos" 2>/dev/null \
      | "$node_bin" -e "
        let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
          try{ const e=JSON.parse(d)['$efeito']; if(e) process.stdout.write(e); }catch{}
        });" 2>/dev/null)

    if [ -n "$cadeia" ]; then
      local ff node_bin
      node_bin=$(command -v node || echo /usr/bin/node)
      ff=$("$node_bin" -e "try{process.stdout.write(require('$VOZ_DIR/node_modules/ffmpeg-static'))}catch{process.stdout.write('ffmpeg')}" 2>/dev/null || echo ffmpeg)
      "$ff" -hide_banner -loglevel error -i /tmp/judy-diag.wav -af "$cadeia" \
        -ar 48000 -ac 1 -y /tmp/judy-diag-fx.wav 2>/dev/null \
        && mv /tmp/judy-diag-fx.wav /tmp/judy-diag.wav \
        && ok "efeito aplicado" \
        || aviso "o efeito falhou — ouvindo sem ele"
    else
      aviso "não consegui obter o efeito '$efeito' (o judy-voz está rodando?) — ouvindo sem ele"
    fi
  fi

  ok "gerado /tmp/judy-diag.wav"
  command -v aplay >/dev/null && aplay -q /tmp/judy-diag.wav && ok "reproduzido" \
    || aviso "ouça com:  aplay /tmp/judy-diag.wav"
}

# Toca com um deslocamento de tom, sem efeito de caráter.
falar_tom() {
  local texto="$1" voz="$2" t="$3"
  local vozes bin
  vozes=$(grep -s '^PIPER_VOZES=' "$VOZ_DIR/.env" | cut -d= -f2-)
  bin=$(grep -s '^PIPER_BIN=' "$VOZ_DIR/.env" | cut -d= -f2-)
  vozes="${vozes:-$HOME/.local/share/piper/vozes}"
  bin="${bin:-$HOME/.local/share/piper/piper}"
  [ -n "$voz" ] || voz=$(grep -s '^PIPER_VOZ=' "$VOZ_DIR/.env" | cut -d= -f2-)

  echo "$texto" | "$bin" --model "$vozes/$voz.onnx" --output_file /tmp/judy-diag.wav 2>/dev/null || {
    falha "síntese falhou"; return 1; }

  if [ "$t" != "1.00" ] && [ "$t" != "1" ]; then
    local ff node_bin
    node_bin=$(command -v node || echo /usr/bin/node)
    ff=$("$node_bin" -e "try{process.stdout.write(require('$VOZ_DIR/node_modules/ffmpeg-static'))}catch{process.stdout.write('ffmpeg')}" 2>/dev/null || echo ffmpeg)
    "$ff" -hide_banner -loglevel error -i /tmp/judy-diag.wav \
      -af "rubberband=pitch=$t:formant=shifted" -ar 48000 -y /tmp/judy-tom.wav 2>/dev/null \
      && mv /tmp/judy-tom.wav /tmp/judy-diag.wav
  fi
  command -v aplay >/dev/null && aplay -q /tmp/judy-diag.wav || aviso "ouça: aplay /tmp/judy-diag.wav"
}

# Varre valores de TOM com a mesma voz e o mesmo texto.
#
# Existe porque o número certo não se descobre no papel: depende da voz base,
# e a diferença entre "homem falando fino" e "voz feminina" mora em poucos
# centésimos. Ouvir a escada inteira resolve em dois minutos o que ficaria
# em tentativa e erro por uma tarde.
tons() {
  local texto="${1:-Olá, tudo bem com você?}"
  local voz="${2:-}"
  titulo "Escada de tom — ouça e escolha o número"
  # Faixa útil para voz JÁ feminina fica perto de 1.0 — passar de 1.05
  # começa a soar infantil. Para voz masculina, o interessante é 1.12–1.22.
  for t in 0.92 0.96 1.00 1.04 1.08 1.14 1.20; do
    echo
    printf '%s tom %s %s\n' "$C_INFO" "$t" "$C_OFF"
    falar_tom "$texto" "$voz" "$t"
    sleep 0.6
  done
  echo
  info "quando achar o seu:  &tts tom 1.04   (no chat)"
}

# Toca o mesmo texto em todos os efeitos, para comparar o caráter de cada um.
efeitos() {
  local texto="${1:-Olá, eu sou a Judy.}"
  local voz="${2:-}"
  local lista
  lista=$(curl -fsL "http://localhost:$VOZ_PORTA/efeitos" 2>/dev/null \
    | "$(command -v node || echo /usr/bin/node)" -e "
      let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        try{ process.stdout.write(Object.keys(JSON.parse(d)).join(' ')); }catch{}
      });" 2>/dev/null)
  [ -n "$lista" ] || { falha "não consegui listar os efeitos (o judy-voz está rodando?)"; exit 1; }

  titulo "Comparando os efeitos"
  for e in $lista; do
    [ "$e" = "nenhum" ] && continue
    echo
    falar "$texto" "$voz" "$e"
    sleep 0.6
  done
  echo
  info "quando escolher:  &tts efeito <nome>   (no chat)"
}

# Compara TODAS as vozes instaladas com o mesmo texto — a forma mais rápida
# de escolher, porque o que importa é como soa, não o nome do arquivo.
comparar() {
  local texto="${1:-Olá! Esta é a minha voz.}"
  local efeito="${2:-}"
  local vozes
  vozes=$(grep -s '^PIPER_VOZES=' "$VOZ_DIR/.env" | cut -d= -f2-)
  vozes="${vozes:-$HOME/.local/share/piper/vozes}"

  local lista
  lista=$(ls "$vozes"/*.onnx 2>/dev/null | xargs -n1 basename 2>/dev/null | sed 's/\.onnx$//')
  [ -n "$lista" ] || { falha "nenhuma voz instalada em $vozes"; exit 1; }

  titulo "Comparando as vozes instaladas"
  for v in $lista; do
    echo
    falar "$texto" "$v" "$efeito"
    sleep 1
  done
  echo
  info "para usar a escolhida:  &tts voz <nome>   (no chat, sem reiniciar nada)"
}

case "${1:-diag}" in
  logs)      logs "${2:-ambos}" ;;
  erros)     erros ;;
  reiniciar|restart) reiniciar ;;
  falar)     falar "${2:-}" "${3:-}" "${4:-}" ;;
  comparar|compare) comparar "${2:-}" "${3:-}" ;;
  tons|tom)  tons "${2:-}" "${3:-}" ;;
  efeitos)   efeitos "${2:-}" "${3:-}" ;;
  vozes)     ls "$(grep -s '^PIPER_VOZES=' "$VOZ_DIR/.env" | cut -d= -f2- || echo "$HOME/.local/share/piper/vozes")"/*.onnx 2>/dev/null | xargs -n1 basename | sed 's/\.onnx$//' ;;
  diag|"")   diagnostico ;;
  *) cat <<AJUDA
uso: $0 <comando>

  diag                          diagnóstico completo (padrão)
  logs [voz|ia]                 acompanha os logs ao vivo
  erros                         só as linhas de erro recentes
  reiniciar                     reinicia os serviços
  vozes                         lista as vozes instaladas
  falar "texto" [voz] [efeito]  testa uma voz  (ex.: falar "oi" pt_BR-dii glados)
  comparar "texto" [efeito]     toca o mesmo texto em TODAS as vozes instaladas
  efeitos "texto" [voz]         toca o mesmo texto em TODOS os efeitos
  tons "texto" [voz]            escada de tom (0.92 a 1.20) para achar o seu

Efeitos (caráter): nenhum, glados, robo, radio, sedutora, suave, sussurro
Tom é separado:    tons "texto" [voz]   →  depois  &tts tom <n>  no chat
AJUDA
     ;;
esac
