# Judy — moderación, utilidades e IA para Stoat

![Licencia](https://img.shields.io/badge/licencia-WTFPL-green) ![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen) ![Docker](https://img.shields.io/badge/docker-multi--arch-blue) ![Idiomas](https://img.shields.io/badge/bot-es%20%C2%B7%20en%20%C2%B7%20pt--BR-orange)

🇬🇧 [English](README.md) · 🇧🇷 [Português](README.pt-BR.md) · 🔒 [Política de privacidad](PRIVACIDADE.md) (en portugués)

Bot para la plataforma **Stoat** (el fork de Revolt), en Node.js con [`stoat.js`](https://github.com/stoatchat/javascript-client-sdk). Prefijo predeterminado: **`&`**. Funciona en varios servidores a la vez, cada uno con su configuración, en inglés, portugués o español (`&config idioma`). Todo vive en una base **SQLite** integrada y en **un solo contenedor** — la IA también, si quieres.

## Monta el tuyo

```bash
git clone https://github.com/GhisoOF/stoat_bot && cd stoat_bot
cp .env.example .env    # BOT_TOKEN y DONO — lo demás es opcional
docker compose up -d --build
```

Sin Docker: `npm install && node iniciar.js` (o `node main.js` solo para el bot). En un servidor nuevo, empieza por `&asistente` (configuración guiada) y `&ayuda`.

## La IA por dentro

- **Solo en la moderación:** la IA confirma los temas prohibidos (`&automod centinela temas`) y mira imágenes y fotos de perfil. Judy no conversa, no busca en la web y no genera imágenes. `IA=0` apaga la IA (los temas prohibidos se deciden solo por la nota).
- **Solo local:** el modelo corre en tu máquina (llama.cpp, descargado en el primer arranque); nada va a un servicio de IA externo.
- **En un solo lugar:** todo lo que habla con el modelo vive en `modulos/moderacao/modelo.js` — para quitar la IA, es ahí.

## Lo que expone la máquina

- Imágenes solo del CDN de Stoat, con tope de tamaño; páginas, RSS y listas solo de internet pública (IP comprobada al conectar, cada redirección comprobada).
- Música solo de YouTube, SoundCloud y Spotify. Webhooks: token de 128 bits por gancho, URL por DM, el puerto solo abre si hay un gancho.
- Un servidor no toca a otro: nada se publica en un canal de otro servidor.
- Los servicios internos escuchan en `127.0.0.1` con clave; el contenedor corre sin privilegios.
- Toda búsqueda hacia fuera sale por la conexión de la máquina — usa una VPN para ocultar su IP.

## Comandos

Generado del registro de comandos (`modulos/comandos/`); `&ayuda <comando>` explica cada uno.

<!-- gerado:comandos -->
**🚀 Empezar**

| Comando | Qué hace |
|---|---|
| `&ping` | Muestra la latencia entre el envío del mensaje y el procesamiento del bot |
| `&userinfo` | Muestra el ID, la creación de la cuenta, la entrada al servidor, los roles y la foto de perfil |
| `&tutorial` | por dónde empezar y los conceptos |
| `&asistente` | configuración guiada: el bot pregunta, tú respondes |
| `&staff` | quién es el staff; marcar los roles que moderan |
| `&servidor` | El servidor en el que estás: dueño, creación, miembros y descripción |
| `&ayuda` | esta ayuda: el índice, un grupo o un comando |
| `&info` | el bot en este servidor, los créditos y el soporte |
| `&config` | todo lo que configura este servidor, en un solo lugar |
| `&reset` | Devuelve a Judy a la configuración de fábrica en este servidor: automod (todo apagado), sanciones, canal de lo |
| `&privacidad` | lo que Judy guarda sobre ti, y borrarlo |

**🛡️ Proteger**

| Comando | Qué hace |
|---|---|
| `&expulsar` | Expulsa a alguien |
| `&ban` | Banea a alguien (vale el ID de quien ya salió) |
| `&desbanear` | Sin nada, lista a los baneados con un número; `&desbanear 3` desbanea al 3.º |
| `&untimeout` | Sin nada, lista a quien está silenciado con un número; `&untimeout 2` le devuelve la voz al 2.º |
| `&silenciar` | Silencia a alguien por un tiempo: la persona solo ve el servidor hasta que se acabe |
| `&limpiar` | Borra los últimos mensajes del canal (1–100) |
| `&advertir` | Da una advertencia |
| `&automod` | La moderación automática en cuatro grupos, cada uno con partes |
| `&banglobal` | Lista de bans compartida entre los servidores de Judy |

**🎨 Personalizar**

| Comando | Qué hace |
|---|---|
| `&color` | Pinta un rol |
| `&embed` | Publica un mensaje embed |
| `&reactionrole` | Quien reacciona con el emoji recibe el rol; quien quita la reacción lo pierde |
| `&rss` | El telediario del servidor: las noticias de los feeds salen en un resumen al día, a la hora del servidor |
| `&autorol` | Todo miembro nuevo recibe este rol al entrar |
| `&bienvenida` | Embed que se publica cuando alguien entra al servidor |
| `&despedida` | Embed que se publica cuando alguien sale del servidor (salida, expulsión o ban) |
| `&huso` | Convierte una hora en timestamp: cada persona la ve en su propio huso horario |
| `&webhook` | Servicios externos publican en un canal tuyo: GitHub (push, issues, PR, releases, Actions…), Crafty/Minecraft  |
| `&ticket` | Soporte con un canal privado, por reacción |

**🎮 Diversión**

| Comando | Qué hace |
|---|---|
| `&xp` | Niveles por mensaje, de cada servidor |
| `&tts` | Judy habla en las llamadas |
| `&entrar` | Trae a Judy a la llamada y empieza a leer todo lo que se escriba ahí |
| `&salir` | Saca a Judy de la llamada: deja de leer el chat y detiene la música |
| `&musica` | Música en la llamada — YouTube, SoundCloud y Spotify, con cola |
| `&dados` | Dados de rol de mesa, con todo |
| `&economia` | La moneda de este servidor — cada servidor tiene la suya |
| `&entretenimiento` | La familia de los juegos y bromas |

**🩺 Diagnóstico**

| Comando | Qué hace |
|---|---|
| `&debug` | El diagnóstico del bot en este servidor |

**👑 Dueño del bot**

| Comando | Qué hace |
|---|---|
| `&servidores` | dónde está el bot, el informe por hora, avisos a todos los servidores |
| `&caso` | la muestra diaria de la moderación (por DM) |
| `&bateria` | imágenes etiquetadas para la batería de prueba de la visión (por DM) |
<!-- /gerado:comandos -->

## Variables de entorno

Generadas del `.env.example` (donde cada una se explica por completo).

<!-- gerado:variaveis -->
| Variable | Ejemplo | Descripción (del `.env.example`, en portugués) |
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
| `CLASSIFICADOR_TEXTO` | `1` | Classificador de texto pequeno (P5): um sinal a mais na nota do sentinela, lido do arquivo classificador-texto.json que a bateria do dono gera. |
| `CLASSIFICADOR_TEXTO_ARQUIVO` | `/data/classificador-texto.json` | Onde está o arquivo do modelo (caminho absoluto). |
| `PAGINAS_DIAS` | `7` | Botões ◀ ▶ das mensagens paginadas continuam valendo por estes dias, mesmo depois de o bot reiniciar. |
| `REVISAO_POR_DIA` | `10` | Casos da amostra que chegam por DM ao dono do bot (o primeiro dos SUPER_ADMINS) por dia. |
| `REVISAO_HORA` | `21` | A hora (UTC, 0–23) da rodada diária: resumo, limiares recalculados e os casos do dia. |
| `REVISAO_AMOSTRA` | `0.02` | A fração das decisões dos detectores (e do que não puniram) que vira amostra (0–0.1). |
| `REVISAO_PROBLEMAS_POR_DIA` | `10` | Casos da segunda análise que chegam por DM ao dono do bot por dia (1–100), à parte da amostra. |
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

## Desarrollo

```bash
npm install
node scripts/verificar-build.js   # integridad: imports, registro, citas, READMEs, NOVIDADES
node scripts/gerar-readme.js      # regenera las tablas de arriba
node testes.mjs --lista           # las suites de pruebas
```

## Licencia

WTFPL (ver `LICENSE`).
