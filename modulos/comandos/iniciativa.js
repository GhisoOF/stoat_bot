// &iniciativa — ordem de combate de RPG de mesa

export default {
  id: "iniciativa",
  modulo: "../ferramentas/dados-rpg.js",
  funcao: "cmdIniciativa",
  apelidos: ["init", "initiative"],
  subcomandos: { lista: "list", remover: "remove", limpar: "clear" },
  gerenciavel: true,
  ajuda: {
    perm: { pt: "todo mundo", en: "everyone" },
    uso: {
      pt: "{&iniciativa} [add <nome> [rolagem]|next|lista|remover <nome>|limpar]",
      en: "{&iniciativa} [add <name> [roll]|next|list|remove <name>|clear]",
    },
    desc: {
      pt: "Rastreador de ordem de combate, um por canal:\n`add Goblin 1d20+2` rola e insere já ordenado (sem rolagem, rola `1d20`; número fixo também vale)\n`next` avança a vez (e avisa a rodada nova) · `lista` mostra a ordem com ▶️ em quem age\n`remover <nome>` tira um caído · `limpar` encerra o combate.",
      en: "Combat order tracker, one per channel:\n`add Goblin 1d20+2` rolls and inserts already sorted (no roll = `1d20`; fixed numbers work too)\n`next` advances the turn (announcing new rounds) · `list` shows the order with ▶️ on whoever acts\n`remove <name>` drops the fallen · `clear` ends the combat.",
    },
    ex: { pt: "{&iniciativa} add Elfa 1d20+3", en: "{&iniciativa} add Elf 1d20+3" },
  },
};
