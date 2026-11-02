# Judy — moderação, utilidades e IA para o Stoat

![Licença](https://img.shields.io/badge/licen%C3%A7a-WTFPL-green) ![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen) ![Docker](https://img.shields.io/badge/docker-multi--arch-blue) ![Idiomas](https://img.shields.io/badge/bot-pt--BR%20%C2%B7%20en%20%C2%B7%20es-orange)

🇬🇧 [English](README.md) · 🇪🇸 [Español](README.es.md) · 🔒 [Política de privacidade](PRIVACIDADE.md)

Bot para a plataforma **Stoat** (o fork do Revolt), em Node.js com a [`stoat.js`](https://github.com/stoatchat/javascript-client-sdk). Prefixo padrão: **`&`**. Roda em vários servidores ao mesmo tempo, cada um com a sua configuração, em inglês, português ou espanhol (`&config idioma`). Tudo mora num banco **SQLite** embutido e num **container só** — a IA também, se você quiser.

## Subir o seu

```bash
git clone https://github.com/GhisoOF/stoat_bot && cd stoat_bot
cp .env.example .env    # BOT_TOKEN e DONO — o resto é opcional
docker compose up -d --build
```

Sem Docker: `npm install && node iniciar.js` (ou `node main.js` só para o bot). Num servidor novo, comece por `&assistente` (configuração guiada) e `&help`.

## A IA por dentro

- **Só na moderação:** a IA confirma os temas proibidos (`&automod sentinela assuntos`) e olha imagens e fotos de perfil. A Judy não conversa, não busca na web e não gera imagem. `IA=0` desliga a IA (os temas proibidos decidem só pela nota).
- **Só local:** o modelo roda na sua máquina (llama.cpp, baixado no primeiro arranque); nada vai a um serviço de IA de fora.
- **Num ponto só:** tudo o que fala com o modelo mora em `modulos/moderacao/modelo.js` — para tirar a IA, é ali.

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
| `&tutorial` | por onde começar e os conceitos |
| `&assistente` | configuração guiada: o bot pergunta, você responde |
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
| `&economia` | A moeda deste servidor — cada servidor tem a sua |
| `&entretenimento` | A família das brincadeiras |

**🩺 Diagnóstico**

| Comando | O que faz |
|---|---|
| `&debug` | O diagnóstico do bot neste servidor |

**👑 Dono do bot**

| Comando | O que faz |
|---|---|
| `&servidores` | onde o bot está, o relatório por hora, avisos a todos os servidores |
| `&caso` | a amostra diária da moderação (por DM) |
| `&bateria` | imagens rotuladas para a bateria de teste da visão (por DM) |
<!-- /gerado:comandos -->

## Variáveis de ambiente

Geradas do `.env.example` (onde cada uma é explicada por inteiro).

<!-- gerado:variaveis -->
| Variável | Exemplo | Descrição (do `.env.example`) |
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
| `BATERIA_AVISO_PORTA` | `8097` | Porta interna por onde a bateria de teste do dono avisa o bot, que repassa à DM dele. |
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

## Desenvolvimento

```bash
npm install
node scripts/verificar-build.js   # integridade: imports, registro, citações, READMEs, NOVIDADES
node scripts/gerar-readme.js      # regera as tabelas acima
node testes.mjs --lista           # as suítes de teste
```

## Licença

WTFPL (veja `LICENSE`).
