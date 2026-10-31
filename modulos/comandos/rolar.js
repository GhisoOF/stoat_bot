// &rolar — dados de RPG de mesa e a ordem de combate (iniciativa)
//
// P2 (31 out 2026): o &iniciativa virou `&rolar init …`; o nome antigo (e `init`,
// `initiative`) é um atalho para cá — quem digitava `&iniciativa add Elfa 12` continua conseguindo.

export default {
  id: "rolar",
  modulo: "../ferramentas/dados-rpg.js",
  funcao: "cmdRolar",
  nomes: { en: "roll" },
  apelidos: ["r", "roll", "dado", "dados"],
  es: { nome: "dados", subcomandos: { moeda: "moneda", init: "iniciativa", lista: "lista", remover: "quitar", limpar: "borrar" } },   // espanhol (etapa 4)
  subcomandos: { moeda: "coin", init: "initiative", lista: "list", remover: "remove", limpar: "clear" },
  aninhados: ["init"],
  atalhos: { "iniciativa|init|initiative": "rolar init" },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    grupo: "diversao",
    paginas: {
      init: {
        texto: {
          pt: "A **ordem de combate** deste canal (uma por canal; some depois de 12 h parada).\n\n`{&rolar.init} add Goblin 1d20+2` — rola e insere já ordenado (sem rolagem, `1d20`; número fixo também vale)\n`{&rolar.init} next` — passa a vez (avisa a rodada nova)\n`{&rolar.init}` — mostra a ordem, com ▶️ em quem age\n`{&rolar.init.remover} <nome>` — tira um caído · `{&rolar.init.limpar}` — encerra o combate\n\n_Até 50 na ordem. `&iniciativa` (o nome antigo) continua levando aqui._",
          en: "This channel's **combat order** (one per channel; it goes away after 12 h idle).\n\n`{&rolar.init} add Goblin 1d20+2` — rolls and inserts already sorted (no roll = `1d20`; fixed numbers work too)\n`{&rolar.init} next` — advances the turn (announcing new rounds)\n`{&rolar.init}` — shows the order, with ▶️ on whoever acts\n`{&rolar.init.remover} <name>` — drops the fallen · `{&rolar.init.limpar}` — ends the combat\n\n_Up to 50 in the order. `&initiative` (the old name) still leads here._",
          es: "El **orden de combate** de este canal (uno por canal; desaparece tras 12 h parado).\n\n`{&rolar.init} agregar Goblin 1d20+2` — tira e inserta ya ordenado (sin tirada, `1d20`; un número fijo también vale)\n`{&rolar.init} siguiente` — pasa el turno (avisa cuando empieza otra ronda)\n`{&rolar.init}` — muestra el orden, con ▶️ en quien actúa\n`{&rolar.init.remover} <nombre>` — saca a un caído · `{&rolar.init.limpar}` — termina el combate\n\n_Hasta 50 en el orden. `&iniciativa` (el nombre antiguo) sigue llevando aquí._",
        },
      },
    },
    perm: { pt: "todo mundo", en: "everyone", es: "todos" },
    uso: {
      pt: "{&rolar} <expressão> | adv | des | moeda | gm <expressão> | init …",
      en: "{&rolar} <expression> | adv | des | coin | gm <expression> | initiative …",
      es: "{&rolar} <expresión> | ventaja | desventaja | moneda | gm <expresión> | iniciativa …",
    },
    desc: {
      pt: "Dados de RPG de mesa, com tudo:\n`2d20kh1+5` mantém o maior · `4d6kh3` descarta o menor dado\n`adv`/`des` — vantagem/desvantagem · `3d6!` — explosão\n`8d10>=7` — conta sucessos · `d%` · `4dF` (Fate) · `moeda`\n`6x(4d6kh3)` — repete (seis atributos de uma vez)\n`1d20+7 # Percepção` — rótulo na rolagem\n`gm 1d20` — **secreta**: o resultado vai por DM e o pedido some do canal.\n20 natural ganha 🎯, 1 natural ganha 💀.\n\n**Iniciativa** (ordem de combate, uma por canal): `{&rolar.init} add Goblin 1d20+2` rola e insere já ordenado (sem rolagem, `1d20`; número fixo também vale) · `{&rolar.init} next` passa a vez · `{&rolar.init}` mostra a ordem · `{&rolar.init.remover} <nome>` · `{&rolar.init.limpar}` encerra.",
      en: "Tabletop RPG dice, fully loaded:\n`2d20kh1+5` keep highest · `4d6kh3` drop the lowest die\n`adv`/`des` — advantage/disadvantage · `3d6!` — exploding\n`8d10>=7` — count successes · `d%` · `4dF` (Fate) · `coin`\n`6x(4d6kh3)` — repeat (six ability scores at once)\n`1d20+7 # Perception` — label the roll\n`gm 1d20` — **secret**: result goes by DM and the request vanishes from the channel.\nNatural 20 gets 🎯, natural 1 gets 💀.\n\n**Initiative** (combat order, one per channel): `{&rolar.init} add Goblin 1d20+2` rolls and inserts already sorted (no roll = `1d20`; fixed numbers work too) · `{&rolar.init} next` advances the turn · `{&rolar.init}` shows the order · `{&rolar.init.remover} <name>` · `{&rolar.init.limpar}` ends it.",
      es: "Dados de rol de mesa, con todo:\n`2d20kh1+5` mantiene el mayor · `4d6kh3` descarta el dado más bajo\n`ventaja`/`desventaja` (o `adv`/`des`) · `3d6!` — dados que explotan\n`8d10>=7` — cuenta éxitos · `d%` · `4dF` (Fate) · `moneda`\n`6x(4d6kh3)` — repite (seis atributos de una vez)\n`1d20+7 # Percepción` — etiqueta en la tirada\n`gm 1d20` — **secreta**: el resultado va por DM y el pedido desaparece del canal.\nUn 20 natural gana 🎯, un 1 natural gana 💀.\n\n**Iniciativa** (orden de combate, una por canal): `{&rolar.init} agregar Goblin 1d20+2` tira e inserta ya ordenado (sin tirada, `1d20`; un número fijo también vale) · `{&rolar.init} siguiente` pasa el turno · `{&rolar.init}` muestra el orden · `{&rolar.init.remover} <nombre>` · `{&rolar.init.limpar}` lo termina.",
    },
    ex: { pt: "{&rolar} 2d20kh1+5 # Ataque", en: "{&rolar} 2d20kh1+5 # Attack", es: "{&rolar} 2d20kh1+5 # Ataque" },
    parametros: [
      { nome: { pt: "<expressão>", en: "<expression>", es: "<expresión>" }, desc: { pt: "a rolagem (`2d20kh1+5`, `4d6kh3`, `3d6!`, `8d10>=7`, `4dF`…)", en: "the roll (`2d20kh1+5`, `4d6kh3`, `3d6!`, `8d10>=7`, `4dF`…)", es: "la tirada (`2d20kh1+5`, `4d6kh3`, `3d6!`, `8d10>=7`, `4dF`…)" } },
      { nome: "gm", valor: { pt: "<expressão>", en: "<expression>", es: "<expresión>" }, desc: { pt: "rolagem secreta, por DM", en: "secret roll, by DM", es: "tirada secreta, por DM" } },
      { nome: { pt: "init", en: "initiative", es: "iniciativa" }, valor: { pt: "[add <nome> [rolagem]|next|remover <nome>|limpar]", en: "[add <name> [roll]|next|remove <name>|clear]", es: "[agregar <nombre> [tirada]|siguiente|quitar <nombre>|borrar]" }, desc: { pt: "a ordem de combate deste canal", en: "this channel's combat order", es: "el orden de combate de este canal" } },
    ],
  },
};
