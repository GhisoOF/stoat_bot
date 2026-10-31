// &tutorial — o mini guia (P2, 31 out 2026).
//
// Só o que nenhum `&help <comando>` explica sozinho:
//   &tutorial            o que dá para fazer e por onde começar (a 1ª página)
//   &tutorial <n>        uma página do guia: a abertura e os conceitos, em ordem
//   &tutorial <conceito> permissoes · ids · canais · protecao — o que atravessa os comandos
//   &tutorial rpg        a wiki do RPG, gerada dos dados do jogo (modulos/game/wiki.js)
// As áreas antigas que só repetiam um comando (moderacao, logs, cargos, xp, mensagens,
// noticias, aventura, economia, ajustes, ia) levam à página do `&help` do comando.

import * as visaoMod from "./visao.js";
import { citar, citarInterno, trechoPronto, subExibido } from "../core/aliases.js";
import { idiomaDe } from "../core/i18n.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";
import { cmdHelp } from "./ajuda.js";
// (namespace: a wiki é da área do RPG; se a função ainda não existir, a área diz que está vazia)
import * as wikiRpg from "../game/game.js";
import { iaNoEnv } from "../ai/gating.js";

// Os conceitos, nos três idiomas (as citações valem no idioma da tela; o espanhol sai pronto)
function CONCEITOS(P, lang = "pt", comIA = false) {
  if (lang === "es") return {
    permissoes: {
      titulo: "🔑 Permisos del bot",
      ordem: 0,
      resumo: "Antes que nada: sin esto, nada funciona.",
      corpo: [
        "En **Ajustes del servidor → Roles**, dale al rol del bot:",
        "",
        "**Esenciales**",
        "• `ViewChannel`, `ReadMessageHistory` — ver y leer los canales",
        "• `SendMessage`, `SendEmbeds` — responder",
        `• \`React\` — reacciones (roles por reacción${comIA ? ", el 👀 de Judy" : ""})`,
        "• `BypassSlowmode` — responder al momento en canales con modo lento (sin él, espera su turno)",
        "",
        "**Para moderar**",
        `• \`ManageMessages\` — borrar mensajes (automod, \`${citar("limpar", "es", P)}\`)`,
        `• \`KickMembers\`, \`BanMembers\` — \`${citar("kick", "es", P)}\`, \`${citar("ban", "es", P)}\`, ban global`,
        `• \`TimeoutMembers\` — silenciar por un tiempo (\`${citar("silenciar", "es", P)}\`)`,
        "",
        "**Para gestionar roles y canales**",
        "• `ManageRole` — **crear** roles (roles de nivel)",
        "• `AssignRoles` — **dar** roles a alguien (autorol, niveles, reacciones)",
        `• \`ManageChannel\` — crear/editar canales (tickets, \`${citar("assistente.servidor", "es", P)}\`)`,
        `• \`ManagePermissions\` — ajustar los permisos de canales y roles (\`${citar("assistente.servidor", "es", P)}\`)`,
        "",
        "⚠️ `ManageRole` y `AssignRoles` son cosas **distintas**: uno crea el rol y el otro se lo da a la persona. Si falta el segundo, el bot crea los roles y falla al aplicarlos.",
        "",
        "💡 El rol del bot tiene que estar **por encima** de los roles que va a gestionar en la lista de roles.",
      ],
    },

    ids: {
      titulo: "🆔 IDs y menciones",
      ordem: 0.25,
      resumo: "Cómo señalar a una persona, un rol o un canal en un comando.",
      corpo: [
        "Todo comando que habla de **alguien**, de un **rol** o de un **canal** acepta tres formas de señalar:",
        "",
        "**1. Mención** — la más fácil",
        "• persona: escribe `@` y elige de la lista → `@Ana`",
        "• rol: escribe `@` y elige el rol (si no aparece, usa el nombre o el ID)",
        "• canal: escribe `#` y elige → `#reglas`",
        "Por detrás, Stoat cambia la mención por un código — `<@ID>` persona, `<%ID>` rol, `<#ID>` canal — y el bot lee los tres. La mención **notifica** a la persona; el ID, no.",
        "",
        "**2. Nombre** — sin etiquetar a nadie",
        "• rol: el nombre, entero o una parte → `VIP`",
        "• canal: `#nombre`, o `here` para el canal actual",
        "• persona: la mención o el ID son más seguros (dos personas pueden tener el mismo nombre)",
        "",
        "**3. ID** — lo más seguro",
        "Un ID es un código de **26 caracteres**, letras y números, único y fijo: el nombre cambia, el ID no. Ej.: `01KH9SJYWVD7XAHJ28TP0YP4Q0`.",
        "Para copiarlo:",
        "• actívalo una vez: **Ajustes de usuario → Avanzado → *Show 'copy ID' in context menus*** (mostrar \"copiar ID\" en los menús)",
        "• persona, canal, mensaje o servidor: clic derecho (en el móvil, mantén pulsado) → **Copy user ID** / **Copy channel ID** / …",
        "• rol: **Ajustes del servidor → Roles →** elige el rol → **Copy role ID**",
        "Pega el ID donde iría la mención.",
        "",
        "**Ejemplos**",
        `\`${citar("warn", "es", P)} @Ana flood\` · \`${citar("warn", "es", P)} 01KH9SJYWVD7XAHJ28TP0YP4Q0 flood\``,
        `\`${citar("autorole.set", "es", P)} @Miembro\` · \`${citar("autorole.set", "es", P)} Miembro\``,
        `\`${citar("log.aqui", "es", P)}\` · \`${citar("log", "es", P)} #logs\``,
        "",
        "💡 Cuando un ID llega mal, el bot dice qué falla (ej.: “tiene 25 caracteres, un ID tiene 26”).",
      ],
    },

    canais: {
      titulo: "🔀 Canales: los 3 tipos",
      ordem: 0.5,
      resumo: "El permiso del canal gana al del rol. Pon cada canal en uno de 3 tipos.",
      corpo: [
        "**La regla que explica casi todo \"¿por qué no funciona?\":**",
        "un permiso definido **en el canal** pasa por encima del **del rol**. Si un rol puede *Enviar mensajes* en el servidor pero el canal lo niega, el rol no envía. Así que: deja los permisos de los roles al *mínimo* y abre excepciones canal por canal.",
        "",
        "Pon cada canal en uno de **tres tipos**:",
        "",
        "**🔒 Solo el staff ve** — logs, alertas del Centinela, bastidores",
        "• Canal → *Permisos* → **Por defecto**: niega *Ver canal*",
        "• después, en cada **rol de staff**: permite *Ver canal*",
        "",
        "**📢 Solo el staff escribe** — reglas, anuncios, paneles de roles por reacción",
        "• **Por defecto**: niega *Enviar mensajes* (deja *Ver canal* permitido)",
        "• en cada **rol de staff**: permite *Enviar mensajes*",
        "",
        "**💬 General** — charla, off-topic, multimedia",
        "• no toques nada; hereda lo del servidor",
        "",
        "**¿Y el bot?** Dale a su rol *Ver canal* + *Enviar mensajes* también en los dos primeros tipos, o no podrá registrar logs, alertar ni publicar paneles. " + "`" + citar("debug", "es", P) + "` lo revisa por ti, canal por canal.",
        "",
        `💡 \`${citar("assistente.canais", "es", P)}\` pregunta qué canales son de cada tipo y te dice exactamente qué pulsar.`,
        `🏗️ ¿Servidor nuevo? \`${citar("assistente.servidor", "es", P)}\` crea roles y canales ya en los 3 tipos, con los permisos puestos.`,
      ],
    },

    protecao: {
      titulo: "🛡️ Cómo actúa la protección",
      resumo: "Lo que pasa con un mensaje, del filtro a la sanción.",
      corpo: [
        "Todo mensaje pasa por el **automod** antes que nada (los comandos también).",
        "",
        "**1. Medir o juzgar.** La mayoría de los filtros **mide** algo exacto: velocidad, mayúsculas, enlaces, menciones. El **centinela** **juzga** el contenido (estafas, +18, odio) con una nota de sospecha — y es más estricto con quien acaba de llegar.",
        "**2. Sancionar.** Quien pasa del límite recibe la sanción del servidor: solo avisar, borrar, silenciar y llamar al staff, subir una escalera (aviso → silencio → ban) o banear en el acto. El silencio es el timeout nativo de Stoat.",
        "**3. Registrar.** Todo va al canal de registro — y solo el staff de este servidor lo ve.",
        "",
        "**El staff** pasa los filtros sin sanción. Los **avisos** caducan tras un tiempo sin uno nuevo. La **lista global** avisa (o banea) a quien ya fue baneado en otros servidores.",
        "",
        `Ver lo que está activado: \`${citar("automod", "es", P)}\` · Los detalles: \`${citar("help", "es", P)} automod\``,
      ],
    },
  };
  if (lang === "en") return {
    permissoes: {
      titulo: "🔑 Bot permissions",
      ordem: 0,
      resumo: "First of all: without these, nothing works.",
      corpo: [
        "In **Server settings → Roles**, give the bot's role:",
        "",
        "**Essentials**",
        "• `ViewChannel`, `ReadMessageHistory` — see and read the channels",
        "• `SendMessage`, `SendEmbeds` — reply",
        `• \`React\` — reactions (reaction roles${comIA ? ", Judy's 👀" : ""})`,
        "• `BypassSlowmode` — answer right away in slowmode channels (without it she waits her turn)",
        "",
        "**To moderate**",
        `• \`ManageMessages\` — delete messages (automod, \`${citar("limpar", "en", P)}\`)`,
        `• \`KickMembers\`, \`BanMembers\` — \`${citar("kick", "en", P)}\`, \`${citar("ban", "en", P)}\`, global bans`,
        `• \`TimeoutMembers\` — timed silences (\`${citar("silenciar", "en", P)}\`)`,
        "",
        "**To manage roles and channels**",
        "• `ManageRole` — **create** roles (level roles)",
        "• `AssignRoles` — **give** roles to someone (autorole, levels, reactions)",
        `• \`ManageChannel\` — create/edit channels (tickets, \`${citarInterno("assistente.servidor", P)}\`)`,
        `• \`ManagePermissions\` — set channel and role permissions (\`${citarInterno("assistente.servidor", P)}\`)`,
        "",
        "⚠️ `ManageRole` and `AssignRoles` are **different** things: one creates the role, the other hands it to the person. Missing the second, the bot creates the roles and then fails to apply them.",
        "",
        "💡 The bot's role must sit **above** the roles it will manage in the role list.",
      ],
    },

    ids: {
      titulo: "🆔 IDs and mentions",
      ordem: 0.25,
      resumo: "How to point at a person, a role or a channel in a command.",
      corpo: [
        "Every command that talks about **someone**, a **role** or a **channel** takes three ways of pointing:",
        "",
        "**1. Mention** — the easiest",
        "• person: type `@` and pick from the list → `@Ana`",
        "• role: type `@` and pick the role (if it doesn't show up, use the name or the ID)",
        "• channel: type `#` and pick → `#rules`",
        "Behind the scenes Stoat turns a mention into a code — `<@ID>` person, `<%ID>` role, `<#ID>` channel — and the bot reads all three. A mention **pings** the person; an ID doesn't.",
        "",
        "**2. Name** — without pinging anyone",
        "• role: the name, whole or partial → `VIP`",
        "• channel: `#name`, or `here` for the current channel",
        "• person: the mention or the ID is safer (two people can share a name)",
        "",
        "**3. ID** — the safest",
        "An ID is a **26-character** code of letters and numbers, unique and fixed: names change, IDs don't. E.g. `01KH9SJYWVD7XAHJ28TP0YP4Q0`.",
        "To copy one:",
        "• turn it on once: **User settings → Advanced → *Show 'copy ID' in context menus***",
        "• person, channel, message or server: right-click (on the phone, long-press) → **Copy user ID** / **Copy channel ID** / …",
        "• role: **Server settings → Roles →** pick the role → **Copy role ID**",
        "Paste the ID where the mention would go.",
        "",
        "**Examples**",
        `\`${citar("warn", "en", P)} @Ana flood\` · \`${citar("warn", "en", P)} 01KH9SJYWVD7XAHJ28TP0YP4Q0 flood\``,
        `\`${citar("autorole.set", "en", P)} @Member\` · \`${citar("autorole.set", "en", P)} Member\``,
        `\`${citar("log.here", "en", P)}\` · \`${citar("log", "en", P)} #logs\``,
        "",
        "💡 When an ID comes in wrong, the bot says what's off (e.g. “it has 25 characters, an ID has 26”).",
      ],
    },

    canais: {
      titulo: "🔀 Channels: the 3 types",
      ordem: 0.5,
      resumo: "Channel permission beats role permission. Sort every channel into one of 3 types.",
      corpo: [
        "**The rule that explains almost every \"why doesn't it work\":**",
        "a permission set **on the channel** overrides the one **on the role**. If a role can *Send messages* server-wide but the channel denies it, the role doesn't send. So: keep role permissions as the *minimum* and open exceptions per channel.",
        "",
        "Put every channel in one of **three types**:",
        "",
        "**🔒 Staff-only to see** — logs, Sentinel alerts, backstage",
        "• Channel → *Permissions* → **Default**: deny *View channel*",
        "• then, for each **staff role**: allow *View channel*",
        "",
        "**📢 Staff-only to write** — rules, announcements, reaction-role panels",
        "• **Default**: deny *Send messages* (keep *View channel* allowed)",
        "• for each **staff role**: allow *Send messages*",
        "",
        "**💬 General** — chat, off-topic, media",
        "• touch nothing; it inherits the server defaults",
        "",
        "**And the bot?** Give its role *View channel* + *Send messages* in the first two types too, or it can't log, alert, or post panels. " + "`" + citarInterno("debug") + "` checks that for you, channel by channel.",
        "",
        `💡 \`${citarInterno("assistente.canais", P)}\` asks which channels are which type and lists exactly what to click.`,
        `🏗️ New server? \`${citarInterno("assistente.servidor", P)}\` creates roles and channels already in the 3 types, permissions included.`,
      ],
    },

    protecao: {
      titulo: "🛡️ How protection acts",
      resumo: "What happens to a message, from the filter to the punishment.",
      corpo: [
        "Every message goes through the **automod** before anything else (commands included).",
        "",
        "**1. Measure or judge.** Most filters **measure** something exact: speed, caps, links, mentions. The **sentinel** **judges** the content (scams, NSFW, hate) with a suspicion score — and is stricter with newcomers.",
        "**2. Punish.** Whoever crosses the line gets the server's punishment: just warn, delete, time out and call the staff, climb a ladder (warning → timeout → ban) or ban on the spot. The timeout is Stoat's native one.",
        "**3. Record.** Everything goes to the log channel — and only this server's staff sees it.",
        "",
        "**Staff** passes the filters unpunished. **Warnings** expire after a while without a new one. The **global list** alerts on (or bans) people already banned on other servers.",
        "",
        `See what's on: \`${citarInterno("automod", P)}\` · The details: \`${citarInterno("help", P)} automod\``,
      ],
    },
  };
  return {
    permissoes: {
      titulo: "🔑 Permissões do bot",
      ordem: 0,
      resumo: "Antes de tudo: sem isso, nada funciona.",
      corpo: [
        "Em **Configurações do servidor → Cargos**, dê ao cargo do bot:",
        "",
        "**Essenciais**",
        "• `ViewChannel`, `ReadMessageHistory` — ver e ler os canais",
        "• `SendMessage`, `SendEmbeds` — responder",
        `• \`React\` — reações (cargos por reação${comIA ? ", 👀 da Judy" : ""})`,
        "• `BypassSlowmode` (Ignorar modo lento) — responder na hora em canal com modo lento (sem ela, espera a vez)",
        "",
        "**Para moderar**",
        `• \`ManageMessages\` — apagar mensagens (automod, \`${citar("limpar", "pt", P)}\`)`,
        `• \`KickMembers\`, \`BanMembers\` — \`${citar("kick", "pt", P)}\`, \`${citar("ban", "pt", P)}\`, ban global`,
        `• \`TimeoutMembers\` — silenciar por tempo (\`${citar("silenciar", "pt", P)}\`)`,
        "",
        "**Para gerir cargos e canais**",
        "• `ManageRole` — **criar** cargos (cargos de nível)",
        "• `AssignRoles` — **dar** cargos a alguém (autorole, nível, reação)",
        `• \`ManageChannel\` — criar/editar canais (tickets, \`${citarInterno("assistente.servidor", P)}\`)`,
        `• \`ManagePermissions\` — mexer nas permissões de canais e cargos (\`${citarInterno("assistente.servidor", P)}\`)`,
        "",
        "⚠️ `ManageRole` e `AssignRoles` são coisas **diferentes**: uma cria o cargo, a outra entrega para a pessoa. Faltando a segunda, o bot cria os cargos e falha na hora de aplicar.",
        "",
        "💡 O cargo do bot precisa estar **acima** dos cargos que ele vai gerenciar na lista de cargos.",
      ],
    },

    ids: {
      titulo: "🆔 IDs e menções",
      ordem: 0.25,
      resumo: "Como apontar uma pessoa, um cargo ou um canal num comando.",
      corpo: [
        "Todo comando que fala de **alguém**, de um **cargo** ou de um **canal** aceita três jeitos de apontar:",
        "",
        "**1. Menção** — o jeito mais fácil",
        "• pessoa: digite `@` e escolha na lista → `@Ana`",
        "• cargo: digite `@` e escolha o cargo (se ele não aparecer, use o nome ou o ID)",
        "• canal: digite `#` e escolha → `#regras`",
        "Por trás, o Stoat troca a menção por um código — `<@ID>` pessoa, `<%ID>` cargo, `<#ID>` canal — e o bot lê os três. A menção **notifica** a pessoa; o ID, não.",
        "",
        "**2. Nome** — sem marcar ninguém",
        "• cargo: o nome, inteiro ou um pedaço → `VIP`",
        "• canal: `#nome`, ou `aqui` para o canal atual",
        "• pessoa: a menção ou o ID são mais seguros (duas pessoas podem ter o mesmo nome)",
        "",
        "**3. ID** — o mais seguro",
        "Um ID é um código de **26 caracteres**, letras e números, único e fixo: nome muda, ID não. Ex.: `01KH9SJYWVD7XAHJ28TP0YP4Q0`.",
        "Para copiar:",
        "• ative uma vez: **Configurações do usuário → Avançado → *Show 'copy ID' in context menus*** (mostrar \"copiar ID\" nos menus)",
        "• pessoa, canal, mensagem ou servidor: botão direito (no celular, segure o dedo) → **Copy user ID** / **Copy channel ID** / …",
        "• cargo: **Configurações do servidor → Cargos →** escolha o cargo → **Copy role ID**",
        "Cole o ID no lugar da menção.",
        "",
        "**Exemplos**",
        `\`${citar("warn", "pt", P)} @Ana flood\` · \`${citar("warn", "pt", P)} 01KH9SJYWVD7XAHJ28TP0YP4Q0 flood\``,
        `\`${citar("autorole.set", "pt", P)} @Membro\` · \`${citar("autorole.set", "pt", P)} Membro\``,
        `\`${citar("log.aqui", "pt", P)}\` · \`${citar("log", "pt", P)} #logs\``,
        "",
        "💡 Quando um ID vem errado, o bot diz o que está faltando (ex.: “tem 25 caracteres, um ID tem 26”).",
      ],
    },

    canais: {
      titulo: "🔀 Canais: os 3 tipos",
      ordem: 0.5,
      resumo: "Permissão de canal vence permissão de cargo. Separe todo canal em um de 3 tipos.",
      corpo: [
        "**A regra que explica quase todo \"por que não funciona\":**",
        "uma permissão definida **no canal** passa por cima da **do cargo**. Se um cargo pode *Enviar mensagens* no servidor mas o canal nega, o cargo não envia. Então: deixe as permissões dos cargos no *mínimo* e abra exceções canal por canal.",
        "",
        "Coloque todo canal em um de **três tipos**:",
        "",
        "**🔒 Só staff vê** — logs, alertas do Sentinela, bastidores",
        "• Canal → *Permissões* → **Padrão**: negue *Ver canal*",
        "• depois, em cada **cargo de staff**: permita *Ver canal*",
        "",
        "**📢 Só staff escreve** — regras, avisos, painéis de reaction role",
        "• **Padrão**: negue *Enviar mensagens* (mantenha *Ver canal* permitido)",
        "• em cada **cargo de staff**: permita *Enviar mensagens*",
        "",
        "**💬 Geral** — conversa, off-topic, mídia",
        "• não mexa em nada; herda o padrão do servidor",
        "",
        "**E o bot?** Dê ao cargo dele *Ver canal* + *Enviar mensagens* também nos dois primeiros tipos, senão ele não consegue registrar log, alertar nem publicar painel. " + "`" + citarInterno("debug") + "` confere isso por você, canal a canal.",
        "",
        `💡 \`${citarInterno("assistente.canais", P)}\` pergunta quais canais são de cada tipo e lista exatamente o que clicar.`,
        `🏗️ Servidor novo? \`${citarInterno("assistente.servidor", P)}\` cria cargos e canais já nos 3 tipos, com as permissões prontas.`,
      ],
    },

    protecao: {
      titulo: "🛡️ Como a proteção age",
      resumo: "O que acontece com uma mensagem, do filtro à punição.",
      corpo: [
        "Toda mensagem passa pelo **automod** antes de qualquer outra coisa (comandos inclusive).",
        "",
        "**1. Medir ou julgar.** A maioria dos filtros **mede** algo exato: velocidade, caixa alta, links, menções. O **sentinela** **julga** o conteúdo (golpe, +18, ódio) com uma nota de suspeita — e é mais rígido com quem acabou de chegar.",
        "**2. Punir.** Quem passa do limite recebe a punição do servidor: só avisar, apagar, silenciar e chamar a staff, subir uma escada (aviso → silêncio → ban) ou banir na hora. O silêncio é o timeout nativo do Stoat.",
        "**3. Registrar.** Tudo vai ao canal de log — e só a staff deste servidor vê.",
        "",
        "**A staff** passa pelos filtros sem punição. **Avisos** vencem depois de um tempo sem um novo. A **lista global** avisa (ou bane) quem já foi banido em outros servidores.",
        "",
        `Ver o que está ligado: \`${citarInterno("automod", P)}\` · Os detalhes: \`${citarInterno("help", P)} automod\``,
      ],
    },
  };
}
export const ORDEM_CONCEITOS = ["permissoes", "ids", "canais", "protecao"];

// A abertura do guia
function ABERTURA(P, lang = "pt", comIA = false) {
  if (lang === "es") return [
    { title: "📚 Tutorial — lo que puedes hacer",
      linhas: [
        `El bot modera (filtros automáticos, avisos, bans), recibe a quien llega (bienvenida, roles) y anima el servidor (XP, economía, juegos, RPG, música)${comIA ? ". Y Judy conversa, si el staff lo activa" : ""}.`,
        "",
        "**Por dónde empezar**",
        `1. \`${citar("assistente", "es", P)}\` — configuración guiada: yo pregunto, tú respondes`,
        `2. \`${citar("debug", "es", P)}\` — lo que falta (permisos, canales)`,
        `3. \`${citar("config", "es", P)}\` — cómo quedó todo`,
        "",
        "**Conceptos**",
        `\`${citar("tutorial", "es", P)} permisos\` · \`${citar("tutorial", "es", P)} ids\` · \`${citar("tutorial", "es", P)} canales\` · \`${citar("tutorial", "es", P)} proteccion\``,
        `**RPG:** \`${citar("tutorial", "es", P)} rpg\` · **Comandos:** \`${citar("help", "es", P)}\``,
      ] },
  ];
  if (lang === "en") return [
    { title: "📚 Tutorial — what you can do",
      linhas: [
        `The bot moderates (automatic filters, warnings, bans), welcomes newcomers (welcome messages, roles) and livens up the server (XP, economy, games, RPG, music)${comIA ? ". And Judy chats, if the staff turns it on" : ""}.`,
        "",
        "**Where to start**",
        `1. \`${citarInterno("assistente", P)}\` — guided setup: I ask, you answer`,
        `2. \`${citarInterno("debug", P)}\` — what's missing (permissions, channels)`,
        `3. \`${citarInterno("config", P)}\` — how everything turned out`,
        "",
        "**Concepts**",
        `\`${citarInterno("tutorial", P)} permissions\` · \`${citarInterno("tutorial", P)} ids\` · \`${citarInterno("tutorial", P)} channels\` · \`${citarInterno("tutorial", P)} protection\``,
        `**RPG:** \`${citarInterno("tutorial", P)} rpg\` · **Commands:** \`${citarInterno("help", P)}\``,
      ] },
  ];
  return [
    { title: "📚 Tutorial — o que dá para fazer",
      linhas: [
        `O bot modera (filtros automáticos, avisos, bans), recebe quem chega (boas-vindas, cargos) e anima o servidor (XP, economia, jogos, RPG, música)${comIA ? ". E a Judy conversa, se a staff ligar" : ""}.`,
        "",
        "**Por onde começar**",
        `1. \`${citarInterno("assistente", P)}\` — configuração guiada: eu pergunto, você responde`,
        `2. \`${citarInterno("debug", P)}\` — o que está faltando (permissões, canais)`,
        `3. \`${citarInterno("config", P)}\` — como ficou tudo`,
        "",
        "**Conceitos**",
        `\`${citarInterno("tutorial", P)} permissoes\` · \`${citarInterno("tutorial", P)} ids\` · \`${citarInterno("tutorial", P)} canais\` · \`${citarInterno("tutorial", P)} protecao\``,
        `**RPG:** \`${citarInterno("tutorial", P)} rpg\` · **Comandos:** \`${citarInterno("help", P)}\``,
      ] },
  ];
}

// área antiga → o `&help` que explica (o tutorial não repete o comando)
export const AREAS_QUE_SAO_COMANDO = {
  moderacao: ["automod"], logs: ["config", "log"], cargos: ["reactionrole"], xp: ["xp"], mensagens: ["boasvindas"],
  noticias: ["rss"], aventura: ["game"], economia: ["economia"], ajustes: ["config"], ia: ["config", "ia"],
};
// nome digitado (inglês, espanhol, apelido) → chave
const NOMES = {
  permissions: "permissoes", permisos: "permissoes", "permissões": "permissoes", perms: "permissoes",
  channels: "canais", canales: "canais", canal: "canais",
  protection: "protecao", proteccion: "protecao", "protección": "protecao", "proteção": "protecao", protect: "protecao", proteger: "protecao",
  wiki: "rpg", jogo: "rpg", juego: "rpg", game: "rpg", mercado: "rpg", market: "rpg",
  mention: "ids", mentions: "ids", mencoes: "ids", "menções": "ids", mencion: "ids", menciones: "ids", id: "ids",
  moderation: "moderacao", "moderação": "moderacao", moderacion: "moderacao", log: "logs", roles: "cargos", levels: "xp", nivel: "xp",
  messages: "mensagens", mensajes: "mensagens", news: "noticias", "notícias": "noticias", adventure: "aventura", economy: "economia",
  settings: "ajustes", ai: "ia", rpgwiki: "rpg",
};

// As páginas do guia (abertura + conceitos) e a wiki, no idioma; para o teste e o README
export function paginasDoGuia(P = "&", lang = "pt", comIA = false) {
  const c = CONCEITOS(P, lang, comIA);
  return [
    ...ABERTURA(P, lang, comIA).map((p) => ({ chave: null, titulo: p.title, linhas: p.linhas })),
    ...ORDEM_CONCEITOS.map((k) => ({ chave: k, titulo: c[k].titulo, linhas: c[k].corpo })),
  ];
}
export function paginasDaWiki(P = "&", lang = "pt") {
  try { return (wikiRpg.paginasWikiRpg?.(lang, P) ?? []).map((p) => ({ chave: "rpg", titulo: p.titulo, linhas: String(p.texto ?? "").split("\n") })); }
  catch (e) { console.error("[TUTORIAL] wiki do RPG:", e?.message); return []; }
}

export async function cmdTutorial(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  const lang = idiomaDe(ctx);
  const es = lang === "es";
  // o espanhol vem pronto; as linhas são marcadas DEPOIS do filtro do visao.js
  const pronta = (l) => (es && String(l).trim() !== "" ? trechoPronto(l) : l);
  const visao = await visaoMod.quemVe(message, ctx);
  const pedido = String(args[0] ?? "").toLowerCase();
  const chave = pedido && !/^\d+$/.test(pedido) ? (NOMES[pedido] ?? pedido) : null;
  const enviar = (paginas, inicial = 0, comandoPagina = null) => {
    const pgs = paginas.flatMap((p) => paginarLinhas(visaoMod.filtrarLinhas(p.linhas, visao).map(pronta), { titulo: pronta(p.titulo), limite: 1300 }));
    // o número pedido conta as páginas como saem (um conceito longo vira duas)
    return enviarPaginado(ctx, message.channel, { paginas: pgs, autorId: message.authorId, paginaInicial: Math.min(Math.max(inicial, 0), pgs.length - 1), comandoPagina, colour: COR.info });
  };

  // área antiga que é um comando: a página do &help dele. A `ia` onde a conversa não existe
  // (o .env não a deixa rodar neste servidor) é só a moderação por IA: os temas do sentinela.
  if (chave === "ia" && !iaNoEnv(ctx.serverId)) return cmdHelp(message, ["automod", "sentinela", "assuntos"], ctx);
  if (chave && AREAS_QUE_SAO_COMANDO[chave]) return cmdHelp(message, AREAS_QUE_SAO_COMANDO[chave], ctx);

  if (chave === "rpg") {
    const wiki = paginasDaWiki(P, lang);
    if (!wiki.length) return sendEmbed(message.channel, { colour: COR.aviso, description: ({ pt: "📭 A wiki do RPG ainda está vazia.", en: "📭 The RPG wiki is still empty.", es: "📭 La wiki del RPG aún está vacía." })[lang] });
    return enviar(wiki);
  }

  const guia = paginasDoGuia(P, lang, visao.ia);
  if (chave) {
    const i = guia.findIndex((p) => p.chave === chave);
    if (i < 0) {
      const nomes = [...ORDEM_CONCEITOS, "rpg"].map((k) => `\`${subExibido("tutorial", k, lang)}\``).join(" · ");
      return sendEmbed(message.channel, { colour: COR.aviso, description: pronta(({ pt: `❓ Não conheço \`${pedido.slice(0, 30)}\`. ${nomes}`, en: `❓ I don't know \`${pedido.slice(0, 30)}\`. ${nomes}`, es: `❓ No conozco \`${pedido.slice(0, 30)}\`. ${nomes}` })[lang]) });
    }
    return enviar([guia[i]]);
  }
  const n = pedido ? parseInt(pedido, 10) : 1;
  return enviar(guia, n - 1, es ? citar("tutorial", "es", P) : citarInterno("tutorial", P));
}
