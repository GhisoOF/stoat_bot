# Política de privacidade da Judy · Judy's privacy policy · Política de privacidad de Judy

[Português](#português) · [English](#english) · [Español](#español)

_Última atualização / Last updated / Última actualización: 20 out 2026._

---

## Português

A Judy é um bot de moderação, utilidades, IA e RPG para o Stoat. Esta política vale
para a instância oficial, mantida pelo autor do projeto (GhisoOF). Quem roda a sua
própria Judy é responsável pela própria instância e deve publicar a sua política.

**Contato:** [issues do repositório](https://github.com/GhisoOF/stoat_bot/issues).

### O que a Judy guarda, e por quanto tempo

| O quê | Quando | Por quanto tempo |
|---|---|---|
| **Memória da IA** (fatos que aprendeu conversando, memória geral) | só se **você aceitou** — ela pergunta na primeira conversa | até você desligar (`&privacidade memoria off`) ou apagar |
| Perfil (bio/status do seu cartão) | só quando **você mesmo** usa `&chat mapear` | até você apagar |
| Histórico da conversa com a IA | quando você fala com ela (para não perder o fio) | **24 horas** |
| Avisos e punições | quando a moderação de um servidor age | enquanto forem relevantes (os avisos zeram depois de 30 dias sem um novo) |
| Lista global de bans (ID, nome, motivo, servidor de origem) | quando um servidor que usa o `&banglobal` bane alguém | enquanto for relevante; sai quando o servidor de origem remove a Judy |
| XP e nível (a contagem de mensagens, não o texto) | só nos servidores que **ligaram** o XP — a Judy avisa ao ligar, e `&xp sair` deixa você de fora | até você sair, apagar, ou o servidor zerar |
| Saldo da economia, personagem do RPG | quando **você** usa esses comandos | até você apagar |
| Tickets (quem abriu, motivo, situação) | quando você abre um ticket | enquanto o servidor tiver a Judy |
| Configuração do servidor (canais, cargos, módulos) | sempre | até 30 dias depois de a Judy sair do servidor |
| Relatório de ataques ao operador | só se o servidor **aderir** (`&log relatorio on`), e **anônimo**: o servidor vira um código, e só entram bans, punições, raids e imagens suspeitas — sem nomes, IDs nem conversa. Nos servidores do próprio operador, o relatório é completo | 48 horas |
| Log técnico do bot (conteúdo das mensagens, com os IDs trocados por **pseudônimos**) | sempre | tamanho limitado — os mais antigos saem primeiro |
| Cópias de segurança do banco | a cada atualização do bot | **30 dias** |

### O que a Judy lê e não guarda

- **Mensagens**, para o automod e a moderação por IA dos servidores que as ligaram, e
  para entender a conversa quando você fala com ela (os últimos minutos do canal, só na
  memória do processo).
- **Imagens e fotos de perfil**, quando um servidor liga os filtros de imagem ou de
  avatar: um modelo de visão descreve a imagem; nada é guardado.
- **Voz nas calls**: o texto lido em voz alta (TTS) não é guardado.

### Para onde os dados vão

- A IA da instância oficial roda **na máquina do operador** (modelo local), sem enviar
  conversas a empresas de IA.
- Quando a conversa precisa de uma **busca na web**, o texto da busca vai a um buscador
  (via SearXNG).
- O que a Judy escreve nos canais (inclusive o canal de log de um servidor) fica no
  próprio Stoat.
- Nada é vendido nem usado para anúncios.

### Seus direitos

- `&privacidade` — o que a Judy guarda sobre você, e o link desta política.
- `&privacidade memoria on|off` — liga ou desliga a memória; desligar apaga o que ela sabia.
- `&privacidade apagar` — apaga **tudo** o que é seu (memória da IA, XP, saldo, RPG), em
  todos os servidores. Ficam só os registros de moderação dos servidores; para esses,
  fale com a staff do servidor ou com o operador. O que é de **outro** jogador fica com
  ele, sem você: uma proposta de troca que alguém fez a você é cancelada (o item volta a
  quem propôs), e o companheiro que você trocou continua com o novo dono.

---

## English

Judy is a moderation, utility, AI and RPG bot for Stoat. This policy covers the
official instance, run by the project's author (GhisoOF). Anyone running their own Judy
is responsible for that instance and should publish their own policy.

**Contact:** [repository issues](https://github.com/GhisoOF/stoat_bot/issues).

### What Judy keeps, and for how long

| What | When | For how long |
|---|---|---|
| **AI memory** (facts learned in conversation, general memory) | only if **you agreed** — she asks in your first conversation | until you turn it off (`&privacy memory off`) or delete it |
| Profile (bio/status from your card) | only when **you** use `&chat mapear` on yourself | until you delete it |
| AI conversation history | when you talk to her (so she keeps the thread) | **24 hours** |
| Warnings and punishments | when a server's moderation acts | while relevant (warnings reset after 30 days without a new one) |
| Global ban list (ID, name, reason, origin server) | when a server using `&globalban` bans someone | while relevant; removed when the origin server removes Judy |
| XP and level (the message count, not the text) | only on servers that **turned XP on** — Judy announces it, and `&xp leave` keeps you out | until you leave, delete it, or the server resets it |
| Economy balance, RPG character | when **you** use those commands | until you delete it |
| Tickets (who opened, reason, status) | when you open a ticket | while the server has Judy |
| Server configuration (channels, roles, modules) | always | until 30 days after Judy leaves the server |
| Attack report to the operator | only if the server **opts in** (`&log report on`), and **anonymous**: the server becomes a code, and only bans, punishments, raids and suspicious images go in — no names, IDs or conversation. On the operator's own servers, the report is complete | 48 hours |
| Bot technical log (message content, with IDs replaced by **pseudonyms**) | always | size-capped — the oldest goes first |
| Database backups | on each bot update | **30 days** |

### What Judy reads and doesn't keep

- **Messages**, for the automod and AI moderation on servers that enabled them, and to
  follow the conversation when you talk to her (the channel's last few minutes, in the
  process memory only).
- **Images and profile pictures**, when a server enables the image or avatar filters: a
  vision model describes the image; nothing is kept.
- **Voice in calls**: text read aloud (TTS) isn't kept.

### Where data goes

- The official instance's AI runs **on the operator's machine** (local model), without
  sending conversations to AI companies.
- When a conversation needs a **web search**, the search text goes to a search engine
  (through SearXNG).
- What Judy writes in channels (including a server's log channel) stays on Stoat.
- Nothing is sold or used for ads.

### Your rights

- `&privacy` — what Judy keeps about you, and a link to this policy.
- `&privacy memory on|off` — turns the memory on or off; off erases what she knew.
- `&privacy delete` — erases **everything** that's yours (AI memory, XP, balance, RPG) on
  every server. Only the servers' moderation records stay; for those, talk to the
  server's staff or to the operator. What belongs to **another** player stays with them,
  without you: a trade offer someone made to you is cancelled (the item goes back to
  them), and a companion you traded away stays with its new owner.

---

## Español

Judy es un bot de moderación, utilidades, IA y RPG para Stoat. Esta política vale para
la instancia oficial, mantenida por el autor del proyecto (GhisoOF). Quien ejecuta su
propia Judy es responsable de esa instancia y debe publicar su propia política.

**Contacto:** [issues del repositorio](https://github.com/GhisoOF/stoat_bot/issues).

### Lo que Judy guarda, y por cuánto tiempo

| Qué | Cuándo | Por cuánto tiempo |
|---|---|---|
| **Memoria de la IA** (datos aprendidos conversando, memoria general) | solo si **aceptaste** — lo pregunta en la primera conversación | hasta que la desactives (`&privacidad memoria off`) o la borres |
| Perfil (bio/estado de tu tarjeta) | solo cuando **tú mismo** usas `&chat mapear` | hasta que lo borres |
| Historial de la conversación con la IA | cuando hablas con ella (para no perder el hilo) | **24 horas** |
| Advertencias y sanciones | cuando la moderación de un servidor actúa | mientras sean relevantes (las advertencias se reinician tras 30 días sin una nueva) |
| Lista global de bans (ID, nombre, motivo, servidor de origen) | cuando un servidor que usa `&banglobal` banea a alguien | mientras sea relevante; sale cuando el servidor de origen quita a Judy |
| XP y nivel (el conteo de mensajes, no el texto) | solo en los servidores que **activaron** el XP — Judy lo anuncia, y `&xp salir` te deja fuera | hasta que salgas, lo borres, o el servidor lo reinicie |
| Saldo de la economía, personaje del RPG | cuando **tú** usas esos comandos | hasta que lo borres |
| Tickets (quién abrió, motivo, estado) | cuando abres un ticket | mientras el servidor tenga a Judy |
| Configuración del servidor (canales, roles, módulos) | siempre | hasta 30 días después de que Judy salga del servidor |
| Informe de ataques al operador | solo si el servidor **se adhiere** (`&log informe on`), y **anónimo**: el servidor se vuelve un código, y solo entran bans, sanciones, raids e imágenes sospechosas — sin nombres, IDs ni conversación. En los servidores del propio operador, el informe es completo | 48 horas |
| Log técnico del bot (contenido de los mensajes, con los IDs cambiados por **seudónimos**) | siempre | tamaño limitado — los más antiguos salen primero |
| Copias de seguridad de la base de datos | en cada actualización del bot | **30 días** |

### Lo que Judy lee y no guarda

- **Mensajes**, para el automod y la moderación por IA de los servidores que los
  activaron, y para seguir la conversación cuando hablas con ella (los últimos minutos
  del canal, solo en la memoria del proceso).
- **Imágenes y fotos de perfil**, cuando un servidor activa los filtros de imagen o de
  avatar: un modelo de visión describe la imagen; no se guarda nada.
- **Voz en las llamadas**: el texto leído en voz alta (TTS) no se guarda.

### A dónde van los datos

- La IA de la instancia oficial se ejecuta **en la máquina del operador** (modelo
  local), sin enviar conversaciones a empresas de IA.
- Cuando la conversación necesita una **búsqueda en la web**, el texto de la búsqueda
  va a un buscador (a través de SearXNG).
- Lo que Judy escribe en los canales (incluido el canal de log de un servidor) queda en
  el propio Stoat.
- Nada se vende ni se usa para anuncios.

### Tus derechos

- `&privacidad` — lo que Judy guarda sobre ti, y el enlace a esta política.
- `&privacidad memoria on|off` — activa o desactiva la memoria; desactivarla borra lo que sabía.
- `&privacidad borrar` — borra **todo** lo tuyo (memoria de la IA, XP, saldo, RPG) en
  todos los servidores. Solo quedan los registros de moderación de los servidores; para
  esos, habla con el staff del servidor o con el operador. Lo que es de **otro** jugador
  queda con él, sin ti: una propuesta de intercambio que alguien te hizo se cancela (el
  objeto vuelve a quien la hizo), y el compañero que cambiaste sigue con su nuevo dueño.
