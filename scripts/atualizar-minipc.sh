#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  atualizar-minipc.sh — sobe a versão nova NO MINIPC, com backup do banco
#
#  Regra: o MiniPC nunca faz commit. Ele só puxa o que o PC enviou
#  (deploy-stoat.sh) e reconstrói o container.
#
#  Instalar (no MiniPC, uma vez):
#     cp /home/void/judy-repo/scripts/atualizar-minipc.sh ~/ && chmod +x ~/atualizar-minipc.sh
#
#  Usar:
#     ~/atualizar-minipc.sh                 → backup + pull + build + log da subida
#     ~/atualizar-minipc.sh backup          → só o backup do banco
#     ~/atualizar-minipc.sh restaurar <arq> → volta o banco de um backup
#     ~/atualizar-minipc.sh lista           → os backups que existem
#
#  Variáveis: REPO (/home/void/judy-repo), CONTAINER (stoat-bot),
#  BACKUPS (/home/void/backups-judy), MANTER (quantos backups guardar, 15),
#  REALINHAR=1 (git reset --hard origin/main em vez de pull — descarta
#  mudanças locais do checkout; o .env não é versionado e fica).
#
#  O backup é do volume /data inteiro (stoat.db + automod-config.json),
#  com o container PARADO — SQLite copiado com o bot escrevendo pode sair
#  corrompido. NUNCA apaga o banco: restaurar guarda o atual antes.
# ══════════════════════════════════════════════════════════

set -euo pipefail

REPO="${REPO:-/home/void/judy-repo}"
CONTAINER="${CONTAINER:-stoat-bot}"
BACKUPS="${BACKUPS:-/home/void/backups-judy}"
MANTER="${MANTER:-15}"
ACAO="${1:-tudo}"

erro() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
info() { printf '\033[36m→ %s\033[0m\n' "$1"; }
okay() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
avis() { printf '\033[33m! %s\033[0m\n' "$1"; }

[ -d "$REPO/.git" ] || erro "não achei o checkout em $REPO (defina REPO=…)"
cd "$REPO"
mkdir -p "$BACKUPS"

# O volume do /data: pergunta ao container (o nome depende da pasta do
# compose — hoje judy-repo_stoat_data). Sem container, cai no nome padrão.
volume() {
  local v
  v="$(docker inspect "$CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' 2>/dev/null || true)"
  [ -n "$v" ] || v="$(basename "$REPO")_stoat_data"
  docker volume inspect "$v" >/dev/null 2>&1 || erro "o volume $v não existe — confira com: docker volume ls"
  printf '%s' "$v"
}

fazer_backup() {
  local vol arq
  vol="$(volume)"
  arq="$BACKUPS/stoat-data-$(date '+%Y%m%d-%H%M%S').tgz"
  info "parando o container para copiar o banco com segurança"
  docker compose stop >/dev/null
  info "copiando o volume $vol"
  docker run --rm -v "$vol":/data:ro -v "$BACKUPS":/b alpine \
    tar czf "/b/$(basename "$arq")" -C /data . \
    || erro "o backup falhou — NADA foi atualizado (suba de novo com: docker compose up -d)"
  tar tzf "$arq" | grep -q 'stoat.db$' || erro "o backup não tem o stoat.db: $arq — NADA foi atualizado"
  okay "backup: $arq ($(du -h "$arq" | cut -f1))"
  # guarda só os MANTER mais novos
  ls -1t "$BACKUPS"/stoat-data-*.tgz 2>/dev/null | tail -n +"$((MANTER + 1))" | xargs -r rm -f
  ULTIMO_BACKUP="$arq"
}

case "$ACAO" in
  lista)
    ls -lht "$BACKUPS"/stoat-data-*.tgz 2>/dev/null || echo "(nenhum backup em $BACKUPS)"
    exit 0 ;;

  backup)
    fazer_backup
    docker compose up -d >/dev/null && okay "container de volta"
    exit 0 ;;

  restaurar)
    ARQ="${2:-}"
    [ -f "$ARQ" ] || erro "uso: $0 restaurar <arquivo.tgz>   (veja: $0 lista)"
    tar tzf "$ARQ" | grep -q 'stoat.db$' || erro "$ARQ não tem stoat.db"
    printf '\033[33mO banco atual será SUBSTITUÍDO por %s (o atual vai para um backup antes). Continuar? [s/N] \033[0m' "$(basename "$ARQ")"
    read -r R; case "$R" in s|S|y|Y) ;; *) info "cancelado"; exit 0 ;; esac
    MANTER=100000 fazer_backup   # o atual, por garantia (sem podar: o arquivo a restaurar pode ser antigo)
    VOL="$(volume)"
    docker run --rm -v "$VOL":/data -v "$(cd "$(dirname "$ARQ")" && pwd)":/b alpine \
      sh -c "find /data -mindepth 1 -delete && tar xzf /b/$(basename "$ARQ") -C /data" \
      || erro "a restauração falhou — o banco de antes está em $ULTIMO_BACKUP"
    okay "banco restaurado de $(basename "$ARQ")"
    avis "se o código também tem de voltar: git log --oneline | head  →  git reset --hard <commit>  (e depois docker compose up -d --build)"
    docker compose up -d >/dev/null && okay "container de volta"
    exit 0 ;;

  tudo) ;;
  *) erro "ação desconhecida: $ACAO (use: tudo | backup | restaurar <arq> | lista)" ;;
esac

# ── 1. O que vai entrar ──
info "buscando o que há de novo no GitHub"
git fetch -q origin
NOVOS="$(git rev-list --count HEAD..origin/main)"
if [ "$NOVOS" = "0" ]; then
  avis "nada novo no origin/main ($(git rev-parse --short HEAD)) — reconstruindo mesmo assim"
else
  info "$NOVOS commit(s) novo(s):"
  git log --oneline HEAD..origin/main | head -20
fi
if [ "${REALINHAR:-0}" != "1" ] && [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no
  erro "o checkout tem mudanças locais (o pull ia travar). Rode com REALINHAR=1 para descartá-las — o .env fica"
fi

# ── 2. Backup do banco (com o container parado) ──
fazer_backup

# ── 3. Código novo ──
if [ "${REALINHAR:-0}" = "1" ]; then
  git reset -q --hard origin/main
else
  git pull -q --ff-only || erro "git pull falhou — o banco está salvo em $ULTIMO_BACKUP; suba de novo com: docker compose up -d"
fi
okay "código em $(git log -1 --format='%h %s' | cut -c1-80)"

# ── 4. Reconstruir e subir ──
info "docker compose up -d --build (pode levar alguns minutos)"
INICIO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
docker compose up -d --build

# ── 5. A subida: o bot leva ~3 min (confere/baixa modelos antes) ──
info "acompanhando a subida (até 6 min; Ctrl+C só para de olhar — o bot continua)"
FIM=$(( $(date +%s) + 360 ))
VISTO=""
while [ "$(date +%s)" -lt "$FIM" ]; do
  LOG="$(docker logs --since "$INICIO" "$CONTAINER" 2>&1 || true)"
  if printf '%s' "$LOG" | grep -q 'falha na migração v4'; then
    printf '%s\n' "$LOG" | grep -E '\[RPG\]' | tail -5
    printf '\n\033[31m✗ a migração do RPG falhou — o &game fica "em manutenção", o resto do bot segue.\033[0m\n'
    printf '  Nada do jogo foi gravado. Mande este log para análise. Backup: %s\n' "$ULTIMO_BACKUP"
    exit 1
  fi
  NOVO="$(printf '%s' "$LOG" | grep -E '\[RPG\]|\[DB\] Banco aberto|Logged in as' | tail -8 || true)"
  if [ "$NOVO" != "$VISTO" ]; then printf '%s\n' "$NOVO" | sed 's/^/   /'; VISTO="$NOVO"; fi
  # "catálogo pronto" vem depois do login; a migração roda logo em seguida
  if printf '%s' "$LOG" | grep -q '\[RPG\] catálogo pronto'; then
    sleep 5
    docker logs --since "$INICIO" "$CONTAINER" 2>&1 | grep -q 'falha na migração v4' && continue
    break
  fi
  if [ "$(docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null)" != "true" ]; then
    docker logs --tail 40 "$CONTAINER" 2>&1 | sed 's/^/   /'
    erro "o container parou — veja o log acima. Banco salvo em $ULTIMO_BACKUP"
  fi
  sleep 10
done

echo
okay "no ar: $(docker inspect "$CONTAINER" --format 'desde {{.State.StartedAt}} · reinícios {{.RestartCount}}')"
info "backup desta subida: $ULTIMO_BACKUP"
info "voltar atrás (banco):  ~/atualizar-minipc.sh restaurar $ULTIMO_BACKUP"
info "ver o log ao vivo:     docker logs -f $CONTAINER"
