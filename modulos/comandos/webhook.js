// &webhook — ganchos que publicam GitHub, Crafty, Discord-like… num canal

export default {
  id: "webhook",
  modulo: "../ferramentas/webhooks.js",
  funcao: "cmdWebhook",
  apelidos: ["webhooks", "gancho", "wh"],
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
    },
    uso: {
      pt: "{&webhook} [criar <nome> [#canal]|lista|canal|eventos|url|testar|remover]",
      en: "{&webhook} [create <name> [#channel]|list|channel|events|url|test|remove]",
    },
    desc: {
      pt: "Receptor **universal** de webhooks: serviços externos publicam num canal seu.\n\n**Funciona com:** GitHub (push, issues, PR, releases, Actions, star, fork…), Crafty/Minecraft, e **qualquer ferramenta que fale o formato Discord** (Uptime Kuma, Grafana…) — é só colar a URL do gancho onde iria a URL do Discord.\n\n**O modelo:** cada *gancho* tem nome, canal próprio e filtro de eventos. Separar por chats é criar um gancho por assunto:\n`{&webhook.criar} issues #issues` + `{&webhook.eventos} issues issues,issue_comment`\n`{&webhook.criar} ci #ci` + `{&webhook.eventos} ci workflow_run`\n`{&webhook.criar} mine #minecraft` ← aponte o Crafty (provider Discord) para ele\n\n**Segurança:** a URL é o segredo (token de 128 bits); `remover` mata a URL na hora; teto de 30 publicações/min por gancho contra flood; até 10 ganchos por servidor; o canal tem de ser **deste servidor**.\n\n**Qual endereço usar:** serviço da INTERNET (GitHub…) exige base pública https — `sudo tailscale funnel --bg 8095` e `WEBHOOK_URL_BASE=https://<máquina>.ts.net` no `.env`; container da MESMA máquina (Crafty…) usa a ponte do Docker `http://172.17.0.1:8095/...` — a URL interna colada num serviço da internet dá \"failed to connect\" sem explicação.",
      en: "**Universal** webhook receiver: external services post into your channels.\n\n**Works with:** GitHub (push, issues, PRs, releases, Actions, star, fork…), Crafty/Minecraft, and **anything that speaks the Discord format** (Uptime Kuma, Grafana…) — just paste the hook URL where the Discord URL would go.\n\n**The model:** each *hook* has a name, its own channel and an event filter. Per-chat separation is one hook per subject:\n`{&webhook.criar} issues #issues` + `{&webhook.eventos} issues issues,issue_comment`\n`{&webhook.criar} ci #ci` + `{&webhook.eventos} ci workflow_run`\n`{&webhook.criar} mine #minecraft` ← point Crafty (Discord provider) at it\n\n**Security:** the URL is the secret (128-bit token); `remove` kills the URL instantly; 30 posts/min cap per hook against floods; up to 10 hooks per server; the channel must be **on this server**.\n\n**Which address to use:** INTERNET services (GitHub…) need a public https base — `sudo tailscale funnel --bg 8095` and `WEBHOOK_URL_BASE=https://<machine>.ts.net` in `.env`; SAME-machine containers (Crafty…) use the Docker bridge `http://172.17.0.1:8095/...` — an internal URL pasted into an internet service fails with an unexplained \"failed to connect\".",
    },
    ex: { pt: "{&webhook.criar} github #avisos", en: "{&webhook.criar} github #alerts" },
    parametros: [
      { nome: { pt: "criar", en: "create" }, valor: { pt: "<nome> [#canal]", en: "<name> [#channel]" },
        desc: { pt: "novo gancho; a URL secreta aparece uma vez (padrão: publica no canal do comando)", en: "new hook; the secret URL shows once (default: posts to the command's channel)" } },
      { nome: { pt: "lista", en: "list" },
        desc: { pt: "os ganchos do servidor, com canal, filtro e usos", en: "the server's hooks, with channel, filter and usage count" } },
      { nome: { pt: "canal", en: "channel" }, valor: { pt: "<nome> <#canal>", en: "<name> <#channel>" },
        desc: { pt: "muda para onde o gancho publica", en: "changes where the hook posts" } },
      { nome: { pt: "eventos", en: "events" }, valor: { pt: "<nome> <lista|todos>", en: "<name> <list|all>" },
        desc: { pt: "filtra: `push,issues,workflow_run`… (nomes dos eventos do GitHub; `discord` e `generico` para as outras fontes)", en: "filters: `push,issues,workflow_run`… (GitHub event names; `discord` and `generico` for the other sources)" } },
      { nome: "url", valor: { pt: "<nome>", en: "<name>" },
        desc: { pt: "mostra a URL secreta de novo", en: "shows the secret URL again" } },
      { nome: { pt: "testar", en: "test" }, valor: { pt: "<nome>", en: "<name>" },
        desc: { pt: "publica um embed de teste no canal do gancho", en: "posts a test embed to the hook's channel" } },
      { nome: { pt: "remover", en: "remove" }, valor: { pt: "<nome>", en: "<name>" },
        desc: { pt: "apaga o gancho — a URL morre na hora", en: "deletes the hook — the URL dies instantly" } },
      { nome: "Crafty/Minecraft",
        desc: { pt: "na config do servidor no Crafty: Webhooks → provider **Discord** → cole a URL do gancho", en: "in the server config on Crafty: Webhooks → provider **Discord** → paste the hook URL" } },
      { nome: "GitHub",
        desc: { pt: "Settings → Webhooks → Add webhook → content type `application/json` → cole a URL", en: "Settings → Webhooks → Add webhook → content type `application/json` → paste the URL" } },
    ],
  },
};
