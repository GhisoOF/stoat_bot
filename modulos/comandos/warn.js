// &warn — avisos manuais (lista, limpar)

export default {
  id: "warn",
  modulo: "../moderacao/warn.js",
  funcao: "cmdWarn",
  nomes: { en: "warn" },
  apelidos: ["avisar"],
  subcomandos: { lista: "list", limpar: "clear" },
  naTela: { acumular: "stack" },
  gerenciavel: true,
  ajuda: {
    perm: "ManageMessages",
    uso: { pt: "{&warn} <@pessoa|id|nome> [motivo]", en: "{&warn} <@user|id|name> [reason]" },
    desc: {
      pt: "Dá um aviso manual a alguém. Usa o **mesmo contador e a mesma escada** do automod: no modo `acumular`, o aviso manual sobe um degrau (aviso → silêncio → … → ban) — e o bot diz qual é o próximo. Os avisos zeram depois de 30 dias sem um novo (`{&automod.punicao.validade}`).\n\nA pessoa pode ser **menção, ID ou nome**.\nVer os avisos: `{&warn.lista} [@pessoa]` · Zerar: `{&warn.limpar} @pessoa` _(ManagePermissions)_",
      en: "Gives someone a manual warning. It uses the **same counter and the same ladder** as the automod: in `stack` mode a manual warning climbs one step (warning → silence → … → ban) — and the bot tells you the next one. Warnings reset after 30 days without a new one (`{&automod.punicao.validade}`).\n\nThe person can be a **mention, ID or name**.\nSee warnings: `{&warn.lista} [@user]` · Reset: `{&warn.limpar} @user` _(ManagePermissions)_",
    },
    ex: { pt: "{&warn} @Fulano flood no chat de arte", en: "{&warn} @Someone flooding the art channel" },
    parametros: [
      { nome: { pt: "<@pessoa|id|nome>", en: "<@user|id|name>" },
        desc: { pt: "quem recebe o aviso", en: "who gets the warning" } },
      { nome: { pt: "[motivo]", en: "[reason]" },
        desc: { pt: "fica no histórico e no log", en: "kept in the history and the log" } },
    ],
  },
};
