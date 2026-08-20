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
  recentes=$(tail -200 "$VOZ_LOG" 2>/dev/null | grep -iE "erro|error" | tail -5)
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
  local env_file="$VOZ_DIR/.env"
  local bin vozes voz
  bin=$(grep -s '^PIPER_BIN=' "$env_file" | cut -d= -f2-)
  vozes=$(grep -s '^PIPER_VOZES=' "$env_file" | cut -d= -f2-)
  voz=$(grep -s '^PIPER_VOZ=' "$env_file" | cut -d= -f2-)
  bin="${bin:-$HOME/.local/share/piper/piper}"
  vozes="${vozes:-$HOME/.local/share/piper/vozes}"
  voz="${voz:-pt_BR-faber-medium}"

  [ -x "$bin" ] || { falha "Piper não encontrado em $bin"; exit 1; }
  printf '%s→ sintetizando: "%s"%s\n' "$C_INFO" "$texto" "$C_OFF"
  echo "$texto" | "$bin" --model "$vozes/$voz.onnx" --output_file /tmp/judy-diag.wav || {
    falha "a síntese falhou"; exit 1; }
  ok "gerado /tmp/judy-diag.wav"
  command -v aplay >/dev/null && aplay -q /tmp/judy-diag.wav && ok "reproduzido" \
    || aviso "ouça com:  aplay /tmp/judy-diag.wav"
}

case "${1:-diag}" in
  logs)      logs "${2:-ambos}" ;;
  erros)     erros ;;
  reiniciar|restart) reiniciar ;;
  falar)     falar "${2:-}" ;;
  diag|"")   diagnostico ;;
  *) echo "uso: $0 [diag|logs [voz|ia]|erros|reiniciar|falar \"texto\"]" ;;
esac
