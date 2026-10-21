
import { gruposES } from "./help-arvore-es.js";
import { trechoPronto } from "../core/aliases.js";
import { IA_TAG, MODIA_TAG } from "./help-arvore.js";
import { citar, citarInterno } from "../core/aliases.js";

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
  // (20 out 2026) `config`, `settings`, `configuration` e `configuração` NÃO são mais grupo:
  // abrem a página do &config, o panorama de todas as configurações do servidor (antes
  // ela não abria em idioma nenhum — o grupo Personalizar vencia)
  ferramentas: "personalizar", ferramenta: "personalizar", tools: "personalizar", tool: "personalizar",
  xp: "diversao", nivel: "diversao", niveis: "diversao", "níveis": "diversao", level: "diversao", levels: "diversao",
};

// Ordem fixa dos grupos no índice e nas páginas.
export const ORDEM = ["comecar", "proteger", "personalizar", "diversao", "rpg", "diagnostico"];

export function grupos(P, lang = "pt") {
  if (lang === "es") {
    // (etapa 4b) o grupo em espanhol vence o inglês; o que falta sai em inglês
    const en = gruposEN(P), es = gruposES(P);
    for (const [k, g] of Object.entries(es)) {
      if (!en[k]) continue;
      en[k] = { ...en[k], ...g, titulo: trechoPronto(g.titulo ?? en[k].titulo), resumo: trechoPronto(g.resumo ?? en[k].resumo), linhas: (g.linhas ?? en[k].linhas).map((l) => (l ? trechoPronto(l) : l)) };
    }
    return en;
  }
  return lang === "en" ? gruposEN(P) : gruposPT(P);
}

function gruposPT(P) {
  return {
    comecar: {
      emoji: "🚀", titulo: "Começar",
      resumo: "acabou de adicionar o bot? comece aqui",
      linhas: [
        "**Os três primeiros comandos**",
        `\`${citarInterno("assistente", P)}\` — ⭐ configuração **guiada**: o bot pergunta, você responde, pronto`,
        `\`${citarInterno("tutorial", P)}\` — guia em páginas: permissões, canais, proteção, boas-vindas…`,
        `\`${citar("config", "pt", P)}\` — panorama de tudo que está configurado neste servidor`,
        "",
        "**Regra de ouro dos canais**",
        "A permissão **do canal** vence a **do cargo**. Se o canal nega, o cargo não salva.",
        `Veja os 3 tipos de canal em \`${citarInterno("tutorial.canais", P)}\` — resolve 80% dos "por que não funciona".`,
        "",
        "**Do dia a dia**",
        `\`${citar("idioma", "pt", P)} pt|en|es\` — idioma do bot neste servidor *(ManagePermissions)*`,
        `\`${citarInterno("staff", P)}\` — quem é a equipe · \`${citarInterno("servidor", P)}\` — regras, canais, cargos e FAQ`,
        `\`${citar("userinfo", "pt", P)} [@pessoa]\` — ID, data de entrada e cargos`,
        `\`${citar("sobre", "pt", P)}\` · \`${citar("ping", "pt", P)}\` — informações e latência do bot`,
        `\`${citar("repete", "pt", P)} <texto>\` — o bot repete (anúncios rápidos)`,
      ],
    },

    proteger: {
      emoji: "🛡️", titulo: "Proteger",
      resumo: "spam, golpe, links, invasão e punições",
      linhas: [
        "**Automático** *(ManagePermissions)*",
        `\`${citarInterno("automod", P)}\` — os 4 grupos: antispam, antiruido, antilink, sentinela`,
        `\`${citarInterno("automod", P)} antispam off\` · \`${citarInterno("automod", P)} off\` — um grupo · tudo _(começa desligado)_`,
        `\`${citarInterno("automod.sentinela", P)}\` — o que **julga** conteúdo (golpe, +18, ódio, imagem, tema, avatar)`,
        `\`${citarInterno("automod.punicao", P)} modo <avisar|apagar|confirmar|acumular|banir>\` — o que acontece com quem infringe`,
        `\`${citarInterno("automod.punicao", P)} escada\` — os degraus do \`acumular\` (aviso → mute → ban)`,
        `\`${citarInterno("banglobal", P)} <off|avisar|imediato|consenso>\` — quem já foi banido em outro servidor *(BanMembers)*`,
        `\`${citarInterno("automod", P)} whitelist\` · \`${citarInterno("automod", P)} blocklist\` — convites permitidos · domínios proibidos`,
        `\`${citarInterno("modia", P)}\` — moderação por IA, critérios em texto livre *(ManageServer)*` + MODIA_TAG,
        "",
        "**Manual**",
        `\`${citar("warn", "pt", P)} @pessoa [motivo]\` — aviso (conta na escada) *(ManageMessages)*`,
        `\`${citar("warn.lista", "pt", P)} [@pessoa]\` · \`${citar("warn.limpar", "pt", P)} @pessoa\` — ver e zerar avisos`,
        `\`${citar("silenciar", "pt", P)} @pessoa <tempo> [motivo]\` — silêncio nativo do Stoat *(TimeoutMembers)*`,
        `\`${citar("kick", "pt", P)} @pessoa [motivo]\` · \`${citar("ban", "pt", P)} @pessoa [motivo]\``,
        `\`${citar("limpar", "pt", P)} <n> [@pessoa]\` — apaga mensagens *(ManageMessages)*`,
        "",
        "**Quem modera e onde**",
        `\`${citarInterno("acesso.cargo.add", P)} @cargo\` — dá acesso aos comandos de moderação`,
        `\`${citarInterno("acesso.canal.somente", P)}\` + \`${citarInterno("acesso.canal.add", P)} #canal\` — comandos só em certos canais`,
      ],
    },

    personalizar: {
      emoji: "🎨", titulo: "Personalizar",
      resumo: "boas-vindas, cargos, cores, embeds, logs, notícias",
      linhas: [
        "**Entrada e saída** *(ManageMessages)*",
        `\`${citarInterno("boasvindas.canal.aqui", P)}\` — embed quando alguém entra (\`${P}help boasvindas\` explica cada parâmetro)`,
        `\`${citar("adeus.canal.aqui", "pt", P)}\` — embed quando alguém sai`,
        `\`${citar("autorole", "pt", P)} <cargo>\` — cargo automático a quem entra *(ManageRole)*`,
        "",
        "**Cargos** *(ManageRole)*",
        `\`${citarInterno("reactionrole.add", P)} <mensagem> <emoji> <cargo>\` — cargo por reação`,
        `\`${citarInterno("cor", P)} <cargo> <cor|gradiente>\` — cor dos cargos, inclusive gradiente`,
        `\`${citarInterno("cor.painel.aqui", P)}\` — painel "escolha sua cor" pronto, num comando`,
        "",
        "**Mensagens e registro**",
        `\`${citar("embed", "pt", P)} titulo: … | descricao: …\` — publica um embed bonito *(ManageMessages)*`,
        `\`${citar("log.canal.aqui", "pt", P)}\` — onde o bot registra o que aconteceu *(ManagePermissions)*`,
        `\`${citarInterno("rss.add", P)} <url>\` — curadoria de notícias num canal`,
        `\`${citarInterno("fuso.add", P)} <cidade>\` — relógio com várias cidades`,
        `\`${citar("webhook.criar", "pt", P)} <nome> [#canal]\` — GitHub, Crafty/Minecraft e afins publicando nos seus canais, um gancho por assunto`,
        `\`${citar("rolar", "pt", P)} 2d20kh1+5\` — dados de RPG completos (vantagem, explosão, sucessos, Fate) · \`${citar("iniciativa", "pt", P)}\` — ordem de combate`,
        `\`${citarInterno("ticket.painel", P)} #canal\` — painel em que se **reage** para abrir um ticket; 🔒 (staff) trava e manda o registro .txt ao log`,
        "",
        "**O próprio bot**",
        `\`${citar("comando.desativar", "pt", P)}|ativar <nome>\` — liga/desliga um comando neste servidor`,
        `\`${citar("idioma", "pt", P)} pt|en|es\` — idioma das respostas · \`${citar("reset", "pt", P)}\` — configuração de fábrica *(dono do servidor)*`,
      ],
    },

    diversao: {
      emoji: "🎮", titulo: "Diversão",
      resumo: "níveis por XP, a moeda do servidor, brincadeiras, conversa com a Judy, voz",
      resumoSemIA: "níveis por XP, a moeda do servidor, brincadeiras e voz",
      linhas: [
        "**Níveis (XP por mensagem)**",
        `\`${citarInterno("xp", P)}\` — seu nível e progresso · \`${citarInterno("xp.rank", P)} [@pessoa]\` · \`${citarInterno("xp.sair", P)}\` — fica de fora do XP`,
        `\`${citarInterno("xp.top", P)}\` — ranking do servidor`,
        `\`${citarInterno("economia", P)}\` — a moeda do servidor: \`minerar\`, \`top\`, \`loja\` de cargos e \`comprar\``,
        `\`${citarInterno("xp.setup", P)}\` — configurar: cargos por nível, multiplicador, canal de anúncio *(ManagePermissions)*`,
        `\`${citarInterno("xp.criarcargos", P)}\` — cria os cargos de nível sozinho`,
        "",
        "**Entretenimento**",
        `\`${citarInterno("entretenimento", P)} ship @a @b\` — quantos % combinam · \`${citarInterno("entretenimento.briga", P)} @a @b\` — quem ganha`,
        `\`${citarInterno("entretenimento", P)} cowsay <texto>\` — um bicho em ASCII falando · e mais: \`bola8\`, \`escolher\`, \`nota\`, \`sorte\`, \`zoeira\`, \`inverter\``,
        `\`${citarInterno("entretenimento.campominado", P)}\` · \`${citarInterno("entretenimento.velha", P)} [@pessoa]\` — campo minado e jogo da velha`,
        "",
        "**Judy (IA)**" + IA_TAG,
        `\`${citarInterno("chat", P)} <mensagem>\` — conversa (ou só mencione o bot)` + IA_TAG,
        `\`${citarInterno("chat.livre", P)} on|off\` — ela entra sozinha na conversa deste canal` + IA_TAG,
        `\`${citarInterno("chat.comentar.aqui", P)}|off\` — comenta por iniciativa própria` + IA_TAG,
        `\`${citarInterno("chat.perfil", P)}\` · \`${citarInterno("chat.esquecer", P)} [tudo]\` — o que ela lembra de você` + IA_TAG,
        `\`${citar("personalidade", "pt", P)}\` — vê/define o prompt de personalidade da IA *(ManageServer)*` + IA_TAG,
        "",
        "**Voz**",
        `\`${citarInterno("entrar", P)}\` — de qualquer canal: ela entra na sua call e lê o canal onde você digitou (\`${citarInterno("sair", P)}\` desfaz)`,
        `\`${citarInterno("tts", P)} <texto>\` — ou só uma frase específica`,
        `\`${citarInterno("musica", P)} <link ou nome>\` — música na call (YouTube, SoundCloud, Spotify) com fila, skip e volume — e ela abaixa sozinha quando o TTS fala`,
        "",
        `_O RPG é outro sistema, com personagem, mercado e moedas próprios: \`${P}help rpg\`._`,
      ],
    },

    rpg: {
      emoji: "🎲", titulo: "RPG",
      resumo: "personagem, missões, companheiros e mercado",
      linhas: [
        "**Personagem**",
        `\`${citarInterno("game.criar", P)} [nome]\` — cria · \`${citarInterno("game", P)}\` — sua ficha · \`${citarInterno("game.ficha", P)} [@pessoa]\``,
        `\`${citarInterno("game.pontos", P)} <atributo> [quantos]\` — distribui pontos (for, int, sor…)`,
        `\`${citarInterno("game.magias", P)}\` · \`${citarInterno("game.aprender", P)} <nome>\` — grimório`,
        `\`${citarInterno("game.top", P)}\` — ranking · \`${citarInterno("game.apagar.confirmar", P)}\` — recomeça`,
        "",
        "**Aventura**",
        `\`${citarInterno("game.missao", P)}\` — missões e suas chances · \`${citarInterno("game.missao", P)} <nome>\` — parte`,
        `\`${citarInterno("game", P)} coop abrir <missão>\` — chama até 4 pessoas para a dungeon · \`${citarInterno("game", P)} coop entrar\``,
        `\`${citarInterno("game", P)} resetar pontos\` — devolve os pontos gastos para redistribuir (custa Ouro)`,
        `\`${citarInterno("game.followers", P)}\` · \`${citarInterno("game.recrutas", P)}\` · \`${citarInterno("game.contratar", P)} [nome]\` — companheiros`,
        `\`${citarInterno("game.follower.levar", P)}|tirar <nome>\` — monta a party · \`${citarInterno("game.follower.ficha", P)} <nome>\``,
        `\`${citarInterno("game.dungeon", P)}\` — quem está capturado · \`${citarInterno("game.descansar", P)}\` — energia`,
        "",
        "**Itens**",
        `\`${citarInterno("game.itens", P)}\` — mochila · \`${citarInterno("game.item", P)} <nome>\` · \`${citarInterno("game.catalogo", P)} [raridade] [tipo]\``,
        `\`${citarInterno("game.equipar", P)} <item>\` · \`${citarInterno("game.desequipar", P)} <slot|item>\``,
        "",
        "**Mercado e moedas do jogo**",
        `\`${citarInterno("game.carteira", P)}\` · \`${citarInterno("game.comprar", P)} [item]\` · \`${citarInterno("game.vender", P)} <item>\``,
        `\`${citarInterno("game.mercado", P)}\` — bazar entre jogadores · \`${citarInterno("game.trocar", P)}\` — escambo`,
        `\`${citarInterno("game.cambio", P)} <qtd> <moeda> [para <moeda>]\` — câmbio com o banco`,
        "",
        `_O RPG é um mundo só, igual em todo servidor — a wiki: \`${citarInterno("tutorial", P)} game\`. Não confundir com \`${citarInterno("xp", P)}\`._`,
      ],
    },

    diagnostico: {
      emoji: "🔧", titulo: "Diagnóstico",
      resumo: "quando algo não funciona",
      linhas: [
        `\`${citarInterno("debug", P)}\` — **o diagnóstico completo**: o que está quebrado primeiro, depois permissões, hierarquia, canais, voz e IA`,
        `\`${citarInterno("debug", P)} @pessoa\` — o que o bot consegue fazer com essa pessoa (punir, silenciar, cargos de nível)`,
        `\`${citarInterno("debug", P)} #canal\` — a conta de permissão do bot nesse canal (permissão de canal > cargo!)`,
        `\`${citar("config", "pt", P)}\` — panorama de tudo que está ligado`,
        `\`${citarInterno("automod.status", P)}\` · \`${citarInterno("automod.sentinela", P)}\` · \`${citarInterno("automod.punicao", P)}\` — estado da proteção`,
        `\`${citarInterno("reactionrole.list", P)}\` · \`${citarInterno("reactionrole.recarregar", P)}\` — se os cargos por reação pararam`,
        `\`${citar("ping", "pt", P)}\` — o bot está respondendo?`,
        "",
        "**Os três culpados de sempre**",
        "1. Falta permissão no **canal** (não no cargo) → `debug #canal`",
        "2. O cargo do bot está **abaixo** do cargo que ele precisa mexer → suba ele na lista",
        "3. `ManageRole` ≠ `AssignRoles`: um cria cargos, o outro entrega → o bot precisa dos dois",
      ],
    },

    dono: {
      emoji: "👑", titulo: "Dono do bot",
      resumo: "só você vê esta página",
      linhas: [
        `\`${citarInterno("servidores", P)}\` — cada servidor: nome, membros, mensagens por minuto`,
        `\`${citarInterno("game.admin", P)}\` — ferramentas de teste e moedas do RPG (\`${P}help game admin\`)`,
        `\`${citarInterno("automod.debug", P)} on|off\` — log detalhado do automod (global)`,
        `\`${citarInterno("banglobal.revisar", P)}\` — revisa a lista global`,
        "",
        "_A IA de conversa (\`chat\`, comentário espontâneo, gerar imagem, resumo do RSS) roda só nos servidores de `SERVIDOR`; nos outros fica só a moderação por IA (\`modia\`, temas proibidos, imagens e fotos de perfil)._" + IA_TAG,
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
        `\`${citarInterno("assistente", P)}\` — ⭐ **guided** setup: the bot asks, you answer, done`,
        `\`${citarInterno("tutorial", P)}\` — paged guide: permissions, channels, protection, welcome…`,
        `\`${citar("config", "en", P)}\` — overview of everything configured on this server`,
        "",
        "**The golden rule of channels**",
        "**Channel** permissions beat **role** permissions. If the channel denies it, the role can't save it.",
        `See the 3 channel types in \`${citarInterno("tutorial.canais", P)}\` — it solves 80% of "why doesn't it work".`,
        "",
        "**Everyday**",
        `\`${citar("idioma", "en", P)} pt|en|es\` — the bot's language on this server *(ManagePermissions)*`,
        `\`${citarInterno("staff", P)}\` — who the team is · \`${citarInterno("servidor", P)}\` — rules, channels, roles and FAQ`,
        `\`${citar("userinfo", "en", P)} [@user]\` — ID, join date and roles`,
        `\`${citar("sobre", "en", P)}\` · \`${citar("ping", "en", P)}\` — bot info and latency`,
        `\`${citar("repete", "en", P)} <text>\` — the bot repeats it (quick announcements)`,
      ],
    },

    proteger: {
      emoji: "🛡️", titulo: "Protect",
      resumo: "spam, scams, links, raids and punishments",
      linhas: [
        "**Automatic** *(ManagePermissions)*",
        `\`${citarInterno("automod", P)}\` — the 4 groups: antispam, antinoise, antilink, sentinel`,
        `\`${citarInterno("automod", P)} antispam off\` · \`${citarInterno("automod", P)} off\` — one group · everything _(starts off)_`,
        `\`${citarInterno("automod.sentinela", P)}\` — what **judges** content (scams, NSFW, hate, images, topics, avatars)`,
        `\`${citarInterno("automod.punicao", P)} modo <avisar|apagar|confirmar|acumular|banir>\` — what happens to offenders`,
        `\`${citarInterno("automod.punicao", P)} escada\` — the steps of \`acumular\` mode (warning → mute → ban)`,
        `\`${citarInterno("banglobal", P)} <off|avisar|imediato|consenso>\` — people banned on other servers *(BanMembers)*`,
        `\`${citarInterno("automod", P)} whitelist\` · \`${citarInterno("automod", P)} blocklist\` — allowed invites · forbidden domains`,
        `\`${citarInterno("modia", P)}\` — AI moderation with free-text criteria *(ManageServer)*` + MODIA_TAG,
        "",
        "**Manual**",
        `\`${citar("warn", "en", P)} @user [reason]\` — warning (counts on the ladder) *(ManageMessages)*`,
        `\`${citar("warn.lista", "en", P)} [@user]\` · \`${citar("warn.limpar", "en", P)} @user\` — see and clear warnings`,
        `\`${citar("silenciar", "en", P)} @user <time> [reason]\` — Stoat's native timeout *(TimeoutMembers)*`,
        `\`${citar("kick", "en", P)} @user [reason]\` · \`${citar("ban", "en", P)} @user [reason]\``,
        `\`${citar("limpar", "en", P)} <n> [@user]\` — deletes messages *(ManageMessages)*`,
        "",
        "**Who moderates and where**",
        `\`${citarInterno("acesso.cargo.add", P)} @role\` — grants access to moderation commands`,
        `\`${citarInterno("acesso.canal.somente", P)}\` + \`${citarInterno("acesso.canal.add", P)} #channel\` — commands only in chosen channels`,
      ],
    },

    personalizar: {
      emoji: "🎨", titulo: "Customize",
      resumo: "welcome, roles, colors, embeds, logs, news",
      linhas: [
        "**Join and leave** *(ManageMessages)*",
        `\`${citarInterno("boasvindas.canal.aqui", P)}\` — embed when someone joins (\`${P}help boasvindas\` explains every parameter)`,
        `\`${citar("adeus.canal.aqui", "en", P)}\` — embed when someone leaves`,
        `\`${citar("autorole", "en", P)} <role>\` — automatic role on join *(ManageRole)*`,
        "",
        "**Roles** *(ManageRole)*",
        `\`${citarInterno("reactionrole.add", P)} <message> <emoji> <role>\` — reaction roles`,
        `\`${citarInterno("cor", P)} <role> <color|gradient>\` — role colors, gradients included`,
        `\`${citarInterno("cor.painel.aqui", P)}\` — a ready-made "pick your color" panel, in one command`,
        "",
        "**Messages and logging**",
        `\`${citar("embed", "en", P)} title: … | description: …\` — posts a pretty embed *(ManageMessages)*`,
        `\`${citar("log.canal.aqui", "en", P)}\` — where the bot writes down what happened *(ManagePermissions)*`,
        `\`${citarInterno("rss.add", P)} <url>\` — news curation in a channel`,
        `\`${citarInterno("fuso.add", P)} <city>\` — clock with several cities`,
        `\`${citar("webhook.criar", "en", P)} <name> [#channel]\` — GitHub, Crafty/Minecraft and friends posting into your channels, one hook per subject`,
        `\`${citar("rolar", "en", P)} 2d20kh1+5\` — full tabletop dice (advantage, exploding, successes, Fate) · \`${citar("iniciativa", "en", P)}\` — combat order`,
        `\`${citarInterno("ticket.painel", P)} #channel\` — a panel people **react** on to open a ticket; 🔒 (staff) locks it and sends the .txt record to the log`,
        "",
        "**The bot itself**",
        `\`${citar("comando.desativar", "en", P)}|enable <name>\` — toggles a command on this server`,
        `\`${citar("idioma", "en", P)} pt|en|es\` — language of the replies · \`${citar("reset", "en", P)}\` — factory settings *(server owner)*`,
      ],
    },

    diversao: {
      emoji: "🎮", titulo: "Fun",
      resumo: "XP levels, the server currency, games, chatting with Judy, voice",
      resumoSemIA: "XP levels, the server currency, games and voice",
      linhas: [
        "**Levels (message XP)**",
        `\`${citarInterno("xp", P)}\` — your level and progress · \`${citarInterno("xp.rank", P)} [@user]\` · \`${citarInterno("xp.sair", P)}\` — stay out of XP`,
        `\`${citarInterno("xp.top", P)}\` — server ranking`,
        `\`${citarInterno("economia", P)}\` — the server's currency: \`minerar\`, \`top\`, the role \`loja\` and \`comprar\``,
        `\`${citarInterno("xp.setup", P)}\` — configure: level roles, multiplier, announcement channel *(ManagePermissions)*`,
        `\`${citarInterno("xp.criarcargos", P)}\` — creates the level roles by itself`,
        "",
        "**Entertainment**",
        `\`${citarInterno("entretenimento", P)} ship @a @b\` — how many % they match · \`${citarInterno("entretenimento.briga", P)} @a @b\` — who wins`,
        `\`${citarInterno("entretenimento", P)} cowsay <text>\` — an ASCII critter talking · and more: \`8ball\`, \`choose\`, \`rate\`, \`fortune\`, \`mock\`, \`reverse\``,
        `\`${citarInterno("entretenimento.campominado", P)}\` · \`${citarInterno("entretenimento.velha", P)} [@user]\` — minesweeper and tic-tac-toe`,
        "",
        "**Judy (AI)**" + IA_TAG,
        `\`${citarInterno("chat", P)} <message>\` — talk (or just mention the bot)` + IA_TAG,
        `\`${citarInterno("chat.livre", P)} on|off\` — she joins this channel's conversation on her own` + IA_TAG,
        `\`${citarInterno("chat.comentar.aqui", P)}|off\` — comments on her own initiative` + IA_TAG,
        `\`${citar("personalidade", "en", P)}\` — view/set the AI personality prompt *(ManageServer)*` + IA_TAG,
        `\`${citarInterno("chat.perfil", P)}\` · \`${citarInterno("chat.esquecer", P)} [tudo]\` — what she remembers about you` + IA_TAG,
        "",
        "**Voice**",
        `\`${citarInterno("entrar", P)}\` — from any channel: she joins your call and reads the channel where you typed it (\`${citarInterno("sair", P)}\` undoes it)`,
        `\`${citarInterno("tts", P)} <text>\` — or just one specific line`,
        `\`${citarInterno("musica", P)} <link or name>\` — music in the call (YouTube, SoundCloud, Spotify) with queue, skip and volume — it auto-ducks while TTS speaks`,
        "",
        `_The RPG is a separate system, with its own character, market and currencies: \`${P}help rpg\`._`,
      ],
    },

    rpg: {
      emoji: "🎲", titulo: "RPG",
      resumo: "character, missions, companions and market",
      linhas: [
        "**Character**",
        `\`${citarInterno("game.criar", P)} [name]\` — create · \`${citarInterno("game", P)}\` — your sheet · \`${citarInterno("game.ficha", P)} [@user]\``,
        `\`${citarInterno("game.pontos", P)} <attribute> [amount]\` — spends points (str, int, luck…)`,
        `\`${citarInterno("game.magias", P)}\` · \`${citarInterno("game.aprender", P)} <name>\` — grimoire`,
        `\`${citarInterno("game.top", P)}\` — ranking · \`${citarInterno("game.apagar.confirmar", P)}\` — start over`,
        "",
        "**Adventure**",
        `\`${citarInterno("game.missao", P)}\` — missions and your odds · \`${citarInterno("game.missao", P)} <name>\` — set off`,
        `\`${citarInterno("game", P)} coop abrir <mission>\` — calls up to 4 people to the dungeon · \`${citarInterno("game", P)} coop entrar\``,
        `\`${citarInterno("game", P)} respec points\` — gives back the spent points to redistribute (costs Gold)`,
        `\`${citarInterno("game.followers", P)}\` · \`${citarInterno("game.recrutas", P)}\` · \`${citarInterno("game.contratar", P)} [name]\` — companions`,
        `\`${citarInterno("game.follower.levar", P)}|tirar <name>\` — builds the party · \`${citarInterno("game.follower.ficha", P)} <name>\``,
        `\`${citarInterno("game.dungeon", P)}\` — who's captured · \`${citarInterno("game.descansar", P)}\` — energy`,
        "",
        "**Items**",
        `\`${citarInterno("game.itens", P)}\` — backpack · \`${citarInterno("game.item", P)} <name>\` · \`${citarInterno("game.catalogo", P)} [rarity] [type]\``,
        `\`${citarInterno("game.equipar", P)} <item>\` · \`${citarInterno("game.desequipar", P)} <slot|item>\``,
        "",
        "**The game's market and currencies**",
        `\`${citarInterno("game.carteira", P)}\` · \`${citarInterno("game.comprar", P)} [item]\` · \`${citarInterno("game.vender", P)} <item>\``,
        `\`${citarInterno("game.mercado", P)}\` — player bazaar · \`${citarInterno("game.trocar", P)}\` — bartering`,
        `\`${citarInterno("game.cambio", P)} <qty> <currency> [to <currency>]\` — exchange with the bank`,
        "",
        `_The RPG is one world, the same on every server — the wiki: \`${citarInterno("tutorial", P)} game\`. Not to be confused with \`${citarInterno("xp", P)}\`._`,
      ],
    },

    diagnostico: {
      emoji: "🔧", titulo: "Diagnostics",
      resumo: "when something doesn't work",
      linhas: [
        `\`${citarInterno("debug", P)}\` — **the full diagnostics**: what's broken first, then permissions, hierarchy, channels, voice and AI`,
        `\`${citarInterno("debug", P)} @user\` — what the bot can do with that person (punish, time out, level roles)`,
        `\`${citarInterno("debug", P)} #channel\` — the bot's permission math in that channel (channel permission > role!)`,
        `\`${citar("config", "en", P)}\` — overview of everything that's on`,
        `\`${citarInterno("automod.status", P)}\` · \`${citarInterno("automod.sentinela", P)}\` · \`${citarInterno("automod.punicao", P)}\` — protection state`,
        `\`${citarInterno("reactionrole.list", P)}\` · \`${citarInterno("reactionrole.recarregar", P)}\` — if reaction roles stopped`,
        `\`${citar("ping", "en", P)}\` — is the bot responding?`,
        "",
        "**The three usual suspects**",
        "1. Missing permission on the **channel** (not the role) → `debug #channel`",
        "2. The bot's role sits **below** the role it needs to touch → move it up the list",
        "3. `ManageRole` ≠ `AssignRoles`: one creates roles, the other hands them out → the bot needs both",
      ],
    },

    dono: {
      emoji: "👑", titulo: "Bot owner",
      resumo: "only you can see this page",
      linhas: [
        `\`${citarInterno("servidores", P)}\` — each server: name, members, messages per minute`,
        `\`${citarInterno("game.admin", P)}\` — RPG testing and currency tools (\`${P}help game admin\`)`,
        `\`${citarInterno("automod.debug", P)} on|off\` — verbose automod log (global)`,
        `\`${citarInterno("banglobal.revisar", P)}\` — reviews the global list`,
        "",
        "_The chat AI (\`chat\`, spontaneous comments, image generation, RSS digest) only runs on the servers in `SERVIDOR`; elsewhere only AI moderation stays (\`modia\`, banned topics, images and profile pictures)._" + IA_TAG,
      ],
    },
  };
}
