// &banglobal — a lista global de bans entre os servidores da Judy. A staff vê o modo,
// isenta pessoas aqui e consulta o histórico; o resto é do dono do bot.

export default {
  id: "banglobal",
  modulo: "../moderacao/ban-global.js",
  funcao: "cmdBanGlobal",
  nomes: { en: "globalban" },
  apelidos: ["globalban"],
  es: {
    nome: "banglobal",
    subcomandos: {
      historico: "historial", isentar: "eximir", isentos: "exentos", remover: "quitar",
      varrer: "barrer", desfazer: "deshacer", esquecer: "olvidar", lembrar: "recordar", avisar: "avisar", imediato: "inmediato", consenso: "consenso", lista: "lista", servidor: "servidor", revisar: "revisar", confirmar: "confirmar", ignorados: "ignorados", pessoas: "personas", contribuicao: "contribucion", importar: "importar"
    },
  },
  // (P2) os sinônimos de modo e os nomes antigos viraram apelidos aqui; o handler só
  // conhece o nome interno. `revisar` = a prévia do `varrer`; `desfazer <pessoa>` = `isentar`.
  subcomandos: {
    off: ["off", "ignorar", "ignore"], avisar: ["warn", "alert", "alertar"],
    imediato: ["instant", "immediate", "banir", "ban", "cego"], consenso: ["consensus", "cautela", "cautious"],
    historico: ["history", "view", "ver", "porque"], isentar: ["exempt", "allow", "accept", "bypass", "permitir", "aceitar"],
    isentos: ["exempted", "isento"], remover: ["remove", "tirar"],
    lista: ["list", "banned", "all", "banidos", "todos"], servidor: ["server", "aqui", "here", "daqui"],
    varrer: ["sweep", "scan", "varredura"], revisar: ["review", "conferir", "checar"],
    desfazer: ["undo", "revert", "reverter"], confirmar: ["confirm", "sim", "yes"],
    add: ["add", "adicionar", "incluir", "colocar"], esquecer: "forget",
    lembrar: ["remember", "unforget", "reincluir"], ignorados: ["ignored", "excecoes", "foradalista"],
    bots: "bots", pessoas: "people", contribuicao: "contribution", auto: ["auto", "automatic", "autoimport", "automatico"], importar: "import",
  },
  aninhados: ["isentar", "lista", "varrer", "desfazer", "bots"],
  // nomes antigos do `bots` (o handler conhecia as duas palavras)
  // (revisão P2) `&banglobal remover|apagar <pessoa>` era o `esquecer` (todo nome antigo vira apelido).
  // Só no 1º termo: o `&banglobal isentar remover <pessoa>` continua sendo o remover da isenção.
  atalhos: {
    "banglobal|globalban limparbots|podar": "banglobal bots",
    "banglobal|globalban remover|apagar|remove|delete|quitar|borrar": "banglobal esquecer",
  },
  gerenciavel: true,
  ajuda: {
    grupo: "proteger",
    perm: "BanMembers",
    uso: { pt: "{&banglobal} [isentar|historico] [@pessoa]", en: "{&banglobal} [exempt|history] [@user]", es: "{&banglobal} [eximir|historial] [@usuario]" },
    desc: {
      pt: "Lista de bans compartilhada entre os servidores da Judy. Todo ban daqui entra nela; ban automático (automod) só alerta nos outros servidores.\n\n`{&banglobal}` — o modo deste servidor\n`{&banglobal.isentar} <@pessoa>` — aceita a pessoa aqui apesar da lista (e desfaz o ban, se foi a lista que baniu)\n`{&banglobal.isentar.remover} <@pessoa>` · `{&banglobal.isentos}`\n`{&banglobal.historico} <@pessoa>` — em quantos servidores e quando\n\n**Dono do bot:**\n`{&banglobal} off|avisar|imediato|consenso` — o modo\n`{&banglobal.lista} [servidor]` — quem está na lista\n`{&banglobal.varrer} [confirmar]` — confere os membros (e bane)\n`{&banglobal.desfazer} [confirmar]` — reverte os bans que a lista aplicou aqui\n`{&banglobal.add} <id…> [motivo]` · `{&banglobal.esquecer} <@pessoa>` · `{&banglobal.lembrar} <@pessoa>` · `{&banglobal.ignorados}` · `{&banglobal.bots} [confirmar]`",
      en: "Ban list shared across Judy's servers. Every ban here goes on it; an automatic ban (automod) only alerts the other servers.\n\n`{&banglobal}` — this server's mode\n`{&banglobal.isentar} <@user>` — accepts the person here despite the list (and undoes the ban, if the list did it)\n`{&banglobal.isentar.remover} <@user>` · `{&banglobal.isentos}`\n`{&banglobal.historico} <@user>` — on how many servers and when\n\n**Bot owner:**\n`{&banglobal} off|avisar|imediato|consenso` — the mode\n`{&banglobal.lista} [servidor]` — who's on the list\n`{&banglobal.varrer} [confirmar]` — checks the members (and bans)\n`{&banglobal.desfazer} [confirmar]` — reverts the bans the list applied here\n`{&banglobal.add} <id…> [reason]` · `{&banglobal.esquecer} <@user>` · `{&banglobal.lembrar} <@user>` · `{&banglobal.ignorados}` · `{&banglobal.bots} [confirmar]`",
      es: "Lista de bans compartida entre los servidores de Judy. Todo ban de aquí entra en ella; un ban automático (automod) solo alerta a los demás servidores.\n\n`{&banglobal}` — el modo de este servidor\n`{&banglobal.isentar} <@usuario>` — acepta a la persona aquí a pesar de la lista (y deshace el ban, si lo aplicó la lista)\n`{&banglobal.isentar.remover} <@usuario>` · `{&banglobal.isentos}`\n`{&banglobal.historico} <@usuario>` — en cuántos servidores y cuándo\n\n**Dueño del bot:**\n`{&banglobal} off|avisar|imediato|consenso` — el modo\n`{&banglobal.lista} [servidor]` — quién está en la lista\n`{&banglobal.varrer} [confirmar]` — revisa a los miembros (y banea)\n`{&banglobal.desfazer} [confirmar]` — revierte los bans que la lista aplicó aquí\n`{&banglobal.add} <id…> [motivo]` · `{&banglobal.esquecer} <@usuario>` · `{&banglobal.lembrar} <@usuario>` · `{&banglobal.ignorados}` · `{&banglobal.bots} [confirmar]`",
    },
    ex: { pt: "{&banglobal.historico} @fulano", en: "{&banglobal.historico} @someone", es: "{&banglobal.historico} @alguien" },
    paginas: {
      varrer: {
        titulo: {
          pt: "banglobal varrer",
          en: "banglobal varrer",
          es: "banglobal varrer",
        },
        texto: {
          pt: "O ban global age quando alguém **entra**. Quem já estava aqui quando foi\nbanido em outro servidor passava despercebido — a varredura fecha esse ponto cego.\n\n**Dois comandos, de propósito**\n`{&banglobal.revisar}` — **só mostra** quem consta na lista. Nunca bane ninguém.\n`{&banglobal.varrer}` — mostra a lista e **espera você confirmar**\n`{&banglobal.varrer.confirmar}` — ⚠️ bane de verdade\n\n**A varredura só bane nos modos `imediato` e `consenso`**\nNo `consenso`, só quem tem 3+ servidores diferentes; o resto aparece à parte.\nNos modos `off` e `avisar` ela recusa e manda usar a revisão.\n\n**Se algo sair errado**\n`{&banglobal.desfazer} [@pessoa]` — reverte os bans que a LISTA aplicou aqui (todos, ou só o de uma pessoa) e isenta quem voltou\n`{&banglobal.isentar} <@pessoa>` — poupa alguém ANTES de confirmar\n\n_O bot precisa enxergar os membros e ter **BanMembers**, com o cargo dele_\n_acima do cargo da pessoa. Falhas aparecem no fim do relatório._",
          en: "The global ban acts when someone **joins**. Anyone already here when they got\nbanned elsewhere went unnoticed — the sweep closes that blind spot.\n\n**Two commands, on purpose**\n`{&banglobal.revisar}` — **shows only** who's on the list. Never bans anyone.\n`{&banglobal.varrer}` — shows the list and **waits for your confirmation**\n`{&banglobal.varrer.confirmar}` — ⚠️ actually bans\n\n**The sweep only bans in `imediato` and `consenso` modes**\nIn `consenso`, only people with 3+ different servers; the rest are listed apart.\nIn `off` and `avisar` it refuses and points to the review.\n\n**If something goes wrong**\n`{&banglobal.desfazer} [@user]` — reverts the bans THE LIST applied here (all of them, or just one person's) and exempts whoever came back\n`{&banglobal.isentar} <@user>` — spare someone BEFORE confirming\n\n_The bot needs to see the members and have **BanMembers**, with its role_\n_above the person's. Failures show at the end of the report._",
          es: "El ban global actúa cuando alguien **entra**. Quien ya estaba aquí cuando lo banearon\nen otro servidor pasaba desapercibido — el barrido cierra ese punto ciego.\n\n**Dos comandos, a propósito**\n`{&banglobal.revisar}` — **solo muestra** quién está en la lista. Nunca banea a nadie.\n`{&banglobal.varrer}` — muestra la lista y **espera tu confirmación**\n`{&banglobal.varrer.confirmar}` — ⚠️ banea de verdad\n\n**El barrido solo banea en los modos `instant` y `consensus`**\nEn `consensus`, solo a quien tiene 3+ servidores distintos; el resto aparece aparte.\nEn `off` y `warn` se niega y te remite a la revisión.\n\n**Si algo sale mal**\n`{&banglobal.desfazer} [@usuario]` — revierte los bans que LA LISTA aplicó aquí (todos, o solo el de una persona) y exime a quien volvió\n`{&banglobal.isentar} <@usuario>` — salva a alguien ANTES de confirmar\n\n_El bot necesita ver a los miembros y tener **BanMembers**, con su rol_\n_por encima del de la persona. Los fallos aparecen al final del informe._",
        },
      },
      pessoas: {
        titulo: {
          pt: "banglobal pessoas",
          en: "banglobal pessoas",
          es: "banglobal pessoas",
        },
        texto: {
          pt: "**Como indicar alguém** — todo comando do `banglobal` aceita:\n\n• **menção** — `@fulano` (a mais segura: você clicou nela)\n• **ID** — `01ARZ3NDEKTSV4RRFFQ69G5FAV`\n• **link do perfil** — o que o cliente copia\n• **nome** — `Renan`, sem diferenciar maiúscula\n• **nome com tag** — `AutoMod#0800`, como aparece no perfil\n• **apelido no servidor**\n\nA busca passa pelos **membros**, pelos **banidos** do servidor e pela\n**própria lista global** — por isso funciona para quem já saiu, que é\njustamente quem esses comandos costumam tratar.\n\n**Nome ambíguo não vira chute**\nSe `Ren` bate em Renan e Renata, eu mostro os dois com os IDs e não faço\nnada. Banir a pessoa errada por causa de um apelido parecido não se\ndesfaz com um pedido de desculpas.\n\n**Se a pessoa não está em nenhum servidor em comum**, só o ID funciona —\ne ele aparece em `{&banglobal.lista}`.",
          en: "**How to point at someone** — every `banglobal` command accepts:\n\n• **mention** — `@someone` (the safest: you clicked it)\n• **ID** — `01ARZ3NDEKTSV4RRFFQ69G5FAV`\n• **profile link** — whatever the client copies\n• **name** — `Renan`, case-insensitive\n• **name with tag** — `AutoMod#0800`, as shown on the profile\n• **server nickname**\n\nThe search goes through the **members**, the server's **banned users** and\nthe **global list itself** — which is why it works for people who already\nleft, and those are exactly who these commands deal with.\n\n**An ambiguous name doesn't become a guess**\nIf `Ren` matches Renan and Renata, I show both with their IDs and do\nnothing. Banning the wrong person over a similar nickname isn't something\nan apology undoes.\n\n**If they're not in any shared server**, only the ID works —\nand it shows in `{&banglobal.lista}`.",
          es: "**Cómo señalar a alguien** — todo comando de `banglobal` acepta:\n\n• **mención** — `@alguien` (la más segura: hiciste clic en ella)\n• **ID** — `01ARZ3NDEKTSV4RRFFQ69G5FAV`\n• **enlace del perfil** — lo que copie el cliente\n• **nombre** — `Renan`, sin distinguir mayúsculas\n• **nombre con tag** — `AutoMod#0800`, como aparece en el perfil\n• **apodo en el servidor**\n\nLa búsqueda pasa por los **miembros**, los **baneados** del servidor y la\n**propia lista global** — por eso funciona con quien ya se fue, que es\njusto de quien suelen ocuparse estos comandos.\n\n**Un nombre ambiguo no se convierte en una apuesta**\nSi `Ren` coincide con Renan y Renata, muestro a los dos con sus IDs y no hago\nnada. Banear a la persona equivocada por un apodo parecido no es algo\nque se arregle pidiendo perdón.\n\n**Si no está en ningún servidor en común**, solo funciona el ID —\ny aparece en `{&banglobal.lista}`.",
        },
      },
      bots: {
        titulo: {
          pt: "banglobal bots",
          en: "banglobal bots",
          es: "banglobal bots",
        },
        texto: {
          pt: "**Bots não entram na lista global.**\n\nUm bot não escolhe entrar em lugar nenhum: alguém o adiciona. Se ele foi\nbanido num servidor, isso é assunto de quem o adicionou lá — não é\nhistórico de comportamento que faça sentido carregar para os outros.\n\nPior: bots populares acabam banidos em algum servidor mais cedo ou mais\ntarde. A lista se encheria justamente dos mais usados, e o modo `imediato`\npassaria a derrubar integrações que o dono do servidor acabou de instalar.\n\n**O que já valia antes continua lá**\n`{&banglobal.bots}` — mostra os bots que ainda constam na lista\n`{&banglobal.bots.confirmar}` — remove todos\n\n_Daqui para a frente eles não entram: nem na importação, nem no ban_\n_manual, nem no automod. E um bot que entra num servidor nunca é banido_\n_pela lista, mesmo que conste nela._",
          en: "**Bots don't enter the global list.**\n\nA bot doesn't choose to join anywhere: someone adds it. If it got banned on\na server, that's between it and whoever added it there — it isn't\nbehaviour history worth carrying to other servers.\n\nWorse: popular bots end up banned somewhere sooner or later. The list would\nfill up with the most widely used ones, and `imediato` mode would start\nknocking out integrations the server owner just installed.\n\n**What got in before is still there**\n`{&banglobal.bots}` — shows the bots still on the list\n`{&banglobal.bots.confirmar}` — removes them all\n\n_From now on they don't get in: not through the import, not through a_\n_manual ban, not through automod. And a bot joining a server is never_\n_banned by the list, even if it's on it._",
          es: "**Los bots no entran en la lista global.**\n\nUn bot no elige entrar en ningún sitio: alguien lo añade. Si lo banearon en\nun servidor, es asunto suyo y de quien lo añadió allí — no es un\nhistorial de comportamiento que valga la pena llevar a otros servidores.\n\nPeor: los bots populares acaban baneados en algún sitio tarde o temprano. La lista\nse llenaría justo de los más usados, y el modo `instant` empezaría a\ntumbar integraciones que el dueño del servidor acaba de instalar.\n\n**Lo que entró antes sigue ahí**\n`{&banglobal.bots}` — muestra los bots que siguen en la lista\n`{&banglobal.bots.confirmar}` — los quita todos\n\n_A partir de ahora no entran: ni por la importación, ni por un ban_\n_manual, ni por el automod. Y un bot que entra en un servidor nunca es_\n_baneado por la lista, aunque esté en ella._",
        },
      },
      isentar: {
        titulo: {
          pt: "banglobal isentar",
          en: "banglobal isentar",
          es: "banglobal isentar",
        },
        texto: {
          pt: "A lista global é feita do critério de moderação de **outros** servidores.\nÀs vezes ele não é o seu: a pessoa levou ban num servidor de jogo por bater\nboca e, aqui, é bem-vinda.\n\n`{&banglobal.isentar} <@pessoa|id>` — aceita a pessoa **neste servidor**\n`{&banglobal.isentos}` — quem está isento aqui\n`{&banglobal.isentar.remover} <@pessoa>` — volta a tratá-la pela lista\n\n**O que a isenção faz**\n• ela entra e fica, mesmo constando na lista\n• a varredura passa por ela sem tocá-la\n• se o bot já a tinha banido por causa da lista, o ban é **desfeito** na hora\n\n**Isentar ≠ esquecer**\n`isentar` vale **só aqui** e não mexe no registro dos outros servidores.\n`{&banglobal.esquecer}` _(só o dono do bot)_ apaga o registro **para todo mundo** — use quando o\nban em si não se sustenta, não quando é só você que discorda dele.\n\n_Desbanir remove o impedimento, não traz a pessoa de volta: mande um convite novo._",
          en: "The global list is built from **other** servers' moderation judgement.\nSometimes that isn't yours: someone got banned on a game server for\narguing and, here, they're welcome.\n\n`{&banglobal.isentar} <@user|id>` — accepts that person **on this server**\n`{&banglobal.isentos}` — who is exempt here\n`{&banglobal.isentar.remover} <@user>` — makes the list apply to them again\n\n**What the exemption does**\n• they join and stay, even while on the list\n• the sweep walks past them\n• if the bot had already banned them over the list, that ban is **undone** at once\n\n**Exempt ≠ forget**\n`isentar` applies **here only** and leaves other servers' records intact.\n`{&banglobal.esquecer}` _(bot owner only)_ deletes the record **for everyone** — use it when the\nban itself doesn't hold up, not when you simply disagree with it.\n\n_Unbanning removes the block, it doesn't bring anyone back: send a fresh invite._",
          es: "La lista global se forma con el criterio de moderación de **otros** servidores.\nA veces no es el tuyo: a alguien lo banearon en un servidor de juegos por\ndiscutir y, aquí, es bienvenido.\n\n`{&banglobal.isentar} <@usuario|id>` — acepta a esa persona **en este servidor**\n`{&banglobal.isentos}` — quién está exento aquí\n`{&banglobal.isentar.remover} <@usuario>` — hace que la lista vuelva a aplicarse\n\n**Qué hace la exención**\n• entra y se queda, aunque esté en la lista\n• el barrido pasa de largo\n• si el bot ya la había baneado por la lista, ese ban se **deshace** al momento\n\n**Eximir ≠ olvidar**\n`exempt` vale **solo aquí** y no toca los registros de otros servidores.\n`{&banglobal.esquecer}` _(solo el dueño del bot)_ borra el registro **para todos** — úsalo cuando el\nban en sí no se sostiene, no cuando simplemente no estás de acuerdo.\n\n_Desbanear quita el bloqueo, no trae a nadie de vuelta: envía una invitación nueva._",
        },
      },
      lista: {
        titulo: {
          pt: "banglobal lista",
          en: "banglobal lista",
          es: "banglobal lista",
        },
        texto: {
          pt: "`{&banglobal.lista}` — todo mundo que consta na lista global, em páginas (reaja ◀ ▶)\n`{&banglobal.lista.servidor}` — só quem **este** servidor baniu\n\nCada linha traz em quantos servidores a pessoa foi banida e quando foi a vez\nmais recente. O 🛡️ marca quem está **isento** aqui.\n\nPara o detalhe de um caso: `{&banglobal.historico} <@pessoa>` — os servidores,\nos motivos e a origem de cada registro.",
          en: "`{&banglobal.lista}` — everyone on the global list, in pages (react ◀ ▶)\n`{&banglobal.lista.servidor}` — only the ones **this** server banned\n\nEach line shows how many servers banned that person and when the latest one\nwas. The 🛡️ marks whoever is **exempt** here.\n\nFor one case in detail: `{&banglobal.historico} <@user>` — the servers, the\nreasons and the origin of each record.",
          es: "`{&banglobal.lista}` — todos los que están en la lista global, en páginas (reacciona ◀ ▶)\n`{&banglobal.lista.servidor}` — solo los que baneó **este** servidor\n\nCada línea muestra en cuántos servidores banearon a esa persona y cuándo fue la\núltima vez. El 🛡️ marca a quien está **exento** aquí.\n\nPara ver un caso en detalle: `{&banglobal.historico} <@usuario>` — los servidores, los\nmotivos y el origen de cada registro.",
        },
      },
      contribuicao: {
        titulo: {
          pt: "banglobal contribuição",
          en: "banglobal contribution",
          es: "banglobal contribución",
        },
        texto: {
          pt: "**Todo servidor onde o bot está alimenta a lista. Sempre.**\nNão há comando para ligar, desligar ou importar à mão.\n\n**O que entra sozinho**\n• Bans **novos** — no instante em que acontecem (automod ou `{&ban}`).\n• Bans **antigos** — sincronizados ~1 min após o bot subir e a cada 6h.\n• Servidor **novo** — o histórico entra assim que o bot é adicionado.\n\n**O que ainda é escolha sua**\n`{&banglobal} <off|avisar|imediato|consenso>` — se ESTE servidor se aproveita da lista.\n`imediato` bane com **um** ban em outro servidor; `consenso` só com **3+ servidores diferentes** (abaixo disso, avisa a staff). Os bans que a própria lista aplicou não contam para o consenso.\nDá para não usar a lista; não dá para usá-la sem alimentá-la.\n\n**Pôr alguém na lista à mão**\n`{&banglobal} add <id> [id…] [motivo]` — **só o dono do bot**: entra **pelo ID**, mesmo sem a pessoa estar em nenhum servidor da Judy (a conta é conferida no Stoat; bot e ID inexistente ficam de fora). Quem já está num servidor da Judy sente na hora\n\n**Se um registro não se sustentar**\n`{&banglobal.esquecer} <@usuário|id|nome> [nota]` — **só o dono do bot**: tira da lista de **todos** os servidores e **mantém fora** (bans futuros não o trazem de volta)\n`{&banglobal.ignorados}` — quem está fora · `{&banglobal.lembrar} <@pessoa>` desfaz\n`{&banglobal.historico} <@usuário|id>` — onde e por que foi banido\n\n_Registros já existentes não são duplicados._\n_Vale pensar antes de adicionar o bot a um servidor de terceiros: o critério de moderação de lá passa a valer para os seus._",
          en: "**Every server the bot is in feeds the list. Always.**\nThere's no command to enable, disable or import by hand.\n\n**What goes in on its own**\n• **New** bans — the moment they happen (automod or `{&ban}`).\n• **Old** bans — synced ~1 min after the bot boots and every 6h.\n• A **new** server — its history goes in as soon as the bot is added.\n\n**What's still your choice**\n`{&banglobal} <off|avisar|imediato|consenso>` — whether THIS server benefits from the list.\n`imediato` bans on **one** ban elsewhere; `consenso` only with **3+ different servers** (below that, it alerts the staff). Bans the list itself applied don't count toward consensus.\nYou can opt out of using the list; you can't use it without feeding it.\n\n**Putting someone on the list by hand**\n`{&banglobal} add <id> [id…] [reason]` — **bot owner only**: goes in **by ID**, even if they're in none of Judy's servers (the account is checked with Stoat; bots and non-existent IDs stay out). Anyone already in one of Judy's servers feels it right away\n\n**If a record doesn't hold up**\n`{&banglobal.esquecer} <@user|id|name> [note]` — **bot owner only**: drops it from the list for **every** server and **keeps it out** (future bans won't bring it back)\n`{&banglobal.ignorados}` — who is kept out · `{&banglobal.lembrar} <@user>` undoes it\n`{&banglobal.historico} <@user|id>` — where and why they were banned\n\n_Existing records aren't duplicated._\n_Worth a thought before adding the bot to someone else's server: their moderation standards become yours._",
          es: "**Todo servidor donde está el bot alimenta la lista. Siempre.**\nNo hay comando para activar, desactivar ni importar a mano.\n\n**Lo que entra solo**\n• Bans **nuevos** — en el momento en que ocurren (automod o `{&ban}`).\n• Bans **antiguos** — sincronizados ~1 min después de que arranca el bot y cada 6h.\n• Un servidor **nuevo** — su historial entra en cuanto se añade el bot.\n\n**Lo que sigue siendo tu elección**\n`{&banglobal} <off|warn|instant|consensus>` — si ESTE servidor se beneficia de la lista.\n`instant` banea con **un** ban en otro servidor; `consensus` solo con **3+ servidores distintos** (por debajo de eso, avisa al staff). Los bans que aplicó la propia lista no cuentan para el consenso.\nPuedes no usar la lista; no puedes usarla sin alimentarla.\n\n**Poner a alguien en la lista a mano**\n`{&banglobal} add <id> [id…] [motivo]` — **solo el dueño del bot**: entra **por ID**, aunque no esté en ningún servidor de Judy (la cuenta se comprueba con Stoat; los bots y los IDs inexistentes quedan fuera). Quien ya esté en un servidor de Judy lo nota al momento\n\n**Si un registro no se sostiene**\n`{&banglobal.esquecer} <@usuario|id|nombre> [nota]` — **solo el dueño del bot**: lo quita de la lista de **todos** los servidores y **lo mantiene fuera** (los bans futuros no lo traen de vuelta)\n`{&banglobal} ignored` — quién está fuera · `{&banglobal} remember <@usuario>` lo deshace\n`{&banglobal.historico} <@usuario|id>` — dónde y por qué lo banearon\n\n_Los registros que ya existen no se duplican._\n_Piénsalo antes de añadir el bot al servidor de otra persona: su criterio de moderación pasa a ser el tuyo._",
        },
      },
    },
    parametros: [
      { nome: { pt: "Modos", en: "Modes", es: "Modos" }, desc: {
        pt: "`off` ignora · `avisar` alerta a staff quando um banido entra · `imediato` bane quem foi banido em outro servidor · `consenso` bane só com 3+ servidores diferentes",
        en: "`off` ignores · `warn` alerts the staff when a banned user joins · `instant` bans whoever was banned on another server · `consensus` bans only with 3+ different servers",
        es: "`off` ignora · `warn` avisa al staff cuando entra un baneado · `instant` banea a quien fue baneado en otro servidor · `consensus` banea solo con 3+ servidores distintos" } },
      { nome: { pt: "Como indicar alguém", en: "How to point at someone", es: "Cómo señalar a alguien" }, desc: {
        pt: "menção · ID · link do perfil · nome · `Nome#0000`. Nome ambíguo: eu mostro os candidatos em vez de escolher",
        en: "mention · ID · profile link · name · `Name#0000`. Ambiguous name: I show the candidates instead of picking",
        es: "mención · ID · enlace del perfil · nombre · `Nombre#0000`. Nombre ambiguo: muestro los candidatos en lugar de elegir" } },
    ],
  },
};
