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
  ajuda: {
    perm: {
      pt: "ManageMessages (ou staff); `lista` é livre",
      en: "ManageMessages (or staff); `list` is open",
      es: "ManageMessages (o staff); `lista` es libre",
    },
    uso: {
      pt: "{&webhook} [criar <nome> [#canal]|lista|canal|eventos|url|testar|remover]",
      en: "{&webhook} [create <name> [#channel]|list|channel|events|url|test|remove]",
      es: "{&webhook} [crear <nombre> [#canal]|lista|canal|eventos|url|probar|eliminar]",
    },
    desc: {
      pt: "Receptor **universal** de webhooks: serviços externos publicam num canal seu.\n\n**Funciona com:** GitHub (push, issues, PR, releases, Actions, star, fork…), Crafty/Minecraft, e **qualquer ferramenta que fale o formato Discord** (Uptime Kuma, Grafana…) — é só colar a URL do gancho onde iria a URL do Discord.\n\n**O modelo:** cada *gancho* tem nome, canal próprio e filtro de eventos. Separar por chats é criar um gancho por assunto:\n`{&webhook.criar} issues #issues` + `{&webhook.eventos} issues issues,issue_comment`\n`{&webhook.criar} ci #ci` + `{&webhook.eventos} ci workflow_run`\n`{&webhook.criar} mine #minecraft` ← aponte o Crafty (provider Discord) para ele\n\n**Segurança:** a URL é o segredo (token de 128 bits); `remover` mata a URL na hora; teto de 30 publicações/min por gancho contra flood; até 10 ganchos por servidor; o canal tem de ser **deste servidor**.\n\n**Qual endereço usar:** serviço da INTERNET (GitHub…) exige base pública https — `sudo tailscale funnel --bg 8095` e `WEBHOOK_URL_BASE=https://<máquina>.ts.net` no `.env`; container da MESMA máquina (Crafty…) usa a ponte do Docker `http://172.17.0.1:8095/...` — a URL interna colada num serviço da internet dá \"failed to connect\" sem explicação.",
      en: "**Universal** webhook receiver: external services post into your channels.\n\n**Works with:** GitHub (push, issues, PRs, releases, Actions, star, fork…), Crafty/Minecraft, and **anything that speaks the Discord format** (Uptime Kuma, Grafana…) — just paste the hook URL where the Discord URL would go.\n\n**The model:** each *hook* has a name, its own channel and an event filter. Per-chat separation is one hook per subject:\n`{&webhook.criar} issues #issues` + `{&webhook.eventos} issues issues,issue_comment`\n`{&webhook.criar} ci #ci` + `{&webhook.eventos} ci workflow_run`\n`{&webhook.criar} mine #minecraft` ← point Crafty (Discord provider) at it\n\n**Security:** the URL is the secret (128-bit token); `remove` kills the URL instantly; 30 posts/min cap per hook against floods; up to 10 hooks per server; the channel must be **on this server**.\n\n**Which address to use:** INTERNET services (GitHub…) need a public https base — `sudo tailscale funnel --bg 8095` and `WEBHOOK_URL_BASE=https://<machine>.ts.net` in `.env`; SAME-machine containers (Crafty…) use the Docker bridge `http://172.17.0.1:8095/...` — an internal URL pasted into an internet service fails with an unexplained \"failed to connect\".",
      es: "Receptor **universal** de webhooks: servicios externos publican en un canal tuyo.\n\n**Funciona con:** GitHub (push, issues, PR, releases, Actions, star, fork…), Crafty/Minecraft y **cualquier herramienta que hable el formato de Discord** (Uptime Kuma, Grafana…) — basta con pegar la URL del gancho donde iría la URL de Discord.\n\n**El modelo:** cada *gancho* tiene nombre, canal propio y filtro de eventos. Separar por chats es crear un gancho por tema:\n`{&webhook.criar} issues #issues` + `{&webhook.eventos} issues issues,issue_comment`\n`{&webhook.criar} ci #ci` + `{&webhook.eventos} ci workflow_run`\n`{&webhook.criar} mine #minecraft` ← apunta el Crafty (provider Discord) a él\n\n**Seguridad:** la URL es el secreto (token de 128 bits); `eliminar` mata la URL al instante; tope de 30 publicaciones/min por gancho contra el flood; hasta 10 ganchos por servidor; el canal tiene que ser **de este servidor**.\n\n**Qué dirección usar:** un servicio de INTERNET (GitHub…) exige una base pública https — `sudo tailscale funnel --bg 8095` y `WEBHOOK_URL_BASE=https://<máquina>.ts.net` en el `.env`; un contenedor de la MISMA máquina (Crafty…) usa el puente de Docker `http://172.17.0.1:8095/...` — la URL interna pegada en un servicio de internet da \"failed to connect\" sin explicación.",
    },
    ex: { pt: "{&webhook.criar} github #avisos", en: "{&webhook.criar} github #alerts", es: "{&webhook.criar} github #avisos" },
    parametros: [
      { nome: { pt: "criar", en: "create", es: "crear" }, valor: { pt: "<nome> [#canal]", en: "<name> [#channel]", es: "<nombre> [#canal]" },
        desc: { pt: "novo gancho; a URL secreta aparece uma vez (padrão: publica no canal do comando)", en: "new hook; the secret URL shows once (default: posts to the command's channel)", es: "gancho nuevo; la URL secreta aparece una sola vez (predeterminado: publica en el canal del comando)" } },
      { nome: { pt: "lista", en: "list", es: "lista" },
        desc: { pt: "os ganchos do servidor, com canal, filtro e usos", en: "the server's hooks, with channel, filter and usage count", es: "los ganchos del servidor, con canal, filtro y usos" } },
      { nome: { pt: "canal", en: "channel", es: "canal" }, valor: { pt: "<nome> <#canal>", en: "<name> <#channel>", es: "<nombre> <#canal>" },
        desc: { pt: "muda para onde o gancho publica", en: "changes where the hook posts", es: "cambia dónde publica el gancho" } },
      { nome: { pt: "eventos", en: "events", es: "eventos" }, valor: { pt: "<nome> <lista|todos>", en: "<name> <list|all>", es: "<nombre> <lista|todos>" },
        desc: { pt: "filtra: `push,issues,workflow_run`… (nomes dos eventos do GitHub; `discord` e `generico` para as outras fontes)", en: "filters: `push,issues,workflow_run`… (GitHub event names; `discord` and `generico` for the other sources)", es: "filtra: `push,issues,workflow_run`… (nombres de eventos de GitHub; `discord` y `generico` para las otras fuentes)" } },
      { nome: "url", valor: { pt: "<nome>", en: "<name>", es: "<nombre>" },
        desc: { pt: "mostra a URL secreta de novo", en: "shows the secret URL again", es: "muestra la URL secreta otra vez" } },
      { nome: { pt: "testar", en: "test", es: "probar" }, valor: { pt: "<nome>", en: "<name>", es: "<nombre>" },
        desc: { pt: "publica um embed de teste no canal do gancho", en: "posts a test embed to the hook's channel", es: "publica un embed de prueba en el canal del gancho" } },
      { nome: { pt: "remover", en: "remove", es: "eliminar" }, valor: { pt: "<nome>", en: "<name>", es: "<nombre>" },
        desc: { pt: "apaga o gancho — a URL morre na hora", en: "deletes the hook — the URL dies instantly", es: "borra el gancho — la URL muere al instante" } },
      { nome: "Crafty/Minecraft",
        desc: { pt: "na config do servidor no Crafty: Webhooks → provider **Discord** → cole a URL do gancho", en: "in the server config on Crafty: Webhooks → provider **Discord** → paste the hook URL", es: "en la configuración del servidor en Crafty: Webhooks → provider **Discord** → pega la URL del gancho" } },
      { nome: "GitHub",
        desc: { pt: "Settings → Webhooks → Add webhook → content type `application/json` → cole a URL", en: "Settings → Webhooks → Add webhook → content type `application/json` → paste the URL", es: "Settings → Webhooks → Add webhook → content type `application/json` → pega la URL" } },
    ],
  },
};
