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
#  DIAS_BACKUP (backup mais velho que isso é apagado, 30 — privacidade: o
#  backup tem dado pessoal; o recém-feito fica sempre),
#  REALINHAR=1 (git reset --hard origin/main em vez de pull — descarta
#  mudanças locais do checkout; o .env não é versionado e fica).
#
#  O backup é só do banco, da config e da chave dos pseudônimos do log
#  (stoat.db*, automod-config.json, log-segredo.key), com o
#  container PARADO — SQLite copiado com o bot escrevendo pode sair corrompido.
#  Os modelos de IA, as vozes e os caches que moram no mesmo volume (dezenas de
#  GB) ficam de fora: baixam de novo sozinhos. NUNCA apaga o banco: restaurar
#  guarda o atual antes e só troca esses arquivos.
# ══════════════════════════════════════════════════════════

set -euo pipefail
# (31 out 2026) sem pager: no ssh com TERM desconhecido (xterm-kitty) o `git log` abria o less
export GIT_PAGER=cat PAGER=cat

REPO="${REPO:-/home/void/judy-repo}"
CONTAINER="${CONTAINER:-stoat-bot}"
BACKUPS="${BACKUPS:-/home/void/backups-judy}"
MANTER="${MANTER:-15}"
DIAS_BACKUP="${DIAS_BACKUP:-30}"
ACAO="${1:-tudo}"

erro() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
info() { printf '\033[36m→ %s\033[0m\n' "$1"; }
okay() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
avis() { printf '\033[33m! %s\033[0m\n' "$1"; }

[ -d "$REPO/.git" ] || erro "não achei o checkout em $REPO (defina REPO=…)"
cd "$REPO"
mkdir -p "$BACKUPS"

# (31 out 2026) o receptor de webhooks passou a ficar só em 127.0.0.1 por padrão.
# Quem recebe pela rede de casa ou pela ponte do Docker (Crafty) precisa dizer.
if [ "$ACAO" != "lista" ] && ! grep -qE '^WEBHOOK_BIND=' .env 2>/dev/null; then
  printf '\033[33m! WEBHOOK_BIND não está no .env: o receptor de webhooks fica só em 127.0.0.1 (o Funnel funciona).\n  Crafty pela ponte do Docker: WEBHOOK_BIND=172.17.0.1 (e o Funnel para http://172.17.0.1:8095) ou 0.0.0.0.\033[0m\n'
fi

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
  info "parando o container $CONTAINER para copiar o banco com segurança"
  # (P4, revisão) pelo NOME, sem o compose: antes do pull o compose é o antigo, que exigia
  # variáveis que o dono já pode ter tirado do .env (SEARXNG_SECRET) — e o script morria aqui
  docker stop "$CONTAINER" >/dev/null 2>&1 || avis "o container $CONTAINER não estava de pé"
  info "copiando o volume $vol"
  # (31 out 2026) só o banco e a config: o volume inteiro tem os modelos (dezenas de GB)
  docker run --rm -v "$vol":/data:ro -v "$BACKUPS":/b alpine \
    sh -c "cd /data && tar czf '/b/$(basename "$arq")' \$(ls -d stoat.db* automod-config.json log-segredo.key 2>/dev/null)" \
    || erro "o backup falhou — NADA foi atualizado (suba de novo com: docker start $CONTAINER)"
  # (P2.4) `grep -q` sai no primeiro achado, o tar leva SIGPIPE e o `pipefail` dava "não tem o stoat.db"
  tar tzf "$arq" | grep 'stoat\.db$' >/dev/null || erro "o backup não tem o stoat.db: $arq — NADA foi atualizado"
  okay "backup: $arq ($(du -h "$arq" | cut -f1))"
  # guarda só os MANTER mais novos, e nenhum mais velho que DIAS_BACKUP dias
  ls -1t "$BACKUPS"/stoat-data-*.tgz 2>/dev/null | tail -n +"$((MANTER + 1))" | xargs -r rm -f
  find "$BACKUPS" -maxdepth 1 -name 'stoat-data-*.tgz' -mtime +"$((DIAS_BACKUP - 1))" ! -path "$arq" -print -delete \
    | sed 's|^|  apagado (mais de '"$DIAS_BACKUP"' dias): |' || true
  ULTIMO_BACKUP="$arq"
}

case "$ACAO" in
  lista)
    ls -lht "$BACKUPS"/stoat-data-*.tgz 2>/dev/null || echo "(nenhum backup em $BACKUPS)"
    exit 0 ;;

  backup)
    fazer_backup
    docker start "$CONTAINER" >/dev/null && okay "container de volta"
    exit 0 ;;

  restaurar)
    ARQ="${2:-}"
    [ -f "$ARQ" ] || erro "uso: $0 restaurar <arquivo.tgz>   (veja: $0 lista)"
    tar tzf "$ARQ" | grep 'stoat\.db$' >/dev/null || erro "$ARQ não tem stoat.db"
    printf '\033[33mO banco atual será SUBSTITUÍDO por %s (o atual vai para um backup antes). Continuar? [s/N] \033[0m' "$(basename "$ARQ")"
    read -r R; case "$R" in s|S|y|Y) ;; *) info "cancelado"; exit 0 ;; esac
    MANTER=100000 DIAS_BACKUP=100000 fazer_backup   # o atual, por garantia (sem podar: o arquivo a restaurar pode ser antigo)
    VOL="$(volume)"
    docker run --rm -v "$VOL":/data -v "$(cd "$(dirname "$ARQ")" && pwd)":/b alpine \
      sh -c "rm -f /data/stoat.db /data/stoat.db-wal /data/stoat.db-shm /data/automod-config.json && tar xzf /b/$(basename "$ARQ") -C /data" \
      || erro "a restauração falhou — o banco de antes está em $ULTIMO_BACKUP"
    okay "banco restaurado de $(basename "$ARQ")"
    avis "se o código também tem de voltar: git log --oneline -10  →  git reset --hard <commit>  (e depois docker compose up -d --build)"
    docker start "$CONTAINER" >/dev/null && okay "container de volta"
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
  git log --oneline -20 HEAD..origin/main
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
  git pull -q --ff-only || erro "git pull falhou — o banco está salvo em $ULTIMO_BACKUP; suba de novo com: docker start $CONTAINER"
fi
okay "código em $(git log -1 --format='%h %s' | cut -c1-80)"

# ── 4. Reconstruir e subir ──
info "docker compose up -d --build --remove-orphans (pode levar alguns minutos)"
INICIO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
# (P4) --remove-orphans: o container do SearXNG (a busca do chat IA, que saiu) para e some
docker compose up -d --build --remove-orphans

# ── 5. A subida: o bot leva ~3 min (confere/baixa modelos antes) ──
info "acompanhando a subida (até 6 min; Ctrl+C só para de olhar — o bot continua)"
FIM=$(( $(date +%s) + 360 ))
VISTO=""
while [ "$(date +%s)" -lt "$FIM" ]; do
  LOG="$(docker logs --since "$INICIO" "$CONTAINER" 2>&1 || true)"
  NOVO="$(printf '%s' "$LOG" | grep -E '\[DB\] P4|\[DB\] Banco aberto|Logged in as' | tail -8 || true)"
  if [ "$NOVO" != "$VISTO" ]; then printf '%s\n' "$NOVO" | sed 's/^/   /'; VISTO="$NOVO"; fi
  # o login é o fim da subida (o banco abre e migra antes dele)
  if grep -q 'Logged in as' <<<"$LOG"; then
    sleep 5
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
