// ══════════════════════════════════════════════════════════
//  modulos/geral.js — Comandos gerais e de moderação manual:
//  help, ping, repete, userinfo, kick, ban.
//
//  Todas as funções recebem (message, args, ctx). O `ctx` vem
//  do main.js com: client, COR, PREFIXO, sendEmbed, getServer,
//  membroTemPermissao, etc.
// ══════════════════════════════════════════════════════════

// %help — lista todos os comandos
import * as log from "../core/log.js";
import * as db  from "../core/db.js";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Conta as linhas de código do projeto (uma vez, com cache).
let _linhasCache = null;
function contarLinhas() {
  if (_linhasCache !== null) return _linhasCache;
  try {
    const aqui = dirname(fileURLToPath(import.meta.url));      // modulos/moderacao
    const raizModulos = join(aqui, "..");                       // modulos/
    const raizProjeto = join(raizModulos, "..");               // raiz
    let total = 0;
    try { total += readFileSync(join(raizProjeto, "main.js"), "utf8").split("\n").length; } catch {}
    for (const sub of readdirSync(raizModulos, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const pasta = join(raizModulos, sub.name);
      for (const f of readdirSync(pasta)) {
        if (f.endsWith(".js")) {
          try { total += readFileSync(join(pasta, f), "utf8").split("\n").length; } catch {}
        }
      }
    }
    _linhasCache = total || null;
  } catch { _linhasCache = null; }
  return _linhasCache;
}

import * as banGlobal from "./ban-global.js";

// Extrai o usuário-alvo de um comando de moderação.
// Aceita menção (<@ID>) OU o ID cru colado no texto.
// Devolve { id, resto } — `resto` são os args após o alvo (o motivo).
function extrairAlvo(message, args) {
  // 1) menção resolvida pela plataforma
  let id = message.mentionIds?.[0] ?? null;

  // 2) primeiro argumento: <@ID>, <ID> ou ID puro (ULID de 26 chars)
  const bruto = (args[0] ?? "").replace(/[<@#>]/g, "");
  const ehUlid = /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(bruto);
  if (!id && ehUlid) id = bruto;

  // Se o 1º arg era o alvo (menção ou ID), o motivo é o resto
  const primeiroEraAlvo = ehUlid || (args[0] ?? "").includes("@");
  const resto = primeiroEraAlvo ? args.slice(1) : args;
  return { id, motivo: resto.join(" ").trim() };
}

// Referência dos comandos (usada pelo &help e também pela IA como base
// de conhecimento para assistir na configuração).
export function construirDetalhes(P) {
  return {
    cor: {
      uso: `${P}cor <cargo> <cor|gradiente|preset>`,
      desc: "Customiza a cor dos cargos — inclusive com **gradiente**, que o cliente do Stoat não oferece na interface.\n\n**Sólida:** `&cor VIP #FF00AA` ou `&cor VIP roxo`\n**Gradiente:** `&cor VIP gradiente #FF0000 #0000FF` (aceita 2+ cores; um número no início vira o ângulo)\n**Pronto:** `&cor VIP preset vaporwave` — veja todos com `&cor presets`\n**CSS na mão:** `&cor VIP linear-gradient(90deg, #f00 0%, #00f 100%)`\n**Limpar:** `&cor VIP remover` · **Ver:** `&cor lista`\n\nO cargo pode ser pelo nome (mesmo parcial) ou pelo ID. O cargo do bot precisa de **ManageRole** e estar **acima** do cargo editado.",
      perm: "ManageRole",
      ex: `${P}cor VIP gradiente #FF71CE #01CDFE #05FFA1`,
    },
    tutorial: {
      uso: `${P}tutorial [área]`,
      desc: "Guia de primeiros passos: mostra **por onde começar** e qual comando usar em cada área — não altera nada sozinho.\n\n`&tutorial` — o roteiro na ordem recomendada\n`&tutorial <área>` — a página daquela área com os comandos exatos\n\n**Áreas:** `permissoes` (o que o bot precisa), `moderacao`, `logs`, `cargos`, `xp`, `ia`, `noticias`, `mensagens`, `ajustes`.\n\nCada página termina indicando a próxima. Também responde por `&guia` e `&comecar`.",
      perm: null,
      ex: `${P}tutorial moderacao`,
    },
    hello: {
      uso: `${P}hello`,
      desc: "Responde com uma saudação simples. Serve para testar se o bot está online.",
    },
    ping: {
      uso: `${P}ping`,
      desc: "Mostra a latência entre o envio da mensagem e o processamento do bot.",
    },
    repete: {
      uso: `${P}repete <texto>`,
      desc: "O bot repete exatamente o texto informado. Útil para anúncios.",
      ex: `${P}repete Bem-vindos ao servidor!`,
    },
    userinfo: {
      uso: `${P}userinfo [@usuário]`,
      desc: "Mostra ID, data de criação da conta, entrada no servidor e cargos. Sem menção, mostra você.",
      ex: `${P}userinfo @fulano`,
    },
    kick: {
      uso: `${P}kick @usuário [motivo]`,
      desc: "Expulsa o usuário mencionado. Ele pode voltar com um novo convite.",
      perm: "KickMembers", ex: `${P}kick @fulano spam`,
    },
    ban: {
      uso: `${P}ban @usuário [motivo]`,
      desc: "Bane permanentemente o usuário mencionado.",
      perm: "BanMembers", ex: `${P}ban @fulano divulgação`,
    },
    warnings: {
      uso: `${P}warnings [@usuário]`,
      desc: "Mostra quantos avisos (0 a 3) o usuário acumulou no AutoMod. 3 avisos = ban.",
    },
    clearwarnings: {
      uso: `${P}clearwarnings @usuário`,
      desc: "Zera os avisos acumulados de um usuário.",
      perm: "ManagePermissions",
    },
    automod: {
      uso: `${P}automod status | ${P}automod <módulo> <on|off>`,
      desc: "Liga/desliga cada módulo do AutoMod e mostra o estado geral. Módulos: antispam, antimassspam, antiinvite, antimassmention, anticaps, antilink, antiscam.",
      perm: "ManagePermissions", ex: `${P}automod antilink on`,
    },
    whitelist: {
      uso: `${P}whitelist <add|remove|list> [convite]`,
      desc: "Lista de convites do servidor liberados do anti-invite. Aceita o link completo ou só o código.",
      perm: "ManagePermissions", ex: `${P}whitelist add https://stt.gg/abc123`,
    },
    blocklist: {
      uso: `${P}blocklist <add|adddomain|remove|removedomain|list|clear|reload> [url|domínio]`,
      desc: "Gerencia o anti-link. `add <url>` importa listas estilo Pi-hole; `adddomain <domínio>` bloqueia um domínio único.",
      perm: "ManagePermissions", ex: `${P}blocklist adddomain site-ruim.com`,
    },
    scam: {
      uso: `${P}scam <config|sensitivity|channel|test|simulate|ban|dismiss>`,
      desc: "Detecção de conteúdo proibido por PONTUAÇÃO (0–10): golpe, +18, gore, apologia a ilícito e abuso, tudo numa categoria só. A punição é definida no `${P}punicao`. `test <texto>` mostra a nota; `simulate <texto>` dispara o fluxo real no canal de avisos.",
      perm: "ManagePermissions", ex: `${P}scam test ganhe dinheiro fácil chama no pv`,
    },
    banglobal: {
      uso: `${P}banglobal <off|avisar|banir|varrer|historico|importar|esquecer>`,
      desc: "Lista global de banimentos compartilhada entre os servidores onde o bot está.\n\n`off` — ignora · `avisar` — alerta os moderadores · `banir` — bane automaticamente\n\n⚠️ **Importante:** os modos acima só agem quando a pessoa **entra**. Para quem **já está** no servidor, use:\n`&banglobal varrer` — confere todos os membros atuais e age\n`&banglobal varrer ver` — só mostra quem apareceria, sem banir\n\n`&banglobal historico <@usuário|id|nome>` — onde a pessoa foi banida\n`&banglobal importar` — traz os bans já existentes deste servidor\n`&banglobal esquecer <@usuário|id>` — tira alguém da lista",
      perm: "BanMembers",
      ex: `${P}banglobal varrer ver`,
    },
    game: {
      uso: `${P}game [rank|top|setup|cargos|criarcargos|on|off]`,
      desc: "Sistema de níveis por XP de mensagens. Cada mensagem dá XP (com cooldown), e ao juntar XP você sobe de nível. A cada N níveis pode ganhar um cargo. `top` mostra o ranking. `setup` configura dificuldade, nível máximo e intervalo de cargos. (XP por call não é suportado pelo Stoat.)",
      perm: "ManagePermissions (para configurar)", ex: `${P}game top`,
    },
    rss: {
      uso: `${P}rss [add|remove|list|canal|agora]`,
      desc: "Curadoria de notícias por RSS, com resumo da Judy. `add <url>` cadastra um feed, `canal aqui` define o destino, `list` mostra os feeds, `remove <url|n>` remove, `agora` força um ciclo. A cada hora a Judy posta um resumo geral no tom dela e depois os itens novos (título, feed, horário, link).",
      perm: "ManagePermissions", ex: `${P}rss add https://exemplo.com/feed.xml`,
    },
    autorole: {
      uso: `${P}autorole [set <@cargo>|off]`,
      desc: "Dá um cargo automaticamente a todo novo membro que entra no servidor. `set` define o cargo, `off` desativa. Útil para dar um cargo de 'Membro' a todos automaticamente.",
      perm: "ManageRole", ex: `${P}autorole set <@Membro>`,
    },
    sobre: {
      uso: `${P}sobre`,
      desc: "Mostra informações resumidas do bot: recursos, número de comandos e há quanto tempo está no ar.",
      perm: null, ex: `${P}sobre`,
    },
    chat: {
      uso: `${P}chat <mensagem>`,
      desc: "Conversa com a IA local (a Judy). Ela busca na internet, faz contas exatas, lê o próprio código, monta um perfil de quem conversa com ela e adapta o tom a cada pessoa. O modelo é escolhido sozinho conforme o tipo (conversa leve, código, lógica).\n\n**Subcomandos:**\n`&chat status` — se o serviço de IA está no ar\n`&chat perfil [@user]` — o que a Judy sabe sobre alguém\n`&chat mapear [@user]` — captura bio/status do cartão\n`&chat cuidado [@user] on|off` — trata a pessoa com gentileza extra (opt-in)\n`&chat esquecer` — apaga tudo que a Judy sabe de você\n`&chat esquecer tudo` — zera a memória do servidor *(ManageServer)*\n`&chat livre on|off|modo` — a Judy participa sozinha do canal *(ManagePermissions)*\n`&chat comentar aqui|off|pordia <n>` — comentários por iniciativa *(ManagePermissions)*\n\nQuando responde alguém, mantém o papo fluido por um tempo.",
      perm: null, ex: `${P}chat status`,
    },
    modia: {
      uso: `${P}modia <on|off|criterios|canal|status|limpar>`,
      desc: "Moderação por IA na conversa. Você escreve os CRITÉRIOS em texto livre e a Judy avalia cada mensagem; se violar, ela APAGA e te marca no #log com o conteúdo e as opções (avisar/silenciar/banir) já com o comando pronto. Ela nunca bane sozinha — a decisão é sua. O dono do bot é imune.\n\n`&modia criterios <texto>` — define o que moderar\n`&modia on|off` — liga/desliga\n`&modia canal add|remove` — limita a canais (sem isso, vale em todos)\n`&modia limpar` — zera tudo",
      perm: "ManageServer", ex: `${P}modia criterios Apague divulgacao de outros servidores e ataques pessoais`,
    },
    debug: {
      uso: `${P}debug`,
      desc: "Relatório completo dos comandos: quais estão funcionando e quais não, com o motivo (handler quebrado, comando desativado, ou o bot sem a permissão necessária). Mostra também a permissão que o bot precisa e a que o admin precisa para cada comando.",
      perm: "ManagePermissions", ex: `${P}debug`,
    },
    comando: {
      uso: `${P}comando [disable|enable <nome>]`,
      desc: "Ativa ou desativa comandos do bot neste servidor. `&comando` sozinho lista o estado de cada um. Ex.: `&comando disable ban`. Os comandos `help` e `comando` não podem ser desativados.",
      perm: "ManagePermissions", ex: `${P}comando disable repete`,
    },
    cargomudo: {
      uso: `${P}cargomudo [nome]`,
      desc: "Cria um cargo com TODAS as permissões negadas (serve para silenciar) e já o define como cargo de silêncio do servidor. Nega no servidor E em cada canal. `${P}cargomudo canais` reaplica nos canais.",
      perm: "ManagePermissions", ex: `${P}cargomudo Silenciado`,
    },
    embed: {
      uso: `${P}embed` + " → depois `campo: valor`, um por linha",
      desc: "Publica uma mensagem embed customizável.\n\n**Escreva assim** (sem parênteses, sem vírgula no fim):\n```\n&embed\ntitulo: Idade\ndescricao: Você tem +18 ou -18 anos?\ncor: #FF00FF\n```\n**Campos:** `titulo:` `descricao:` `cor:` `rodape:` `imagem:` (URL) `canal:` (ID p/ publicar em outro canal).\nCor por hex (`#5865F2`) ou nome (azul, verde, rosa…).\nTambém aceita tudo numa linha separando com `|`.",
      perm: "ManageMessages", ex: `${P}embed titulo: Idade | descricao: +18 ou -18? | cor: rosa`,
    },
    reactionrole: {
      uso: `${P}reactionrole <add|remove|list>`,
      desc: "Cargos por reação: quem reagir com o emoji ganha o cargo; quem tirar a reação perde.\n\n`&reactionrole add <mensagem> <emoji> <idCargo>`\n`&reactionrole remove <mensagem>` — remove as regras daquela mensagem\n`&reactionrole list` — regras deste servidor\n\n**A mensagem** pode ser o **ID** ou o **link** dela (menu `...` → *Copiar link*) — os dois funcionam.\n**O cargo** é o ID (Configurações → Cargos → *Copy role ID*).\n\nO bot precisa de `React`, `ViewChannel`, `ReadMessageHistory` e **AssignRoles**, e o cargo dele deve estar acima do cargo entregue.",
      perm: "ManageRole",
      ex: `${P}reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
    },
    limpar: {
      uso: `${P}limpar <quantidade> [@usuário]`,
      desc: "Apaga as últimas mensagens do canal (1–100). Com um usuário, apaga só as mensagens dele. Também responde a `clear` e `purge`. A confirmação some sozinha após alguns segundos.",
      perm: "ManageMessages", ex: `${P}limpar 10`,
    },
    config: {
      uso: `${P}config`,
      desc: "Mostra TODAS as configurações atuais do servidor num só lugar: módulos do automod, política de punição, chat de logs, convites permitidos e punições ativas.",
      perm: "ManagePermissions", ex: `${P}config`,
    },
    log: {
      uso: `${P}log [here | <idDoCanal> | off | <evento> <on|off>]`,
      desc: "Chat de logs do servidor. `here` usa o canal atual; `<idDoCanal>` define por ID; `off` desativa. Eventos: `punicoes`, `membros`, `mensagens`, `cargos`, `comandos` — cada um pode ser ligado/desligado.",
      perm: "ManagePermissions", ex: `${P}log here`,
    },
    punicao: {
      uso: `${P}punicao <modo|warns|silencerole>`,
      desc: "Nível de agressividade da punição para TODOS os automods. `modo avisar` (só avisa) | `confirmar` (remove+silencia+espera mod) | `acumular` (avisos até banir) | `banir` (ban imediato). `warns <n>` define quantos avisos até o ban; `silencerole <id>` define o cargo de silêncio.",
      perm: "ManagePermissions", ex: `${P}punicao modo acumular`,
    },
    review: {
      uso: `${P}scam ban <userId> | ${P}scam dismiss <userId>`,
      desc: "No modo confirmação, confirma o banimento ou libera o usuário sinalizado.",
      perm: "BanMembers",
    },
  };
}

export async function cmdHelp(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO } = ctx;
  const P = PREFIXO;

  // Ajuda detalhada por comando: &help <comando>
  const DETALHES = construirDetalhes(P);

  // ── Subtópicos: &help <comando> <subtópico> ──
  const SUBTOPICOS = {
    scam: {
      sensitivity: {
        titulo: "scam sensitivity",
        texto: [
          `**Uso:** \`${P}scam sensitivity <baixa|media|alta>\``,
          "",
          "Define a partir de qual **nota (0–10)** o bot age sobre conteúdo suspeito:",
          "• 🟢 **baixa** (limiar 8) — só o que é quase certo; menos falsos positivos.",
          "• 🟡 **media** (limiar 6) — equilíbrio recomendado.",
          "• 🔴 **alta** (limiar 4) — pega indícios leves; protege mais, erra mais.",
        ].join("\n"),
      },
      test: {
        titulo: "scam test",
        texto: [
          `**Uso:** \`${P}scam test <texto>\``,
          "",
          "Simula a análise de um texto e mostra a nota (0–10) e os sinais detectados, sem punir ninguém. Útil para calibrar a sensibilidade.",
        ].join("\n"),
      },
      channel: {
        titulo: "scam channel",
        texto: [
          `**Uso:** \`${P}scam channel <aqui|id|off>\``,
          "",
          "Define para qual canal vão os alertas de conteúdo suspeito. `off` volta a alertar no próprio canal da mensagem.",
        ].join("\n"),
      },
    },
    automod: {
      set: {
        titulo: "automod set",
        texto: [
          `**Uso:** \`${P}automod <módulo> set <parâmetro> <valor>\``,
          "",
          "Ajusta um parâmetro de um módulo. Parâmetros por módulo:",
          "• `antispam` / `antimassspam`: `mensagens`, `tempo` (ms)",
          "• `antimassmention`: `mencoes`",
          "• `anticaps`: `tamanho`, `limiar` (0–1 ou %)",
          "• `anticaracteres`: `zalgo`",
          "• `antirepeticao`: `repeticao`, `ignorar` (letras da risada, ex.: `k`)",
          "",
          `Ex.: \`${P}automod antispam set mensagens 3\` · \`${P}automod antispam set tempo 10000\``,
        ].join("\n"),
      },
      punicao: {
        titulo: "automod punicao",
        texto: [
          `**Uso:** \`${P}automod <módulo> punicao <modo|herdar>\``,
          "",
          "Dá a um módulo uma punição **própria**, independente da global:",
          "• `avisar` — só avisa\n• `apagar` — só remove a mensagem\n• `confirmar` — silencia e espera um mod\n• `acumular` — soma avisos até banir\n• `banir` — ban imediato\n• `herdar` — volta a usar a punição global",
          "",
          `Ex.: \`${P}automod antilink punicao apagar\``,
        ].join("\n"),
      },
      antirepeticao: {
        titulo: "automod antirepeticao",
        texto: [
          "**Anti-repetição** — bloqueia a mesma letra repetida muitas vezes numa mensagem (ex.: `aaaaaaaaaa`).",
          "",
          "Vem **desligado** por padrão, porque em servidores BR o `kkkkk` (risada) é legítimo — e por isso o `k` é ignorado por padrão.",
          "",
          `\`${P}automod antirepeticao on\` — ativa`,
          `\`${P}automod antirepeticao set repeticao 15\` — limite de repetições`,
          `\`${P}automod antirepeticao set ignorar k\` — letras a ignorar (risada)`,
          `\`${P}automod antirepeticao punicao apagar\` — punição própria`,
        ].join("\n"),
      },
    },
    punicao: {
      modo: {
        titulo: "punicao modo",
        texto: [
          `**Uso:** \`${P}punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
          "",
          "Define a punição **global** (vale para todos os módulos que não têm punição própria):",
          "• `avisar` — só avisa, não remove\n• `apagar` — só remove a mensagem\n• `confirmar` — remove, silencia (se houver cargo) e espera um mod aprovar\n• `acumular` — soma avisos e bane ao atingir o limite\n• `banir` — ban imediato",
        ].join("\n"),
      },
    },
  };

  const alvo = args[0]?.toLowerCase();
  const subtopico = args[1]?.toLowerCase();

  // &help <comando> <subtópico>
  if (alvo && subtopico && SUBTOPICOS[alvo]?.[subtopico]) {
    const st = SUBTOPICOS[alvo][subtopico];
    return sendEmbed(message.channel, { title: `📖 Ajuda — ${P}${st.titulo}`,
      description: st.texto, colour: COR.info });
  }

  // ── Categorias: &help <categoria> ──
  const CATEGORIAS = {
    geral: {
      titulo: "Comandos gerais",
      linhas: [
        `\`${P}tutorial\` — ⭐ por onde começar (guia de configuração)`,
        `\`${P}ping\` — latência do bot`,
        `\`${P}repete <texto>\` — repete o texto`,
        `\`${P}chat <mensagem>\` — conversa com a IA (ou mencione o bot)`,
        `\`${P}userinfo [@usuário]\` — info de um usuário`,
        `\`${P}sobre\` — informações do bot`,
      ],
    },
    moderacao: {
      titulo: "Moderação",
      linhas: [
        `\`${P}kick @usuário [motivo]\` — expulsa *(KickMembers)*`,
        `\`${P}ban @usuário [motivo]\` — bane *(BanMembers)*`,
        `\`${P}limpar <n> [@usuário]\` — apaga mensagens *(ManageMessages)*`,
        `\`${P}warnings [@usuário]\` — ver avisos`,
        `\`${P}clearwarnings @usuário\` — limpa avisos *(ManagePermissions)*`,
        `\`${P}banglobal <off|avisar|banir|...>\` — lista global *(BanMembers)*`,
        `\`${P}modia <on|off|criterios|...>\` — moderação por IA na conversa *(ManageServer)*`,
      ],
    },
    automod: {
      titulo: "AutoMod *(ManagePermissions)*",
      linhas: [
        `\`${P}automod status\` — estado de cada módulo`,
        `\`${P}automod <módulo> <on|off>\` — ativa/desativa`,
        `\`${P}automod <módulo> set <param> <valor>\` — ajusta parâmetros`,
        `\`${P}automod <módulo> punicao <modo>\` — punição por módulo`,
        `\`${P}punicao <modo|warns|silencerole>\` — punição global`,
        `\`${P}scam <config|sensitivity|test|...>\` — conteúdo proibido (0–10)`,
        `\`${P}whitelist <add|remove|list>\` — convites permitidos`,
        `\`${P}blocklist <add|remove|list|clear|reload>\` — listas anti-link`,
      ],
    },
    config: {
      titulo: "Configuração e administração *(ManagePermissions)*",
      linhas: [
        `\`${P}config\` — mostra todas as configurações`,
        `\`${P}log <here|id|off|<evento> <on|off>>\` — chat de logs`,
        `\`${P}comando <disable|enable> <nome>\` — ativa/desativa comandos`,
        `\`${P}cargomudo [nome]\` — cria cargo de silêncio`,
        `\`${P}cor <cargo> <cor|gradiente>\` — cor dos cargos, com gradiente *(ManageRole)*`,
        `\`${P}debug\` — diagnóstico de todos os comandos`,
      ],
    },
    ferramentas: {
      titulo: "Ferramentas",
      linhas: [
        `\`${P}embed\` — publica um embed customizável *(ManageMessages)*`,
        `\`${P}reactionrole <add|remove|list>\` — cargos por reação *(ManageRole)*`,
        `\`${P}autorole <set|off>\` — cargo automático a quem entra *(ManageRole)*`,
        `\`${P}rss <add|remove|list|canal|agora>\` — notícias com resumo da Judy`,
        `\`${P}chat <mensagem>\` — conversa com a Judy (ou mencione o bot)`,
        `\`${P}chat livre on|off\` — a Judy participa sozinha do canal`,
        `\`${P}chat comentar aqui|off\` — a Judy comenta por iniciativa`,
        `\`${P}chat perfil [@user]\` — o que a Judy sabe de alguém`,
        `\`${P}chat cuidado [@user] on\` — tratamento gentil (opt-in)`,
        `\`${P}chat esquecer [tudo]\` — apaga sua memória (ou a do servidor)`,
      ],
    },
    game: {
      titulo: "Sistema de níveis (XP)",
      linhas: [
        `\`${P}game\` — seu nível, XP e progresso`,
        `\`${P}game rank [@usuário]\` — perfil de outra pessoa`,
        `\`${P}game top\` — ranking do servidor`,
        `\`${P}game setup\` — configurar *(ManagePermissions)*`,
        `\`${P}game cargos\` — lista os cargos de nível`,
        `\`${P}game criarcargos\` — cria os cargos automaticamente`,
        `\`${P}game on | off\` — liga/desliga o sistema`,
        "",
        "_XP é ganho por mensagens (o Stoat não permite medir call)._",
      ],
    },
  };

  // aliases de categoria
  const ALIAS_CAT = { "moderação": "moderacao", mod: "moderacao", "configuração": "config",
    configuracao: "config", tools: "ferramentas", ferramenta: "ferramentas",
    nivel: "game", niveis: "game", level: "game", xp: "game" };
  const cat = CATEGORIAS[alvo] ? alvo : ALIAS_CAT[alvo];

  if (alvo && CATEGORIAS[cat]) {
    const c = CATEGORIAS[cat];
    return sendEmbed(message.channel, { title: `📋 ${c.titulo}`,
      colour: COR.info,
      description: c.linhas.join("\n") + `\n\n💡 \`${P}help <comando>\` para detalhes.`,
    });
  }

  // &help <comando> (detalhe individual)
  if (alvo && DETALHES[alvo]) {
    const d = DETALHES[alvo];
    const temSub = SUBTOPICOS[alvo] ? `\n\n**Subtópicos:** ${Object.keys(SUBTOPICOS[alvo]).map((k) => `\`${P}help ${alvo} ${k}\``).join(" · ")}` : "";
    return sendEmbed(message.channel, {
      title: `📖 Ajuda — ${P}${alvo}`,
      colour: COR.info,
      description: [
        `**Uso:** \`${d.uso}\``,
        d.perm ? `**Permissão:** ${d.perm}` : null,
        "",
        d.desc,
        d.ex ? `\n**Exemplo:** \`${d.ex}\`` : null,
        temSub,
      ].filter(Boolean).join("\n"),
    });
  }
  if (alvo) {
    return sendEmbed(message.channel, {
      title: "❓ Não encontrado",
      description: `Não há ajuda para \`${alvo}\`. Use \`${P}help\` para o índice, ou \`${P}help <categoria>\` (geral, moderacao, automod, config, ferramentas).`,
      colour: COR.aviso,
    });
  }

  // ── Índice principal (&help sem argumentos) ──
  await sendEmbed(message.channel, {
    title: "📋 Central de Ajuda",
    colour: COR.info,
    description: [
      "Escolha uma categoria para ver os comandos:",
      "",
      `📌 \`${P}help geral\` — comandos do dia a dia`,
      `🛡 \`${P}help moderacao\` — kick, ban, limpar, avisos`,
      `⚙️ \`${P}help automod\` — proteção automática e punições`,
      `🔧 \`${P}help config\` — configuração e administração`,
      `🧰 \`${P}help ferramentas\` — embed, reaction roles, RSS, IA`,
      `🎮 \`${P}help game\` — sistema de níveis por XP`,
      "",
      `💡 Detalhes de um comando: \`${P}help <comando>\` (ex.: \`${P}help scam\`)`,
      `💡 Alguns têm subtópicos: \`${P}help scam sensitivity\``,
    ].join("\n"),
  });
}

// %ping — mede a latência entre o envio da mensagem e o processamento
export async function cmdPing(message, args, ctx) {
  const { sendEmbed, COR } = ctx;
  let latencia = null;
  try {
    const enviado = new Date(message.createdAt).getTime();
    if (!Number.isNaN(enviado)) latencia = Date.now() - enviado;
  } catch {}

  await sendEmbed(message.channel, {
    title: "🏓 Pong!",
    description: latencia != null
      ? `Latência da mensagem: **${latencia}ms**`
      : "Bot online e respondendo.",
    colour: COR.sucesso,
  });
}

// %sobre — informações resumidas do bot
export async function cmdSobre(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, estado } = ctx;

  // conta comandos, linhas e uptime de forma resiliente
  const nComandos = estado?.rotas ? new Set(Object.values(estado.rotas)).size : null;
  const nLinhas = contarLinhas();
  const up = process.uptime();
  const dias = Math.floor(up / 86400);
  const horas = Math.floor((up % 86400) / 3600);
  const mins = Math.floor((up % 3600) / 60);
  const uptime = dias > 0 ? `${dias}d ${horas}h` : horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;

  await sendEmbed(message.channel, {
    title: "🤖 Cobaia",
    description: [
      "Bot de moderação, automod, IA e níveis para o Stoat.",
      "",
      `**Recursos:** moderação · automod · anti-scam · chat com IA · curadoria RSS · sistema de níveis`,
      nComandos ? `**Comandos:** ${nComandos}` : null,
      nLinhas ? `**Linhas de código:** ${nLinhas.toLocaleString("pt-BR")}` : null,
      `**No ar há:** ${uptime}`,
      "",
      `Use \`${PREFIXO}help\` para ver tudo.`,
      "",
      "_Feito por <@01K9JKP85D5EP2ZTEHS8DT797A> (Ghiso#4419) com [stoat.js](https://github.com/stoatchat/javascript-client-sdk) — quer um bot assim no seu servidor? Chama! 🚀_",
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  });
}

// %repete <texto> — repete o texto fornecido
export async function cmdRepete(message, args, ctx) {
  const { sendEmbed, COR } = ctx;
  const txt = args.join(" ");
  if (!txt) return;
  await sendEmbed(message.channel, { description: txt, colour: COR.info });
}

// %userinfo [@usuário] — exibe informações de um usuário
export async function cmdUserinfo(message, args, ctx) {
  const { sendEmbed, COR, getServer, serverId, PREFIXO } = ctx;
  const targetId = message.mentionIds?.[0] ?? message.authorId;

  try {
    const server = await getServer(message);
    const member = (targetId === message.authorId && message.member)
      ? message.member
      : await server.fetchMember(targetId);
    const user = member.user ?? member;

    const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString("pt-BR") : "Desconhecido";
    const joinedAt  = member.joinedAt ? new Date(member.joinedAt).toLocaleDateString("pt-BR") : "Desconhecido";
    const roles     = member.roles?.map((r) => r.name ?? r).join(", ") || "Nenhum";

    const linhas = [
      `**ID:** ${user.id ?? targetId}`,
      `**Conta criada em:** ${createdAt}`,
      `**Entrou no servidor:** ${joinedAt}`,
      `**Cargos:** ${roles}`,
    ];

    // ── Histórico de moderação ──────────────────────────────
    // Avisos e silêncio NESTE servidor + presença na lista global.
    try {
      const avisos     = db.contarAvisos(serverId, targetId);
      const silenciado = db.estaSilenciado(serverId, targetId);
      const hist       = db.historicoBans(targetId);
      const outros     = hist.filter((b) => b.serverId !== serverId);

      linhas.push("", "**📋 Histórico de moderação**");

      if (avisos > 0 || silenciado) {
        const partes = [];
        if (avisos > 0)  partes.push(`**${avisos}** aviso(s) neste servidor`);
        if (silenciado)  partes.push("🔇 **silenciado**");
        linhas.push(partes.join(" · "));
      } else {
        linhas.push("Sem avisos neste servidor. ✅");
      }

      if (outros.length) {
        linhas.push(
          "",
          `🌐 **Lista global:** banido em **${outros.length}** outro(s) servidor(es).`,
          ...outros.slice(0, 3).map((b) =>
            `• \`${b.serverId}\` — ${b.motivo ?? "_sem motivo_"} _(${new Date(b.criadoEm).toLocaleDateString("pt-BR")})_`),
        );
        if (outros.length > 3) linhas.push(`_… e mais ${outros.length - 3}. Veja \`${PREFIXO}banglobal historico ${targetId}\`._`);
      } else {
        linhas.push("", "🌐 **Lista global:** não consta. ✅");
      }
    } catch (e) {
      console.error("[USERINFO][HIST]", e?.message);
    }

    await sendEmbed(message.channel, {
      title: `👤 ${user.username ?? user.name ?? "Usuário"}`,
      colour: COR.info,
      description: linhas.join("\n"),
    });
  } catch (err) {
    console.error("[USERINFO]", err.message);
    await sendEmbed(message.channel, { title: "❌ Erro",
      description: "Não foi possível buscar as informações.", colour: COR.erro });
  }
}

// %kick @usuário [motivo]   (KickMembers)
export async function cmdKick(message, args, ctx) {
  const { client, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "KickMembers"))
    return negarPermissao(ctx, message.channel, "KickMembers");

  const { id: targetId, motivo } = extrairAlvo(message, args);
  const reason = motivo || "Sem motivo especificado";
  if (!targetId)
    return sendEmbed(message.channel, { title: "❌ Uso incorreto",
      description: `\`${PREFIXO}kick @usuário [motivo]\`\nVocê pode usar a menção ou o ID do usuário.`, colour: COR.erro });
  if (targetId === client.user.id)
    return sendEmbed(message.channel, { description: "❌ Não posso me expulsar!", colour: COR.erro });

  try {
    await server.kickUser(targetId);
    await log.registrar(ctx, "punicoes", { titulo: "👢 Usuário expulso (manual)",
      descricao: `<@${targetId}> foi expulso por <@${message.authorId}>.\n**Motivo:** ${reason}` });
    await sendEmbed(message.channel, {
      title: "✅ Ação executada: EXPULSÃO",
      description: [
        `**Usuário:** <@${targetId}> \`${targetId}\``,
        `**Ação:** expulso do servidor (pode voltar com novo convite)`,
        `**Motivo:** ${motivo ? reason : "_(nenhum informado)_"}`,
        `**Por:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso });
    console.log(`[KICK] ${message.authorId} -> ${targetId} | ${reason}`);
  } catch (err) {
    console.error("[KICK]", err.message);
    await sendEmbed(message.channel, { title: "❌ Não foi possível expulsar",
      description: `**Usuário:** \`${targetId}\`\n**Erro:** ${err.message}\n\n_Verifique se o bot tem a permissão **KickMembers** e se o cargo dele está acima do alvo._`,
      colour: COR.erro });
  }
}

// %ban @usuário [motivo]   (BanMembers)
export async function cmdBan(message, args, ctx) {
  const { client, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "BanMembers"))
    return negarPermissao(ctx, message.channel, "BanMembers");

  const { id: targetId, motivo } = extrairAlvo(message, args);
  const reason = motivo || "Sem motivo especificado";
  if (!targetId)
    return sendEmbed(message.channel, { title: "❌ Uso incorreto",
      description: `\`${PREFIXO}ban @usuário [motivo]\`\nVocê pode usar a menção ou o ID do usuário.`, colour: COR.erro });
  if (targetId === client.user.id)
    return sendEmbed(message.channel, { description: "❌ Não posso me banir!", colour: COR.erro });

  try {
    await server.banUser(targetId, { reason });
    banGlobal.registrar(ctx, targetId, reason, "manual");   // alimenta a lista global
    await log.registrar(ctx, "punicoes", { titulo: "🔨 Usuário banido (manual)",
      descricao: `<@${targetId}> foi banido por <@${message.authorId}>.\n**Motivo:** ${reason}` });
    await sendEmbed(message.channel, {
      title: "🔨 Ação executada: BANIMENTO",
      description: [
        `**Usuário:** <@${targetId}> \`${targetId}\``,
        `**Ação:** banido permanentemente (não pode voltar)`,
        `**Motivo:** ${motivo ? reason : "_(nenhum informado)_"}`,
        `**Por:** <@${message.authorId}>`,
        `**Lista global:** registrado 🌐`,
      ].join("\n"),
      colour: COR.erro });
    console.log(`[BAN] ${message.authorId} -> ${targetId} | ${reason}`);
  } catch (err) {
    console.error("[BAN]", err.message);
    await sendEmbed(message.channel, { title: "❌ Não foi possível banir",
      description: `**Usuário:** \`${targetId}\`\n**Erro:** ${err.message}\n\n_Verifique se o bot tem a permissão **BanMembers** e se o cargo dele está acima do alvo._`,
      colour: COR.erro });
  }
}

// ── Helper interno de negação de permissão ─────────────────
function negarPermissao(ctx, channel, permName) {
  return ctx.sendEmbed(channel, {
    title: "🚫 Permissão insuficiente",
    description: `Você precisa da permissão **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  });
}
