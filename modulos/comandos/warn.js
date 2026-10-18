// &warn — avisos manuais (lista, limpar)

export default {
  id: "warn",
  modulo: "../moderacao/warn.js",
  funcao: "cmdWarn",
  nomes: { en: "warn" },
  apelidos: ["avisar"],
  es: { nome: "advertir", subcomandos: { lista: "lista", limpar: "borrar" } },   // espanhol (etapa 4)
  subcomandos: { lista: "list", limpar: "clear" },
  naTela: { acumular: "stack" },
  gerenciavel: true,
  ajuda: {
    perm: "ManageMessages",
    uso: { pt: "{&warn} <@pessoa|id|nome> [motivo]", en: "{&warn} <@user|id|name> [reason]", es: "{&warn} <@usuario|id|nombre> [motivo]" },
    desc: {
      pt: "Dá um aviso manual a alguém. Usa o **mesmo contador e a mesma escada** do automod: no modo `acumular`, o aviso manual sobe um degrau (aviso → silêncio → … → ban) — e o bot diz qual é o próximo. Os avisos zeram depois de 30 dias sem um novo (`{&automod.punicao.validade}`).\n\nA pessoa pode ser **menção, ID ou nome**.\nVer os avisos: `{&warn.lista} [@pessoa]` · Zerar: `{&warn.limpar} @pessoa` _(ManagePermissions)_",
      en: "Gives someone a manual warning. It uses the **same counter and the same ladder** as the automod: in `stack` mode a manual warning climbs one step (warning → silence → … → ban) — and the bot tells you the next one. Warnings reset after 30 days without a new one (`{&automod.punicao.validade}`).\n\nThe person can be a **mention, ID or name**.\nSee warnings: `{&warn.lista} [@user]` · Reset: `{&warn.limpar} @user` _(ManagePermissions)_",
      es: "Le da una advertencia manual a alguien. Usa el **mismo contador y la misma escalera** que el automod: en el modo `acumular`, la advertencia manual sube un escalón (advertencia → silencio → … → ban) — y el bot te dice cuál es el siguiente. Las advertencias se reinician tras 30 días sin una nueva (`{&automod.punicao.validade}`).\n\nLa persona puede ser una **mención, un ID o un nombre**.\nVer las advertencias: `{&warn.lista} [@usuario]` · Reiniciarlas: `{&warn.limpar} @usuario` _(ManagePermissions)_",
    },
    ex: { pt: "{&warn} @Fulano flood no chat de arte", en: "{&warn} @Someone flooding the art channel", es: "{&warn} @alguien flood en el canal de arte" },
    parametros: [
      { nome: { pt: "<@pessoa|id|nome>", en: "<@user|id|name>", es: "<@usuario|id|nombre>" },
        desc: { pt: "quem recebe o aviso", en: "who gets the warning", es: "quién recibe la advertencia" } },
      { nome: { pt: "[motivo]", en: "[reason]", es: "[motivo]" },
        desc: { pt: "fica no histórico e no log", en: "kept in the history and the log", es: "queda en el historial y en el log" } },
    ],
  },
};
