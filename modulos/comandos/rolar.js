// &rolar — dados de RPG de mesa

export default {
  id: "rolar",
  modulo: "../ferramentas/dados-rpg.js",
  funcao: "cmdRolar",
  nomes: { en: "roll" },
  apelidos: ["r", "roll", "dado", "dados"],
  es: { nome: "dados", subcomandos: { moeda: "moneda" } },   // espanhol (etapa 4)
  subcomandos: { moeda: "coin" },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    perm: { pt: "todo mundo", en: "everyone", es: "todos" },
    uso: {
      pt: "{&rolar} <expressão> | adv | des | moeda | gm <expressão>",
      en: "{&rolar} <expression> | adv | des | coin | gm <expression>",
      es: "{&rolar} <expresión> | ventaja | desventaja | moneda | gm <expresión>",
    },
    desc: {
      pt: "Dados de RPG de mesa, com tudo:\n`2d20kh1+5` mantém o maior · `4d6kh3` descarta o menor dado\n`adv`/`des` — vantagem/desvantagem · `3d6!` — explosão\n`8d10>=7` — conta sucessos · `d%` · `4dF` (Fate) · `moeda`\n`6x(4d6kh3)` — repete (seis atributos de uma vez)\n`1d20+7 # Percepção` — rótulo na rolagem\n`gm 1d20` — **secreta**: o resultado vai por DM e o pedido some do canal.\n20 natural ganha 🎯, 1 natural ganha 💀.",
      en: "Tabletop RPG dice, fully loaded:\n`2d20kh1+5` keep highest · `4d6kh3` drop the lowest die\n`adv`/`des` — advantage/disadvantage · `3d6!` — exploding\n`8d10>=7` — count successes · `d%` · `4dF` (Fate) · `coin`\n`6x(4d6kh3)` — repeat (six ability scores at once)\n`1d20+7 # Perception` — label the roll\n`gm 1d20` — **secret**: result goes by DM and the request vanishes from the channel.\nNatural 20 gets 🎯, natural 1 gets 💀.",
      es: "Dados de rol de mesa, con todo:\n`2d20kh1+5` mantiene el mayor · `4d6kh3` descarta el dado más bajo\n`ventaja`/`desventaja` (o `adv`/`des`) · `3d6!` — dados que explotan\n`8d10>=7` — cuenta éxitos · `d%` · `4dF` (Fate) · `moneda`\n`6x(4d6kh3)` — repite (seis atributos de una vez)\n`1d20+7 # Percepción` — etiqueta en la tirada\n`gm 1d20` — **secreta**: el resultado va por DM y el pedido desaparece del canal.\nUn 20 natural gana 🎯, un 1 natural gana 💀.",
    },
    ex: { pt: "{&rolar} 2d20kh1+5 # Ataque", en: "{&rolar} 2d20kh1+5 # Attack", es: "{&rolar} 2d20kh1+5 # Ataque" },
  },
};
