// &banglobal — ban global entre os servidores da Judy

export default {
  id: "banglobal",
  modulo: "../moderacao/ban-global.js",
  funcao: "cmdBanGlobal",
  nomes: { en: "globalban" },
  apelidos: ["globalban"],
  subcomandos: {
    varrer: ["sweep", "scan"], revisar: "review", ver: "view", lista: ["list", "banned", "all"],
    isentar: ["exempt", "allow", "accept", "bypass"], isentos: "exempted",
    desfazer: ["undo", "revert"], confirmar: "confirm", esquecer: "forget", historico: "history",
    bots: "bots", servidor: "server", remover: "remove", pessoas: "people",
    contribuicao: "contribution", avisar: "warn", banir: "ban", off: "off", imediato: "instant",
    consenso: "consensus", importar: "import", auto: ["auto", "automatic", "autoimport"],
  },
  aninhados: ["varrer", "revisar", "scan", "isentar", "lista", "desfazer", "bots"],
  naTela: { ignorados: "ignored", lembrar: "remember" },
  gerenciavel: true,
};
