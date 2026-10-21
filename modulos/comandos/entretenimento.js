// &entretenimento — ship, briga, cowsay, bola8… e os jogos (campo minado, velha)

export default {
  id: "entretenimento",
  modulo: "../ferramentas/entretenimento.js",
  funcao: "cmdEntretenimento",
  nomes: { en: "entertainment" },
  apelidos: ["entertainment", "fun", "ent", "entreterimento"],
  es: { nome: "entretenimiento", subcomandos: { campominado: "buscaminas", velha: "tateti" } },   // espanhol (etapa 4)
  subcomandos: {
    briga: "fight", escolher: ["choose", "pick"], nota: "rate", sorte: "fortune", zoeira: "mock",
    inverter: "reverse", bola8: "8ball",
    campominado: "minesweeper", velha: "tictactoe",   // os jogos (P7, 20 out 2026)
  },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    perm: { pt: "todo mundo", en: "everyone", es: "todos" },
    uso: { pt: "{&entretenimento} <ship|briga|cowsay|bola8|escolher|nota|sorte|zoeira|inverter|campominado|velha>", en: "{&entretenimento} <ship|fight|cowsay|8ball|choose|rate|fortune|mock|reverse|minesweeper|tictactoe>", es: "{&entretenimento} <ship|fight|cowsay|8ball|choose|rate|fortune|mock|reverse|minesweeper|tictactoe>" },
    desc: { pt: "A família das **brincadeiras**. Cada uma mora aqui dentro:\n\n`ship @a @b` — quantos % combinam (o mesmo par dá sempre o mesmo %), com o nome do casal\n`briga @a @b` — quem ganha numa briga, rodada por rodada, com crítico e erro\n`cowsay [bicho] [pensa] <texto>` — um bicho em ASCII falando (ou pensando) o texto · `cowsay figuras` lista os bichos\n`bola8 <pergunta>` — a bola mágica responde\n`escolher a | b | c` — escolho uma (também vale `a, b ou c`)\n`nota <coisa>` — nota de 0 a 10, fixa para a mesma coisa\n`sorte` — a sua sorte do dia, com número da sorte\n`zoeira <texto>` · `inverter <texto>` — tExTo De ZoEiRa · texto ao contrário\n`campominado [facil|medio|dificil]` — campo minado de spoilers\n`velha [@pessoa]` — jogo da velha por reação (sem ninguém, contra a Judy)\n\nCom **uma** pessoa só, o outro lado é você. Coisas também valem: `ship pizza e abacaxi`, `briga Goku x Superman`.\n_Ninguém é mencionado nas respostas: os nomes saem em texto, sem notificar._", en: "The **fun & games** family. Each one lives in here:\n\n`ship @a @b` — how many % they match (the same pair always gets the same %), plus the ship name\n`fight @a @b` — who wins a fight, round by round, with crits and misses\n`cowsay [critter] [think] <text>` — an ASCII critter saying (or thinking) your text · `cowsay figures` lists the critters\n`8ball <question>` — the magic 8-ball answers\n`choose a | b | c` — I pick one (`a, b or c` works too)\n`rate <thing>` — a 0–10 rating, fixed for the same thing\n`fortune` — your fortune for the day, with a lucky number\n`mock <text>` · `reverse <text>` — mOcKiNg TeXt · text backwards\n`minesweeper [easy|medium|hard]` — a spoiler minesweeper\n`tictactoe [@user]` — tic-tac-toe by reaction (with nobody, against Judy)\n\nWith **one** person only, the other side is you. Things work too: `ship pizza and pineapple`, `fight Goku x Superman`.\n_Nobody gets pinged by the answers: names come out as plain text._", es: "La familia de los **juegos y bromas**. Cada uno vive aquí dentro:\n\n`ship @a @b` — qué % combinan (la misma pareja da siempre el mismo %), con el nombre de la pareja\n`fight @a @b` — quién gana una pelea, ronda a ronda, con críticos y fallos\n`cowsay [bicho] [think] <texto>` — un bicho en ASCII diciendo (o pensando) el texto · `cowsay figures` lista los bichos\n`8ball <pregunta>` — la bola mágica responde\n`choose a | b | c` — elijo una (también vale `a, b or c`)\n`rate <cosa>` — nota de 0 a 10, fija para la misma cosa\n`fortune` — tu suerte del día, con número de la suerte\n`mock <texto>` · `reverse <texto>` — tExTo De BuRlA · texto al revés\n`minesweeper [easy|medium|hard]` — buscaminas con spoilers\n`tictactoe [@usuario]` — tres en raya por reacción (sin nadie, contra Judy)\n\nCon **una** sola persona, el otro lado eres tú. También valen cosas: `ship pizza and pineapple`, `fight Goku x Superman`.\n_Nadie es mencionado en las respuestas: los nombres salen como texto, sin notificar._" },
    ex: "{&entretenimento} ship @Ana @Bia",
  },
};
