#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
#  deploy-stoat.sh — sobe uma nova versão do bot para o GitHub
#
#  ESTE ARQUIVO MORA FORA DO REPOSITÓRIO (em ~/), de propósito:
#  o deploy apaga e recria diretórios do repo, e um script que
#  apaga a si mesmo enquanto roda é uma péssima ideia (o bash lê
#  o arquivo em pedaços conforme executa).
#
#  Instalar uma vez:
#     cp scripts/deploy-stoat.sh ~/deploy-stoat.sh
#     chmod +x ~/deploy-stoat.sh
#
#  Usar:
#     ~/deploy-stoat.sh ~/Downloads/stoat_bot-atualizado.zip "mensagem do commit"
#
#  O que ele garante, e que a sequência manual não garantia:
#   • o zip é aberto FORA do repositório (foi o zip solto dentro
#     de ~/Downloads/github que acabou commitado por acidente)
#   • `set -e` de verdade: qualquer passo que falhe interrompe tudo
#     ANTES do commit — nada de commitar um repo pela metade
#   • o GITHUB_TOKEN é salvo antes e devolvido depois
#   • mostra o que vai subir e pede confirmação
#   • só apaga o zip depois do push dar certo
# ══════════════════════════════════════════════════════════

set -euo pipefail

REPO="${REPO:-$HOME/Downloads/github}"
TOKEN_BACKUP="${TOKEN_BACKUP:-$HOME/judy-github.env}"
ZIP="${1:-}"
MSG="${2:-}"
TMP="$(mktemp -d)"

# Limpeza do temporário aconteça o que acontecer (sucesso, erro ou Ctrl-C).
trap 'rm -rf "$TMP"' EXIT

erro() { printf '\n\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
info() { printf '\033[36m→ %s\033[0m\n' "$1"; }
okay() { printf '\033[32m✓ %s\033[0m\n' "$1"; }

# ── Conferências antes de tocar em qualquer coisa ──
[ -n "$ZIP" ] || erro "uso: $0 <caminho-do-zip> [mensagem do commit]"
[ -f "$ZIP" ] || erro "zip não encontrado: $ZIP"
[ -d "$REPO/.git" ] || erro "não é um repositório git: $REPO"
[ -f "$TOKEN_BACKUP" ] || erro "backup do token não encontrado: $TOKEN_BACKUP
   (era ele que devolvia o GITHUB_TOKEN ao ia-servico depois do deploy)"

# O voz-servico guarda BOT_TOKEN e VOZ_CHAVE. Ele não é apagado pelo passo 3,
# mas se um dia for, o backup evita ter de gerar a chave de novo (e
# reconfigurar o Portainer junto).
VOZ_ENV_BACKUP="${VOZ_ENV_BACKUP:-$HOME/judy-voz.env}"

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
[ -f "$TMP/main.js" ] || erro "o zip não parece ser o projeto (não achei main.js na raiz)"
okay "pacote válido: $(find "$TMP" -type f | wc -l) arquivo(s)"

# ── 2. Guardar o token ──
cp "$TOKEN_BACKUP" "$TMP/.token-guardado"
okay "GITHUB_TOKEN guardado"

# ── 3. Substituir os diretórios versionados ──
cd "$REPO"
info "removendo as versões antigas dos módulos"
git rm -rq --ignore-unmatch modulos scripts ia-servico 2>/dev/null || true
rm -rf modulos scripts ia-servico

info "copiando os arquivos novos"
cp -a "$TMP"/. "$REPO"/
rm -f "$REPO/.token-guardado"

# ── 4. Devolver o token (o ia-servico/ foi recriado do zero) ──
mkdir -p ia-servico
cp "$TOKEN_BACKUP" ia-servico/.env
okay "GITHUB_TOKEN devolvido a ia-servico/.env"

# ── 4b. Reinstalar as dependências dos serviços nativos ──
# O passo 3 apaga `ia-servico/` inteira, e com ela some o node_modules.
# O serviço só quebra no PRÓXIMO restart — então o sintoma aparece dias
# depois, desconectado da causa. Foi assim que o judy-ia caiu com
# "Cannot find package 'rss-parser'" muito tempo após o deploy que o
# esvaziou. Reinstalar aqui fecha o buraco.
if [ -f "$VOZ_ENV_BACKUP" ] && [ -d voz-servico ] && [ ! -f voz-servico/.env ]; then
  cp "$VOZ_ENV_BACKUP" voz-servico/.env
  okay "BOT_TOKEN/VOZ_CHAVE devolvidos a voz-servico/.env"
fi

for servico in ia-servico voz-servico; do
  if [ -f "$servico/package.json" ] && [ ! -d "$servico/node_modules" ]; then
    info "instalando dependências de $servico (foram apagadas no passo 3)"
    (cd "$servico" && npm install --silent) \
      && okay "$servico pronto" \
      || printf '\033[33m! npm install falhou em %s — rode à mão antes de reiniciar o serviço\033[0m\n' "$servico"
  fi
done

# Aviso sobre reinício: código novo no disco não vira código novo em
# execução. Sem isto, você fica achando que o deploy não pegou.
if command -v rc-service >/dev/null 2>&1; then
  for servico in judy-ia judy-voz; do
    if rc-service "$servico" status >/dev/null 2>&1; then
      info "reiniciando $servico para carregar o código novo"
      # `sudo` sem terminal falha em silêncio, e o serviço fica rodando código
      # velho enquanto o bot já roda o novo — o pior estado possível, porque
      # tudo "parece" atualizado. Se não der para reiniciar, o aviso tem de
      # ser impossível de ignorar.
      if sudo -n true 2>/dev/null; then
        sudo rc-service "$servico" restart >/dev/null 2>&1 \
          && okay "$servico reiniciado" \
          || printf '\033[31m✗ %s NÃO reiniciou — rode: sudo rc-service %s restart\033[0m\n' "$servico" "$servico"
      else
        printf '\033[31m\n╔════════════════════════════════════════════════════════╗\033[0m\n'
        printf '\033[31m║  ATENÇÃO: %s ainda roda o código ANTIGO          ║\033[0m\n' "$servico"
        printf '\033[31m╚════════════════════════════════════════════════════════╝\033[0m\n'
        printf '   Rode agora:  \033[36msudo rc-service %s restart\033[0m\n\n' "$servico"
      fi
    fi
  done
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
info "quando ficar verde → Portainer → Pull and redeploy (recriar)"
