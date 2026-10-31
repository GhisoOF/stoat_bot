# Política de privacidade da Judy · Judy's privacy policy · Política de privacidad de Judy

[Português](#português) · [English](#english) · [Español](#español)

_Última atualização / Last updated / Última actualización: 31 out 2026._

---

## Português

A Judy é um bot de moderação, utilidades, IA e RPG para o Stoat. Esta política vale
para a instância oficial, mantida pelo autor do projeto (GhisoOF). Quem roda a sua
própria Judy é responsável pela própria instância e deve publicar a sua política.

**Contato:** [issues do repositório](https://github.com/GhisoOF/stoat_bot/issues).

### O que a Judy guarda, e por quanto tempo

| O quê | Quando | Por quanto tempo |
|---|---|---|
| **Memória da IA** (fatos do que você diz **a ela** — menção, resposta a ela ou o nome "Judy" —, memória geral). Ela não guarda o que você conversa com outras pessoas nem fatos sobre terceiros | só se **você aceitou** — ela pergunta na primeira conversa | até você desligar (`&privacidade memoria off`) ou apagar |
| Pedido de silêncio (`&chat sair`): só a sua conta e a data | quando **você** pede | até você desfazer (`&chat voltar`) |
| Perfil (bio/status do seu cartão) | só quando **você mesmo** usa `&chat mapear` | até você apagar |
| Histórico da conversa com a IA | quando você fala com ela (para não perder o fio) | **24 horas** |
| Fio do canal e respostas lembradas (só na memória do processo) | quando a IA está ligada no servidor | **30 minutos** |
| Avisos e punições | quando a moderação de um servidor age | enquanto forem relevantes (os avisos zeram depois de 30 dias sem um novo) |
| Lista global de bans (ID, nome, motivo, servidor de origem) | quando alguém é banido em **qualquer** servidor que tenha a Judy. Os outros servidores veem só "banido em N servidores" e a data — nunca o motivo nem de qual servidor; ban automático do automod só gera alerta | enquanto for relevante; sai quando o servidor de origem remove a Judy |
| XP e nível (a contagem de mensagens, não o texto) | só nos servidores que **ligaram** o XP — a Judy avisa ao ligar, e `&xp sair` deixa você de fora | até você sair, apagar, ou o servidor zerar |
| Saldo da economia, personagem do RPG | quando **você** usa esses comandos | até você apagar |
| Tickets (quem abriu, motivo, situação) e a transcrição, enviada ao canal de log de tickets do servidor ao fechar | quando você abre um ticket | enquanto o servidor tiver a Judy |
| Configuração do servidor (canais, cargos, módulos) | sempre | até 30 dias depois de a Judy sair do servidor |
| Relatório de ataques ao operador | só se o servidor **aderir** (`&log relatorio on`), e **anônimo**: o servidor vira um código, e só entram bans, punições, raids e imagens suspeitas — sem nomes, IDs nem conversa. Nos servidores do próprio operador, o relatório é completo | 48 horas |
| Log técnico do bot (eventos, erros e trechos curtos de mensagens dirigidas à Judy, com os IDs trocados por **pseudônimos**). O filtro do automod não grava o conteúdo | sempre | tamanho limitado — os mais antigos saem primeiro |
| Comandos do dono do bot num servidor que não é dele | quando ele usa um comando ali | vão para o **canal de log daquele servidor**, para a staff ver |
| Cópias de segurança do banco | a cada atualização do bot | **30 dias** |

### O que a Judy lê e não guarda

- **Mensagens**, para o automod e a moderação por IA dos servidores que as ligaram, e
  para entender a conversa quando você fala com ela (os últimos minutos do canal, só na
  memória do processo).
- **Imagens e fotos de perfil**, quando um servidor liga os filtros de imagem ou de
  avatar: um modelo de visão descreve a imagem; nada é guardado (só o resultado de cada
  foto de perfil, por 6 horas, para não analisar a mesma foto de novo).
- **Voz nas calls**: o texto lido em voz alta (TTS) não é guardado.
- Para frear spam, a Judy conta por alguns minutos quantas vezes cada pessoa falou com
  ela e guarda um resumo do texto da última pergunta (só na memória do processo).

### Para onde os dados vão

- A IA da instância oficial roda **na máquina do operador** (modelo local), sem enviar
  conversas a empresas de IA.
- Não existe modo de IA "online": nenhuma conversa vai a um serviço de IA de fora.
- Quando a conversa precisa de uma **busca na web**, o texto da busca vai a um buscador
  (via SearXNG). A busca automática **não pesquisa pessoas**: nomes saem da consulta, e
  pergunta sobre alguém ("onde mora…", "telefone de…") não vira busca.
- Quando o DNS da máquina falha, os nomes dos sites consultados vão a um DNS público
  (Cloudflare/Google).
- Música: o link ou o nome pedido vai ao YouTube, SoundCloud ou Spotify. A conta do
  operador só é usada quando um vídeo pede confirmação de idade.
- A IA lê o próprio código no GitHub e os feeds RSS que o servidor cadastrou (`&rss`).
- Webhooks: o que um serviço de fora (GitHub, Crafty…) manda ao gancho é publicado no
  canal escolhido pela staff, sem menções em massa nem links disfarçados.
- O que a Judy escreve nos canais (inclusive o canal de log de um servidor) fica no
  próprio Stoat.
- Nada é vendido nem usado para anúncios.

### Seus direitos

- `&privacidade` — o que a Judy guarda sobre você, e o link desta política.
- `&privacidade memoria on|off` — liga ou desliga a memória; desligar apaga o que ela sabia.
- `&chat sair` — a Judy não conversa com você em nenhum servidor, e o que você escreve não
  vai para a IA (`&chat voltar` desfaz). O chat de cada servidor também começa desligado:
  é a staff que o liga (`&chat on`).
- `&privacidade apagar` — apaga **tudo** o que é seu (memória da IA, XP, saldo, RPG), em
  todos os servidores. Ficam só os registros de moderação dos servidores; para esses,
  fale com a staff do servidor ou com o operador. O que é de **outro** jogador fica com
  ele, sem você: uma proposta de troca que alguém fez a você é cancelada (o item volta a
  quem propôs), e o companheiro que você trocou continua com o novo dono.
- `&chat esquecer tudo` — a staff apaga a memória da IA **deste** servidor; a de outros
  servidores fica.

---

## English

Judy is a moderation, utility, AI and RPG bot for Stoat. This policy covers the
official instance, run by the project's author (GhisoOF). Anyone running their own Judy
is responsible for that instance and should publish their own policy.

**Contact:** [repository issues](https://github.com/GhisoOF/stoat_bot/issues).

### What Judy keeps, and for how long

| What | When | For how long |
|---|---|---|
| **AI memory** (facts from what you say **to her** — a mention, a reply to her or the name "Judy" —, general memory). She doesn't keep what you talk about with other people nor facts about third parties | only if **you agreed** — she asks in your first conversation | until you turn it off (`&privacy memory off`) or delete it |
| Silence request (`&chat optout`): only your account and the date | when **you** ask | until you undo it (`&chat optin`) |
| Profile (bio/status from your card) | only when **you** use `&chat mapear` on yourself | until you delete it |
| AI conversation history | when you talk to her (so she keeps the thread) | **24 hours** |
| Channel thread and remembered replies (process memory only) | when the AI is on for the server | **30 minutes** |
| Warnings and punishments | when a server's moderation acts | while relevant (warnings reset after 30 days without a new one) |
| Global ban list (ID, name, reason, origin server) | when someone is banned on **any** server that has Judy. Other servers only see "banned on N servers" and the date — never the reason or which server; an automod automatic ban only raises an alert | while relevant; removed when the origin server removes Judy |
| XP and level (the message count, not the text) | only on servers that **turned XP on** — Judy announces it, and `&xp leave` keeps you out | until you leave, delete it, or the server resets it |
| Economy balance, RPG character | when **you** use those commands | until you delete it |
| Tickets (who opened, reason, status) and the transcript, sent to the server's ticket log channel on close | when you open a ticket | while the server has Judy |
| Server configuration (channels, roles, modules) | always | until 30 days after Judy leaves the server |
| Attack report to the operator | only if the server **opts in** (`&log report on`), and **anonymous**: the server becomes a code, and only bans, punishments, raids and suspicious images go in — no names, IDs or conversation. On the operator's own servers, the report is complete | 48 hours |
| Bot technical log (events, errors and short excerpts of messages addressed to Judy, with IDs replaced by **pseudonyms**). The automod filter doesn't record content | always | size-capped — the oldest goes first |
| The bot owner's commands on a server that isn't theirs | when they use a command there | go to **that server's log channel**, for its staff to see |
| Database backups | on each bot update | **30 days** |

### What Judy reads and doesn't keep

- **Messages**, for the automod and AI moderation on servers that enabled them, and to
  follow the conversation when you talk to her (the channel's last few minutes, in the
  process memory only).
- **Images and profile pictures**, when a server enables the image or avatar filters: a
  vision model describes the image; nothing is kept (only each profile picture's result,
  for 6 hours, so the same picture isn't analyzed again).
- **Voice in calls**: text read aloud (TTS) isn't kept.
- To curb spam, Judy counts for a few minutes how many times each person talked to her
  and keeps a digest of the last question's text (only in the process memory).

### Where data goes

- The official instance's AI runs **on the operator's machine** (local model), without
  sending conversations to AI companies.
- There is no "online" AI mode: no conversation goes to an outside AI service.
- When a conversation needs a **web search**, the search text goes to a search engine
  (through SearXNG). The automatic search **doesn't look people up**: names are removed
  from the query, and a question about someone ("where does … live", "…'s phone")
  doesn't become a search.
- When the machine's DNS fails, the names of the sites looked up go to a public DNS
  (Cloudflare/Google).
- Music: the requested link or name goes to YouTube, SoundCloud or Spotify. The
  operator's account is only used when a video asks for age confirmation.
- The AI reads its own code on GitHub and the RSS feeds the server registered (`&rss`).
- Webhooks: what an outside service (GitHub, Crafty…) sends to the hook is posted in the
  channel the staff chose, without mass mentions or disguised links.
- What Judy writes in channels (including a server's log channel) stays on Stoat.
- Nothing is sold or used for ads.

### Your rights

- `&privacy` — what Judy keeps about you, and a link to this policy.
- `&privacy memory on|off` — turns the memory on or off; off erases what she knew.
- `&chat optout` — Judy won't chat with you on any server, and what you write doesn't go
  to the AI (`&chat optin` undoes it). Each server's chat also starts off: the staff
  turns it on (`&chat on`).
- `&privacy delete` — erases **everything** that's yours (AI memory, XP, balance, RPG) on
  every server. Only the servers' moderation records stay; for those, talk to the
  server's staff or to the operator. What belongs to **another** player stays with them,
  without you: a trade offer someone made to you is cancelled (the item goes back to
  them), and a companion you traded away stays with its new owner.
- `&chat forget all` — the staff erases the AI memory of **this** server; other servers'
  memory stays.

---

## Español

Judy es un bot de moderación, utilidades, IA y RPG para Stoat. Esta política vale para
la instancia oficial, mantenida por el autor del proyecto (GhisoOF). Quien ejecuta su
propia Judy es responsable de esa instancia y debe publicar su propia política.

**Contacto:** [issues del repositorio](https://github.com/GhisoOF/stoat_bot/issues).

### Lo que Judy guarda, y por cuánto tiempo

| Qué | Cuándo | Por cuánto tiempo |
|---|---|---|
| **Memoria de la IA** (datos de lo que le dices **a ella** — una mención, una respuesta a ella o el nombre "Judy" —, memoria general). No guarda lo que hablas con otras personas ni datos sobre terceros | solo si **aceptaste** — lo pregunta en la primera conversación | hasta que la desactives (`&privacidad memoria off`) o la borres |
| Petición de silencio (`&chat salir`): solo tu cuenta y la fecha | cuando **tú** lo pides | hasta que lo deshagas (`&chat volver`) |
| Perfil (bio/estado de tu tarjeta) | solo cuando **tú mismo** usas `&chat mapear` | hasta que lo borres |
| Historial de la conversación con la IA | cuando hablas con ella (para no perder el hilo) | **24 horas** |
| Hilo del canal y respuestas recordadas (solo en la memoria del proceso) | cuando la IA está activada en el servidor | **30 minutos** |
| Advertencias y sanciones | cuando la moderación de un servidor actúa | mientras sean relevantes (las advertencias se reinician tras 30 días sin una nueva) |
| Lista global de bans (ID, nombre, motivo, servidor de origen) | cuando alguien es baneado en **cualquier** servidor que tenga a Judy. Los demás servidores solo ven "baneado en N servidores" y la fecha — nunca el motivo ni de qué servidor; el ban automático del automod solo genera una alerta | mientras sea relevante; sale cuando el servidor de origen quita a Judy |
| XP y nivel (el conteo de mensajes, no el texto) | solo en los servidores que **activaron** el XP — Judy lo anuncia, y `&xp salir` te deja fuera | hasta que salgas, lo borres, o el servidor lo reinicie |
| Saldo de la economía, personaje del RPG | cuando **tú** usas esos comandos | hasta que lo borres |
| Tickets (quién abrió, motivo, estado) y la transcripción, enviada al canal de log de tickets del servidor al cerrar | cuando abres un ticket | mientras el servidor tenga a Judy |
| Configuración del servidor (canales, roles, módulos) | siempre | hasta 30 días después de que Judy salga del servidor |
| Informe de ataques al operador | solo si el servidor **se adhiere** (`&log informe on`), y **anónimo**: el servidor se vuelve un código, y solo entran bans, sanciones, raids e imágenes sospechosas — sin nombres, IDs ni conversación. En los servidores del propio operador, el informe es completo | 48 horas |
| Log técnico del bot (eventos, errores y fragmentos cortos de mensajes dirigidos a Judy, con los IDs cambiados por **seudónimos**). El filtro del automod no guarda el contenido | siempre | tamaño limitado — los más antiguos salen primero |
| Comandos del dueño del bot en un servidor que no es suyo | cuando usa un comando allí | van al **canal de log de ese servidor**, para que su staff lo vea |
| Copias de seguridad de la base de datos | en cada actualización del bot | **30 días** |

### Lo que Judy lee y no guarda

- **Mensajes**, para el automod y la moderación por IA de los servidores que los
  activaron, y para seguir la conversación cuando hablas con ella (los últimos minutos
  del canal, solo en la memoria del proceso).
- **Imágenes y fotos de perfil**, cuando un servidor activa los filtros de imagen o de
  avatar: un modelo de visión describe la imagen; no se guarda nada (solo el resultado de
  cada foto de perfil, durante 6 horas, para no analizar otra vez la misma foto).
- **Voz en las llamadas**: el texto leído en voz alta (TTS) no se guarda.
- Para frenar el spam, Judy cuenta durante unos minutos cuántas veces habló cada persona
  con ella y guarda un resumen del texto de la última pregunta (solo en la memoria del proceso).

### A dónde van los datos

- La IA de la instancia oficial se ejecuta **en la máquina del operador** (modelo
  local), sin enviar conversaciones a empresas de IA.
- No existe un modo de IA "online": ninguna conversación va a un servicio de IA externo.
- Cuando la conversación necesita una **búsqueda en la web**, el texto de la búsqueda
  va a un buscador (a través de SearXNG). La búsqueda automática **no busca personas**:
  los nombres salen de la consulta, y una pregunta sobre alguien ("dónde vive…",
  "teléfono de…") no se convierte en búsqueda.
- Cuando el DNS de la máquina falla, los nombres de los sitios consultados van a un DNS
  público (Cloudflare/Google).
- Música: el enlace o el nombre pedido va a YouTube, SoundCloud o Spotify. La cuenta del
  operador solo se usa cuando un vídeo pide confirmar la edad.
- La IA lee su propio código en GitHub y los feeds RSS que el servidor registró (`&rss`).
- Webhooks: lo que un servicio externo (GitHub, Crafty…) envía al gancho se publica en el
  canal que eligió el staff, sin menciones masivas ni enlaces disfrazados.
- Lo que Judy escribe en los canales (incluido el canal de log de un servidor) queda en
  el propio Stoat.
- Nada se vende ni se usa para anuncios.

### Tus derechos

- `&privacidad` — lo que Judy guarda sobre ti, y el enlace a esta política.
- `&privacidad memoria on|off` — activa o desactiva la memoria; desactivarla borra lo que sabía.
- `&chat salir` — Judy no conversará contigo en ningún servidor, y lo que escribas no irá
  a la IA (`&chat volver` lo deshace). El chat de cada servidor también empieza
  desactivado: lo activa el staff (`&chat on`).
- `&privacidad borrar` — borra **todo** lo tuyo (memoria de la IA, XP, saldo, RPG) en
  todos los servidores. Solo quedan los registros de moderación de los servidores; para
  esos, habla con el staff del servidor o con el operador. Lo que es de **otro** jugador
  queda con él, sin ti: una propuesta de intercambio que alguien te hizo se cancela (el
  objeto vuelve a quien la hizo), y el compañero que cambiaste sigue con su nuevo dueño.
- `&chat olvidar todo` — el staff borra la memoria de la IA de **este** servidor; la de
  otros servidores se queda.
