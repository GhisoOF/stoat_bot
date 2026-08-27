import { servidorPermitido as temIA } from "../ai/chat.js";
import { arvoreSubtopicos, SUBTOPICOS_SO_IA } from "./help-arvore.js";
import { nomeExibido, exibirTitulo } from "../core/aliases.js";
import { grupos as gruposHelp, ALIAS_GRUPO, ORDEM as ORDEM_GRUPOS } from "./help-grupos.js";
import { secaoParametros } from "./help-parametros.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";
import { escadaDePunicao, rotuloDegrau } from "./automod-engine.js";
import * as PERFIS_MOEDA from "../game/moedas-perfis.js";

// Comandos que só existem onde a IA roda (espelha a lista do main.js).
const COMANDOS_SO_IA = new Set(["chat", "modia"]);

// Só o suficiente para o cabeçalho do subtópico achar o canônico do comando.
const CANONICO_LOCAL = { rpg: "game", nivel: "xp", level: "xp", logs: "log" };
// ══════════════════════════════════════════════════════════
//  modulos/geral.js — Comandos gerais e de moderação manual:
//  help, ping, repete, userinfo, kick, ban.
//
//  BILÍNGUE: cada texto tem versão PT e EN, escolhida por
//  ctx.config.language (helper tr() do core/i18n.js).
//
//  Todas as funções recebem (message, args, ctx). O `ctx` vem
//  do main.js com: client, COR, PREFIXO, sendEmbed, getServer,
//  membroTemPermissao, etc.
// ══════════════════════════════════════════════════════════

import * as log from "../core/log.js";
import * as db  from "../core/db.js";
import { tr, lingua } from "../core/i18n.js";
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

// ══════════════════════════════════════════════════════════
//  Referência dos comandos (usada pelo &help e também pela IA
//  como base de conhecimento). `lang` escolhe o dicionário;
//  omitido → pt (compatível com quem já chamava com 1 arg).
// ══════════════════════════════════════════════════════════
export function construirDetalhes(P, lang = "pt") {
  if (lang === "en") return detalhesEN(P);
  return detalhesPT(P);
}

function detalhesPT(P) {
  return {
    cor: {
      uso: `${P}cor <cargo> <cor|gradiente|preset>`,
      desc: "Customiza a cor dos cargos — inclusive com **gradiente**, que o cliente do Stoat não oferece na interface.\n\n**Sólida:** `&cor VIP #FF00AA` ou `&cor VIP roxo`\n**Gradiente:** `&cor VIP gradiente #FF0000 #0000FF` (aceita 2+ cores; um número no início vira o ângulo)\n**Pronto:** `&cor VIP preset vaporwave` — veja todos com `&cor presets`\n**Automático:** `&cor painel aqui` — cria os cargos, publica a mensagem de escolha (mencionando os cargos), reage com os emojis, liga os cargos por reação e ativa o modo exclusivo. Tudo num comando.\n**Só os cargos:** `&cor criar` — cria/pinta sem publicar nada\n**CSS na mão:** `&cor VIP linear-gradient(90deg, #f00 0%, #00f 100%)`\n**Limpar:** `&cor VIP remover` · **Ver:** `&cor lista`\n\nO cargo pode ser pelo nome (mesmo parcial) ou pelo ID. O cargo do bot precisa de **ManageRole** e estar **acima** do cargo editado.",
      perm: "ManageRole",
      ex: `${P}cor VIP gradiente #FF71CE #01CDFE #05FFA1`,
    },
    tutorial: {
      uso: `${P}tutorial [página|área]`,
      desc: "Guia de primeiros passos **em páginas** — reaja ◀ ▶ para virar. Não altera nada sozinho: mostra o caminho e o comando exato de cada passo.\n\n`&tutorial` — o guia (6 páginas): permissões → canais → proteção → boas-vindas e cargos → XP e RPG → checklist\n`&tutorial 2` — abre direto a página 2\n`&tutorial <área>` — aprofunda um assunto (ex.: `&tutorial canais`, `&tutorial game`)\n\nPrefere que o bot pergunte e configure por você? `&assistente`.\n\nTambém responde por `&guia` e `&comecar`.",
      perm: null,
      ex: `${P}tutorial canais`,
    },
    assistente: {
      uso: `${P}assistente [rapido|completo|canais|protecao|cancelar]`,
      desc: "Configuração **guiada**: o bot faz uma pergunta de cada vez, você responde em texto normal, e no fim ele mostra o resumo e aplica tudo — usando os mesmos comandos que você usaria na mão (e mostra quais foram, para você aprender).\n\n`&assistente` — menu\n`&assistente rapido` — idioma, staff, log, proteção, boas-vindas (~2 min)\n`&assistente completo` — o rápido + escada de punição, lista global, XP, cargo automático\n`&assistente canais` — classifica seus canais nos 3 tipos e diz o que clicar no Stoat\n`&assistente protecao` — só automod, sentinela e punição\n\nDurante as perguntas: `pular` pula, `voltar` volta, `cancelar` desiste. Cada pessoa tem o seu; ele expira em 10 min sem resposta.",
      perm: "ManagePermissions",
      ex: `${P}assistente rapido`,
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
    warn: {
      uso: `${P}warn <@pessoa|id|nome> [motivo]`,
      desc: "Dá um aviso manual a alguém. Usa o **mesmo contador** do automod, então no modo `acumular` o aviso manual conta para o ban automático — e o bot avisa quantos faltam.\n\nVer os avisos: `&warnings @pessoa` · Zerar: `&clearwarnings @pessoa`",
      perm: "KickMembers",
      ex: `${P}warn @Fulano flood no chat de arte`,
    },
    servidores: {
      uso: `${P}servidores`,
      desc: "Panorama de onde o bot está: nome de cada servidor, quantidade de membros e ritmo de mensagens por minuto.\n\n`&servidores cru` mostra como a API entrega os dados (diagnóstico).\n\n_Restrito ao dono do bot._",
      perm: null,
      ex: `${P}servidores`,
    },
    acesso: {
      uso: `${P}acesso <cargo|canal|staffignora|status>`,
      desc: "Define **quem** pode usar os comandos e **onde**.\n\n**Cargos de staff** — quem tiver um deles usa os comandos de moderação mesmo sem a permissão nativa do Stoat:\n`&acesso cargo add <@cargo>` · `&acesso cargo remove <@cargo>` · `&acesso cargo limpar`\n\n**Canais** — onde os comandos funcionam:\n`&acesso canal todos` — em qualquer canal\n`&acesso canal somente` — só nos da lista\n`&acesso canal exceto` — em todos, menos os da lista\n`&acesso canal add|remove [#canal]` — mexe na lista\n\n`&acesso staffignora on|off` — se o staff escapa da restrição de canal (padrão: sim)\n\n_`&acesso`, `&debug`, `&help` e `&tutorial` funcionam sempre, para você não se trancar fora._",
      perm: "ManagePermissions",
      ex: `${P}acesso canal somente`,
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
      desc: "Liga/desliga cada módulo do AutoMod e mostra o estado geral. Filtros: antispam, antimassspam, antiinvite, antimassmention, anticaps, antilink, anticaracteres, antirepeticao e o `sentinela` (o antigo antiscam, que agora julga conteúdo em geral).",
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
    sentinela: {
      uso: `${P}sentinela <config|sensitivity|antiguidade|alerta|channel|test|simulate|ban|dismiss>`,
      desc: `O único módulo que **julga** em vez de medir: dá ao conteúdo uma nota de suspeita (0–10) cobrindo golpe, +18, gore, apologia a ilícito e abuso numa categoria só.\n\nComo julga, ele se adapta a quem escreve:\n**\`antiguidade on\`** — o limiar acompanha o nível de XP do membro. Conta recém-chegada é olhada de perto; quem conversa aqui há semanas ganha margem. Uma frase que soa a golpe vinda de alguém que acabou de entrar é bem mais provável de ser golpe.\n**\`alerta on\`** — marca a staff quando alguém levanta suspeita **repetidas vezes** em pouco tempo, mesmo sem chegar ao limiar de punição. Sinal isolado é ruído; padrão merece olho humano.\n\n\`${P}sentinela test <texto>\` mostra a nota que aquele texto tiraria; \`${P}sentinela simulate <texto>\` dispara o fluxo real no canal de avisos.\n\n_O que **acontece** com quem passa do limiar é decidido no \`${P}punicao\` — ele vale para todos os automods de uma vez, e não tem \`test\` próprio._\n\n_Chamava-se \`${P}scam\`, e esse nome continua funcionando._`,
      perm: "ManagePermissions", ex: `${P}sentinela test ganhe dinheiro fácil chama no pv`,
    },
    banglobal: {
      uso: `${P}banglobal <off|avisar|banir|lista|revisar|varrer|isentar|desfazer|historico|esquecer>`,
      desc: "Lista global de banimentos compartilhada entre os servidores onde o bot está.\n\n`off` — ignora · `avisar` — alerta os moderadores · `banir` — bane automaticamente **ao entrar**\n\n**Ver quem está na lista**\n`&banglobal lista` — todo mundo, em páginas · `&banglobal lista servidor` — só os deste servidor\n`&banglobal historico <@pessoa>` — onde e por que aquela pessoa foi banida\n\n**Quem já está no servidor**\n`&banglobal revisar` — confere e **só mostra**. Nunca bane.\n`&banglobal varrer` — mostra e **espera confirmação** · `&banglobal varrer confirmar` — ⚠️ bane\n\n**Quando a lista erra**\n`&banglobal isentar <@pessoa>` — aceita a pessoa **aqui** apesar da lista (e desfaz o ban dela, se foi o bot que aplicou)\n`&banglobal isentos` — quem está isento · `&banglobal desfazer` — ↩️ reverte os bans que a lista aplicou aqui\n`&banglobal esquecer <@pessoa>` — apaga o registro **para todos os servidores**\n\n**A contribuição é automática e permanente.** Os bans deste servidor — os antigos e os novos — alimentam a lista sozinhos, sem comando e sem chave para desligar. O modo acima decide só se este servidor **se aproveita** da lista: dá para não usar, não dá para usar sem alimentar.",
      perm: "BanMembers",
      ex: `${P}banglobal revisar`,
    },
    game: {
      uso: `${P}game [criar|ficha|pontos|top|apagar]`,
      desc: "RPG do servidor: crie um personagem, suba de nível e distribua pontos em 9 atributos.\n\n`&game criar [nome]` — cria seu personagem\n`&game` — sua ficha\n`&game ficha @pessoa` — a ficha de outro\n`&game pontos <atributo> [quantos]` — distribui pontos (aceita abreviação: for, int, sor…)\n\n_A cada 2 níveis todos os atributos sobem 1 sozinhos; os pontos livres é que fazem a build._\n`&game carteira` — saldo e estado da economia\n`&game comprar [item] [com <moeda>]` · `&game vender <item>` — mercado\n`&game contratar [nome]` — mercenários\n`&game descansar` — restaura energia pagando\n`&game mercado` — bazar entre jogadores (vender, comprar, cancelar)\n`&game cambio <qtd> <moeda>` — quanto isso vale em todas as moedas\n`&game cambio <qtd> <moeda> para <moeda>` — troca com o banco, na hora\n`&game cambio <qtd> <moeda> por <qtd> <moeda>` — oferta a outro jogador\n`&game cambio taxas` — as taxas do banco\n`&game trocar @pessoa <item> por <item>` — escambo\n\n_Para **configurar** o RPG no servidor: `&tutorial game`._\n_Dono do bot: `&game admin` tem as ferramentas de teste._\n`&game followers` — seus companheiros\n`&game follower ficha <nome>` — atributos, magia e mochila dele\n`&game follower dar <nome> <item>` — entrega um item (nomes com espaço ok; `|` separa se preciso)\n`&game follower levar <nome>` — coloca na party (até 2)\n`&game recrutas` — quem existe no jogo\n`&game dungeon` — quem está capturado (o resgate é automático nas missões)\n`&game missao` — missões disponíveis (com sua chance em cada uma)\n`&game missao <nome>` — parte para a missão\n`&game itens` — sua mochila\n`&game item <nome>` — ficha de um item, com preço em cada moeda\n`&game equipar <item>` / `&game desequipar <slot|item>`\n`&game magias` — o grimório · `&game aprender <nome>` — aprende uma magia\n`&game catalogo` — resumo dos itens · `&game catalogo <raridade|slot>` — a lista completa daquele grupo\n`&game top` — ranking do servidor\n`&game apagar confirmar` — recomeça do zero\n\n**Atributos:** Força, Destreza, Resistência, Agilidade, Vida, Mana, Inteligência, Sorte, Carisma.\n\n_Inteligência e Sorte aumentam o XP ganho e os pontos por nível, com retorno decrescente — nunca param de valer._\n\n⚠️ Não confundir com `&xp`, que é o sistema de níveis por mensagem.",
      perm: null,
      ex: `${P}game criar Kael`,
    },
    xp: {
      uso: `${P}xp [rank|top|setup|cargos|criarcargos|sincronizar|on|off]`,
      desc: "Sistema de níveis por XP de mensagens. Cada mensagem dá XP (com cooldown), e ao juntar XP você sobe de nível. A cada N níveis pode ganhar um cargo, e os anteriores continuam — eles se acumulam.\n\n`top` mostra o ranking · `setup` configura dificuldade, nível máximo e intervalo de cargos.\n\n**Quem sai perde os cargos, não o XP.** Cargo é do membro: quem sai deixa de ser membro e o Stoat os retira. O XP fica guardado. Quem **entra** recebe os cargos de volta sozinho; para quem já tinha voltado antes disso, `&xp sincronizar [@pessoa]` devolve tudo que o nível atual garante _(veja `&help xp sincronizar`)_.\n\n(XP por call não é suportado pelo Stoat.)",
      perm: "ManagePermissions (para configurar)", ex: `${P}xp top`,
    },
    rss: {
      uso: `${P}rss [add|remove|list|canal|agora]`,
      desc: "Curadoria de notícias por RSS, com resumo da Judy. `add <url>` cadastra um feed, `canal aqui` define o destino, `list` mostra os feeds, `remove <url|n>` remove, `agora` força um ciclo. A cada hora a Judy posta um resumo geral no tom dela e depois os itens novos (título, feed, horário, link).",
      perm: "ManagePermissions", ex: `${P}rss add https://exemplo.com/feed.xml`,
    },
    staff: {
      uso: `${P}staff [add|remove|titulo|limpar]`,
      desc: "Mostra a **equipe do servidor**, agrupada por cargo e com quem tem cada um.\n\nA lista não tem cadastro próprio: ela lê os mesmos cargos do `&acesso cargo`. Então adicionar aqui **também dá acesso aos comandos de moderação** — e remover tira os dois de uma vez, sem o quadro de avisos discordar da permissão real.\n\n`&staff add <@cargo>` · `&staff remove <@cargo>` · `&staff limpar`\n`&staff titulo <@cargo> <texto>` — rótulo exibido no lugar do nome do cargo\n\n_Consultar é público; mexer exige ManagePermissions._",
      perm: "ManagePermissions", ex: `${P}staff add Moderador`,
    },
    tts: {
      uso: `${P}tts <texto> | [entrar|sair|estado|filtro|dicionario|voz|efeito|tom|nomes|cooldown|reiniciar]`,
      desc: "A Judy **fala nas calls**. Alguém escreve, ela lê em voz alta.\n\n**Na prática são dois comandos:**\n`&tts entrar` — dentro da call. Ela entra e passa a falar **tudo que for escrito ali** (estando em outra call, ela vem para a sua)\n`&tts sair` — sai e para de ler\n\nO `entrar` liga o sistema, escolhe a call e liga a leitura sozinho — antes isso eram quatro comandos na ordem certa.\n\n`&tts <texto>` — falar uma frase específica · `&tts estado` — está tudo de pé?\n_Estes valem para **todo mundo**, não só para a equipe._\n\n**Ajustes** _(ver é livre; mudar é ManageMessages)_\n`&tts nomes off` — para de anunciar \"Fulano disse:\"\n`&tts cooldown <s>` — freio entre falas da mesma pessoa (0 desliga)\n`&tts filtro` — a **peneira**: ignora repetição, parede de texto e barulho, e limita as falas por minuto no canal _(`&help tts filtro`)_\n\n**Quando algo trava**\n`&tts reiniciar` — destrava o serviço de voz sem ir ao terminal _(ManageMessages)_. Depois de `&tts sair`, a transmissão **não** traz a Judy de volta: só `&tts entrar`. _(`&help tts problemas`)_\n\n**Dicionário** — a escrita de chat vira fala compreensível\n`vc n vai vir hj pq?` sai como `você não vai vir hoje porque?`\n`&tts dicionario` — vê o que está valendo\n`&tts dicionario add <abrev> <texto>` — entrada própria do servidor\n`&tts dicionario padrao off` — desliga as 114 abreviações embutidas\n\n**Voz e timbre**\n`&tts voz [nome]` — troca a voz do Piper (faber masculina, dii feminina)\n`&tts efeito [nome]` — `feminina`, `sedutora`, `suave`, `glados`, `robo`, `radio`…\n`&tts tom <n>` — altura da voz, **separada** do efeito (1.0 = original)\n_Sobe tom **e formantes** juntos: voz masculina vira feminina de verdade. Se a voz base já é feminina, mexa pouco — acima de 1.05 soa infantil._\n_Os efeitos mudam só o **caráter** e não tocam no tom, então soam igual sobre qualquer voz._\n_Não existe voz GLaDOS em português; o efeito recria o **processamento** dela sobre a voz que você já usa._\n\n_Dentro dos canais de voz configurados, o `&tts` funciona para **todos**, mesmo com restrição de canal ligada._\n_A síntese é **offline**, no computador do dono (Piper)._",
      perm: "ManageMessages (só para configurar)", ex: `${P}tts entrar`,
    },
    fuso: {
      uso: `${P}fuso [ver|buscar|add|remove|apelido|principal|formato|limpar]`,
      desc: "Relógio do servidor com **várias cidades ao mesmo tempo** — útil quando a galera está espalhada (São Paulo, Madrid, Tóquio…).\n\n`&fuso` mostra a hora agora em cada cidade configurada, ordenada do fuso mais atrasado ao mais adiantado, com a diferença em relação à cidade de referência.\n\n`&fuso ver <cidade>` — hora de qualquer cidade, sem configurar\n`&fuso buscar <termo>` — procura cidades disponíveis\n`&fuso add/remove <cidade>` — monta a lista _(ManageMessages)_\n`&fuso apelido <cidade> <texto>` — ex.: Madrid aparecendo como \"Europa\"\n`&fuso principal <cidade>` — de quem as diferenças são contadas\n`&fuso formato <12|24>`\n\n_Aceita acentos e o formato Cidade/País: `São Paulo`, `Madrid/Europa`, `Tokyo`._",
      perm: "ManageMessages (só para configurar)", ex: `${P}fuso add São Paulo`,
    },
    boasvindas: {
      uso: `${P}boasvindas [canal|titulo|texto|cor|imagem|testar|padrao|on|off]`,
      desc: "Embed publicado quando alguém **entra** no servidor.\n\n`&boasvindas canal aqui` — define onde publicar (já liga)\n`&boasvindas titulo <texto>` · `&boasvindas texto <descrição>`\n`&boasvindas cor <cor>` · `&boasvindas imagem <url|limpar>`\n`&boasvindas testar` — publica usando você de exemplo\n`&boasvindas padrao` — volta ao texto de fábrica\n\n**Marcadores:** `{usuario}` `{nome}` `{servidor}` `{membros}`",
      perm: "ManageMessages", ex: `${P}boasvindas canal aqui`,
    },
    adeus: {
      uso: `${P}adeus [canal|titulo|texto|cor|imagem|testar|padrao|on|off]`,
      desc: "Embed publicado quando alguém **sai** do servidor (saída, expulsão ou ban). Mesmas opções do `&boasvindas`.\n\n_Nas despedidas o `{usuario}` vira o **nome** em vez de menção: quem saiu não está mais no servidor, e a menção apareceria como um ID cru._",
      perm: "ManageMessages", ex: `${P}adeus canal aqui`,
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
    idioma: {
      uso: `${P}idioma [pt|en]`,
      desc: "Define o idioma em que o bot responde **neste servidor**: Português ou Inglês. Sem argumento, mostra o idioma atual. Também responde por `&language` e `&lang`.",
      perm: "ManagePermissions (para mudar)", ex: `${P}idioma en`,
    },
    chat: {
      uso: `${P}chat <mensagem>`,
      desc: "Conversa com a IA local (a Judy). Ela busca na internet, faz contas exatas, lê o próprio código, monta um perfil de quem conversa com ela e adapta o tom a cada pessoa. O modelo é escolhido sozinho conforme o tipo (conversa leve, código, lógica).\n\n**Subcomandos:**\n`&chat status` — se o serviço de IA está no ar\n`&chat perfil [@user]` — o que a Judy sabe sobre alguém\n`&chat mapear [@user]` — captura bio/status do cartão\n`&chat cuidado [@user] on|off` — trata a pessoa com gentileza extra (opt-in)\n`&chat esquecer` — apaga tudo que a Judy sabe de você\n`&chat esquecer tudo` — zera a memória do servidor *(ManageServer)*\n`&chat livre on|off|modo` — a Judy participa sozinha do canal *(ManagePermissions)*\n`&chat comentar aqui|off|pordia <n>` — comentários por iniciativa *(ManagePermissions)*\n\nQuando responde alguém, mantém o papo fluido por um tempo. Se ela já estiver respondendo outra pessoa, você entra na **fila** (vê a posição) e é atendido na ordem. Conta escrita na mensagem (`263857 * 3`) vai sempre para a calculadora, nunca de cabeça.",
      perm: null, ex: `${P}chat status`,
    },
    modia: {
      uso: `${P}modia <on|off|criterios|canal|status|limpar>`,
      desc: "Moderação por IA na conversa. Você escreve os CRITÉRIOS em texto livre e a Judy avalia cada mensagem; se violar, ela APAGA e te marca no #log com o conteúdo e as opções (avisar/silenciar/banir) já com o comando pronto. Ela nunca bane sozinha — a decisão é sua. O dono do bot é imune.\n\n`&modia criterios <texto>` — define o que moderar\n`&modia on|off` — liga/desliga\n`&modia canal add|remove` — limita a canais (sem isso, vale em todos)\n`&modia limpar` — zera tudo",
      perm: "ManageServer", ex: `${P}modia criterios Apague divulgacao de outros servidores e ataques pessoais`,
    },
    debug: {
      uso: `${P}debug [canais|silence]`,
      desc: "Diagnóstico do bot neste servidor.\n\n`&debug` — testa todos os comandos e aponta o que está desativado ou sem permissão\n`&debug canais` — **o que eu enxergo e o que consigo fazer em cada canal**. No Stoat a permissão do canal vence a do cargo, então dá para eu ter permissão no servidor e estar mudo num canal específico\n`&debug canais cru` — mostra o formato dos dados (quando o diagnóstico não consegue avaliar)\n`&debug silence [@pessoa]` — se o cargo de silêncio realmente cala: mostra em quais canais falta a negação e, com uma pessoa marcada, avisa se ela tem cargo **acima** do silêncio que anula o efeito",
      perm: "ManagePermissions",
      ex: `${P}debug canais`,
    },
    comando: {
      uso: `${P}comando [disable|enable <nome>]`,
      desc: "Ativa ou desativa comandos do bot neste servidor. `&comando` sozinho lista o estado de cada um. Ex.: `&comando desativar ban`. Os comandos `help` e `comando` não podem ser desativados.\n\n_Aceita as duas línguas: `desativar`/`disable`, `ativar`/`enable`._",
      perm: "ManagePermissions", ex: `${P}comando desativar repete`,
    },
    cargomudo: {
      uso: `${P}cargomudo [nome]`,
      desc: `Cria um cargo com TODAS as permissões negadas (serve para silenciar) e já o define como cargo de silêncio do servidor. Nega no servidor E em cada canal. \`${P}cargomudo canais\` reaplica nos canais.`,
      perm: "ManagePermissions", ex: `${P}cargomudo Silenciado`,
    },
    embed: {
      uso: `${P}embed` + " → depois `campo: valor`, um por linha",
      desc: "Publica uma mensagem embed customizável.\n\n**Escreva assim** (sem parênteses, sem vírgula no fim):\n```\n&embed\ntitulo: Idade\ndescricao: Você tem +18 ou -18 anos?\ncor: #FF00FF\n```\n**Campos:** `titulo:` `descricao:` `cor:` `rodape:` `imagem:` (URL) `canal:` (ID p/ publicar em outro canal).\nCor por hex (`#5865F2`) ou nome (azul, verde, rosa…).\nTambém aceita tudo numa linha separando com `|`.",
      perm: "ManageMessages", ex: `${P}embed titulo: Idade | descricao: +18 ou -18? | cor: rosa`,
    },
    reactionrole: {
      uso: `${P}reactionrole <add|remove|list>`,
      desc: "Cargos por reação: quem reagir com o emoji ganha o cargo; quem tirar a reação perde.\n\n`&reactionrole add <mensagem> <emoji> <idCargo>`\n`&reactionrole remove <mensagem>` — remove as regras daquela mensagem\n`&reactionrole exclusivo <mensagem> on|off` — **on**: escolher um emoji troca o cargo anterior (ex.: cor); **off**: acumula (ex.: interesses)\n`&reactionrole recarregar` — se os cargos pararem de ser entregues após um restart\n`&reactionrole list` — regras deste servidor\n\n**A mensagem** pode ser o **ID** ou o **link** dela (menu `...` → *Copiar link*) — os dois funcionam.\n**O cargo** pode ser **mencionado** (`<%Cargo>`) ou o ID (Configurações → Cargos → *Copy role ID*).\n\nO bot precisa de `React`, `ViewChannel`, `ReadMessageHistory` e **AssignRoles**, e o cargo dele deve estar acima do cargo entregue.",
      perm: "ManageRole",
      ex: `${P}reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
    },
    limpar: {
      uso: `${P}limpar <quantidade> [@usuário] | tudo`,
      desc: "Apaga as últimas mensagens do canal (1–100). Com um usuário, apaga só as mensagens dele. Também responde a `clear` e `purge`. A confirmação some sozinha após alguns segundos.\n\n`&limpar tudo` — esvazia o canal INTEIRO. Só o **dono do servidor**, e com confirmação por código de 4 caracteres que expira em 60s. Não há como desfazer.",
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
      uso: `${P}sentinela ban <userId> | ${P}sentinela dismiss <userId>`,
      desc: "No modo confirmação, confirma o banimento ou libera o usuário sinalizado.",
      perm: "BanMembers",
    },
  };
}

function detalhesEN(P) {
  return {
    cor: {
      uso: `${P}cor <role> <color|gradient|preset>`,
      desc: "Customizes role colors — including **gradients**, which the Stoat client doesn't offer in its UI.\n\n**Solid:** `&cor VIP #FF00AA` or `&cor VIP roxo`\n**Gradient:** `&cor VIP gradiente #FF0000 #0000FF` (2+ colors; a leading number sets the angle)\n**Preset:** `&cor VIP preset vaporwave` — see them all with `&cor presets`\n**Automatic:** `&cor painel aqui` — creates the roles, posts the picker message (mentioning the roles), adds the emoji reactions, wires up reaction roles and enables exclusive mode. All in one command.\n**Roles only:** `&cor criar` — creates/paints without posting anything\n**Raw CSS:** `&cor VIP linear-gradient(90deg, #f00 0%, #00f 100%)`\n**Clear:** `&cor VIP remover` · **View:** `&cor lista`\n\nThe role can be given by name (even partial) or by ID. The bot's role needs **ManageRole** and must sit **above** the edited role.",
      perm: "ManageRole",
      ex: `${P}cor VIP gradiente #FF71CE #01CDFE #05FFA1`,
    },
    tutorial: {
      uso: `${P}tutorial [page|area]`,
      desc: "First-steps guide **in pages** — react ◀ ▶ to turn. It changes nothing by itself: it shows the path and the exact command for each step.\n\n`&tutorial` — the guide (6 pages): permissions → channels → protection → welcome and roles → XP and RPG → checklist\n`&tutorial 2` — opens page 2 directly\n`&tutorial <area>` — goes deeper on one subject (e.g. `&tutorial canais`, `&tutorial game`)\n\nWould you rather have the bot ask and configure for you? `&assistente`.\n\nAlso answers to `&guide` and `&start`.",
      perm: null,
      ex: `${P}tutorial canais`,
    },
    assistente: {
      uso: `${P}assistente [rapido|completo|canais|protecao|cancelar]`,
      desc: "**Guided** setup: the bot asks one question at a time, you answer in plain text, and at the end it shows a summary and applies everything — using the same commands you would type by hand (and shows which ones, so you learn them).\n\n`&assistente` — menu\n`&assistente rapido` — language, staff, log, protection, welcome (~2 min)\n`&assistente completo` — quick + punishment ladder, global list, XP, autorole\n`&assistente canais` — sorts your channels into the 3 types and tells you what to click in Stoat\n`&assistente protecao` — only automod, sentinel and punishment\n\nDuring the questions: `pular` skips, `voltar` goes back, `cancelar` quits. Each person has their own; it expires after 10 min without an answer.",
      perm: "ManagePermissions",
      ex: `${P}assistente rapido`,
    },
    hello: {
      uso: `${P}hello`,
      desc: "Replies with a simple greeting. Handy to check whether the bot is online.",
    },
    ping: {
      uso: `${P}ping`,
      desc: "Shows the latency between the message being sent and the bot processing it.",
    },
    repete: {
      uso: `${P}repete <text>`,
      desc: "The bot repeats the given text verbatim. Useful for announcements.",
      ex: `${P}repete Welcome to the server!`,
    },
    userinfo: {
      uso: `${P}userinfo [@user]`,
      desc: "Shows ID, account creation date, server join date and roles. Without a mention, shows you.",
      ex: `${P}userinfo @someone`,
    },
    kick: {
      uso: `${P}kick @user [reason]`,
      desc: "Kicks the mentioned user. They can come back with a new invite.",
      perm: "KickMembers", ex: `${P}kick @someone spam`,
    },
    ban: {
      uso: `${P}ban @user [reason]`,
      desc: "Permanently bans the mentioned user.",
      perm: "BanMembers", ex: `${P}ban @someone advertising`,
    },
    warn: {
      uso: `${P}warn <@user|id|name> [reason]`,
      desc: "Gives someone a manual warning. It uses the **same counter** as the automod, so in `acumular` (accumulate) mode a manual warning counts towards the automatic ban — and the bot tells you how many are left.\n\nSee warnings: `&warnings @user` · Reset: `&clearwarnings @user`",
      perm: "KickMembers",
      ex: `${P}warn @Someone flooding the art channel`,
    },
    servidores: {
      uso: `${P}servidores`,
      desc: "Overview of everywhere the bot is: each server's name, member count and message rate per minute.\n\n`&servidores cru` shows the raw data as the API delivers it (diagnostics).\n\n_Restricted to the bot owner._",
      perm: null,
      ex: `${P}servidores`,
    },
    acesso: {
      uso: `${P}acesso <cargo|canal|staffignora|status>`,
      desc: "Defines **who** can use the commands and **where**.\n\n**Staff roles** — anyone holding one can use the moderation commands even without the native Stoat permission:\n`&acesso cargo add <@role>` · `&acesso cargo remove <@role>` · `&acesso cargo limpar`\n\n**Channels** — where commands work:\n`&acesso canal todos` — in any channel\n`&acesso canal somente` — only in the listed ones\n`&acesso canal exceto` — everywhere except the listed ones\n`&acesso canal add|remove [#channel]` — edits the list\n\n`&acesso staffignora on|off` — whether staff bypasses the channel restriction (default: yes)\n\n_`&acesso`, `&debug`, `&help` and `&tutorial` always work, so you can't lock yourself out._",
      perm: "ManagePermissions",
      ex: `${P}acesso canal somente`,
    },
    warnings: {
      uso: `${P}warnings [@user]`,
      desc: "Shows how many warnings (0 to 3) the user has accumulated in the AutoMod. 3 warnings = ban.",
    },
    clearwarnings: {
      uso: `${P}clearwarnings @user`,
      desc: "Resets a user's accumulated warnings.",
      perm: "ManagePermissions",
    },
    automod: {
      uso: `${P}automod status | ${P}automod <module> <on|off>`,
      desc: "Turns each AutoMod module on/off and shows the overall state. Filters: antispam, antimassspam, antiinvite, antimassmention, anticaps, antilink, anticaracteres, antirepeticao and `sentinela` (the former antiscam, which now judges content in general).",
      perm: "ManagePermissions", ex: `${P}automod antilink on`,
    },
    whitelist: {
      uso: `${P}whitelist <add|remove|list> [invite]`,
      desc: "List of this server's invites exempt from the anti-invite. Accepts the full link or just the code.",
      perm: "ManagePermissions", ex: `${P}whitelist add https://stt.gg/abc123`,
    },
    blocklist: {
      uso: `${P}blocklist <add|adddomain|remove|removedomain|list|clear|reload> [url|domain]`,
      desc: "Manages the anti-link. `add <url>` imports Pi-hole-style lists; `adddomain <domain>` blocks a single domain.",
      perm: "ManagePermissions", ex: `${P}blocklist adddomain bad-site.com`,
    },
    sentinela: {
      uso: `${P}sentinela <config|sensitivity|antiguidade|alerta|channel|test|simulate|ban|dismiss>`,
      desc: `The only module that **judges** instead of measuring: it scores content for suspicion (0–10), covering scams, NSFW, gore, glorifying crime and abuse in a single category.\n\nBecause it judges, it adapts to who is writing:\n**\`antiguidade on\`** — the threshold follows the member's XP level. A brand new account gets a closer look; someone who has been talking here for weeks gets slack. A scammy-sounding line from someone who just arrived is far more likely to actually be a scam.\n**\`alerta on\`** — pings the staff when someone raises suspicion **repeatedly** in a short window, even below the punishment threshold. One signal is noise; a pattern deserves human eyes.\n\n\`${P}sentinela test <text>\` shows the score that text would get; \`${P}sentinela simulate <text>\` fires the real flow in the alerts channel.\n\n_What **happens** to whoever crosses the threshold is decided in \`${P}punicao\` — it applies to every automod at once, and has no \`test\` of its own._\n\n_It used to be \`${P}scam\`, and that name still works._`,
      perm: "ManagePermissions", ex: `${P}sentinela test easy money DM me now`,
    },
    banglobal: {
      uso: `${P}banglobal <off|avisar|banir|lista|revisar|varrer|isentar|desfazer|historico|esquecer>`,
      desc: "Global ban list shared across every server the bot is in.\n\n`off` — ignore · `avisar` — alert the moderators · `banir` — ban automatically **on join**\n\n**Seeing who's listed**\n`&banglobal lista` — everyone, in pages · `&banglobal lista servidor` — only this server's\n`&banglobal historico <@user>` — where and why that person was banned\n\n**People already in the server**\n`&banglobal revisar` — checks and **shows only**. Never bans.\n`&banglobal varrer` — shows and **waits for confirmation** · `&banglobal varrer confirmar` — ⚠️ bans\n\n**When the list gets it wrong**\n`&banglobal isentar <@user>` — accepts that person **here** despite the list (and undoes their ban, if the bot applied it)\n`&banglobal isentos` — who's exempt · `&banglobal desfazer` — ↩️ reverts the bans the list applied here\n`&banglobal esquecer <@user>` — deletes the record **for every server**\n\n**Contributing is automatic and permanent.** This server's bans — old and new — feed the list on their own, with no command and no switch to turn it off. The mode above only decides whether this server **benefits** from the list: you can opt out of using it, not out of feeding it.",
      perm: "BanMembers",
      ex: `${P}banglobal revisar`,
    },
    game: {
      uso: `${P}game [criar|ficha|pontos|top|apagar]`,
      desc: "Server RPG: create a character, level up and spend points across 9 attributes.\n\n`&game criar [name]` — creates your character\n`&game` — your sheet\n`&game ficha @user` — someone else's sheet\n`&game pontos <attribute> [amount]` — spends points (abbreviations work: for, int, sor…)\n\n_Every 2 levels all attributes rise by 1 on their own; the free points are what shape your build._\n`&game carteira` — balance and economy state\n`&game comprar [item] [com <currency>]` · `&game vender <item>` — market\n`&game contratar [name]` — mercenaries\n`&game descansar` — restores energy for a fee\n`&game mercado` — player-to-player bazaar (sell, buy, cancel)\n`&game cambio <qty> <currency>` — what it's worth in every currency\n`&game cambio <qty> <currency> para <currency>` — exchange with the bank, instantly\n`&game cambio <qty> <currency> por <qty> <currency>` — offer to another player\n`&game cambio taxas` — the bank's rates\n`&game trocar @user <item> por <item>` — bartering\n\n_To **configure** the RPG on the server: `&tutorial game`._\n_Bot owner: `&game admin` has the testing tools._\n`&game followers` — your companions\n`&game follower ficha <name>` — his attributes, spell and bag\n`&game follower dar <name> <item>` — hands over an item (spaces are fine; `|` separates if needed)\n`&game follower levar <name>` — adds to the party (up to 2)\n`&game recrutas` — who exists in the game\n`&game dungeon` — who's captured (the rescue happens automatically on missions)\n`&game missao` — available missions (with your odds in each)\n`&game missao <name>` — sets off on the mission\n`&game itens` — your backpack\n`&game item <name>` — one item's sheet, with the price in each currency\n`&game equipar <item>` / `&game desequipar <slot|item>`\n`&game magias` — the grimoire · `&game aprender <name>` — learn a spell\n`&game catalogo` — item summary · `&game catalogo <rarity|slot>` — the full list of that group\n`&game top` — server ranking\n`&game apagar confirmar` — starts over from scratch\n\n**Attributes:** Strength, Dexterity, Endurance, Agility, Health, Mana, Intelligence, Luck, Charisma.\n\n_Intelligence and Luck boost XP gains and points per level, with diminishing returns — they never stop mattering._\n\n⚠️ Not to be confused with `&xp`, the per-message leveling system.",
      perm: null,
      ex: `${P}game criar Kael`,
    },
    xp: {
      uso: `${P}xp [rank|top|setup|cargos|criarcargos|sincronizar|on|off]`,
      desc: "Message-XP leveling system. Each message grants XP (with a cooldown), and enough XP levels you up. Every N levels you can earn a role, and the earlier ones stay — they stack.\n\n`top` shows the ranking · `setup` configures difficulty, level cap and role interval.\n\n**Leaving costs the roles, not the XP.** A role belongs to the member: leaving means no longer being one, so Stoat removes them. The XP stays. Whoever **joins** gets the roles back automatically; for those who returned before that, `&xp sincronizar [@user]` hands back everything the current level grants _(see `&help xp sincronizar`)_.\n\n(Voice-call XP isn't supported by Stoat.)",
      perm: "ManagePermissions (to configure)", ex: `${P}xp top`,
    },
    rss: {
      uso: `${P}rss [add|remove|list|canal|agora]`,
      desc: "RSS news curation with Judy's summaries. `add <url>` registers a feed, `canal aqui` sets the destination, `list` shows the feeds, `remove <url|n>` removes one, `agora` forces a cycle. Every hour Judy posts an overall summary in her own voice, followed by the new items (title, feed, time, link).",
      perm: "ManagePermissions", ex: `${P}rss add https://example.com/feed.xml`,
    },
    staff: {
      uso: `${P}staff [add|remove|title|clear]`,
      desc: "Shows the **server's staff**, grouped by role and listing who holds each one.\n\nThe list has no separate registry: it reads the very same roles as `&acesso cargo`. So adding here **also grants access to the moderation commands** — and removing drops both at once, so the notice board can never disagree with the actual permission.\n\n`&staff add <@role>` · `&staff remove <@role>` · `&staff clear`\n`&staff title <@role> <text>` — label shown instead of the role's name\n\n_Viewing is public; changing requires ManagePermissions._",
      perm: "ManagePermissions", ex: `${P}staff add Moderator`,
    },
    tts: {
      uso: `${P}tts <text> | [canal|transmitir|entrar|sair|filtro|reiniciar|voz|estado|on|off]`,
      desc: "Judy **speaks in calls**. Someone writes, she reads it aloud in the voice channel.\n\n`&tts <text>` — speak now\n`&tts entrar` · `&tts sair` — call or dismiss Judy\n`&tts estado` — diagnostics for the whole chain\n_These three are open to **everyone**._\n\n**Broadcast mode** — no extra command\n`&tts entrar` already makes **everything** written in that channel become speech; `&tts sair` stops it.\n\n**Adjustments** _(viewing is open; changing needs ManageMessages)_\n`&tts nomes off` — stops announcing \"Someone said:\"\n`&tts cooldown <s>` — brake between one person's utterances (0 disables)\n`&tts filtro` — the **sieve**: skips repetition, walls of text and noise, and caps utterances per minute _(`&help tts filtro`)_\n\n**When something jams**\n`&tts reiniciar` — unsticks the voice service without a terminal _(ManageMessages)_. After `&tts sair`, the broadcast will **not** bring Judy back: only `&tts entrar`. _(`&help tts problemas`)_\n\n**Voice and timbre**\n`&tts voz [name]` — switch the Piper voice\n`&tts efeito [name]` — `feminina`, `sedutora`, `suave`, `glados`, `robo`, `radio`…\n`&tts tom <n>` — pitch, **separate** from the effect (1.0 = original)\n`&tts dicionario` — how chat shorthand is spoken (`vc` → `você`); `add`/`remove`/`teste`/`padrao on|off`\n_There is no GLaDOS voice in Portuguese; the effect recreates her **processing** over the voice you already use._\n\n_Inside the configured voice channels, `&tts` works for **everyone**, even with channel restriction on._\n_Synthesis runs **offline** on the owner's machine (Piper)._",
      perm: "ManageMessages (configuration only)", ex: `${P}tts entrar`,
    },
    fuso: {
      uso: `${P}fuso [ver|buscar|add|remove|apelido|principal|formato|limpar]`,
      desc: "A server clock showing **several cities at once** — handy when people are spread out (São Paulo, Madrid, Tokyo…).\n\n`&fuso` shows the current time in each configured city, sorted from the earliest offset to the latest, with the difference from the reference city.\n\n`&fuso ver <city>` — any city's time, no setup needed\n`&fuso buscar <term>` — search available cities\n`&fuso add/remove <city>` — build the list _(ManageMessages)_\n`&fuso apelido <city> <text>` — e.g. Madrid showing as \"Europe\"\n`&fuso principal <city>` — which city the differences count from\n`&fuso formato <12|24>`\n\n_Accents and the City/Country format work: `São Paulo`, `Madrid/Europa`, `Tokyo`._",
      perm: "ManageMessages (configuration only)", ex: `${P}fuso add Madrid`,
    },
    boasvindas: {
      uso: `${P}welcome [channel|title|text|colour|image|test|default|on|off]`,
      desc: "Embed posted when someone **joins** the server.\n\n`&welcome channel here` — where to post (turns it on)\n`&welcome title <text>` · `&welcome text <description>`\n`&welcome colour <colour>` · `&welcome image <url|clear>`\n`&welcome test` — posts using you as the example\n`&welcome default` — back to the factory text\n\n**Markers:** `{usuario}` `{nome}` `{servidor}` `{membros}`",
      perm: "ManageMessages", ex: `${P}welcome channel here`,
    },
    adeus: {
      uso: `${P}goodbye [channel|title|text|colour|image|test|default|on|off]`,
      desc: "Embed posted when someone **leaves** the server (leave, kick or ban). Same options as `&welcome`.\n\n_In farewells `{usuario}` becomes the **name** rather than a mention: whoever left isn't on the server anymore, and the mention would show up as a raw ID._",
      perm: "ManageMessages", ex: `${P}goodbye channel here`,
    },
    autorole: {
      uso: `${P}autorole [set <@role>|off]`,
      desc: "Automatically gives a role to every new member who joins the server. `set` defines the role, `off` disables it. Useful for handing everyone a 'Member' role automatically.",
      perm: "ManageRole", ex: `${P}autorole set <@Member>`,
    },
    sobre: {
      uso: `${P}sobre`,
      desc: "Shows a summary of the bot: features, number of commands and how long it has been up.",
      perm: null, ex: `${P}sobre`,
    },
    idioma: {
      uso: `${P}language [pt|en]`,
      desc: "Sets the language the bot replies in **on this server**: Portuguese or English. Without an argument, shows the current language. Also answers to `&idioma` and `&lang`.",
      perm: "ManagePermissions (to change)", ex: `${P}language en`,
    },
    chat: {
      uso: `${P}chat <message>`,
      desc: "Talk to the local AI (Judy). She searches the web, does exact math, reads her own code, builds a profile of whoever talks to her and adapts her tone to each person. The model is picked automatically by task type (casual chat, code, logic).\n\n**Subcommands:**\n`&chat status` — whether the AI service is up\n`&chat perfil [@user]` — what Judy knows about someone\n`&chat mapear [@user]` — captures the profile card bio/status\n`&chat cuidado [@user] on|off` — treats the person with extra kindness (opt-in)\n`&chat esquecer` — erases everything Judy knows about you\n`&chat esquecer tudo` — wipes the server's memory *(ManageServer)*\n`&chat livre on|off|modo` — Judy joins the channel on her own *(ManagePermissions)*\n`&chat comentar aqui|off|pordia <n>` — comments on her own initiative *(ManagePermissions)*\n\nWhen she replies to someone, she keeps the conversation flowing for a while. If she's already answering someone else you join the **queue** (you'll see your position) and get served in order. Arithmetic written in the message (`263857 * 3`) always goes to the calculator, never done in her head.",
      perm: null, ex: `${P}chat status`,
    },
    modia: {
      uso: `${P}modia <on|off|criterios|canal|status|limpar>`,
      desc: "AI moderation of the conversation. You write the CRITERIA in free text and Judy evaluates each message; if it violates them, she DELETES it and pings you in #log with the content and the options (warn/silence/ban) with the command ready to paste. She never bans on her own — the decision is yours. The bot owner is immune.\n\n`&modia criterios <text>` — defines what to moderate\n`&modia on|off` — toggles it\n`&modia canal add|remove` — limits it to channels (otherwise applies to all)\n`&modia limpar` — resets everything",
      perm: "ManageServer", ex: `${P}modia criterios Delete ads for other servers and personal attacks`,
    },
    debug: {
      uso: `${P}debug [canais|silence]`,
      desc: "Bot diagnostics on this server.\n\n`&debug` — tests every command and points out what's disabled or missing permissions\n`&debug canais` — **what I can see and do in each channel**. On Stoat the channel permission beats the role permission, so I can have a server-wide permission yet be muted in one specific channel\n`&debug canais cru` — shows the raw data format (when the diagnosis can't evaluate)\n`&debug silence [@user]` — whether the silence role actually silences: shows which channels are missing the denial and, with someone mentioned, warns if they hold a role **above** the silence role that cancels it",
      perm: "ManagePermissions",
      ex: `${P}debug canais`,
    },
    comando: {
      uso: `${P}comando [disable|enable <name>]`,
      desc: "Enables or disables bot commands on this server. `&comando` alone lists each one's state. E.g.: `&comando disable ban`. The `help` and `comando` commands can't be disabled.",
      perm: "ManagePermissions", ex: `${P}comando disable repete`,
    },
    cargomudo: {
      uso: `${P}cargomudo [name]`,
      desc: `Creates a role with ALL permissions denied (used to silence people) and sets it as the server's silence role. Denies at the server level AND in every channel. \`${P}cargomudo canais\` re-applies it to the channels.`,
      perm: "ManagePermissions", ex: `${P}cargomudo Silenced`,
    },
    embed: {
      uso: `${P}embed` + " → then `field: value`, one per line",
      desc: "Posts a customizable embed message.\n\n**Write it like this** (no parentheses, no trailing comma):\n```\n&embed\ntitulo: Age\ndescricao: Are you over or under 18?\ncor: #FF00FF\n```\n**Fields:** `titulo:` `descricao:` `cor:` `rodape:` `imagem:` (URL) `canal:` (ID to post in another channel).\nColor by hex (`#5865F2`) or name (azul, verde, rosa…).\nAlso accepts everything on one line separated by `|`.",
      perm: "ManageMessages", ex: `${P}embed titulo: Age | descricao: 18+ or under? | cor: rosa`,
    },
    reactionrole: {
      uso: `${P}reactionrole <add|remove|list>`,
      desc: "Reaction roles: whoever reacts with the emoji gets the role; removing the reaction removes the role.\n\n`&reactionrole add <message> <emoji> <roleId>`\n`&reactionrole remove <message>` — removes that message's rules\n`&reactionrole exclusivo <message> on|off` — **on**: picking one emoji swaps out the previous role (e.g. colors); **off**: they stack (e.g. interests)\n`&reactionrole recarregar` — if roles stop being handed out after a restart\n`&reactionrole list` — this server's rules\n\n**The message** can be its **ID** or its **link** (`...` menu → *Copy link*) — both work.\n**The role** can be **mentioned** (`<%Role>`) or given by ID (Settings → Roles → *Copy role ID*).\n\nThe bot needs `React`, `ViewChannel`, `ReadMessageHistory` and **AssignRoles**, and its role must be above the role being handed out.",
      perm: "ManageRole",
      ex: `${P}reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
    },
    limpar: {
      uso: `${P}limpar <amount> [@user] | tudo`,
      desc: "Deletes the channel's latest messages (1–100). With a user, deletes only theirs. Also answers to `clear` and `purge`. The confirmation deletes itself after a few seconds.\n\n`&limpar tudo` — empties the WHOLE channel. **Server owner only**, with a 4-character confirmation code that expires in 60s. There is no undo.",
      perm: "ManageMessages", ex: `${P}limpar 10`,
    },
    config: {
      uso: `${P}config`,
      desc: "Shows ALL of the server's current settings in one place: automod modules, punishment policy, log channel, allowed invites and active punishments.",
      perm: "ManagePermissions", ex: `${P}config`,
    },
    log: {
      uso: `${P}log [here | <channelId> | off | <event> <on|off>]`,
      desc: "The server's log channel. `here` uses the current channel; `<channelId>` sets it by ID; `off` disables it. Events: `punicoes`, `membros`, `mensagens`, `cargos`, `comandos` — each can be toggled.",
      perm: "ManagePermissions", ex: `${P}log here`,
    },
    punicao: {
      uso: `${P}punicao <modo|warns|silencerole>`,
      desc: "Punishment aggressiveness for ALL automods. `modo avisar` (warn only) | `confirmar` (remove+silence+wait for a mod) | `acumular` (warnings until ban) | `banir` (instant ban). `warns <n>` sets how many warnings until the ban; `silencerole <id>` sets the silence role.",
      perm: "ManagePermissions", ex: `${P}punicao modo acumular`,
    },
    review: {
      uso: `${P}sentinela ban <userId> | ${P}sentinela dismiss <userId>`,
      desc: "In confirmation mode, confirms the ban or releases the flagged user.",
      perm: "BanMembers",
    },
  };
}

// Marca invisível nas linhas que só valem onde a IA está ativa. O filtro
// remove essas linhas nos servidores sem IA, em vez de anunciar o que não roda.
const IA_TAG = "\u200b[ia]";
function filtrarIA(linhas, comIA) {
  if (!Array.isArray(linhas)) return [];   // categoria inexistente/malformada
  return linhas
    .filter((l) => comIA || !String(l).includes(IA_TAG))
    .map((l) => String(l).replace(IA_TAG, ""));
}

// ══════════════════════════════════════════════════════════
//  Subtópicos do help (&help <comando> <subtópico>)
// ══════════════════════════════════════════════════════════
function construirSubtopicos(P, lang) {
  if (lang === "en") return {
    sentinela: {
      sensitivity: {
        titulo: "sentinela sensitivity",
        texto: [
          `**Usage:** \`${P}sentinela sensitivity <baixa|media|alta>\``,
          "",
          "Sets from which **score (0–10)** the bot acts on suspicious content:",
          "• 🟢 **baixa** (low, threshold 8) — only near-certain cases; fewer false positives.",
          "• 🟡 **media** (medium, threshold 6) — recommended balance.",
          "• 🔴 **alta** (high, threshold 4) — catches faint signs; protects more, errs more.",
        ].join("\n"),
      },
      test: {
        titulo: "sentinela test",
        texto: [
          `**Usage:** \`${P}sentinela test <text>\``,
          "",
          "Simulates analyzing a text and shows the score (0–10) and detected signals, without punishing anyone. Useful for calibrating the sensitivity.",
        ].join("\n"),
      },
      channel: {
        titulo: "sentinela channel",
        texto: [
          `**Usage:** \`${P}sentinela channel <aqui|id|off>\``,
          "",
          "Sets which channel receives the suspicious-content alerts. `off` goes back to alerting in the message's own channel.",
        ].join("\n"),
      },
    },
    automod: {
      set: {
        titulo: "automod set",
        texto: [
          `**Usage:** \`${P}automod <module> set <parameter> <value>\``,
          "",
          "Adjusts a module's parameter. Parameters per module:",
          "• `antispam` / `antimassspam`: `mensagens`, `tempo` (ms)",
          "• `antimassmention`: `mencoes`",
          "• `anticaps`: `tamanho`, `limiar` (0–1 or %)",
          "  _Measurement ignores mentions, links, named emojis and code — only typed text counts._",
          "• `anticaracteres`: `zalgo`",
          "• `antirepeticao`: `repeticao`, `ignorar` (laughter letters, e.g. `k`)",
          "",
          `E.g.: \`${P}automod antispam set mensagens 3\` · \`${P}automod antispam set tempo 10000\``,
        ].join("\n"),
      },
      punicao: {
        titulo: "automod punicao",
        texto: [
          `**Usage:** \`${P}automod <module> punicao <mode|herdar>\``,
          "",
          "Gives a module its **own** punishment, independent of the global one:",
          "• `avisar` — warn only\n• `apagar` — remove the message only\n• `confirmar` — silence and wait for a mod\n• `acumular` — stack warnings until a ban\n• `banir` — instant ban\n• `herdar` — inherit the global punishment again",
          "",
          `E.g.: \`${P}automod antilink punicao apagar\``,
        ].join("\n"),
      },
      antirepeticao: {
        titulo: "automod antirepeticao",
        texto: [
          "**Anti-repetition** — blocks the same letter repeated many times in one message (e.g. `aaaaaaaaaa`).",
          "",
          "It ships **disabled** by default, because in Brazilian servers `kkkkk` (laughter) is legitimate — which is also why `k` is ignored by default.",
          "",
          `\`${P}automod antirepeticao on\` — enables it`,
          `\`${P}automod antirepeticao set repeticao 15\` — repetition limit`,
          `\`${P}automod antirepeticao set ignorar k\` — letters to ignore (laughter)`,
          `\`${P}automod antirepeticao punicao apagar\` — its own punishment`,
        ].join("\n"),
      },
    },
    punicao: {
      modo: {
        titulo: "punicao modo",
        texto: [
          `**Usage:** \`${P}punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
          "",
          "Sets the **global** punishment (applies to every module without its own):",
          "• `avisar` — warn only, don't remove\n• `apagar` — remove the message only\n• `confirmar` — remove, silence (if a role is set) and wait for a mod's approval\n• `acumular` — stack warnings and ban at the limit\n• `banir` — instant ban",
        ].join("\n"),
      },
    },
  };

  // pt
  return {
    sentinela: {
      sensitivity: {
        titulo: "sentinela sensitivity",
        texto: [
          `**Uso:** \`${P}sentinela sensitivity <baixa|media|alta>\``,
          "",
          "Define a partir de qual **nota (0–10)** o bot age sobre conteúdo suspeito:",
          "• 🟢 **baixa** (limiar 8) — só o que é quase certo; menos falsos positivos.",
          "• 🟡 **media** (limiar 6) — equilíbrio recomendado.",
          "• 🔴 **alta** (limiar 4) — pega indícios leves; protege mais, erra mais.",
        ].join("\n"),
      },
      test: {
        titulo: "sentinela test",
        texto: [
          `**Uso:** \`${P}sentinela test <texto>\``,
          "",
          "Simula a análise de um texto e mostra a nota (0–10) e os sinais detectados, sem punir ninguém. Útil para calibrar a sensibilidade.",
        ].join("\n"),
      },
      channel: {
        titulo: "sentinela channel",
        texto: [
          `**Uso:** \`${P}sentinela channel <aqui|id|off>\``,
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
          "  _A medição ignora menções, links, emojis nomeados e código — só conta o texto digitado._",
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
}

export async function cmdHelp(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO } = ctx;
  const P = PREFIXO;
  const lang = lingua(ctx);
  const comIA = (() => { try { return temIA(ctx.serverId); } catch { return false; } })();

  // Ajuda detalhada por comando: &help <comando>
  const DETALHES  = construirDetalhes(P, lang);
  // Os subtópicos vêm de duas fontes: os antigos, embutidos aqui, e a árvore
  // por subcomando do help-arvore.js. A árvore complementa; onde as duas têm a
  // mesma chave, a antiga vence (é a mais específica, escrita à mão).
  const SUBTOPICOS = (() => {
    const base = construirSubtopicos(P, lang);
    const extra = arvoreSubtopicos(P, lang);
    const fundido = { ...extra };
    for (const [cmd, subs] of Object.entries(base)) {
      fundido[cmd] = { ...(extra[cmd] ?? {}), ...subs };
    }
    // Sem IA no servidor, os subtópicos de IA não existem — nem para listar.
    if (!comIA) for (const cmd of SUBTOPICOS_SO_IA) delete fundido[cmd];
    return fundido;
  })();

  const alvo = args[0]?.toLowerCase();
  const subtopico = args[1]?.toLowerCase();

  // &help <comando> <subtópico>
  if (alvo && subtopico && SUBTOPICOS[alvo]?.[subtopico]) {
    const st = SUBTOPICOS[alvo][subtopico];
    return sendEmbed(message.channel, {
      // O `titulo` do subtópico é "comando subcomando" — passa pela mesma
      // tradução do corpo, para o cabeçalho nunca divergir dele.
      title: `📖 ${lang === "en" ? "Help" : "Ajuda"} — ${P}${exibirTitulo(st.titulo, lang, P, ctx.estado?.CANONICO_COMPLETO ?? {})}`,
      description: filtrarIA(String(st.texto).split("\n"), comIA).join("\n"),
      colour: COR.info,
    });
  }

  // Pediu um subtópico que não existe, mas o comando tem subtópicos?
  // Melhor dizer quais existem do que devolver o detalhe genérico em silêncio.
  if (alvo && subtopico && SUBTOPICOS[alvo] && !SUBTOPICOS[alvo][subtopico]) {
    const disponiveis = Object.keys(SUBTOPICOS[alvo]).map((k) => `\`${P}help ${alvo} ${k}\``).join(" · ");
    return sendEmbed(message.channel, tr(ctx, {
      title: `❓ Subtópico desconhecido`,
      description: `\`${subtopico}\` não é um subtópico de \`${P}${alvo}\`.\n\n**Existem:** ${disponiveis}`,
      colour: COR.aviso,
    }, {
      title: `❓ Unknown subtopic`,
      description: `\`${subtopico}\` isn't a subtopic of \`${P}${alvo}\`.\n\n**Available:** ${disponiveis}`,
      colour: COR.aviso,
    }));
  }

  // ── Grupos: &help <grupo> (aceita os nomes antigos também) ──
  const GRUPOS = gruposHelp(P, lang);
  const ehDono = (() => { try { return ctx.ehSuperAdmin?.(message.authorId); } catch { return false; } })();
  const chavesGrupos = ehDono ? [...ORDEM_GRUPOS, "dono"] : [...ORDEM_GRUPOS];

  // Página de um grupo: cabeçalho + linhas (quebra em 2 páginas se não couber).
  const paginasDoGrupo = (chave) => {
    const g = GRUPOS[chave];
    const linhas = filtrarIA(g.linhas, comIA);
    const rodape = [
      "",
      lang === "en"
        ? `💡 \`${P}help <command>\` explains every parameter · \`${P}help\` for the index`
        : `💡 \`${P}help <comando>\` explica cada parâmetro · \`${P}help\` para o índice`,
    ];
    return paginarLinhas([...linhas, ...rodape], { titulo: `${g.emoji} ${g.titulo}`, limite: 1300 });
  };

  const indice = () => ({
    title: lang === "en" ? "📋 Help Center" : "📋 Central de Ajuda",
    description: [
      lang === "en"
        ? "What do you want to do? Pick a group — react ◀ ▶ to browse them all, or type the command."
        : "O que você quer fazer? Escolha um grupo — reaja ◀ ▶ para folhear todos, ou digite o comando.",
      "",
      ...chavesGrupos.map((k) => `${GRUPOS[k].emoji} \`${P}help ${k}\` — ${GRUPOS[k].resumo}`),
      "",
      lang === "en"
        ? `🆕 New server? \`${P}assistente\` configures it with you, step by step.`
        : `🆕 Servidor novo? \`${P}assistente\` configura com você, passo a passo.`,
      lang === "en"
        ? `📖 \`${P}help <command>\` — usage, **each parameter explained**, example (e.g. \`${P}help boasvindas\`)`
        : `📖 \`${P}help <comando>\` — uso, **cada parâmetro explicado**, exemplo (ex.: \`${P}help boasvindas\`)`,
      lang === "en"
        ? `🔍 \`${P}help <command> <part>\` — one part of it (\`${P}help game admin\`, \`${P}help xp setup\`)`
        : `🔍 \`${P}help <comando> <parte>\` — uma parte dele (\`${P}help game admin\`, \`${P}help xp setup\`)`,
      lang === "en" ? `🌐 \`${P}idioma pt|en\` — server language` : `🌐 \`${P}idioma pt|en\` — idioma do servidor`,
    ].join("\n"),
    colour: COR.info,
  });

  // &help <número> → página N do índice paginado
  const numero = /^\d+$/.test(alvo ?? "") ? parseInt(alvo, 10) : null;
  const chaveGrupo = ALIAS_GRUPO[alvo];

  if (!alvo || numero !== null || (chaveGrupo && GRUPOS[chaveGrupo] && (chaveGrupo !== "dono" || ehDono))) {
    // Um livrinho: índice + uma página (ou duas) por grupo.
    const paginas = [indice()];
    const inicioDe = {};
    for (const k of chavesGrupos) {
      inicioDe[k] = paginas.length;
      paginas.push(...paginasDoGrupo(k));
    }
    let inicial = 0;
    if (numero !== null) inicial = Math.min(Math.max(numero - 1, 0), paginas.length - 1);
    else if (chaveGrupo) inicial = inicioDe[chaveGrupo] ?? 0;
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, paginaInicial: inicial, comandoPagina: `${P}help`,
    });
  }

  // Comando de IA num servidor sem IA: ele não roda aqui, então não há ajuda.
  if (alvo && !comIA && COMANDOS_SO_IA.has(alvo)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Indisponível aqui",
      description: `\`${P}${alvo}\` faz parte dos recursos de IA, que não estão habilitados neste servidor.\n\nUse \`${P}help\` para ver o que existe por aqui.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Unavailable here",
      description: `\`${P}${alvo}\` is part of the AI features, which aren't enabled on this server.\n\nUse \`${P}help\` to see what's available here.`,
      colour: COR.aviso,
    }));
  }

  // &help <comando> (detalhe individual) — agora com a seção de parâmetros
  if (alvo && DETALHES[alvo]) {
    const d = DETALHES[alvo];
    const temSub = SUBTOPICOS[alvo]
      ? `\n\n**${lang === "en" ? "Subtopics" : "Subtópicos"}** ${lang === "en" ? "_(details on each part)_" : "_(o detalhe de cada parte)_"}\n`
        + Object.keys(SUBTOPICOS[alvo]).map((k) => `\`${P}help ${alvo} ${k}\``).join(" · ")
      : "";
    const params = secaoParametros(P, lang, alvo);
    const cabecalho = [
      `**${lang === "en" ? "Usage" : "Uso"}:** \`${d.uso}\``,
      d.perm ? `**${lang === "en" ? "Permission" : "Permissão"}:** ${d.perm}` : null,
      "",
      d.desc,
      d.ex ? `\n**${lang === "en" ? "Example" : "Exemplo"}:** \`${d.ex}\`` : null,
    ].filter(Boolean).join("\n");
    const titulo = `📖 ${lang === "en" ? "Help" : "Ajuda"} — ${P}${nomeExibido(alvo, lang)}`;
    // Descrição + parâmetros quase sempre estouram o embed: viram páginas
    // (1: o que é e como usar · 2: cada parâmetro · 3: subtópicos).
    const paginas = [{ title: titulo, description: cabecalho }];
    if (params) paginas.push({ title: titulo, description: params.trim() });
    if (temSub) paginas.push({ title: titulo, description: temSub.trim() });
    if (paginas.length === 1 || (cabecalho.length + params.length + temSub.length) < 1350) {
      return sendEmbed(message.channel, { title: titulo, colour: COR.info,
        description: cabecalho + params + temSub });
    }
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, comandoPagina: null,
    });
  }
  if (alvo) {
    const lista = chavesGrupos.filter((k) => k !== "dono").join(", ");
    return sendEmbed(message.channel, tr(ctx, {
      title: "❓ Não encontrado",
      description: `Não há ajuda para \`${alvo}\`. Use \`${P}help\` para o índice, ou \`${P}help <grupo>\` (${lista}).`,
      colour: COR.aviso,
    }, {
      title: "❓ Not found",
      description: `There's no help for \`${alvo}\`. Use \`${P}help\` for the index, or \`${P}help <group>\` (${lista}).`,
      colour: COR.aviso,
    }));
  }
}

// %ping — mede a latência entre o envio da mensagem e o processamento
export async function cmdPing(message, args, ctx) {
  const { sendEmbed, COR } = ctx;
  let latencia = null;
  try {
    const enviado = new Date(message.createdAt).getTime();
    if (!Number.isNaN(enviado)) latencia = Date.now() - enviado;
  } catch {}

  await sendEmbed(message.channel, tr(ctx, {
    title: "🏓 Pong!",
    description: latencia != null
      ? `Latência da mensagem: **${latencia}ms**`
      : "Bot online e respondendo.",
    colour: COR.sucesso,
  }, {
    title: "🏓 Pong!",
    description: latencia != null
      ? `Message latency: **${latencia}ms**`
      : "Bot online and responding.",
    colour: COR.sucesso,
  }));
}

// %sobre — informações resumidas do bot
export async function cmdSobre(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, estado, config, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  const comIA = (() => { try { return temIA(serverId); } catch { return false; } })();

  // conta comandos, linhas e uptime de forma resiliente
  const todasRotas = estado?.rotas ? new Set(Object.values(estado.rotas)) : null;
  // Comandos de IA não contam nos servidores onde a IA não roda: anunciar um
  // número que inclui o que a pessoa não pode usar é só ruído.
  const nComandos = todasRotas
    ? (comIA ? todasRotas.size : todasRotas.size - (estado?.COMANDOS_SO_IA?.size ?? 0))
    : null;
  const nLinhas = contarLinhas();
  const up = process.uptime();
  const dias = Math.floor(up / 86400);
  const horas = Math.floor((up % 86400) / 3600);
  const mins = Math.floor((up % 3600) / 60);
  const uptime = dias > 0 ? `${dias}d ${horas}h` : horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;

  // ── O que está LIGADO neste servidor ──
  // O &info antes listava os recursos do bot; agora diz o que vale aqui, que é
  // a pergunta real de quem digita o comando.
  const am = config?.automod ?? {};
  const modulosOn = ["antiSpam", "antiMassSpam", "antiInvite", "antiMassMention",
    "antiCaps", "antiLink", "antiScam", "antiCaracteres", "antiRepeticao"]
    .filter((k) => am[k]?.enabled).length;
  const xpOn = !!config?.xp?.enabled;
  const logOn = !!config?.log?.canalId;
  const rssN = (() => { try { return db.listarFeeds?.(serverId)?.length ?? 0; } catch { return 0; } })();
  const moedas = (() => { try { return db.listarMoedas?.(serverId) ?? []; } catch { return []; } })();
  const nPerfis = (() => { try { return PERFIS_MOEDA.PERFIS.length; } catch { return 0; } })();
  const nDupes = (() => { try { return db.moedasDuplicadas?.(serverId)?.length ?? 0; } catch { return 0; } })();
  const nPersonagens = (() => { try { return db.listarPersonagens?.(serverId, 9999)?.length ?? 0; } catch { return 0; } })();
  // Magias aprendidas no servidor inteiro: mostra se a mecânica pegou ou não.
  const nCapturados = (() => { try { return db.listarCapturados?.(serverId)?.length ?? 0; } catch { return 0; } })();
  const nMagias = (() => {
    try {
      return db.listarPersonagens(serverId, 9999)
        .reduce((t, x) => t + (db.listarMagias(serverId, x.userId)?.length ?? 0), 0);
    } catch { return 0; }
  })();
  const banGlobalModo = config?.banGlobal?.modo ?? "off";
  const idioma = en ? "English" : "Português";

  const sim = (v) => v ? "🟢" : "🔴";
  const estadoLinhas = en ? [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/9 modules on${am.antiScam?.enabled ? ` · sentinel ${am.antiScam.porAntiguidade !== false ? "(stricter with newcomers)" : "on"}` : ""}`,
    `⚖️ **Punishment** — \`${config?.automod?.punicao?.modo ?? "avisar"}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "en")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Leveling (XP)** — ${xpOn ? "on" : "off"}`,
    `${sim(logOn)} **Log channel** — ${logOn ? `<#${config.log.canalId}>` : "not set"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Global ban list** — mode \`${banGlobalModo}\``,
    `🎲 **RPG** — ${nPersonagens} character(s) · ${moedas.length} currenc${moedas.length === 1 ? "y" : "ies"}${moedas.length > 1 ? " · exchange on" : ""}${nMagias ? ` · ${nMagias} spell(s) learned` : ""}${nCapturados ? ` · ${nCapturados} companion(s) in the dungeon` : ""}${moedas.length < nPerfis ? ` · ${nPerfis} currency profiles available` : ""}${nDupes ? ` · ⚠️ ${nDupes} duplicate currenc${nDupes === 1 ? "y" : "ies"}` : ""}`,
    comIA ? `🤖 **AI (Judy)** — enabled on this server` : null,
  ] : [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/9 módulos ligados${am.antiScam?.enabled ? ` · sentinela ${am.antiScam.porAntiguidade !== false ? "(mais rígido com novatos)" : "ligado"}` : ""}`,
    `⚖️ **Punição** — \`${config?.automod?.punicao?.modo ?? "avisar"}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "pt")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Níveis (XP)** — ${xpOn ? "ligado" : "desligado"}`,
    `${sim(logOn)} **Chat de logs** — ${logOn ? `<#${config.log.canalId}>` : "não definido"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Lista global de bans** — modo \`${banGlobalModo}\``,
    `🎲 **RPG** — ${nPersonagens} personagem(ns) · ${moedas.length} moeda(s)${moedas.length > 1 ? " · câmbio ativo" : ""}${nMagias ? ` · ${nMagias} magia(s) aprendida(s)` : ""}${nCapturados ? ` · ${nCapturados} companheiro(s) na dungeon` : ""}${moedas.length < nPerfis ? ` · ${nPerfis} perfis de moeda disponíveis` : ""}${nDupes ? ` · ⚠️ ${nDupes} moeda(s) repetida(s)` : ""}`,
    comIA ? `🤖 **IA (Judy)** — habilitada neste servidor` : null,
  ];

  const creditos = "_Feito por <@01K9JKP85D5EP2ZTEHS8DT797A> (Ghiso#4419) com [stoat.js](https://github.com/stoatchat/javascript-client-sdk) — quer um bot assim no seu servidor? Chama! 🚀_";
  const creditosEN = "_Made by <@01K9JKP85D5EP2ZTEHS8DT797A> (Ghiso#4419) with [stoat.js](https://github.com/stoatchat/javascript-client-sdk) — want a bot like this on your server? Reach out! 🚀_";

  await sendEmbed(message.channel, en ? {
    title: "🤖 Cobaia",
    description: [
      "Moderation, automod and leveling bot for Stoat.",
      "",
      "**On this server**",
      ...estadoLinhas.filter(Boolean),
      "",
      "**The bot**",
      nComandos ? `**Commands available here:** ${nComandos}` : null,
      nLinhas ? `**Lines of code:** ${nLinhas.toLocaleString("en-US")}` : null,
      `**Uptime:** ${uptime}  ·  **Language:** ${idioma}`,
      "",
      `\`${PREFIXO}help\` — everything, grouped by what you want to do`,
      `\`${PREFIXO}tutorial\` — the paged first-steps guide`,
      `\`${PREFIXO}assistente\` — guided setup: I ask, you answer`,
      !comIA ? "_AI features (chat, AI moderation) run on a separate server._" : null,
      "",
      creditosEN,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  } : {
    title: "🤖 Cobaia",
    description: [
      "Bot de moderação, automod e níveis para o Stoat.",
      "",
      "**Neste servidor**",
      ...estadoLinhas.filter(Boolean),
      "",
      "**O bot**",
      nComandos ? `**Comandos disponíveis aqui:** ${nComandos}` : null,
      nLinhas ? `**Linhas de código:** ${nLinhas.toLocaleString("pt-BR")}` : null,
      `**No ar há:** ${uptime}  ·  **Idioma:** ${idioma}`,
      "",
      `\`${PREFIXO}help\` — tudo, agrupado pelo que você quer fazer`,
      `\`${PREFIXO}tutorial\` — o guia de primeiros passos, em páginas`,
      `\`${PREFIXO}assistente\` — configuração guiada: eu pergunto, você responde`,
      !comIA ? "_Os recursos de IA (chat, moderação por IA) rodam num servidor à parte._" : null,
      "",
      creditos,
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
  const lang = lingua(ctx);
  const targetId = message.mentionIds?.[0] ?? message.authorId;
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const desconhecido = lang === "en" ? "Unknown" : "Desconhecido";

  try {
    const server = await getServer(message);
    const member = (targetId === message.authorId && message.member)
      ? message.member
      : await server.fetchMember(targetId).catch(() => null);
    // Membro nulo = a pessoa SAIU do servidor (ou o ID não resolve como membro).
    // É exatamente quando um moderador mais precisa do histórico — então em vez
    // de cair no erro genérico, seguimos com o que dá: ID + histórico global.
    const user = member?.user ?? member ?? { id: targetId };

    const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString(locale) : desconhecido;
    const joinedAt  = member?.joinedAt
      ? new Date(member.joinedAt).toLocaleDateString(locale)
      : (member ? desconhecido : (lang === "en" ? "Not on this server" : "Não está no servidor"));
    const roles     = member?.roles?.map((r) => r.name ?? r).join(", ") || (lang === "en" ? "None" : "Nenhum");

    const linhas = lang === "en" ? [
      `**ID:** ${user.id ?? targetId}`,
      `**Account created:** ${createdAt}`,
      `**Joined the server:** ${joinedAt}`,
      `**Roles:** ${roles}`,
    ] : [
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

      linhas.push("", lang === "en" ? "**📋 Moderation history**" : "**📋 Histórico de moderação**");

      if (avisos > 0 || silenciado) {
        const partes = [];
        if (avisos > 0)  partes.push(lang === "en"
          ? `**${avisos}** warning(s) on this server`
          : `**${avisos}** aviso(s) neste servidor`);
        if (silenciado)  partes.push(lang === "en" ? "🔇 **silenced**" : "🔇 **silenciado**");
        linhas.push(partes.join(" · "));
      } else {
        linhas.push(lang === "en" ? "No warnings on this server. ✅" : "Sem avisos neste servidor. ✅");
      }

      if (outros.length) {
        linhas.push(
          "",
          lang === "en"
            ? `🌐 **Global list:** banned on **${outros.length}** other server(s).`
            : `🌐 **Lista global:** banido em **${outros.length}** outro(s) servidor(es).`,
          ...outros.slice(0, 3).map((b) =>
            `• \`${b.serverId}\` — ${b.motivo ?? (lang === "en" ? "_no reason_" : "_sem motivo_")} _(${new Date(b.criadoEm).toLocaleDateString(locale)})_`),
        );
        if (outros.length > 3) linhas.push(lang === "en"
          ? `_… and ${outros.length - 3} more. See \`${PREFIXO}banglobal historico ${targetId}\`._`
          : `_… e mais ${outros.length - 3}. Veja \`${PREFIXO}banglobal historico ${targetId}\`._`);
      } else {
        linhas.push("", lang === "en" ? "🌐 **Global list:** not listed. ✅" : "🌐 **Lista global:** não consta. ✅");
      }
    } catch (e) {
      console.error("[USERINFO][HIST]", e?.message);
    }

    await sendEmbed(message.channel, {
      title: `👤 ${user.username ?? user.name ?? (lang === "en" ? "User" : "Usuário")}`,
      colour: COR.info,
      description: linhas.join("\n"),
    });
  } catch (err) {
    console.error("[USERINFO]", err.message);
    await sendEmbed(message.channel, tr(ctx,
      { title: "❌ Erro", description: "Não foi possível buscar as informações.", colour: COR.erro },
      { title: "❌ Error", description: "Couldn't fetch the information.", colour: COR.erro }));
  }
}

// %kick @usuário [motivo]   (KickMembers)
export async function cmdKick(message, args, ctx) {
  const { client, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "KickMembers"))
    return negarPermissao(ctx, message.channel, "KickMembers");

  const { id: targetId, motivo } = extrairAlvo(message, args);
  const reason = motivo || (lang === "en" ? "No reason given" : "Sem motivo especificado");
  if (!targetId)
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Uso incorreto",
      description: `\`${PREFIXO}kick @usuário [motivo]\`\nVocê pode usar a menção ou o ID do usuário.`, colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: `\`${PREFIXO}kick @user [reason]\`\nYou can use the mention or the user's ID.`, colour: COR.erro,
    }));
  if (targetId === client.user.id)
    return sendEmbed(message.channel, tr(ctx,
      { description: "❌ Não posso me expulsar!", colour: COR.erro },
      { description: "❌ I can't kick myself!", colour: COR.erro }));

  try {
    await server.kickUser(targetId);
    await log.registrar(ctx, "punicoes", { titulo: "👢 Usuário expulso (manual)",
      descricao: `<@${targetId}> foi expulso por <@${message.authorId}>.\n**Motivo:** ${reason}` });
    await sendEmbed(message.channel, lang === "en" ? {
      title: "✅ Action executed: KICK",
      description: [
        `**User:** <@${targetId}> \`${targetId}\``,
        `**Action:** kicked from the server (can come back with a new invite)`,
        `**Reason:** ${motivo ? reason : "_(none given)_"}`,
        `**By:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    } : {
      title: "✅ Ação executada: EXPULSÃO",
      description: [
        `**Usuário:** <@${targetId}> \`${targetId}\``,
        `**Ação:** expulso do servidor (pode voltar com novo convite)`,
        `**Motivo:** ${motivo ? reason : "_(nenhum informado)_"}`,
        `**Por:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    });
    console.log(`[KICK] ${message.authorId} -> ${targetId} | ${reason}`);
  } catch (err) {
    console.error("[KICK]", err.message);
    await sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível expulsar",
      description: `**Usuário:** \`${targetId}\`\n**Erro:** ${err.message}\n\n_Verifique se o bot tem a permissão **KickMembers** e se o cargo dele está acima do alvo._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't kick",
      description: `**User:** \`${targetId}\`\n**Error:** ${err.message}\n\n_Check that the bot has **KickMembers** and that its role sits above the target's._`,
      colour: COR.erro,
    }));
  }
}

// %ban @usuário [motivo]   (BanMembers)
export async function cmdBan(message, args, ctx) {
  const { client, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "BanMembers"))
    return negarPermissao(ctx, message.channel, "BanMembers");

  const { id: targetId, motivo } = extrairAlvo(message, args);
  const reason = motivo || (lang === "en" ? "No reason given" : "Sem motivo especificado");
  if (!targetId)
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Uso incorreto",
      description: `\`${PREFIXO}ban @usuário [motivo]\`\nVocê pode usar a menção ou o ID do usuário.`, colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: `\`${PREFIXO}ban @user [reason]\`\nYou can use the mention or the user's ID.`, colour: COR.erro,
    }));
  if (targetId === client.user.id)
    return sendEmbed(message.channel, tr(ctx,
      { description: "❌ Não posso me banir!", colour: COR.erro },
      { description: "❌ I can't ban myself!", colour: COR.erro }));

  try {
    await server.banUser(targetId, { reason });
    // alimenta a lista global — com o nome, para a listagem ser legível depois
    await banGlobal.registrar(ctx, targetId, reason, "manual", {
      nome: ctx.client?.users?.get?.(targetId)?.username ?? null,
    });
    await log.registrar(ctx, "punicoes", { titulo: "🔨 Usuário banido (manual)",
      descricao: `<@${targetId}> foi banido por <@${message.authorId}>.\n**Motivo:** ${reason}` });
    await sendEmbed(message.channel, lang === "en" ? {
      title: "🔨 Action executed: BAN",
      description: [
        `**User:** <@${targetId}> \`${targetId}\``,
        `**Action:** permanently banned (can't come back)`,
        `**Reason:** ${motivo ? reason : "_(none given)_"}`,
        `**By:** <@${message.authorId}>`,
        `**Global list:** recorded 🌐`,
      ].join("\n"),
      colour: COR.erro,
    } : {
      title: "🔨 Ação executada: BANIMENTO",
      description: [
        `**Usuário:** <@${targetId}> \`${targetId}\``,
        `**Ação:** banido permanentemente (não pode voltar)`,
        `**Motivo:** ${motivo ? reason : "_(nenhum informado)_"}`,
        `**Por:** <@${message.authorId}>`,
        `**Lista global:** registrado 🌐`,
      ].join("\n"),
      colour: COR.erro,
    });
    console.log(`[BAN] ${message.authorId} -> ${targetId} | ${reason}`);
  } catch (err) {
    console.error("[BAN]", err.message);
    await sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível banir",
      description: `**Usuário:** \`${targetId}\`\n**Erro:** ${err.message}\n\n_Verifique se o bot tem a permissão **BanMembers** e se o cargo dele está acima do alvo._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't ban",
      description: `**User:** \`${targetId}\`\n**Error:** ${err.message}\n\n_Check that the bot has **BanMembers** and that its role sits above the target's._`,
      colour: COR.erro,
    }));
  }
}

// ── Helper interno de negação de permissão ─────────────────
function negarPermissao(ctx, channel, permName) {
  return ctx.sendEmbed(channel, tr(ctx, {
    title: "🚫 Permissão insuficiente",
    description: `Você precisa da permissão **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  }, {
    title: "🚫 Missing permission",
    description: `You need the **${permName}** permission to use this command.`,
    colour: ctx.COR.erro,
  }));
}
