# ── Stoat/Revolt bot — imagem única ───────────────────────
# Um container com tudo: o bot, o serviço de IA (ferramentas/tool-calling),
# o llama.cpp para IA local opcional, e o serviço de voz opcional.
# Multi-arquitetura (x86-64 e ARM64).
#
# (31 out 2026, R10) Tudo o que vem de fora tem VERSÃO FIXA e SHA256: a imagem
# base (tag + digest), os binários (yt-dlp, llama.cpp, llama-swap, Piper) e o
# sd.cpp (commit). Nada de `latest`. Para atualizar um binário: troque a versão
# e os SHA256 DE PROPÓSITO (scripts/hashes-binarios.sh imprime as linhas) e
# confira o build — nunca no mesmo deploy de uma troca de modelo.
# Hash que não confere derruba o build (não instala binário adulterado); um
# download que falha (rede) deixa o recurso opcional de fora, como antes.
ARG NODE_IMAGE=node:22.23.4-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da
# ── Estágio: stable-diffusion.cpp compilado DO FONTE ─────────────────────
# O binário oficial dos releases exige GLIBC 2.38 (Ubuntu 24+) e a nossa base
# é Debian bookworm (2.36) — quebrava com "version GLIBC_2.38 not found" na
# primeira geração. Compilar aqui, na MESMA base, casa a glibc por construção
# — e dá gerador de imagem ao ARM64 de quebra (o release nem tinha binário).
FROM ${NODE_IMAGE} AS sdcpp
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends       git cmake g++ make ca-certificates libvulkan-dev glslc glslang-tools spirv-headers spirv-tools && rm -rf /var/lib/apt/lists/*
# Só na perna amd64: o CI compila as duas plataformas EM PARALELO num runner
# de 7 GB, e compilar sd.cpp também sob qemu-arm64 estourava a memória no
# meio do libwebp. ARM64 fica como sempre foi: sem gerador embutido, com o
# aviso e o SD_URL externo como caminho. (Build local amd64 não sente nada.)
# Headers do Vulkan do Debian (1.3.239) sao velhos demais: o ggml-vulkan usa
# VK_EXT_layer_settings, que so existe da 1.3.272 em diante — sem isto o build
# morre com "'LayerSettingEXT' is not a member of 'vk'". Instalamos os headers
# oficiais do Khronos por cima; a glibc continua a do Debian, que e o que
# importa para o binario rodar na imagem final.
# v1.3.296 fixada pelo commit (uma tag pode ser movida; o commit não)
ARG VULKAN_HEADERS_REF=29f979ee5aa58b7b005f805ea8df7a855c39ff37
RUN git init -q /vkh && git -C /vkh fetch -q --depth 1 https://github.com/KhronosGroup/Vulkan-Headers "$VULKAN_HEADERS_REF" \
    && git -C /vkh checkout -q FETCH_HEAD \
    && cmake -S /vkh -B /vkh/build -DCMAKE_INSTALL_PREFIX=/usr/local \
    && cmake --install /vkh/build && rm -rf /vkh

# Versão FIXA do sd.cpp. Clonar sempre a mais nova quebrou o CI em 28/09 sem
# nenhuma mudança deste repositório: o upstream atualizou o ggml em 27/09 e o
# backend Vulkan novo não compilou nesta base. Para atualizar, troque o SHA de
# propósito e confira o build. 2f88688 (26/09) = último commit antes daquela
# atualização do ggml (mesmo ggml da versão de 22/09).
ARG SD_CPP_REF=2f886889e6e8b78738d6b87f7191f6018557c551

# Se a compilação falhar: mostra o ERRO REAL no fim do log (antes ele ficava
# milhares de linhas acima e o CI só dizia "exit code: 2") e segue sem o
# gerador embutido — como a voz, um recurso opcional não trava o deploy do bot.
# A imagem final já trata a falta do binário (gerar_imagem só via SD_URL).
RUN set -x; mkdir -p /sd/build/bin; \
    if [ "$TARGETARCH" = "arm64" ]; then \
      echo "arm64: sem sd.cpp embutido — gerar_imagem via SD_URL nesta arquitetura"; exit 0; \
    fi; \
    { git init -q /sd-src && cd /sd-src \
      && git remote add origin https://github.com/leejet/stable-diffusion.cpp \
      && git fetch -q --depth 1 origin "$SD_CPP_REF" && git checkout -q FETCH_HEAD \
      && git submodule update -q --init --recursive \
      && cmake -S /sd-src -B /sd-src/build -DCMAKE_BUILD_TYPE=Release -DSD_VULKAN=ON -DVulkan_INCLUDE_DIR=/usr/local/include \
      && cmake --build /sd-src/build --config Release -j2 \
      && cp -a /sd-src/build/bin/. /sd/build/bin/ && ls -la /sd/build/bin/; \
    } > /tmp/sd-build.log 2>&1 \
    && tail -n 5 /tmp/sd-build.log \
    || { echo "════ sd.cpp NÃO compilou — o erro real:"; \
         grep -iE "error|fatal|undefined reference|failed" /tmp/sd-build.log | head -40; \
         echo "════ últimas linhas do build:"; tail -n 25 /tmp/sd-build.log; \
         echo "AVISO: imagem SEM gerador de imagem embutido (gerar_imagem só via SD_URL)."; \
         rm -rf /sd/build/bin/*; }

FROM ${NODE_IMAGE}
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

# yt-dlp: fonte de áudio da música (YouTube/SoundCloud; Spotify resolve por busca).
# O nome do binário muda por arquitetura — sem isso o build arm64 do CI quebra
# com exit 127 ("not found" = binário da arquitetura errada).
# (uname -m: funciona com ou sem o TARGETARCH do buildx)
ARG YTDLP_VERSAO=2026.10.26
ARG YTDLP_SHA256_AMD64=767ba9dce7052aa196f8b12652f433d76de128ba168966fa84b6394d5e6c6795
ARG YTDLP_SHA256_ARM64=e87e9533e89fe5889abaa21f5114dfe7756d6aa6219b83551add04d48b18e483
RUN set -eux; ARQ="yt-dlp_linux"; SHA="$YTDLP_SHA256_AMD64"; \
    if [ "$(uname -m)" = "aarch64" ]; then ARQ="yt-dlp_linux_aarch64"; SHA="$YTDLP_SHA256_ARM64"; fi; \
    curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSAO}/${ARQ}" -o /tmp/yt-dlp; \
    echo "${SHA}  /tmp/yt-dlp" | sha256sum -c -; \
    install -m 0755 /tmp/yt-dlp /usr/local/bin/yt-dlp && rm -f /tmp/yt-dlp; \
    /usr/local/bin/yt-dlp --version
# GPUs recentes (RDNA 3.5/4, Arc) precisam de um Mesa mais novo que o da imagem
# base: sem isso o driver não reconhece o chip ("amdgpu: unknown family") e o
# llama.cpp não lista dispositivo nenhum. Os backports resolvem; se não houver
# pacote, a imagem segue com o Mesa padrão (e roda em CPU).
RUN . /etc/os-release; \
    echo "deb http://deb.debian.org/debian ${VERSION_CODENAME}-backports main" > /etc/apt/sources.list.d/backports.list; \
    apt-get update && apt-get -t ${VERSION_CODENAME}-backports install -y --no-install-recommends \
      mesa-vulkan-drivers libvulkan1 || echo "AVISO: backports indisponíveis — Mesa padrão mantido"; \
    rm -rf /var/lib/apt/lists/*
# Preferimos o build VULKAN: usa a GPU/iGPU quando existe (muito mais rápido) e
# cai para CPU sozinho quando não há driver. Se o asset Vulkan não baixar, o de
# CPU entra no lugar. LLAMA_BACKEND=cpu força o de CPU. Versão e SHA256 fixos
# (antes: o primeiro asset dos últimos 10 releases, sem conferência nenhuma).
ARG LLAMA_BACKEND=vulkan
ARG LLAMA_CPP_VERSAO=b12017
ARG LLAMA_SHA256_VULKAN_AMD64=e940a901831c2e157b6329b8738f6edd6b036889c07e4e39d4fc818831220f61
ARG LLAMA_SHA256_CPU_AMD64=16fe348b1bc2e943bc4c220938ce46af789e88291138bca5bd68c0cc017769a5
ARG LLAMA_SHA256_VULKAN_ARM64=095da6719ba1ea85fbb528ca64b9834206c4bd61ad2944eff399c3257d47bb0e
ARG LLAMA_SHA256_CPU_ARM64=676e8f99db67fbecd7854b948ed50d0bf5d7db463613fc8fcd8f4491a7709bec
RUN set -eux; SUF="x64"; [ "$TARGETARCH" = "arm64" ] && SUF="arm64"; \
    baixar() { \
      curl -fsSL "https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_VERSAO}/llama-${LLAMA_CPP_VERSAO}-bin-ubuntu-$1${SUF}.tar.gz" -o /tmp/llama.tgz \
        || { rm -f /tmp/llama.tgz; return 1; }; \
      echo "$2  /tmp/llama.tgz" | sha256sum -c - || { echo "ERRO: SHA256 do llama.cpp ($1$SUF) não confere"; exit 1; }; }; \
    if [ "$SUF" = "arm64" ]; then SHA_VK="$LLAMA_SHA256_VULKAN_ARM64"; SHA_CPU="$LLAMA_SHA256_CPU_ARM64"; \
    else SHA_VK="$LLAMA_SHA256_VULKAN_AMD64"; SHA_CPU="$LLAMA_SHA256_CPU_AMD64"; fi; \
    BACKEND=""; \
    if [ "$LLAMA_BACKEND" = "vulkan" ] && baixar "vulkan-" "$SHA_VK"; then BACKEND="VULKAN (usa GPU/iGPU)"; \
    elif baixar "" "$SHA_CPU"; then BACKEND="CPU"; fi; \
    if [ -f /tmp/llama.tgz ]; then \
      echo "llama.cpp ${LLAMA_CPP_VERSAO}: $BACKEND (SHA256 conferido)"; \
      mkdir -p /opt/llama && tar -xzf /tmp/llama.tgz -C /opt/llama && rm -f /tmp/llama.tgz; \
    fi; \
    BIN="$(find /opt/llama -name llama-server -type f 2>/dev/null | head -1)"; \
    if [ -n "$BIN" ]; then \
      chmod +x "$BIN"; LIBDIR="$(dirname "$BIN")"; \
      printf '#!/bin/sh\nexport LD_LIBRARY_PATH="%s:${LD_LIBRARY_PATH:-}"\nexec "%s" "$@"\n' "$LIBDIR" "$BIN" \
        > /usr/local/bin/llama-server; chmod +x /usr/local/bin/llama-server; \
      if ls "$LIBDIR" | grep -qi vulkan; then echo "✓ backend Vulkan na imagem"; else echo "! sem libggml-vulkan — vai rodar em CPU"; fi; \
    else echo "AVISO: llama.cpp indisponível (download falhou ou SHA256 não conferiu) — IA_MODO=local não funcionará nesta imagem"; fi

# 0a-bis) stable-diffusion.cpp para gerar imagens (gerar_imagem): compilado
#     do fonte no estágio "sdcpp" (mesma base = mesma glibc). O MODELO
#     (Z-Image-Turbo por padrão: difusão + VAE + LLM do prompt, ~6,5 GB) é
#     baixado pelo iniciar.js NO BOOT e fica no volume (/data/modelos-sd).
#     SD_MODELO_TIPO=sd troca pelo SD-Turbo antigo (um arquivo, mais leve).
COPY --from=sdcpp /sd/build/bin/ /opt/sdcpp/bin/
RUN set -x; BIN="$(find /opt/sdcpp/bin -maxdepth 1 -type f \( -name sd -o -name sd-cli \) | head -1)"; \
    if [ -n "$BIN" ]; then \
      chmod +x "$BIN" && printf '#!/bin/sh\nexport LD_LIBRARY_PATH="%s:${LD_LIBRARY_PATH:-}"\nexec "%s" "$@"\n' \
        "$(dirname "$BIN")" "$BIN" > /usr/local/bin/sd-cpp && chmod +x /usr/local/bin/sd-cpp \
      && (/usr/local/bin/sd-cpp --help >/dev/null 2>&1 && echo "✓ sd-cpp funcional na imagem" || echo "AVISO: sd-cpp copiado mas o --help falhou"); \
    else echo "AVISO: build do sd.cpp não produziu binário — gerar_imagem só com SD_URL"; fi

# 0a-ter) llama-swap: só é usado quando há MODELO_VISAO (dois modelos servidos
#     na mesma API, carregados por demanda). Opcional como os demais.
ARG LLAMA_SWAP_VERSAO=268
ARG LLAMA_SWAP_SHA256_AMD64=013a317d52a5874d4a036980c259ca37a95f9a539e4dda6d2c02a54ce422e0ba
ARG LLAMA_SWAP_SHA256_ARM64=0534285b1c24612059cf6339d1f95fce6b9541ac42aed5d7a15f6ac12e8e6652
RUN set -eux; ARQ="amd64"; SHA="$LLAMA_SWAP_SHA256_AMD64"; \
    if [ "$TARGETARCH" = "arm64" ]; then ARQ="arm64"; SHA="$LLAMA_SWAP_SHA256_ARM64"; fi; \
    if curl -fsSL "https://github.com/mostlygeek/llama-swap/releases/download/v${LLAMA_SWAP_VERSAO}/llama-swap_${LLAMA_SWAP_VERSAO}_linux_${ARQ}.tar.gz" -o /tmp/swap.tgz; then \
      echo "${SHA}  /tmp/swap.tgz" | sha256sum -c -; \
      mkdir -p /tmp/swap && tar -xzf /tmp/swap.tgz -C /tmp/swap && rm -f /tmp/swap.tgz; \
      install -m 0755 /tmp/swap/llama-swap /usr/local/bin/llama-swap && rm -rf /tmp/swap; \
      echo "✓ llama-swap v${LLAMA_SWAP_VERSAO}"; \
    else echo "AVISO: llama-swap indisponível — MODELO_VISAO (dois modelos) não funcionará"; fi

# 0b) Piper (TTS offline) para a voz nas calls (VOZ_ATIVA=1): binário na
#     imagem; as VOZES (.onnx) são baixadas no primeiro arranque para
#     /data/vozes — volume, então o download acontece uma vez.
#     2023.11.14-2 é o último release do rhasspy/piper com binário (o projeto
#     seguiu no OHF-Voice/piper1-gpl, só em Python). Os assets são antigos e o
#     GitHub não mostra o digest deles: o SHA256 sai baixando o arquivo
#     (scripts/hashes-binarios.sh). Vazio = o build PARA com o aviso.
ARG PIPER_VERSAO=2023.11.14-2
ARG PIPER_SHA256_AMD64=a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992
ARG PIPER_SHA256_ARM64=fea0fd2d87c54dbc7078d0f878289f404bd4d6eea6e7444a77835d1537ab88eb
RUN set -eux; ARQ="x86_64"; SHA="$PIPER_SHA256_AMD64"; \
    if [ "$TARGETARCH" = "arm64" ]; then ARQ="aarch64"; SHA="$PIPER_SHA256_ARM64"; fi; \
    [ -n "$SHA" ] || { echo "ERRO: PIPER_SHA256 do $ARQ vazio no Dockerfile — rode scripts/hashes-binarios.sh e preencha"; exit 1; }; \
    if curl -fsSL "https://github.com/rhasspy/piper/releases/download/${PIPER_VERSAO}/piper_linux_${ARQ}.tar.gz" -o /tmp/piper.tgz; then \
      echo "${SHA}  /tmp/piper.tgz" | sha256sum -c -; \
      mkdir -p /opt && tar -xzf /tmp/piper.tgz -C /opt && rm /tmp/piper.tgz; \
      if [ -x /opt/piper/piper ]; then \
        printf '#!/bin/sh\nexport LD_LIBRARY_PATH="/opt/piper:${LD_LIBRARY_PATH:-}"\nexec /opt/piper/piper "$@"\n' \
          > /usr/local/bin/piper-tts && chmod +x /usr/local/bin/piper-tts; \
      fi; \
    else echo "AVISO: Piper indisponível para $ARQ — a voz (VOZ_ATIVA=1) não funcionará nesta imagem"; fi
ENV PIPER_BIN=/usr/local/bin/piper-tts \
    PIPER_VOZES=/data/vozes

# 1) Dependências primeiro (cache de camadas)
#    `npm ci`: instala EXATAMENTE o package-lock.json (que é obrigatório — sem
#    ele, ou fora de sincronia com o package.json, o build para), nunca resolve
#    versão nova na hora.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY ia-servico/package.json ia-servico/package-lock.json ./ia-servico/
RUN cd ia-servico && npm ci --omit=dev --no-audit --no-fund

# Voz é opcional (depende de binários de áudio); se falhar, a imagem segue sem ela.
COPY voz-servico/package.json voz-servico/package-lock.json ./voz-servico/
# Os `overrides` apontam para este pacote vazio (file:./vazio): ele tem de
# estar aqui ANTES do npm install. Sem ele o install falha — e como a linha
# abaixo tolera falha, a imagem subiria sem voz, sem aviso nenhum.
COPY voz-servico/vazio ./voz-servico/vazio
RUN cd voz-servico && (npm ci --omit=dev --no-audit --no-fund \
    || echo "AVISO: dependências de voz falharam — o serviço de voz ficará indisponível")

# 2) Código
COPY . .

# 2b) Sanidade: repositório incompleto derruba o build aqui, não em runtime.
RUN node scripts/verificar-build.js --imagem

ENV CONFIG_PATH=/data/automod-config.json \
    DB_PATH=/data/stoat.db \
    NODE_ENV=production
# /app é do root: o processo LÊ o próprio código mas não o reescreve (antes,
# `chown -R node /app` deixava uma falha no bot trocar o código que roda no
# próximo boot). O usuário node só escreve no volume (/data: banco, modelos,
# vozes, cache do llama) e no próprio HOME (cache do yt-dlp) e no /tmp.
RUN mkdir -p /data && chown node:node /data && chmod -R go-w /app

USER node

# O bot é cliente de gateway (só conexões de saída); os serviços internos
# ficam em localhost dentro do container. Nenhuma porta precisa ser exposta.
CMD ["node", "--disable-warning=ExperimentalWarning", "iniciar.js"]
