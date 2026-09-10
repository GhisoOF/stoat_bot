#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  deploy-stoat.sh — sobe uma nova versão do bot para o GitHub
#  (versão container único: bot + ia-servico embutido, voz opcional)
#
#  ESTE ARQUIVO MORA FORA DO REPOSITÓRIO (em ~/), de propósito:
#  o deploy apaga e recria diretórios do repo, e um script que
#  apaga a si mesmo enquanto roda é uma péssima ideia.
#
#  Instalar/atualizar:
#     cp scripts/deploy-stoat.sh ~/deploy-stoat.sh && chmod +x ~/deploy-stoat.sh
#
#  Usar:
#     ~/deploy-stoat.sh ~/Downloads/stoat_bot-publico.zip "mensagem do commit"
# ══════════════════════════════════════════════════════════

set -euo pipefail

REPO="${REPO:-$HOME/Downloads/github}"
TOKEN_BACKUP="${TOKEN_BACKUP:-$HOME/judy-github.env}"
IA_ENV_BACKUP="${IA_ENV_BACKUP:-$HOME/judy-ia.env}"
VOZ_ENV_BACKUP="${VOZ_ENV_BACKUP:-$HOME/judy-voz.env}"
# Backup do .env DA RAIZ — agora é ele que manda: o container único lê tudo
# dali (BOT_TOKEN, LLM_URL, SUPER_ADMINS…). O do ia-servico virou coadjuvante.
ENV_BACKUP="${ENV_BACKUP:-$HOME/judy-bot.env}"
ZIP="${1:-}"
MSG="${2:-}"
TMP="$(mktemp -d)"

trap 'rm -rf "$TMP"' EXIT

erro() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
info() { printf '\033[36m→ %s\033[0m\n' "$1"; }
okay() { printf '\033[32m✓ %s\033[0m\n' "$1"; }
avis() { printf '\033[33m! %s\033[0m\n' "$1"; }

# ── Conferências antes de tocar em qualquer coisa ──
[ -n "$ZIP" ] || erro "uso: $0 <caminho-do-zip> [mensagem do commit]"
[ -f "$ZIP" ] || erro "zip não encontrado: $ZIP"
[ -d "$REPO/.git" ] || erro "não é um repositório git: $REPO"

ZIP="$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")"   # caminho absoluto

# O zip não pode estar DENTRO do repositório: é assim que ele acaba commitado.
case "$ZIP" in
  "$REPO"/*) info "o zip está dentro do repositório; movendo para fora primeiro"
             mv "$ZIP" "$HOME/$(basename "$ZIP")"
             ZIP="$HOME/$(basename "$ZIP")" ;;
esac

# ── 1. Abrir o pacote fora do repositório ──
info "abrindo o pacote em $TMP"
unzip -q "$ZIP" -d "$TMP"
# O conteúdo pode vir na raiz do zip ou embrulhado numa pasta única
# (stoat_bot/…) — aceita os dois.
FONTE="$TMP"
if [ ! -f "$FONTE/main.js" ]; then
  UNICA="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d | head -1)"
  [ -n "$UNICA" ] && [ -f "$UNICA/main.js" ] && FONTE="$UNICA"
fi
[ -f "$FONTE/main.js" ] || erro "o zip não parece ser o projeto (não achei main.js)"
okay "pacote válido: $(find "$FONTE" -type f | wc -l) arquivo(s)"

# ── 2. Guardar os .env que o passo 3 pode levar junto ──
cd "$REPO"
[ -f .env ]             && cp .env "$ENV_BACKUP"                 && okay ".env da raiz guardado em $ENV_BACKUP"
[ -f ia-servico/.env ]  && cp ia-servico/.env "$IA_ENV_BACKUP"   && okay "ia-servico/.env guardado em $IA_ENV_BACKUP"
[ -f voz-servico/.env ] && cp voz-servico/.env "$VOZ_ENV_BACKUP" && okay "voz-servico/.env guardado em $VOZ_ENV_BACKUP"

# ── 3. Substituir os diretórios versionados ──
info "removendo as versões antigas dos módulos"
git rm -rq --ignore-unmatch modulos scripts ia-servico 2>/dev/null || true
rm -rf modulos scripts ia-servico

info "copiando os arquivos novos"
cp -a "$FONTE"/. "$REPO"/

# Aposentados do layout antigo: se um zip velho (ou sobra local) os trouxer
# de volta, saem aqui. Um deploy não pode ressuscitar o que foi removido.
info "varrendo arquivos aposentados"
rm -f teste-radar.mjs docker-compose.image.yml \
      modulos/ferramentas/radar.js modulos/moderacao/servidores.js \
      ia-servico/Dockerfile ia-servico/docker-compose.yml \
      ia-servico/docker-compose.example.yml
# Lixo que não pode ir para um repositório público:
rm -f ./*.zip ./_stoat-bot*_logs.txt

# ── 4. Devolver os .env (nunca sobrescrevendo um existente) ──
if [ ! -f .env ] && [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" .env
  okay ".env da raiz devolvido ($(wc -l < .env) linhas)"
fi
mkdir -p ia-servico
if [ ! -f ia-servico/.env ]; then
  if   [ -f "$IA_ENV_BACKUP" ]; then cp "$IA_ENV_BACKUP" ia-servico/.env; okay "ia-servico/.env devolvido"
  elif [ -f "$TOKEN_BACKUP" ];  then cp "$TOKEN_BACKUP" ia-servico/.env; avis "só havia o backup do token em ia-servico/.env"
  fi
fi
if [ -d voz-servico ] && [ ! -f voz-servico/.env ] && [ -f "$VOZ_ENV_BACKUP" ]; then
  cp "$VOZ_ENV_BACKUP" voz-servico/.env
  okay "BOT_TOKEN/VOZ_CHAVE devolvidos a voz-servico/.env"
fi

# ── 4b. O .env da raiz agora é o coração — conferir o mínimo vital ──
FALTA=""
for VAR in BOT_TOKEN LLM_URL SUPER_ADMINS; do
  grep -q "^${VAR}=" .env 2>/dev/null || FALTA="$FALTA $VAR"
done
if [ -n "$FALTA" ]; then
  avis "faltam no .env da raiz:$FALTA — o container único precisa deles"
  avis "acrescente antes de subir o container (o push pode seguir normalmente)"
fi
if grep -q "^IA_SERVICO_URL=" .env 2>/dev/null; then
  avis "IA_SERVICO_URL definido no .env — remova: o serviço agora é embutido (localhost:8090)"
fi

# ── 4c. Dependências do serviço nativo que sobrou (a voz) ──
# O ia-servico roda DENTRO do container do bot; as dependências dele vão na
# imagem, o npm local não interessa mais. Só a voz continua nativa (OpenRC).
if [ -f voz-servico/package.json ] && [ ! -d voz-servico/node_modules ]; then
  info "instalando dependências de voz-servico"
  (cd voz-servico && npm install --silent) \
    && okay "voz-servico pronto" \
    || avis "npm install falhou em voz-servico — rode à mão antes de reiniciar o serviço"
fi

# ── 4d. O judy-ia nativo/antigo tem de PARAR, não reiniciar ──
# Se ele continuar de pé, vira um segundo cérebro respondendo em paralelo
# ao embutido — o pior estado possível, porque tudo "parece" funcionar.
if command -v rc-service >/dev/null 2>&1; then
  if rc-service judy-ia status >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null; then
      sudo rc-service judy-ia stop >/dev/null 2>&1 && sudo rc-update del judy-ia >/dev/null 2>&1 \
        && okay "judy-ia (OpenRC) parado e fora do boot — agora ele vive dentro do container" \
        || avis "não consegui parar o judy-ia — rode: sudo rc-service judy-ia stop && sudo rc-update del judy-ia"
    else
      printf '\033[31m\n╔════════════════════════════════════════════════════════╗\033[0m\n'
      printf '\033[31m║  ATENÇÃO: o judy-ia antigo AINDA está rodando          ║\033[0m\n'
      printf '\033[31m╚════════════════════════════════════════════════════════╝\033[0m\n'
      printf '   Rode:  \033[36msudo rc-service judy-ia stop && sudo rc-update del judy-ia\033[0m\n\n'
    fi
  fi
  # A voz continua nativa: essa sim reinicia para carregar código novo.
  if rc-service judy-voz status >/dev/null 2>&1; then
    if sudo -n true 2>/dev/null; then
      sudo rc-service judy-voz restart >/dev/null 2>&1 \
        && okay "judy-voz reiniciado" \
        || avis "judy-voz NÃO reiniciou — rode: sudo rc-service judy-voz restart"
    else
      avis "reinicie a voz à mão: sudo rc-service judy-voz restart"
    fi
  fi
fi

# ── 5. Rede de segurança: nada de segredo ou lixo no commit ──
info "conferindo o que vai subir"
git add -A

SUSPEITO="$(git diff --cached --name-only | grep -iE '(^|/)\.env$|\.env\.|\.zip$|\.log$|\.db$|_logs\.txt$|blocklist-cache\.bin$|node_modules/' | grep -v '\.env\.example$' || true)"
if [ -n "$SUSPEITO" ]; then
  printf '\n\033[31m✗ arquivos que NÃO deveriam ser versionados entraram no commit:\033[0m\n'
  printf '%s\n' "$SUSPEITO"
  printf '\nDesfazendo o stage. Verifique o .gitignore e rode de novo.\n'
  git reset -q
  exit 1
fi
okay "nenhum segredo ou artefato no commit"

echo
git status --short
echo

TOTAL="$(git diff --cached --name-only | wc -l)"
[ "$TOTAL" -gt 0 ] || { info "nada mudou — encerrando sem commit"; exit 0; }

# ── 6. Confirmar ──
printf '\033[33m%s arquivo(s) serão enviados. Continuar? [s/N] \033[0m' "$TOTAL"
read -r RESP
case "$RESP" in
  s|S|y|Y) ;;
  *) git reset -q; info "cancelado — nada foi enviado"; exit 0 ;;
esac

# ── 7. Commit e push ──
[ -n "$MSG" ] || MSG="deploy: $(date '+%Y-%m-%d %H:%M')"
git commit -qm "$MSG"
git push
okay "enviado: $MSG"

# ── 8. Só agora o zip pode sumir ──
rm -f "$ZIP"
okay "zip removido: $(basename "$ZIP")"

echo
info "Actions: https://github.com/GhisoOF/stoat_bot/actions"
info "subir na máquina:  cd $REPO && docker compose up -d --build"
info "ou no Portainer:   Pull and redeploy do stack stoat-bot (e APAGUE o stack judy-ia antigo)"
