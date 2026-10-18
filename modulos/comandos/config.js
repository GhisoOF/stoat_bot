// &config — panorama de tudo que está configurado

export default {
  id: "config",
  modulo: "../moderacao/config-comando.js",
  funcao: "cmdConfig",
  apelidos: ["configuracoes", "configurações"],
  es: { nome: "config" },   // espanhol (etapa 4)
  ajuda: {
    perm: "ManagePermissions",
    uso: "{&config}",
    desc: {
      pt: "Mostra TODAS as configurações atuais do servidor num só lugar: módulos do automod, política de punição, chat de logs, convites permitidos e punições ativas.",
      en: "Shows ALL of the server's current settings in one place: automod modules, punishment policy, log channel, allowed invites and active punishments.",
      es: "Muestra TODAS las configuraciones actuales del servidor en un solo lugar: módulos del automod, política de sanciones, canal de logs, invitaciones permitidas y sanciones activas.",
    },
    ex: "{&config}",
  },
};
