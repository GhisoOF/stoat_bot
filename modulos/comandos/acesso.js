// &acesso — quem usa os comandos de moderação e onde

export default {
  id: "acesso",
  modulo: "../moderacao/acesso.js",
  funcao: "cmdAcesso",
  nomes: { en: "access" },
  apelidos: ["access"],
  es: { nome: "acceso", subcomandos: { livre: "libre" } },   // espanhol (etapa 4)
  subcomandos: {
    cargo: "role", cargos: "roles", staff: "staff", canal: "channel", canais: "channels",
    todos: "all", somente: "only", exceto: "except", add: "add", remove: "remove",
    limpar: "clear", staffignora: ["staffignores", "staffbypass"], status: "status",
    livre: "free",   // um comando que vale fora dos canais designados (P7, 20 out 2026)
  },
  aninhados: ["cargo", "cargos", "staff", "canal", "canais"],
  gerenciavel: true,
  qualquerCanal: true,
  ajuda: {
    perm: "ManagePermissions",
    uso: { pt: "{&acesso} <cargo|canal|staffignora|livre|status>", en: "{&acesso} <role|channel|staffignores|free|status>", es: "{&acesso} <role|channel|staffignores|libre|status>" },
    desc: { pt: "Define **quem** pode usar os comandos e **onde**.\n\n**Cargos de staff** — quem tiver um deles usa os comandos de moderação mesmo sem a permissão nativa do Stoat:\n`{&acesso.cargo.add} <@cargo>` · `{&acesso.cargo.remove} <@cargo>` · `{&acesso.cargo.limpar}`\n\n**Canais** — onde os comandos funcionam:\n`{&acesso.canal.todos}` — em qualquer canal\n`{&acesso.canal.somente}` — só nos da lista\n`{&acesso.canal.exceto}` — em todos, menos os da lista\n`{&acesso.canal.add}|remove [#canal]` — mexe na lista\n\n`{&acesso.staffignora} on|off` — se o staff escapa da restrição de canal (padrão: sim)\n`{&acesso.livre} <comando> on|off` — o comando vale em qualquer canal (ex.: `{&acesso.livre} entretenimento on` para os jogos)\n\n_`{&acesso}`, `{&debug}`, `{&help}` e `{&tutorial}` funcionam sempre, para você não se trancar fora._", en: "Defines **who** can use the commands and **where**.\n\n**Staff roles** — anyone holding one can use the moderation commands even without the native Stoat permission:\n`{&acesso.cargo.add} <@role>` · `{&acesso.cargo.remove} <@role>` · `{&acesso.cargo.limpar}`\n\n**Channels** — where commands work:\n`{&acesso.canal.todos}` — in any channel\n`{&acesso.canal.somente}` — only in the listed ones\n`{&acesso.canal.exceto}` — everywhere except the listed ones\n`{&acesso.canal.add}|remove [#channel]` — edits the list\n\n`{&acesso.staffignora} on|off` — whether staff bypasses the channel restriction (default: yes)\n`{&acesso.livre} <command> on|off` — the command works in any channel (e.g. `{&acesso.livre} entertainment on` for the games)\n\n_`{&acesso}`, `{&debug}`, `{&help}` and `{&tutorial}` always work, so you can't lock yourself out._", es: "Define **quién** puede usar los comandos y **dónde**.\n\n**Roles de staff** — quien tenga uno de ellos usa los comandos de moderación aunque no tenga el permiso nativo de Stoat:\n`{&acesso.cargo.add} <@rol>` · `{&acesso.cargo.remove} <@rol>` · `{&acesso.cargo.limpar}`\n\n**Canales** — dónde funcionan los comandos:\n`{&acesso.canal.todos}` — en cualquier canal\n`{&acesso.canal.somente}` — solo en los de la lista\n`{&acesso.canal.exceto}` — en todos, menos los de la lista\n`{&acesso.canal.add}|remove [#canal]` — edita la lista\n\n`{&acesso.staffignora} on|off` — si el staff se salta la restricción de canal (predeterminado: sí)\n`{&acesso.livre} <comando> on|off` — el comando vale en cualquier canal (ej.: `{&acesso.livre} entretenimiento on` para los juegos)\n\n_`{&acesso}`, `{&debug}`, `{&help}` y `{&tutorial}` funcionan siempre, para que no te quedes fuera._" },
    ex: "{&acesso.canal.somente}",
    parametros: [
      { nome: { pt: "cargo add | remove", en: "role add | remove", es: "role add | remove" }, valor: { pt: "<@cargo|nome|id>", en: "<@role|name|id>", es: "<@rol|nombre|id>" }, desc: { pt: "cargos com acesso aos comandos de moderação (é a mesma lista do `{&staff}`)", en: "roles with access to moderation commands (same list as `{&staff}`)", es: "roles con acceso a los comandos de moderación (es la misma lista de `{&staff}`)" } },
      { nome: { pt: "cargo limpar", en: "role clear", es: "role clear" }, desc: { pt: "esvazia a lista", en: "empties the list", es: "vacía la lista" } },
      { nome: { pt: "canal", en: "channel", es: "channel" }, valor: { pt: "todos | somente | exceto", en: "all | only | except", es: "all | only | except" }, desc: { pt: "modo: comandos em todo lugar, só nos canais listados, ou em todos menos os listados", en: "mode: commands everywhere, only in listed channels, or everywhere except listed", es: "modo: comandos en todas partes, solo en los canales de la lista, o en todos menos los de la lista" } },
      { nome: { pt: "canal add | remove", en: "channel add | remove", es: "channel add | remove" }, valor: { pt: "<#canal>", en: "<#channel>", es: "<#canal>" }, desc: { pt: "monta a lista de canais do modo escolhido", en: "builds the channel list for the chosen mode", es: "arma la lista de canales del modo elegido" } },
      { nome: { pt: "staffignora", en: "staffignores", es: "staffignores" }, valor: "on | off", desc: { pt: "se a staff pode usar comandos fora dos canais permitidos", en: "whether staff can use commands outside the allowed channels", es: "si el staff puede usar comandos fuera de los canales permitidos" } },
      { nome: { pt: "livre", en: "free", es: "libre" }, valor: { pt: "<comando> on | off", en: "<command> on | off", es: "<comando> on | off" }, desc: { pt: "o comando vale em qualquer canal, mesmo com a restrição (ex.: `entretenimento`, para os jogos)", en: "the command works in any channel, even with the restriction (e.g. `entertainment`, for the games)", es: "el comando vale en cualquier canal, incluso con la restricción (ej.: `entretenimiento`, para los juegos)" } },
      { nome: "status", desc: { pt: "a configuração atual", en: "the current setup", es: "la configuración actual" } },
    ],
  },
};
