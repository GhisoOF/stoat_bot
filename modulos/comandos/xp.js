// &xp — níveis por mensagem

export default {
  id: "xp",
  modulo: "../ferramentas/nivel.js",
  funcao: "cmdXp",
  nomes: { en: "xp" },
  apelidos: ["nivel", "level", "levels"],
  subcomandos: {
    setup: "setup", config: "config", configurar: "configure", cargos: "roles",
    criarcargos: "createroles", criar: "create", reset: "reset", zerar: "wipe", top: "top",
    ranking: "ranking", rank: "rank", leaderboard: "leaderboard", multiplicador: "multiplier",
    nivelmaximo: "maxlevel", intervalo: "interval", canal: "channel",
    anuncio: ["announce", "announcement"], sincronizar: ["sync", "resync", "restore"],
    todos: "all",
  },
  aninhados: ["setup", "config", "configurar", "sincronizar"],
  naTela: { aqui: "here" },
  gerenciavel: true,
};
