# Stoat Bot — moderação para Stoat/Revolt

Bot de moderação para a plataforma **Stoat** (fork/rebrand do Revolt), escrito em
Node.js (ESM) com a biblioteca [`stoat.js`](https://www.npmjs.com/package/stoat.js).
Prefixo padrão: **`&`**.

Funciona em **vários servidores ao mesmo tempo**, cada um com sua própria
configuração, punições e chat de logs. Tudo é persistido num banco **SQLite**
embutido (nada de serviço externo), então as configurações e punições
**sobrevivem a reinícios e atualizações**.

---

## Primeiros passos (5 minutos)

Acabou de adicionar o bot? Três comandos resolvem quase tudo:

| Comando | O que faz |
|---|---|
| `&assistente rapido` | ⭐ **configuração guiada**: o bot pergunta (idioma, staff, log, nível de proteção, boas-vindas), você responde em texto normal, ele mostra o resumo e aplica — usando os mesmos comandos que você usaria na mão, e mostrando quais foram |
| `&tutorial` | guia **em páginas** (reaja ◀ ▶): permissões → canais → proteção → boas-vindas e cargos → XP e RPG → checklist |
| `&help` | índice **por intenção** (começar · proteger · personalizar · diversão · rpg · diagnóstico); `&help <comando>` explica **cada parâmetro** |

### A regra de ouro dos canais

> **A permissão definida no canal vence a definida no cargo.** Se o canal nega,
> nenhum cargo salva — nem o do bot. Deixe as permissões dos cargos no mínimo e
> abra exceções canal por canal.

Separe **todo** canal em um de três tipos:

| Tipo | Exemplos | No canal → *Permissões* |
|---|---|---|
| 🔒 **Só staff vê** | #log, #alertas, #staff | **Padrão**: negue *Ver canal* → em cada cargo de staff: permita *Ver canal* |
| 📢 **Só staff escreve** | #regras, #avisos, painéis de reaction role | **Padrão**: negue *Enviar mensagens* → em cada cargo de staff: permita *Enviar mensagens* |
| 💬 **Geral** | #chat, #off-topic | não mexa |

O cargo do **bot** precisa de *Ver canal* + *Enviar mensagens* nos dois primeiros
tipos também, senão ele não registra log, não alerta e não publica painel.
`&debug canais` confere isso canal a canal; `&assistente canais` pergunta quais
canais são de cada tipo e lista exatamente o que clicar; `&tutorial canais` é a
versão em prosa.

---

## Onde cada peça roda

O projeto tem **dois processos, em duas máquinas**, e confundir isso já custou
horas de diagnóstico:

| Peça | Onde | Como |
|---|---|---|
| **stoat-bot** | Umbrel | container, stack no **Portainer** |
| **judy-ia** | Gentoo (a do GPU) | direto com Node, serviço **OpenRC** |
| **Ollama** | Gentoo | nativo, serviço OpenRC |

O bot fala com a máquina do GPU pelo **Tailscale** (`100.74.70.106`), nas
portas `8090` (judy-ia) e `11434` (Ollama).

### Configuração do bot (Portainer)

As variáveis vêm do bloco `environment` da stack — **não** de um `.env`. Depois
de mudar qualquer uma, é preciso **recriar** o container: um `restart` mantém
as variáveis antigas, e o sintoma é silencioso (o bot sobe normal e só falha
quando alguém usa a IA).

O boot imprime o que efetivamente chegou:

```
[IA] Ollama:  http://100.74.70.106:11434
[IA] Serviço: http://100.74.70.106:8090
[IA] Modelos: conversa=gemma4:e4b · código=ornith:9b · ferramentas=qwen3.5:9b
```

Se aparecer `⚠️ (padrão — OLLAMA_URL não definida)`, a variável não chegou.

O `.env.example` na raiz serve para rodar **local**, fora do container.

### Configuração da IA (Gentoo)

Essa metade roda nativa. O `judy-ia` lê um `.env` **do próprio diretório**, e
o serviço OpenRC define `directory=` para lá:

```bash
sudo cp scripts/openrc/judy-ia /etc/init.d/judy-ia
sudo chmod +x /etc/init.d/judy-ia
sudo cp scripts/openrc/judy-ia.confd /etc/conf.d/judy-ia
sudo nano /etc/conf.d/judy-ia          # usuário e diretório
sudo rc-update add judy-ia default
sudo rc-service judy-ia start
```

**Cuidado com o `OLLAMA_HOST`:** se o Ollama for configurado com um IP
específico (o do Tailscale, por exemplo), ele deixa de escutar em `127.0.0.1`.
A partir daí `localhost:11434` dá `ECONNREFUSED` até na própria máquina —
enquanto `ollama list` continua funcionando, porque usa o endereço
configurado. Use o mesmo endereço nas duas pontas.

---

## Moderação que se adapta

Os módulos do AutoMod se dividem em dois tipos, e a diferença importa.

**Os que medem** — spam, spam em massa, convites, menções, caixa alta, links,
caracteres, repetição — trabalham com números objetivos: 5 mensagens em 4
segundos, 70% de maiúsculas. O limite é o mesmo para todo mundo, e assim deve
ser: 12 mensagens em 8 segundos é flood venha de quem vier.

**O que julga** — o **sentinela** (antigo `scam`) — dá ao conteúdo uma nota de
suspeita de 0 a 10. Julgamento não é medida, e por isso ele se adapta.

### Mais rígido com quem chegou agora

Uma conta criada minutos atrás que já chega mandando link e falando de venda é
o padrão clássico de golpe. A mesma frase vinda de quem conversa no servidor há
semanas quase sempre é brincadeira que o detector não entende.

Como o Stoat não expõe a data de entrada de forma confiável, a medida de
convívio é o **nível de XP** — ele só sobe conversando, ao longo do tempo, que é
exatamente o que se quer medir.

| Nível | Faixa | Limiar (base 6) |
|---|---|---|
| 0 | recém-chegado | 4,5 |
| 1–2 | conhecido | 5,0 |
| 3–5 | frequente | 5,5 |
| 6–10 | estabelecido | 6,0 |
| 11+ | veterano | 6,5 |

Com piso e teto: nem o veterano fica imune, nem o novato é punido por qualquer
bobagem. Sem XP ligado no servidor, todos contam como novatos — o lado seguro
de errar. `&sentinela antiguidade on|off`.

### Avisar antes de punir

Quando alguém levanta suspeita **3 vezes em 10 minutos** — mesmo sem chegar ao
limiar de punição — a staff é marcada com o perfil da pessoa, os sinais vistos e
os comandos de ação.

Nem todo padrão suspeito merece punir, mas todo padrão suspeito merece um par de
olhos humanos **enquanto está acontecendo**. É justamente o caso duvidoso, de
nota alta mas não alta o bastante, que a moderação precisa ver antes de o bot
decidir sozinho.

Um sinal isolado é ruído, por isso o mínimo de três. E depois de avisar, fica 30
minutos em silêncio sobre aquela pessoa: alerta que se repete vira ruído e a
staff para de ler. `&sentinela alerta on|off`.

## A escada de punição

O modo `acumular` era N avisos e, no limite, ban — sem nada no meio. Isso punia
igual quem escorregou uma vez e quem estava atacando o servidor, e dava ao
membro comum um susto desproporcional na única punição que ele via.

Agora cada reincidência sobe um degrau:

| Reincidência | Punição |
|---|---|
| 1ª | aviso |
| 2ª | silêncio de 5 min |
| 3ª | silêncio de 1 h |
| 4ª | ban |

Quem para no primeiro degrau nunca chega ao último; quem insiste sobe sozinho.

```
&punicao escada                      # mostra a escada atual
&punicao escada aviso,10m,2h,ban     # mais tempo em cada degrau
```

Aceita `aviso`, `ban` e prazos como `30s`, `10m`, `2h`, `1d`. O ban é sempre o
último degrau, mesmo que você não escreva — sem isso, alguém insistente ficaria
em loop de mute para sempre.

O prazo do silêncio fica no **banco**, não num timer em memória: um mute de 1
hora sobrevive a reinício do bot. E há uma rotina conferindo os vencimentos —
sem ela, reiniciar o processo no meio transformaria mute temporário em
permanente.

## Conversa: rápida por desenho

A prioridade aqui é **tempo de resposta**, não profundidade. Quatro mudanças,
em ordem de impacto medido:

**Contexto sob demanda.** A referência de comandos (15 mil caracteres) e o
README (8 mil) iam no prompt de *toda* mensagem. Um "bom dia" custava 9.300
tokens de prompt — e processar prompt é a maior fatia do tempo. Agora só entram
quando a pergunta é sobre o bot. Medido: **9.328 → 1.872 tokens** numa conversa
comum, com o contexto completo preservado em "como configuro o automod?".

**Um modelo para conversa.** Havia dois (leve para papo curto, pesado para
explicação). Numa GPU só, isso obrigava o Ollama a descarregar um para carregar
o outro várias vezes por conversa — a troca custava mais do que a diferença de
qualidade rendia. O agente de memória, que usava um terceiro modelo, passou a
usar o mesmo.

**Menos uma inferência por mensagem.** A decisão "isto precisa de busca?" era um
chamado ao LLM em toda mensagem — inclusive sem SearXNG configurado, decidindo
sobre um serviço que não existe. Agora exige `SEARXNG_URL` e passa antes por
uma heurística.

**Contexto proporcional.** `num_ctx` era 16384 sempre; o Ollama reserva cache
de atenção pelo valor pedido, não pelo usado. Agora é calculado pelo tamanho
real da conversa (4096 no caso comum).

### Escolher o modelo de conversa

O nome não diz o custo. Num caso real, `gemma4:e4b` ocupava **9,6 GB** e
`gemma4:12b`, **7,6 GB** — o modelo com cara de leve era o mais pesado dos
dois. Arquitetura MoE, quantização e tamanho de contexto mexem nisso de formas
que o nome não revela.

Por isso existe `scripts/medir-modelos.sh`: rode na máquina do Ollama e ele
mede o que importa — tempo com o modelo já carregado, tempo com carga fria, e
quanto de VRAM sobra para você usar o computador.

```bash
./scripts/medir-modelos.sh
```

Aponte `OLLAMA_MODEL_LEVE` para o melhor tempo **quente** cuja VRAM ainda te
deixe trabalhar. Um modelo que suporte tool calling (a família Qwen, por
exemplo) permite ir além: ele serve conversa **e** ferramentas, e aí só resta
um segundo modelo para código — dois no total, em vez de cinco.

### Como está a VRAM

| Modelo | Papel | Fica na memória |
|---|---|---|
| `OLLAMA_MODEL_LEVE` | conversa, memória, decisões | 30 min |
| `OLLAMA_MODEL_CODIGO` | programação | 60 s |
| `OLLAMA_MODEL_LOGICA` | ferramentas, lógica | 60 s |

O modelo de conversa fica residente porque responde quase tudo; os pesados saem
rápido para devolver a placa a quem está usando o computador. Ajustável em
`CHAT_KEEP_LEVE` e `CHAT_KEEP_PESADO`.

## Quando alguém dá em cima do bot

O pessoal brinca, e parte das brincadeiras tem teor sexual. Deixar isso para o
modelo dava três problemas: ele às vezes entrava na brincadeira, às vezes fazia
sermão, e sempre gastava uma inferência inteira para responder algo que não
exige inteligência nenhuma.

A resposta agora é **fixa, curta e entediada**, escolhida em `desinteresse.js`
sem chamar modelo — sai instantânea:

> — manda nude
> — Não tenho corpo, nem interesse. Sobretudo interesse.

O raciocínio por trás do tom: quem provoca busca reação, e sermão é uma reação
enorme. Tédio encerra o assunto; indignação alimenta. Por isso nenhuma das
respostas repreende.

A lista de gatilhos é enxuta de propósito, com exceções explícitas para
"comer alguma coisa", "peitoral" e "sexo do personagem" — falso positivo aqui
custa uma resposta seca numa conversa normal. O que escapa cai na instrução de
persona, que pede o mesmo tom em uma frase.

## Sumário

- [Primeiros passos (5 minutos)](#primeiros-passos-5-minutos) ⭐
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
- [Guia `&tutorial` e assistente `&assistente`](#guia-tutorial-e-assistente-assistente)
- [Instância do autor vs. o bot genérico](#instância-do-autor-vs-o-bot-genérico)
- [Persistência (SQLite)](#persistência-sqlite)
- [Instalação e serviço (OpenRC)](#instalação-e-serviço-openrc)
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
  com modos `off` / `avisar` / `banir`. Contribuir é automático e permanente
  (bans novos e antigos entram sozinhos); o modo decide só se o servidor **se
  aproveita** da lista.
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
- **Auto-recuperação**: erros de conexão (socket morto, `fetch failed`, DNS)
  encerram o processo para o supervisor recriá-lo. O login tem nova tentativa
  com espera crescente, e um watchdog encerra o bot se ele ficar 2 minutos de
  pé **sem nunca ter conectado** — estado em que o container fica vivo sem
  fazer nada e o Docker não o recria sozinho.
- **Autorole** (`&autorole`): dá um cargo automaticamente a quem entra no servidor.
- **Voz nas calls** (`&tts`): a Judy entra num canal de voz e **fala** o que
  for escrito. A síntese é **offline**, no computador do dono (Piper, pt-BR — `faber` masculina
  ou `dii` feminina), com efeitos de timbre aplicados por ffmpeg (`&tts efeito
  glados` recria o processamento metálico da GLaDOS — não existe voz GLaDOS
  treinada em português, as prontas são modelos ingleses do Portal),
  e o serviço de voz (`judy-voz`) roda nativo no Gentoo — fora do Docker, para
  que uma falha de WebRTC não derrube a moderação.
  **Na prática são dois comandos:** `&tts entrar` dentro da call (ela entra e
  passa a falar tudo que for escrito ali; se estiver em outra call, vem para a
  sua) e `&tts sair` (sai e para de ler).
  O `entrar` liga o sistema, descobre a call e liga a leitura sozinho — isso
  eram quatro comandos na ordem certa. Recurso isolado:
  só funciona nos servidores listados em `TTS_SERVIDORES`.
  Não existem `canal`, `transmitir`, `on` nem `off`: o `entrar` faz os quatro
  de uma vez (liga o sistema, escolhe a call, define o canal lido e entra) e o
  `sair` desfaz. Um comando que só repete o que outro já faz é mais uma coisa
  para aprender e mais um jeito de deixar a configuração pela metade.

  Diagnóstico da cadeia inteira: `&tts estado` ou `&debug voz`.
  A transmissão passa por uma **peneira** (`&tts filtro`) que ignora barulho
  pela FORMA — letra repetida, bloco repetido, pouca variedade de caracteres,
  parede de texto — e limita as falas por minuto **no canal**, não só por
  pessoa. Risada (`kkkk`, `rsrs`) passa de propósito, e `&tts <texto>` nunca é
  filtrado: pedido explícito é sempre falado. Se a entrada na call travar,
  `&tts diagnostico` diz **em qual etapa** — a API do Stoat (token, permissão,
  registro preso) ou a rede até o LiveKit (UDP, MTU, firewall). Para o caso
  mais comum, `AlreadyConnected`, veja abaixo. `&tts reiniciar` recria a
  conexão local.
  **Detalhe do Stoat:** não existe um "canal de voz" separado — a call vive
  dentro de um canal de texto com voz habilitada, então `&tts entrar` usa
  sempre a call do canal onde foi digitado.
  ⚠️ **O `voz-servico/` não sobe pelo deploy do container** — ele roda nativo na
  máquina e precisa ser copiado e reiniciado à mão. O bot compara a versão da
  interface: se estiverem defasados, `&tts estado` mostra o aviso e as rotas
  novas respondem `rota desconhecida`.
- **Fusos horários** (`&fuso`): relógio com várias cidades ao mesmo tempo, para
  servidores com gente espalhada. A staff escolhe as cidades (`&fuso add São Paulo`,
  `&fuso add Madrid/Europa`) e qualquer pessoa consulta com `&fuso`. A lista sai
  ordenada do fuso mais atrasado ao mais adiantado, com a diferença em relação à
  cidade de referência. Aceita acentos, o formato `Cidade/País` e apelidos
  (`sp`, `nova york`, `toquio`). Também dá para consultar uma cidade avulsa sem
  configurar nada: `&fuso ver Lisboa`.
- **Equipe do servidor** (`&staff`): lista a staff agrupada por cargo, com quem tem cada um. Não é um cadastro à parte — lê os **mesmos cargos** do `&acesso cargo`, então promover pelo `&staff add` concede de verdade o acesso aos comandos de moderação, e remover tira os dois de uma vez. `&staff titulo <@cargo> <texto>` troca o nome exibido (ex.: cargo `Admin` aparecendo como `Fundadores`).
- **Boas-vindas e despedida** (`&boasvindas`, `&adeus`): embeds configuráveis publicados quando alguém entra ou sai. Título, texto, cor e imagem próprios, com os marcadores `{usuario}` `{nome}` `{servidor}` `{membros}`. `&boasvindas testar` publica usando você de exemplo antes de valer para o servidor inteiro. A imagem tem **dois resultados** conforme a origem: **anexo do Stoat** vira a
  capa do embed (o campo de capa só aceita anexo do próprio Stoat); **link de
  fora** aparece como pré-visualização logo abaixo do embed, com a URL
  mascarada (sem link enorme na tela; `&boasvindas imagem visivel` devolve a URL
  crua caso a pré-visualização pare de funcionar). Se não carregar, a
  mensagem vai sem capa em vez de não ir.

  > **Sobre a imagem e segurança.** O bot **nunca baixa** a imagem — só guarda o
  > link e o repassa ao Stoat, então não há arquivo de terceiro entrando no
  > processo do bot. Ainda assim, URLs são validadas: endereços de rede interna
  > (`localhost`, `192.168.x`, `100.x` da Tailscale, portas fora de 80/443) e
  > esquemas como `javascript:`/`data:` são **recusados**, porque guardá-los na
  > configuração criaria um atalho para a rede da máquina do bot. O melhor
  > caminho é **enviar o arquivo no próprio Stoat e usar o link do anexo**: além
  > de não quebrar, evita que o dono de um site de terceiros veja o IP de cada
  > pessoa que carrega a mensagem — numa boas-vindas, o de todos que entram.
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
| `&help [grupo\|comando]` | índice por intenção (em páginas, reaja ◀ ▶); `&help <comando>` detalha **cada parâmetro**; os nomes antigos (`moderacao`, `config`…) continuam valendo |
| `&tutorial [n\|área]` | guia de primeiros passos em 6 páginas; `&tutorial canais` explica os 3 tipos de canal |
| `&assistente [rapido\|completo\|canais\|protecao]` | configuração guiada (exige ManagePermissions ou cargo de staff) |
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
| `&limpar tudo` | esvazia o canal inteiro — **só o dono**, com código de confirmação |
| `&limpar <n> [@usuário]` | ManageMessages | apaga as últimas `n` mensagens (1–100) |
| `&clearwarnings @usuário` | ManagePermissions | zera os avisos do usuário |

### Administração (ManagePermissions)

| Comando | Descrição |
|---|---|
| `&comando` | lista os comandos e seu estado (ativo/desativado) |
| `&comando desativar <nome>` | desativa um comando neste servidor _(ou `disable`)_ |
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
| `&banglobal lista` | todas as pessoas na lista global, em páginas |
| `&banglobal revisar` | confere quem já está no servidor — **só mostra** |
| `&banglobal isentar <@pessoa>` | aceita alguém neste servidor apesar da lista |
| `&banglobal desfazer` | reverte os bans que a lista aplicou aqui |
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
| `&staff [add\|remove\|titulo\|limpar]` | a equipe do servidor (mesmos cargos do `&acesso`) |
| `&fuso [ver\|buscar\|add\|remove\|apelido\|principal\|formato]` | relógio com vários fusos |
| `&tts entrar` / `&tts sair` | ⭐ dentro da call: entra e lê tudo que for escrito ali / sai e para |
| `&tts <texto>` / `&tts estado` | uma frase específica, e o painel da cadeia inteira |
| `&tts dicionario [lista\|teste\|add\|remove\|padrao on\|off]` | como a escrita de chat vira fala (`vc` → `você`); ver e testar é livre |
| `&tts voz [nome]` / `&tts efeito <nome>` / `&tts tom <n>` | timbre — as listas vêm do serviço, não do bot *(ManageMessages)* |
| `&tts nomes on\|off` / `&tts cooldown <s>` | anunciar quem falou / freio entre falas da mesma pessoa *(ManageMessages)* |
| `&tts filtro [status\|on\|off\|porminuto <n>\|teste <texto>]` | a peneira anti-barulho da transmissão |
| `&tts diagnostico` | em qual etapa a entrada na call trava *(ManageMessages)* |
| `&tts destravar` | limpa o `AlreadyConnected` do lado do Stoat *(ManageMessages)* |
| `&tts resgatar [#call-auxiliar]` | o que `entrar` já faz sozinho no `AlreadyConnected`, escolhendo a call auxiliar à mão |
| `&tts reiniciar` | destrava o serviço de voz sem terminal *(ManageMessages)* |
| `&boasvindas <canal\|titulo\|texto\|cor\|imagem\|testar\|padrao\|on\|off>` | embed de entrada |
| `&adeus <canal\|titulo\|texto\|cor\|imagem\|testar\|padrao\|on\|off>` | embed de saída |

---

## AutoMod

Cada módulo é ligado/desligado **por servidor** com `&automod <módulo> <on|off>`:

- **antispam** — muitas mensagens em pouco tempo
- **antimassspam** — flood (limite maior, janela maior)
- **antiinvite** — convites `stt.gg` de outros servidores
- **antimassmention** — menções em excesso numa mensagem
- **anticaps** — CAIXA ALTA em excesso. A conta é feita **só sobre o que a
  pessoa digitou**: menções (`<@ULID>`, 26 caracteres maiúsculos), links,
  emojis nomeados e blocos de código são removidos antes de medir, e mensagens
  com pouco texto são ignoradas — sem isso, marcar duas pessoas ou citar uma
  sigla já era punido como grito.
- **antilink** — domínios de listas estilo Pi-hole. As listas viram um **índice
  compacto em RAM** (hash de 64 bits por domínio: ~20 MB para 2,5 milhões de
  domínios, em vez de ~400 MB) e o índice pronto fica **cacheado em disco**
  (`/data/blocklist-cache.bin`): no boot o anti-link arma na hora, mesmo sem
  internet, enquanto o download real roda em segundo plano. Se alguma fonte
  falhar no download, o índice anterior é mantido (nunca "encolhe" por queda
  de rede).
- **anticaracteres** — bloqueia zalgo (acentos empilhados) e caracteres invisíveis/de controle de direção (coisas que travam front-ends)
- **antirepeticao** — bloqueia a mesma letra repetida muitas vezes (ex.: `aaaaaaaaaa`). **Desligado por padrão** e, quando ligado, ignora o `k` (a risada BR `kkkkk` não é punida). Configure com `&automod antirepeticao set ignorar <letras>`
- **sentinela** (antigo `antiscam`, nome que ainda é aceito) — o único filtro que **julga** em vez de medir: nota de suspeita 0–10 para golpe, +18, gore e apologia; `&sentinela on` liga (ver abaixo)

A detecção de conteúdo dá uma **nota de 0 a 10** (golpe, +18, gore, apologia a
ilícito e abuso, tudo numa categoria) e age conforme a sensibilidade
(`baixa` = 8, `media` = 6, `alta` = 4). Configure com `&sentinela`.

### O golpe do "trabalho" e por que ele exige conjunções

Uma mensagem real passou com nota 3,0: oferta de "colaboração" em que a vítima
entrega a conta do LinkedIn, o golpista usa a identidade dela para fechar
contratos e o dinheiro "cai direto na sua conta". Nenhum léxico antigo pegava —
não há link, não há brinde grátis, não há "ganhe dinheiro fácil". O texto é
comedido e empresarial.

O que o denuncia é a **estrutura da proposta**, não uma palavra. Cinco peças:

| Sinal | O que é | Peso |
|---|---|---|
| `recrutamento` | "procuro colaborador", "sem experiência necessária" | 1 |
| `conta_alheia` | a conta/identidade tem de ser a **sua** — o núcleo | 1,5 |
| `divisao_lucro` | "dividimos 50%", "te dou 30%" | 1,5 |
| `mula` | o dinheiro passa por você ("cai direto na sua conta") | 1,5 |
| `pretexto_conta` | a justificativa de por que não pode ser a conta dele | 1,5 |

Os pesos isolados são baixos **de propósito**: cada peça, sozinha, aparece em
conversa honesta — "procuro parceiro", "dividimos 50/50", "minha conta tá
bloqueada". O que não aparece fora de golpe é a **combinação**, e é ela que
pontua:

```
conta_alheia + (recrutamento | divisao_lucro)   → +3
conta_alheia + (mula | pretexto_conta)          → +3
pretexto_conta + (divisao_lucro | mula)         → +3
mula + divisao_lucro                            → +3
```

A mensagem original passou de 3,0 para 10. `to procurando um parceiro pro
projeto, a gente divide 50/50` continua em 2,5, e quem **alerta** sobre o golpe
fica abaixo do limiar por causa do peso negativo de `negacao`.

Tudo isso vale em **português e inglês**, e está coberto por `teste-scorecard.mjs`
— que testa as duas metades: o golpe sendo pego e a conversa honesta passando.
A segunda metade importa mais, porque sem ela a tentação é subir pesos até tudo
virar suspeito.

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
&automod sentinela punicao banir      # o Sentinela bane direto
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

- `&punicao modo <avisar\|apagar\|confirmar\|acumular\|banir>`
- `&punicao escada [aviso,5m,1h,ban]` — os degraus do modo `acumular`
- `&punicao warns <n>` — quantos avisos até o ban (modo `acumular` antigo)
- `&punicao silencerole <idDoCargo>` — cargo usado para silenciar

> `&punicao` **não analisa texto**: ele decide o que acontece *depois* que um
> filtro acusa. Quem lê um texto e dá nota é o `&sentinela test <texto>`. Um
> subcomando que pertence a outro comando (`test`, `simulate`, `warn`…) recebe
> de volta o comando certo já montado com o que foi digitado, em vez de um
> "subcomando desconhecido" que manda procurar.

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
&reactionrole list                               # lista os vínculos do servidor
&reactionrole exclusivo <mensagem> on            # só um cargo por vez (cor, time)
&reactionrole recarregar                         # repõe emojis que sumiram do painel
&reactionrole ordem <mensagem> confirmar         # recompõe o painel na ordem configurada
```

A `<mensagem>` pode ser o **ID** ou o **link** dela.

### A reação do bot é o que segura o painel de pé

Quando uma regra é criada, o bot reage na mensagem. Essa reação não é
decoração: é ela que mantém a contagem em 1 quando ninguém está marcado. Sem
ela, a última pessoa que desmarca leva o emoji junto — e a opção deixa de
existir para todo mundo, porque não há mais onde clicar.

Foi o que aconteceu no modo exclusivo, por causa de uma assinatura enganosa da
lib:

```js
async unreact(emoji, deleteAll = false) {
  return api.delete(`.../reactions/${emoji}`, { remove_all: deleteAll });
}
```

O segundo parâmetro é um **booleano**, não um usuário. Passando um `userId` ali
— que é o que qualquer um escreveria — a string vira `remove_all: true` e o
backend executa `clear_reaction`, apagando a reação de **todos**. O código
pedia "tire a reação desta pessoa" e o servidor ouvia "apague este emoji da
mensagem". A rota certa aceita `user_id` (`OptionsUnreact`, no delta), só não
está exposta na lib; agora é chamada direto pela API.

Duas defesas somadas à correção:

- **`aoDesreagir` repõe a semente** se o emoji ficou sem ninguém, e o boot faz
  o mesmo em todas as mensagens configuradas. Painéis já danificados voltam
  sozinhos no próximo restart.
- **A ordem é persistida** (coluna `ordem`), porque não dá para confiar no
  `rowid`: o `INSERT OR REPLACE` do `addReactionRole` apaga e reinsere a linha,
  jogando para o fim uma regra apenas reeditada.

Um emoji reposto entra no **fim** da fila — repor sem apagar nada não permite
escolher a posição. `&reactionrole ordem <mensagem> confirmar` devolve a ordem
original, ao custo de limpar as marcações de todos (os cargos permanecem). Por
isso ele pede confirmação e nunca roda sozinho.

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
&log here                # usa o canal atual (aceita também: &log canal aqui)
&log <canal>             # por menção, link, ID ou nome (&log canal <alvo> também vale)
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

### Contribuir é automático e permanente

Todo servidor onde o bot está **alimenta a lista, sempre** — não há comando
para ligar, desligar ou importar à mão:

- **Bans novos** (automod e `&ban` manual) entram no instante em que acontecem,
  guardando **servidor de origem** e **motivo**.
- **Bans antigos** do servidor são sincronizados sozinhos ~1 min após o bot
  subir e a cada 6 h (`BANGLOBAL_IMPORT_MS`).
- **Servidor novo**: o histórico entra assim que o bot é adicionado.

A tabela de modos acima é a **única** escolha de cada servidor, e ela trata só
do consumo: dá para **não usar** a lista (`off`), mas não dá para usá-la sem
alimentá-la. Isso mantém a lista honesta — quem se protege com o trabalho dos
outros contribui com o seu.

```
&banglobal                        # status (inclui quantos registros vieram daqui)
&banglobal <off|avisar|banir>     # define o modo

&banglobal lista                  # TODO MUNDO na lista global, em páginas (◀ ▶)
&banglobal lista servidor         # só quem ESTE servidor baniu
&banglobal historico <@pessoa>    # em quais servidores foi banido e por quê

&banglobal revisar                # confere quem JÁ está aqui — SÓ MOSTRA, nunca bane
&banglobal varrer                 # mostra a lista e espera confirmação
&banglobal varrer confirmar       # ⚠️ bane de verdade quem foi encontrado

&banglobal isentar <@pessoa>      # aceita a pessoa AQUI apesar da lista (e desbane, se o bot baniu)
&banglobal isentos                # quem está isento neste servidor
&banglobal desfazer               # ↩️ reverte os bans que a LISTA aplicou aqui
&banglobal esquecer <@pessoa>     # apaga o registro PARA TODOS os servidores — e o mantém fora
&banglobal ignorados              # quem está marcado para ficar fora da lista
&banglobal lembrar <@pessoa>      # desfaz o esquecer (reabre a porta; não ressuscita registros)
&banglobal bots                   # bots que entraram na lista antes da regra nova
&banglobal bots <@ele>            # por que ESTE não foi detectado (mostra cada sinal)
```

### Como indicar uma pessoa

Todo comando aceita **menção**, **ID**, **link do perfil**, **nome**,
`Nome#0000` ou o **apelido no servidor**. A busca passa pelos membros, pelos
banidos do servidor e pela própria lista global — por isso funciona para quem
já saiu, que é justamente quem esses comandos costumam tratar.

Se o nome bater em mais de uma pessoa, o bot **mostra os candidatos com os IDs
e não faz nada**: banir a pessoa errada por um apelido parecido não se desfaz
com um pedido de desculpas.

### Bots não entram na lista

Um bot não escolhe entrar em lugar nenhum — alguém o adiciona. Se ele foi
banido num servidor, isso é assunto de quem o adicionou lá. Bots populares
acabam banidos em algum lugar mais cedo ou mais tarde, e sem essa regra a lista
se encheria justamente dos mais usados, fazendo o modo `banir` derrubar
integrações que o dono do servidor acabou de instalar.

A regra vale para a importação, o ban manual, o automod e a entrada de membros.
Para os que entraram antes dela: `&banglobal bots` mostra, `&banglobal bots
confirmar` remove.

### Nomes em vez de "Unknown User"

A lista guarda o **nome** de quem foi banido, no momento do ban. Antes só o ID
era gravado e a exibição virava `<@ID>`, que o cliente renderiza como *Unknown
User* quando não há servidor em comum — ou seja, ilegível exatamente nos casos
que mais importam. Agora cada linha traz nome e ID: o nome para você reconhecer,
o ID porque é ele que os comandos aceitam.

### Revisar ≠ varrer (e por que agora são dois comandos)

`revisar` era apelido de `varrer`, e `varrer` banir direto: uma palavra que
significa "conferir" executava a ação irreversível. Num servidor real isso
custou **quatro bans por engano**. Hoje:

- **`revisar`** lista quem consta e não faz absolutamente nada;
- **`varrer`** lista e **espera** `varrer confirmar` — mesmo com o modo `banir` ligado;
- **`desfazer`** reverte os bans que a lista aplicou (só os de origem `banglobal`;
  bans manuais e do automod ficam intactos) e **isenta** as pessoas, senão a
  varredura seguinte as banaria de novo.

### Isentar: quando o critério de fora não é o seu

A lista é feita da moderação de **outros** servidores. Às vezes ela não
corresponde ao que você quer aqui — a pessoa levou ban num servidor de jogo por
bater boca e, no seu, é bem-vinda.

| Comando | Alcance | Quando usar |
|---|---|---|
| `&banglobal isentar <@pessoa>` | **só este servidor** | você discorda do critério de fora, mas o ban de lá é assunto deles |
| `&banglobal esquecer <@pessoa>` | **todos os servidores, para sempre** | o registro em si não se sustenta (engano, ban revertido na origem), ou a pessoa/bot não pertence à lista |

Quem está isento entra e fica, a varredura passa por ela, e se o bot já a tinha
banido por causa da lista o ban é desfeito na hora. Desbanir remove o
impedimento, não traz ninguém de volta: mande um convite novo.

> ⚠️ O modo `banir` age com base em bans de **outros** servidores. Comece com
> `avisar`, observe alguns dias e só então mude para `banir` se confiar na origem.
>
> ⚠️ Como a contribuição não é desligável, **adicionar o bot a um servidor de
> terceiros faz o critério de moderação de lá valer para os seus**. Pense nisso
> antes de aceitar o convite; para um registro pontual que não se sustente,
> use `&banglobal esquecer`.

### `esquecer` é uma decisão, não uma limpeza

Apagar as linhas não bastava. A lista é **realimentada o tempo todo**: qualquer
ban novo em qualquer servidor, e a importação automática a cada 6h, trazem a
pessoa de volta. Foi o que aconteceu com o bot AutoMod aqui — esquecido num dia,
reposto no outro pelo ban de outra pessoa, sem ninguém ficar sabendo.

Por isso `esquecer` grava uma marca (`banglobal_ignorados`) que **veta a entrada
na origem**, dentro do `registrarBanGlobal` — a porta única da lista, por onde
passam o ban manual, o do automod e a importação. `&banglobal lembrar` tira a
marca; `&banglobal ignorados` mostra quem está fora e por quê.

`&banglobal bots` faz o mesmo para todos os bots que encontrar: um bot popular é
banido em algum servidor mais cedo ou mais tarde, então sem a marca a limpeza
precisaria ser refeita toda semana.

### Como se descobre que um id é de um bot

`GET /users/{id}` **não serve sozinho**. O Stoat só responde sobre quem tem
conexão mútua com quem pergunta:

```rust
if query.have_mutual_connection().await {
    permissions = UserPermission::Access as u64 + UserPermission::ViewProfile as u64;
```

Um bot banido em **outro** servidor não divide servidor nenhum com a Judy — ou
seja, o caso que motiva a checagem era exatamente o único que ela não cobria.

A rota que não exige nada disso é `GET /bots/{id}/invite`, que nem pede
autenticação:

```rust
let bot = db.fetch_bot(target.id).await?;          // 404 se o id não for de bot
if !bot.public && user.is_none_or(|x| x.id != bot.owner) { NotFound }
```

Um 200 é **prova** de que o id é de um bot. Um 404 não prova nada (pode ser um
bot privado). Daí a cadeia, da mais barata à mais cara — cada resposta positiva
encerra a busca, e o motivo fica registrado:

| # | Sinal | Alcança | Custo |
|---|---|---|---|
| 1 | cache do cliente / o próprio membro | quem já foi carregado | zero |
| 2 | `GET /bots/{id}/invite` | qualquer bot **público** | 1 requisição |
| 3 | `users.fetch` e `GET /users/{id}` | quem divide servidor | 1–2 requisições |
| 4 | **discover** (`stt.gg/discover/bots`) | bots listados na vitrine | 1 requisição a cada 6h, para a lista toda |

O discover é lido uma vez e guardado: os ids são extraídos por **formato**
(ULID) em vez de por uma estrutura específica, porque a página pode mudar de
HTML para JSON sem aviso e o que importa é se o id aparece nela. `BANGLOBAL_DISCOVER_URL`
troca o endereço; `BANGLOBAL_DISCOVER_MS`, a validade.

Só respostas **positivas** ficam guardadas para sempre. Um "não" pode ser
apenas a API tendo recusado a pergunta naquele momento, e eternizá-lo
transformaria uma falha de rede em fato.

`&banglobal bots <@alguém>` mostra o resultado de cada sinal para um id — é o
que responder quando a lista mostra um bot e o comando diz que não achou
nenhum.

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
&game comprar Espada de Ferro com prata   # paga com a moeda que você escolher
&game vender Adaga Simples
&game contratar Mercenário Novato
&game mercado              # bazar entre jogadores
&game mercado vender Lâmina Aurora 5000
&game cambio 1000 ouro para prata   # troca com o banco, na hora
&game cambio taxas                 # quanto o banco paga hoje
&game cambio 100 ouro por 5 prata  # oferta a outro jogador
&game trocar @amigo Elmo do Dragão por Manto Estelar
&game followers            # seus companheiros
&game follower ficha Aprendiz de Magia    # atributos, magia, energia e mochila
&game follower dar Aprendiz Espada de Ferro  # ele carrega e o bônus soma nele
&game follower levar Aprendiz de Magia
&game recrutas             # companheiros que existem no jogo
&game dungeon              # quem foi capturado (o resgate é automático)
&game missao               # missões disponíveis e suas chances
&game missao Caçar o Lobo Branco
&game itens                # sua mochila
&game item Espada de Ferro # preço, estoque e bônus de um item
&game magias               # o grimório: o que existe e o que você sabe
&game aprender Cura        # compra uma magia
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

**O jeito rápido — conjuntos prontos:**

```
&game admin moeda modelo           # lista os conjuntos
&game admin moeda modelo mundo     # Real, Dólar, Euro, Prata, Ouro e Bitcoin
&game admin moeda modelo fantasia  # Cobre, Prata, Ouro e Cristal Arcano
&game admin moeda modelo simples   # uma moeda só
```

Cada conjunto já vem balanceado — dificuldade, nível mínimo e suprimento
calculados para fazerem sentido entre si.

**Ou à mão, tudo numa linha:**

```
&game admin moeda ajuda                       # o que cada campo significa
&game admin moeda criar btc Bitcoin ₿ dificuldade=400 nivel=18 suprimento=210
&game admin moeda set btc dificuldade=300 nivel=20    # vários de uma vez
&game admin moeda ver btc                     # ficha: quanto rende por nível
&game admin moeda padrao brl
&game admin moeda remover btc confirmar
```

Os campos aceitam apelidos (`nivel`, `dif`, `suprimento`, `estoque`) e podem vir
em qualquer ordem.

| Campo | O que faz |
|---|---|
| `dificuldade` | 1 = comum. Maior = **aparece menos** em missão e **rende menos unidades** |
| `nivelMin` | só cai em missões desse nível para cima |
| `finita` | finita entra no cálculo do P; infinita não se esgota |
| `finita` | `sim` = o estoque se esgota · `nao` = nunca acaba |
| `suprimentoBase` · `mercado` | em moeda finita, o estoque; em infinita, o **volume de referência** do `P` |

**Finita ou infinita?** Moedas fiat e metais funcionam melhor como **infinitas** —
o que as separa não é estoque, é a velocidade de geração (`dificuldade`). Reserve
`finita` para moedas com teto real, como Bitcoin: quando o suprimento acaba, ela
só volta a circular se alguém gastar.

A dificuldade é o que cria a hierarquia entre moedas: uma moeda de dificuldade 20
com `nivelMin` 15 vira algo raro, que só aparece em missões avançadas e em
pequena quantidade — enquanto a moeda padrão sustenta o dia a dia.

#### Resetar

Três escopos, porque "apagar tudo" significa coisas diferentes:

```
&game admin reset servidor confirmar   # o progresso das pessoas
&game admin reset catalogo confirmar   # volta o catálogo só aos genéricos
&game admin reset tudo confirmar       # os dois
```

| Escopo | Apaga | Mantém |
|---|---|---|
| `servidor` | personagens, mochilas, followers, moedas, saldos, ofertas, dungeon | o catálogo (itens e followers que existem no jogo) |
| `catalogo` | itens e followers **curados por você** | o progresso das pessoas |
| `tudo` | ambos | nada — volta ao estado de recém-instalado |

Sem `confirmar`, o comando mostra uma **prévia** do que será perdido (quantos
personagens, followers, moedas e ofertas abertas).

A **moeda padrão não é recriada** de propósito: quem reseta normalmente vai
aplicar um conjunto em seguida (`&game admin moeda modelo mundo`), e uma moeda
automática ficaria sobrando ao lado das novas. Se você não escolher nenhum
conjunto, ela nasce sozinha no primeiro uso do jogo.

O catálogo genérico é recriado no reset de `catalogo` e `tudo`.

> As **ofertas abertas** do mercado são apagadas junto no reset de servidor. Se
> ficassem, seriam ofertas órfãs segurando itens que já não existem.

### Mercado entre jogadores

Três formas de negociar **entre jogadores**, todas com custódia — o que está em
jogo sai da sua mochila e fica com o bot até fechar ou ser cancelado:

| | Comando |
|---|---|
| **Bazar** (item por moeda) | `&game mercado vender <item> <preço>` · `&game mercado comprar <#>` |
| **Balcão de câmbio** | `&game cambio <qtd> <moeda> por <qtd> <moeda>` |
| **Escambo** (item por item) | `&game trocar [@pessoa] <seu item> por <item dela>` |

Sem custódia, qualquer um poderia anunciar o que não tem e sumir. No câmbio, a
taxa do sistema aparece ao lado da oferta como referência, para ninguém aceitar
um negócio ruim sem perceber.

### Itens: a ficha, os slots e o preço

O catálogo lista dezenas de itens, mas ver o preço de um exigia abrir o mercado
inteiro e procurar. `&game item <nome>` responde direto:

```
&game item Espada de Ferro
```

Vem o bônus, o slot, o estoque, quanto o mercado te paga de volta — e o preço
**em cada moeda do servidor**, com ✅ nas que você consegue pagar. Para escolher
com qual pagar: `&game comprar <item> com <moeda>`. Antes o bot decidia sozinho
a primeira moeda que desse, o que é péssimo quando você está guardando uma rara.

A ficha do personagem (`&game`) passou a listar os **seis slots, vazios
inclusive**. Mostrar só o que está equipado escondia justamente a informação
útil: onde ainda dá para melhorar.

### Magia

O atributo **Mana** existia sem ter no que gastar — magia só vinha da classe do
companheiro. Agora dá para comprar as suas:

```
&game magias               # o catálogo e o que você já sabe
&game magia Cura           # custo, poder, nível e preço em cada moeda
&game aprender Cura        # compra (aceita `com <moeda>`)
```

São dez magias em duas escolas: 🔥 **ataque** sobe a chance de cumprir a missão,
✨ **suporte** sobe a de voltar vivo.

O limite é a **Mana da party**, não o tamanho do grimório. As magias entram da
mais forte para a mais fraca enquanto a Mana durar; o resto fica dormente (💤)
até você investir no atributo. As magias dos followers disputam a mesma Mana, de
propósito — uma party de magos com Mana baixa desperdiça poder, e equilibrar
vira uma decisão de verdade.

### Companheiros: ficha e mochila

A lista de followers mostrava nome, nível e energia — mas quem decide **quem
levar** precisa dos atributos e da magia, que é o que muda a chance da missão:

```
&game follower ficha Aprendiz de Magia
```

Cada companheiro também carrega até **2 itens**, e o bônus deles soma nos
atributos *dele*:

```
&game follower dar Aprendiz Espada de Ferro
&game follower pegar Aprendiz Espada de Ferro
```

Os dois nomes podem ter espaço, e não há separador obrigatório: em
`dar Curandeira Errante Espada Temperada` o bot testa todas as quebras
possíveis e fica com a única em que os dois lados resolvem para algo real.
Quando várias servem, ganha a que acerta o nome inteiro em vez de um pedaço.
Se ainda assim ficar ambíguo, `|` separa na marra:
`&game follower dar Curandeira Errante | Espada Temperada`.

Isso dá destino ao equipamento que você já superou, em vez de tudo virar
revenda. Na ficha, o valor base aparece com o acréscimo entre parênteses:
`Força 0 (+2)`.

### Duas esperas, uma conta

Cada missão tem cooldown próprio (10 min no mercado, 90 na difícil) e cair
adiciona ~30 min de recuperação. As duas correm **em paralelo**, a partir da
mesma missão — mas eram checadas em sequência, então a mais curta escondia a
mais longa:

```
&game missao ...    → 🩹 Ainda se recuperando. Volte em ~3 min.
   (3 minutos depois)
&game missao ...    → ⏳ Descansando. Pode partir em ~59 min.
```

Agora é uma mensagem só, com o prazo que de fato vale e o motivo de cada
espera. E como o cooldown é por missão, ela também aponta o que já está
liberado — depois de cair numa difícil, as de mercado voltam em 10 minutos.
A lista de missões marca com ⏳ quanto falta em cada uma.

### O resgate na dungeon é automático

Existia um `&game dungeon <nome>` que rolava um dado. Era um comando parado:
sem custo, sem espera e sem escolha, então a estratégia ótima era repetir até
dar certo — o que não é decisão nenhuma.

Agora o resgate acontece onde ele já fazia sentido: **na missão**. Toda missão
de que você volta é uma tentativa.

| Desfecho | Chance |
|---|---|
| Missão cumprida | cheia |
| Voltou sem cumprir | metade |
| Caiu | nenhuma — você não estava em condição de tirar ninguém de lá |

O dono original tem chance bem maior e prioridade exclusiva nas primeiras 6h;
depois disso, a missão de qualquer um pode soltá-lo. Uma tentativa por missão, e
os seus vêm primeiro. `&game dungeon` continua existindo como **painel** de quem
está lá dentro.

### As moedas: perfis prontos

Os **modelos** (`moeda modelo mundo`) criam um conjunto fechado — bom para
começar rápido, ruim para quem quer misturar Real com Esmeralda. Os **perfis**
resolvem isso: doze moedas que se adicionam uma a uma, em qualquer combinação.

```
&game admin moeda perfil              # o catálogo, por grupo
&game admin moeda perfil brl xau btc  # adiciona três de uma vez
```

| Grupo | Moedas |
|---|---|
| 💵 Fiduciárias | Real · Dólar · Euro · Libra Esterlina |
| 🥇 Metais | Cobre · Prata · Ouro |
| 💎 Gemas | Esmeralda · Diamante |
| ₿ Criptos | Monero · Ethereum · Bitcoin |

Misturar é seguro porque todas vivem na mesma escala. Como a taxa do banco é a
razão entre os estoques, o suprimento de cada uma **nasce inversamente
proporcional ao seu valor**:

```
suprimentoBase = 200.000 / valor
```

Assim 1 Ouro (valor 200) já vale ~200 Reais no instante em que as duas
aparecem, sem tabela de conversão em lugar nenhum — e a taxa passa a flutuar
com o que os jogadores fazem. Gemas e criptos são **finitas** (têm teto de
emissão); fiduciárias e metais são infinitos, e o que os separa é a velocidade
de geração.

Os valores não são a cotação real: 1 BTC valendo 350 mil Reais deixaria a moeda
inalcançável dentro do jogo. São valores de jogo, mantendo a ordem e a sensação
de raridade de cada uma.

### Moedas repetidas

Aplicar `modelo mundo` e `modelo fantasia` no mesmo servidor criava **Prata e
Ouro duplicados**: os dois conjuntos trazem as mesmas moedas com ids diferentes
(`xag` contra `prata`, `xau` contra `ouro`), e a checagem só olhava o id.

A criação agora confere **id e nome**, então juntar conjuntos apenas mantém o
que já existe. E o `padrao` deixou de ser roubado pelo último conjunto aplicado
— trocar a moeda principal reprecificaria todos os itens do servidor sem aviso.

Para bases que já ficaram sujas, existe a fusão:

```
&game admin moeda duplicadas            # mostra o que seria feito
&game admin moeda duplicadas confirmar  # executa
```

Ela **funde, não apaga**: saldos das carteiras, estoque do banco e pote da
dungeon são somados na moeda que fica, e ofertas abertas passam a apontar para
ela — o valor em custódia não evapora. Fica a moeda padrão; sem padrão no
grupo, fica a que as pessoas mais têm na carteira.

Isso também roda **sozinho no boot**, em silêncio: é conserto de dado, não
novidade para anunciar. Quem já tem a base duplicada não precisa fazer nada.

### Quanto vale em cada moeda

```
&game cambio 1 bitcoin
```

```
₿ 1 Bitcoin vale
🇧🇷 387 Real   (1 = 400.00)
🥇   1 Ouro    (1 = 2.00)
```

O spread já vem descontado — é o que você receberia de fato, não uma cotação
teórica. `&game cambio taxas` continua mostrando a tabela completa de todas
contra todas.

### Fração é dinheiro

O câmbio arredondava para baixo, e isso comia patrimônio a cada troca. Com
Monero valendo ~90 Reais, trocar 112 Reais devolvia **1 Monero** — os 22 Reais
restantes simplesmente sumiam. Pior: 68 Cobre "não chegavam a 1 Monero", então
a troca era recusada e o jogador ficava preso na moeda barata.

Os saldos agora têm **6 casas decimais**. A mesma troca devolve 1,24 Monero, e
a única perda é o spread de 3% — que existe de propósito, para o A→B→A não
virar máquina de dinheiro.

```
&game cambio 112 brl para xmr     # → 1,24 Monero
&game cambio 0,5 xau para brl     # fração na entrada (ponto ou vírgula)
```

Isso vale também para as compras: um item de 20 Reais pago em Ouro custa
0,107 Ouro, não 1 Ouro inteiro (que era o que o arredondamento para cima
cobrava antes).

A exibição mostra só as casas que existem — `150.475` de Cobre continua
inteiro, `0,0001` de Bitcoin aparece inteiro em vez de virar `0`. Seis casas
passam longe do erro de ponto flutuante do JavaScript e são finas o bastante
para a moeda mais cara do catálogo.

### Câmbio com o banco

Depender de outro jogador para trocar moeda trava quem joga sozinho ou fora de
horário. Por isso o banco também troca, na hora:

```
&game cambio 1000 real para dolar   # troca imediata, pela taxa do dia
&game cambio taxas                  # a tabela completa, de cada moeda
```

A taxa do banco sai de duas coisas. A **dificuldade** da moeda é o lastro: um
Bitcoin com `dificuldade 400` contra 1 do Real custa ~400× mais esforço para
ganhar, então vale ~400×. O **P** é a inflação do momento: moeda parada nas
carteiras desvaloriza, moeda escassa valoriza. Nenhuma tabela fixa — a taxa se
move conforme o servidor joga.

Cada troca cobra um **spread** de 3%, e é ele que impede o A→B→A de virar
máquina de dinheiro: a ida e a volta sempre custam mais do que a oscilação
devolve. Moeda finita tem estoque; se o banco não tiver o bastante, ele avisa e
o balcão entre jogadores continua aberto.

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
&game admin reset <escopo> confirmar # recomeça do zero (ver abaixo)
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

**Para configurar no servidor:** `&tutorial game` — guia passo a passo de tudo
que dá para ajustar (canal do jogo, moedas, verificação, calibragem, reset).

**Para os jogadores:** `&tutorial rpg` (personagem), `&tutorial aventura`
(missões e companheiros) e `&tutorial economia` (moeda e mercado).
`&help game` lista todos os comandos.

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

## Guia `&tutorial` e assistente `&assistente`

São dois caminhos para o mesmo lugar:

- **`&tutorial`** ensina. Seis páginas curtas, navegadas por reação (◀ ▶) ou por
  número (`&tutorial 3`): *antes de tudo* (permissões do bot) → *canais* (a regra
  de ouro e os 3 tipos) → *proteção* → *boas-vindas e cargos* → *XP e RPG* →
  *checklist*. Cada página termina apontando o comando que aprofunda.
- **`&assistente`** faz junto. Pergunta uma coisa de cada vez, você responde em
  texto normal (sem prefixo), e no fim mostra o **resumo com os comandos
  equivalentes** antes de aplicar qualquer coisa. Quem usou o assistente sai
  sabendo fazer na mão.

```
&tutorial              # o guia em páginas
&tutorial 2            # abre direto a página 2 (celular, ou sem poder reagir)
&tutorial canais       # aprofundamento: os 3 tipos de canal, clique a clique

&assistente            # menu
&assistente rapido     # idioma, staff, log, nível de proteção, boas-vindas (~2 min)
&assistente completo   # o rápido + escada de punição, lista global, autorole, XP
&assistente canais     # classifica seus canais nos 3 tipos e diz o que clicar
&assistente protecao   # só automod, Sentinela e punição
```

Durante o assistente: `pular` pula a pergunta, `voltar` volta uma, `cancelar`
desiste. A sessão é por (canal, pessoa) e expira em 10 min sem resposta. Um
comando com prefixo continua sendo comando — só o texto puro vai para o
assistente.

Como o assistente aplica chamando os **mesmos handlers** dos comandos normais
(com as respostas capturadas em vez de publicadas), não existe lógica de
configuração duplicada: se `&punicao` muda, o assistente muda junto, e as
checagens de permissão continuam valendo. O relatório final marca ✅/❌ por
comando; para os que falharam, rodar o comando na mão mostra a explicação
completa.

> O assistente **não altera permissões de canal** — o Stoat pede que isso seja
> feito na interface. O roteiro `canais` gera as instruções e confere, canal a
> canal, se o bot já consegue ver/escrever ali.

### Os níveis de proteção do assistente

| Nível | Liga | Punição |
|---|---|---|
| 1 Leve | antispam, antiinvite | `avisar` |
| 2 Médio | + antilink, antimassmention, **Sentinela** (com `antiguidade` e `alerta`) | `acumular` (aviso → mute 5 min → mute 1 h → ban); cria o cargo de silêncio se faltar |
| 3 Rígido | + anticaps, anticaracteres, antirepeticao; Sentinela em `alta` | `acumular` + `banglobal banir` |

### As áreas de aprofundamento (`&tutorial <área>`)

| # | Área | O que cobre |
|---|---|---|
| ⚠️ | `permissoes` | o que o **bot** precisa para funcionar |
| 0.5 | `canais` | a regra canal > cargo e os 3 tipos, clique a clique |
| 1 | `moderacao` | filtros do automod, política de punição, Sentinela |
| 2 | `logs` | canal de registro e quais eventos anotar |
| 3 | `cargos` | autorole, cargos por reação, cargo de silêncio |
| 4 | `xp` | níveis, cargos por nível, dificuldade |
| 5 | `ia` | conversa da Judy, memória, perfil, moderação por IA *(só onde a IA roda)* |
| 6 | `noticias` | feeds RSS e o resumo automático |
| 7 | `mensagens` | `&embed` para avisos e regras |
| 8–11 | `game`, `rpg`, `aventura`, `economia` | montar e jogar o RPG |
| 12 | `ajustes` | panorama, comandos desativados, ban global |

Áreas longas viram duas páginas em vez de serem cortadas no limite do embed.
Também responde por `&guia` e `&comecar`; em inglês, `&guide`/`&start` e
`&wizard`/`&setup`.

> 💡 `&config` mostra o **estado atual** de tudo, e `&help <comando>` detalha
> qualquer comando citado — com a seção **Parâmetros** explicando cada opção
> (`&help boasvindas` diz o que é `{membros}`, o que `imagem oculto` faz, etc.).

---

## Instância do autor vs. o bot genérico

O código é genérico: qualquer servidor que adicione o bot recebe moderação,
níveis, RPG, boas-vindas, cores, reaction roles, RSS, relógio e o assistente.
Algumas coisas, porém, só existem na **instância do autor** (o servidor Vapor
Nexus) e não aparecem nos outros:

| Recurso | Por que é específico | Como é isolado |
|---|---|---|
| A **Judy** (`&chat`, `&modia`, comentário espontâneo, memória) | depende do `judy-ia` + Ollama na máquina com GPU do autor | allowlist `CHAT_SERVIDORES`; fora dela os comandos não existem (não aparecem no `&help`, e a rota responde "não habilitado") |
| **Voz** (`&tts`) | depende do `voz-servico` | só funciona onde há um canal de voz configurado |
| `&servidores`, `&game admin`, `&automod debug`, `&banglobal revisar` | ferramentas do dono do bot | exigem super-admin; o `&help` mostra a página 👑 **dono** só para ele |
| Infra (Portainer, Tailscale, `resolv.conf`, `GITHUB_TOKEN`) | homelab do autor | documentada em *Onde cada peça roda*; nada disso é exigido para rodar o bot em outro lugar |

O que **não** é específico: o `&help`, o `&tutorial` e o `&assistente` se
adaptam sozinhos — onde a IA não roda, as linhas e páginas de IA somem.

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
&xp sincronizar      # devolve os cargos que o nível já garante (servidor inteiro)
&xp sincronizar @pessoa   # só uma pessoa
&xp on | off         # liga/desliga
```

### `AlreadyConnected`: o participante preso

O Stoat **não tem rota de "sair da call"** — as únicas rotas de voz são
`join_call` e `stop_ring`. A saída acontece quando o LiveKit avisa que o
participante caiu, e é justamente esse aviso que não chega quando a entrada
trava no meio: o registro fica preso e toda entrada nova é recusada com
`AlreadyConnected`.

O `join_call` aceita `force_disconnect`, que limparia tudo — mas bots são
explicitamente proibidos de usá-lo:

```rust
if user.bot.is_some() && force_disconnect == Some(true) {
    return Err(create_error!(IsBot));
}
```

Sobra um caminho: `PATCH /servers/{s}/members/{u}` com
`remove: ["VoiceChannel"]`, que chama `voice_client.remove_user(...)`. Ele
exige **MoveMembers**, exceto quando o alvo é quem pede:

```rust
if member.id.user != user.id {
    permissions.throw_if_lacking_channel_permission(ChannelPermission::MoveMembers)?;
}
```

Ou seja: **o bot pode desconectar a si mesmo, sem permissão nenhuma**. É o que
`&tts destravar` faz, e o que o `&tts entrar` tenta sozinho antes de desistir.

⚠️ **HTTP 200 não é prova.** Essa rota só manda o LiveKit remover o
participante; quem apaga o registro (`delete_voice_state`) é o webhook que o
LiveKit dispara depois. Se o participante já não existe lá, o LiveKit responde
"ok" sem fazer nada e o registro permanece.

**E o `join_call` não serve de verificação:** ele não é um teste, é uma entrada
de verdade — cria a sala e devolve token. Usá-lo para "conferir" plantava
exatamente o estado que se queria remover, uma vez por servidor.

### O ciclo vicioso

`join_call` **não** cria o registro de voz: quem cria é o LiveKit, quando o
participante conecta de fato. Então, quando o `revoice.join()` pendura, ele
**já conectou** — a conexão fica viva do lado do LiveKit, o Stoat passa a
registrar o bot na call, e a nossa camada desiste no timeout. A tentativa
seguinte bate em `AlreadyConnected` causado pela anterior, e cada tentativa
planta o obstáculo da próxima. Era por isso que "deixar quieto" resolvia: a
conexão morria de inatividade.

Três medidas quebram o ciclo:

1. **Limpeza preventiva** — sem conexão local, o bot pede a desconexão antes de
   tentar entrar. Custa uma requisição e evita o `AlreadyConnected` inteiro.
2. **Limpeza pós-falha** — toda entrada que estoura o timeout limpa o registro
   que ela mesma deixou.
3. **Desligar limpo** — `SIGTERM`/`SIGINT` saem de todas as calls antes de
   encerrar. Não cobre queda de energia, mas cobre reinício e deploy.

Sobrando o problema: **use outra call** (o bloqueio é por canal, e bots podem
estar em várias) ou `&tts resgatar`, abaixo.

### `&tts resgatar`: a porta dos fundos

Quando nem a limpeza resolve, o registro preso é o conjunto `vc:{bot}` do
Redis do Stoat — e **nenhuma rota que o bot alcança o apaga**:

| Caminho | Lê | Apaga `vc:{bot}`? |
|---|---|---|
| `PATCH members remove VoiceChannel` (`destravar`) | chave `{bot}:{servidor}` | só via webhook `participant_left` |
| remover pelo cliente (MoveMembers) | a mesma rota acima | idem |
| kick + readicionar (`member_remove`) | a mesma chave | idem |
| `join_call` com `force_disconnect` | `vc:{bot}` direto | **proibido para bots** (`IsBot`) |

Só o webhook `participant_left` do LiveKit limpa — e ele exige que o bot
esteja **de fato** na sala para sair dela. Ciclo fechado.

A brecha é o **mover**: `PATCH /servers/{s}/members/{eu}` com
`voice_channel: <call>` chama `create_token` direto, **sem**
`raise_if_in_voice` (`member_edit.rs`). O token vem pelo WebSocket no evento
`UserMoveVoiceChannel { node, from, to, token }`. Pré-requisito: estar numa
call do **mesmo** servidor (a chave `{bot}:{servidor}` precisa existir).

**`&tts entrar` faz o roteiro inteiro sozinho** quando o serviço devolve
`AlreadyConnected` (que agora é imediato: o `join_call` de abrir a sala já
recusa, e o serviço não espera os 20s do revoice para dizer o mesmo).
`&tts resgatar [#call-auxiliar]` é a versão manual, para escolher a auxiliar:

1. entra numa call auxiliar do servidor — a indicada, ou as outras em ordem
   (com gente dentro primeiro), **pulando as que também estiverem presas**;
   cada presa custa ~1s graças ao curto-circuito acima;
2. espera o Stoat listar o bot nela (`voiceParticipants`);
3. faz o PATCH de mover para a call presa e captura o token do evento;
4. chama `POST /entrar-com-token` do `voz-servico`, que intercepta o
   `join_call` interno do revoice só para aquele canal e conecta com o token.

De participante real, o registro do Stoat e o do serviço voltam a bater; a
leitura já começa na call resgatada. Precisa da **versão 11** do `voz-servico`.

### `&tts resgatar`: quando o registro preso não aponta para nada

O `AlreadyConnected` de bot é um `SISMEMBER vc:{bot} "{canal}-{servidor}"`
(`voice/mod.rs`, `raise_if_in_voice`). Já o `destravar` lê **outra chave**:

```rust
if let Some(channel) = get_user_voice_channel_in_server(&target_user.id, &server.id).await? {
    // chave `{bot}:{servidor}` — uma só por servidor, sobrescrita a cada entrada
    voice_client.remove_user(&node, &user.id, &channel).await?;
};
Ok(Json(member.into()))   // 200 com ou sem efeito
```

Quando `{bot}:{servidor}` já não existe (bots podem estar em várias calls, e a
chave é uma só: entrar noutra call do mesmo servidor e sair dela a apaga), o
`destravar` devolve 200 sem tocar em nada. **Kick não ajuda**: `member_remove`
lê a mesma chave. `force_disconnect` limparia tudo, mas é proibido para bots.
O conjunto `vc:{bot}` só é limpo pelo webhook `participant_left` — que exige
estar de fato numa sala do LiveKit.

A brecha é o **mover**: `PATCH /servers/{s}/members/{eu}` com
`voice_channel: <call>` chama `create_token` direto, sem `raise_if_in_voice`, e
entrega o token pelo WebSocket no evento `UserMoveVoiceChannel { node, from,
to, token }`. Pré-requisito: estar numa call do mesmo servidor (a chave precisa
existir). Daí o roteiro do `&tts resgatar [#call-auxiliar]`:

1. entra numa call auxiliar do servidor (`POST /entrar` normal);
2. espera o Stoat listar o bot nela (`voiceParticipants`);
3. faz o PATCH de mover para a call presa e captura o token em
   `client.events.on("event")`;
4. `POST /entrar-com-token` no serviço, que intercepta o `join_call` interno do
   `revoice.join()` só para esse canal e conecta com o token recebido.

De participante real, o estado do Stoat volta a bater com o do bot; a leitura
já começa na call resgatada. Se o PATCH responder `NotConnected`, o webhook
`participant_joined` não foi processado do lado deles — não há o que fazer
daqui além de esperar.

### `UnknownNode`: a call que ainda não existe

```rust
let existing_node = get_channel_node(channel.id()).await?;
let node = existing_node.or(node).ok_or_else(|| create_error!(UnknownNode))?;
```

O Stoat só sabe em qual servidor de voz (*node*) uma call está **depois** que
alguém a inicia. Antes disso, quem entra precisa informar o node no corpo do
`join_call` — e o `revoice.join()` não informa. Pior: ao receber o erro, ele
não rejeita a promessa, apenas nunca resolve, o que virava 20 s de silêncio
seguidos de timeout, sem pista alguma no meio.

O serviço agora descobre os nodes disponíveis em `GET /`
(`features.livekit.nodes`) e **abre a sala informando o node** antes de
delegar ao revoice. A partir daí o Stoat lembra dele e o join funciona.
`VOZ_NODE_LIVEKIT` no `.env` fixa uma região, se quiser.

💡 Mesmo assim, **entrar na call antes de chamar o bot** continua sendo o
caminho mais tranquilo.
A mesma rota, com `voice_channel: <novo canal>` em vez de `remove`, **move** o
bot entre calls — daí `&tts entrar` numa call diferente funcionar como "vem
para cá" em vez de dar `AlreadyConnected`. O move só enxerga a call de origem
dentro do mesmo servidor; entre servidores, o caminho é desconectar e entrar.
Se nem isso resolver, alguém com **MoveMembers** remove o bot da call pelo
cliente — é a única outra forma de derrubar um participante preso.

### Sair custa os cargos, não o XP

Cargo pertence ao **membro**: quem sai — por vontade própria, kick ou ban —
deixa de ser membro, e o Stoat retira os cargos. O **XP fica guardado** no
banco, com o nível.

O problema é que o cargo só era concedido no instante do *level up*. Alguém que
voltasse no nível 14 continuaria sem cargo nenhum até chegar ao 15 — semanas
depois, com toda a aparência de ter perdido o progresso.

Agora:

- **quem entra** recebe de volta, sozinho, todos os cargos que o nível atual já
  garante (inclusive marcos antigos, não só o mais recente);
- **`&xp sincronizar`** conserta quem já tinha voltado antes disso, e também
  serve quando você cria os cargos depois de o pessoal já ter subido de nível;
- **subir vários níveis de uma vez** (multiplicador alto, XP dado pelo admin)
  concede todos os marcos alcançados, não apenas o último.

Cargos apagados à mão no servidor são ignorados na sincronização — um ID morto
faria a atualização inteira do membro falhar.

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

O caminho do banco vem de `DB_PATH`. **Aponte para um diretório fixo**: o padrão
é relativo ao lugar de onde o `node` foi executado, então rodar de outra pasta
criaria um banco novo e vazio — com o antigo intacto, mas invisível.

---

## Instalação e serviço (OpenRC)

O bot roda direto com Node. Não há imagem nem container: o Gentoo já tem
supervisão de serviço, e uma camada a mais só acrescentaria lugares onde a
configuração pode se perder — foi exatamente o que aconteceu enquanto havia
Docker no caminho.

### Primeira instalação

```bash
cd ~/Downloads/github
npm install --omit=dev
cp .env.example .env
nano .env                        # BOT_TOKEN, OLLAMA_URL, modelos
mkdir -p dados                   # onde o banco vai morar
node scripts/verificar-build.js  # confere que o repositório está íntegro
node main.js                     # teste em primeiro plano
```

### Como serviço

```bash
sudo cp scripts/openrc/stoat-bot /etc/init.d/stoat-bot
sudo chmod +x /etc/init.d/stoat-bot
sudo cp scripts/openrc/stoat-bot.confd /etc/conf.d/stoat-bot
sudo nano /etc/conf.d/stoat-bot          # usuário, diretório e caminho do node
sudo rc-update add stoat-bot default
sudo rc-service stoat-bot start
tail -f /var/log/stoat-bot.log
```

O mesmo para o serviço de ferramentas, se estiver na mesma máquina:

```bash
sudo cp scripts/openrc/judy-ia /etc/init.d/judy-ia
sudo chmod +x /etc/init.d/judy-ia
sudo cp scripts/openrc/judy-ia.confd /etc/conf.d/judy-ia
sudo rc-update add judy-ia default
sudo rc-service judy-ia start
```

### Atualizar

```bash
cd ~/Downloads/github
git pull
npm install --omit=dev              # só se package.json mudou
node scripts/verificar-build.js     # falha aqui é melhor que falha no start
sudo rc-service stoat-bot restart
```

### Variáveis principais

| Variável | Padrão | Descrição |
|---|---|---|
| `BOT_TOKEN` | — | **obrigatória** — token do bot |
| `DB_PATH` | `./stoat.db` | banco SQLite — use caminho absoluto ou fixe o diretório |
| `OLLAMA_URL` | `http://localhost:11434` | ⚠️ o padrão aponta para a própria máquina |
| `IA_SERVICO_URL` | — | judy-ia; sem ele, a IA fica sem ferramentas |
| `OLLAMA_MODEL_LEVE` | — | modelo de conversa (fica residente na VRAM) |
| `TZ` | — | fuso dos horários no log |

A lista completa está no `.env.example`, comentada.

> O `.env` é lido do **diretório de onde o node foi executado**. O serviço
> OpenRC define `directory=` e resolve isso; rodando à mão, faça `cd` no
> projeto antes. O boot imprime a configuração de IA em uso — se algo não
> chegou, aparece ali.

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
│   │   ├── membros.js          # contar/listar membros (cache compartilhado)
│   │   ├── midia.js            # validação de URL de imagem (anti-SSRF, avisos)
│   │   ├── fusos.js            # busca de fuso por cidade (base ICU do Node)
│   │   ├── abreviacoes.js      # expande escrita de chat antes do TTS
│   │   ├── paginas.js          # embeds em páginas navegadas por reação ◀ ▶ (&help, &tutorial)
│   │   ├── aliases.js          # comandos e subcomandos nos dois idiomas (entrada e exibição)
│   │   ├── ids.js              # resolve menção/link/ID/nome de canal, cargo e usuário
│   │   └── log.js              # chat de logs configurável (&log)
│   ├── moderacao/              # moderação e automod
│   │   ├── automod-engine.js   # motor: runAutomod, punição, blocklist, spam
│   │   ├── automod-comandos.js # configuração do automod
│   │   ├── scorecard.js        # pontuação 0–10 (Sentinela)
│   │   ├── caracteres.js       # anti-zalgo/invisíveis e anti-repetição
│   │   ├── ban-global.js       # lista global de banimentos
│   │   ├── comandos-admin.js   # &comando, &cargomudo
│   │   ├── config-comando.js   # &config (panorama)
│   │   ├── limpar.js           # &limpar
│   │   ├── embed.js            # &embed
│   │   ├── debug-comando.js    # &debug (diagnóstico)
│   │   ├── tutorial.js         # &tutorial — guia de primeiros passos em páginas
│   │   ├── assistente.js       # &assistente — configuração guiada (pergunta → resumo → aplica)
│   │   ├── help-grupos.js      # a árvore do &help por intenção (começar, proteger…)
│   │   ├── help-parametros.js  # o que cada parâmetro de cada comando significa
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
│   │   ├── boas-vindas.js      # embeds de entrada e saída (&boasvindas, &adeus)
│   │   ├── tts.js              # &tts — a Judy fala nas calls
│   │   ├── tts-filtro.js       # peneira: o que NÃO vale a pena falar na call
│   │   └── rss.js              # notícias com resumo da Judy (&rss)
│   ├── game/                   # RPG
│   │   └── game.js             # &game — personagem, 9 atributos, progressão
│   └── economia/               # reservado para o futuro
├── voz-servico/                # judy-voz: LiveKit + Piper (nativo no Gentoo)
│   ├── servidor.js             # HTTP: /saude, /entrar, /entrar-com-token, /sair, /falar, /reiniciar, /diagnostico, /destravar
│   ├── voz.js                  # entra na call e publica áudio (revoice.js)
│   └── tts.js                  # síntese (Piper) e efeitos (ffmpeg)
├── ia-servico/                 # serviço de IA (ferramentas + tool-calling)
│   ├── servidor.js             # HTTP: /chat, /saude, /ferramentas
│   └── ferramentas/            # calcular, ler_codigo, buscar_web, buscar_rss
├── ia-stack/                   # stack de IA legada (superada pelo ia-servico)
├── scripts/
│   ├── deploy-stoat.sh         # deploy seguro (copie para ~/ e rode de lá)openrc/             # serviços do OpenRC (bot e judy-ia)
├── .env.example                # modelo de configuração
└── .github/workflows/build.yml # build multi-arch → GHCR
```

---

## Licença

MIT (veja `LICENSE`). As dependências (`stoat.js`, `dotenv`) são permissivas.
