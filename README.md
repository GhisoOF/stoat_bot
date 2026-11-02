# Judy — moderation, utilities and AI for Stoat

![License](https://img.shields.io/badge/license-WTFPL-green) ![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen) ![Docker](https://img.shields.io/badge/docker-multi--arch-blue) ![Languages](https://img.shields.io/badge/bot-en%20%C2%B7%20pt--BR%20%C2%B7%20es-orange)

🇧🇷 [Português](README.pt-BR.md) · 🇪🇸 [Español](README.es.md) · 🔒 [Privacy policy](PRIVACIDADE.md)

A bot for the **Stoat** platform (the Revolt fork), in Node.js with [`stoat.js`](https://github.com/stoatchat/javascript-client-sdk). Default prefix: **`&`**. It runs on many servers at once, each with its own settings, in English, Portuguese or Spanish (`&config language`). Everything lives in an embedded **SQLite** database and **one container** — the AI too, if you want it.

## Run your own

```bash
git clone https://github.com/GhisoOF/stoat_bot && cd stoat_bot
cp .env.example .env    # BOT_TOKEN and DONO — the rest is optional
docker compose up -d --build
```

Without Docker: `npm install && node iniciar.js` (or `node main.js` for the bot alone). On a new server, start with `&setup` (guided setup) and `&help`.

## The AI inside

- **Moderation only:** the AI confirms banned topics (`&automod sentinel topics`) and looks at images and profile pictures. Judy doesn't chat, search the web or generate images. `IA=0` turns the AI off (banned topics are then decided by the score alone).
- **Local only:** the model runs on your machine (llama.cpp, downloaded on first start); nothing goes to an outside AI service.
- **In one place:** everything that talks to the model lives in `modulos/moderacao/modelo.js` — that's where you remove the AI.

## What the host machine exposes

- Images only from Stoat's CDN, with size caps; pages, RSS and blocklists only from the public internet (IP checked on connect, every redirect checked).
- Music only from YouTube, SoundCloud and Spotify. Webhooks: a 128-bit token per hook, URL sent by DM, the port opens only when a hook exists.
- One server never touches another: nothing is posted to another server's channel.
- Internal services listen on `127.0.0.1` with a key; the container drops all privileges.
- Every outgoing fetch leaves through the machine's connection — use a VPN to hide its IP.

## Commands

Generated from the command registry (`modulos/comandos/`); `&help <command>` explains each one.

<!-- gerado:comandos -->
**🚀 Getting started**

| Command | What it does |
|---|---|
| `&ping` | Shows the latency between the message being sent and the bot processing it |
| `&userinfo` | Shows ID, account creation, server join, roles and the profile picture |
| `&tutorial` | where to start and the concepts |
| `&setup` | guided setup: the bot asks, you answer |
| `&staff` | who the staff is; mark the roles that moderate |
| `&server` | The server you're in: owner, creation date, members and description |
| `&help` | this help: the index, a group or a command |
| `&info` | the bot on this server, credits and support |
| `&config` | everything this server configures, in one place |
| `&reset` | Puts Judy back to factory settings on this server: automod (all off), punishment, log channel, welcome/goodbye |
| `&privacy` | what Judy keeps about you, and erasing it |

**🛡️ Protect**

| Command | What it does |
|---|---|
| `&kick` | Kicks someone |
| `&ban` | Bans someone (the ID of someone who already left works) |
| `&unban` | With nothing, lists the banned users with a number; `&unban 3` unbans the 3rd |
| `&untimeout` | With nothing, lists who is timed out with a number; `&untimeout 2` lifts the 2nd |
| `&timeout` | Times someone out: they can only view the server until it ends |
| `&purge` | Deletes the channel's latest messages (1–100) |
| `&warn` | Gives a warning |
| `&automod` | Automatic moderation in four groups, each with parts |
| `&globalban` | Ban list shared across Judy's servers |

**🎨 Customize**

| Command | What it does |
|---|---|
| `&color` | Paints a role |
| `&embed` | Posts an embed message |
| `&reactionrole` | Whoever reacts with the emoji gets the role; removing the reaction takes it away |
| `&rss` | The server's news digest: stories from the feeds come out in one summary a day, at the server's time |
| `&autorole` | Every new member gets this role on joining |
| `&welcome` | Embed posted when someone joins the server |
| `&goodbye` | Embed posted when someone leaves the server (leave, kick or ban) |
| `&timezone` | Turns a time into a timestamp: everyone sees it in their own timezone |
| `&webhook` | External services post into your channel: GitHub (push, issues, PRs, releases, Actions…), Crafty/Minecraft and |
| `&ticket` | Support with a private channel, by reaction |

**🎮 Fun**

| Command | What it does |
|---|---|
| `&xp` | Message-based levels, per server |
| `&tts` | Judy speaks in calls |
| `&join` | Brings Judy into the call and she starts speaking everything written there |
| `&leave` | Takes Judy out of the call: she stops reading the chat and stops the music |
| `&music` | Music in the call — YouTube, SoundCloud and Spotify, with a queue |
| `&roll` | Tabletop RPG dice, fully loaded |
| `&economy` | This server's currency — each server has its own |
| `&entertainment` | The fun & games family |

**🩺 Diagnostics**

| Command | What it does |
|---|---|
| `&debug` | The bot's diagnostics on this server |

**👑 Bot owner**

| Command | What it does |
|---|---|
| `&servers` | where the bot is, the hourly report, notices to every server |
| `&case` | the daily moderation sample (by DM) |
| `&testset` | labelled images for the vision test set (by DM) |
<!-- /gerado:comandos -->

## Environment variables

Generated from `.env.example` (where each one is explained in full).

<!-- gerado:variaveis -->
| Variable | Example | Description (from `.env.example`, in Portuguese) |
|---|---|---|
| `BOT_TOKEN` | — | Token do bot (crie um bot no Stoat/Revolt e cole o token aqui) |
| `DONO` | — | ID do perfil do DONO do bot (clique no seu perfil → copiar ID). |
| `CRIADOR` | — | Quem criou a bot — aparece nos créditos do &info ("Criada por …"). |
| `IA` | `1` | (2 nov 2026) O chat IA saiu: a IA da Judy existe SÓ na moderação — o juiz que confirma os temas proibidos (&automod sentinela assuntos) e a visão que descreve i |
| `IA_TTL` | `300` | O modelo sai da memória depois de 5 min parado (IA_TTL, em segundos): os pedidos da moderação são esporádicos. |
| `LLAMA_CTX` | `8192` | Contexto do modelo (LLAMA_CTX, padrão 8192): a visão precisa de espaço para a imagem. |
| `IA_MODO` | `local` | Onde a IA roda: "local" roda os modelos na sua máquina (sem custo, sem token, precisa de ~2–4 GB de RAM livre; nada sai da máquina). |
| `MODELO` | `bartowski/Qwen2.5-3B-Instruct-GGUF:Q4_K_M` | O JUIZ dos temas proibidos: um GGUF do Hugging Face (usuario/repo:quantização), baixado automaticamente no primeiro arranque e guardado no volume (/data/modelos |
| `MODELO_MODERACAO` | `ggml-org/gemma-3-1b-it-GGUF:Q4_K_M` | Um modelo SÓ para o juiz, se quiser outro que o MODELO (vence o MODELO; ~0,8 GB em Q4): |
| `LLAMA_CTX_MODERACAO` | `4096` | Contexto do juiz (vazio = o LLAMA_CTX de todos; com o mesmo modelo na visão, não fica menor que o LLAMA_CTX): |
| `MODELO_VISAO` | `LiquidAI/LFM2.5-VL-3B-GGUF:Q4_K_M` | Modelo multimodal para VER imagens e fotos de perfil (opcional; sem ele, as imagens não são analisadas — o hash e o texto do perfil continuam). |
| `LLAMA_SWAP_YAML` | `/data/llama-swap.yaml` | Onde o iniciar.js grava a configuração do llama-swap (gerada no boot). |
| `IDIOMA_PADRAO` | `en` | O idioma oficial do bot é o inglês: servidor novo (e o &reset) começa nele. |
| `CONFIG_PATH` | `./dados/automod-config.json` | SÓ para rodar FORA do Docker (node main.js direto). |
| `DB_PATH` | `./dados/stoat.db` | — |
| `TZ` | `America/Sao_Paulo` | — |
| `IA_SERVICO_URL` | — | Serviço de IA (a visão e o hash das imagens): sobe embutido no container (localhost:8090). |
| `LLM_URL` | `http://host.docker.internal:8081` | Inferência (llama.cpp / llama-swap, formato OpenAI) — só com um servidor de modelos de FORA (no modo local o iniciar.js define tudo): |
| `LLM_MODEL_JUIZ` | — | — |
| `LLM_MODEL_VISAO` | — | — |
| `VOZ_ATIVA` | `0` | Voz nas calls (opcional): VOZ_ATIVA=1 e pronto — o Piper vem na imagem e as vozes são baixadas sozinhas no primeiro arranque (para o volume). |
| `VOZES` | `pt_BR-faber-medium` | Quais vozes baixar (nomes do catálogo https://huggingface.co/rhasspy/piper-voices, separados por vírgula; a primeira vira a padrão). |
| `VOZ_CHAVE` | — | Senha do serviço de voz embutido. |
| `IA_SERVICO_CHAVE` | — | — |
| `SERVICO_HOST` | `127.0.0.1` | (IA_CHAVE também vale como chave do serviço de IA — o bot e o serviço leem as duas.) Serviço de voz NATIVO (fora do container): sem VOZ_CHAVE ele não sobe, e el |
| `SUPER_ADMINS` | — | Super-admins do bot (IDs separados por vírgula). |
| `LLM_PARALELO` | `2` | Dois papéis: LLM_MODEL_JUIZ (o juiz dos temas proibidos; sem ele, o LLM_MODEL) e LLM_MODEL_VISAO. |
| `LLM_ESPERAS_429` | `2000,5000,10000` | Esperas (ms) antes de repetir quando o llama-swap responde 429 (lotado): |
| `LLM_TIMEOUT_MS` | `300000` | Teto de espera de um pedido ao modelo (ms): |
| `PRIORIDADE_SERVIDORES` | — | Prioridade no limite: o dono do bot (DONO) e o servidor dele passam na frente no teto de músicas. |
| `MUSICA_MAX_SIMULTANEAS` | `3` | Músicas tocando ao mesmo tempo (cada uma é um yt-dlp + ffmpeg). |
| `SLOWMODE_ESPERA_MAX_S` | `30` | Canal com modo lento: a Judy espera a vez (o Stoat aplica o modo lento ao bot sem a permissão "Ignorar modo lento"). |
| `AUTOMOD_CONFIRMAR_HORAS` | `24` | O silêncio é o timeout nativo do Stoat (o bot precisa de TimeoutMembers). |
| `PAGINAS_DIAS` | `7` | Botões ◀ ▶ das mensagens paginadas continuam valendo por estes dias, mesmo depois de o bot reiniciar. |
| `REVISAO_POR_DIA` | `10` | Casos da amostra que chegam por DM ao dono do bot (o primeiro dos SUPER_ADMINS) por dia. |
| `REVISAO_HORA` | `21` | A hora (UTC, 0–23) da rodada diária: resumo, limiares recalculados e os casos do dia. |
| `REVISAO_AMOSTRA` | `0.02` | A fração das decisões dos detectores (e do que não puniram) que vira amostra (0–0.1). |
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
| `MUSICA_YTDLP_TIMEOUT_MS` | `60000` | Tetos do yt-dlp (ms): a consulta do vídeo, e a música tocando sem chegar dado. |
| `MUSICA_YTDLP_PARADO_MS` | `120000` | — |
| `MUSICA_HOSTS` | — | Links de música só destes sites (os padrões: YouTube, SoundCloud, Spotify); acrescente outros hosts aqui, separados por vírgula. |
| `MUSICA_COOKIES` | `/data/yt-cookies.txt` | Vídeo do YouTube com restrição de idade só toca logado. |
| `POLITICA_PRIVACIDADE_URL` | `https://github.com/GhisoOF/stoat_bot/blob/main/PRIVACIDADE.md` | Política de privacidade que o &privacidade e o &sobre mostram. |
| `LOG_ANONIMO` | `1` | O log do container leva os IDs do Stoat como pseudônimo (o segredo fica em /data/log-segredo.key, ou em LOG_SEGREDO). |
| `LOG_SEGREDO` | — | — |
| `LOG_MAX_TAMANHO` | `10m` | Tamanho do log do container: até LOG_MAX_ARQUIVOS arquivos de LOG_MAX_TAMANHO. |
| `LOG_MAX_ARQUIVOS` | `5` | — |
| `MEMORIA_LIMITE` | `24g` | Memória máxima do container do bot (os modelos da moderação incluídos). |
| `DIAS_APOS_SAIDA` | `30` | Dias depois de a Judy sair de um servidor até os dados dele serem apagados. |
<!-- /gerado:variaveis -->

## Development

```bash
npm install
node scripts/verificar-build.js   # integrity: imports, registry, citations, READMEs, NOVIDADES
node scripts/gerar-readme.js      # regenerates the tables above
node testes.mjs --lista           # the test suites
```

## License

WTFPL (see `LICENSE`).
