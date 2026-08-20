#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  judy-diag.sh — diagnóstico e logs dos serviços no Gentoo
#
#  A cadeia da voz tem seis elos (Ollama → judy-ia → Piper → judy-voz →
#  LiveKit → Stoat) e, quando algo não funciona, o sintoma é sempre o
#  mesmo: "o bot não falou". Este script diz QUAL elo quebrou, em vez de
#  deixar você abrir cinco terminais para descobrir.
#
#  Uso:
#    judy-diag.sh              → diagnóstico completo (padrão)
#    judy-diag.sh logs         → acompanha os dois logs ao vivo
#    judy-diag.sh logs voz     → só o judy-voz
#    judy-diag.sh logs ia      → só o judy-ia
#    judy-diag.sh erros        → só as linhas de erro das últimas 24h
#    judy-diag.sh reiniciar    → reinicia os dois serviços
#    judy-diag.sh falar "oi"   → testa a síntese do Piper direto
# ══════════════════════════════════════════════════════════

set -uo pipefail

VOZ_LOG="${VOZ_LOG:-/var/log/judy-voz.log}"
IA_LOG="${IA_LOG:-/var/log/judy-ia.log}"
VOZ_PORTA="${VOZ_PORTA:-8091}"
IA_PORTA="${IA_PORTA:-8090}"
OLLAMA="${OLLAMA_URL:-http://localhost:11434}"
VOZ_DIR="${VOZ_DIR:-$HOME/Downloads/github/voz-servico}"

C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_WARN=$'\033[33m'; C_INFO=$'\033[36m'; C_OFF=$'\033[0m'
ok()   { printf '%s✓%s %s\n' "$C_OK" "$C_OFF" "$1"; }
falha(){ printf '%s✗%s %s\n' "$C_ERR" "$C_OFF" "$1"; }
aviso(){ printf '%s!%s %s\n' "$C_WARN" "$C_OFF" "$1"; }
titulo(){ printf '\n%s── %s ──%s\n' "$C_INFO" "$1" "$C_OFF"; }

# ── Diagnóstico ───────────────────────────────────────────
diagnostico() {
  local problemas=0

  titulo "Serviços"
  # A arquitetura deste Gentoo é MISTA e isso já custou uma hora de
  # investigação: o Ollama roda nativo, o judy-ia roda em CONTAINER Docker
  # e o judy-voz roda nativo (precisa dos binários do LiveKit e do Piper).
  # Checar tudo com `rc-service` fazia o judy-ia aparecer como morto enquanto
  # respondia normalmente — e sugeria "instale o OpenRC", que era o conselho
  # errado. Aqui cada serviço é checado do jeito que ele realmente roda.

  # judy-voz: nativo, via OpenRC
  if rc-service judy-voz status >/dev/null 2>&1; then
    ok "judy-voz rodando como serviço (sobrevive a reboot)"
  elif curl -sf --max-time 3 "http://localhost:$VOZ_PORTA/saude" >/dev/null 2>&1; then
    aviso "judy-voz VIVO mas fora do OpenRC — some no próximo reboot"
    aviso "   registre:  sudo cp scripts/openrc/judy-voz /etc/init.d/ && sudo rc-update add judy-voz default"
  else
    falha "judy-voz NÃO está rodando  →  sudo rc-service judy-voz start"
    problemas=$((problemas+1))
  fi

  # judy-ia: container Docker
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "judy-ia"; then
    local st; st=$(docker ps --format '{{.Names}}\t{{.Status}}' | grep -P '^judy-ia\t' | cut -f2)
    ok "judy-ia em container — $st"
  elif curl -sf --max-time 3 "http://localhost:$IA_PORTA/saude" >/dev/null 2>&1; then
    ok "judy-ia respondendo (fora do Docker)"
  else
    falha "judy-ia parado  →  cd ia-servico && docker compose up -d"
    problemas=$((problemas+1))
  fi

  titulo "Ollama (a IA)"
  if curl -sf --max-time 3 "$OLLAMA/api/tags" >/dev/null 2>&1; then
    local n; n=$(curl -sf "$OLLAMA/api/tags" | grep -o '"name"' | wc -l)
    ok "respondendo — $n modelo(s)"
  else
    falha "não responde em $OLLAMA  →  sudo rc-service ollama start"
    problemas=$((problemas+1))
  fi

  titulo "judy-ia (ferramentas)"
  if curl -sf --max-time 3 "http://localhost:$IA_PORTA/saude" >/dev/null 2>&1; then
    ok "respondendo na porta $IA_PORTA"
  else
    falha "não responde na porta $IA_PORTA"
    aviso "   é um container: cd ia-servico && docker compose up -d --build"
    problemas=$((problemas+1))
  fi

  titulo "judy-voz (voz nas calls)"
  local saude
  saude=$(curl -sf --max-time 5 "http://localhost:$VOZ_PORTA/saude" 2>/dev/null)
  if [ -z "$saude" ]; then
    falha "não responde na porta $VOZ_PORTA"
    aviso "veja o porquê:  tail -30 $VOZ_LOG"
    problemas=$((problemas+1))
  else
    ok "respondendo na porta $VOZ_PORTA"

    # Piper
    if echo "$saude" | grep -q '"piper":{"ok":true'; then
      local voz; voz=$(echo "$saude" | grep -o '"vozAtual":"[^"]*"' | cut -d'"' -f4)
      ok "Piper pronto — voz: ${voz:-?}"
    else
      local e; e=$(echo "$saude" | grep -o '"erro":"[^"]*"' | head -1 | cut -d'"' -f4)
      falha "Piper indisponível: ${e:-desconhecido}"
      aviso "instale com:  bash scripts/instalar-piper.sh"
      problemas=$((problemas+1))
    fi

    # LiveKit / revoice
    if echo "$saude" | grep -q '"pronto":true'; then
      ok "revoice/LiveKit pronto"
    else
      local e; e=$(echo "$saude" | grep -o '"erro":"[^"]*"' | tail -1 | cut -d'"' -f4)
      falha "revoice/LiveKit indisponível: ${e:-desconhecido}"
      problemas=$((problemas+1))
    fi

    # Chave
    if echo "$saude" | grep -q '"chaveExigida":true'; then
      ok "protegido por chave"
    else
      aviso "SEM chave — qualquer coisa na Tailscale pode fazer o bot falar"
      aviso "gere uma:  openssl rand -hex 24   → VOZ_CHAVE no $VOZ_DIR/.env"
    fi
  fi

  titulo "Configuração"
  [ -f "$VOZ_DIR/.env" ] && ok ".env presente" || {
    falha "falta $VOZ_DIR/.env  →  cp ~/judy-voz.env $VOZ_DIR/.env"; problemas=$((problemas+1)); }
  [ -d "$VOZ_DIR/node_modules" ] && ok "dependências instaladas" || {
    falha "faltam dependências  →  cd $VOZ_DIR && npm install"; problemas=$((problemas+1)); }

  titulo "Erros recentes"
  # O título dizia "últimas 2h" mas mostrava o log inteiro — erros já
  # resolvidos ficavam assombrando o diagnóstico como se fossem atuais.
  # Agora olhamos só o fim do arquivo, que é o que de fato é recente.
  local recentes
  # Erros do axios vêm como um objeto gigante despejado em dezenas de linhas
  # (onerror, Symbol(errored), isAxiosError...). Mostrar isso cru não ajuda
  # ninguém: filtramos as linhas de ruído e ficamos com a mensagem.
  recentes=$(tail -200 "$VOZ_LOG" 2>/dev/null \
    | grep -iE "erro|error" \
    | grep -vE "^\s*(onerror|Symbol\(|isAxiosError|at |\.\.\.|\}|\{|[a-zA-Z_]+: \[Function)" \
    | tail -5)
  if [ -n "$recentes" ]; then
    echo "$recentes" | sed 's/^/   /'
  else
    ok "nenhum erro registrado"
  fi

  echo
  if [ "$problemas" -eq 0 ]; then
    printf '%s════ tudo no lugar ════%s\n' "$C_OK" "$C_OFF"
  else
    printf '%s════ %s problema(s) — veja as sugestões acima ════%s\n' "$C_ERR" "$problemas" "$C_OFF"
  fi
}

# ── Logs ao vivo ──────────────────────────────────────────
logs() {
  case "${1:-ambos}" in
    voz) tail -f "$VOZ_LOG" ;;
    ia)  tail -f "$IA_LOG" ;;
    *)   echo "Acompanhando os dois (Ctrl-C para sair)"
         tail -f "$VOZ_LOG" "$IA_LOG" ;;
  esac
}

erros() {
  titulo "Erros nos logs"
  grep -hiE "erro|error|falha|failed|ECONN|timeout" "$VOZ_LOG" "$IA_LOG" 2>/dev/null \
    | tail -40 | sed 's/^/   /' || echo "   nenhum"
}

reiniciar() {
  for s in judy-voz judy-ia; do
    printf '%s→ reiniciando %s%s\n' "$C_INFO" "$s" "$C_OFF"
    sudo rc-service "$s" restart
  done
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
  for t in 1.00 1.08 1.12 1.16 1.20 1.25 1.30; do
    echo
    printf '%s tom %s %s\n' "$C_INFO" "$t" "$C_OFF"
    falar "$texto" "$voz" "tom:$t"
    sleep 0.6
  done
  echo
  info "quando achar o seu:  &tts efeito tom:1.16   (no chat)"
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
  falar "texto" [voz] [efeito]  testa uma voz  (ex.: falar "oi" pt_BR-dii-medium glados)
  comparar "texto" [efeito]     toca o mesmo texto em TODAS as vozes instaladas
  efeitos "texto" [voz]         toca o mesmo texto em TODOS os efeitos
  tons "texto" [voz]            escada de tom (1.00 a 1.30) para achar o seu

Efeitos: nenhum, feminina, sedutora, suave, glados, robo, radio,
         grave, agudo, sussurro, tom:<n> (ex.: tom:1.16)
AJUDA
     ;;
esac
