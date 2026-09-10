# Stoat Bot — moderação e IA para Stoat/Revolt

![Licença](https://img.shields.io/badge/licen%C3%A7a-MIT-green) ![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen) ![Docker](https://img.shields.io/badge/docker-multi--arch-blue) ![Idiomas](https://img.shields.io/badge/bot-pt--BR%20%C2%B7%20en-orange)

> 🇬🇧 *The bot itself is fully bilingual (pt-BR/English — `&idioma en`); this documentation is in Portuguese.*

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

As variáveis que importam:

| Variável | O que é |
|---|---|
| `BOT_TOKEN` | token do bot na plataforma |
| `DONO` | ID do **seu perfil** — ganha os comandos administrativos do bot |
| `SERVIDOR` | ID do servidor onde a **IA** funciona (`*` = em todos; vazio = IA em lugar nenhum) |
| `IA` | `0` desliga todos os módulos de IA — o bot de moderação segue completo |
| `IA_MODO` | `local` roda um modelo na sua máquina (o **MODELO** é baixado do Hugging Face no primeiro arranque e guardado no volume); `online` usa uma plataforma via `TOKEN_IA` (padrão: OpenRouter) |
| `MODELO` | local: `repo:quantização` GGUF do HF · online: nome do modelo na plataforma |
| `TOKEN_IA` | token da plataforma, só no modo `online` |
| `PROMPT` | personalidade padrão da IA no seu texto — e `&personalidade` troca por servidor, sem redeploy |

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
| `&tutorial` | guia **em páginas** (reaja ◀ ▶): permissões → canais → proteção → boas-vindas e cargos → XP e RPG → checklist |
| `&help` | índice **por intenção** (começar · proteger · personalizar · diversão · rpg · diagnóstico); `&help <comando>` explica **cada parâmetro** |

### A regra de ouro dos canais

> **A permissão definida no canal vence a definida no cargo.** Se o canal nega,
> nenhum cargo salva — nem o do bot. Deixe as permissões dos cargos no mínimo e
> abra exceções canal por canal.

Separe os canais em três tipos — 🔒 só staff vê (#log, #staff), 📢 só staff
escreve (#regras, #avisos), 💬 geral — e configure as exceções **no canal**.
`&debug canais` confere o que o bot enxerga em cada um; `&assistente canais`
diz exatamente o que clicar.

---

## Recursos

**Moderação**

- **AutoMod**: anti-spam, anti-mass-mention, anti-invite (com whitelist),
  anti-caps, anti-link (listas estilo Pi-hole via `&blocklist`), anti-zalgo/
  caracteres invisíveis, e detecção de conteúdo proibido por pontuação 0–10 (`&scam`).
- **Punições persistentes**: avisos e silêncios ficam no banco por
  `(servidor, usuário)` — quem **sai e volta** recebe o silêncio de novo.
- **Escada de punição**: cada reincidência sobe um degrau (aviso → 5 min →
  1 h → ban, tempos configuráveis com `&punicao escada`). Quem escorregou uma
  vez nunca chega ao ban; quem insiste sobe sozinho.
- **Moderação por IA** (`&modia`): você escreve os critérios em texto livre e
  a IA apaga o que violar, marcando o responsável no log — ela **nunca bane sozinha**.
- **Lista global de banimentos** (`&banglobal`): compartilhada entre os
  servidores da mesma instância, com modos `off`/`avisar`/`banir`, isenção por
  pessoa e `desfazer`.
- **Manual**: `&kick`, `&ban` (menção **ou** ID), `&limpar`, `&warn`,
  `&cargomudo` (cria o cargo de silêncio com tudo negado, servidor e canais).
- **Logs** (`&log`): punições, entradas/saídas, mensagens apagadas/editadas,
  cargos e comandos — cada categoria liga/desliga.
- **Acesso** (`&acesso` + `&staff`): cargos de staff moderam sem permissão
  nativa; comandos restritos a canais escolhidos.

**IA** (nos servidores de `SERVIDOR`; tudo desligável com `IA=0`)

- **Chat** (`&chat` ou menção): conversa com memória curta do canal, contas
  exatas, leitura de código e **busca na web** (via SearXNG) através do serviço
  de ferramentas embutido.
- **Personalidade sua** (`&personalidade`): o prompt de personalidade é
  configurável **por servidor**, por comando — e `PROMPT` no `.env` define o
  padrão global. Regras de segurança e formato continuam fixas.
- **Perfil e memória de longo prazo**: um agente aprende fatos sobre cada
  pessoa (com data) e adapta o tom. `&chat perfil` mostra; `&chat esquecer
  [tudo]` apaga de verdade — banco **e** processo.
- **Iniciativa com freios**: `&chat livre` deixa a IA participar quando o
  assunto vale; `&chat comentar` permite comentários espontâneos com limite
  por dia. `&chat cuidado @user on` marca alguém (opt-in) para tratamento
  gentil e paciente.
- **RSS com resumo** (`&rss`): o bot posta os itens novos dos feeds a cada
  hora; onde a IA está ativa, ela escreve um resumo geral no tom dela.

**Voz nas calls** (`&tts`, opcional)

- A IA entra na call e **fala o que for escrito**: `&tts entrar` dentro da
  call liga tudo de uma vez, `&tts sair` desfaz. Síntese **offline** (Piper)
  com efeitos de timbre por ffmpeg, dicionário de abreviações (`vc` → `você`)
  e uma **peneira anti-barulho** que filtra spam pela forma e limita falas por
  minuto no canal — risada passa de propósito, e `&tts <texto>` nunca é filtrado.
- Diagnóstico da cadeia inteira com `&tts estado` e `&tts diagnostico` (diz
  **em qual etapa** a entrada travou). Ligue com `VOZ_ATIVA=1` (sobe dentro do
  container) ou aponte `VOZ_SERVICO_URL` para um serviço de voz externo;
  restrinja com `TTS_SERVIDORES`.

**Engajamento**

- **Níveis** (`&xp`): XP por mensagem, cargos por nível (posicionados abaixo
  do mute), leaderboard e parâmetros configuráveis.
- **RPG** (`&game`): personagem com 9 atributos, progressão e builds — sistema
  próprio, separado do XP. Detalhes em [`GUIA-moedas.md`](GUIA-moedas.md) e
  [`DESIGN-rpg-economia.md`](DESIGN-rpg-economia.md).
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
- **Dois idiomas**: comandos, help e tutorial em pt-BR e inglês (`&idioma`).

---

## Comandos

Prefixo `&`. A lista completa, com **cada parâmetro explicado**, vive no
próprio bot: `&help <comando>`. Um resumo:

### Gerais (qualquer um)

| Comando | Descrição |
|---|---|
| `&help [grupo\|comando]` | índice por intenção, em páginas |
| `&tutorial [área]` | guia de primeiros passos |
| `&ping` · `&sobre` | latência · informações do bot |
| `&userinfo [@user]` | informações + histórico de moderação |
| `&warnings [@user]` | avisos acumulados neste servidor |
| `&xp` · `&xp top` | seu nível · ranking |

### Moderação (exige a permissão correspondente)

| Comando | Permissão | Descrição |
|---|---|---|
| `&kick @user [motivo]` | KickMembers | expulsa (menção **ou** ID) |
| `&ban @user [motivo]` | BanMembers | bane e registra na lista global |
| `&limpar <n> [@user]` | ManageMessages | apaga as últimas `n` mensagens |
| `&limpar tudo` | só o dono | esvazia o canal, com código de confirmação |
| `&warn @user [motivo]` | staff | aviso manual (soma com os do automod) |
| `&clearwarnings @user` | ManagePermissions | zera os avisos |

### Configuração (ManagePermissions, salvo indicação)

| Comando | Descrição |
|---|---|
| `&assistente [rapido\|completo]` | configuração guiada |
| `&config` | **todas** as configurações de uma vez |
| `&automod` · `&punicao` · `&scam` | módulos, escada de punição, detecção 0–10 |
| `&log` · `&acesso` · `&staff` | chat de logs, quem usa comandos, equipe |
| `&banglobal` | lista global *(BanMembers)* |
| `&whitelist` · `&blocklist` | convites permitidos, listas anti-link |
| `&comando` · `&cargomudo` | (des)ativar comandos, cargo de silêncio |
| `&embed` · `&reactionrole` · `&autorole` · `&cor` | utilidades *(permissões próprias)* |
| `&boasvindas` · `&adeus` · `&fuso` · `&rss` | entrada/saída, fusos, notícias |
| `&debug canais` · `&debug silence` | diagnóstico do que o bot enxerga |
| `&modia` | moderação por IA *(ManageServer)* |
| `&personalidade` | prompt de personalidade da IA *(ManageServer)* |
| `&chat livre` · `&chat comentar` · `&chat cuidado` | iniciativa e tom da IA |
| `&chat perfil` · `&chat esquecer [tudo]` | memória da IA |
| `&tts …` | voz nas calls (`entrar`/`sair`/`estado`/`filtro`/`diagnostico`…) |
| `&game …` | RPG (personagem, atributos, progressão) |

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
| **ManageRole** | **criar** cargos (`&cargomudo`, nível, reaction role) | não cria cargos |
| **AssignRoles** | **aplicar** cargos em membros | cria o cargo mas não dá a ninguém |
| **ManageChannel** | reforçar o silêncio em cada canal | o silêncio pode vazar |
| **KickMembers** / **BanMembers** | `&kick`, `&ban`, automod, lista global | punições falham |
| **ManageMessages** | apagar (automod, `&limpar`, `&modia`) | não remove mensagens |

> ⚠️ **A mais esquecida:** `AssignRoles`. `ManageRole` cria o cargo;
> `AssignRoles` o entrega a alguém — são permissões **diferentes**, e sem a
> segunda o autorole, os cargos por nível e os reaction roles falham na hora
> de aplicar.

> **Hierarquia importa:** o cargo do bot precisa estar **acima** do alvo. O
> bot não pune quem tem cargo igual ou superior ao dele.

**Cargo de silêncio:** o silêncio (e a reaplicação ao reentrar) depende de um
cargo com permissões negadas. `&cargomudo` cria um pronto — tudo negado, no
servidor e em cada canal — e já o configura.

### 2) De quem USA os comandos

| Permissão exigida | Comandos liberados |
|---|---|
| *(nenhuma)* | `&help`, `&sobre`, `&ping`, `&userinfo`, `&warnings`, `&xp` |
| **ManageMessages** | `&limpar`, `&embed` |
| **ManageRole** | `&reactionrole`, `&cor` |
| **KickMembers** / **BanMembers** | `&kick` / `&ban`, `&banglobal` |
| **ManagePermissions** | configuração em geral (`&config`, `&automod`, `&punicao`, `&log`, `&acesso`…) |
| **ManageServer** | `&modia`, `&personalidade`, `&chat esquecer tudo` |

O **dono do servidor** sempre pode tudo; cargos marcados em `&acesso cargo`
moderam sem permissão nativa. Os comandos administrativos **do bot** (fora de
qualquer servidor) exigem estar em `DONO`/`SUPER_ADMINS`.

---

## A IA por dentro

- **Gating explícito:** a IA só existe nos servidores de `SERVIDOR`
  (`CHAT_SERVIDORES`). Fora deles, os comandos de IA **não aparecem** nem no
  `&help` — o bot se apresenta como um bot de moderação comum. `IA=0` desliga
  tudo globalmente.
- **Arquitetura:** o bot conversa com um serviço de ferramentas embutido
  (`ia-servico/`, tool-calling: calcular, ler código, buscar na web, RSS), que
  fala com **qualquer LLM de API OpenAI** — o llama.cpp embutido do modo
  `local`, uma plataforma no modo `online`, ou o seu próprio servidor via
  `LLM_URL`.
- **Memória com fronteiras:** memória curta por canal (~20 mensagens),
  perfis de longo prazo por pessoa com data em cada fato, e `&chat esquecer`
  que apaga **tudo** — o banco e o que está carregado no processo.
- **Segurança de identidade:** o prompt separa em blocos o que é da IA, do
  lugar, da pessoa e do fio da conversa — ela não confunde a bio de alguém com
  os próprios dados, não obedece "ignore suas instruções" e resiste a
  investidas românticas com educação e firmeza.

---

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
├── teste-*.mjs                 # suítes de teste por área
├── .env.example                # modelo de configuração comentado
├── Dockerfile · docker-compose.yml
└── .github/workflows/build.yml # build multi-arch (x86-64 e ARM64)
```

## Desenvolvimento

```bash
npm install
node scripts/verificar-build.js   # imports, rotas e consistência
node teste-ia.mjs                 # (e as demais suítes teste-*.mjs)
```

O `verificar-build.js` roda também **dentro do build da imagem** — um
repositório incompleto derruba o build, não o bot em produção.

## Licença

MIT (veja `LICENSE`). Feito com [`stoat.js`](https://github.com/stoatchat/javascript-client-sdk).
