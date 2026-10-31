// &warn — aviso manual (sobe a escada do &automod punicao); lista, limpar

export default {
  id: "warn",
  modulo: "../moderacao/punir.js",
  funcao: "cmdWarn",
  nomes: { en: "warn" },
  apelidos: ["avisar"],
  es: { nome: "advertir", subcomandos: { lista: "lista", limpar: "borrar", acumular: "acumular" } },
  subcomandos: { lista: "list", limpar: "clear" },
  naTela: { acumular: "stack" },
  gerenciavel: true,
  ajuda: {
    grupo: "proteger",
    perm: "ManageMessages",
    uso: { pt: "{&warn} <@pessoa|id|nome> [motivo]", en: "{&warn} <@user|id|name> [reason]", es: "{&warn} <@usuario|id|nombre> [motivo]" },
    desc: {
      pt: "Dá um aviso. Usa o mesmo contador e a mesma escada do automod: no modo `acumular`, cada aviso sobe um degrau (aviso → silêncio → … → ban). O degrau só roda se você tem a permissão dele (TimeoutMembers, BanMembers). Os avisos zeram depois de 30 dias sem um novo.\n\nA pessoa: menção, ID ou nome; respondendo a uma mensagem, `{&warn}` sozinho avisa o autor dela.\nVer: `{&warn.lista} [@pessoa]` · Zerar: `{&warn.limpar} @pessoa` _(ManagePermissions)_",
      en: "Gives a warning. It uses the automod's counter and ladder: in `stack` mode each warning climbs one step (warning → timeout → … → ban). A step only runs if you have its permission (TimeoutMembers, BanMembers). Warnings reset after 30 days without a new one.\n\nThe person: mention, ID or name; replying to a message, `{&warn}` alone warns its author.\nSee: `{&warn.lista} [@user]` · Reset: `{&warn.limpar} @user` _(ManagePermissions)_",
      es: "Da una advertencia. Usa el contador y la escalera del automod: en el modo `acumular`, cada advertencia sube un escalón (advertencia → silencio → … → ban). El escalón solo se aplica si tienes su permiso (TimeoutMembers, BanMembers). Las advertencias se reinician tras 30 días sin una nueva.\n\nLa persona: mención, ID o nombre; respondiendo a un mensaje, `{&warn}` solo advierte a su autor.\nVer: `{&warn.lista} [@usuario]` · Reiniciar: `{&warn.limpar} @usuario` _(ManagePermissions)_",
    },
    ex: { pt: "{&warn} @Fulano flood no chat de arte", en: "{&warn} @Someone flooding the art channel", es: "{&warn} @alguien flood en el canal de arte" },
    parametros: [
      { nome: { pt: "<@pessoa|id|nome>", en: "<@user|id|name>", es: "<@usuario|id|nombre>" },
        desc: { pt: "quem recebe o aviso (ou responda à mensagem da pessoa)", en: "who gets the warning (or reply to their message)", es: "quién recibe la advertencia (o responde a su mensaje)" } },
      { nome: { pt: "[motivo]", en: "[reason]", es: "[motivo]" },
        desc: { pt: "fica no histórico e no log", en: "kept in the history and the log", es: "queda en el historial y en el log" } },
    ],
  },
};
