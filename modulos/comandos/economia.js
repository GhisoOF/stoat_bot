// &economia — a moeda do servidor (minerar, loja de cargos, ranking)

export default {
  id: "economia",
  modulo: "../ferramentas/economia.js",
  funcao: "cmdEconomia",
  nomes: { en: "economy" },
  apelidos: ["economy", "eco"],
  es: { nome: "economia" },   // espanhol (etapa 4)
  subcomandos: {
    loja: "shop", comprar: "buy", minerar: "mine", saldo: "balance", pagar: "pay", dar: "give",
    tirar: "take", zerar: "reset", intervalo: "interval", remover: "remove",
    confirmar: "confirm", nome: "name", simbolo: "symbol", ganho: "gain",
  },
  aninhados: ["zerar", "loja", "config"],
  gerenciavel: true,
  ajuda: {
    uso: { pt: "{&economia} [minerar|saldo|top|loja|comprar|pagar]", en: "{&economia} [mine|balance|top|shop|buy|pay]", es: "{&economia} [mine|balance|top|shop|buy|pay]" },
    desc: { pt: "A **moeda do servidor** — à parte do RPG, uma moeda só por servidor.\n\n`{&economia.minerar}` — ganha um punhado, com espera entre uma e outra\n`{&economia.saldo} [@pessoa]` · `{&economia} top` — quem tem mais\n`{&economia.loja}` · `{&economia.comprar} <cargo>` — cargos à venda (só cobra se o cargo for entregue)\n`{&economia.pagar} @pessoa <quantia>`\n\n**Staff** _(ManageServer)_\n`{&economia} config nome <nome>` · `simbolo <emoji>` · `ganho <mín> <máx>` · `intervalo <tempo>`\n`{&economia.loja} add <cargo> <preço>` · `{&economia.loja.remover} <cargo>`\n`{&economia.dar}|tirar @pessoa <quantia>` · `{&economia.zerar.confirmar}`\n\n_O bot só entrega cargos que estão abaixo do cargo dele._", en: "The **server's currency** — separate from the RPG, one currency per server.\n\n`{&economia.minerar}` — earn a handful, with a wait between rounds\n`{&economia.saldo} [@user]` · `{&economia} top` — who has the most\n`{&economia.loja}` · `{&economia.comprar} <role>` — roles for sale (only charged if the role is delivered)\n`{&economia.pagar} @user <amount>`\n\n**Staff** _(ManageServer)_\n`{&economia} config name <name>` · `symbol <emoji>` · `gain <min> <max>` · `interval <time>`\n`{&economia.loja} add <role> <price>` · `{&economia.loja.remover} <role>`\n`{&economia.dar}|take @user <amount>` · `{&economia.zerar.confirmar}`\n\n_The bot only hands out roles below its own._", es: "La **moneda del servidor** — aparte del RPG, una sola moneda por servidor.\n\n`{&economia.minerar}` — ganas un puñado, con espera entre una vez y otra\n`{&economia.saldo} [@usuario]` · `{&economia} top` — quién tiene más\n`{&economia.loja}` · `{&economia.comprar} <rol>` — roles a la venta (solo cobra si el rol se entrega)\n`{&economia.pagar} @usuario <cantidad>`\n\n**Staff** _(ManageServer)_\n`{&economia} config name <nombre>` · `symbol <emoji>` · `gain <mín> <máx>` · `interval <tiempo>`\n`{&economia.loja} add <rol> <precio>` · `{&economia.loja.remover} <rol>`\n`{&economia.dar}|take @usuario <cantidad>` · `{&economia.zerar.confirmar}`\n\n_El bot solo entrega roles que están por debajo del suyo._" },
    ex: "{&economia.minerar}",
  },
};
