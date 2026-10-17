// &automod — os filtros automáticos: antispam, antiruido, antilink, sentinela

export default {
  id: "automod",
  modulo: "../moderacao/automod-comandos.js",
  funcao: "cmdAutomod",
  gerenciavel: true,
  // nomes que o texto antigo ainda cita sozinhos (`&punicao`); a fase 2 os leva para os subcomandos
  partes: { punicao: { en: "punishment" }, sentinela: { en: "sentinel" } },
  textoLivre: true,
};
