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
| **Memória da IA** (fatos do que você diz **a ela** — menção, resposta a ela ou o nome "Judy" —, memória geral). Ela não guarda o que você conversa com outras pessoas nem fatos sobre terceiros. O que ela aprende num servidor só volta nas conversas **daquele** servidor | só se **você aceitou** — ela pergunta na primeira conversa | até você desligar (`&privacidade memoria off`) ou apagar |
| Pedido de silêncio (`&privacidade chat sair`): só a sua conta e a data | quando **você** pede | até você desfazer (`&privacidade chat voltar`) |
| Perfil (bio/status do seu cartão) | só quando **você mesmo** usa `&privacidade mapear` | até você apagar |
| Histórico da conversa com a IA | quando você fala com ela (para não perder o fio) | **24 horas** |
| Fio do canal e respostas lembradas (só na memória do processo) | quando a IA está ligada no servidor | **30 minutos** |
| Avisos e punições | quando a moderação de um servidor age | enquanto forem relevantes (os avisos zeram depois de 30 dias sem um novo) |
| Silêncio por causa do perfil: o servidor, a conta, **quais partes** do perfil apitaram (ex. "bio") e o motivo — nunca o conteúdo | quando o filtro de perfil silencia alguém | até a pessoa trocar o que apitou (no máximo 28 dias) |
| **Casos duvidosos com a staff do servidor**: o servidor, a pessoa, o canal e a mensagem (ou a parte do perfil, ex. "bio"), a categoria, a nota do detector, uma impressão/hash (uma assinatura que não permite reconstruir o texto nem a imagem) e o alerta enviado à staff | quando a moderação automática fica em dúvida (certeza média ou baixa, ou dois detectores discordam): ninguém é punido e a staff **daquele servidor** recebe um alerta com ✅/❌ no canal de alertas do sentinela (sem ele, no canal de log; sem nenhum dos dois, nada é enviado nem guardado) | esperando a staff: no máximo **14 dias**. Julgado: a pessoa, o canal, a mensagem e o alerta saem na hora; fica só a impressão/hash, a categoria, o tipo, a nota, o veredito, o servidor e as datas — vale só naquele servidor; ficam só os 500 mais recentes de cada servidor e categoria, e tudo sai 30 dias depois de a Judy sair dele. O alerta em si fica no canal do servidor (é do Stoat) |
| **Amostra diária do dono do bot**: o servidor, a pessoa, o canal e a mensagem, a categoria, a nota do detector, o que o bot fez, um trecho de até 300 caracteres e, se for imagem, o link de origem dela no Stoat e um hash perceptual | só numa **amostra aleatória pequena de todos os servidores**, com decisões punidas, alertadas à staff e não punidas (no máximo 3 por servidor por dia). O resto **não é guardado** | trecho e link: **7 dias** — com 7 dias, a mensagem do caso na DM do dono é editada para tirar o trecho e o link. Caso não julgado: **14 dias**. Amostra não escolhida para o dia: apagada na mesma noite. Caso julgado: depois de 7 dias fica só a impressão/hash, a categoria, a nota e o veredito — sem pessoa nem servidor (nem o código/pseudônimo dele) |
| Lista global de bans (ID, nome, motivo, servidor de origem) | quando alguém é banido em **qualquer** servidor que tenha a Judy. Os outros servidores veem só "banido em N servidores" e a data — nunca o motivo nem de qual servidor; ban automático do automod só gera alerta | enquanto for relevante; sai quando o servidor de origem remove a Judy |
| XP e nível (a contagem de mensagens, não o texto) | só nos servidores que **ligaram** o XP — a Judy avisa ao ligar, e `&privacidade xp sair` deixa você de fora | até você sair, apagar, ou o servidor zerar |
| Saldo da economia, personagem do RPG | quando **você** usa esses comandos | até você apagar (`&game apagar` apaga o personagem atual; `&privacidade apagar`, os de todas as eras) |
| Personagem do RPG de antes do recomeço de 31 out 2026 (era v4) | já existia | guardado, invisível ao jogo. A remoção está prevista para **29 jan 2027**, numa atualização do bot; antes disso, só pelo `&privacidade apagar` |
| Contagem do teto diário de imagens geradas: só o dia, o ID do servidor e quantas foram pedidas (nada de quem pediu nem do que pediu) | quando alguém pede uma imagem | até o dia seguinte |
| Palavras usadas como comando que não existe: só a palavra normalizada, por servidor e mês (sem quem digitou nem a mensagem), no máximo 200 por servidor; e quantas vezes cada comando é usado (sem servidor nem pessoa). Só o dono do bot vê, para descobrir comandos que faltam | quando alguém digita o prefixo com uma palavra | **30 dias** (as palavras) |
| Tickets (quem abriu, motivo, situação) e a transcrição, enviada ao canal de log de tickets do servidor ao fechar | quando você abre um ticket | enquanto o servidor tiver a Judy |
| Configuração do servidor (canais, cargos, módulos) | sempre | até 30 dias depois de a Judy sair do servidor |
| Relatório de ataques ao operador | só se o servidor **aderir** (`&config log relatorio on`), e **anônimo**: o servidor vira um código, e só entram bans, punições, raids e imagens suspeitas — sem nomes, IDs nem conversa. Nos servidores do próprio operador, o relatório é completo | 48 horas |
| Log técnico do bot (eventos, erros e trechos curtos de mensagens dirigidas à Judy, com os IDs trocados por **pseudônimos**). O filtro do automod não grava o conteúdo | sempre | tamanho limitado — os mais antigos saem primeiro |
| Comandos do dono do bot num servidor que não é dele | quando ele usa um comando ali | vão para o **canal de log daquele servidor**, para a staff ver |
| Cópias de segurança do banco | a cada atualização do bot | **30 dias** |

### O que a Judy lê e não guarda

- **Mensagens**, para o automod e a moderação por IA dos servidores que as ligaram, e
  para entender a conversa quando você fala com ela (os últimos minutos do canal, só na
  memória do processo).
- **Imagens**, quando um servidor liga o filtro de imagens: um modelo de visão (na
  máquina do operador) descreve a imagem; nada é guardado.
- **O perfil de quem entra ou troca o perfil**, nos servidores com o filtro de perfil
  ligado (`&automod sentinela avatar`): a foto (a do perfil e a do servidor), o banner,
  a bio, o nome de exibição, o apelido e o status. O texto passa pelo mesmo filtro das
  mensagens e por uma checagem de desenho feito de caracteres (braille, blocos); a foto
  e o banner, pelo modelo de visão e por uma impressão da imagem (um número de 64 bits
  que não permite reconstruí-la). Nome, status e fotos vêm do que o Stoat já manda à
  Judy; a bio e o banner, do aviso de troca do Stoat e, quando alguém entra, de **uma**
  consulta ao perfil. Nada disso vai para o banco, exceto os casos duvidosos com a staff
  e a amostra do dono (ver as linhas acima); o resto fica só na memória do processo,
  para não analisar de novo — a bio e o banner por 6 horas, o resultado de cada imagem
  por 6 horas, a impressão da imagem por 24 horas. A Judy nunca republica a imagem nem o
  texto do perfil: a staff recebe só o que apitou e a descrição do modelo.
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
- Os **casos duvidosos** ficam com a staff do servidor onde aconteceram: o alerta, com
  ✅/❌, vai só ao canal da staff daquele servidor e nunca republica a imagem, o desenho
  nem o texto do perfil (vale a menção à pessoa, o canal, o ID da mensagem e a descrição
  do modelo). Só conta a reação de quem modera ali: ✅ aplica a ação do módulo, e o log
  do servidor diz quem decidiu; ❌ não pune ninguém. O que a staff decide ensina a Judy
  só naquele servidor (casos parecidos e o limiar dali) e nunca vai ao dono do bot; um
  ban aplicado pelo ✅ entra na lista global de bans, como qualquer ban. As punições
  manuais da staff não vão para o dono do bot.
- A **amostra diária** chega só ao dono do bot, por mensagem privada com a Judy — nunca
  num canal. O servidor aparece como um código (pseudônimo); a imagem nunca é copiada
  nem reenviada: ele a abre pelo link de origem no Stoat. Até 10 casos por dia. O
  veredito dele só mede o acerto e calibra o padrão global da moderação, sem modelo novo
  — nunca age sobre ninguém nem muda o que a staff de um servidor decidiu. O arquivo que
  ele pode exportar não tem nome, ID de pessoa nem de servidor (imagem só como hash). O
  `&caso` (o comando do dono) só funciona na DM com a Judy. O caso fica pelo prazo
  acima; com `&privacidade apagar`, sai dele a sua conta, o canal, a mensagem, o trecho,
  o link e o código do servidor, e a mensagem do caso na DM do dono é editada para tirar
  o trecho e o link. Num desenho feito de caracteres no perfil, o trecho é só um resumo
  em números e o idioma do texto ao lado, **nunca o desenho** nem o texto.
- Nada é vendido nem usado para anúncios.

### Seus direitos

- `&privacidade` — o que a Judy guarda sobre você, e o link desta política.
- `&privacidade memoria on|off` — liga ou desliga a memória; desligar apaga o que ela sabia.
- `&privacidade chat sair` — a Judy não conversa com você em nenhum servidor, e o que você
  escreve não vai para a IA (`&privacidade chat voltar` desfaz). A conversa de cada
  servidor também começa desligada: é a staff que a liga (`&config ia`).
- `&privacidade xp sair` — o seu XP neste servidor é apagado e para de contar.
- `&privacidade esquecer` — a Judy esquece o que sabe de você **neste** servidor.
- `&privacidade apagar` — apaga **tudo** o que é seu (memória da IA, XP, saldo, RPG), em
  todos os servidores, inclusive os personagens do RPG de todas as eras, tira você dos
  casos da amostra do dono do bot e apaga os casos duvidosos seus que ainda esperam a
  staff de um servidor. Ficam só os registros de moderação dos servidores; para esses,
  fale com a staff do servidor ou com o operador. Os desafios de duelo ligados a você
  são cancelados; quem desafiou você recebe a aposta de volta.
- `&privacidade esquecer tudo` — a staff apaga a memória da IA **deste** servidor; a de
  outros servidores fica.
- A personalidade da Judy é uma só, definida pelo operador: nenhum texto escrito num
  servidor vai ao modelo como personalidade.

---

## English

Judy is a moderation, utility, AI and RPG bot for Stoat. This policy covers the
official instance, run by the project's author (GhisoOF). Anyone running their own Judy
is responsible for that instance and should publish their own policy.

**Contact:** [repository issues](https://github.com/GhisoOF/stoat_bot/issues).

### What Judy keeps, and for how long

| What | When | For how long |
|---|---|---|
| **AI memory** (facts from what you say **to her** — a mention, a reply to her or the name "Judy" —, general memory). She doesn't keep what you talk about with other people nor facts about third parties. What she learns on a server only comes back in **that** server's conversations | only if **you agreed** — she asks in your first conversation | until you turn it off (`&privacy memory off`) or delete it |
| Silence request (`&privacy chat leave`): only your account and the date | when **you** ask | until you undo it (`&privacy chat back`) |
| Profile (bio/status from your card) | only when **you** use `&privacy map` on yourself | until you delete it |
| AI conversation history | when you talk to her (so she keeps the thread) | **24 hours** |
| Channel thread and remembered replies (process memory only) | when the AI is on for the server | **30 minutes** |
| Warnings and punishments | when a server's moderation acts | while relevant (warnings reset after 30 days without a new one) |
| Timeout because of the profile: the server, the account, **which parts** of the profile were flagged (e.g. "bio") and the reason — never the content | when the profile filter silences someone | until the person changes what was flagged (28 days at most) |
| **Doubtful cases with the server's staff**: the server, the person, the channel and the message (or the part of the profile, e.g. "bio"), the category, the detector's score, a fingerprint/hash (a signature that can't rebuild the text or the image) and the alert sent to the staff | when automatic moderation is unsure (medium or low certainty, or two detectors disagree): nobody is punished and the staff **of that server** gets an alert with ✅/❌ in the sentinel's alert channel (without one, in the log channel; without either, nothing is sent or kept) | waiting for the staff: **14 days** at most. Judged: the person, the channel, the message and the alert are removed right away; only the fingerprint/hash, the category, the type, the score, the verdict, the server and the dates remain — it only counts on that server; only the 500 most recent per server and category are kept, and everything goes 30 days after Judy leaves it. The alert itself stays in the server's channel (it's Stoat's) |
| **Bot owner's daily sample**: the server, the person, the channel and the message, the category, the detector's score, what the bot did, an excerpt of up to 300 characters and, for images, the image's original Stoat link and a perceptual hash | only in a **small random sample from every server**, with punished, staff-alerted and unpunished decisions (at most 3 per server per day). The rest **isn't kept** | excerpt and link: **7 days** — at 7 days, the case's message in the owner's DM is edited to remove the excerpt and the link. Unjudged case: **14 days**. Sample not picked for the day: deleted that same night. Judged case: after 7 days only the fingerprint/hash, the category, the score and the verdict remain — no person, no server (not even its code/pseudonym) |
| Global ban list (ID, name, reason, origin server) | when someone is banned on **any** server that has Judy. Other servers only see "banned on N servers" and the date — never the reason or which server; an automod automatic ban only raises an alert | while relevant; removed when the origin server removes Judy |
| XP and level (the message count, not the text) | only on servers that **turned XP on** — Judy announces it, and `&privacy xp leave` keeps you out | until you leave, delete it, or the server resets it |
| Economy balance, RPG character | when **you** use those commands | until you delete it (`&game delete` erases the current character; `&privacy delete`, those from every era) |
| RPG character from before the 31 Oct 2026 restart (era v4) | already existed | kept, invisible to the game. Its removal is planned for **29 Jan 2027**, in a bot update; before that, only through `&privacy delete` |
| Daily image cap count: only the day, the server ID and how many were requested (nothing about who asked or what) | when someone asks for an image | until the next day |
| Words used as a command that doesn't exist: only the normalized word, per server and month (not who typed it nor the message), at most 200 per server; and how many times each command is used (no server or person). Only the bot owner sees it, to find missing commands | when someone types the prefix with a word | **30 days** (the words) |
| Tickets (who opened, reason, status) and the transcript, sent to the server's ticket log channel on close | when you open a ticket | while the server has Judy |
| Server configuration (channels, roles, modules) | always | until 30 days after Judy leaves the server |
| Attack report to the operator | only if the server **opts in** (`&config log report on`), and **anonymous**: the server becomes a code, and only bans, punishments, raids and suspicious images go in — no names, IDs or conversation. On the operator's own servers, the report is complete | 48 hours |
| Bot technical log (events, errors and short excerpts of messages addressed to Judy, with IDs replaced by **pseudonyms**). The automod filter doesn't record content | always | size-capped — the oldest goes first |
| The bot owner's commands on a server that isn't theirs | when they use a command there | go to **that server's log channel**, for its staff to see |
| Database backups | on each bot update | **30 days** |

### What Judy reads and doesn't keep

- **Messages**, for the automod and AI moderation on servers that enabled them, and to
  follow the conversation when you talk to her (the channel's last few minutes, in the
  process memory only).
- **Images**, when a server enables the image filter: a vision model (on the operator's
  machine) describes the image; nothing is kept.
- **The profile of whoever joins or changes their profile**, on servers with the profile
  filter on (`&automod sentinel avatar`): the picture (profile and server picture), the
  banner, the bio, the display name, the nickname and the status. The text goes through
  the same filter as messages and a check for drawings made of characters (braille,
  blocks); the picture and the banner through the vision model and an image fingerprint
  (a 64-bit number that can't rebuild the image). Name, status and pictures come from
  what Stoat already sends Judy; the bio and the banner from Stoat's change notice and,
  when someone joins, from **one** profile lookup. None of it goes to the database,
  except the doubtful cases with the staff and the owner's sample (see the rows above);
  the rest stays only in the process memory, so it isn't analysed twice — the bio and
  banner for 6 hours, each image's result for 6 hours, the image fingerprint for 24
  hours. Judy never reposts the image or the profile text: the staff only gets what was
  flagged and the model's description.
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
- **Doubtful cases** stay with the staff of the server where they happened: the alert,
  with ✅/❌, goes only to that server's staff channel and never reposts the image, the
  drawing or the profile text (it has the mention of the person, the channel, the
  message ID and the model's description). Only a reaction from someone who moderates
  there counts: ✅ applies the module's action, and the server's log says who decided; ❌
  punishes no one. What the staff decides only teaches Judy on that server (similar
  cases and its threshold) and never goes to the bot owner; a ban applied by the ✅
  enters the global ban list, like any ban. The staff's manual punishments don't go to
  the bot owner.
- The **daily sample** only reaches the bot owner, by direct message with Judy — never
  in a channel. The server shows up as a code (pseudonym); images are never copied or
  re-sent: the owner opens them through their original Stoat link. Up to 10 cases a day.
  The owner's verdict only measures accuracy and calibrates moderation's global default,
  with no new model — it never acts on anyone or changes what a server's staff decided.
  The file the owner can export has no names, no user IDs and no server IDs (images only
  as a hash). `&caso` (the owner's command) only works in the DM with Judy. A case stays
  for the period above; with `&privacy delete`, your account, the channel, the message,
  the excerpt, the link and the server's code are removed from it, and the case's
  message in the owner's DM is edited to remove the excerpt and the link. For a drawing
  made of characters in a profile, the excerpt is only a summary in numbers and the
  language of the text next to it, **never the drawing** or the text.
- Nothing is sold or used for ads.

### Your rights

- `&privacy` — what Judy keeps about you, and a link to this policy.
- `&privacy memory on|off` — turns the memory on or off; off erases what she knew.
- `&privacy chat leave` — Judy won't chat with you on any server, and what you write
  doesn't go to the AI (`&privacy chat back` undoes it). Each server's chat also starts
  off: the staff turns it on (`&config ia`).
- `&privacy xp leave` — your XP on this server is erased and stops counting.
- `&privacy forget` — Judy forgets what she knows about you on **this** server.
- `&privacy delete` — erases **everything** that's yours (AI memory, XP, balance, RPG)
  on every server, including RPG characters from every era, removes you from the cases
  in the bot owner's sample and deletes your doubtful cases still waiting for a server's
  staff. Only the servers' moderation records stay; for those, talk to the server's
  staff or to the operator. Duel challenges involving you are cancelled; whoever
  challenged you gets the bet back.
- `&privacy forget all` — the staff erases the AI memory of **this** server; other
  servers' memory stays.
- Judy has a single personality, set by the operator: no text written on a server goes
  to the model as a personality.

---

## Español

Judy es un bot de moderación, utilidades, IA y RPG para Stoat. Esta política vale para
la instancia oficial, mantenida por el autor del proyecto (GhisoOF). Quien ejecuta su
propia Judy es responsable de esa instancia y debe publicar su propia política.

**Contacto:** [issues del repositorio](https://github.com/GhisoOF/stoat_bot/issues).

### Lo que Judy guarda, y por cuánto tiempo

| Qué | Cuándo | Por cuánto tiempo |
|---|---|---|
| **Memoria de la IA** (datos de lo que le dices **a ella** — una mención, una respuesta a ella o el nombre "Judy" —, memoria general). No guarda lo que hablas con otras personas ni datos sobre terceros. Lo que aprende en un servidor solo vuelve en las conversaciones de **ese** servidor | solo si **aceptaste** — lo pregunta en la primera conversación | hasta que la desactives (`&privacidad memoria off`) o la borres |
| Petición de silencio (`&privacidad chat salir`): solo tu cuenta y la fecha | cuando **tú** lo pides | hasta que lo deshagas (`&privacidad chat volver`) |
| Perfil (bio/estado de tu tarjeta) | solo cuando **tú mismo** usas `&privacidad mapear` | hasta que lo borres |
| Historial de la conversación con la IA | cuando hablas con ella (para no perder el hilo) | **24 horas** |
| Hilo del canal y respuestas recordadas (solo en la memoria del proceso) | cuando la IA está activada en el servidor | **30 minutos** |
| Advertencias y sanciones | cuando la moderación de un servidor actúa | mientras sean relevantes (las advertencias se reinician tras 30 días sin una nueva) |
| Silencio por el perfil: el servidor, la cuenta, **qué partes** del perfil se detectaron (p. ej. "bio") y el motivo — nunca el contenido | cuando el filtro de perfil silencia a alguien | hasta que la persona cambie lo detectado (28 días como máximo) |
| **Casos dudosos con el staff del servidor**: el servidor, la persona, el canal y el mensaje (o la parte del perfil, p. ej. "bio"), la categoría, la nota del detector, una huella/hash (una firma que no permite reconstruir el texto ni la imagen) y la alerta enviada al staff | cuando la moderación automática duda (certeza media o baja, o dos detectores no coinciden): nadie es castigado y el staff **de ese servidor** recibe una alerta con ✅/❌ en el canal de alertas del centinela (sin él, en el canal de log; sin ninguno de los dos, no se envía ni se guarda nada) | esperando al staff: **14 días** como máximo. Juzgado: la persona, el canal, el mensaje y la alerta salen al momento; solo quedan la huella/hash, la categoría, el tipo, la nota, el veredicto, el servidor y las fechas — vale solo en ese servidor; se guardan solo los 500 más recientes de cada servidor y categoría, y todo sale 30 días después de que Judy salga de él. La alerta en sí se queda en el canal del servidor (es de Stoat) |
| **Muestra diaria del dueño del bot**: el servidor, la persona, el canal y el mensaje, la categoría, la nota del detector, lo que hizo el bot, un fragmento de hasta 300 caracteres y, si es una imagen, su enlace de origen en Stoat y un hash perceptual | solo en una **muestra aleatoria pequeña de todos los servidores**, con decisiones castigadas, alertadas al staff y no castigadas (como máximo 3 por servidor al día). El resto **no se guarda** | fragmento y enlace: **7 días** — a los 7 días, el mensaje del caso en el DM del dueño se edita para quitar el fragmento y el enlace. Caso sin juzgar: **14 días**. Muestra no elegida para el día: se borra esa misma noche. Caso juzgado: después de 7 días solo quedan la huella/hash, la categoría, la nota y el veredicto — sin persona ni servidor (ni su código/seudónimo) |
| Lista global de bans (ID, nombre, motivo, servidor de origen) | cuando alguien es baneado en **cualquier** servidor que tenga a Judy. Los demás servidores solo ven "baneado en N servidores" y la fecha — nunca el motivo ni de qué servidor; el ban automático del automod solo genera una alerta | mientras sea relevante; sale cuando el servidor de origen quita a Judy |
| XP y nivel (el conteo de mensajes, no el texto) | solo en los servidores que **activaron** el XP — Judy lo anuncia, y `&privacidad xp salir` te deja fuera | hasta que salgas, lo borres, o el servidor lo reinicie |
| Saldo de la economía, personaje del RPG | cuando **tú** usas esos comandos | hasta que lo borres (`&game borrar` borra el personaje actual; `&privacidad borrar`, los de todas las eras) |
| Personaje del RPG de antes del reinicio del 31 oct 2026 (era v4) | ya existía | guardado, invisible al juego. Su eliminación está prevista para el **29 ene 2027**, en una actualización del bot; antes de eso, solo con `&privacidad borrar` |
| Conteo del tope diario de imágenes generadas: solo el día, el ID del servidor y cuántas se pidieron (nada de quién pidió ni de qué) | cuando alguien pide una imagen | hasta el día siguiente |
| Palabras usadas como comando que no existe: solo la palabra normalizada, por servidor y mes (sin quién la escribió ni el mensaje), como máximo 200 por servidor; y cuántas veces se usa cada comando (sin servidor ni persona). Solo el dueño del bot lo ve, para descubrir comandos que faltan | cuando alguien escribe el prefijo con una palabra | **30 días** (las palabras) |
| Tickets (quién abrió, motivo, estado) y la transcripción, enviada al canal de log de tickets del servidor al cerrar | cuando abres un ticket | mientras el servidor tenga a Judy |
| Configuración del servidor (canales, roles, módulos) | siempre | hasta 30 días después de que Judy salga del servidor |
| Informe de ataques al operador | solo si el servidor **se adhiere** (`&config log informe on`), y **anónimo**: el servidor se vuelve un código, y solo entran bans, sanciones, raids e imágenes sospechosas — sin nombres, IDs ni conversación. En los servidores del propio operador, el informe es completo | 48 horas |
| Log técnico del bot (eventos, errores y fragmentos cortos de mensajes dirigidos a Judy, con los IDs cambiados por **seudónimos**). El filtro del automod no guarda el contenido | siempre | tamaño limitado — los más antiguos salen primero |
| Comandos del dueño del bot en un servidor que no es suyo | cuando usa un comando allí | van al **canal de log de ese servidor**, para que su staff lo vea |
| Copias de seguridad de la base de datos | en cada actualización del bot | **30 días** |

### Lo que Judy lee y no guarda

- **Mensajes**, para el automod y la moderación por IA de los servidores que los
  activaron, y para seguir la conversación cuando hablas con ella (los últimos minutos
  del canal, solo en la memoria del proceso).
- **Imágenes**, cuando un servidor activa el filtro de imágenes: un modelo de visión (en
  la máquina del operador) describe la imagen; no se guarda nada.
- **El perfil de quien entra o cambia su perfil**, en los servidores con el filtro de
  perfil activado (`&automod sentinela avatar`): la foto (la del perfil y la del
  servidor), el banner, la bio, el nombre visible, el apodo y el estado. El texto pasa
  por el mismo filtro que los mensajes y por una revisión de dibujos hechos con
  caracteres (braille, bloques); la foto y el banner, por el modelo de visión y por una
  huella de la imagen (un número de 64 bits que no permite reconstruirla). El nombre, el
  estado y las fotos vienen de lo que Stoat ya le envía a Judy; la bio y el banner, del
  aviso de cambio de Stoat y, cuando alguien entra, de **una** consulta al perfil. Nada
  de esto va a la base de datos, salvo los casos dudosos con el staff y la muestra del
  dueño (ver las filas de arriba); el resto queda solo en la memoria del proceso, para
  no analizarlo otra vez — la bio y el banner durante 6 horas, el resultado de cada
  imagen durante 6 horas, la huella de la imagen durante 24 horas. Judy nunca vuelve a
  publicar la imagen ni el texto del perfil: el staff recibe solo lo que se detectó y la
  descripción del modelo.
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
- Los **casos dudosos** se quedan con el staff del servidor donde ocurrieron: la alerta,
  con ✅/❌, va solo al canal del staff de ese servidor y nunca vuelve a publicar la
  imagen, el dibujo ni el texto del perfil (lleva la mención a la persona, el canal, el
  ID del mensaje y la descripción del modelo). Solo cuenta la reacción de quien modera
  allí: ✅ aplica la acción del módulo, y el log del servidor dice quién decidió; ❌ no
  castiga a nadie. Lo que decide el staff le enseña a Judy solo en ese servidor (casos
  parecidos y su umbral) y nunca va al dueño del bot; un ban aplicado por el ✅ entra en
  la lista global de bans, como cualquier ban. Los castigos manuales del staff no van al
  dueño del bot.
- La **muestra diaria** solo le llega al dueño del bot, por mensaje privado con Judy —
  nunca en un canal. El servidor aparece como un código (seudónimo); la imagen nunca se
  copia ni se reenvía: él la abre por su enlace de origen en Stoat. Hasta 10 casos al
  día. Su veredicto solo mide el acierto y calibra el valor global de la moderación, sin
  modelo nuevo — nunca actúa sobre nadie ni cambia lo que decidió el staff de un
  servidor. El archivo que puede exportar no tiene nombres, ni IDs de personas ni de
  servidores (imágenes solo como hash). El `&caso` (el comando del dueño) solo funciona
  por DM con Judy. El caso se queda por el plazo de arriba; con `&privacidad borrar`,
  salen de él tu cuenta, el canal, el mensaje, el fragmento, el enlace y el código del
  servidor, y el mensaje del caso en el DM del dueño se edita para quitar el fragmento y
  el enlace. En un dibujo hecho con caracteres en el perfil, el fragmento es solo un
  resumen en números y el idioma del texto de al lado, **nunca el dibujo** ni el texto.
- Nada se vende ni se usa para anuncios.

### Tus derechos

- `&privacidad` — lo que Judy guarda sobre ti, y el enlace a esta política.
- `&privacidad memoria on|off` — activa o desactiva la memoria; desactivarla borra lo que sabía.
- `&privacidad chat salir` — Judy no conversará contigo en ningún servidor, y lo que
  escribas no irá a la IA (`&privacidad chat volver` lo deshace). La conversación de cada
  servidor también empieza desactivada: la activa el staff (`&config ia`).
- `&privacidad xp salir` — tu XP en este servidor se borra y deja de contar.
- `&privacidad olvidar` — Judy olvida lo que sabe de ti en **este** servidor.
- `&privacidad borrar` — borra **todo** lo tuyo (memoria de la IA, XP, saldo, RPG) en
  todos los servidores, incluidos los personajes del RPG de todas las eras, te saca de
  los casos de la muestra del dueño del bot y borra tus casos dudosos que aún esperan al
  staff de un servidor. Solo quedan los registros de moderación de los servidores; para
  esos, habla con el staff del servidor o con el operador. Los desafíos de duelo en los
  que estás se cancelan; quien te desafió recibe la apuesta de vuelta.
- `&privacidad olvidar todo` — el staff borra la memoria de la IA de **este** servidor;
  la de otros servidores se queda.
- Judy tiene una sola personalidad, definida por el operador: ningún texto escrito en un
  servidor va al modelo como personalidad.
