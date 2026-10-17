// &economia — a moeda do servidor (minerar, loja de cargos, ranking)

export default {
  id: "economia",
  modulo: "../ferramentas/economia.js",
  funcao: "cmdEconomia",
  nomes: { en: "economy" },
  apelidos: ["economy", "eco"],
  subcomandos: {
    loja: "shop", comprar: "buy", minerar: "mine", saldo: "balance", pagar: "pay", dar: "give",
    tirar: "take", zerar: "reset", intervalo: "interval", remover: "remove",
    confirmar: "confirm", nome: "name", simbolo: "symbol", ganho: "gain",
  },
  aninhados: ["zerar", "loja", "config"],
  gerenciavel: true,
};
