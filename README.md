# Stoat Bot — moderação e IA para Stoat/Revolt

![Licença](https://img.shields.io/badge/licen%C3%A7a-WTFPL-green) ![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen) ![Docker](https://img.shields.io/badge/docker-multi--arch-blue) ![Idiomas](https://img.shields.io/badge/bot-pt--BR%20%C2%B7%20en-orange)

> 🇬🇧 *The bot's official language is **English** (new servers start in it); it is fully bilingual (`&language pt` switches to pt-BR). This documentation is in Portuguese.*

Bot de moderação para a plataforma **Stoat** (fork/rebrand do Revolt), escrito em
Node.js (ESM) com a biblioteca [`stoat.js`](https://www.npmjs.com/package/stoat.js).
Prefixo padrão: **`&`**.

Funciona em **vários servidores ao mesmo tempo**, cada um com sua própria
configuração, punições e chat de logs. Tudo é persistido num banco **SQLite**
embutido (nada de serviço externo), então as configurações e punições
**sobrevivem a reinícios e atualizações**. Tudo roda num **container só** —
inclusive a IA, se você quiser.

---

## Subir o seu (um container, um `.env`)

```bash
git clone https://github.com/GhisoOF/stoat_bot && cd stoat_bot
cp .env.example .env    # edite: BOT_TOKEN, DONO, SERVIDOR — o resto é opcional
docker compose up -d --build
```

**Baterias incluídas** — o `up` acima traz tudo, sem instalar mais nada:

| Peça | Como vem |
|---|---|
| Bot + serviço de ferramentas da IA | dentro da imagem |
| Motor de IA (llama.cpp, build Vulkan) | dentro da imagem — usa a GPU/iGPU quando há driver, e cai para CPU sozinho quando não há; com `IA_MODO=local`, o **modelo** é baixado do Hugging Face no primeiro arranque e guardado no volume |
| Busca na web (SearXNG) | sobe junto no compose, já configurado — a IA pesquisa de fábrica |
| Leitura de código (GitHub) | dentro; repositórios públicos funcionam sem token |
| Voz nas calls (Piper + ffmpeg) | dentro da imagem; `VOZ_ATIVA=1` e as vozes baixam sozinhas no primeiro arranque — `VOZES=` escolhe quais (qualquer idioma do catálogo do Piper) |
| Geração de imagem (stable-diffusion.cpp, Vulkan + Z-Image-Turbo por padrão) | dentro da imagem; os modelos (~6,5 GB: difusão + VAE + LLM do prompt) baixam **no arranque**, antes do bot conectar — `IMAGEM=0` desliga, `SD_MODELO_TIPO=sd` volta ao SD-Turbo (1 arquivo, mais leve), `SD_MODELO_TIPO=qwen-image` usa o **Qwen-Image 2.1** (~13 GB; padrão: o Q8_0 "Uncensored" do abenzerps — modelo sem filtro, então toda imagem passa pela visão antes de sair; `SD_Q_DIFUSAO_URL` troca o arquivo, e um com "turbo" no nome roda em 8 passos), `SD_URL` troca por um A1111/Forge externo. Antes de desenhar, o LLM local é **descarregado da GPU** (volta sozinho na próxima mensagem) e, se ainda faltar memória, a 2ª tentativa vai no modo econômico (LLM do prompt na CPU, VAE em blocos) — `IMAGEM_LIBERAR_GPU=0` desliga |

Visão (a IA **ler** imagens) depende só de o modelo escolhido enxergar —
funciona de fábrica no modo `online` com um modelo multimodal, e no modo
`local` conforme o GGUF escolhido. Para rodar **só o bot**, sem a busca:
`docker compose up -d stoat-bot`.

As variáveis que importam:

| Variável | O que é |
|---|---|
| `BOT_TOKEN` | token do bot na plataforma |
| `DONO` | ID do **seu perfil** — ganha os comandos administrativos do bot |
| `SERVIDOR` | ID do servidor onde a **IA** funciona (`*` = em todos; vazio = IA em lugar nenhum). Fora dele fica **só a moderação por IA** (temas proibidos, visão de imagens e fotos de perfil, `&modia`); chat, geração de imagem e resumo do RSS ficam só nele. Posto **pelo ID**, é o servidor da casa: os canais NSFW dele saem das travas (ver abaixo). *Chat AI only here; elsewhere, AI moderation only.* |
| `MODELO_MODERACAO` | modelo **pequeno** só para o juiz da moderação (temas proibidos, `&modia`) dos **outros** servidores — o de `SERVIDOR` continua com o modelo da conversa. Ex.: `ggml-org/gemma-3-1b-it-GGUF:Q4_K_M` (~0,8 GB). No modo local fica carregado junto do de conversa (grupo sem troca no llama-swap). *Small model for the moderation judge on the other servers; yours keeps the chat model.* |
| `IA` | `0` desliga todos os módulos de IA — o bot de moderação segue completo |
| `CONVERSA` | `0` = **modo enxuto**: a IA fica só para moderação (temas proibidos, visão de imagens e fotos de perfil), o relatório horário e o RSS. Sem chat, memória, comentários e geração de imagem; o `&modia` fica **só com `MODELO_MODERACAO`** (o juiz pequeno, que aguenta ler toda mensagem), em todo servidor — e no modo enxuto a casa também é julgada por ele; o modelo usa contexto 4096 e sai da memória após 5 min parado (`IA_TTL`). Com `BUSCA_WEB=0`, o SearXNG nem sobe. *Lean mode: AI only for moderation, the log report and RSS; `&modia` on every server when a dedicated `MODELO_MODERACAO` exists.* |
| `IA_MODO` | `local` roda um modelo na sua máquina (o **MODELO** é baixado do Hugging Face no primeiro arranque e guardado no volume); `online` usa uma plataforma via `TOKEN_IA` (padrão: OpenRouter) |
| `MODELO` | local: `repo:quantização` GGUF do HF · online: nome do modelo na plataforma |
| `TOKEN_IA` | token da plataforma, só no modo `online` |
| `PROMPT` | personalidade padrão da IA no seu texto — e `&personalidade` troca por servidor, sem redeploy |
| `IMAGEM` | `0` desliga a geração de imagem embutida (`SD_URL` aponta para um gerador externo); `SD_MODELO_TIPO=sd` troca o padrão (Z-Image-Turbo) pelo SD-Turbo clássico; `SD_MODELO_TIPO=qwen-image`, pelo Qwen-Image 2.1 (`SD_Q_DIFUSAO_URL`, `SD_Q_VAE_URL`, `SD_Q_LLM_URL`) |
| `AUTUMN_URL` | endereço do serviço de upload de anexos do Stoat (`cdn.stoatusercontent.com` por padrão) — normalmente não precisa mexer |

Nomes internos (`SUPER_ADMINS`, `CHAT_SERVIDORES`, `LLM_URL`, `LLM_MODEL`)
continuam valendo e têm prioridade — útil para apontar a IA a um servidor de
LLM próprio (llama.cpp, llama-swap ou Ollama, qualquer um com API OpenAI).

**Sem Docker** também funciona: `npm install && node iniciar.js` (ou
`node main.js` para só o bot, sem os serviços embutidos). Aponte `CONFIG_PATH`
e `DB_PATH` para um diretório estável.

---

## Primeiros passos (5 minutos)

Acabou de adicionar o bot? Três comandos resolvem quase tudo:

| Comando | O que faz |
|---|---|
| `&assistente rapido` | ⭐ **configuração guiada**: o bot pergunta (idioma, staff, log, proteção, boas-vindas), você responde em texto normal, ele mostra o resumo e aplica |
| `&reset` | volta a Judy à **configuração de fábrica** neste servidor (automod desligado, sem log/staff, idioma inglês) — os dados (XP, avisos, saldos, RPG) ficam; só o **dono do servidor** ou o dono do bot; confirma com código e `&reset undo` desfaz por 24 h |
| `&tutorial` | guia **em páginas** (reaja ◀ ▶): permissões → canais → proteção → boas-vindas e cargos → XP e RPG → checklist |
| `&tutorial ids` | **menções e IDs**: como apontar pessoa, cargo e canal (menção, nome ou ID), o que é um ID e como copiá-lo no Stoat (*Configurações → Avançado → Show 'copy ID' in context menus*; cargo: *Copy role ID*) — *mentions and IDs, and how to copy them* |
| `&help` | índice **por intenção** (começar · proteger · personalizar · diversão · rpg · diagnóstico); `&help <comando>` explica **cada parâmetro** |

### A regra de ouro dos canais

> **A permissão definida no canal vence a definida no cargo.** Se o canal nega,
> nenhum cargo salva — nem o do bot. Deixe as permissões dos cargos no mínimo e
> abra exceções canal por canal.

Separe os canais em três tipos — 🔒 só staff vê (#log, #staff), 📢 só staff
escreve (#regras, #avisos), 💬 geral — e configure as exceções **no canal**.
`&debug` confere o que o bot enxerga em cada um; `&assistente canais`
diz exatamente o que clicar.

---

## Recursos

**Moderação**

- **AutoMod**: anti-spam, **anti-duplicata** (a mesma mensagem repetida), anti-mass-mention, anti-invite (com whitelist),
  anti-caps, anti-link (listas estilo Pi-hole via `&automod blocklist`), anti-zalgo/
  caracteres invisíveis, e o **sentinela** (`&automod sentinela`): nota de 0–10
  para golpe, +18, gore, doxxing e extorsão, que enxerga através de disfarces
  (l33t, letras separadas, caracteres invisíveis, letras de outro alfabeto, link
  escrito como `bit[.]ly`). Ele também soma as mensagens de cada pessoa ao longo
  das horas e **avisa a staff** quando formam um padrão de dano — desafios,
  humilhação, expor gente — mesmo sem nenhuma frase que condene sozinha.
  Falar de se machucar, sozinho, nunca dispara isso.
  Também pega **ódio e ameaça**: injúria racial e contra grupos, símbolos de
  ódio em massa, "estuprar e matar" — sempre por conjunção (grupo + insulto),
  para que falar **sobre** racismo, notícia ou identidade nunca seja punido.
  E o **golpe do recrutamento** em inglês e português ("monetize suas contas
  de IA", "trabalhe comigo, dividimos 50/50", "ganho $2.000 por mês", "me chama
  na DM") — por conjunção, para que "dividimos a conta 50/50" ou "procuro
  parceiro pro projeto" passem.
- **Comandos e edições também passam**: uma mensagem que começa com um comando
  (`&ping <convite>`) e uma mensagem **editada** passam pelos filtros de
  conteúdo (ódio, convite, link, sentinela, menções, caps…); os de ritmo (spam,
  repetição, rajada de mídia) não, porque dez comandos seguidos não são flood.
- **Modo `avisar`**: não pune ninguém. Os filtros de regra fixa (ódio, convite,
  link da lista, spam, caps…) ainda apagam a mensagem — e o aviso diz isso; o
  sentinela, que dá nota e pode errar, não apaga.
- **Começa desligado**: servidor novo entra com o automod inteiro desligado —
  `&automod on` liga tudo, `&automod antispam on` liga um grupo, `&automod off`
  desliga tudo de uma vez. *New servers start with automod off; `&automod on|off`
  toggles everything.*
- **Confiança**: o rigor do sentinela acompanha o nível de XP **quando o servidor
  usa XP**; sem XP, acompanha o tempo da pessoa no servidor (antes, sem XP, todo
  mundo ficava para sempre como "recém-chegado", no rigor máximo).
- **Anti-raid sem botão**: a idade da conta sai do próprio ID; conta criada há
  minutos passa pelo automod mais rígido. Três contas novas entrando em 15 min
  ligam a proteção por 30 min e avisam a staff uma vez. Se uma punição falha
  (ex.: falta `AssignRoles`), tudo o que a pessoa postar nos 30 min seguintes é
  apagado.
- **Imagens** (`&automod antiimagem`): imagens de contas novas são descritas pelo
  modelo de visão — sessão nova a cada imagem, só descrição — e o bot pontua a
  descrição por palavras-chave e pelo sentinela (texto escrito na imagem também
  conta). Se apitar, a staff é chamada no log. Nunca pune e nunca republica a
  imagem.
- **Temas proibidos** (`&automod sentinela assuntos`): para servidor com regra de
  "aqui não se discute política, religião…" onde zoar com o tema é OK. Cada tema
  — `politica`, `religiao`, `drogas`, `sexual` (texto) — tem a sua ação: `off`
  (padrão), `alertar` (chama a staff), `apagar` (só tira a mensagem) ou `punir`
  (apaga e conta na escada). Cada mensagem ganha uma **nota de 0 a 10** por tema,
  como o sentinela: termos com peso (forte 3 · nomes de políticos e partidos 2,5 ·
  ideologias e instituições 2 · genérico 1), sinais de debate e de ataque,
  tamanho e o **contexto** do canal (o tema voltando com outras pessoas) sobem;
  "kkkk", emoji de riso, "zoeira", mensagem curta, pergunta neutra e o canal
  rindo amenizam; "meu deus", "que droga" e "vira à direita" não contam. Passou
  do limiar (`sensibilidade` baixa 6 · média 4,5 · alta 3,5), a IA lê o fio e
  confirma se é discussão de verdade (`ia off` = a nota decide sozinha); erro do
  modelo nunca pune. `test <texto>` mostra a nota; `liberar #canal` deixa um
  canal (ex.: #debate) de fora. *Forbidden topics: per-topic action (off ·
  alert · delete · punish); a weighted 0–10 score (terms, debate, attacks,
  channel context; laughter and emoji soften it), confirmed by the AI.*
- **Foto de perfil** (`&automod sentinela avatar`): a foto de quem entra ou troca
  (a do perfil e a de servidor) passa pelo modelo de visão. Genitália, ato sexual
  ou pornografia descritos apitam sozinhos; nudez, gore e símbolo de ódio só com
  o voto de risco do modelo. Ação por servidor: `silenciar` (padrão, timeout de
  24 h — `tempo` muda), `alertar`, `expulsar` ou `banir`; a staff é sempre
  avisada e a foto nunca é republicada. `checar @pessoa` analisa sem punir.
  Liga sozinho nos servidores que já existiam; servidor novo começa desligado.
  *Profile pictures: checked on join and on change by the vision model; default
  action is a 24 h timeout plus a staff alert.*
- **+18 só no servidor da casa, sem amarras:** a geração de imagem vem com
  +18 **bloqueado**, e só os canais marcados como **NSFW** no Stoat do
  servidor posto pelo ID em `SERVIDOR` o liberam (ou todos, se o servidor
  inteiro estiver marcado como NSFW) — sem comando para liberar. Nesses canais
  a Judy conversa sobre conteúdo adulto, faz roleplay, não dá sermão, e a
  imagem perde as travas de gore e de símbolos. Os canais comuns continuam
  limpos. Ficam só os limites fixos: nada sexual com menores e nada sexual (nem
  violência explícita) com pessoa real identificável — conferidos na pergunta,
  na resposta e na imagem pronta, que passa pelo modelo de visão (que diz a
  idade aparente: `IDADE: adulto/menor/incerto`; menor ou incerto descarta).
  Personagem ou estilo de obra ("personagem de…", "estilo de…") não conta como
  pessoa real. Se o cache da plataforma não souber que o canal virou NSFW, a
  Judy confere na API. `&servidores adulto` (dono do bot) é o **diagnóstico do
  canal**: servidor da casa, canal NSFW, visão, gerador — e as últimas recusas
  com o motivo.
  *+18 only on the home server (`SERVIDOR`), in NSFW channels, with no other
  restraint than the fixed limits (minors, real people). `&servidores adulto`
  shows why a channel is or isn't unlocked, and the last refusals.*
- **Painel do dono do bot** (`&servidores`, só `SUPER_ADMINS`, fora do `&help`):
  onde o bot está, com membros e ritmo de mensagens. E o **relatório horário**
  (`&servidores relatorio canal #canal`): a cada hora cheia, banimentos,
  punições, entradas, alertas, ritmo de conversa, assuntos mais comentados,
  erros e reinícios de todos os servidores. Os números saem do código; o modelo
  só escreve os destaques e os assuntos — e, se ele falhar, o relatório sai só
  com os números. Assuntos só dos servidores de que você é dono (ou os que
  listar em `&servidores relatorio assuntos add <id>`); os demais entram só em
  números. Com `RELATORIO_SERVIDOR=<id>` no `.env`, o painel e o relatório só
  existem nesse servidor (comando e canal), e ele sempre entra nos assuntos;
  os outros entram só se listados com `assuntos add` (antes a variável ignorava
  a lista). *With `RELATORIO_SERVIDOR`, that server always has topics; others
  only if added with `assuntos add`.*
- **Ban propagado na hora**: um ban em um servidor da Judy vale imediatamente nos
  outros, conforme o modo de cada um (`off` · `avisar` · `banir`), sem esperar a
  sincronização de 6h.
- **A staff não é moderada**: o dono do servidor, o super admin e os cargos do
  `&staff` passam direto pelo automod. `&automod whitelist add <link>` libera o
  que qualquer um pode postar: um site vai para o anti-link (com subdomínios), um
  convite do Stoat vai para o anti-invite — o bot descobre sozinho qual é qual.
- **Silêncio = timeout nativo do Stoat**: o mute da escada, o modo `confirmar`
  (até a staff decidir, no máximo 24 h — `AUTOMOD_CONFIRMAR_HORAS`) e o
  `&silenciar` usam o timeout da própria plataforma — a pessoa só consegue ver o
  servidor, e o Stoat a libera na hora. Sem cargo para criar nem posicionar.
  Precisa de **TimeoutMembers** no cargo do bot; quem tem TimeoutMembers não pode
  ser silenciado. Se falhar, a pessoa cai na quarentena (tudo apagado por 30 min).
- **Punições persistentes**: avisos e silêncios ficam no banco por
  `(servidor, usuário)` — quem **sai e volta** recebe o silêncio de novo, pelo
  tempo que faltava.
- **Escada de punição**: cada reincidência sobe um degrau (aviso → 5 min →
  1 h → ban, tempos configuráveis com `&automod punicao escada`). Quem escorregou uma
  vez nunca chega ao ban; quem insiste sobe sozinho. O `&warn` manual sobe a
  **mesma** escada, e os avisos **vencem** depois de 30 dias sem um novo
  (`&automod punicao validade <dias|0>`).
- **Primeiro toque**: nos filtros de ruído (repetição, caixa alta, emoji,
  velocidade, convite, menções), o 1º deslize em 10 min de quem já é do
  servidor só apaga e explica, sem contar aviso. Conta nova e onda de raid
  continuam no rigor total. Ódio, golpe e links bloqueados não têm toque.
- **Moderação por IA** (`&modia`): você escreve os critérios em texto livre e
  a IA apaga o que violar, marcando o responsável no log — ela **nunca bane sozinha**.
- **Lista global de banimentos** (`&banglobal`): compartilhada entre os
  servidores da mesma instância, com isenção por pessoa e `desfazer`. Modos:
  `off`, `avisar` (só alerta a staff), `imediato` (bane com **um** ban em outro
  servidor — o antigo `banir`, que continua valendo) e `consenso` (bane só quem
  foi banido em **3+ servidores diferentes**; com menos, avisa a staff). Os bans
  que a própria lista aplicou não contam para o consenso, e a lista do dono do
  bot vale como consenso. *Modes: `off`, `avisar` (warn), `imediato`/`instant`
  (one ban elsewhere is enough) and `consenso`/`consensus` (3+ different
  servers).* O dono do bot põe alguém na lista **pelo ID** com
  `&banglobal add <id> [id…] [motivo]`, mesmo que a pessoa não esteja em
  nenhum servidor — quem já está num deles sente na hora.
  *Global ban list shared across the instance's servers; the bot owner can add
  anyone **by ID** (`&banglobal add`), even people in none of the servers.*
- **Manual**: `&kick`, `&ban` (menção **ou** ID — banir quem já está banido
  responde "já estava banido"), `&silenciar @pessoa 10m [motivo]` /
  `&silenciar tirar @pessoa`, `&limpar`, `&warn`.
- **Logs** (`&log`): punições, entradas/saídas, mensagens apagadas/editadas,
  cargos e comandos — cada categoria liga/desliga. Sai no idioma do servidor
  (`&idioma`), e cargos aparecem pelo nome.
- **Acesso** (`&acesso` + `&staff`): cargos de staff moderam sem permissão
  nativa; comandos restritos a canais escolhidos.

**IA** (nos servidores de `SERVIDOR`; tudo desligável com `IA=0`)

- **Chat** (`&chat` ou menção): conversa com memória curta do canal, contas
  exatas, leitura de código e **busca na web** (via SearXNG) através do serviço
  de ferramentas embutido.
- **Busca sempre, links só quando pedem**: toda pergunta sobre o mundo vai ao
  SearXNG em silêncio — o que voltar entra como notas de referência no prompt
  para a Judy errar menos fato de memória, mas a resposta sai como conversa,
  sem `[n]`, sem rodapé, sem os links e sem "os resultados mostram…".
  Pergunta sobre a própria conversa ("como está o servidor?"), afirmação,
  pedido e papo não buscam. Fontes e links aparecem **só quando a pessoa
  pede a busca** ("pesquisa…", "procura na internet…", "dá um google…").
  Conta e imagem anexada também não buscam; resultado que não
  fala do assunto fica de fora; a consulta da busca de fundo é escrita sem
  raciocínio (mais rápida). `BUSCA_SEMPRE=0` volta a buscar só quando pedem.
- **Prioridade do dono**: no limite (fila de conversas cheia, teto de
  músicas), o dono do bot (`DONO`) passa na frente de todos e o servidor dele
  (o que ele criou, os de `PRIORIDADE_SERVIDORES` e o `RELATORIO_SERVIDOR`)
  na frente dos outros servidores — e entram mesmo com a fila cheia.
- **Ritmo**: a resposta só raciocina quando a mensagem pede (conta, lógica,
  código, explicação, comparação, mensagem longa — `PENSAR=auto`); conversa
  leve sai direto. Todo pedido ao modelo passa por uma fila: chat, moderação
  e RSS na frente; memória, comentário espontâneo e verificador só com o
  modelo livre, sem raciocínio, e descartados se a fila de fundo encher
  (`LLM_PARALELO`, `LLM_FILA_FUNDO`). Um 429 do llama-swap é repetido com
  espera; se persistir, a Judy diz que está sobrecarregada.
- **Um modelo nos dois papéis**: com o mesmo valor em `MODELO` e
  `MODELO_VISAO` (Gemma 4, multimodal), o llama-swap fica com uma entrada só e
  `visao` vira apelido dela — ver uma imagem não descarrega a conversa nem
  carrega uma 2ª cópia do modelo (o que, com um modelo de 17 GB, custaria
  dezenas de segundos por imagem).
- **Menções**: a Judy marca alguém escrevendo `@Nome` de quem está na
  conversa, e o código transforma em menção de verdade; ID que ela inventar (o
  modelo escrevia `<@01M…:>`) nunca chega ao chat — vira `@alguém`.
- **Conhece o servidor**: "quais são as regras?", "quem é da staff?", "em que
  canal posso divulgar?" → a Judy responde com os dados reais do `&servidor` e
  do `&staff` (lidos na hora do Stoat), sem chutar e sem ir à web.
- **Sabe o que mudou nela**: "quais os últimos updates feitos em você?" lê os
  commits do repositório (`GITHUB_REPO`, padrão `GhisoOF/stoat_bot`) na API do
  GitHub; "o commit 0eb26f0…" lê aquele commit (mensagem, arquivos, +/−) e
  responde com o link dele. Repositório público dispensa `GITHUB_TOKEN`.
- **Busca que responde**: o modelo reescreve o pedido em até 2 consultas
  curtas (corrige digitação; `r/Nome` vira busca no reddit), os resultados que
  não falam do pedido saem, as 3 melhores páginas são lidas
  (`BUSCA_LER_PAGINAS`) e a resposta cita só o que usou. As fontes vêm como
  `[domínio](<link>)` — clicáveis, **sem a prévia** que o Stoat gera para cada
  link (`CHAT_PREVIA_LINKS=1` traz de volta).
- **Quem a criou** (`CRIADOR` e `SOBRE_CRIADOR` no `.env`): o que a IA conta
  sobre o criador — só o texto escrito ali, vale em todo servidor (o
  `&personalidade` não apaga) e ela recusa deduzir dado pessoal. O criador é
  reconhecido pelo ID do `DONO`, nunca por alguém dizer que é.
- **Personalidade sua** (`&personalidade`): o prompt de personalidade é
  configurável **por servidor**, por comando — e `PROMPT` no `.env` define o
  padrão global. Regras de segurança e formato continuam fixas.
- **Perfil e memória de longo prazo**: um agente aprende fatos sobre cada
  pessoa (com data) e adapta o tom. `&chat perfil` mostra; `&chat esquecer
  [tudo]` apaga de verdade — banco **e** processo.
- **Iniciativa com freios**: `&chat livre` deixa a IA participar quando o
  assunto vale — nunca em mensagem para outra pessoa (resposta, @menção,
  vocativo) nem em reação solta; sem convite, só pergunta ao grupo ou foto
  mostrada ao grupo, com juiz conservador e no máximo 1 entrada a cada 5 min
  (`CHAT_LIVRE_INTERVALO_MS`) e 4 por hora (`CHAT_LIVRE_POR_HORA`); o log
  mostra cada decisão (`[CHAT-LIVRE]`); `&chat comentar` permite comentários espontâneos com limite
  por dia. `&chat cuidado @user on` marca alguém (opt-in) para tratamento
  gentil e paciente.
- **Vários comandos de uma vez**: um por linha na mesma mensagem (até 10);
  cada um passa pelas mesmas verificações de permissão e de canal, em ordem.
- **RSS** (`&rss`): a cada ciclo, um **relatório por categoria**, neutro e com uma linha
  por notícia — vulnerabilidades (`CVE-…`) formam a sua própria categoria,
  agrupadas por produto —, e no fim **um comentário curto da Judy** sobre o
  conjunto. O código garante que toda notícia aparece, que nada inventado entra
  e que número que não está na notícia não passa.

**Voz nas calls** (`&tts`, opcional)

- A IA entra na call e **fala o que for escrito**: `&entrar` dentro da
  call liga tudo de uma vez, `&sair` desfaz. Síntese **offline** (Piper)
  com efeitos de timbre por ffmpeg, dicionário de abreviações (`vc` → `você`)
  e uma **peneira anti-barulho** que filtra spam pela forma e limita falas por
  minuto no canal — risada passa de propósito, e `&tts <texto>` nunca é filtrado.
- Diagnóstico da cadeia inteira com `&tts estado` e `&tts diagnostico` (diz
  **em qual etapa** a entrada travou). Ligue com `VOZ_ATIVA=1` — o Piper e o
  ffmpeg vêm na imagem, e as vozes baixam sozinhas no primeiro arranque.
  **Escolha as vozes** com `VOZES=` no `.env` (nomes do catálogo
  [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices),
  separados por vírgula — qualquer idioma; a primeira vira a padrão).
  Restrinja com `TTS_SERVIDORES`; `VOZ_SERVICO_URL` aponta para um serviço
  externo, se preferir rodá-lo fora.

**Engajamento**

- **Níveis** (`&xp`): XP por mensagem, cargos por nível (o bot entrega os que estão
  abaixo do cargo dele), leaderboard e parâmetros configuráveis.
- **RPG** (`&game`): **um mundo só** para todos os servidores — o mesmo
  personagem (9 atributos, progressão e builds), mercado, dungeon e ranking
  em qualquer servidor onde a Judy está. Duas moedas: 🪙 Ouro (infinita) e 💎
  Cristal (finita: começa com 5 000 e só os tesouros das dungeons criam mais, devagar). Sistema próprio, separado do XP.
  Níveis 1–100, contratos da guilda, dungeons com chefes, missões especiais,
  companheiros com nome e o evolucionador automático (RPG v4). Detalhes em
  [`docs/rpg/`](docs/rpg/README.md) e [`GUIA-moedas.md`](GUIA-moedas.md).
- **Economia do servidor** (`&economia`): à parte do RPG, **uma** moeda por
  servidor. `minerar` rende de tempos em tempos, `top` mostra quem tem mais e a
  `loja` vende cargos — só cobra se o cargo for entregue.
- **Cargos por reação** (`&reactionrole`), **autorole**, **boas-vindas e
  despedida** (`&boasvindas`/`&adeus`, embeds com marcadores e `testar`),
  **embed customizável** (`&embed`), **cor de cargo com gradiente** (`&cor` —
  o cliente só oferece cor sólida; o bot fala com a API), **fusos horários**
  (`&fuso`), **ativar/desativar comandos** por servidor (`&comando`).

**Robustez**

- **Auto-recuperação**: erros de conexão encerram o processo para o supervisor
  recriá-lo; login com espera crescente; watchdog derruba o container se ele
  ficar 2 minutos de pé sem nunca ter conectado.
- **Anti-SSRF**: URLs de imagem configuradas (boas-vindas etc.) são validadas —
  endereços de rede interna e esquemas `javascript:`/`data:` são recusados, e o
  bot **nunca baixa** a imagem, só repassa o link.
- **Dois idiomas**: comandos, help e tutorial em inglês e pt-BR (`&idioma`). O **idioma oficial é o inglês** (13 out 2026): servidor novo e `&reset` começam nele; servidores que já existiam continuam no idioma que tinham. `IDIOMA_PADRAO=pt` no `.env` volta o padrão ao português. Em inglês, até o que está **fora** das crases sai traduzido (título da ajuda, marcadores `{user}`/`{members}`, moldes `‹question›`, nomes de cor e de preset `purple`/`fire`, áreas do tutorial) — a suíte `traducao-en-13out` confere ~380 telas. Só as ferramentas do dono do bot (`&game admin`, `&servidores`) ficam em português. *The official language is English; existing servers keep theirs. Every screen is checked in English, including titles, markers, placeholders and color/preset names.*

---

## Comandos

Os comandos são uma **árvore**: quem tem família guarda a família dentro de si
(`&automod blocklist`, `&warn lista`), e o `&help` desce por ela camada a
camada — `&help automod`, `&help automod sentinela`, `&help automod sentinela
antiguidade`. Cada camada explica **o que aquilo é**, não só a sintaxe.

O que é opção de uma família **só existe dentro dela**, para não haver dois
caminhos para a mesma coisa. Variações de **digitação** valem
(`&clear`/`&purge`/`&limpar`, `&info`/`&sobre`): são a mesma porta com outro
nome. A voz entra e sai por `&entrar` e `&sair`.

**Em inglês, tudo em inglês** (13 out 2026): com `&idioma en`, a tela mostra os
nomes em inglês também entre crases — grupos, partes, modos e opções — e eles
funcionam ao digitar, em qualquer nível da árvore: `&automod sentinel topics
politics delete` = `&automod sentinela assuntos politica apagar`;
`&automod antinoise caps off`, `&automod antispam speed off`, `&automod
punishment mode stack`, `&automod sentinel avatar action kick`, `&wizard`
(`skip` · `back` · `cancel`), `&embed title: … | description: …`, cores em
inglês (`blue`, `pink`…). Os nomes em português continuam valendo. A tabela
PT ⇄ EN do automod fica em `modulos/core/nomes-automod.js`; a suíte
`traducao-en-13out` lê toda a ajuda e ~150 telas em inglês procurando
português, inclusive dentro do código. *In English servers, every name on
screen is English and works when typed; Portuguese names keep working.*

Prefixo `&`. A lista completa, com **cada parâmetro explicado**, vive no
próprio bot: `&help <comando>`. Um resumo:

### Gerais (qualquer um)

| Comando | Descrição |
|---|---|
| `&help [grupo\|comando]` | índice por intenção, em páginas |
| `&tutorial [área]` | guia de primeiros passos |
| `&ping` · `&sobre` | latência · informações do bot |
| `&servidor [regras\|cargos\|canais\|faq]` · `&staff` | o servidor: dono, membros, regras (canal **regras** lido sozinho ou texto da staff — `&servidor regras definir`), cargos com contagem, canais com descrição, FAQ da staff · a equipe (dono + cargos marcados + quem pode moderar) |
| `&userinfo [@user]` | informações + histórico de moderação |
| `&warn lista [@user]` · `&warn limpar @user` | ver e zerar avisos |
| `&xp` · `&xp top` | seu nível · ranking |

### Moderação (exige a permissão correspondente)

| Comando | Permissão | Descrição |
|---|---|---|
| `&kick @user [motivo]` | KickMembers | expulsa (menção **ou** ID) |
| `&ban @user [motivo]` | BanMembers | bane e registra na lista global |
| `&silenciar @user <tempo> [motivo]` | TimeoutMembers | timeout nativo (`10m`, `2h`, `1d`…, até 28 dias); `&silenciar tirar @user` devolve a voz |
| `&limpar <n> [@user]` | ManageMessages | apaga as últimas `n` mensagens |
| `&limpar tudo` | só o dono | esvazia o canal, com código de confirmação |
| `&warn <@user\|id\|nome> [motivo]` | ManageMessages | aviso manual (mesma escada do automod) |
| `&warn limpar @user` | ManagePermissions | zera os avisos |

### Configuração (ManagePermissions, salvo indicação)

| Comando | Descrição |
|---|---|
| `&assistente [rapido\|completo]` | configuração guiada |
| `&config` | **todas** as configurações de uma vez |
| `&automod` | **raiz da moderação automática** — módulos, e dentro dela `blocklist`, `whitelist`, `sentinela` e `punicao` |
| `&log` · `&acesso` · `&staff` | chat de logs, quem usa comandos, equipe |
| `&banglobal` | lista global *(BanMembers)* |
| `&automod blocklist` · `&automod whitelist` · `&automod sentinela` · `&automod punicao` | listas anti-link, convites permitidos, o filtro que julga, e o que acontece com quem infringe |
| `&ticket` | suporte por **reação**: `painel #canal` posta uma mensagem com um emoji por assunto; reagir abre um canal privado (quem pediu + staff). Lá, 🔒 (só staff) **trava** a conversa e manda o registro inteiro ao log como **arquivo .txt**; depois 🗑️ apaga o canal. A staff entra pelos cargos do `&acesso` e por quem tem Gerenciar canais; o Stoat não deixa a Judy pôr no ticket cargo **acima** do dela — **arraste o cargo da Judy para cima dos cargos da staff** (ou dê a eles *Ver canal + Ler histórico + Enviar* no servidor; ou `&ticket equipe`, o cargo **Equipe de tickets**, que um admin dá à mão a quem está acima dela). O `painel` já confere; o log de cargos mostra o **nome** do cargo e ignora os `ticket-NNNN` |
| `&rolar` (`&r`) · `&iniciativa` | dados de RPG de mesa: `2d20kh1+5`, vantagem/desvantagem, `4d6kh3`, explosão `3d6!`, sucessos `8d10>=7`, `d%`, Fate, moeda, repetição `6x(4d6kh3)`, rótulos e rolagem secreta via DM — mais rastreador de iniciativa por canal (`add`/`next`/`lista`) |
| `&webhook` (`&wh`) | receptor universal de webhooks: GitHub (push, issues, PR, releases, Actions), Crafty/Minecraft e qualquer serviço que fale o formato Discord (Uptime Kuma, Grafana…) — cada gancho tem canal próprio e filtro de eventos, então dá para separar issues num chat e o CI noutro; URL secreta por gancho, teto anti-flood. **Endereços:** serviço da internet (GitHub) exige base pública — `sudo tailscale funnel --bg 8095` + `WEBHOOK_URL_BASE=https://…` no `.env`; container da mesma máquina (Crafty) usa a ponte `http://172.17.0.1:8095/...` |
| `&musica` (`&m`, `&play`) + `&entrar`/`&sair` | uma call **por servidor**, em vários servidores ao mesmo tempo (chamar num servidor não a tira da call de outro); até `MUSICA_MAX_SIMULTANEAS` músicas tocando ao mesmo tempo (padrão 3) — no limite, o **servidor do dono** toca e a música de menor prioridade para (avisando o motivo no `&musica fila` de lá); música nas calls: YouTube, SoundCloud e Spotify (playlists também), com fila, pausa, skip, volume e loop — e a música **abaixa sozinha quando o `&tts` fala** (ducking); playlists do Spotify pedem `SPOTIFY_ID`/`SPOTIFY_SECRET` no `.env` (app grátis em developer.spotify.com; faixas avulsas funcionam sem chave). Vídeo que o YouTube recusa (restrição de idade, indisponível) vira **outra versão** da mesma música, avisando qual; `MUSICA_COOKIES` faz o original com restrição de idade tocar |
| `&comando` | (des)ativar comandos |
| `&embed` · `&reactionrole` · `&autorole` · `&cor` | utilidades *(permissões próprias)* |
| `&boasvindas` · `&adeus` · `&fuso` · `&rss` | entrada/saída, fusos, notícias |
| `&debug` · `&debug @pessoa` · `&debug #canal` | diagnóstico completo: o que está quebrado e como resolver |
| `&modia` | moderação por IA *(ManageServer)* |
| `&personalidade` | prompt de personalidade da IA *(ManageServer)* |
| `&chat livre` · `&chat comentar` · `&chat cuidado` | iniciativa e tom da IA |
| `&chat perfil` · `&chat esquecer [tudo]` | memória da IA |
| `&entrar` / `&sair` | põe o bot na call (TTS e música dividem a mesma conexão); trocar de call ou sair **encerra a música e a fila da call anterior** — ela nunca volta sozinha para uma call de onde saiu (*leaving or switching calls ends that call's music; she never rejoins a call on her own*) |
| `&tts …` | voz nas calls (`estado`/`filtro`/`diagnostico`…) |
| `&game …` | RPG (personagem, atributos, progressão) |
| `&economia …` | a moeda do servidor: `minerar`, `saldo`, `top`, `loja`/`comprar` cargos, `pagar` — à parte do RPG |
| `&entretenimento …` (`&fun`) | brincadeiras: `ship` (% de combinação, fixo por par, com nome do casal), `briga` (quem ganha, rodada por rodada), `cowsay` (6 bichos em ASCII, fala ou pensamento), `bola8`, `escolher`, `nota` (0–10, fixa), `sorte` (do dia), `zoeira`, `inverter` — *fun & games family: ship, fight, cowsay, 8-ball, choose, rate, fortune, mock, reverse* |

> `help` e `comando` não podem ser desativados — para o admin não se trancar
> para fora.

---

## Permissões necessárias

> ⚠️ **A causa nº 1 de "o comando não funciona" é falta de permissão.**

### 1) Do BOT (no cargo do bot)

| Permissão | Para quê | Sem ela… |
|---|---|---|
| **ViewChannel** + **ReadMessageHistory** | ler os canais | não analisa nem responde nada |
| **SendMessage** + **SendEmbeds** | responder | fica mudo / respostas não aparecem |
| **React** | reaction roles, navegação do help | reações não funcionam |
| **ManageRole** | **criar** cargos (nível, reaction role, tickets) | não cria cargos |
| **AssignRoles** | **aplicar** cargos em membros | cria o cargo mas não dá a ninguém |
| **TimeoutMembers** | silêncio (`&silenciar`, mute da escada, modo `confirmar`) | o silêncio vira quarentena |
| **KickMembers** / **BanMembers** | `&kick`, `&ban`, automod, lista global | punições falham |
| **ManageMessages** | apagar (automod, `&limpar`, `&modia`) | não remove mensagens |
| **BypassSlowmode** (Ignorar modo lento) | responder na hora em canal com modo lento | ela espera o tempo do modo lento entre uma mensagem e outra; acima de `SLOWMODE_ESPERA_MAX_S` (30 s), a resposta não sai |

> ⚠️ **A mais esquecida:** `AssignRoles`. `ManageRole` cria o cargo;
> `AssignRoles` o entrega a alguém — são permissões **diferentes**, e sem a
> segunda o autorole, os cargos por nível e os reaction roles falham na hora
> de aplicar.

> **Hierarquia importa:** o cargo do bot precisa estar **acima** do alvo. O
> bot não pune quem tem cargo igual ou superior ao dele — e só dá cargos (nível,
> autorole) que estão abaixo do dele, a quem também está abaixo. `&xp cargos`
> marca com ⚠️ os cargos de nível que o bot não alcança.
> **Canal novo ou permissão nova:** quando a Judy ganha acesso a um canal, o
> Stoat nem sempre avisa o bot do canal novo — ela o busca sozinha na primeira
> mensagem que chega de lá. `&debug #canal` mostra a conta de permissão dela
> naquele canal e diz se o Stoat não a deixa ver (falta *Ver canal* no canal
> ou na categoria acima). *When Judy gains access to a channel she fetches it on
> the first message; `&debug #channel` explains when she can't see it.*
> **Quem pede também precisa estar acima:** `&kick`, `&ban`, `&silenciar`
> só valem sobre quem tem cargo abaixo do seu, e `&reactionrole add`,
> `&autorole` e `&economia loja add` só aceitam cargos abaixo do seu cargo mais
> alto. O dono do servidor e o dono do bot passam sempre.
> Nos **tickets** é igual: um cargo de staff acima da Judy não entra no canal
> do ticket. Um cargo do bot **lá embaixo** na lista (o caso mais comum: o
> cargo "bots" criado por último) deixa a staff de fora — arraste-o para o
> topo, logo abaixo do cargo do dono.

### 2) De quem USA os comandos

| Permissão exigida | Comandos liberados |
|---|---|
| *(nenhuma)* | `&help`, `&sobre`, `&ping`, `&userinfo`, `&warn lista`, `&xp` |
| **ManageMessages** | `&limpar`, `&embed` |
| **ManageRole** | `&reactionrole`, `&cor` |
| **KickMembers** / **BanMembers** | `&kick` / `&ban`, `&banglobal` |
| **TimeoutMembers** | `&silenciar` |
| **ManagePermissions** | configuração em geral (`&config`, `&automod`, `&log`, `&acesso`…) |
| **ManageServer** | `&modia`, `&personalidade`, `&chat esquecer tudo` |

O **dono do servidor** sempre pode tudo; cargos marcados em `&acesso cargo`
moderam sem permissão nativa. Os comandos administrativos **do bot** (fora de
qualquer servidor) exigem estar em `DONO`/`SUPER_ADMINS`.

---

## A IA por dentro

- **Gating explícito:** a IA de conversa só existe nos servidores de
  `SERVIDOR` (`CHAT_SERVIDORES`). Fora deles, o `&chat` **não aparece** nem no
  `&help` — o bot se apresenta como um bot de moderação comum — e da IA fica
  só a moderação: temas proibidos, visão de imagens e fotos de perfil, e o
  `&modia`. O RSS sai como lista, sem o resumo da Judy. `IA=0` desliga tudo
  globalmente. *Outside `SERVIDOR`, only AI moderation runs.*
- **Modelo de moderação:** `MODELO_MODERACAO` põe um modelo pequeno só para o
  juiz (temas proibidos, `&modia`) dos outros servidores; o servidor de
  `SERVIDOR` continua julgado pelo modelo da conversa. No modo local ele entra no llama-swap como
  `moderacao`, num grupo `swap: false · exclusive: false · persistent: true` —
  fica na memória ao lado da conversa, sem uma derrubar a outra.
- **Arquitetura:** o bot conversa com um serviço de ferramentas embutido
  (`ia-servico/`, tool-calling: calcular, ler código do GitHub, buscar na web
  pelo SearXNG que sobe junto, RSS), e esse serviço fala com **qualquer LLM de
  API OpenAI** — o llama.cpp embutido do modo `local`, uma plataforma no modo
  `online`, ou o seu próprio servidor via `LLM_URL`.
- **Memória com fronteiras:** memória curta por canal (~20 mensagens),
  perfis de longo prazo por pessoa com data em cada fato, e `&chat esquecer`
  que apaga **tudo** — o banco e o que está carregado no processo.
- **Segurança de identidade:** o prompt separa em blocos o que é da IA, do
  lugar, da pessoa e do fio da conversa — ela não confunde a bio de alguém com
  os próprios dados, não obedece "ignore suas instruções" e resiste a
  investidas românticas com educação e firmeza.

---

## Exposição da máquina (bot em muitos servidores)

O que um estranho, de qualquer servidor onde o bot está, consegue fazer a
máquina onde ele roda **buscar** — e a trava de cada caminho.
*What a stranger in any server can make the host machine fetch, and how each path is locked.*

- **Imagens**: só do CDN do Stoat (lista fechada, https, redirect conferido),
  teto de 8 MB e 32 MP, e só formato de foto (JPEG, PNG, WebP, GIF, AVIF, HEIF).
- **Páginas da busca, RSS e listas de bloqueio**: só internet pública. O IP é
  conferido **na conexão** (sem DNS rebinding), cada redirect é conferido de
  novo, e há teto de tamanho. O RSS tem até 25 feeds por servidor
  (`RSS_MAX_FEEDS`) e pode ser restrito a alguns servidores (`RSS_SERVIDORES`).
- **Música**: links só do YouTube, SoundCloud e Spotify (`MUSICA_HOSTS`
  acrescenta), e o yt-dlp roda sem o extrator genérico.
- **Webhooks**: o receptor é a única porta aberta. Token de 128 bits por
  gancho, tetos por gancho, total e de tentativas erradas, tempo curto para
  mandar o pedido, até 10 ganchos por servidor, canal sempre do servidor do
  gancho. `WEBHOOK_BIND=127.0.0.1` tira a porta da rede de casa (o Tailscale
  Funnel continua funcionando); `WEBHOOK_SERVIDORES` limita quem cria ganchos.
- **Um servidor não mexe no outro**: nada publica em canal de outro servidor,
  e o que é de todos (a lista de bloqueio, o debug, a lista global de bans)
  só o dono do bot muda.
- **Serviços internos** (IA, voz, modelo) ouvem só em `127.0.0.1`.
- **O que não dá para esconder sem VPN**: toda busca que o bot faz (feed,
  página, vídeo) sai pela conexão da máquina — o dono do site vê esse IP.
  Para escondê-lo, rode o container atrás de uma VPN.

## Persistência e compatibilidade

Tudo vive num **SQLite** embutido (`node:sqlite`, sem serviço externo) mais um
JSON de configuração — no container, ambos em `/data` (volume). As migrações
são **aditivas**: atualizar o bot nunca exige recriar o banco, e bancos de
versões antigas continuam funcionando.

---

## Estrutura do projeto

```
.
├── iniciar.js                  # sobe tudo num container: bot + IA (+ voz opcional)
├── main.js                     # bootstrap: cliente, rotas, eventos, auto-recuperação
├── modulos/
│   ├── core/                   # base: db (SQLite), config, i18n, ids, log, páginas…
│   ├── moderacao/              # automod, punições, ban global, help, tutorial, assistente…
│   ├── ai/                     # chat, persona, memória, comentário espontâneo, verificador
│   ├── ferramentas/            # xp, reaction roles, autorole, boas-vindas, tts, rss, fuso
│   └── game/                   # RPG
├── ia-servico/                 # serviço de IA (tool-calling: calcular, ler código, web, rss)
├── voz-servico/                # voz nas calls: LiveKit + Piper (opcional, VOZ_ATIVA=1)
├── scripts/verificar-build.js  # sanidade do repositório (roda no CI e no build da imagem)
├── testes.mjs                  # todas as suítes de teste (cada uma roda no seu processo)
├── .env.example                # modelo de configuração comentado
├── Dockerfile · docker-compose.yml   # bot (tudo dentro) + SearXNG para a busca
└── .github/workflows/build.yml # build multi-arch (x86-64 e ARM64)
```

## Desenvolvimento

```bash
npm install
node scripts/verificar-build.js   # imports, rotas e consistência
node testes.mjs                   # todas as suítes · `node testes.mjs ia tickets` roda só essas · `--lista`
```

O `verificar-build.js` roda também **dentro do build da imagem** — um
repositório incompleto derruba o build, não o bot em produção.

## Licença

WTFPL (veja `LICENSE`). Feito com [`stoat.js`](https://github.com/stoatchat/javascript-client-sdk).
