// &debug — diagnóstico de permissões, canais e voz

export default {
  id: "debug",
  modulo: "../moderacao/debug-comando.js",
  funcao: "cmdDebug",
  apelidos: ["diagnostico", "diagnóstico"],
  subcomandos: {
    canais: "channels", permissoes: "permissions", cru: "raw", silence: "silence", mudo: "mute",
    ler: "read",
  },
  aninhados: ["canais", "permissoes", "silence", "mudo"],
  essencial: true,
  qualquerCanal: true,
};
