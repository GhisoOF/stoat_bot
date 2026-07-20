# ── Stoat/Revolt moderation bot ───────────────────────────
# Imagem enxuta e multi-arquitetura (funciona em x86-64 e ARM64,
# como Raspberry Pi / Orange Pi). Não há build nativo: só JS.
FROM node:22-slim

# Metadados
LABEL org.opencontainers.image.title="stoat-bot" \
      org.opencontainers.image.description="Bot de moderação para Stoat/Revolt" \
      org.opencontainers.image.source="https://github.com/SEU_USUARIO/stoat-bot"

WORKDIR /app

# 1) Dependências primeiro (melhora o cache de camadas)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

# 2) Código da aplicação
COPY . .

# Config persistente FORA do código (montada como volume)
ENV CONFIG_PATH=/data/automod-config.json \
    DB_PATH=/data/stoat.db \
    NODE_ENV=production
RUN mkdir -p /data && chown -R node:node /app /data

# Roda como usuário sem privilégios
USER node

# O bot é um CLIENTE de gateway: conecta para fora, não abre portas.
# --disable-warning silencia o aviso "experimental" do módulo node:sqlite embutido
CMD ["node", "--disable-warning=ExperimentalWarning", "main.js"]
