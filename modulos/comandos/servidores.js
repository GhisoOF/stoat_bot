// &servidores — painel do dono do bot (relatório horário, servidores +18) — fora do &help

export default {
  id: "servidores",
  modulo: "../moderacao/servidores.js",
  funcao: "cmdServidores",
  nomes: { en: "servers" },
  apelidos: ["servers"],
  subcomandos: {
    relatorio: "report", canal: "channel", agora: "now", assuntos: ["subjects", "topics"],
    vazias: "empty", aqui: "here",
  },
  aninhados: ["relatorio"],
};
