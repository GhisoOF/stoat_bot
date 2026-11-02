# Política de privacidade da Judy · Judy's privacy policy · Política de privacidad de Judy

[Português](#português) · [English](#english) · [Español](#español)

_Última atualização / Last updated / Última actualización: 2 nov 2026._

---

## Português

A Judy é um bot de moderação e utilidades para o Stoat (com IA só na moderação). Esta
política vale para a instância oficial, mantida pelo autor do projeto (GhisoOF). Quem
roda a sua própria Judy é responsável pela própria instância e deve publicar a sua
política.

**Contato:** [issues do repositório](https://github.com/GhisoOF/stoat_bot/issues).

### O que a Judy guarda, e por quanto tempo

| O quê | Quando | Por quanto tempo |
|---|---|---|
| Avisos e punições | quando a moderação de um servidor age | enquanto forem relevantes (os avisos zeram depois de 30 dias sem um novo) |
| Silêncio por causa do perfil: o servidor, a conta, **quais partes** do perfil apitaram (ex. "bio") e o motivo — nunca o conteúdo | quando o filtro de perfil silencia alguém | até a pessoa trocar o que apitou (no máximo 28 dias) |
| **Casos duvidosos com a staff do servidor**: o servidor, a pessoa, o canal e a mensagem (ou a parte do perfil, ex. "bio"), a categoria, a nota do detector, uma impressão/hash (uma assinatura que não permite reconstruir o texto nem a imagem) e o alerta enviado à staff | quando a moderação automática fica em dúvida (certeza média ou baixa, ou dois detectores discordam): ninguém é punido e a staff **daquele servidor** recebe um alerta com ✅/❌ no canal de alertas do sentinela (sem ele, no canal de log; sem nenhum dos dois, nada é enviado nem guardado) | esperando a staff: no máximo **14 dias**. Julgado: a pessoa, o canal, a mensagem e o alerta saem na hora; fica só a impressão/hash, a categoria, o tipo, a nota, o veredito, o servidor e as datas — vale só naquele servidor; ficam só os 500 mais recentes de cada servidor e categoria, e tudo sai 30 dias depois de a Judy sair dele. O alerta em si fica no canal do servidor (é do Stoat) |
| **Amostra diária do dono do bot**: o servidor, a pessoa, o canal e a mensagem, a categoria, a nota do detector, o que o bot fez, um trecho de até 300 caracteres e, se for imagem, o link de origem dela no Stoat e um hash perceptual | só numa **amostra aleatória pequena de todos os servidores**, com decisões punidas, alertadas à staff e não punidas (no máximo 3 por servidor por dia). O resto **não é guardado** | trecho e link: **7 dias** — com 7 dias, a mensagem do caso na DM do dono é editada para tirar o trecho e o link. Caso não julgado: **14 dias**. Amostra não escolhida para o dia: apagada na mesma noite. Caso julgado: depois de 7 dias fica só a impressão/hash, a categoria, a nota e o veredito — sem pessoa nem servidor (nem o código/pseudônimo dele) |
| Lista global de bans (ID, nome, motivo, servidor de origem) | quando alguém é banido em **qualquer** servidor que tenha a Judy. Os outros servidores veem só "banido em N servidores" e a data — nunca o motivo nem de qual servidor; ban automático do automod só gera alerta | enquanto for relevante; sai quando o servidor de origem remove a Judy |
| XP e nível (a contagem de mensagens, não o texto) | só nos servidores que **ligaram** o XP — a Judy avisa ao ligar, e `&privacidade xp sair` deixa você de fora | até você sair, apagar, ou o servidor zerar |
| Saldo da economia | quando **você** usa a economia | até você apagar (`&privacidade apagar`) ou o servidor zerar |
| Palavras usadas como comando que não existe: só a palavra normalizada, por servidor e mês (sem quem digitou nem a mensagem), no máximo 200 por servidor; e quantas vezes cada comando é usado (sem servidor nem pessoa). Só o dono do bot vê, para descobrir comandos que faltam | quando alguém digita o prefixo com uma palavra | **30 dias** (as palavras) |
| Tickets (quem abriu, motivo, situação) e a transcrição, enviada ao canal de log de tickets do servidor ao fechar | quando você abre um ticket | enquanto o servidor tiver a Judy |
| Configuração do servidor (canais, cargos, módulos) | sempre | até 30 dias depois de a Judy sair do servidor |
| Relatório de ataques ao operador | só se o servidor **aderir** (`&config log relatorio on`), e **anônimo**: o servidor vira um código, e só entram bans, punições, raids e imagens suspeitas — sem nomes, IDs nem conversa. Nos servidores do próprio operador, o relatório é completo. Sai do código (sem modelo de IA nem trecho de conversa) e chega ao operador por **mensagem privada com a Judy**, nunca num canal | 48 horas |
| Log técnico do bot (eventos e erros, com os IDs trocados por **pseudônimos**). O filtro do automod não grava o conteúdo; trechos curtos das mensagens e dos comandos só entram com a depuração ligada pelo dono do bot (`&automod debug`, desligada por padrão) | sempre | tamanho limitado — os mais antigos saem primeiro |
| Imagens de teste que o dono do bot envia na DM com a Judy (`&bateria`): só o link do anexo no Stoat, a categoria que ele dá e os metadados do anexo que o Stoat informa (nome, tipo, tamanho, largura e altura) — **nunca a imagem**: a Judy não baixa nem copia; o programa de teste da moderação de imagem do dono lê esses links num arquivo ao lado do banco e abre cada imagem no Stoat na hora | só quando o dono do bot manda imagens com `&bateria` na DM com a Judy (no máximo 5000) | até o dono remover (`&bateria remover` ou `limpar`) |
| Comandos do dono do bot num servidor que não é dele | quando ele usa um comando ali, ou age nele pela DM com a Judy (os comandos só dele — painel, lista global, lista de bloqueio, amostra, imagens de teste — só funcionam na DM; os que mexem num servidor recebem o ID dele) | vão para o **canal de log daquele servidor**, para a staff ver |
| Cópias de segurança do banco | a cada atualização do bot | **30 dias** |

Em 2 nov 2026 a conversa com a Judy e o RPG saíram, e os dados deles foram apagados do
banco nessa atualização: a memória da IA, o histórico da conversa, os fatos, o perfil
mapeado, os pedidos de silêncio e as respostas ao pedido de memória; e todos os
personagens, itens, moedas, aliados, ofertas e duelos do RPG, de todas as eras. A
contagem do teto de imagens geradas (um arquivo ao lado do banco) é apagada na primeira
subida. As cópias de segurança de antes saem no prazo delas (30 dias).

### O que a Judy lê e não guarda

- **Mensagens**, para o automod e a moderação por IA dos servidores que as ligaram. Com
  os temas proibidos ligados, a Judy guarda as últimas mensagens de cada canal (até 12,
  dos últimos 15 minutos, até 300 caracteres cada) só na memória do processo; quando a
  nota de uma mensagem passa do limiar, o juiz (o modelo local) lê a mensagem e até 8
  dessas anteriores, com quem escreveu trocado por uma letra (A, B…). Nada vai ao banco.
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

### Para onde os dados vão

- A IA da instância oficial (só na moderação: o juiz dos temas proibidos e a visão das
  imagens e do perfil) roda **na máquina do operador** (modelo local); nada vai a
  empresas ou serviços de IA de fora.
- Quando o DNS da máquina falha, os nomes dos sites consultados vão a um DNS público
  (Cloudflare/Google).
- Música: o link ou o nome pedido vai ao YouTube, SoundCloud ou Spotify. A conta do
  operador só é usada quando um vídeo pede confirmação de idade.
- A Judy lê os feeds RSS que o servidor cadastrou (`&rss`).
- Webhooks: o que um serviço de fora (GitHub, Crafty…) manda ao gancho é publicado no
  canal escolhido pela staff, sem menções em massa nem links disfarçados.
- A bateria de teste do dono do bot pode mandar resumos à DM dele por um canal interno da
  máquina (só dentro do container, com chave; ele liga e desliga com `&bateria avisos`), sem
  dados de usuários: a bateria usa mensagens e imagens de teste.
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
  ele pode exportar não tem nome, ID de pessoa nem de servidor (imagem só como hash). Os
  comandos do dono do bot (`&caso`, `&servidores`, `&bateria`, os dele no `&banglobal` e
  na lista de bloqueio) só funcionam na DM com a Judy. O caso fica pelo prazo acima; com
  `&privacidade apagar`, sai dele a sua conta, o canal, a mensagem, o trecho, o link e o
  código do servidor, e a mensagem do caso na DM do dono é editada para tirar o trecho e
  o link. Num desenho feito de caracteres no perfil, o trecho é só um resumo em números
  e o idioma do texto ao lado, **nunca o desenho** nem o texto.
- Nada é vendido nem usado para anúncios.

### Seus direitos

- `&privacidade` — o que a Judy guarda sobre você, e o link desta política.
- `&privacidade xp sair` — o seu XP neste servidor é apagado e para de contar
  (`&privacidade xp voltar` volta a contar, do zero).
- `&privacidade apagar` — apaga **tudo** o que é seu (XP e saldo), em todos os
  servidores, tira você dos casos da amostra do dono do bot e apaga os casos duvidosos
  seus que ainda esperam a staff de um servidor. Ficam só os registros de moderação dos
  servidores; para esses, fale com a staff do servidor ou com o operador.

---

## English

Judy is a moderation and utility bot for Stoat (with AI only in moderation). This policy
covers the official instance, run by the project's author (GhisoOF). Anyone running
their own Judy is responsible for that instance and should publish their own policy.

**Contact:** [repository issues](https://github.com/GhisoOF/stoat_bot/issues).

### What Judy keeps, and for how long

| What | When | For how long |
|---|---|---|
| Warnings and punishments | when a server's moderation acts | while relevant (warnings reset after 30 days without a new one) |
| Timeout because of the profile: the server, the account, **which parts** of the profile were flagged (e.g. "bio") and the reason — never the content | when the profile filter silences someone | until the person changes what was flagged (28 days at most) |
| **Doubtful cases with the server's staff**: the server, the person, the channel and the message (or the part of the profile, e.g. "bio"), the category, the detector's score, a fingerprint/hash (a signature that can't rebuild the text or the image) and the alert sent to the staff | when automatic moderation is unsure (medium or low certainty, or two detectors disagree): nobody is punished and the staff **of that server** gets an alert with ✅/❌ in the sentinel's alert channel (without one, in the log channel; without either, nothing is sent or kept) | waiting for the staff: **14 days** at most. Judged: the person, the channel, the message and the alert are removed right away; only the fingerprint/hash, the category, the type, the score, the verdict, the server and the dates remain — it only counts on that server; only the 500 most recent per server and category are kept, and everything goes 30 days after Judy leaves it. The alert itself stays in the server's channel (it's Stoat's) |
| **Bot owner's daily sample**: the server, the person, the channel and the message, the category, the detector's score, what the bot did, an excerpt of up to 300 characters and, for images, the image's original Stoat link and a perceptual hash | only in a **small random sample from every server**, with punished, staff-alerted and unpunished decisions (at most 3 per server per day). The rest **isn't kept** | excerpt and link: **7 days** — at 7 days, the case's message in the owner's DM is edited to remove the excerpt and the link. Unjudged case: **14 days**. Sample not picked for the day: deleted that same night. Judged case: after 7 days only the fingerprint/hash, the category, the score and the verdict remain — no person, no server (not even its code/pseudonym) |
| Global ban list (ID, name, reason, origin server) | when someone is banned on **any** server that has Judy. Other servers only see "banned on N servers" and the date — never the reason or which server; an automod automatic ban only raises an alert | while relevant; removed when the origin server removes Judy |
| XP and level (the message count, not the text) | only on servers that **turned XP on** — Judy announces it, and `&privacy xp leave` keeps you out | until you leave, delete it, or the server resets it |
| Economy balance | when **you** use the economy | until you delete it (`&privacy delete`) or the server resets it |
| Words used as a command that doesn't exist: only the normalized word, per server and month (not who typed it nor the message), at most 200 per server; and how many times each command is used (no server or person). Only the bot owner sees it, to find missing commands | when someone types the prefix with a word | **30 days** (the words) |
| Tickets (who opened, reason, status) and the transcript, sent to the server's ticket log channel on close | when you open a ticket | while the server has Judy |
| Server configuration (channels, roles, modules) | always | until 30 days after Judy leaves the server |
| Attack report to the operator | only if the server **opts in** (`&config log report on`), and **anonymous**: the server becomes a code, and only bans, punishments, raids and suspicious images go in — no names, IDs or conversation. On the operator's own servers, the report is complete. It comes from the code (no AI model, no conversation excerpts) and reaches the operator by **direct message with Judy**, never in a channel | 48 hours |
| Bot technical log (events and errors, with IDs replaced by **pseudonyms**). The automod filter doesn't record content; short excerpts of messages and commands only go in with debugging turned on by the bot owner (`&automod debug`, off by default) | always | size-capped — the oldest goes first |
| Test images the bot owner sends in their DM with Judy (`&testset`): only the attachment's Stoat link, the category they give and the attachment's metadata as Stoat reports it (name, type, size, width and height) — **never the image**: Judy doesn't download or copy it; the owner's image moderation test program reads those links from a file next to the database and opens each image on Stoat when it runs | only when the bot owner sends images with `&testset` in their DM with Judy (at most 5000) | until the owner removes them (`&testset remove` or `clear`) |
| The bot owner's commands on a server that isn't theirs | when they use a command there, or act on it from their DM with Judy (their own commands — panel, global list, blocklist, sample, test images — only work in that DM; the ones that change a server take its ID) | go to **that server's log channel**, for its staff to see |
| Database backups | on each bot update | **30 days** |

On 2 Nov 2026 chatting with Judy and the RPG were removed, and their data was deleted
from the database in that update: the AI memory, the chat history, the facts, the
mapped profiles, the silence requests and the answers to the memory request; and every
RPG character, item, coin, ally, offer and duel, from every era. The generated-image
cap count (a file next to the database) is deleted on the first start. The backups from
before go after their usual period (30 days).

### What Judy reads and doesn't keep

- **Messages**, for the automod and AI moderation on servers that enabled them. With
  banned topics on, Judy keeps each channel's latest messages (up to 12, from the last
  15 minutes, up to 300 characters each) only in the process memory; when a message's
  score passes the threshold, the judge (the local model) reads the message and up to 8
  of those before it, with whoever wrote each one replaced by a letter (A, B…). Nothing
  goes to the database.
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

### Where data goes

- The official instance's AI (only in moderation: the banned-topics judge and the vision
  for images and profiles) runs **on the operator's machine** (local model); nothing
  goes to outside AI companies or services.
- When the machine's DNS fails, the names of the sites looked up go to a public DNS
  (Cloudflare/Google).
- Music: the requested link or name goes to YouTube, SoundCloud or Spotify. The
  operator's account is only used when a video asks for age confirmation.
- Judy reads the RSS feeds the server added (`&rss`).
- Webhooks: what an outside service (GitHub, Crafty…) sends to the hook is posted in the
  channel the staff chose, without mass mentions or disguised links.
- The bot owner's test set may send summaries to their DM through a channel internal to the
  machine (only inside the container, with a key; they turn it on and off with
  `&testset alerts`), with no user data: the test set uses test messages and images.
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
  as a hash). The bot owner's commands (`&caso`, `&servidores`, `&bateria`, their
  `&banglobal` and blocklist ones) only work in the DM with Judy. A case stays for the
  period above; with `&privacy delete`, your account, the channel, the message, the
  excerpt, the link and the server's code are removed from it, and the case's message in
  the owner's DM is edited to remove the excerpt and the link. For a drawing made of
  characters in a profile, the excerpt is only a summary in numbers and the language of
  the text next to it, **never the drawing** or the text.
- Nothing is sold or used for ads.

### Your rights

- `&privacy` — what Judy keeps about you, and a link to this policy.
- `&privacy xp leave` — your XP on this server is erased and stops counting
  (`&privacy xp back` starts counting again, from zero).
- `&privacy delete` — erases **everything** that's yours (XP and balance) on every
  server, removes you from the cases in the bot owner's sample and deletes your doubtful
  cases still waiting for a server's staff. Only the servers' moderation records stay;
  for those, talk to the server's staff or to the operator.

---

## Español

Judy es un bot de moderación y utilidades para Stoat (con IA solo en la moderación).
Esta política vale para la instancia oficial, mantenida por el autor del proyecto
(GhisoOF). Quien ejecuta su propia Judy es responsable de esa instancia y debe publicar
su propia política.

**Contacto:** [issues del repositorio](https://github.com/GhisoOF/stoat_bot/issues).

### Lo que Judy guarda, y por cuánto tiempo

| Qué | Cuándo | Por cuánto tiempo |
|---|---|---|
| Advertencias y sanciones | cuando la moderación de un servidor actúa | mientras sean relevantes (las advertencias se reinician tras 30 días sin una nueva) |
| Silencio por el perfil: el servidor, la cuenta, **qué partes** del perfil se detectaron (p. ej. "bio") y el motivo — nunca el contenido | cuando el filtro de perfil silencia a alguien | hasta que la persona cambie lo detectado (28 días como máximo) |
| **Casos dudosos con el staff del servidor**: el servidor, la persona, el canal y el mensaje (o la parte del perfil, p. ej. "bio"), la categoría, la nota del detector, una huella/hash (una firma que no permite reconstruir el texto ni la imagen) y la alerta enviada al staff | cuando la moderación automática duda (certeza media o baja, o dos detectores no coinciden): nadie es castigado y el staff **de ese servidor** recibe una alerta con ✅/❌ en el canal de alertas del centinela (sin él, en el canal de log; sin ninguno de los dos, no se envía ni se guarda nada) | esperando al staff: **14 días** como máximo. Juzgado: la persona, el canal, el mensaje y la alerta salen al momento; solo quedan la huella/hash, la categoría, el tipo, la nota, el veredicto, el servidor y las fechas — vale solo en ese servidor; se guardan solo los 500 más recientes de cada servidor y categoría, y todo sale 30 días después de que Judy salga de él. La alerta en sí se queda en el canal del servidor (es de Stoat) |
| **Muestra diaria del dueño del bot**: el servidor, la persona, el canal y el mensaje, la categoría, la nota del detector, lo que hizo el bot, un fragmento de hasta 300 caracteres y, si es una imagen, su enlace de origen en Stoat y un hash perceptual | solo en una **muestra aleatoria pequeña de todos los servidores**, con decisiones castigadas, alertadas al staff y no castigadas (como máximo 3 por servidor al día). El resto **no se guarda** | fragmento y enlace: **7 días** — a los 7 días, el mensaje del caso en el DM del dueño se edita para quitar el fragmento y el enlace. Caso sin juzgar: **14 días**. Muestra no elegida para el día: se borra esa misma noche. Caso juzgado: después de 7 días solo quedan la huella/hash, la categoría, la nota y el veredicto — sin persona ni servidor (ni su código/seudónimo) |
| Lista global de bans (ID, nombre, motivo, servidor de origen) | cuando alguien es baneado en **cualquier** servidor que tenga a Judy. Los demás servidores solo ven "baneado en N servidores" y la fecha — nunca el motivo ni de qué servidor; el ban automático del automod solo genera una alerta | mientras sea relevante; sale cuando el servidor de origen quita a Judy |
| XP y nivel (el conteo de mensajes, no el texto) | solo en los servidores que **activaron** el XP — Judy lo anuncia, y `&privacidad xp salir` te deja fuera | hasta que salgas, lo borres, o el servidor lo reinicie |
| Saldo de la economía | cuando **tú** usas la economía | hasta que lo borres (`&privacidad borrar`) o el servidor lo reinicie |
| Palabras usadas como comando que no existe: solo la palabra normalizada, por servidor y mes (sin quién la escribió ni el mensaje), como máximo 200 por servidor; y cuántas veces se usa cada comando (sin servidor ni persona). Solo el dueño del bot lo ve, para descubrir comandos que faltan | cuando alguien escribe el prefijo con una palabra | **30 días** (las palabras) |
| Tickets (quién abrió, motivo, estado) y la transcripción, enviada al canal de log de tickets del servidor al cerrar | cuando abres un ticket | mientras el servidor tenga a Judy |
| Configuración del servidor (canales, roles, módulos) | siempre | hasta 30 días después de que Judy salga del servidor |
| Informe de ataques al operador | solo si el servidor **se adhiere** (`&config log informe on`), y **anónimo**: el servidor se vuelve un código, y solo entran bans, sanciones, raids e imágenes sospechosas — sin nombres, IDs ni conversación. En los servidores del propio operador, el informe es completo. Sale del código (sin modelo de IA ni fragmentos de conversación) y llega al operador por **mensaje privado con Judy**, nunca en un canal | 48 horas |
| Log técnico del bot (eventos y errores, con los IDs cambiados por **seudónimos**). El filtro del automod no guarda el contenido; fragmentos cortos de los mensajes y de los comandos solo entran con la depuración activada por el dueño del bot (`&automod debug`, desactivada por defecto) | siempre | tamaño limitado — los más antiguos salen primero |
| Imágenes de prueba que el dueño del bot envía por DM a Judy (`&bateria`): solo el enlace del adjunto en Stoat, la categoría que él da y los metadatos del adjunto que informa Stoat (nombre, tipo, tamaño, ancho y alto) — **nunca la imagen**: Judy no la descarga ni la copia; el programa de prueba de la moderación de imágenes del dueño lee esos enlaces en un archivo junto a la base de datos y abre cada imagen en Stoat en el momento | solo cuando el dueño del bot envía imágenes con `&bateria` por DM a Judy (como máximo 5000) | hasta que el dueño las quite (`&bateria quitar` o `vaciar`) |
| Comandos del dueño del bot en un servidor que no es suyo | cuando usa un comando allí, o actúa en él desde su DM con Judy (sus propios comandos — panel, lista global, lista de bloqueo, muestra, imágenes de prueba — solo funcionan en ese DM; los que cambian un servidor reciben su ID) | van al **canal de log de ese servidor**, para que su staff lo vea |
| Copias de seguridad de la base de datos | en cada actualización del bot | **30 días** |

El 2 nov 2026 la conversación con Judy y el RPG salieron, y sus datos se borraron de la
base de datos en esa actualización: la memoria de la IA, el historial de la
conversación, los datos aprendidos, los perfiles mapeados, las peticiones de silencio y
las respuestas a la petición de memoria; y todos los personajes, objetos, monedas,
aliados, ofertas y duelos del RPG, de todas las eras. El conteo del tope de imágenes
generadas (un archivo junto a la base de datos) se borra en el primer arranque. Las
copias de seguridad de antes salen en su plazo (30 días).

### Lo que Judy lee y no guarda

- **Mensajes**, para el automod y la moderación por IA de los servidores que los
  activaron. Con los temas prohibidos activados, Judy guarda los últimos mensajes de
  cada canal (hasta 12, de los últimos 15 minutos, hasta 300 caracteres cada uno) solo
  en la memoria del proceso; cuando la nota de un mensaje pasa del umbral, el juez (el
  modelo local) lee el mensaje y hasta 8 de esos anteriores, con quien escribió
  cambiado por una letra (A, B…). Nada va a la base de datos.
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

### A dónde van los datos

- La IA de la instancia oficial (solo en la moderación: el juez de los temas prohibidos
  y la visión de imágenes y perfiles) corre **en la máquina del operador** (modelo
  local); nada va a empresas ni servicios de IA de fuera.
- Cuando el DNS de la máquina falla, los nombres de los sitios consultados van a un DNS
  público (Cloudflare/Google).
- Música: el enlace o el nombre pedido va a YouTube, SoundCloud o Spotify. La cuenta del
  operador solo se usa cuando un vídeo pide confirmar la edad.
- Judy lee los feeds RSS que el servidor registró (`&rss`).
- Webhooks: lo que un servicio externo (GitHub, Crafty…) envía al gancho se publica en el
  canal que eligió el staff, sin menciones masivas ni enlaces disfrazados.
- La batería de prueba del dueño del bot puede enviar resúmenes a su DM por un canal interno
  de la máquina (solo dentro del contenedor, con clave; él lo activa y desactiva con
  `&bateria avisos`), sin datos de usuarios: la batería usa mensajes e imágenes de prueba.
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
  servidores (imágenes solo como hash). Los comandos del dueño del bot (`&caso`,
  `&servidores`, `&bateria`, los suyos del `&banglobal` y de la lista de bloqueo) solo
  funcionan por DM con Judy. El caso se queda por el plazo de arriba; con `&privacidad
  borrar`, salen de él tu cuenta, el canal, el mensaje, el fragmento, el enlace y el
  código del servidor, y el mensaje del caso en el DM del dueño se edita para quitar el
  fragmento y el enlace. En un dibujo hecho con caracteres en el perfil, el fragmento es
  solo un resumen en números y el idioma del texto de al lado, **nunca el dibujo** ni el
  texto.
- Nada se vende ni se usa para anuncios.

### Tus derechos

- `&privacidad` — lo que Judy guarda sobre ti, y el enlace a esta política.
- `&privacidad xp salir` — tu XP en este servidor se borra y deja de contar
  (`&privacidad xp volver` vuelve a contarlo, desde cero).
- `&privacidad borrar` — borra **todo** lo tuyo (XP y saldo) en todos los servidores, te
  saca de los casos de la muestra del dueño del bot y borra tus casos dudosos que aún
  esperan al staff de un servidor. Solo quedan los registros de moderación de los
  servidores; para esos, habla con el staff del servidor o con el operador.
