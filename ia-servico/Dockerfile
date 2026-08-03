# ── Serviço de IA da Judy ─────────────────────────────────
# Container separado do bot: contém a camada de LLM, as
# ferramentas e o laço de tool-calling. Portátil: para mover
# de máquina, basta levar a imagem e apontar OLLAMA_URL.
FROM node:22-slim

LABEL org.opencontainers.image.title="judy-ia" \
      org.opencontainers.image.description="Camada de IA (LLM + ferramentas) da Judy"

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

ENV PORTA=8090 \
    NODE_ENV=production \
    CODIGO_PATH=/codigo

EXPOSE 8090
USER node

CMD ["node", "--disable-warning=ExperimentalWarning", "servidor.js"]
