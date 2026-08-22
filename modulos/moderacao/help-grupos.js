// ══════════════════════════════════════════════════════════
//  help-grupos.js — a árvore do &help, organizada por INTENÇÃO
//
//  Antes o índice listava categorias por módulo interno ("geral",
//  "config", "ferramentas") — faz sentido para quem escreveu o bot,
//  não para quem acabou de criar um servidor. Agora os grupos são
//  as perguntas que a pessoa traz:
//
//   🚀 começar       — "acabei de adicionar o bot, e agora?"
//   🛡️ proteger      — "como evito spam, golpe, invasão?"
//   🎨 personalizar  — "boas-vindas, cargos, cor, embed, relógio"
//   🎮 diversão      — "XP, conversa com a Judy, voz"
//   🎲 rpg           — o jogo completo
//   🔧 diagnóstico   — "algo não funciona"
//   👑 dono          — só para o dono do bot (não aparece aos demais)
//
//  Os nomes antigos (`&help moderacao`, `&help config`…) continuam
//  funcionando via ALIAS_GRUPO, para não quebrar o hábito de ninguém.
//
//  Marque com IA_TAG a linha que só faz sentido onde a IA roda.
// ══════════════════════════════════════════════════════════

import { IA_TAG } from "./help-arvore.js";

// nome digitado → chave do grupo (aceita PT e EN, novos e antigos)
export const ALIAS_GRUPO = {
  // novos
  comecar: "comecar", "começar": "comecar", inicio: "comecar", start: "comecar", "getting-started": "comecar",
  proteger: "proteger", protecao: "proteger", "proteção": "proteger", protect: "proteger", protection: "proteger",
  personalizar: "personalizar", customize: "personalizar", customise: "personalizar", personalize: "personalizar",
  diversao: "diversao", "diversão": "diversao", fun: "diversao",
  rpg: "rpg", game: "rpg", jogo: "rpg", personagem: "rpg", character: "rpg",
  diagnostico: "diagnostico", "diagnóstico": "diagnostico", diagnostics: "diagnostico", problemas: "diagnostico", troubleshooting: "diagnostico",
  dono: "dono", owner: "dono",
  // antigos → onde o conteúdo foi parar
  geral: "comecar", general: "comecar",
  moderacao: "proteger", "moderação": "proteger", mod: "proteger", moderation: "proteger",
  automod: "proteger",
  config: "personalizar", configuracao: "personalizar", "configuração": "personalizar", configuration: "personalizar", settings: "personalizar",
  ferramentas: "personalizar", ferramenta: "personalizar", tools: "personalizar", tool: "personalizar",
  xp: "diversao", nivel: "diversao", niveis: "diversao", "níveis": "diversao", level: "diversao", levels: "diversao",
};

// Ordem fixa dos grupos no índice e nas páginas.
export const ORDEM = ["comecar", "proteger", "personalizar", "diversao", "rpg", "diagnostico"];

export function grupos(P, lang = "pt") {
  return lang === "en" ? gruposEN(P) : gruposPT(P);
}

function gruposPT(P) {
  return {
    comecar: {
      emoji: "🚀", titulo: "Começar",
      resumo: "acabou de adicionar o bot? comece aqui",
      linhas: [
        "**Os três primeiros comandos**",
        `\`${P}assistente\` — ⭐ configuração **guiada**: o bot pergunta, você responde, pronto`,
        `\`${P}tutorial\` — guia em páginas: permissões, canais, proteção, boas-vindas…`,
        `\`${P}config\` — panorama de tudo que está configurado neste servidor`,
        "",
        "**Regra de ouro dos canais**",
        "A permissão **do canal** vence a **do cargo**. Se o canal nega, o cargo não salva.",
        `Veja os 3 tipos de canal em \`${P}tutorial canais\` — resolve 80% dos "por que não funciona".`,
        "",
        "**Do dia a dia**",
        `\`${P}idioma pt|en\` — idioma do bot neste servidor *(ManagePermissions)*`,
        `\`${P}staff\` — quem é a equipe (os cargos com acesso aos comandos)`,
        `\`${P}userinfo [@pessoa]\` — ID, data de entrada e cargos`,
        `\`${P}sobre\` · \`${P}ping\` — informações e latência do bot`,
        `\`${P}repete <texto>\` — o bot repete (anúncios rápidos)`,
      ],
    },

    proteger: {
      emoji: "🛡️", titulo: "Proteger",
      resumo: "spam, golpe, links, invasão e punições",
      linhas: [
        "**Automático** *(ManagePermissions)*",
        `\`${P}automod\` — estado de cada filtro: antispam, antilink, anticaps, antiinvite…`,
        `\`${P}automod <filtro> on|off\` — liga/desliga um filtro`,
        `\`${P}sentinela\` — o filtro que **julga** conteúdo (golpe, +18, gore); antes chamava \`antiscam\``,
        `\`${P}punicao modo <avisar|apagar|confirmar|acumular|banir>\` — o que acontece com quem infringe`,
        `\`${P}punicao escada\` — os degraus do modo \`acumular\` (aviso → mute → ban)`,
        `\`${P}cargomudo\` — cria o cargo de silêncio que o mute usa`,
        `\`${P}banglobal <off|avisar|banir>\` — o que fazer com quem já foi banido em outro servidor *(BanMembers)*`,
        `\`${P}whitelist\` · \`${P}blocklist\` — convites permitidos · domínios proibidos`,
        `\`${P}modia\` — moderação por IA, com critérios em texto livre *(ManageServer)*` + IA_TAG,
        "",
        "**Manual**",
        `\`${P}warn @pessoa [motivo]\` — aviso (conta na escada) *(KickMembers)*`,
        `\`${P}warnings [@pessoa]\` · \`${P}clearwarnings @pessoa\` — ver e zerar avisos`,
        `\`${P}kick @pessoa [motivo]\` · \`${P}ban @pessoa [motivo]\``,
        `\`${P}limpar <n> [@pessoa]\` — apaga mensagens *(ManageMessages)*`,
        "",
        "**Quem modera e onde**",
        `\`${P}acesso cargo add @cargo\` — dá acesso aos comandos de moderação`,
        `\`${P}acesso canal somente\` + \`${P}acesso canal add #canal\` — comandos só em certos canais`,
      ],
    },

    personalizar: {
      emoji: "🎨", titulo: "Personalizar",
      resumo: "boas-vindas, cargos, cores, embeds, logs, notícias",
      linhas: [
        "**Entrada e saída** *(ManageMessages)*",
        `\`${P}boasvindas canal aqui\` — embed quando alguém entra (\`${P}help boasvindas\` explica cada parâmetro)`,
        `\`${P}adeus canal aqui\` — embed quando alguém sai`,
        `\`${P}autorole <cargo>\` — cargo automático a quem entra *(ManageRole)*`,
        "",
        "**Cargos** *(ManageRole)*",
        `\`${P}reactionrole add <mensagem> <emoji> <cargo>\` — cargo por reação`,
        `\`${P}cor <cargo> <cor|gradiente>\` — cor dos cargos, inclusive gradiente`,
        `\`${P}cor painel aqui\` — painel "escolha sua cor" pronto, num comando`,
        "",
        "**Mensagens e registro**",
        `\`${P}embed titulo: … | descricao: …\` — publica um embed bonito *(ManageMessages)*`,
        `\`${P}log canal aqui\` — onde o bot registra o que aconteceu *(ManagePermissions)*`,
        `\`${P}rss add <url>\` — curadoria de notícias num canal`,
        `\`${P}fuso add <cidade>\` — relógio com várias cidades`,
        "",
        "**O próprio bot**",
        `\`${P}comando <nome> on|off\` — liga/desliga um comando neste servidor`,
        `\`${P}idioma pt|en\` — idioma das respostas`,
      ],
    },

    diversao: {
      emoji: "🎮", titulo: "Diversão",
      resumo: "níveis por XP, conversa com a Judy, voz",
      linhas: [
        "**Níveis (XP por mensagem)**",
        `\`${P}xp\` — seu nível e progresso · \`${P}xp rank [@pessoa]\``,
        `\`${P}xp top\` — ranking do servidor`,
        `\`${P}xp setup\` — configurar: cargos por nível, multiplicador, canal de anúncio *(ManagePermissions)*`,
        `\`${P}xp criarcargos\` — cria os cargos de nível sozinho`,
        "",
        "**Judy (IA)**" + IA_TAG,
        `\`${P}chat <mensagem>\` — conversa (ou só mencione o bot)` + IA_TAG,
        `\`${P}chat livre on|off\` — ela entra sozinha na conversa deste canal` + IA_TAG,
        `\`${P}chat comentar aqui|off\` — comenta por iniciativa própria` + IA_TAG,
        `\`${P}chat perfil [@pessoa]\` · \`${P}chat esquecer [tudo]\` — o que ela lembra` + IA_TAG,
        "",
        "**Voz**",
        `\`${P}tts entrar\` — dentro da call: ela entra e lê tudo que for escrito ali`,
        `\`${P}tts <texto>\` — ou só uma frase específica`,
        "",
        `_O RPG é outro sistema, com personagem e economia: \`${P}help rpg\`._`,
      ],
    },

    rpg: {
      emoji: "🎲", titulo: "RPG",
      resumo: "personagem, missões, companheiros e economia",
      linhas: [
        "**Personagem**",
        `\`${P}game criar [nome]\` — cria · \`${P}game\` — sua ficha · \`${P}game ficha [@pessoa]\``,
        `\`${P}game pontos <atributo> [quantos]\` — distribui pontos (for, int, sor…)`,
        `\`${P}game magias\` · \`${P}game aprender <nome>\` — grimório`,
        `\`${P}game top\` — ranking · \`${P}game apagar confirmar\` — recomeça`,
        "",
        "**Aventura**",
        `\`${P}game missao\` — missões e suas chances · \`${P}game missao <nome>\` — parte`,
        `\`${P}game followers\` · \`${P}game recrutas\` · \`${P}game contratar [nome]\` — companheiros`,
        `\`${P}game follower levar|tirar <nome>\` — monta a party · \`${P}game follower ficha <nome>\``,
        `\`${P}game dungeon\` — quem está capturado · \`${P}game descansar\` — energia`,
        "",
        "**Itens**",
        `\`${P}game itens\` — mochila · \`${P}game item <nome>\` · \`${P}game catalogo [raridade|slot]\``,
        `\`${P}game equipar <item>\` · \`${P}game desequipar <slot|item>\``,
        "",
        "**Economia**",
        `\`${P}game carteira\` · \`${P}game comprar [item]\` · \`${P}game vender <item>\``,
        `\`${P}game mercado\` — bazar entre jogadores · \`${P}game trocar\` — escambo`,
        `\`${P}game cambio <qtd> <moeda> [para <moeda>]\` — câmbio com o banco`,
        "",
        `_Para **montar** o RPG no servidor: \`${P}tutorial game\`. Não confundir com \`${P}xp\`._`,
      ],
    },

    diagnostico: {
      emoji: "🔧", titulo: "Diagnóstico",
      resumo: "quando algo não funciona",
      linhas: [
        `\`${P}debug\` — o que cada comando precisa e o que está faltando`,
        `\`${P}debug canais\` — **o que o bot enxerga e pode fazer em CADA canal** (permissão de canal > cargo!)`,
        `\`${P}debug silence @pessoa\` — o mute vai funcionar nessa pessoa?`,
        `\`${P}config\` — panorama de tudo que está ligado`,
        `\`${P}automod status\` · \`${P}sentinela\` · \`${P}punicao\` — estado da proteção`,
        `\`${P}reactionrole list\` · \`${P}reactionrole recarregar\` — se os cargos por reação pararam`,
        `\`${P}ping\` — o bot está respondendo?`,
        "",
        "**Os três culpados de sempre**",
        "1. Falta permissão no **canal** (não no cargo) → `debug canais`",
        "2. O cargo do bot está **abaixo** do cargo que ele precisa mexer → suba ele na lista",
        "3. `ManageRole` ≠ `AssignRoles`: um cria cargos, o outro entrega → o bot precisa dos dois",
      ],
    },

    dono: {
      emoji: "👑", titulo: "Dono do bot",
      resumo: "só você vê esta página",
      linhas: [
        `\`${P}servidores\` — cada servidor: nome, membros, mensagens por minuto`,
        `\`${P}game admin\` — ferramentas de teste e economia do RPG (\`${P}help game admin\`)`,
        `\`${P}automod debug on|off\` — log detalhado do automod (global)`,
        `\`${P}banglobal revisar\` — revisa a lista global`,
        "",
        "_A IA (\`chat\`, \`modia\`, comentário espontâneo) roda só nos servidores de `CHAT_SERVIDORES`._",
      ],
    },
  };
}

function gruposEN(P) {
  return {
    comecar: {
      emoji: "🚀", titulo: "Getting started",
      resumo: "just added the bot? start here",
      linhas: [
        "**The first three commands**",
        `\`${P}assistente\` — ⭐ **guided** setup: the bot asks, you answer, done`,
        `\`${P}tutorial\` — paged guide: permissions, channels, protection, welcome…`,
        `\`${P}config\` — overview of everything configured on this server`,
        "",
        "**The golden rule of channels**",
        "**Channel** permissions beat **role** permissions. If the channel denies it, the role can't save it.",
        `See the 3 channel types in \`${P}tutorial canais\` — it solves 80% of "why doesn't it work".`,
        "",
        "**Everyday**",
        `\`${P}idioma pt|en\` — the bot's language on this server *(ManagePermissions)*`,
        `\`${P}staff\` — who the team is (the roles with command access)`,
        `\`${P}userinfo [@user]\` — ID, join date and roles`,
        `\`${P}sobre\` · \`${P}ping\` — bot info and latency`,
        `\`${P}repete <text>\` — the bot repeats it (quick announcements)`,
      ],
    },

    proteger: {
      emoji: "🛡️", titulo: "Protect",
      resumo: "spam, scams, links, raids and punishments",
      linhas: [
        "**Automatic** *(ManagePermissions)*",
        `\`${P}automod\` — each filter's state: antispam, antilink, anticaps, antiinvite…`,
        `\`${P}automod <filter> on|off\` — toggles a filter`,
        `\`${P}sentinela\` — the filter that **judges** content (scams, NSFW, gore); formerly \`antiscam\``,
        `\`${P}punicao modo <avisar|apagar|confirmar|acumular|banir>\` — what happens to offenders`,
        `\`${P}punicao escada\` — the steps of \`acumular\` mode (warning → mute → ban)`,
        `\`${P}cargomudo\` — creates the silence role that mutes use`,
        `\`${P}banglobal <off|avisar|banir>\` — what to do with people banned on other servers *(BanMembers)*`,
        `\`${P}whitelist\` · \`${P}blocklist\` — allowed invites · forbidden domains`,
        `\`${P}modia\` — AI moderation with free-text criteria *(ManageServer)*` + IA_TAG,
        "",
        "**Manual**",
        `\`${P}warn @user [reason]\` — warning (counts on the ladder) *(KickMembers)*`,
        `\`${P}warnings [@user]\` · \`${P}clearwarnings @user\` — see and clear warnings`,
        `\`${P}kick @user [reason]\` · \`${P}ban @user [reason]\``,
        `\`${P}limpar <n> [@user]\` — deletes messages *(ManageMessages)*`,
        "",
        "**Who moderates and where**",
        `\`${P}acesso cargo add @role\` — grants access to moderation commands`,
        `\`${P}acesso canal somente\` + \`${P}acesso canal add #channel\` — commands only in chosen channels`,
      ],
    },

    personalizar: {
      emoji: "🎨", titulo: "Customize",
      resumo: "welcome, roles, colors, embeds, logs, news",
      linhas: [
        "**Join and leave** *(ManageMessages)*",
        `\`${P}boasvindas canal aqui\` — embed when someone joins (\`${P}help boasvindas\` explains every parameter)`,
        `\`${P}adeus canal aqui\` — embed when someone leaves`,
        `\`${P}autorole <role>\` — automatic role on join *(ManageRole)*`,
        "",
        "**Roles** *(ManageRole)*",
        `\`${P}reactionrole add <message> <emoji> <role>\` — reaction roles`,
        `\`${P}cor <role> <color|gradient>\` — role colors, gradients included`,
        `\`${P}cor painel aqui\` — a ready-made "pick your color" panel, in one command`,
        "",
        "**Messages and logging**",
        `\`${P}embed titulo: … | descricao: …\` — posts a pretty embed *(ManageMessages)*`,
        `\`${P}log canal aqui\` — where the bot writes down what happened *(ManagePermissions)*`,
        `\`${P}rss add <url>\` — news curation in a channel`,
        `\`${P}fuso add <city>\` — clock with several cities`,
        "",
        "**The bot itself**",
        `\`${P}comando <name> on|off\` — toggles a command on this server`,
        `\`${P}idioma pt|en\` — language of the replies`,
      ],
    },

    diversao: {
      emoji: "🎮", titulo: "Fun",
      resumo: "XP levels, chatting with Judy, voice",
      linhas: [
        "**Levels (message XP)**",
        `\`${P}xp\` — your level and progress · \`${P}xp rank [@user]\``,
        `\`${P}xp top\` — server ranking`,
        `\`${P}xp setup\` — configure: level roles, multiplier, announcement channel *(ManagePermissions)*`,
        `\`${P}xp criarcargos\` — creates the level roles by itself`,
        "",
        "**Judy (AI)**" + IA_TAG,
        `\`${P}chat <message>\` — talk (or just mention the bot)` + IA_TAG,
        `\`${P}chat livre on|off\` — she joins this channel's conversation on her own` + IA_TAG,
        `\`${P}chat comentar aqui|off\` — comments on her own initiative` + IA_TAG,
        `\`${P}chat perfil [@user]\` · \`${P}chat esquecer [tudo]\` — what she remembers` + IA_TAG,
        "",
        "**Voice**",
        `\`${P}tts entrar\` — inside the call: she joins and reads everything written there`,
        `\`${P}tts <text>\` — or just one specific line`,
        "",
        `_The RPG is a separate system, with a character and an economy: \`${P}help rpg\`._`,
      ],
    },

    rpg: {
      emoji: "🎲", titulo: "RPG",
      resumo: "character, missions, companions and economy",
      linhas: [
        "**Character**",
        `\`${P}game criar [name]\` — create · \`${P}game\` — your sheet · \`${P}game ficha [@user]\``,
        `\`${P}game pontos <attribute> [amount]\` — spends points (str, int, luck…)`,
        `\`${P}game magias\` · \`${P}game aprender <name>\` — grimoire`,
        `\`${P}game top\` — ranking · \`${P}game apagar confirmar\` — start over`,
        "",
        "**Adventure**",
        `\`${P}game missao\` — missions and your odds · \`${P}game missao <name>\` — set off`,
        `\`${P}game followers\` · \`${P}game recrutas\` · \`${P}game contratar [name]\` — companions`,
        `\`${P}game follower levar|tirar <name>\` — builds the party · \`${P}game follower ficha <name>\``,
        `\`${P}game dungeon\` — who's captured · \`${P}game descansar\` — energy`,
        "",
        "**Items**",
        `\`${P}game itens\` — backpack · \`${P}game item <name>\` · \`${P}game catalogo [rarity|slot]\``,
        `\`${P}game equipar <item>\` · \`${P}game desequipar <slot|item>\``,
        "",
        "**Economy**",
        `\`${P}game carteira\` · \`${P}game comprar [item]\` · \`${P}game vender <item>\``,
        `\`${P}game mercado\` — player bazaar · \`${P}game trocar\` — bartering`,
        `\`${P}game cambio <qty> <currency> [para <currency>]\` — exchange with the bank`,
        "",
        `_To **set up** the RPG on the server: \`${P}tutorial game\`. Not to be confused with \`${P}xp\`._`,
      ],
    },

    diagnostico: {
      emoji: "🔧", titulo: "Diagnostics",
      resumo: "when something doesn't work",
      linhas: [
        `\`${P}debug\` — what each command needs and what's missing`,
        `\`${P}debug canais\` — **what the bot can see and do in EACH channel** (channel permission > role!)`,
        `\`${P}debug silence @user\` — will the mute work on that person?`,
        `\`${P}config\` — overview of everything that's on`,
        `\`${P}automod status\` · \`${P}sentinela\` · \`${P}punicao\` — protection state`,
        `\`${P}reactionrole list\` · \`${P}reactionrole recarregar\` — if reaction roles stopped`,
        `\`${P}ping\` — is the bot responding?`,
        "",
        "**The three usual suspects**",
        "1. Missing permission on the **channel** (not the role) → `debug canais`",
        "2. The bot's role sits **below** the role it needs to touch → move it up the list",
        "3. `ManageRole` ≠ `AssignRoles`: one creates roles, the other hands them out → the bot needs both",
      ],
    },

    dono: {
      emoji: "👑", titulo: "Bot owner",
      resumo: "only you can see this page",
      linhas: [
        `\`${P}servidores\` — each server: name, members, messages per minute`,
        `\`${P}game admin\` — RPG testing and economy tools (\`${P}help game admin\`)`,
        `\`${P}automod debug on|off\` — verbose automod log (global)`,
        `\`${P}banglobal revisar\` — reviews the global list`,
        "",
        "_The AI (\`chat\`, \`modia\`, spontaneous comments) only runs on the servers in `CHAT_SERVIDORES`._",
      ],
    },
  };
}
