// &webhook — ganchos que publicam GitHub, Crafty, Discord-like… num canal

export default {
  id: "webhook",
  modulo: "../ferramentas/webhooks.js",
  funcao: "cmdWebhook",
  apelidos: ["webhooks", "gancho", "wh"],
  es: { nome: "webhook", subcomandos: { criar: "crear", lista: "lista", remover: "eliminar", testar: "probar", eventos: "eventos", canal: "canal" } },   // espanhol (etapa 4)
  subcomandos: {
    criar: "create", lista: "list", remover: "remove", testar: "test", eventos: "events",
    canal: "channel",
  },
  gerenciavel: true,
  textoLivre: true,
  // P2 (31 out 2026): na ajuda, só `criar`, `lista` e `remover`. `canal`, `eventos`,
  // `url` e `testar` continuam funcionando fora dela. As dicas de endereço da máquina
  // (Tailscale, ponte do Docker) só vão na DM do dono do bot.
  ajuda: {
    grupo: "personalizar",
    perm: {
      pt: "ManageMessages (ou staff); `lista` é livre",
      en: "ManageMessages (or staff); `list` is open",
      es: "ManageMessages (o staff); `lista` es libre",
    },
    uso: {
      pt: "{&webhook} criar <nome> [#canal] [eventos] | lista | remover <nome>",
      en: "{&webhook} create <name> [#channel] [events] | list | remove <name>",
      es: "{&webhook} crear <nombre> [#canal] [eventos] | lista | eliminar <nombre>",
    },
    desc: {
      pt: "Serviços externos publicam num canal seu: **GitHub** (push, issues, PR, releases, Actions…), **Crafty/Minecraft** e qualquer ferramenta que fale o formato Discord (Uptime Kuma, Grafana…).\n\n`{&webhook.criar} github #avisos` — cria um gancho; a URL secreta vai por DM (trate como senha). Eventos opcionais filtram o que ele publica: `push,issues,workflow_run`.\n`{&webhook.lista}` — os ganchos deste servidor · `{&webhook.remover} github` — apaga (a URL morre na hora)\n\nNo GitHub: Settings → Webhooks → Add, content type `application/json`. No Crafty: Webhooks → provider **Discord**, cole a URL.",
      en: "External services post into your channel: **GitHub** (push, issues, PRs, releases, Actions…), **Crafty/Minecraft** and anything that speaks the Discord format (Uptime Kuma, Grafana…).\n\n`{&webhook.criar} github #alerts` — creates a hook; the secret URL goes by DM (treat it like a password). Optional events filter what it posts: `push,issues,workflow_run`.\n`{&webhook.lista}` — this server's hooks · `{&webhook.remover} github` — deletes it (the URL dies instantly)\n\nOn GitHub: Settings → Webhooks → Add, content type `application/json`. On Crafty: Webhooks → provider **Discord**, paste the URL.",
      es: "Servicios externos publican en un canal tuyo: **GitHub** (push, issues, PR, releases, Actions…), **Crafty/Minecraft** y cualquier herramienta que hable el formato de Discord (Uptime Kuma, Grafana…).\n\n`{&webhook.criar} github #avisos` — crea un gancho; la URL secreta va por DM (trátala como una contraseña). Los eventos opcionales filtran lo que publica: `push,issues,workflow_run`.\n`{&webhook.lista}` — los ganchos de este servidor · `{&webhook.remover} github` — lo borra (la URL deja de funcionar al instante)\n\nEn GitHub: Settings → Webhooks → Add, content type `application/json`. En Crafty: Webhooks → provider **Discord**, pega la URL.",
    },
    ex: { pt: "{&webhook.criar} github #avisos", en: "{&webhook.criar} github #alerts", es: "{&webhook.criar} github #avisos" },
    parametros: [
      { nome: { pt: "criar", en: "create", es: "crear" }, valor: { pt: "<nome> [#canal] [eventos]", en: "<name> [#channel] [events]", es: "<nombre> [#canal] [eventos]" },
        desc: { pt: "novo gancho (sem canal: este); a URL secreta vai por DM", en: "new hook (no channel: this one); the secret URL goes by DM", es: "nuevo gancho (sin canal: este); la URL secreta va por DM" } },
      { nome: { pt: "lista", en: "list", es: "lista" },
        desc: { pt: "os ganchos do servidor, com canal, filtro e usos", en: "the server's hooks, with channel, filter and usage count", es: "los ganchos del servidor, con canal, filtro y usos" } },
      { nome: { pt: "remover", en: "remove", es: "eliminar" }, valor: { pt: "<nome>", en: "<name>", es: "<nombre>" },
        desc: { pt: "apaga o gancho — a URL morre na hora", en: "deletes the hook — the URL dies instantly", es: "borra el gancho — la URL muere al instante" } },
    ],
  },
};
