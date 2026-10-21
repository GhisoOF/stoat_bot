import { parametrosDoRegistro } from "../core/ajuda-registro.js";
import { citar, nomeExibido, citarInterno } from "../core/aliases.js";

export function parametros(P, lang = "pt", idioma = lang) {
  // os comandos já migrados (fase 3) têm os parâmetros no registro, e eles vencem
  // (e só eles já têm espanhol: `idioma` "es")
  return { ...(lang === "en" ? parametrosEN(P) : parametrosPT(P)), ...parametrosDoRegistro(P, idioma) };
}

function parametrosPT(P) {
  const entradaSaida = (nome) => [
    { nome: "canal", valor: "<#canal|aqui|id>", desc: "onde publicar. `aqui` = este canal. Definir o canal já **liga** a mensagem" },
    { nome: "on | off", desc: "liga/desliga sem perder a configuração" },
    { nome: "titulo", valor: "<texto>", desc: "a linha de cima do embed. Aceita os marcadores abaixo" },
    { nome: "texto", valor: "<descrição>", desc: "o corpo do embed (pode ter várias linhas). Aceita os marcadores" },
    { nome: "cor", valor: "<#hex|nome>", desc: "cor da barra lateral: `#FF71CE`, `roxo`, `azul`… (`" + citarInterno("cor.presets") + "` lista os nomes)" },
    { nome: "imagem", valor: "<url|limpar>", desc: "capa. Anexo do Stoat vira capa do embed; URL de fora aparece como pré-visualização abaixo" },
    { nome: "imagem", valor: "visivel | oculto", desc: "se a URL externa aparece escrita ou fica escondida (padrão: oculta)" },
    { nome: "testar", desc: "publica agora usando você de exemplo — sem esperar alguém entrar" },
    { nome: "padrao", desc: "volta título e texto ao de fábrica (mantém o canal)" },
    { nome: "status", desc: "mostra a configuração atual e uma prévia" },
    { nome: "Marcadores", desc: "`{usuario}` menciona a pessoa · `{nome}` só o nome · `{servidor}` nome do servidor · `{membros}` total de membros" },
  ];
  return {
    boasvindas: entradaSaida("boasvindas"),

    // 17 out 2026: a sintaxe antiga (`anticaps set limiar`, `&punicao`, `<filtro> punicao`)
    // saiu daqui — os filtros viraram quatro grupos com partes.
    punicao: [
      { nome: "modo", valor: "avisar | apagar | confirmar | acumular | banir", desc: "`avisar` só avisa · `apagar` remove a mensagem · `confirmar` silencia e chama um moderador · `acumular` sobe uma escada a cada reincidência · `banir` bane na hora" },
      { nome: "escada", valor: "[aviso,10m,2h,ban]", desc: "os degraus do modo `acumular`. Sem valor, mostra a atual. Padrão: aviso → mute 5 min → mute 1 h → ban" },
      { nome: "warns", valor: "<n>", desc: `quantos avisos até o ban — ajusta a escada (o ban é sempre o último degrau). Vale para o automod e para o \`${citar("warn", "pt", P)}\`` },
      { nome: "validade", valor: "<dias|0>", desc: "os avisos zeram depois de tantos dias sem um novo (padrão 30; 0 = nunca). Sem valor, mostra a atual" },
      { nome: "status", desc: "a configuração atual" },
      { nome: "Não existe aqui", desc: `\`testar\`/\`simular\` são do \`${citarInterno("automod.sentinela")}\` (é ele que lê o texto); avisos são com \`${citar("warn", "pt", P)}\`, \`${citar("warn.lista", "pt", P)}\` e \`${citar("warn.limpar", "pt", P)}\`. O \`${citarInterno("automod.punicao")}\` só decide **o que acontece** depois` },
    ],

    sentinela: [
      { nome: "on | off", desc: "liga/desliga o filtro que julga conteúdo (golpe, +18, gore, apologia)" },
      { nome: "sensibilidade", valor: "baixa | media | alta", desc: "quão desconfiado ele é. `alta` pega mais e erra mais" },
      { nome: "antiguidade", valor: "on | off", desc: "mais rígido com quem acabou de chegar (usa o nível de XP, ou o tempo no servidor, como medida de tempo de casa)" },
      { nome: "alerta", valor: "on | off", desc: "avisa a staff quando alguém levanta suspeita repetidas vezes, antes de punir" },
      { nome: "canal", valor: "<#canal|aqui|off>", desc: "canal dos avisos e do `simular`" },
      { nome: "testar", valor: "<texto>", desc: "mostra a nota (0–10) que esse texto levaria — não pune ninguém" },
      { nome: "simular", valor: "<texto>", desc: "dispara o fluxo real no canal de avisos" },
      { nome: "banir | liberar", valor: "<@pessoa|id>", desc: "decide um caso pendente do modo `confirmar`" },
      { nome: "assuntos", valor: "<tema> <off|alertar|apagar|punir>", desc: "temas proibidos pela regra (`politica`, `religiao`, `drogas`, `sexual`): nota de 0 a 10 por peso (termos, debate, ataque, contexto; \"kkkk\" e emoji amenizam) e a IA confirma. Também `testar <texto>`, `sensibilidade`, `ia on|off`" },
      { nome: "avatar", valor: "acao <alertar|silenciar|expulsar|banir>", desc: "foto de perfil de quem entra ou troca, pelo modelo de visão (padrão: silencia 24 h e avisa a staff)" },
    ],

  };
}

function parametrosEN(P) {
  const joinLeave = () => [
    { nome: "canal", valor: "<#channel|here|id>", desc: "where to post. `here` = this channel. Setting the channel also **turns it on**" },
    { nome: "on | off", desc: "toggles without losing the configuration" },
    { nome: "titulo", valor: "<text>", desc: "the embed's top line. Accepts the markers below" },
    { nome: "texto", valor: "<description>", desc: "the embed body (can span lines). Accepts the markers" },
    { nome: "cor", valor: "<#hex|name>", desc: "sidebar color: `#FF71CE`, `purple`, `blue`… (`" + citarInterno("cor.presets") + "` lists the gradients)" },
    { nome: "imagem", valor: "<url|clear>", desc: "cover. A Stoat attachment becomes the embed cover; an external URL shows as a preview below" },
    { nome: "imagem", valor: "visible | hidden", desc: "whether the external URL is shown in text or hidden (default: hidden)" },
    { nome: "testar", desc: "posts it now using you as the example — no need to wait for someone to join" },
    { nome: "padrao", desc: "resets title and text to factory (keeps the channel)" },
    { nome: "status", desc: "shows the current setup and a preview" },
    { nome: "Markers", desc: "`{usuario}` mentions the person · `{nome}` just the name · `{servidor}` server name · `{membros}` member count" },
  ];
  return {
    boasvindas: joinLeave(),

    punicao: [
      { nome: "mode", valor: "warn | delete | confirm | stack | ban", desc: "`warn` only warns · `delete` removes the message · `confirm` silences and calls a moderator · `stack` climbs a ladder on repeat · `ban` bans on the spot" },
      { nome: "ladder", valor: "[warn,10m,2h,ban]", desc: "the steps of `stack` mode. Without a value, shows the current one. Default: warning → 5 min mute → 1 h mute → ban" },
      { nome: "warns", valor: "<n>", desc: `how many warnings until a ban — adjusts the ladder (the ban is always the last step). Applies to the automod and to \`${citar("warn", "en", P)}\`` },
      { nome: "expiry", valor: "<days|0>", desc: "warnings reset after that many days without a new one (default 30; 0 = never). Without a value, shows the current one" },
      { nome: "status", desc: "the current setup" },
      { nome: "Not here", desc: `\`test\`/\`simulate\` belong to \`${citarInterno("automod.sentinela")}\` (it's the one that reads the text); warnings are \`${citar("warn", "en", P)}\`, \`${citar("warn.lista", "en", P)}\` and \`${citar("warn.limpar", "en", P)}\`. \`' + citarInterno("automod.punicao") + '\` only decides **what happens** afterwards` },
    ],

    sentinela: [
      { nome: "on | off", desc: "toggles the filter that judges content (scams, NSFW, gore, glorifying crime)" },
      { nome: "sensitivity", valor: "low | medium | high", desc: "how suspicious it is. `high` catches more and errs more" },
      { nome: "tenure", valor: "on | off", desc: "stricter with newcomers (uses the XP level, or time on the server, as a proxy for seniority)" },
      { nome: "alert", valor: "on | off", desc: "alerts the staff when someone raises suspicion repeatedly, before punishing" },
      { nome: "channel", valor: "<#channel|here|off>", desc: "channel for alerts and `simulate`" },
      { nome: "test", valor: "<text>", desc: "shows the score (0–10) that text would get — punishes no one" },
      { nome: "simulate", valor: "<text>", desc: "fires the real flow in the alerts channel" },
      { nome: "ban | dismiss", valor: "<@user|id>", desc: "decides a pending case from `confirm` mode" },
      { nome: "topics", valor: "<topic> <off|alert|delete|punish>", desc: "topics the rules forbid (`politics`, `religion`, `drugs`, `sexual`): a weighted 0–10 score (terms, debate, attacks, context; laughter and emoji soften it) and the AI confirms. Also `test <text>`, `sensitivity`, `ai on|off`" },
      { nome: "avatar", valor: "action <alert|silence|kick|ban>", desc: "profile picture of whoever joins or changes it, through the vision model (default: 24 h silence + staff alert)" },
    ],

  };
}

// Renderiza a seção **Parâmetros** de um comando (ou "" se não houver).
export function secaoParametros(P, lang, comando, idioma = lang) {
  const lista = parametros(P, lang, idioma)[comando];
  if (!lista?.length) return "";
  const titulo = idioma === "es" ? `Parámetros de \`${P}${nomeExibido(comando, "es")}\`` : lang === "en" ? `Parameters of \`${P}${comando}\`` : `Parâmetros de \`${P}${comando}\``;
  const linhas = lista.map((p) => {
    const cab = p.valor ? `\`${p.nome}\` ${p.valor}` : `\`${p.nome}\``;
    return `• ${cab} — ${p.desc}`;
  });
  return `\n\n**${titulo}**\n${linhas.join("\n")}`;
}
