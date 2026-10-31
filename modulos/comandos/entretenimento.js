// &entretenimento — ship, briga, cowsay, bola8… e os jogos (campo minado, velha)

export default {
  id: "entretenimento",
  modulo: "../ferramentas/entretenimento.js",
  funcao: "cmdEntretenimento",
  nomes: { en: "entertainment" },
  apelidos: ["entertainment", "fun", "ent", "entreterimento"],
  es: { nome: "entretenimiento", subcomandos: { campominado: "buscaminas", velha: "tateti", briga: "pelea", escolher: "elegir", nota: "nota", sorte: "suerte", zoeira: "burla", inverter: "invertir", bola8: "bola8" } },   // espanhol (etapa 4)
  subcomandos: {
    briga: "fight", escolher: ["choose", "pick"], nota: "rate", sorte: "fortune", zoeira: "mock",
    inverter: "reverse", bola8: "8ball",
    campominado: "minesweeper", velha: "tictactoe",   // os jogos (P7, 20 out 2026)
    ship: "ship", cowsay: "cowsay",   // P2 (31 out 2026): no registro, com ajuda própria
  },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    grupo: "diversao",
    paginas: {
      "ship": {
        "titulo": {
          "pt": "entretenimento ship",
          "en": "entretenimento ship",
          "es": "entretenimento ship"
        },
        "texto": {
          "pt": "Quantos **%** duas pessoas (ou duas coisas) combinam, com uma barra de corações, um veredito e o **nome do casal** (metade de um nome + metade do outro).\n\n`{&entretenimento} ship @Ana @Bia` — as duas\n`{&entretenimento} ship @Ana` — você com a Ana\n`{&entretenimento} ship pizza e abacaxi` — coisas também valem (separe com `e`, `x` ou `|`)\n\n_O mesmo par dá **sempre** o mesmo %, em qualquer ordem — dá para discutir o resultado, não para repetir até sair 100%._",
          "en": "How many **%** two people (or two things) match, with a bar of hearts, a verdict and the **ship name** (half of one name + half of the other).\n\n`{&entretenimento} ship @Ana @Bia` — those two\n`{&entretenimento} ship @Ana` — you and Ana\n`{&entretenimento} ship pizza and pineapple` — things work too (separate with `and`, `x` or `|`)\n\n_The same pair **always** gets the same %, in any order — you can argue with the result, not reroll it until it says 100%._",
          "es": "Cuántos **%** combinan dos personas (o dos cosas), con una barra de corazones, un veredicto y el **nombre de la pareja** (la mitad de un nombre + la mitad del otro).\n\n`{&entretenimento} ship @Ana @Bia` — esas dos\n`{&entretenimento} ship @Ana` — tú y Ana\n`{&entretenimento} ship pizza and pineapple` — las cosas también valen (separa con `and`, `x` o `|`)\n\n_La misma pareja da **siempre** el mismo %, en cualquier orden — puedes discutir el resultado, no repetirlo hasta que salga 100%._"
        }
      },
      "briga": {
        "titulo": {
          "pt": "entretenimento briga",
          "en": "entretenimento fight",
          "es": "entretenimento fight"
        },
        "texto": {
          "pt": "**Quem ganha numa briga.** Cada um começa com 100 de vida e eles se revezam até alguém cair (ou acabarem as 8 rodadas — aí ganha quem tiver mais vida).\n\n👊 golpe normal (10–35) · 💥 **crítico** (dano em dobro) · 💨 erro (às vezes a pessoa cai sozinha)\n\n`{&entretenimento.briga} @Ana @Bia` · `{&entretenimento.briga} @Ana` (você contra a Ana)\n`{&entretenimento.briga} Goku x Superman` — personagens e coisas também\n\n_Diferente do ship, cada briga é uma briga nova: a revanche existe._",
          "en": "**Who wins a fight.** Each side starts with 100 HP and they take turns until someone drops (or 8 rounds pass — then whoever has more HP wins).\n\n👊 normal hit (10–35) · 💥 **critical** (double damage) · 💨 miss (sometimes they trip on their own)\n\n`{&entretenimento.briga} @Ana @Bia` · `{&entretenimento.briga} @Ana` (you against Ana)\n`{&entretenimento.briga} Goku x Superman` — characters and things too\n\n_Unlike ship, every fight is a new fight: rematches exist._",
          "es": "**Quién gana una pelea.** Cada lado empieza con 100 de vida y se turnan hasta que alguien cae (o pasan 8 rondas — entonces gana quien tenga más vida).\n\n👊 golpe normal (10–35) · 💥 **crítico** (daño doble) · 💨 fallo (a veces se tropiezan solos)\n\n`{&entretenimento.briga} @Ana @Bia` · `{&entretenimento.briga} @Ana` (tú contra Ana)\n`{&entretenimento.briga} Goku x Superman` — personajes y cosas también\n\n_A diferencia del ship, cada pelea es una pelea nueva: la revancha existe._"
        }
      },
      "cowsay": {
        "titulo": {
          "pt": "entretenimento cowsay",
          "en": "entretenimento cowsay",
          "es": "entretenimento cowsay"
        },
        "texto": {
          "pt": "Um **bicho em ASCII** falando o seu texto num balão — a brincadeira clássica dos terminais.\n\n`{&entretenimento} cowsay Muuu!` — a vaca fala\n`{&entretenimento} cowsay gato oi` — escolha o bicho: `vaca`, `pinguim`, `gato`, `dragao`, `robo`, `fantasma`\n`{&entretenimento} cowsay pensa hmm` — balão de **pensamento** em vez de fala\n`{&entretenimento} cowsay figuras` — lista os bichos\n\n_Até 300 caracteres; o balão quebra as linhas sozinho._",
          "en": "An **ASCII critter** saying your text in a speech balloon — the classic terminal toy.\n\n`{&entretenimento} cowsay Moo!` — the cow speaks\n`{&entretenimento} cowsay cat hi` — pick the critter: `cow`, `penguin`, `cat`, `dragon`, `robot`, `ghost`\n`{&entretenimento} cowsay think hmm` — a **thought** balloon instead of speech\n`{&entretenimento} cowsay figures` — lists the critters\n\n_Up to 300 characters; the balloon wraps lines on its own._",
          "es": "Un **bicho en ASCII** diciendo tu texto en un globo — el clásico juguete de terminal.\n\n`{&entretenimento} cowsay ¡Muu!` — habla la vaca\n`{&entretenimento} cowsay cat hola` — elige el bicho: `cow`, `penguin`, `cat`, `dragon`, `robot`, `ghost`\n`{&entretenimento} cowsay think mmm` — un globo de **pensamiento** en vez de habla\n`{&entretenimento} cowsay figures` — lista los bichos\n\n_Hasta 300 caracteres; el globo corta las líneas solo._"
        }
      },
      "bola8": {
        "titulo": {
          "pt": "entretenimento bola8",
          "en": "entretenimento 8ball",
          "es": "entretenimento 8ball"
        },
        "texto": {
          "pt": "A **bola 8 mágica**: faça uma pergunta de sim ou não e ela responde — às vezes sim, às vezes não, às vezes \"pergunte depois\".\n\n`{&entretenimento.bola8} vai chover amanhã?`",
          "en": "The **magic 8-ball**: ask a yes-or-no question and it answers — sometimes yes, sometimes no, sometimes \"ask later\".\n\n`{&entretenimento.bola8} will it rain tomorrow?`",
          "es": "La **bola 8 mágica**: haz una pregunta de sí o no y responde — a veces sí, a veces no, a veces \"pregunta más tarde\".\n\n`{&entretenimento.bola8} ¿lloverá mañana?`"
        }
      },
      "escolher": {
        "titulo": {
          "pt": "entretenimento escolher",
          "en": "entretenimento choose",
          "es": "entretenimento choose"
        },
        "texto": {
          "pt": "**Escolhe por você** entre duas ou mais opções (até 20).\n\n`{&entretenimento.escolher} pizza | hambúrguer | sushi`\n`{&entretenimento.escolher} pizza, sushi ou lasanha`",
          "en": "**Picks for you** between two or more options (up to 20).\n\n`{&entretenimento.escolher} pizza | burger | sushi`\n`{&entretenimento.escolher} pizza, sushi or lasagna`",
          "es": "**Elige por ti** entre dos o más opciones (hasta 20).\n\n`{&entretenimento.escolher} pizza | hamburguesa | sushi`\n`{&entretenimento.escolher} pizza, sushi or lasaña`"
        }
      },
      "nota": {
        "titulo": {
          "pt": "entretenimento nota",
          "en": "entretenimento rate",
          "es": "entretenimento rate"
        },
        "texto": {
          "pt": "**Nota de 0 a 10** para qualquer coisa — um filme, uma comida, uma pessoa — com estrelas e um comentário.\n\n`{&entretenimento.nota} lasanha` · `{&entretenimento.nota} @Ana`\n\n_A mesma coisa recebe sempre a mesma nota (maiúsculas e acentos não mudam nada)._",
          "en": "**A 0–10 rating** for anything — a movie, a food, a person — with stars and a comment.\n\n`{&entretenimento.nota} lasagna` · `{&entretenimento.nota} @Ana`\n\n_The same thing always gets the same rating (case and accents don't change it)._",
          "es": "**Una nota de 0 a 10** para cualquier cosa — una película, una comida, una persona — con estrellas y un comentario.\n\n`{&entretenimento.nota} lasaña` · `{&entretenimento.nota} @Ana`\n\n_La misma cosa recibe siempre la misma nota (las mayúsculas y los acentos no cambian nada)._"
        }
      },
      "sorte": {
        "titulo": {
          "pt": "entretenimento sorte",
          "en": "entretenimento fortune",
          "es": "entretenimento fortune"
        },
        "texto": {
          "pt": "A **sua sorte de hoje**, como um biscoito da sorte, com um número da sorte.\n\n`{&entretenimento.sorte}`\n\n_Cada pessoa tem a sua, e ela fica igual o dia inteiro — muda à meia-noite (UTC)._",
          "en": "**Your fortune for today**, like a fortune cookie, with a lucky number.\n\n`{&entretenimento.sorte}`\n\n_Everyone gets their own, and it stays the same all day — it changes at midnight (UTC)._",
          "es": "**Tu suerte de hoy**, como una galleta de la fortuna, con un número de la suerte.\n\n`{&entretenimento.sorte}`\n\n_Cada persona tiene la suya, y es la misma todo el día — cambia a medianoche (UTC)._"
        }
      },
      "zoeira": {
        "titulo": {
          "pt": "entretenimento zoeira",
          "en": "entretenimento mock",
          "es": "entretenimento mock"
        },
        "texto": {
          "pt": "Devolve o texto **aLtErNaNdO** maiúsculas e minúsculas — o jeito clássico de repetir alguém com deboche.\n\n`{&entretenimento.zoeira} eu nunca erro`",
          "en": "Gives the text back **aLtErNaTiNg** upper and lower case — the classic way to repeat someone mockingly.\n\n`{&entretenimento.zoeira} i am never wrong`",
          "es": "Devuelve el texto **aLtErNaNdO** mayúsculas y minúsculas — la forma clásica de repetir a alguien con burla.\n\n`{&entretenimento.zoeira} nunca me equivoco`"
        }
      },
      "inverter": {
        "titulo": {
          "pt": "entretenimento inverter",
          "en": "entretenimento reverse",
          "es": "entretenimento reverse"
        },
        "texto": {
          "pt": "Devolve o texto **de trás para frente** (emojis compostos ficam inteiros).\n\n`{&entretenimento.inverter} socorram-me subi no onibus em marrocos`",
          "en": "Gives the text back **backwards** (compound emoji stay whole).\n\n`{&entretenimento.inverter} never odd or even`",
          "es": "Devuelve el texto **al revés** (los emojis compuestos quedan enteros).\n\n`{&entretenimento.inverter} anita lava la tina`"
        }
      },
      "campominado": {
        "titulo": {
          "pt": "entretenimento campominado",
          "en": "entretenimento minesweeper",
          "es": "entretenimento minesweeper"
        },
        "texto": {
          "pt": "Um **campo minado** de spoilers: cada quadrado se abre com um clique. Achou 💣, perdeu.\nOs números dizem quantas minas há em volta; a casa que já vem aberta é um começo seguro.\n\n`{&entretenimento.campominado}` — médio: 8×8, 10 minas\n`{&entretenimento.campominado} facil` — 6×6, 5 minas\n`{&entretenimento.campominado} dificil` — 10×10, 18 minas\n\n_Fora dos canais de comandos, só se a staff liberar: `{&acesso.livre} entretenimento on`._",
          "en": "A **minesweeper** made of spoilers: each square opens with a click. Hit 💣 and you lose.\nThe numbers say how many mines are around; the square that comes open is a safe start.\n\n`{&entretenimento.campominado}` — medium: 8×8, 10 mines\n`{&entretenimento.campominado} easy` — 6×6, 5 mines\n`{&entretenimento.campominado} hard` — 10×10, 18 mines\n\n_Outside the command channels only if staff allows it: `{&acesso.livre} entertainment on`._",
          "es": "Un **buscaminas** hecho de spoilers: cada casilla se abre con un clic. Si sale 💣, pierdes.\nLos números dicen cuántas minas hay alrededor; la casilla que ya viene abierta es un comienzo seguro.\n\n`{&entretenimento.campominado}` — medio: 8×8, 10 minas\n`{&entretenimento.campominado} easy` — 6×6, 5 minas\n`{&entretenimento.campominado} hard` — 10×10, 18 minas\n\n_Fuera de los canales de comandos, solo si el staff lo permite: `{&acesso.livre} entertainment on`._"
        }
      },
      "velha": {
        "titulo": {
          "pt": "entretenimento velha",
          "en": "entretenimento tictactoe",
          "es": "entretenimento tictactoe"
        },
        "texto": {
          "pt": "**Jogo da velha** por reação: reaja no número da casa (1️⃣–9️⃣) quando for a sua vez.\nQuem chamou começa, com ❌.\n\n`{&entretenimento.velha} @Ana` — contra a Ana\n`{&entretenimento.velha}` — contra mim (eu jogo bem, mas dá para ganhar)\n\n_A partida acaba sozinha depois de 10 minutos parada._",
          "en": "**Tic-tac-toe** by reaction: react with the square's number (1️⃣–9️⃣) on your turn.\nWhoever started goes first, with ❌.\n\n`{&entretenimento.velha} @Ana` — against Ana\n`{&entretenimento.velha}` — against me (I play well, but you can win)\n\n_The game ends by itself after 10 minutes without a move._",
          "es": "**Tres en raya** por reacción: reacciona con el número de la casilla (1️⃣–9️⃣) en tu turno.\nQuien lo inició empieza, con ❌.\n\n`{&entretenimento.velha} @Ana` — contra Ana\n`{&entretenimento.velha}` — contra mí (juego bien, pero puedes ganar)\n\n_La partida termina sola tras 10 minutos sin jugadas._"
        }
      }
    },
    perm: { pt: "todo mundo", en: "everyone", es: "todos" },
    uso: { pt: "{&entretenimento} <ship|briga|cowsay|bola8|escolher|nota|sorte|zoeira|inverter|campominado|velha>", en: "{&entretenimento} <ship|fight|cowsay|8ball|choose|rate|fortune|mock|reverse|minesweeper|tictactoe>", es: "{&entretenimento} <ship|fight|cowsay|8ball|choose|rate|fortune|mock|reverse|minesweeper|tictactoe>" },
    desc: { pt: "A família das **brincadeiras**. Cada uma mora aqui dentro:\n\n`ship @a @b` — quantos % combinam (o mesmo par dá sempre o mesmo %), com o nome do casal\n`briga @a @b` — quem ganha numa briga, rodada por rodada, com crítico e erro\n`cowsay [bicho] [pensa] <texto>` — um bicho em ASCII falando (ou pensando) o texto · `cowsay figuras` lista os bichos\n`bola8 <pergunta>` — a bola mágica responde\n`escolher a | b | c` — escolho uma (também vale `a, b ou c`)\n`nota <coisa>` — nota de 0 a 10, fixa para a mesma coisa\n`sorte` — a sua sorte do dia, com número da sorte\n`zoeira <texto>` · `inverter <texto>` — tExTo De ZoEiRa · texto ao contrário\n`campominado [facil|medio|dificil]` — campo minado de spoilers\n`velha [@pessoa]` — jogo da velha por reação (sem ninguém, contra a Judy)\n\nCom **uma** pessoa só, o outro lado é você. Coisas também valem: `ship pizza e abacaxi`, `briga Goku x Superman`.\n_Ninguém é mencionado nas respostas: os nomes saem em texto, sem notificar._", en: "The **fun & games** family. Each one lives in here:\n\n`ship @a @b` — how many % they match (the same pair always gets the same %), plus the ship name\n`fight @a @b` — who wins a fight, round by round, with crits and misses\n`cowsay [critter] [think] <text>` — an ASCII critter saying (or thinking) your text · `cowsay figures` lists the critters\n`8ball <question>` — the magic 8-ball answers\n`choose a | b | c` — I pick one (`a, b or c` works too)\n`rate <thing>` — a 0–10 rating, fixed for the same thing\n`fortune` — your fortune for the day, with a lucky number\n`mock <text>` · `reverse <text>` — mOcKiNg TeXt · text backwards\n`minesweeper [easy|medium|hard]` — a spoiler minesweeper\n`tictactoe [@user]` — tic-tac-toe by reaction (with nobody, against Judy)\n\nWith **one** person only, the other side is you. Things work too: `ship pizza and pineapple`, `fight Goku x Superman`.\n_Nobody gets pinged by the answers: names come out as plain text._", es: "La familia de los **juegos y bromas**. Cada uno vive aquí dentro:\n\n`ship @a @b` — qué % combinan (la misma pareja da siempre el mismo %), con el nombre de la pareja\n`fight @a @b` — quién gana una pelea, ronda a ronda, con críticos y fallos\n`cowsay [bicho] [think] <texto>` — un bicho en ASCII diciendo (o pensando) el texto · `cowsay figures` lista los bichos\n`8ball <pregunta>` — la bola mágica responde\n`choose a | b | c` — elijo una (también vale `a, b or c`)\n`rate <cosa>` — nota de 0 a 10, fija para la misma cosa\n`fortune` — tu suerte del día, con número de la suerte\n`mock <texto>` · `reverse <texto>` — tExTo De BuRlA · texto al revés\n`minesweeper [easy|medium|hard]` — buscaminas con spoilers\n`tictactoe [@usuario]` — tres en raya por reacción (sin nadie, contra Judy)\n\nCon **una** sola persona, el otro lado eres tú. También valen cosas: `ship pizza and pineapple`, `fight Goku x Superman`.\n_Nadie es mencionado en las respuestas: los nombres salen como texto, sin notificar._" },
    ex: "{&entretenimento} ship @Ana @Bia",
    parametros: [
      { nome: "ship", valor: { pt: "<@a> [@b]", en: "<@a> [@b]", es: "<@a> [@b]" }, desc: { pt: "quantos % combinam (o mesmo par dá sempre o mesmo %) e o nome do casal; com uma pessoa só, o outro lado é você", en: "how many % they match (the same pair always gets the same %) and the ship name; with one person only, the other side is you", es: "qué % combinan (la misma pareja da siempre el mismo %) y el nombre de la pareja; con una sola persona, el otro lado eres tú" } },
      { nome: { pt: "briga", en: "fight", es: "fight" }, valor: "<@a> [@b]", desc: { pt: "quem ganha numa briga, rodada por rodada", en: "who wins a fight, round by round", es: "quién gana una pelea, ronda a ronda" } },
      { nome: "cowsay", valor: { pt: "[bicho] [pensa] <texto>", en: "[critter] [think] <text>", es: "[bicho] [think] <texto>" }, desc: { pt: "um bicho em ASCII falando (ou pensando) o texto; `cowsay figuras` lista os bichos", en: "an ASCII critter saying (or thinking) the text; `cowsay figures` lists the critters", es: "un bicho en ASCII diciendo (o pensando) el texto; `cowsay figures` lista los bichos" } },
      { nome: { pt: "bola8", en: "8ball", es: "8ball" }, valor: { pt: "<pergunta>", en: "<question>", es: "<pregunta>" }, desc: { pt: "a bola mágica responde", en: "the magic 8-ball answers", es: "la bola mágica responde" } },
      { nome: { pt: "escolher", en: "choose", es: "choose" }, valor: "a | b | c", desc: { pt: "escolho uma", en: "I pick one", es: "elijo una" } },
      { nome: { pt: "nota", en: "rate", es: "rate" }, valor: { pt: "<coisa>", en: "<thing>", es: "<cosa>" }, desc: { pt: "nota de 0 a 10, fixa para a mesma coisa", en: "a 0–10 rating, fixed for the same thing", es: "nota de 0 a 10, fija para la misma cosa" } },
      { nome: { pt: "sorte", en: "fortune", es: "fortune" }, desc: { pt: "a sua sorte do dia", en: "your fortune for the day", es: "tu suerte del día" } },
      { nome: { pt: "zoeira | inverter", en: "mock | reverse", es: "mock | reverse" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" }, desc: { pt: "tExTo De ZoEiRa · texto ao contrário", en: "mOcKiNg TeXt · text backwards", es: "tExTo De BuRlA · texto al revés" } },
      { nome: { pt: "campominado", en: "minesweeper", es: "buscaminas" }, valor: { pt: "[facil|medio|dificil]", en: "[easy|medium|hard]", es: "[easy|medium|hard]" }, desc: { pt: "campo minado de spoilers", en: "a spoiler minesweeper", es: "buscaminas con spoilers" } },
      { nome: { pt: "velha", en: "tictactoe", es: "tateti" }, valor: { pt: "[@pessoa]", en: "[@user]", es: "[@usuario]" }, desc: { pt: "jogo da velha por reação (sem ninguém, contra a Judy)", en: "tic-tac-toe by reaction (with nobody, against Judy)", es: "tres en raya por reacción (sin nadie, contra Judy)" } },
    ],
  },
};
