# ── Stoat/Revolt bot — imagem única ───────────────────────
# Um container com tudo: o bot, o serviço de IA (ferramentas/tool-calling),
# o llama.cpp para IA local opcional, e o serviço de voz opcional.
# Multi-arquitetura (x86-64 e ARM64).
FROM node:22-slim
ARG TARGETARCH=amd64

LABEL org.opencontainers.image.title="stoat-bot" \
      org.opencontainers.image.description="Bot de moderação e IA para Stoat/Revolt — tudo num container" \
      org.opencontainers.image.source="https://github.com/GhisoOF/stoat_bot"

WORKDIR /app

# 0) llama.cpp para IA_MODO=local (opcional): se o download falhar, a imagem
#    builda mesmo assim — só o modo local fica indisponível. O MODELO não
#    entra na imagem: o llama-server o baixa do Hugging Face no primeiro
#    arranque (flag -hf) e guarda no volume (/data/modelos), então o download
#    de gigabytes acontece uma vez e sobrevive a rebuilds.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates unzip libgomp1 libcurl4 \
    && rm -rf /var/lib/apt/lists/*
RUN set -x; ARQ="ubuntu-x64"; [ "$TARGETARCH" = "arm64" ] && ARQ="ubuntu-arm64"; \
    URL="$(curl -fsSL https://api.github.com/repos/ggml-org/llama.cpp/releases/latest \
          | grep -oE '"browser_download_url": "[^"]*bin-'"$ARQ"'\.zip"' | head -1 | cut -d'"' -f4)"; \
    if [ -n "$URL" ] && curl -fsSL "$URL" -o /tmp/llama.zip; then \
      mkdir -p /opt/llama && unzip -q /tmp/llama.zip -d /opt/llama && rm /tmp/llama.zip; \
      BIN="$(find /opt/llama -name llama-server -type f | head -1)"; \
      if [ -n "$BIN" ]; then \
        chmod +x "$BIN" && LIBDIR="$(dirname "$BIN")" && \
        printf '#!/bin/sh\nexport LD_LIBRARY_PATH="%s:${LD_LIBRARY_PATH:-}"\nexec "%s" "$@"\n' "$LIBDIR" "$BIN" \
          > /usr/local/bin/llama-server && chmod +x /usr/local/bin/llama-server; \
      fi; \
    else echo "AVISO: llama.cpp indisponível para $ARQ — IA_MODO=local não funcionará nesta imagem"; fi

# 1) Dependências primeiro (cache de camadas)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY ia-servico/package.json ia-servico/package-lock.json* ./ia-servico/
RUN cd ia-servico && npm install --omit=dev --no-audit --no-fund

# Voz é opcional (depende de binários de áudio); se falhar, a imagem segue sem ela.
COPY voz-servico/package.json voz-servico/package-lock.json* ./voz-servico/
RUN cd voz-servico && (npm install --omit=dev --no-audit --no-fund \
    || echo "AVISO: dependências de voz falharam — o serviço de voz ficará indisponível")

# 2) Código
COPY . .

# 2b) Sanidade: repositório incompleto derruba o build aqui, não em runtime.
RUN node scripts/verificar-build.js

ENV CONFIG_PATH=/data/automod-config.json \
    DB_PATH=/data/stoat.db \
    NODE_ENV=production
RUN mkdir -p /data && chown -R node:node /app /data

USER node

# O bot é cliente de gateway (só conexões de saída); os serviços internos
# ficam em localhost dentro do container. Nenhuma porta precisa ser exposta.
CMD ["node", "--disable-warning=ExperimentalWarning", "iniciar.js"]
