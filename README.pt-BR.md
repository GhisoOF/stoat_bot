# Judy — moderação, utilidades e IA para o Stoat

![Licença](https://img.shields.io/badge/licen%C3%A7a-WTFPL-green) ![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen) ![Docker](https://img.shields.io/badge/docker-multi--arch-blue) ![Idiomas](https://img.shields.io/badge/bot-pt--BR%20%C2%B7%20en%20%C2%B7%20es-orange)

🇬🇧 [English](README.md) · 🇪🇸 [Español](README.es.md) · 🔒 [Política de privacidade](PRIVACIDADE.md)

Bot para a plataforma **Stoat** (o fork do Revolt), em Node.js com a [`stoat.js`](https://github.com/stoatchat/javascript-client-sdk). Prefixo padrão: **`&`**. Roda em vários servidores ao mesmo tempo, cada um com a sua configuração, em inglês, português ou espanhol (`&config idioma`). Tudo mora num banco **SQLite** embutido e num **container só** — a IA também, se você quiser.

## Subir o seu

```bash
git clone https://github.com/GhisoOF/stoat_bot && cd stoat_bot
cp .env.example .env    # BOT_TOKEN, DONO, SERVIDOR, SEARXNG_SECRET — o resto é opcional
docker compose up -d --build
```

Sem Docker: `npm install && node iniciar.js` (ou `node main.js` só para o bot). Num servidor novo, comece por `&assistente` (configuração guiada) e `&help`.

## A IA por dentro

- **Cada servidor escolhe:** a conversa só existe nos servidores de `SERVIDOR`, e cada um a liga com `&assistente ia on`. Fora deles, fica só a moderação por IA. `IA=0` desliga toda a IA.
- **Só local:** o modelo roda na sua máquina (llama.cpp, baixado no primeiro arranque); nenhuma conversa vai a um serviço de IA de fora.
- **Memória com limite:** só de quem aceitou, só do que a pessoa diz à Judy, e apaga com `&privacidade apagar`.

## O que a máquina expõe

- Imagens só do CDN do Stoat, com teto de tamanho; páginas, RSS e listas só da internet pública (IP conferido na conexão, cada redirect conferido).
- Música só de YouTube, SoundCloud e Spotify. Webhooks: token de 128 bits por gancho, URL por DM, a porta só abre se houver gancho.
- Um servidor não mexe no outro: nada é publicado em canal de outro servidor.
- Serviços internos ouvem em `127.0.0.1` com chave; o container roda sem privilégios.
- Toda busca para fora sai pela conexão da máquina — use uma VPN para esconder o IP.

## Comandos

Gerado do registro de comandos (`modulos/comandos/`); `&help <comando>` explica cada um.

<!-- gerado:comandos -->
**🚀 Começar**

| Comando | O que faz |
|---|---|
| `&ping` | Mostra a latência entre o envio da mensagem e o processamento do bot |
| `&userinfo` | Mostra ID, criação da conta, entrada no servidor, cargos e a foto de perfil |
| `&tutorial` | por onde começar, os conceitos e a wiki do RPG |
| `&assistente` | configuração guiada: o bot pergunta, você responde; e a IA do servidor |
| `&staff` | quem é a equipe; marcar os cargos que moderam |
| `&servidor` | O servidor em que você está: dono, criação, membros e descrição |
| `&help` | esta ajuda: o índice, um grupo ou um comando |
| `&sobre` | o bot neste servidor, os créditos e o suporte |
| `&config` | tudo o que este servidor configura, num lugar só |
| `&reset` | Volta a Judy à configuração de fábrica neste servidor: automod (tudo desligado), punição, canal de log, boas-v |
| `&privacidade` | o que a Judy guarda sobre você, e apagar |

**🛡️ Proteger**

| Comando | O que faz |
|---|---|
| `&kick` | Expulsa alguém |
| `&ban` | Bane alguém (vale o ID de quem já saiu) |
| `&unban` | Sem nada, lista os banidos com um número; `&unban 3` desbane o 3º |
| `&untimeout` | Sem nada, lista quem está silenciado com um número; `&untimeout 2` devolve a voz ao 2º |
| `&silenciar` | Silencia alguém por um tempo: a pessoa só vê o servidor até o tempo acabar |
| `&limpar` | Apaga as últimas mensagens do canal (1–100) |
| `&warn` | Dá um aviso |
| `&automod` | A moderação automática em quatro grupos, cada um com partes |
| `&banglobal` | Lista de bans compartilhada entre os servidores da Judy |

**🎨 Personalizar**

| Comando | O que faz |
|---|---|
| `&cor` | Pinta um cargo |
| `&embed` | Publica uma mensagem embed |
| `&reactionrole` | Quem reage com o emoji ganha o cargo; quem tira a reação perde |
| `&rss` | O telejornal do servidor: as notícias dos feeds saem num resumo por dia, no horário do servidor |
| `&autorole` | Todo membro novo recebe esse cargo ao entrar |
| `&boasvindas` | Embed publicado quando alguém entra no servidor |
| `&adeus` | Embed publicado quando alguém sai do servidor (saída, expulsão ou ban) |
| `&fuso` | Converte um horário em timestamp: cada pessoa vê a hora no próprio fuso |
| `&webhook` | Serviços externos publicam num canal seu: GitHub (push, issues, PR, releases, Actions…), Crafty/Minecraft e qu |
| `&ticket` | Suporte com canal privado, por reação |

**🎮 Diversão**

| Comando | O que faz |
|---|---|
| `&xp` | Níveis por mensagem, de cada servidor |
| `&tts` | A Judy fala nas calls |
| `&entrar` | Traz a Judy para a call e ela passa a falar tudo que for escrito ali |
| `&sair` | Tira a Judy da call: para de ler o chat e para a música |
| `&musica` | Música na call — YouTube, SoundCloud e Spotify, com fila |
| `&rolar` | Dados de RPG de mesa, com tudo |
| `&economia` | A moeda deste servidor — cada servidor tem a sua, sem ligação com o RPG |
| `&entretenimento` | A família das brincadeiras |

**🎲 RPG**

| Comando | O que faz |
|---|---|
| `&game` | o RPG: um personagem, uma build, missões, chefes e duelos |

**🩺 Diagnóstico**

| Comando | O que faz |
|---|---|
| `&debug` | O diagnóstico do bot neste servidor |

**👑 Dono do bot**

| Comando | O que faz |
|---|---|
| `&personalidade` | a personalidade da Judy (a mesma em todo servidor) |
| `&servidores` | onde o bot está, o relatório por hora, avisos a todos os servidores |
<!-- /gerado:comandos -->

## Variáveis de ambiente

Geradas do `.env.example` (onde cada uma é explicada por inteiro).

<!-- gerado:variaveis -->
| Variável | Exemplo | Descrição (do `.env.example`) |
|---|---|---|
| `BOT_TOKEN` | — | Token do bot (crie um bot no Stoat/Revolt e cole o token aqui) |
| `DONO` | — | ID do perfil do DONO do bot (clique no seu perfil → copiar ID). |
| `CRIADOR` | — | Quem criou a bot — o que ela pode contar quando perguntarem. |
| `SOBRE_CRIADOR` | — | — |
| `SERVIDOR` | — | ID do SERVIDOR onde a IA vai funcionar. |
| `SEARXNG_SECRET` | — | Segredo do buscador da IA (SearXNG). |
| `IA` | `1` | IA=0 desliga todos os módulos de IA (chat, moderação por IA, comentários, voz-IA). |
| `CONVERSA` | `0` | Modo enxuto: CONVERSA=0 deixa a IA SÓ para a moderação (temas proibidos, visão de imagens e fotos de perfil), o relatório horário do log e o RSS. |
| `CHAT_PADRAO` | `on` | CHAT_PADRAO=on: servidor que não escolheu começa com o chat e a imagem LIGADOS (o jeito de antes de 21 out 2026). |
| `CHAT_ANTI_ABUSO` | `0` | A porta da IA contra spam (ritmo por pessoa/canal/servidor, a mesma pergunta repetida, a mesma pergunta de várias contas) vem ligada. |
| `BUSCA_WEB` | `0` | — |
| `IA_TTL` | `300` | — |
| `IA_MODO` | `local` | Como a IA pensa: "local" roda um modelo na sua máquina (sem custo, sem token, precisa de ~4 GB de RAM livre; nada sai da máquina). |
| `MODELO` | `bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M` | Modelo: um GGUF do Hugging Face (usuario/repo:quantização), baixado automaticamente no primeiro arranque e guardado no volume (/data/modelos). |
| `MODELO_VISAO` | `LiquidAI/LFM2.5-VL-3B-GGUF:Q4_K_M` | Segundo modelo, multimodal, só para VER imagens (opcional). |
| `MODELO_MODERACAO` | `ggml-org/gemma-3-1b-it-GGUF:Q4_K_M` | Modelo PEQUENO só para julgar a moderação (temas proibidos) dos OUTROS servidores — o seu (o de SERVIDOR, pelo id) continua julgado pelo modelo da conversa. |
| `LLAMA_CTX_MODERACAO` | `4096` | Contexto do modelo de moderação (as mensagens a julgar são curtas): |
| `LLAMA_SWAP_YAML` | `/data/llama-swap.yaml` | Onde o iniciar.js grava a configuração do llama-swap (gerada no boot). |
| `PROMPT` | `Você é um assistente simpático e direto do servidor.` | Personalidade padrão da IA, no seu texto. |
| `IMAGEM` | `1` | Geração de imagem: já vem embutida (stable-diffusion.cpp + Z-Image-Turbo). |
| `IMAGEM_TETO_ARQUIVO` | `/data/imagem-teto.json` | Onde fica a contagem do teto diário de imagens (só dia, servidor e número). |
| `SD_MODELO_TIPO` | `qwen-image` | Qwen-Image 2.1 em vez do Z-Image (~13 GB no volume: difusão Q8_0 7,6 GB + Qwen3-VL-8B 5 GB + VAE 0,7 GB). |
| `SD_Q_DIFUSAO_URL` | `https://huggingface.co/unsloth/Qwen-Image-2.1-GGUF/resolve/main/qwen-image-2.1-Q8_0.gguf` | — |
| `SD_Q_VAE_URL` | `https://huggingface.co/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors` | — |
| `SD_Q_LLM_URL` | `https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/Qwen3VL-8B-Instruct-Q4_K_M.gguf` | — |
| `IMAGEM_TE_GPU` | `0` | O codificador de texto do Qwen-Image (Qwen3-VL-8B, ~5 GB) roda na CPU por padrão — na iGPU ele e a difusão não cabem juntos. |
| `IMAGEM_GERACAO_TIMEOUT_MS` | `1200000` | Tempo e tamanho (o padrão acompanha o modelo: Qwen base 20 min e 512 px) |
| `IMAGEM_LADO_GERACAO` | `512` | — |
| `IMAGEM_LIBERAR_GPU` | `1` | Antes de desenhar, o LLM local sai da GPU (volta sozinho na próxima mensagem) para o gerador ter memória; se ainda faltar, tenta de novo no modo econômico. |
| `IDIOMA_PADRAO` | `en` | O idioma oficial do bot é o inglês: servidor novo (e o &reset) começa nele. |
| `CONFIG_PATH` | `./dados/automod-config.json` | SÓ para rodar FORA do Docker (node main.js direto). |
| `DB_PATH` | `./dados/stoat.db` | — |
| `TZ` | `America/Sao_Paulo` | — |
| `IA_SERVICO_URL` | — | Serviço de IA: sobe embutido no container (localhost:8090). |
| `LLM_URL` | `http://host.docker.internal:8081` | Inferência (llama.cpp / llama-swap / Ollama, formato OpenAI): |
| `LLM_MODEL` | — | — |
| `VOZ_ATIVA` | `0` | Voz nas calls (opcional): VOZ_ATIVA=1 e pronto — o Piper vem na imagem e as vozes são baixadas sozinhas no primeiro arranque (para o volume). |
| `VOZES` | `pt_BR-faber-medium` | Quais vozes baixar (nomes do catálogo https://huggingface.co/rhasspy/piper-voices, separados por vírgula; a primeira vira a padrão). |
| `VOZ_CHAVE` | — | Senha do serviço de voz embutido. |
| `IA_SERVICO_CHAVE` | — | — |
| `SERVICO_HOST` | `127.0.0.1` | (IA_CHAVE também vale como chave do serviço de IA — o bot e o serviço leem as duas.) Serviço de voz NATIVO (fora do container): sem VOZ_CHAVE ele não sobe, e el |
| `SUPER_ADMINS` | — | Super-admins do bot (IDs separados por vírgula). |
| `MEMORIA_AGENTE` | `on` | — |
| `MEMORIA_DEBOUNCE_MS` | `8000` | — |
| `MEMORIA_MIN_CHARS` | `12` | — |
| `SEARXNG_URL` | `http://searxng:8080` | Sem esta linha a busca fica DESLIGADA e o bot nem gasta inferência decidindo se deveria buscar. |
| `BUSCA_LER_PAGINAS` | `3` | Páginas lidas por busca (as mais relevantes); 0 = só o resumo do buscador. |
| `BUSCA_RESULTADOS` | `8` | Resultados pedidos ao SearXNG por consulta (até 2 consultas por pedido). |
| `BUSCA_SEMPRE` | `1` | A IA pesquisa SEMPRE que alguém pergunta algo do mundo (em silêncio) e só mostra links/fontes quando a pessoa pede a busca ("pesquisa", "procura na internet", " |
| `BUSCA_FUNDO_LER_PAGINAS` | `0` | A busca silenciosa é leve: não chama o modelo para escrever a consulta, não lê páginas (só os trechos do buscador) e desiste em 4 s. |
| `BUSCA_FUNDO_TIMEOUT_MS` | `4000` | — |
| `PENSAR` | `auto` | Raciocínio (thinking) da resposta: auto = só quando a mensagem pede (conta, lógica, código, explicação, comparação, mensagem longa); conversa leve responde dire |
| `PENSAR_DECISOES` | `0` | Decisões em JSON e tarefas de fundo (memória, comentários) vão sem raciocínio. |
| `LLM_PARALELO` | `2` | Pedidos ao modelo ao mesmo tempo. |
| `LLM_FILA_FUNDO` | `6` | — |
| `LLM_ESPERAS_429` | `2000,5000,10000` | Esperas (ms) antes de repetir quando o llama-swap responde 429 (lotado). |
| `PRIORIDADE_SERVIDORES` | — | Prioridade no limite: o dono do bot (DONO) e o servidor dele passam na frente na fila de respostas da IA e no teto de músicas. |
| `MUSICA_MAX_SIMULTANEAS` | `3` | Músicas tocando ao mesmo tempo (cada uma é um yt-dlp + ffmpeg). |
| `CHAT_LIVRE_INTERVALO_MS` | `300000` | Conversa livre (&config ia livre): entradas sem convite, por canal — intervalo mínimo entre elas e teto por hora. |
| `CHAT_LIVRE_POR_HORA` | `4` | — |
| `GITHUB_REPO` | `GhisoOF/stoat_bot` | O repositório da própria Judy no GitHub: "quais os últimos updates feitos em você?" e "o commit 0eb26f0…" são respondidos lendo os commits daqui. |
| `GITHUB_TOKEN` | — | — |
| `SLOWMODE_ESPERA_MAX_S` | `30` | Canal com modo lento: a Judy espera a vez (o Stoat aplica o modo lento ao bot sem a permissão "Ignorar modo lento"). |
| `CHAT_FONTES_MAX` | `3` | Fontes no rodapé da resposta (só as citadas). |
| `CHAT_PREVIA_LINKS` | `0` | 1 = links nas respostas da IA voltam a gerar prévia (embed) no Stoat. |
| `COMENTARIO_MAX_TOKENS` | `1200` | Tokens do comentário espontâneo (modelos que raciocinam precisam de ≥1200). |
| `AUTOMOD_CONFIRMAR_HORAS` | `24` | O silêncio é o timeout nativo do Stoat (o bot precisa de TimeoutMembers). |
| `PAGINAS_DIAS` | `7` | Botões ◀ ▶ das mensagens paginadas continuam valendo por estes dias, mesmo depois de o bot reiniciar. |
| `CHAT_DEBUG` | `1` | — |
| `RELATORIO_SERVIDOR` | — | O servidor do dono do bot. |
| `WEBHOOK_BIND` | `127.0.0.1` | Em que endereço da máquina o receptor de webhooks fica: 127.0.0.1 (padrão, só a máquina; o Tailscale Funnel segue funcionando) · 172.17.0.1 (só os containers, e |
| `WEBHOOK_SERVIDORES` | `*` | Quais servidores podem criar webhooks (ids separados por vírgula; * = todos). |
| `WEBHOOK_MAX_POR_SERVIDOR` | `10` | Tetos do receptor: ganchos por servidor, publicações por minuto (todos os ganchos somados) e tentativas com token errado por minuto. |
| `WEBHOOK_TETO_GLOBAL_MIN` | `240` | — |
| `WEBHOOK_TETO_ERROS_MIN` | `60` | — |
| `RSS_SERVIDORES` | — | Quais servidores podem ter RSS (vazio = todos) e quantos feeds cada um. |
| `RSS_MAX_FEEDS` | `25` | — |
| `RSS_AGORA_MIN_MS` | `300000` | Intervalo mínimo do `&rss agora` por servidor (ms). |
| `TICKET_MAX_ABERTOS` | `20` | Tickets abertos ao mesmo tempo por servidor. |
| `IMAGEM_POR_DIA` | `20` | Imagens geradas por dia, por servidor (0 = sem teto). |
| `MUSICA_YTDLP_TIMEOUT_MS` | `60000` | Tetos do yt-dlp (ms): a consulta do vídeo, e a música tocando sem chegar dado. |
| `MUSICA_YTDLP_PARADO_MS` | `120000` | — |
| `MUSICA_HOSTS` | — | Links de música só destes sites (os padrões: YouTube, SoundCloud, Spotify); acrescente outros hosts aqui, separados por vírgula. |
| `MUSICA_COOKIES` | `/data/yt-cookies.txt` | Vídeo do YouTube com restrição de idade só toca logado. |
| `POLITICA_PRIVACIDADE_URL` | `https://github.com/GhisoOF/stoat_bot/blob/main/PRIVACIDADE.md` | Política de privacidade que o &privacidade e o &sobre mostram. |
| `LOG_ANONIMO` | `1` | O log do container leva os IDs do Stoat como pseudônimo (o segredo fica em /data/log-segredo.key, ou em LOG_SEGREDO). |
| `LOG_SEGREDO` | — | — |
| `LOG_MAX_TAMANHO` | `10m` | Tamanho do log do container: até LOG_MAX_ARQUIVOS arquivos de LOG_MAX_TAMANHO. |
| `LOG_MAX_ARQUIVOS` | `5` | — |
| `MEMORIA_LIMITE` | `24g` | Memória máxima do container do bot (LLM + gerador de imagem incluídos). |
| `DIAS_APOS_SAIDA` | `30` | Dias depois de a Judy sair de um servidor até os dados dele serem apagados. |
<!-- /gerado:variaveis -->

## Desenvolvimento

```bash
npm install
node scripts/verificar-build.js   # integridade: imports, registro, citações, READMEs, NOVIDADES
node scripts/gerar-readme.js      # regera as tabelas acima
node testes.mjs --lista           # as suítes de teste
```

## Licença

WTFPL (veja `LICENSE`).
