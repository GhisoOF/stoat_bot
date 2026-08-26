# ══════════════════════════════════════════════════════════
#  judy-ia — o serviço de IA (ferramentas + LLM)
#
#  Este arquivo VIVIA SÓ NO DISCO da máquina Gentoo, fora do git. O deploy
#  faz `rm -rf ia-servico` antes de descompactar a versão nova, então ele
#  era apagado a cada deploy e o container só continuava de pé porque a
#  imagem antiga sobrevivia — até o dia em que alguém precisasse
#  reconstruir. Versionado, o problema deixa de existir.
#
#  Base Debian (não Alpine): o `sharp`, usado para reescrever toda imagem
#  que entra ou sai, tem binário pré-compilado para glibc. Em musl ele
#  compilaria o libvips do zero a cada build.
# ══════════════════════════════════════════════════════════
FROM node:22-slim

WORKDIR /app

# As dependências primeiro, em camada própria: mudar o código não refaz o
# download do sharp (~30 MB) a cada build.
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 8090
CMD ["node", "servidor.js"]
