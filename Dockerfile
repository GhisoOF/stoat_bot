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
      curl ca-certificates unzip libgomp1 libcurl4 ffmpeg libvulkan1 mesa-vulkan-drivers \
    && rm -rf /var/lib/apt/lists/*
# Preferimos o build VULKAN: usa a GPU/iGPU quando existe (muito mais rápido) e
# cai para CPU sozinho quando não há driver. Se o release não tiver o asset
# Vulkan, o build de CPU entra no lugar. Os assets Vulkan são .tar.gz e nem
# sempre estão no /latest — por isso a busca nos últimos releases.
# ATENÇÃO ao escolher o release: /releases/latest aponta para uma tag de
# ferramenta (v0.4.x) que NÃO tem binários — daí a busca nos últimos releases
# pelo próprio browser_download_url. Preferimos o build VULKAN (usa GPU/iGPU)
# e caímos para o de CPU quando não há. LLAMA_BACKEND=cpu força o de CPU.
ARG LLAMA_BACKEND=vulkan
RUN set -x; SUF="x64"; [ "$TARGETARCH" = "arm64" ] && SUF="arm64"; \
    achar() { curl -fsSL 'https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10' \
              | grep -oE '"browser_download_url": *"[^"]*bin-ubuntu-'"$1$SUF"'\.tar\.gz"' | head -1 | cut -d'"' -f4; }; \
    URL=""; \
    [ "$LLAMA_BACKEND" = "vulkan" ] && URL="$(achar 'vulkan-')"; \
    [ -n "$URL" ] && BACKEND="VULKAN (usa GPU/iGPU)" || { URL="$(achar '')"; BACKEND="CPU"; }; \
    echo "llama.cpp: $BACKEND — $URL"; \
    if [ -n "$URL" ] && curl -fsSL "$URL" -o /tmp/llama.tgz; then \
      mkdir -p /opt/llama && tar -xzf /tmp/llama.tgz -C /opt/llama && rm -f /tmp/llama.tgz; \
    fi; \
    BIN="$(find /opt/llama -name llama-server -type f 2>/dev/null | head -1)"; \
    if [ -n "$BIN" ]; then \
      chmod +x "$BIN"; LIBDIR="$(dirname "$BIN")"; \
      printf '#!/bin/sh\nexport LD_LIBRARY_PATH="%s:${LD_LIBRARY_PATH:-}"\nexec "%s" "$@"\n' "$LIBDIR" "$BIN" \
        > /usr/local/bin/llama-server; chmod +x /usr/local/bin/llama-server; \
      if ls "$LIBDIR" | grep -qi vulkan; then echo "✓ backend Vulkan na imagem"; else echo "! sem libggml-vulkan — vai rodar em CPU"; fi; \
    else echo "AVISO: llama.cpp indisponível — IA_MODO=local não funcionará nesta imagem"; fi

# 0a-bis) stable-diffusion.cpp para gerar imagens (gerar_imagem): binário na
#     imagem; o MODELO (SD-Turbo, ~2,3 GB) é baixado no PRIMEIRO USO da
#     ferramenta — não no boot — e fica no volume (/data/modelos-sd).
RUN set -x; if [ "$TARGETARCH" != "arm64" ]; then \
      URL="$(curl -fsSL https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest \
            | grep -oE '"browser_download_url": "[^"]*[Ll]inux[^"]*avx2[^"]*\.zip"' | head -1 | cut -d'"' -f4)"; \
      [ -z "$URL" ] && URL="$(curl -fsSL https://api.github.com/repos/leejet/stable-diffusion.cpp/releases/latest \
            | grep -oE '"browser_download_url": "[^"]*[Ll]inux[^"]*\.zip"' | head -1 | cut -d'"' -f4)"; \
      if [ -n "$URL" ] && curl -fsSL "$URL" -o /tmp/sd.zip; then \
        mkdir -p /opt/sdcpp && unzip -q /tmp/sd.zip -d /opt/sdcpp && rm /tmp/sd.zip; \
        BIN="$(find /opt/sdcpp -type f \( -name sd -o -name sd-cli \) | head -1)"; \
        if [ -n "$BIN" ]; then \
          chmod +x "$BIN" && printf '#!/bin/sh\nexport LD_LIBRARY_PATH="%s:${LD_LIBRARY_PATH:-}"\nexec "%s" "$@"\n' \
            "$(dirname "$BIN")" "$BIN" > /usr/local/bin/sd-cpp && chmod +x /usr/local/bin/sd-cpp; \
        fi; \
      else echo "AVISO: sd.cpp indisponível — gerar_imagem só funcionará com SD_URL externo"; fi; \
    else echo "AVISO: sd.cpp sem binário ARM64 — gerar_imagem só com SD_URL nesta arquitetura"; fi

# 0b) Piper (TTS offline) para a voz nas calls (VOZ_ATIVA=1): binário na
#     imagem; as VOZES (.onnx) são baixadas no primeiro arranque para
#     /data/vozes — volume, então o download acontece uma vez.
RUN set -x; ARQ="x86_64"; [ "$TARGETARCH" = "arm64" ] && ARQ="aarch64"; \
    URL="$(curl -fsSL https://api.github.com/repos/rhasspy/piper/releases/latest \
          | grep -oE '"browser_download_url": "[^"]*piper_linux_'"$ARQ"'\.tar\.gz"' | head -1 | cut -d'"' -f4)"; \
    if [ -n "$URL" ] && curl -fsSL "$URL" -o /tmp/piper.tgz; then \
      mkdir -p /opt && tar -xzf /tmp/piper.tgz -C /opt && rm /tmp/piper.tgz; \
      if [ -x /opt/piper/piper ]; then \
        printf '#!/bin/sh\nexport LD_LIBRARY_PATH="/opt/piper:${LD_LIBRARY_PATH:-}"\nexec /opt/piper/piper "$@"\n' \
          > /usr/local/bin/piper-tts && chmod +x /usr/local/bin/piper-tts; \
      fi; \
    else echo "AVISO: Piper indisponível para $ARQ — a voz (VOZ_ATIVA=1) não funcionará nesta imagem"; fi
ENV PIPER_BIN=/usr/local/bin/piper-tts \
    PIPER_VOZES=/data/vozes

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
