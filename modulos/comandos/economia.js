// &economia — a moeda do servidor (minerar, loja de cargos, ranking)
//
// P2 (31 out 2026): a economia é de CADA servidor, sem ligação com o RPG. Na ajuda,
// só o essencial; `saldo`, `tirar`, `zerar` e `config` continuam funcionando fora dela.

export default {
  id: "economia",
  modulo: "../ferramentas/economia.js",
  funcao: "cmdEconomia",
  nomes: { en: "economy" },
  apelidos: ["economy", "eco"],
  es: { nome: "economia", subcomandos: { loja: "tienda", comprar: "comprar", minerar: "minar", saldo: "saldo", pagar: "pagar", dar: "dar", tirar: "quitar", zerar: "reiniciar", intervalo: "intervalo", remover: "eliminar", confirmar: "confirmar", nome: "nombre", simbolo: "simbolo", ganho: "ganancia" } },   // espanhol (etapa 4)
  subcomandos: {
    loja: "shop", comprar: "buy", minerar: "mine", saldo: "balance", pagar: "pay", dar: "give",
    tirar: "take", zerar: "reset", intervalo: "interval", remover: "remove",
    confirmar: "confirm", nome: "name", simbolo: "symbol", ganho: "gain",
  },
  aninhados: ["zerar", "loja", "config"],
  gerenciavel: true,
  ajuda: {
    grupo: "diversao",
    perm: { pt: "todo mundo (loja add|remover e dar: ManageServer)", en: "everyone (shop add|remove and give: ManageServer)", es: "todos (shop add|remove y give: ManageServer)" },
    uso: { pt: "{&economia} [top|loja|comprar <cargo>|pagar @pessoa <quantia>|minerar]", en: "{&economia} [top|shop|buy <role>|pay @user <amount>|mine]", es: "{&economia} [top|shop|buy <rol>|pay @usuario <cantidad>|mine]" },
    desc: {
      pt: "A **moeda deste servidor** — cada servidor tem a sua, sem ligação com o RPG.\n\n`{&economia}` — o seu saldo · `{&economia} top` — quem tem mais\n`{&economia.minerar}` — ganha um punhado (com espera entre uma e outra)\n`{&economia.loja}` · `{&economia.comprar} <cargo>` — cargos à venda (só cobra se o cargo for entregue)\n`{&economia.pagar} @pessoa <quantia>`\n\n**Staff** *(ManageServer)*: `{&economia.loja} add <cargo> <preço>` · `{&economia.loja.remover} <cargo>` · `{&economia.dar} @pessoa <quantia>`",
      en: "**This server's currency** — each server has its own, separate from the RPG.\n\n`{&economia}` — your balance · `{&economia} top` — who has the most\n`{&economia.minerar}` — earn a handful (with a wait between rounds)\n`{&economia.loja}` · `{&economia.comprar} <role>` — roles for sale (only charged if the role is delivered)\n`{&economia.pagar} @user <amount>`\n\n**Staff** *(ManageServer)*: `{&economia.loja} add <role> <price>` · `{&economia.loja.remover} <role>` · `{&economia.dar} @user <amount>`",
      es: "**La moneda de este servidor** — cada servidor tiene la suya, sin relación con el RPG.\n\n`{&economia}` — tu saldo · `{&economia} top` — quién tiene más\n`{&economia.minerar}` — ganas un puñado (con espera entre una vez y otra)\n`{&economia.loja}` · `{&economia.comprar} <rol>` — roles a la venta (solo cobra si el rol se entrega)\n`{&economia.pagar} @usuario <cantidad>`\n\n**Staff** *(ManageServer)*: `{&economia.loja} add <rol> <precio>` · `{&economia.loja.remover} <rol>` · `{&economia.dar} @usuario <cantidad>`",
    },
    ex: "{&economia.minerar}",
  },
};
