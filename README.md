# Stoat Bot — moderação para Stoat/Revolt

Bot de moderação para a plataforma **Stoat** (fork/rebrand do Revolt), escrito em
Node.js (ESM) com a biblioteca [`stoat.js`](https://www.npmjs.com/package/stoat.js).
Prefixo padrão: **`&`**.

Funciona em **vários servidores ao mesmo tempo**, cada um com sua própria
configuração, punições e chat de logs. Tudo é persistido num banco **SQLite**
embutido (nada de serviço externo), então as configurações e punições
**sobrevivem a reinícios e atualizações**.

---

## Sumário

- [Recursos](#recursos)
- [Requisitos](#requisitos)
- [Permissões necessárias](#permissões-necessárias) ⭐
- [Instalação rápida (local)](#instalação-rápida-local)
- [Comandos](#comandos)
- [AutoMod](#automod)
- [Política de punição](#política-de-punição)
- [Chat de logs (`&log`)](#chat-de-logs-log)
- [Lista global de banimentos (`&banglobal`)](#lista-global-de-banimentos-banglobal)
- [RPG (`&game`)](#rpg-game)
- [Cor dos cargos (`&cor`)](#cor-dos-cargos-cor)
- [Guia `&tutorial`](#guia-tutorial)
- [Persistência (SQLite)](#persistência-sqlite)
- [Deploy com Docker / umbrelOS](#deploy-com-docker--umbrelos)
- [Estrutura do projeto](#estrutura-do-projeto)

---

## Recursos

- **Multi-servidor**: cada servidor tem config, punições e logs independentes.
- **AutoMod**: anti-spam, anti-mass-spam, anti-invite, anti-mass-mention,
  anti-caps, anti-link (listas estilo Pi-hole) e detecção de conteúdo proibido
  por pontuação (0–10).
- **Punições persistentes**: avisos e silêncios ficam no banco, por
  `(servidor, usuário)`. Se o usuário **sai e volta**, o silêncio é
  **reaplicado** automaticamente (não dá mais para escapar saindo e entrando).
- **Chat de logs configurável** (`&log`): punições, entradas/saídas, mensagens
  apagadas/editadas, cargos e uso de comandos — cada categoria liga/desliga.
- **Lista global de banimentos** (`&banglobal`): compartilhada entre servidores,
  com modos `off` / `avisar` / `banir`.
- **Moderação manual**: `&kick`, `&ban` (por menção **ou** ID), `&limpar`.
- **Panorama**: `&config` mostra todas as configurações de uma vez.
- **Cor dos cargos com gradiente** (`&cor`): o cliente do Stoat só deixa escolher cor sólida; o bot fala direto com a API e aplica **gradientes** (montados por você ou de uma lista de prontos).
- **RPG** (`&game`): cada pessoa cria um personagem com 9 atributos, sobe de nível e monta sua build. Sistema próprio, separado do XP por mensagem.
- **Controle de acesso** (`&acesso`): marque **cargos como staff** (moderam sem precisar de permissão nativa do Stoat) e limite **em quais canais** os comandos funcionam.
- **Aviso manual** (`&warn`): staff dá avisos à mão; eles somam com os do automod, então o modo `acumular` bane no limite.
- **Guia `&tutorial`**: mostra **por onde começar** — o roteiro de áreas na ordem recomendada, com os comandos exatos de cada uma. Não altera nada sozinho; só te diz o caminho.
- **Embed customizável** (`&embed`): o bot publica uma mensagem embed com título, descrição, cor, rodapé e imagem.
- **Cargos por reação** (`&reactionrole`): reagir num emoji dá um cargo configurado.
- **Anti-caracteres**: bloqueia zalgo e caracteres invisíveis. **Anti-repetição** (separado, off por padrão) bloqueia letras repetidas ignorando o `kkkk` brasileiro.
- **Chat com IA local** (`&chat` ou menção): conversa com a **Judy**, um LLM rodando na sua máquina, sem chaves externas. Ela escolhe o modelo conforme o tipo de mensagem (conversa, código, lógica), faz **contas exatas** e **lê o próprio código** através de um serviço de ferramentas (`ia-servico/`). Busca na internet via SearXNG quando precisa.
- **Notícias por RSS** (`&rss`): a cada hora o bot posta os itens novos dos feeds no canal configurado. Onde a IA está ativa, a Judy escreve também um **resumo geral no tom dela**.
- **Sistema de níveis** (`&xp`): XP por mensagem, cargos por nível (posicionados abaixo do mute), leaderboard e parâmetros configuráveis.
- **Autorole** (`&autorole`): dá um cargo automaticamente a quem entra no servidor.
- **IA com perfil e memória de longo prazo**: um agente observa o chat e monta um **perfil** de cada pessoa — personalidade, gostos e informações, cada fato com a **data** em que foi aprendido. A Judy usa isso para **adaptar o tom** a cada um (mais leve com quem é sério, mais afiada com quem curte). `&chat perfil` mostra o que ela sabe; `&chat esquecer` apaga o seu, `&chat esquecer tudo` zera o servidor.
- **Tom modular e acessibilidade**: o tom base é caloroso; a acidez fica para quem já é próximo. `&chat cuidado @user on` marca alguém (opt-in) para tratamento gentil e paciente — sem a Judy inferir nada sozinha.
- **Cache de conversa do canal**: ela acompanha as últimas mensagens do canal (quem falou, a quem respondeu) e percebe quando o assunto mudou, evitando responder fora de contexto.
- **Conversa livre e iniciativa**: `&chat livre` deixa a Judy participar das conversas por conta própria (quando o assunto vale); `&chat comentar` deixa ela soltar comentários espontâneos num canal, com freios. Quando conversa com alguém, mantém o papo fluido sem exigir menção a cada mensagem.
- **Moderação por IA** (`&modia`): você escreve os critérios em texto livre e a Judy apaga o que violar, marcando o dono no log com as opções — ela nunca bane sozinha.
- **Comando `&sobre`**: informações resumidas do bot.
- **Ativar/desativar comandos** por servidor (`&comando`).
- **Criar cargo de silêncio** com um comando (`&cargomudo`) — todas as permissões negadas.

---

## Requisitos

- **Node.js 22+** (o banco usa o módulo embutido `node:sqlite`, disponível no
  Node 22+). Testado em 22 e 24.
- Um **token de bot** do seu Stoat/Revolt.
- Dependências: `stoat.js` e `dotenv` (via `npm install`). Nenhuma dependência
  nativa — o SQLite já vem dentro do Node.

---

## Permissões necessárias

> ⚠️ **A causa nº 1 de "o comando não funciona" é falta de permissão.** Leia esta seção.

Há **dois** conjuntos de permissões: as que o **bot** precisa ter no servidor
(para conseguir agir) e as que um **moderador/admin** precisa ter para poder
**usar** cada comando.

### 1) Permissões do BOT (no cargo do bot)

Dê estas permissões ao **cargo do bot** no seu servidor. Sem elas, o bot até
recebe o comando, mas falha ao executar a ação.

| Permissão | Para quê | Sem ela… |
|---|---|---|
| **ViewChannel** | ver os canais onde atua | não lê nem responde nada |
| **ReadMessageHistory** | ler mensagens (automod, `&limpar`) | não analisa nem apaga mensagens |
| **SendMessage** | enviar respostas e avisos | fica mudo |
| **SendEmbeds** | enviar os cartões de resposta | respostas não aparecem |
| **React** | cargos por reação e o 👀 da conversa livre | reaction roles não funcionam |
| **ManageChannel** | editar canais (permissões do cargo de silêncio) | o silêncio pode vazar em canais próprios |
| **ManageRole** | criar cargos (`&cargomudo`, cargos por nível, reaction role) | não consegue criar os cargos |
| **AssignRoles** | **aplicar/remover** cargos em membros (autorole, nível, silêncio, reaction role) | cria o cargo mas não consegue dar a ninguém |
| **KickMembers** | executar `&kick` | kick falha |
| **BanMembers** | banir (automod, `&ban`, ban global) | bans falham |
| **ManageMessages** | apagar mensagens (automod, `&limpar`, `&modia`) | não remove mensagens |
| **TimeoutMembers** | silenciar via timeout nativo (se usar esse modo) | só o silêncio por cargo funciona |

> ⚠️ **A mais esquecida:** `AssignRoles`. Sem ela o bot **cria** os cargos mas
> não consegue **atribuí-los** — autorole, cargos por nível e reaction roles
> falham na hora de aplicar. `ManageRole` e `AssignRoles` são coisas diferentes:
> uma cria o cargo, a outra o entrega a alguém.

> **Hierarquia de cargos importa:** o cargo do bot precisa estar **acima** do
> cargo do usuário-alvo. O bot não consegue kickar/banir/silenciar quem tem um
> cargo igual ou superior ao dele — nem o dono do servidor.

**Cargo de silêncio:** o modo `confirmar`, a reaplicação de silêncio no rejoin e a
funcionalidade de **revogar permissões** de um usuário dependem de um **cargo de
silêncio**. Você pode:

- **Criar automaticamente** com `&cargomudo [nome]` — o bot cria um cargo com
  **todas as permissões negadas** e já o define como cargo de silêncio; ou
- criar manualmente um cargo que remova `SendMessage` e informar o ID com
  `&punicao silencerole <idDoCargo>`; ou
- deixar o `&cargomudo` criar um pronto para você (com tudo negado).

> ⚠️ **Sem um cargo de silêncio configurado, não há como "revogar as permissões"
> de um usuário** — o silêncio (e a reaplicação ao reentrar) simplesmente não
> acontece. O bot precisa de **AssignRoles**/**ManageRole** para aplicar e
> remover esse cargo, e o cargo do bot deve estar **acima** do alvo.

### 2) Permissões do MODERADOR/ADMIN (para usar os comandos)

Cada comando exige uma permissão de quem o **executa**. O **dono do servidor**
sempre pode usar tudo.

| Permissão exigida | Comandos liberados |
|---|---|
| *(nenhuma)* | `&help`, `&sobre` — informações resumidas do bot
- `&ping`, `&repete`, `&userinfo`, `&warnings` |
| **ManageMessages** | `&limpar` (`&clear`, `&purge`), `&embed` |
| **ManageRole** | `&reactionrole` (`&rr`) |
| **KickMembers** | `&kick` |
| **BanMembers** | `&ban`, `&banglobal` |
| **ManagePermissions** | `&config`, `&automod`, `&punicao`, `&log`, `&scam`, `&whitelist`, `&blocklist`, `&clearwarnings`, `&comando`, `&cargomudo`, `&chat livre`, `&chat comentar` |
| **ManageServer** | `&modia` (moderação por IA) |

> Resumo prático: para **configurar** o bot, um admin precisa de
> **ManagePermissions**. Para **moderar** (kick/ban/limpar), precisa das
> permissões de moderação correspondentes. Um "moderador completo" costuma ter
> `KickMembers` + `BanMembers` + `ManageMessages` + `ManagePermissions`.

---

## Instalação rápida (local)

```bash
# 1. Instale as dependências
npm install

# 2. Crie o arquivo .env com o token
cp .env.example .env
#   edite .env e cole seu token em BOT_TOKEN=

# 3. Rode (a flag silencia o aviso "experimental" do node:sqlite)
node --disable-warning=ExperimentalWarning main.js
```

Na primeira execução o bot cria o banco (`stoat.db`) com os padrões (nada
punitivo ligado). Se existir um `automod-config.json` antigo, ele é **migrado
automaticamente** para o banco na primeira subida. Configure pelo chat com
`&tutorial` mostra o caminho; os comandos abaixo fazem o trabalho.

---

## Comandos

Prefixo: `&`. Aliases entre parênteses.

### Gerais (qualquer um)

| Comando | Descrição |
|---|---|
| `&help [comando]` | lista os comandos, ou detalha um específico |
| `&ping` | latência do bot |
| `&userinfo [@usuário]` | informações + **histórico de moderação** (avisos e lista global) |
| `&warnings [@usuário]` | avisos acumulados neste servidor |
| `&repete <texto>` | repete o texto |
| `&sobre` | informações resumidas do bot (recursos, comandos, linhas de código) |
| `&xp` | seu nível e XP · `&xp top` para o ranking |

### Moderação (exige permissão)

| Comando | Permissão | Descrição |
|---|---|---|
| `&kick @usuário [motivo]` | KickMembers | expulsa (aceita menção **ou** ID) |
| `&ban @usuário [motivo]` | BanMembers | bane e registra na lista global |
| `&limpar <n> [@usuário]` | ManageMessages | apaga as últimas `n` mensagens (1–100) |
| `&clearwarnings @usuário` | ManagePermissions | zera os avisos do usuário |

### Administração (ManagePermissions)

| Comando | Descrição |
|---|---|
| `&comando` | lista os comandos e seu estado (ativo/desativado) |
| `&comando disable <nome>` | desativa um comando neste servidor |
| `&comando enable <nome>` | reativa um comando |
| `&cargomudo [nome]` | cria um cargo com **todas as permissões negadas** (no servidor **e em cada canal**) e o define como cargo de silêncio |
| `&cargomudo canais` | reaplica a negação do cargo de silêncio em todos os canais |
| `&embed` | publica uma mensagem embed customizável *(ManageMessages)* |
| `&reactionrole add\|remove\|list` | cargos por reação *(ManageRole)* |

> `help` e `comando` não podem ser desativados (para o admin não se trancar para fora).

### Configuração (ManagePermissions)

| Comando | Descrição |
|---|---|
| `&tutorial [área]` | guia de primeiros passos (por onde começar) |
| `&debug canais` | o que o bot enxerga e pode fazer em cada canal |
| `&debug silence [@pessoa]` | checa se o cargo de silêncio realmente cala |
| `&cor <cargo> <cor\|gradiente>` | cor dos cargos, com gradiente (exige **ManageRole**) |
| `&config` | mostra **todas** as configurações atuais |
| `&automod <status\|módulo on/off\|debug on/off>` | liga/desliga módulos |
| `&punicao <modo\|warns\|silencerole>` | política de punição |
| `&log <here\|id\|off\|evento on/off>` | chat de logs |
| `&game [criar\|ficha\|pontos\|top]` | RPG: personagem, atributos e progressão |
| `&warn <@pessoa> [motivo]` | aviso manual (conta para o ban no modo acumular) |
| `&acesso <cargo\|canal>` | quem pode usar comandos e em quais canais |
| `&banglobal <off\|avisar\|banir\|...>` | lista global (exige **BanMembers**) |
| `&modia <on\|off\|criterios\|canal\|limpar>` | moderação por IA na conversa (exige **ManageServer**) |
| `&chat perfil [@user]` | o que a Judy sabe sobre alguém |
| `&chat mapear [@user]` | captura bio/status do cartão do Stoat |
| `&chat cuidado [@user] on\|off` | tratamento gentil opt-in (acessibilidade) |
| `&chat esquecer [tudo]` | apaga sua memória (ou a do servidor, com ManageServer) |
| `&chat livre <on\|off\|modo>` | conversa livre da Judy no canal |
| `&chat comentar <aqui\|off\|pordia>` | comentários espontâneos da Judy |
| `&scam <config\|sensitivity\|channel\|test\|...>` | detecção de conteúdo (0–10) |
| `&whitelist <add\|remove\|list> [convite]` | convites permitidos |
| `&blocklist <add\|remove\|list\|clear\|reload> [url]` | listas anti-link |

---

## AutoMod

Cada módulo é ligado/desligado **por servidor** com `&automod <módulo> <on|off>`:

- **antispam** — muitas mensagens em pouco tempo
- **antimassspam** — flood (limite maior, janela maior)
- **antiinvite** — convites `stt.gg` de outros servidores
- **antimassmention** — menções em excesso numa mensagem
- **anticaps** — CAIXA ALTA em excesso
- **antilink** — domínios de listas estilo Pi-hole (baixadas ao iniciar)
- **anticaracteres** — bloqueia zalgo (acentos empilhados) e caracteres invisíveis/de controle de direção (coisas que travam front-ends)
- **antirepeticao** — bloqueia a mesma letra repetida muitas vezes (ex.: `aaaaaaaaaa`). **Desligado por padrão** e, quando ligado, ignora o `k` (a risada BR `kkkkk` não é punida). Configure com `&automod antirepeticao set ignorar <letras>`
- **antiscam** — detecção de conteúdo proibido por pontuação (ver abaixo)

A detecção de conteúdo dá uma **nota de 0 a 10** (golpe, +18, gore, apologia a
ilícito e abuso, tudo numa categoria) e age conforme a sensibilidade
(`baixa`/`media`/`alta`). Configure com `&scam`.

---

## Configuração individual por módulo

Cada módulo do AutoMod pode ser ajustado separadamente:

```
&automod antispam set mensagens 3      # limite de mensagens
&automod antispam set tempo 10000      # janela em milissegundos
&automod anticaps set limiar 80        # % de maiúsculas (aceita 0–1 ou 0–100)
&automod antimassmention set mencoes 4 # máximo de menções
&automod anticaracteres set zalgo 0.6   # sensibilidade a zalgo
&automod antirepeticao on               # bloqueia letra repetida (ex.: aaaa)
&automod antirepeticao set ignorar k    # mas ignora o kkkk (risada BR)
```

E cada módulo pode ter uma **punição própria**, independente da global:

```
&automod antilink punicao apagar       # anti-link só apaga a mensagem
&automod antiscam punicao banir        # scam bane direto
&automod antispam punicao herdar       # volta a usar a punição global
```

Veja os parâmetros e a punição atual de um módulo com `&automod <módulo>` (sem argumentos).

## Política de punição

Definida por servidor com `&punicao`. Vale para **todos** os módulos do automod:

| Modo | O que faz |
|---|---|
| `avisar` | só avisa (não remove nem pune) |
| `apagar` | só remove a mensagem, sem punir o usuário |
| `confirmar` | remove a mensagem, **silencia** (se houver cargo) e espera um moderador aprovar/liberar |
| `acumular` | soma avisos; ao atingir o limite, bane |
| `banir` | ban imediato |

- `&punicao modo <avisar\|confirmar\|acumular\|banir>`
- `&punicao warns <n>` — quantos avisos até o ban (modo `acumular`)
- `&punicao silencerole <idDoCargo>` — cargo usado para silenciar

**Avisos e silêncios são persistentes** (banco, por `(servidor, usuário)`).
Se o usuário sai e volta, o silêncio é reaplicado no evento de entrada.

---

## Embed customizável (`&embed`)

O bot publica uma mensagem embed a partir de campos `campo: valor`, **um por
linha** — sem parênteses e sem vírgula no fim:

```
&embed
titulo: Regras do servidor
descricao: Seja legal com todos.
Pode usar várias linhas.
cor: #5865F2
rodape: Equipe de moderação
canal: 01ABC...        (opcional; padrão = canal atual)
imagem: https://...    (opcional)
```

Também funciona **tudo numa linha**, separando com `|`:

```
&embed titulo: Idade | descricao: +18 ou -18? | cor: rosa
```

Detalhes úteis:

- Só `titulo` **ou** `descricao` é obrigatório; o resto é opcional.
- Cores por hex (`#5865F2`, `#f0f`) ou nome (`azul`, `verde`, `rosa`, …).
- As chaves também funcionam em inglês (`title`, `description`, `color`).
- O parser é tolerante: ignora parênteses em volta do bloco e vírgulas no fim
  das linhas. Se algo for ignorado (cor inválida, campo inexistente), o bot
  **avisa** em vez de falhar em silêncio.
- `&embed` sem argumentos mostra a ajuda com um exemplo copiável.

Exige **ManageMessages**.

---

## Cargos por reação (`&reactionrole`)

Reagir num emoji de uma mensagem concede um cargo. Alias: `&rr`. Exige **ManageRole**.

```
&reactionrole add <mensagem> <emoji> <idCargo>   # o bot reage; quem clicar ganha o cargo
&reactionrole remove <mensagem>                  # remove os vínculos da mensagem
&reactionrole list        # a <mensagem> pode ser o ID OU o link dela                                 # lista os vínculos do servidor
```

> 💡 Crie a mensagem-painel com `&embed` e depois vincule os emojis a ela com o ID da mensagem.
> Para pegar o ID: `...` na mensagem → *Copiar ID*. O bot precisa de **React** e **ManageRole**.

---

## Cargo de silêncio e permissões revogadas

O bot "silencia" um usuário aplicando um **cargo de silêncio** — um cargo com
**todas as permissões negadas**. É isso que efetivamente **revoga as permissões**
da pessoa (ela não consegue mais enviar mensagens nem interagir).

Formas de configurar:

```
&cargomudo                 # cria "Silenciado", nega no servidor E em todos os canais, e já usa como cargo de silêncio
&cargomudo Castigo         # idem, com o nome que você escolher
&cargomudo canais          # reaplica a negação em todos os canais (útil após criar canais novos)
&punicao silencerole <id>  # usar um cargo que você já tem
```

Ao criar o cargo, o bot nega as permissões **no nível do servidor e também em cada
canal de texto e voz** (categorias são ignoradas). Isso cobre inclusive canais que
tenham permissões próprias sobrescrevendo as do servidor. Se você **criar canais
novos** depois, rode `&cargomudo canais` para bloqueá-los também.

`&cargomudo` cria um cargo de silêncio pronto (todas as permissões negadas) e já
o bloqueia em cada canal. Se preferir usar um cargo que já existe, informe o ID
com `&punicao silencerole <id>`.

> ⚠️ **Revogar permissões exige o cargo de silêncio.** O modo `confirmar` e a
> reaplicação de silêncio ao reentrar só funcionam se houver um cargo de silêncio
> definido. Se não houver, o bot avisa e não consegue silenciar. O bot precisa de
> **AssignRoles**/**ManageRole**, e o cargo dele deve estar **acima** do alvo.

---

## Chat de logs (`&log`)

Registra eventos num canal do servidor. **Por servidor**, cada categoria
liga/desliga separadamente.

```
&log                     # status e canal atual
&log here                # usa o canal atual
&log <idDoCanal>         # define por ID (ULID de 26 caracteres)
&log off                 # desativa
&log <evento> <on|off>   # liga/desliga uma categoria
```

Categorias: `punicoes`, `membros`, `mensagens`, `cargos`, `comandos`
(esta última começa desligada, por ser ruidosa).

> **Nota da plataforma:** o Stoat só emite eventos de mensagem apagada/editada
> para mensagens que o bot tem em cache (enviadas **depois** de ele subir).
> Mensagens muito antigas podem não gerar log — é limitação da API, não do bot.

---

## Lista global de banimentos (`&banglobal`)

Lista de banidos **compartilhada entre os servidores** onde o bot está. Cada
servidor decide o que fazer quando um usuário da lista entra:

| Modo | Comportamento |
|---|---|
| `off` | ignora a lista (**padrão**) |
| `avisar` | alerta os mods (motivo + em quantos servidores) — não age |
| `banir` | bane automaticamente |

Todo ban (automod e `&ban` manual) alimenta a lista, guardando **servidor de
origem** e **motivo**. Comandos:

```
&banglobal                      # status
&banglobal <off|avisar|banir>
&banglobal varrer          # confere quem JÁ está no servidor (os modos só agem em quem entra)
&banglobal varrer ver     # simula, sem banir   # define o modo
&banglobal historico <@user|id> # em quais servidores foi banido e por quê
&banglobal importar             # importa os bans JÁ EXISTENTES deste servidor
&banglobal esquecer <@user|id>  # remove um usuário da lista
```

> ⚠️ O modo `banir` age com base em bans de **outros** servidores. Comece com
> `avisar`, popule a lista com `importar`, observe alguns dias e só então
> mude para `banir` se confiar na origem.

---

## RPG (`&game`)

Sistema de RPG por servidor: cada pessoa cria um personagem, sobe de nível e
distribui pontos em 9 atributos.

```
&game criar Kael           # cria seu personagem
&game                      # sua ficha (atributos + equipamento)
&game ficha @pessoa        # a ficha de outra pessoa
&game pontos int 3         # distribui pontos (aceita abreviação)
&game carteira             # saldo e estado da economia
&game comprar Espada de Ferro
&game vender Adaga Simples
&game contratar Mercenário Novato
&game mercado              # bazar entre jogadores
&game mercado vender Lâmina Aurora 5000
&game cambio 100 ouro por 5 prata
&game trocar @amigo Elmo do Dragão por Manto Estelar
&game followers            # seus companheiros
&game follower levar Aprendiz de Magia
&game recrutas             # companheiros que existem no jogo
&game dungeon              # resgata quem foi capturado
&game missao               # missões disponíveis e suas chances
&game missao Caçar o Lobo Branco
&game itens                # sua mochila
&game equipar Espada de Ferro
&game desequipar arma      # ou pelo nome do item
&game catalogo             # resumo dos itens do jogo
&game catalogo lendario    # lista completa (filtra por raridade ou slot)
&game top                  # ranking do servidor
&game apagar confirmar     # recomeça do zero
```

### Atributos

| Atributo | Efeito |
|---|---|
| 💪 Força | dano físico |
| 🎯 Destreza | precisão (multiplica o dano) |
| 🛡️ Resistência | reduz o dano que passa |
| 💨 Agilidade | chance de evitar o golpe |
| ❤️ Vida | quanto dano aguenta |
| 🔷 Mana | quantas magias por missão |
| 🧠 Inteligência | dano mágico · +XP · +pontos por nível |
| 🍀 Sorte | dinheiro, drop, sobrevivência · +XP · +pontos por nível |
| ✨ Carisma | buffa a party · melhora preços |

### Economia

Uma moeda por servidor (o dono pode criar outras). Tudo gira em torno do **P** —
quanto da moeda está com os jogadores versus no mercado:

| | Itens | Cair custa |
|---|---|---|
| **P alto** (jogadores ricos) | baratos | caro |
| **P baixo** (mercado cheio) | caros | pouco |

Isso empurra quem tem dinheiro a gastar e quem não tem a arriscar — o mercado se
regula sozinho, sem ninguém ajustar nada. O P é **suavizado** (média móvel), para
uma compra grande não sacudir tudo de uma vez.

O NPC recompra **sempre abaixo** do preço de venda; o ✨ Carisma melhora a oferta
e dá desconto ao contratar mercenários.

> ⚠️ O fator de recompra tem teto **estritamente abaixo de 1**. Isso não é
> balanceamento: com itens de estoque infinito, recomprar por ≥ o preço de venda
> viraria máquina de dinheiro infinito. Com o teto, todo ciclo comprar→revender
> dá prejuízo.

Ao cair você perde uma fração do que carrega, e ela vai para o **pote da dungeon**
— a moeda é realocada, não destruída. Quanto mais cheio o pote, maior a fatia que
o vencedor leva.

### Programar as moedas

Cada servidor pode ter várias moedas, configuráveis pelo dono do bot:

```
&game admin moeda                              # lista e mostra a configuração
&game admin moeda criar prata Prata 🥈
&game admin moeda set prata dificuldade 5
&game admin moeda set prata nivelMin 10
&game admin moeda set prata finita nao
&game admin moeda padrao ouro                  # define a principal
&game admin moeda remover prata confirmar
```

| Campo | O que faz |
|---|---|
| `dificuldade` | 1 = comum. Maior = **aparece menos** em missão e **rende menos unidades** |
| `nivelMin` | só cai em missões desse nível para cima |
| `finita` | finita entra no cálculo do P; infinita não se esgota |
| `suprimentoBase` · `mercado` | quanto o mercado tem |

A dificuldade é o que cria a hierarquia entre moedas: uma moeda de dificuldade 20
com `nivelMin` 15 vira algo raro, que só aparece em missões avançadas e em
pequena quantidade — enquanto a moeda padrão sustenta o dia a dia.

### Mercado entre jogadores

Três formas de negociar, **todas com custódia** — o que está em jogo sai da sua
mochila e fica com o bot até fechar ou ser cancelado:

| | Comando |
|---|---|
| **Bazar** (item por moeda) | `&game mercado vender <item> <preço>` · `&game mercado comprar <#>` |
| **Balcão de câmbio** | `&game cambio <qtd> <moeda> por <qtd> <moeda>` |
| **Escambo** (item por item) | `&game trocar [@pessoa] <seu item> por <item dela>` |

Sem custódia, qualquer um poderia anunciar o que não tem e sumir. No câmbio, a
taxa do sistema aparece ao lado da oferta como referência, para ninguém aceitar
um negócio ruim sem perceber.

A **taxa** começa em 0,5% e sobe com o volume recente, como custo de
congestionamento — saturando em 8%, para nunca inviabilizar negociar.

> Nenhuma dessas operações cria ou destrói moeda: são transferências entre
> jogadores. O `P` não muda, então não há risco de inflação.

### Modo admin

Restrito ao dono do bot, para testar e depurar sem jogar horas:

```
&game admin dar 5000 [@pessoa]         # credita moeda
&game admin item <nome> · &game admin follower <nome> [nível]
&game admin nivel 20 · &game admin pontos 50
&game admin energia · &game admin cooldown
&game admin eco                      # números da economia
&game admin missao <nome>            # roda a missão ignorando cooldown
&game admin moeda                    # cria e configura as moedas do servidor
&game admin teste                   # roda o jogo INTEIRO e diz o que funcionou
&game admin simular <missao> [n]     # roda n vezes sem efeito real
&game admin zerar confirmar          # apaga o RPG do servidor
```

#### `&game admin teste` — teste de fumaça

Roda o jogo de ponta a ponta num personagem **descartável** e devolve um relatório
com ✅/❌ por etapa: criar, comprar, equipar, contratar, montar party, 12 missões,
subir de nível, morrer, capturar e resgatar follower, energia e dungeon.

O personagem de teste é apagado no fim, a moeda dele volta ao mercado, e ele não
aparece no ranking — seu progresso real não é tocado. Útil depois de cada deploy:
confirma em segundos que nada quebrou, e mostra os números reais de balanceamento
(taxa de sucesso, XP e moeda ganhos, chance de loot).

### Companheiros (party)

Até **2 followers** na party. Quatro classes, cada uma com uma magia própria:

| Classe | Foco | Magia |
|---|---|---|
| ⚔️ Combatente | dano físico | Golpe Certeiro (ataque) |
| 🛡️ Tank | resistência | Muralha (suporte) |
| 🔮 Mago | dano mágico | Lança Arcana (ataque) |
| ✨ Suporte | sorte e carisma | Bênção (suporte) |

Os atributos deles sobem **sozinhos** conforme a classe e a raridade. Gastam
⚡ **energia** por missão de dungeon, que regenera 1 por hora.

Levar companheiros **aumenta a dificuldade da missão** e **divide o loot** (a
parte deles vai para o mercado). Isso é proposital: eles valem pela **variedade**
— classes e magias que você não tem — e não por força bruta. Seu ✨ Carisma
amplifica o que eles trazem.

**Se a party cair**, os followers podem ser **capturados na dungeon**. Ninguém
morre de vez: `&game dungeon` lista os presos e tenta o resgate. O dono original
tem chance maior (~75% contra 25%) e prioridade exclusiva nas primeiras 6h — mas
depois disso, qualquer um pode tentar levar.

### Missões

Dois tipos, ambos com nome próprio:

- 🏪 **Mercado** — sem risco de cair. Paga pouco, em valor **fixo**: é a rede de
  segurança de quem não quer arriscar, e deixa de compensar naturalmente conforme
  a curva de XP cresce. Nenhuma trava artificial é necessária.
- 🟢🟡🔴 **Dungeon** — três dificuldades, com risco real e loot por raridade.

O resultado sai de **duas rolagens** (êxito e sobrevivência), calculadas a partir
dos seus atributos **mais o equipamento**:

```
Poder       = (Força + Inteligência×0,70) × precisão(Destreza) + Carisma×0,30
Resiliência = Vida × Resistência × Agilidade (fatores multiplicativos) + Sorte×0,60
```

As três defesas se multiplicam de propósito: **espalhar rende mais que empilhar**
(10/10/10 sobrevive mais que 30/0/0), sem nenhuma regra proibindo nada.

Cair **não** custa nível nem equipamento — você volta de mãos vazias e leva um
tempo se recuperando. O XP das missões acompanha a curva de 1,5×, então cada
nível leva mais ou menos o mesmo tempo a vida inteira.

### Itens e equipamento

Seis slots: ⚔️ **Arma**, 🪖 **Capacete**, 🛡️ **Armadura** e 💍 **3 Acessórios**.
Cada item dá bônus de atributo, que entram na ficha ao lado do valor base.

| Raridade | |
|---|---|
| ⚪ Comum | ♾️ estoque infinito — ninguém fica sem equipamento |
| 🟢 Incomum · 🔵 Raro · 🟣 Épico · 🟠 Lendário | finitos: a escassez move o preço |

O jogo já nasce com um **catálogo genérico** de 26 itens cobrindo todas as
raridades e slots, para rodar antes de a curadoria terminar. Itens curados entram
depois sem parar o jogo.

> Conteúdo nunca é apagado, só **descontinuado**: para de aparecer em drop e no
> mercado, mas quem já tem continua tendo. Apagar removeria o item da mochila
> das pessoas.

### Progressão

- `xpParaNivel(n) = 100 × 1,5^(n−2)` — nível 2 custa 100 XP, nível 10 custa 2.563.
- `pontosPorNivel = 1 + 0,25 × √(Inteligência + Sorte)`
- A cada **2 níveis**, todos os 9 atributos sobem **+1** automaticamente

A distribuição é híbrida: a base automática garante que ninguém fique inviável, e
os **pontos livres** é que fazem a build.

Inteligência e Sorte aumentam o XP ganho **e** os pontos por nível, com **retorno
decrescente**: investir sempre rende mais, mas nunca vira bola de neve que torna
os outros atributos irrelevantes. Não há teto — só curva.

> ⚠️ `&game` (RPG) é diferente de `&xp` (nível por mensagens do servidor). São
> sistemas separados, com progressões independentes.

`&help rpg` lista os comandos e `&tutorial rpg` explica passo a passo.

O design completo — missões, itens, economia, followers, mercado entre jogadores
— está em [`DESIGN-rpg-economia.md`](DESIGN-rpg-economia.md). As próximas etapas
são itens, missões e economia.

---

## Cor dos cargos (`&cor`)

O cliente do Stoat só permite cor sólida nos cargos. O campo `colour` do cargo,
porém, aceita **qualquer valor CSS válido** — então o bot fala direto com a API
(`PATCH /servers/{id}/roles/{id}`) e aplica gradientes.

```
&cor VIP #FF00AA                                  # sólida por hex
&cor VIP roxo                                     # sólida por nome
&cor VIP gradiente #FF0000 #00FF00 #0000FF        # gradiente (2+ cores)
&cor VIP gradiente 45 vermelho azul               # o número inicial é o ângulo
&cor VIP preset vaporwave                         # gradientes prontos
&cor VIP linear-gradient(90deg, #f00 0%, #00f 100%)   # CSS na mão
&cor VIP remover                                  # volta ao padrão
&cor lista                                        # cargos e cores atuais
&cor presets                                      # ver os prontos
&cor criar                                        # cria um cargo por preset, já colorido
&cor criar fogo gelo neon                         # só alguns
```

### Painel de cores automático

Um comando monta tudo:

```
&cor painel aqui              # neste canal
&cor painel <id-do-canal>     # em outro canal
&cor painel aqui fogo gelo    # só algumas cores
&cor criar                    # só cria/pinta os cargos, sem publicar
```

O `&cor painel` faz, em sequência: cria um cargo por preset e aplica o gradiente,
publica a mensagem de escolha **mencionando os cargos** (aparecem já coloridos),
reage com o emoji de cada cor, registra os cargos por reação e liga o **modo
exclusivo** — escolher uma cor troca a anterior.

Cargos que já existem com o mesmo nome são **reaproveitados** (só recebem a cor),
então dá para rodar de novo sem duplicar nada.

**Prontos disponíveis:** `arco-iris`, `fogo`, `oceano`, `neon`, `vaporwave`,
`poente`, `floresta`, `ouro`, `cyberpunk`, `sangue`, `gelo`, `trans`.

O cargo pode ser informado pelo **nome** (mesmo parcial), **mencionando** (`<%Cargo>`) ou pelo ID.

> ⚠️ Erro mais comum: escrever `gradient(...)` em vez de `linear-gradient(...)` —
> a API devolve 400. O bot detecta isso antes de enviar e avisa.
>
> O cargo do **bot** precisa de `ManageRole` e estar **acima** do cargo editado,
> senão a API responde 403.

---

## Guia `&tutorial`

O bot não tem assistente que configura sozinho: cada área tem seu próprio comando
e o `&tutorial` é o **mapa** que diz por onde passar e o que rodar em cada etapa.
Ele nunca altera nada — só explica.

```
&tutorial              # o roteiro, na ordem recomendada
&tutorial moderacao    # a página daquela área, com os comandos exatos
```

Também responde por `&guia` e `&comecar`.

### As áreas, na ordem sugerida

| # | Área | O que cobre |
|---|---|---|
| ⚠️ | `permissoes` | o que o **bot** precisa para funcionar — comece por aqui |
| 1 | `moderacao` | filtros do automod, política de punição, detecção de conteúdo |
| 2 | `logs` | canal de registro e quais eventos anotar |
| 3 | `cargos` | autorole, cargos por reação, cargo de silêncio |
| 4 | `xp` | níveis, cargos por nível, dificuldade |
| 5 | `ia` | conversa da Judy, memória, perfil, moderação por IA |
| 6 | `noticias` | feeds RSS e o resumo automático |
| 7 | `mensagens` | `&embed` para avisos e regras |
| 8 | `ajustes` | panorama, comandos desativados, ban global |

Cada página termina apontando a próxima, então dá para seguir em sequência. Nada
é obrigatório: pule o que não fizer sentido para o seu servidor.

> 💡 `&config` mostra o **estado atual** de tudo que está configurado, e
> `&help <comando>` detalha qualquer comando citado no guia.

---

## Chat com IA local — a Judy (`&chat`)

Conversação com a **Judy**, um LLM rodando 100% local, **sem nenhuma chave ou API
externa**. A arquitetura tem duas partes:

- **O bot** (este repositório) monta a personalidade, a memória e o contexto, e
  decide qual modelo usar.
- **O serviço `ia-servico/`** (rodando na máquina com GPU, ao lado do Ollama)
  executa as **ferramentas** e o laço de tool-calling. O bot fala com ele por HTTP
  (`IA_SERVICO_URL`). Se o serviço cair, o bot fala direto com o Ollama.

```
&chat me explique o que é RAID 5
&chat quanto é 4783 × 921?          (faz a conta exata via ferramenta)
@Judy qual a capital da Austrália?
```

### Modelos por função (escolha automática)

O tipo de mensagem define o modelo — sem troca manual:

| Tipo | Variável | Uso |
|---|---|---|
| Conversa simples | `OLLAMA_MODEL_LEVE` | papo curto, rápido |
| Conversa complexa | `OLLAMA_MODEL` | explicações, debate |
| Programação | `OLLAMA_MODEL_CODIGO` | código, erros |
| Lógica/matemática | `OLLAMA_MODEL_LOGICA` | contas, raciocínio |
| Decisões internas | `OLLAMA_MODEL_DECISAO` | buscar? responder? (modelo pequeno, rápido) |

### Ferramentas (via `ia-servico`)

- **calcular** — executa JS num sandbox isolado para contas exatas.
- **ler_codigo** — lê o próprio código do repositório no GitHub (requer
  `GITHUB_TOKEN` se o repo for privado).
- **buscar_web** — busca na internet via SearXNG.
- **buscar_rss** — resumo de feeds sob demanda.

### Memória, perfil e participação

- **Perfil do usuário**: a Judy monta um perfil de cada pessoa com fatos
  categorizados (**personalidade**, **gostos**, **informações**), cada um com a
  data em que foi aprendido. `&chat perfil [@user]` mostra o perfil;
  `&chat mapear [@user]` tenta capturar bio/status do cartão do Stoat.
- **Tom modular**: o tom base é caloroso, e a Judy lê o perfil para decidir o
  quão afiada ser com cada pessoa. `&chat cuidado [@user] on` marca alguém
  (opt-in) para tratamento gentil — pensado para acessibilidade, sem o bot
  inferir condições por conta própria.
- **Cache do canal**: acompanha as últimas ~20 mensagens do canal (quem falou, a
  quem respondeu) para perceber quando o assunto muda e não responder fora de
  contexto.
- **Apagar memória**: `&chat esquecer` apaga tudo sobre você;
  `&chat esquecer tudo` zera a memória do servidor inteiro (exige ManageServer).
- **Conversa livre** (`&chat livre on`): a Judy participa por conta própria quando
  o assunto vale. Modo `todas` responde tudo; `relevante` só o que importa.
  Depois de responder alguém, mantém o papo fluido por um tempo.
- **Comentário espontâneo** (`&chat comentar aqui`): ela solta comentários por
  iniciativa num canal, com freios (teto diário, cooldown, chance).
- **Moderação por IA** (`&modia`): critérios em texto livre; ela apaga o que
  violar e marca o dono no log — nunca bane sozinha.

**Escopo:** a IA funciona **apenas nos servidores** de `CHAT_SERVIDORES`. Nos
demais, os comandos e as áreas de IA **não aparecem** no `&help`, `&config` nem
no `&tutorial` — em vez de anunciar algo que não roda ali.

O **RSS não depende da IA**: sem ela, o bot posta os itens dos feeds normalmente;
onde a IA está disponível, a Judy escreve também o resumo. Se quiser limitar o
RSS a servidores específicos, use `RSS_SERVIDORES` (independente de `CHAT_SERVIDORES`).

### Curadoria de notícias (RSS)

A cada hora, a Judy posta um **resumo geral no tom dela** e depois os itens novos:

```
&rss add https://exemplo.com/feed.xml
&rss canal aqui
&rss agora            # testa um ciclo na hora
```

**Como ativar a IA:** suba o Ollama na máquina com GPU, suba o `ia-servico/`
(veja [`ia-servico/README.md`](ia-servico/README.md)), e aponte o bot para ele
com `IA_SERVICO_URL` + as variáveis `OLLAMA_MODEL_*`.

---

## Sistema de níveis (`&xp`)

XP por mensagem (com cooldown anti-farm). Ao acumular XP, o usuário sobe de
nível; a cada N níveis, pode ganhar um cargo.

```
&xp                 # seu nível, XP e progresso
&xp rank @usuário    # perfil de outra pessoa
&xp top              # ranking (XP + nível)
&xp setup             # configurar
&xp criarcargos      # cria os cargos de nível automaticamente
&xp on | off         # liga/desliga
```

Configurável via `&xp setup`: **multiplicador de dificuldade**, **nível
máximo**, **intervalo de cargos** (5 ou 10 níveis), XP por mensagem, cooldown e
canal de anúncio.

**Segurança de hierarquia:** todos os cargos de nível são posicionados **abaixo**
do cargo de mute (se existir), impedindo que sejam usados para escapar do
silenciamento.

> ⚠️ **XP por call não é suportado** — a SDK do Stoat não emite eventos de voz.
> Todo o XP vem de mensagens.

## Persistência (SQLite)

Todo o estado fica em um único arquivo de banco (`stoat.db`), usando o módulo
**embutido** `node:sqlite` — sem dependências nativas, sem serviço externo.

- `config` — configuração por servidor (+ linhas `__global__` e `__default__`)
- `punicoes` — avisos e silêncios por `(servidor, usuário)`
- `bans_globais` — histórico da lista global

No Docker, o banco fica em `/data/stoat.db`, dentro do volume persistente, então
sobrevive a restart, update e redeploy. O caminho é configurável via `DB_PATH`.

---

## Deploy com Docker / umbrelOS

O bot roda a partir de uma **imagem pré-construída** (recomendado no umbrelOS,
onde o `npm install` no build costuma falhar). O fluxo:

1. Faça push do código para o GitHub.
2. O GitHub Actions (`.github/workflows/build.yml`) constrói a imagem
   **multi-arquitetura** (amd64 + arm64) e publica no GitHub Container Registry.
3. No Portainer/Dockge, use um compose com `image:` apontando para a imagem
   (veja `docker-compose.image.yml`) e defina a variável **`BOT_TOKEN`**.

Variáveis de ambiente:

| Variável | Padrão | Descrição |
|---|---|---|
| `BOT_TOKEN` | — | **obrigatória** — token do bot |
| `DB_PATH` | `/data/stoat.db` | caminho do banco SQLite |
| `CONFIG_PATH` | `/data/automod-config.json` | (legado) migrado uma vez, se existir |
| `TZ` | — | fuso para os horários nos logs (ex.: `Europe/Madrid`) |

O `Dockerfile` já inclui a flag `--disable-warning=ExperimentalWarning` (silencia
o aviso do `node:sqlite`) e define `DB_PATH`. O volume `/data` guarda o banco.

> Após atualizar o código: push → aguarde o Actions ficar verde → no Portainer,
> **Pull and redeploy** para puxar a imagem nova.

---

## Estrutura do projeto

O código é organizado em quatro áreas, sob `modulos/`:

```
.
├── main.js                     # bootstrap: cliente, rotas, eventos, auto-recuperação
├── modulos/
│   ├── core/                   # base compartilhada
│   │   ├── db.js               # SQLite (config, punições, bans, RSS, XP)
│   │   ├── config-store.js     # configuração por servidor + global
│   │   └── log.js              # chat de logs configurável (&log)
│   ├── moderacao/              # moderação e automod
│   │   ├── automod-engine.js   # motor: runAutomod, punição, blocklist, spam
│   │   ├── automod-comandos.js # configuração do automod
│   │   ├── scorecard.js        # pontuação 0–10 (anti-scam)
│   │   ├── caracteres.js       # anti-zalgo/invisíveis e anti-repetição
│   │   ├── ban-global.js       # lista global de banimentos
│   │   ├── comandos-admin.js   # &comando, &cargomudo
│   │   ├── config-comando.js   # &config (panorama)
│   │   ├── limpar.js           # &limpar
│   │   ├── embed.js            # &embed
│   │   ├── debug-comando.js    # &debug (diagnóstico)
│   │   ├── tutorial.js         # &tutorial — guia de primeiros passos
│   │   ├── cor-cargo.js        # &cor — cores de cargo, com gradiente (via API)
│   │   ├── moderacao-ia.js     # moderação por IA (apaga + marca o dono)
│   │   ├── modia-comando.js    # &modia (configura a moderação por IA)
│   │   └── geral.js            # help, ping, sobre, userinfo, kick, ban
│   ├── ai/                     # LLM (a Judy)
│   │   ├── chat.js             # chat, roteamento de modelos, conversa livre, tom modular
│   │   ├── memoria-agente.js   # aprende fatos (personalidade/gostos/info) + perfil
│   │   ├── cache-canal.js      # memória curta da conversa de cada canal (~20 msgs)
│   │   └── comentario-espontaneo.js  # comentários por iniciativa (com freios)
│   ├── ferramentas/            # utilidades de engajamento
│   │   ├── nivel.js            # XP por mensagem (&xp/&nivel)
│   │   ├── reaction-roles.js   # cargos por reação (&reactionrole)
│   │   ├── autorole.js         # cargo automático a quem entra (&autorole)
│   │   └── rss.js              # notícias com resumo da Judy (&rss)
│   ├── game/                   # RPG
│   │   └── game.js             # &game — personagem, 9 atributos, progressão
│   └── economia/               # reservado para o futuro
├── ia-servico/                 # serviço de IA (ferramentas + tool-calling)
│   ├── servidor.js             # HTTP: /chat, /saude, /ferramentas
│   └── ferramentas/            # calcular, ler_codigo, buscar_web, buscar_rss
├── ia-stack/                   # stack de IA legada (superada pelo ia-servico)
├── Dockerfile
├── docker-compose.image.yml    # imagem pré-construída (Portainer/umbrelOS)
└── .github/workflows/build.yml # build multi-arch → GHCR
```

---

## Licença

MIT (veja `LICENSE`). As dependências (`stoat.js`, `dotenv`) são permissivas.
