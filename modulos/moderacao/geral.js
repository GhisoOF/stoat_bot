import { servidorPermitido as temIA, comandoIAPermitido } from "../ai/chat.js";
import * as visaoMod from "./visao.js";
import { arvoreSubtopicos, SUBTOPICOS_SO_IA, ligarFamilias, mesclarNos, MODIA_TAG } from "./help-arvore.js";
import { nomeExibido, normalizarArgs, SUB, citar, subExibido, marcarTraduzido, idDoNome } from "../core/aliases.js";
import { REGISTRO } from "../comandos/index.js";
import { grupos as gruposHelp, ALIAS_GRUPO, ORDEM as ORDEM_GRUPOS } from "./help-grupos.js";
import { secaoParametros } from "./help-parametros.js";
import { detalhesDoRegistro, COMANDOS_COM_AJUDA } from "../core/ajuda-registro.js";
import { URL_POLITICA } from "../ferramentas/privacidade.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";
import { escadaDePunicao, rotuloDegrau, GRUPOS_AUTOMOD, estadoDoGrupo, validadeDosAvisos } from "./automod-engine.js";
import { MUNDO } from "../game/mundo.js";
import { servidorNaLista } from "../core/env.js";
import { idEscrito } from "../core/ids.js";

// Comandos que só existem onde a IA roda (espelha a lista do main.js).
const COMANDOS_SO_IA = new Set(["chat", "modia"]);

import * as log from "../core/log.js";
import * as db  from "../core/db.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { descreverErro } from "../core/erros.js";
import { banir } from "../core/banir.js";

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
import { nomeModo } from "../core/nomes-automod.js";
import { podeAgirSobre } from "../core/hierarquia.js";

function extrairAlvo(message, args) {
  // 1) primeiro argumento: <@ID>, <ID> ou ID puro (ULID de 26 chars). Vem
  //    ANTES do mentionIds: numa resposta, o mentionIds pode trazer o autor da
  //    mensagem respondida — "&ban @Fulano" banía outra pessoa.
  const bruto = (args[0] ?? "").replace(/[<@#>!]/g, "");
  const ehUlid = /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(bruto);
  // 2) senão, a menção resolvida pela plataforma
  const id = ehUlid ? bruto.toUpperCase() : (message.mentionIds?.[0] ?? null);

  // Se o 1º arg era o alvo (menção ou ID), o motivo é o resto
  const primeiroEraAlvo = ehUlid || (args[0] ?? "").includes("@");
  const resto = primeiroEraAlvo ? args.slice(1) : args;
  return { id, motivo: resto.join(" ").trim() };
}

export function construirDetalhes(P, lang = "pt", idioma = lang) {
  // os comandos já migrados (fase 3) têm a página no registro, e ela vence —
  // e só ela já tem espanhol (`idioma` "es"; as outras saem em inglês)
  return { ...(lang === "en" ? detalhesEN(P) : detalhesPT(P)), ...detalhesDoRegistro(P, idioma) };
}

function detalhesPT(P) {
  return {
    cor: {
      uso: `${P}cor <cargo> <cor|gradiente|preset>`,
      desc: "Customiza a cor dos cargos — inclusive com **gradiente**, que o cliente do Stoat não oferece na interface.\n\n**Sólida:** `&cor VIP #FF00AA` ou `&cor VIP roxo`\n**Gradiente:** `&cor VIP gradiente #FF0000 #0000FF` (aceita 2+ cores; um número no início vira o ângulo)\n**Pronto:** `&cor VIP preset vaporwave` — veja todos com `&cor presets`\n**Automático:** `&cor painel aqui` — cria os cargos, publica a mensagem de escolha (mencionando os cargos), reage com os emojis, liga os cargos por reação e ativa o modo exclusivo. Tudo num comando. Vêm 10 cores sólidas e 20 gradientes (`&cor painel aqui solidas` ou `gradientes` para só um grupo).\n**Só os cargos:** `&cor criar` — cria/pinta sem publicar nada\n**CSS na mão:** `&cor VIP linear-gradient(90deg, #f00 0%, #00f 100%)`\n**Limpar:** `&cor VIP remover` · **Ver:** `&cor lista`\n\nO cargo pode ser pelo nome (mesmo parcial) ou pelo ID. O cargo do bot precisa de **ManageRole** e estar **acima** do cargo editado.",
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
    servidores: {
      uso: `${P}servidores [relatorio …]`,
      desc: "**Só o dono do bot** (fora do índice). Duas coisas:\n\n"
        + "`&servidores` — onde o bot está: cada servidor com membros e ritmo de mensagens por minuto.\n\n"
        + "`&servidores relatorio` — um **relatório por hora** num canal seu: o que o log de moderação registrou em todos os servidores, raids, imagens, reinícios (com a causa), erros agrupados e os assuntos mais comentados. "
        + "Números vêm do código; o modelo só escreve destaques, assuntos e a leitura dos erros. Detalhes: `&help servidores relatorio`.",
      perm: null,
      ex: `${P}servidores relatorio canal aqui`,
    },
    acesso: {
      uso: `${P}acesso <cargo|canal|staffignora|livre|status>`,
      desc: "Define **quem** pode usar os comandos e **onde**.\n\n**Cargos de staff** — quem tiver um deles usa os comandos de moderação mesmo sem a permissão nativa do Stoat:\n`&acesso cargo add <@cargo>` · `&acesso cargo remove <@cargo>` · `&acesso cargo limpar`\n\n**Canais** — onde os comandos funcionam:\n`&acesso canal todos` — em qualquer canal\n`&acesso canal somente` — só nos da lista\n`&acesso canal exceto` — em todos, menos os da lista\n`&acesso canal add|remove [#canal]` — mexe na lista\n\n`&acesso staffignora on|off` — se o staff escapa da restrição de canal (padrão: sim)\n`&acesso livre <comando> on|off` — o comando vale em qualquer canal (ex.: `&acesso livre entretenimento on` para os jogos)\n\n_`&acesso`, `&debug`, `&help` e `&tutorial` funcionam sempre, para você não se trancar fora._",
      perm: "ManagePermissions",
      ex: `${P}acesso canal somente`,
    },
    automod: {
      uso: `${P}automod [status] | ${P}automod on|off | ${P}automod <grupo> [parte] <on|off> | ${P}automod <grupo> punicao <modo>`,
      desc: "A moderação automática em **quatro grupos**, cada um com partes que dá para ajustar uma a uma:\n\n"
        + "🌊 `antispam` — enxurrada: `velocidade`, `rajada`, `repeticao` (a mesma mensagem ou imagem), `midia` (anexos por minuto), `mencoes`\n"
        + "🔊 `antiruido` — texto poluído: `caps`, `caracteres` (zalgo, invisíveis), `letras` (kkkkkk…), `emoji`\n"
        + "🔗 `antilink` — `dominios` (lista de bloqueio) e `convites`\n"
        + "🛡️ `sentinela` — conteúdo nocivo: `conteudo` (golpe, +18, gore, ilícito), `odio` (ofensas), `imagens` (modelo de visão)\n\n"
        + "**Exemplos prontos:** `&automod off` desliga **tudo** · `&automod antispam on` liga um grupo · `&automod antiruido caps off` desliga só uma parte. _Servidor novo começa com tudo desligado._\n\n"
        + "`&automod <grupo>` mostra as partes e os números · `&automod <grupo> on|off` liga/desliga o grupo · `&automod <grupo> <parte> on|off` só uma parte · `&automod <grupo> set <parâmetro> <valor>` · `&automod <grupo> punicao <modo>`\n\n"
        + "Também: `&automod blocklist`, `&automod whitelist`, `&automod punicao` (a escada geral). Os nomes antigos (`anticaps`, `antiinvite`…) continuam valendo.",
      perm: "ManagePermissions", ex: `${P}automod antispam`,
    },

    banglobal: {
      uso: `${P}banglobal <off|avisar|imediato|consenso|lista|revisar|varrer|isentar|desfazer|historico|esquecer>`,
      desc: "Lista global de banimentos compartilhada entre os servidores onde o bot está.\n\n`off` — ignora · `avisar` — alerta os moderadores\n`imediato` — bane **ao entrar** quem foi banido em **qualquer** outro servidor\n`consenso` — bane só quem foi banido em **3+ servidores diferentes**; com menos, avisa a staff _(o mais seguro)_\n_(`banir`, o nome antigo, vale como `imediato`)_\n\n**Ver quem está na lista**\n`&banglobal lista` — todo mundo, em páginas · `&banglobal lista servidor` — só os deste servidor\n`&banglobal historico <@pessoa>` — onde e por que aquela pessoa foi banida\n\n**Quem já está no servidor**\n`&banglobal revisar` — confere e **só mostra**. Nunca bane.\n`&banglobal varrer` — mostra e **espera confirmação** · `&banglobal varrer confirmar` — ⚠️ bane\n\n**Quando a lista erra**\n`&banglobal isentar <@pessoa>` — aceita a pessoa **aqui** apesar da lista (e desfaz o ban dela, se foi o bot que aplicou)\n`&banglobal isentos` — quem está isento · `&banglobal desfazer` — ↩️ reverte os bans que a lista aplicou aqui\n`&banglobal esquecer <@pessoa>` — apaga o registro **para todos os servidores**\n\n**Pôr alguém na lista pelo ID** _(dono do bot)_\n`&banglobal add <id> [id…] [motivo]` — vale mesmo para quem não está em nenhum servidor da Judy; quem já está num deles sente na hora (banido no modo `banir`, aviso no `avisar`)\n\n**A contribuição é automática e permanente.** Os bans deste servidor — os antigos e os novos — alimentam a lista sozinhos, sem comando e sem chave para desligar. O modo acima decide só se este servidor **se aproveita** da lista: dá para não usar, não dá para usar sem alimentar.",
      perm: "BanMembers",
      ex: `${P}banglobal revisar`,
    },
    game: {
      uso: `${P}game [criar|ficha|pontos|top|apagar]`,
      desc: "RPG — um mundo só, o mesmo em todos os servidores: 10 dificuldades × 10 níveis (do Humano ao Hiperversal), armas com dano e escala, bioware e cyberware, companheiros, contratos, dungeons e chefes.\n\n`&game criar [nome]` — cria seu personagem (com kit inicial e dois companheiros)\n`&game` — sua ficha · `&game ficha @pessoa` — a de outro\n`&game pontos <atributo> [quantos]` — distribui pontos (aceita abreviação: for, int, sor…)\n`&game classe` · `&game evoluir` — escolhe uma classe e o bot gasta os pontos e equipa por você\n\n`&game contratos` — o quadro da guilda (paga o banco) · `&game contrato <nome>` — parte\n`&game dungeons` · `&game dungeon <nome> [chefe]` — mundo aberto (paga o tesouro dela)\n`&game chefes` · `&game especiais` — recompensas únicas, uma vez por pessoa\n`&game coop abrir <…>` — em grupo, até 4 · `&game historia` — sua última história\n\n`&game itens [tipo]` · `&game equipar <item> [mao1|mao2]` · `&game usar <contrato|pergaminho>` · `&game desequipar <vaga>`\n`&game catalogo [raridade] [tipo]` · `&game item <nome>` · `&game comprar [raridade] [tipo]` · `&game vender <item>`\n`&game magias` · `&game aprender <nome>` — o grimório (pede Inteligência)\n`&game followers` · `&game follower ficha <nome>` · `&game follower levar <nome>` · `&game recrutas` · `&game contratar [nome]` · `&game descansar`\n`&game carteira` · `&game mercado` · `&game cambio` · `&game trocar @pessoa <item> por <item>`\n`&game top` — ranking do mundo · `&game apagar confirmar` — recomeça do zero\n\n_Dono do bot: `&game admin` tem as ferramentas de teste._\n\n**Atributos:** Força, Destreza, Resistência, Agilidade, Vida, Mana, Inteligência, Sorte, Carisma.\n\n_A missão paga a força dela, igual para todos: um êxito no seu nível vale 80% de um nível; falhar não paga nada._\n\n⚠️ Não confundir com `&xp`, que é o sistema de níveis por mensagem.",
      perm: null,
      ex: `${P}game criar Kael`,
    },
    xp: {
      uso: `${P}xp [rank|top|sair|entrar|setup|cargos|criarcargos|sincronizar|on|off]`,
      desc: "Sistema de níveis por XP de mensagens. Cada mensagem dá XP (com cooldown), e ao juntar XP você sobe de nível. A cada N níveis pode ganhar um cargo, e os anteriores continuam — eles se acumulam.\n\n`top` mostra o ranking · `setup` configura dificuldade, nível máximo e intervalo de cargos.\n\n**Cada membro escolhe:** ao ligar o XP, a Judy avisa o servidor; `sair` apaga o seu XP e ele para de contar, `entrar` volta (do zero).\n\n**Quem sai perde os cargos, não o XP.** Cargo é do membro: quem sai deixa de ser membro e o Stoat os retira. O XP fica guardado. Quem **entra** recebe os cargos de volta sozinho; para quem já tinha voltado antes disso, `&xp sincronizar [@pessoa]` devolve tudo que o nível atual garante _(veja `&help xp sincronizar`)_.\n\n(XP por call não é suportado pelo Stoat.)",
      perm: "ManagePermissions (para configurar)", ex: `${P}xp top`,
    },
    rss: {
      uso: `${P}rss [add|remove|list|canal|agora]`,
      desc: "Curadoria de notícias por RSS, com resumo da Judy. `add <url>` cadastra um feed, `canal aqui` define o destino, `list` mostra os feeds, `remove <url|n>` remove, `agora` força um ciclo. A cada hora a Judy posta um resumo geral no tom dela e depois os itens novos (título, feed, horário, link).",
      perm: "ManagePermissions", ex: `${P}rss add https://exemplo.com/feed.xml`,
    },
    servidor: {
      uso: `${P}servidor [regras|cargos|canais|faq]`,
      desc: "O **servidor em que você está**: dono, criação, membros e descrição — e, dentro da família:\n\n"
        + "`regras` — as regras: o texto que a staff definir ou, sem ele, o canal **regras/rules** lido sozinho\n"
        + "`cargos` — do mais alto ao mais baixo, com quantos têm cada um\n"
        + "`canais` — por categoria, com a descrição de cada um\n"
        + "`faq` — avisos e perguntas frequentes da staff (`faq <número>` abre um)\n\n"
        + "**Staff** *(ManagePermissions)*: `regras definir <texto>` (várias linhas) · `regras canal #canal|auto` · `regras limpar` · `faq add <título> | <texto>` · `faq remover <n>` · `faq limpar`\n\n"
        + "A equipe fica em `&staff`. E dá para **perguntar à Judy**: \"quais são as regras?\", \"quem é da staff?\", \"em que canal posso divulgar?\" — ela responde com estes dados, não de cabeça.",
      perm: "todo mundo (mudar: ManagePermissions)", ex: `${P}servidor regras`,
    },
    staff: {
      uso: `${P}staff [add|remove|titulo|limpar]`,
      desc: "Mostra a **equipe do servidor**: o dono, os cargos marcados aqui, o cargo de equipe dos tickets e os cargos com permissão de moderar (banir, expulsar, silenciar, apagar mensagens, gerenciar o servidor) — com quem tem cada um, sem bots.\n\nOs cargos marcados não têm cadastro próprio: são os mesmos do `&acesso cargo`. Então adicionar aqui **também dá acesso aos comandos de moderação** — e remover tira os dois de uma vez, sem o quadro de avisos discordar da permissão real.\n\n`&staff add <@cargo>` · `&staff remove <@cargo>` · `&staff limpar`\n`&staff titulo <@cargo> <texto>` — rótulo exibido no lugar do nome do cargo\n\n_Consultar é público; mexer exige ManagePermissions._",
      perm: "ManagePermissions", ex: `${P}staff add Moderador`,
    },
    economia: {
      uso: `${P}economia [minerar|saldo|top|loja|comprar|pagar]`,
      desc: "A **moeda do servidor** — à parte do RPG, uma moeda só por servidor.\n\n"
        + "`&economia minerar` — ganha um punhado, com espera entre uma e outra\n"
        + "`&economia saldo [@pessoa]` · `&economia top` — quem tem mais\n"
        + "`&economia loja` · `&economia comprar <cargo>` — cargos à venda (só cobra se o cargo for entregue)\n"
        + "`&economia pagar @pessoa <quantia>`\n\n"
        + "**Staff** _(ManageServer)_\n"
        + "`&economia config nome <nome>` · `simbolo <emoji>` · `ganho <mín> <máx>` · `intervalo <tempo>`\n"
        + "`&economia loja add <cargo> <preço>` · `&economia loja remover <cargo>`\n"
        + "`&economia dar|tirar @pessoa <quantia>` · `&economia zerar confirmar`\n\n"
        + "_O bot só entrega cargos que estão abaixo do cargo dele._",
      ex: `${P}economia minerar`,
    },
    entretenimento: {
      uso: `${P}entretenimento <ship|briga|cowsay|bola8|escolher|nota|sorte|zoeira|inverter|campominado|velha>`,
      desc: "A família das **brincadeiras**. Cada uma mora aqui dentro:\n\n"
        + "`ship @a @b` — quantos % combinam (o mesmo par dá sempre o mesmo %), com o nome do casal\n"
        + "`briga @a @b` — quem ganha numa briga, rodada por rodada, com crítico e erro\n"
        + "`cowsay [bicho] [pensa] <texto>` — um bicho em ASCII falando (ou pensando) o texto · `cowsay figuras` lista os bichos\n"
        + "`bola8 <pergunta>` — a bola mágica responde\n"
        + "`escolher a | b | c` — escolho uma (também vale `a, b ou c`)\n"
        + "`nota <coisa>` — nota de 0 a 10, fixa para a mesma coisa\n"
        + "`sorte` — a sua sorte do dia, com número da sorte\n"
        + "`zoeira <texto>` · `inverter <texto>` — tExTo De ZoEiRa · texto ao contrário\n"
        + "`campominado [facil|medio|dificil]` — campo minado de spoilers\n"
        + "`velha [@pessoa]` — jogo da velha por reação (sem ninguém, contra a Judy)\n\n"
        + "Com **uma** pessoa só, o outro lado é você. Coisas também valem: `ship pizza e abacaxi`, `briga Goku x Superman`.\n"
        + "_Ninguém é mencionado nas respostas: os nomes saem em texto, sem notificar._",
      perm: "todo mundo", ex: `${P}entretenimento ship @Ana @Bia`,
    },
    ticket: {
      uso: `${P}ticket [painel <#canal>|categorias|log <#canal>|lista|equipe]`,
      desc: "Suporte com canal privado por pedido, **por reação**:\n\n"
        + "`painel <#canal>` — posta no canal escolhido uma mensagem com uma reação por assunto (🎫 Suporte, 🚨 Denúncia, 💡 Sugestão). **Reagiu = abriu**: nasce o canal **#ticket-N**, que só quem abriu e a staff do `&acesso` enxergam\n"
        + "Dentro do ticket, 🔒 **fecha — só a staff**: a conversa **trava** (quem abriu lê, mas não escreve mais) e o registro inteiro vai para o log como **arquivo .txt**. Depois, 🗑️ (staff) apaga o canal\n\n"
        + "`categorias 🎫 Suporte | 🚨 Denúncia` — troca os assuntos (poste o painel de novo)\n"
        + "`log <#canal>` — para onde vão os registros (obrigatório) · `lista` — os abertos\n"
        + "`equipe` — confere se a **staff entra em todo ticket** (cargos do `&acesso` + quem tem Gerenciar canais). O Stoat não deixa a Judy pôr no ticket um cargo **acima** do dela. **O jeito certo:** em Configurações do servidor → Cargos, arraste o cargo da Judy para cima dos cargos da staff. Ou dê a esses cargos, nas permissões do servidor, *Ver canal + Ler histórico + Enviar mensagens*. Ou use o cargo **Equipe de tickets** que o `equipe` cria (um admin dá à mão a quem está acima da Judy). O `painel` já faz essa conferência\n"
        + "_Digitando também dá: `abrir [motivo]`, `fechar [nota]`, `apagar`._\n\n"
        + "O bot precisa de **ManageChannel, ManageRole, AssignRoles, ManagePermissions** e **ManageMessages** (para limpar as reações).",
      perm: "reagir/abrir: todo mundo · resto: staff", ex: `${P}ticket painel #suporte`,
    },

    musica: {
      uso: `${P}musica <link ou nome> | [pausar|play|skip|fila|parar|volume <0-200>|loop <faixa|fila|nao>]`,
      desc: "Música nas calls — **YouTube, SoundCloud e Spotify**, com fila por canal.\n\n_A máquina toca até `MUSICA_MAX_SIMULTANEAS` músicas ao mesmo tempo (padrão 3); no limite, o servidor do dono do bot tem a vez._\n\n**O básico:**\n`&entrar` — de qualquer canal, estando numa call: ela vai até você (ou `&entrar call 1`). O `&musica` funciona de qualquer canal e, se ela não estiver em call, entra na sua\n`&musica <link ou nome>` — toca; com som rolando, entra na fila\n`&musica pausar` · `&musica play` — pausa e retoma\n`&musica skip` — próxima · `&musica fila` — a lista atual\n`&musica parar` — para e limpa a fila · `&sair` — ela sai da call\n\n**Ajustes:** `&musica volume 80` (0 a 200%) · `&musica loop faixa|fila|nao`\n\n**Fontes:** link ou playlist do YouTube/SoundCloud, busca por texto, e faixa do Spotify (sem chave). Playlist/álbum do Spotify pede `SPOTIFY_ID`/`SPOTIFY_SECRET` no `.env` de quem hospeda o bot.\n\n**Quando um vídeo não toca** (restrição de idade, indisponível, bloqueado na região): ela procura **outra versão** da mesma música (outro upload no YouTube, depois o SoundCloud) e diz qual tocou; se nenhuma der, diz o motivo — e `&musica fila` mostra a última que falhou.\n\n**Com o TTS na mesma call:** a música **abaixa sozinha** enquanto a fala sai e volta ao volume normal depois (ducking).\n\n_Aliases: `&m` · `&play` · `&tocar`._",
      perm: "todo mundo", ex: `${P}musica tocar never gonna give you up`,
    },
    entrar: {
      uso: `${P}entrar`,
      desc: "Traz a Judy para a call e ela passa a falar **tudo que for escrito ali**. Lá dentro, **o leitor (TTS) e a música usam a mesma conexão**: dá para mandar `&musica` e ela continua lendo o chat.\n\n**Vários servidores ao mesmo tempo:** ela fica numa call por servidor — chamar em outro servidor não a tira desta. No mesmo servidor, `&entrar` em outra call troca de call.\n\n**Como ela escolhe a call**\n1. o canal onde você digitou, se for uma call _(o caso normal)_\n2. a que já estiver configurada\n3. a única call do servidor, se houver só uma\n\nHavendo mais de uma e nenhuma pista, ela **pergunta** em vez de chutar. Estando em outra call, sai de lá e vem para a sua.\n\nVale para **todo mundo**, não só para a equipe. Ajustes da fala: `&help tts`.",
      ex: `${P}entrar`,
    },
    sair: {
      uso: `${P}sair`,
      desc: "Tira a Judy da call: para de ler o chat e para a música.",
      ex: `${P}sair`,
    },
    tts: {
      uso: `${P}tts <texto> | [estado|filtro|dicionario|voz|efeito|tom|nomes|cooldown|reiniciar]`,
      desc: "A Judy **fala nas calls**. Alguém escreve, ela lê em voz alta.\n\n**Entrar e sair é com** `&entrar` **e** `&sair` — de **qualquer canal**: ela entra na call em que você está (ou na que você disser: `&entrar call 1`) e passa a falar **tudo que for escrito no canal onde você digitou** — dá para usar um canal só para isso, como #call-sem-mic\n\nO `entrar` liga o sistema, escolhe a call e liga a leitura sozinho — antes isso eram quatro comandos na ordem certa.\n\n`&tts <texto>` — falar uma frase específica · `&tts estado` — está tudo de pé?\n_Estes valem para **todo mundo**, não só para a equipe._\n\n**Ajustes** _(ver é livre; mudar é ManageMessages)_\n`&tts nomes off` — para de anunciar \"Fulano disse:\"\n`&tts cooldown <s>` — freio entre falas da mesma pessoa (0 desliga)\n`&tts filtro` — a **peneira**: ignora repetição, parede de texto e barulho, e limita as falas por minuto no canal _(`&help tts filtro`)_\n\n**Quando algo trava**\n`&tts reiniciar` — destrava o serviço de voz sem ir ao terminal _(ManageMessages)_. Depois de `&sair`, a transmissão **não** traz a Judy de volta: só `&entrar`. _(`&help tts problemas`)_\n\n**Dicionário** — a escrita de chat vira fala compreensível\n`vc n vai vir hj pq?` sai como `você não vai vir hoje porque?`\n`&tts dicionario` — vê o que está valendo\n`&tts dicionario add <abrev> <texto>` — entrada própria do servidor\n`&tts dicionario padrao off` — desliga as 114 abreviações embutidas\n\n**Voz e timbre**\n`&tts voz [nome]` — troca a voz do Piper (faber masculina, dii feminina)\n`&tts efeito [nome]` — `feminina`, `sedutora`, `suave`, `glados`, `robo`, `radio`…\n`&tts tom <n>` — altura da voz, **separada** do efeito (1.0 = original)\n_Sobe tom **e formantes** juntos: voz masculina vira feminina de verdade. Se a voz base já é feminina, mexa pouco — acima de 1.05 soa infantil._\n_Os efeitos mudam só o **caráter** e não tocam no tom, então soam igual sobre qualquer voz._\n_Não existe voz GLaDOS em português; o efeito recria o **processamento** dela sobre a voz que você já usa._\n\n_Dentro dos canais de voz configurados, o `&tts` funciona para **todos**, mesmo com restrição de canal ligada._\n_A síntese é **offline**, no computador do dono (Piper)._",
      perm: "ManageMessages (só para configurar)", ex: `${P}entrar`,
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
    chat: {
      uso: `${P}chat <mensagem>`,
      desc: "Conversa com a IA local (a Judy). Quando você pergunta algo do mundo, ela pesquisa na internet antes de responder (os links só aparecem quando você pede a busca: \"pesquisa…\", \"procura na internet…\"), faz contas exatas, lê o próprio código, lembra de quem **aceitou** que ela lembre (ela pergunta na primeira conversa; `" + citar("privacidade", "pt", P) + "`) e adapta o tom a cada pessoa. Também vê imagens que você anexar.\n\n**Subcomandos:**\n`&chat status` — se o serviço de IA está no ar\n`&chat perfil` — o que a Judy sabe sobre você\n`&chat mapear` — captura a bio/status do seu cartão\n`&chat cuidado [@user] on|off` — trata a pessoa com gentileza extra (opt-in)\n`&chat esquecer` — apaga tudo que a Judy sabe de você\n`&chat esquecer tudo` — zera a memória do servidor *(ManageServer)*\n`&chat livre on|off|modo` — a Judy participa sozinha do canal *(ManagePermissions)*\n`&chat comentar aqui|off|pordia <n>` — comentários por iniciativa *(ManagePermissions)*\n\nQuando responde alguém, mantém o papo fluido por um tempo. Se ela já estiver respondendo outra pessoa, você entra na **fila** (vê a posição) e é atendido na ordem. Conta escrita na mensagem (`263857 * 3`) vai sempre para a calculadora, nunca de cabeça.",
      perm: null, ex: `${P}chat status`,
    },
    modia: {
      uso: `${P}modia <on|off|criterios|canal|status|limpar>`,
      desc: "Moderação por IA na conversa. Você escreve os CRITÉRIOS em texto livre e a Judy avalia cada mensagem; se violar, ela APAGA e te marca no #log com o conteúdo e as opções (avisar/silenciar/banir) já com o comando pronto. Ela nunca bane sozinha — a decisão é sua. O dono do bot é imune.\n\n`&modia criterios <texto>` — define o que moderar\n`&modia on|off` — liga/desliga\n`&modia canal add|remove` — limita a canais (sem isso, vale em todos)\n`&modia limpar` — zera tudo",
      perm: "ManageServer", ex: `${P}modia criterios Apague divulgacao de outros servidores e ataques pessoais`,
    },
    debug: {
      uso: `${P}debug [@pessoa | #canal]`,
      desc: "O diagnóstico do bot neste servidor, numa mensagem só.\n\n`&debug` — **o relatório completo**: primeiro o que está quebrado e como resolver; depois permissões do bot, hierarquia de cargos, canais configurados, todos os canais, moderação, voz e IA (e os erros recentes, para o dono do bot)\n`&debug @pessoa` — o que o bot consegue fazer com essa pessoa: punir, silenciar, dar os cargos de nível\n`&debug #canal` — a conta de permissão do bot nesse canal, cargo por cargo (aceita o nome do canal)\n\n`&help debug ler` explica os ícones.",
      perm: "ManagePermissions",
      ex: `${P}debug`,
    },
    reactionrole: {
      uso: `${P}reactionrole <add|remove|list>`,
      desc: "Cargos por reação: quem reagir com o emoji ganha o cargo; quem tirar a reação perde.\n\n`&reactionrole add <mensagem> <emoji> <idCargo>`\n`&reactionrole remove <mensagem>` — remove as regras daquela mensagem\n`&reactionrole exclusivo <mensagem> on|off` — **on**: escolher um emoji troca o cargo anterior (ex.: cor); **off**: acumula (ex.: interesses)\n`&reactionrole recarregar` — se os cargos pararem de ser entregues após um restart\n`&reactionrole list` — regras deste servidor\n\n**A mensagem** pode ser o **ID** ou o **link** dela (menu `...` → *Copiar link*) — os dois funcionam.\n**O cargo** pode ser **mencionado** (`<%Cargo>`) ou o ID (Configurações → Cargos → *Copy role ID*).\n\nO bot precisa de `React`, `ViewChannel`, `ReadMessageHistory` e **AssignRoles**, e o cargo dele deve estar acima do cargo entregue.",
      perm: "ManageRole",
      ex: `${P}reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
    },
  };
}

function detalhesEN(P) {
  return {
    cor: {
      uso: `${P}cor <role> <color|gradient|preset>`,
      desc: "Customizes role colors — including **gradients**, which the Stoat client doesn't offer in its UI.\n\n**Solid:** `&cor VIP #FF00AA` or `&cor VIP purple`\n**Gradient:** `&cor VIP gradiente #FF0000 #0000FF` (2+ colors; a leading number sets the angle)\n**Preset:** `&cor VIP preset vaporwave` — see them all with `&cor presets`\n**Automatic:** `&cor painel aqui` — creates the roles, posts the picker message (mentioning the roles), adds the emoji reactions, wires up reaction roles and enables exclusive mode. All in one command. It brings 10 solid colors and 20 gradients (`&cor painel aqui solid` or `gradients` for only one group).\n**Roles only:** `&cor criar` — creates/paints without posting anything\n**Raw CSS:** `&cor VIP linear-gradient(90deg, #f00 0%, #00f 100%)`\n**Clear:** `&cor VIP remover` · **View:** `&cor lista`\n\nThe role can be given by name (even partial) or by ID. The bot's role needs **ManageRole** and must sit **above** the edited role.",
      perm: "ManageRole",
      ex: `${P}cor VIP gradiente #FF71CE #01CDFE #05FFA1`,
    },
    tutorial: {
      uso: `${P}tutorial [page|area]`,
      desc: "First-steps guide **in pages** — react ◀ ▶ to turn. It changes nothing by itself: it shows the path and the exact command for each step.\n\n`&tutorial` — the guide (6 pages): permissions → channels → protection → welcome and roles → XP and RPG → checklist\n`&tutorial 2` — opens page 2 directly\n`&tutorial <area>` — goes deeper on one subject (e.g. `&tutorial canais`, `&tutorial game`)\n\nWould you rather have the bot ask and configure for you? `&assistente`.\n\nAlso answers to **guide** and **start**.",
      perm: null,
      ex: `${P}tutorial canais`,
    },
    assistente: {
      uso: `${P}assistente [rapido|completo|canais|protecao|cancelar]`,
      desc: "**Guided** setup: the bot asks one question at a time, you answer in plain text, and at the end it shows a summary and applies everything — using the same commands you would type by hand (and shows which ones, so you learn them).\n\n`&assistente` — menu\n`&assistente rapido` — language, staff, log, protection, welcome (~2 min)\n`&assistente completo` — quick + punishment ladder, global list, XP, autorole\n`&assistente canais` — sorts your channels into the 3 types and tells you what to click in Stoat\n`&assistente protecao` — only automod, sentinel and punishment\n\nDuring the questions: `skip` skips, `back` goes back, `cancel` quits. Each person has their own; it expires after 10 min without an answer.",
      perm: "ManagePermissions",
      ex: `${P}assistente rapido`,
    },
    servidores: {
      uso: `${P}servidores [report …]`,
      desc: "**Bot owner only** (not in the index). Two things:\n\n"
        + "`&servidores` — where the bot is: each server with members and message rate per minute.\n\n"
        + "`&servidores relatorio` — an **hourly report** in a channel of yours: what the moderation log recorded across all servers, raids, images, restarts (with the cause), grouped errors and the most discussed topics. "
        + "Numbers come from the code; the model only writes highlights, topics and the reading of the errors. Details: `&help servidores relatorio`.",
      perm: null,
      ex: `${P}servidores relatorio canal aqui`,
    },
    acesso: {
      uso: `${P}acesso <cargo|canal|staffignora|livre|status>`,
      desc: "Defines **who** can use the commands and **where**.\n\n**Staff roles** — anyone holding one can use the moderation commands even without the native Stoat permission:\n`&acesso cargo add <@role>` · `&acesso cargo remove <@role>` · `&acesso cargo limpar`\n\n**Channels** — where commands work:\n`&acesso canal todos` — in any channel\n`&acesso canal somente` — only in the listed ones\n`&acesso canal exceto` — everywhere except the listed ones\n`&acesso canal add|remove [#channel]` — edits the list\n\n`&acesso staffignora on|off` — whether staff bypasses the channel restriction (default: yes)\n`&acesso livre <command> on|off` — the command works in any channel (e.g. `&acesso livre entertainment on` for the games)\n\n_`&acesso`, `&debug`, `&help` and `&tutorial` always work, so you can't lock yourself out._",
      perm: "ManagePermissions",
      ex: `${P}acesso canal somente`,
    },
    automod: {
      uso: `${P}automod [status] | ${P}automod on|off | ${P}automod <group> [part] <on|off> | ${P}automod <group> punicao <mode>`,
      desc: "Automatic moderation in **four groups**, each with parts you can tune one by one:\n\n"
        + "🌊 `antispam` — floods: `velocidade`, `rajada`, `repeticao` (the same message or image), `midia` (attachments per minute), `mencoes`\n"
        + "🔊 `antiruido` — noisy text: `caps`, `caracteres` (zalgo, invisible), `letras` (dragged-out letters), `emoji`\n"
        + "🔗 `antilink` — `dominios` (blocklist) and `convites`\n"
        + "🛡️ `sentinela` — harmful content: `conteudo` (scams, NSFW, gore, illicit), `odio` (slurs), `imagens` (vision model)\n\n"
        + "**Ready-made examples:** `&automod off` turns **everything** off · `&automod antispam on` turns a group on · `&automod antiruido caps off` turns off just one part. _A new server starts with everything off._\n\n"
        + "`&automod <group>` shows the parts and numbers · `&automod <group> on|off` toggles the group · `&automod <group> <part> on|off` one part only · `&automod <group> set <parameter> <value>` · `&automod <group> punicao <mode>`\n\n"
        + "Also: `&automod blocklist`, `&automod whitelist`, `&automod punicao` (the overall ladder). The old names (`anticaps`, `antiinvite`…) still work.",
      perm: "ManagePermissions", ex: `${P}automod antispam`,
    },

    banglobal: {
      uso: `${P}banglobal <off|avisar|imediato|consenso|lista|revisar|varrer|isentar|desfazer|historico|esquecer>`,
      desc: "Global ban list shared across every server the bot is in.\n\n`off` — ignore · `avisar` — alert the moderators\n`imediato` — bans **on join** anyone banned on **any** other server\n`consenso` — bans only people banned on **3+ different servers**; with fewer, alerts the staff _(the safest)_\n_(`banir`, the old name, works as `imediato`)_\n\n**Seeing who's listed**\n`&banglobal lista` — everyone, in pages · `&banglobal lista servidor` — only this server's\n`&banglobal historico <@user>` — where and why that person was banned\n\n**People already in the server**\n`&banglobal revisar` — checks and **shows only**. Never bans.\n`&banglobal varrer` — shows and **waits for confirmation** · `&banglobal varrer confirmar` — ⚠️ bans\n\n**When the list gets it wrong**\n`&banglobal isentar <@user>` — accepts that person **here** despite the list (and undoes their ban, if the bot applied it)\n`&banglobal isentos` — who's exempt · `&banglobal desfazer` — ↩️ reverts the bans the list applied here\n`&banglobal esquecer <@user>` — deletes the record **for every server**\n\n**Putting someone on the list by ID** _(bot owner)_\n`&banglobal add <id> [id…] [reason]` — works even for people in none of Judy's servers; anyone already in one feels it right away (banned in `banir` mode, warning in `avisar`)\n\n**Contributing is automatic and permanent.** This server's bans — old and new — feed the list on their own, with no command and no switch to turn it off. The mode above only decides whether this server **benefits** from the list: you can opt out of using it, not out of feeding it.",
      perm: "BanMembers",
      ex: `${P}banglobal revisar`,
    },
    game: {
      uso: `${P}game [criar|ficha|pontos|top|apagar]`,
      desc: "RPG — one world, the same on every server: 10 difficulties × 10 levels (Human to Hyperversal), weapons with damage and scaling, bioware and cyberware, companions, contracts, dungeons and bosses.\n\n`&game criar [name]` — creates your character (with a starter kit and two companions)\n`&game` — your sheet · `&game ficha @user` — someone else's\n`&game pontos <attribute> [amount]` — spends points (abbreviations work: for, int, sor…)\n`&game classe` · `&game evoluir` — pick a class and the bot spends the points and equips for you\n\n`&game contratos` — the guild board (paid by the bank) · `&game contrato <name>` — sets off\n`&game dungeons` · `&game dungeon <name> [chefe]` — open world (paid by its treasury)\n`&game chefes` · `&game especiais` — unique rewards, once per person\n`&game coop abrir <…>` — together, up to 4 · `&game historia` — your last story\n\n`&game itens [type]` · `&game equipar <item> [mao1|mao2]` · `&game usar <contract|scroll>` · `&game desequipar <slot>`\n`&game catalogo [rarity] [type]` · `&game item <name>` · `&game comprar [rarity] [type]` · `&game vender <item>`\n`&game magias` · `&game aprender <name>` — the grimoire (needs Intelligence)\n`&game followers` · `&game follower ficha <name>` · `&game follower levar <name>` · `&game recrutas` · `&game contratar [name]` · `&game descansar`\n`&game carteira` · `&game mercado` · `&game cambio` · `&game trocar @user <item> for <item>`\n`&game top` — world ranking · `&game apagar confirmar` — starts over from scratch\n\n_Bot owner: `&game admin` has the testing tools._\n\n**Attributes:** Strength, Dexterity, Resistance, Agility, Health, Mana, Intelligence, Luck, Charisma.\n\n_A mission pays its strength, the same for everyone: a win at your level is worth 80% of a level; a failure pays nothing._\n\n⚠️ Not to be confused with `&xp`, the per-message leveling system.",
      perm: null,
      ex: `${P}game criar Kael`,
    },
    xp: {
      uso: `${P}xp [rank|top|sair|entrar|setup|cargos|criarcargos|sincronizar|on|off]`,
      desc: "Message-XP leveling system. Each message grants XP (with a cooldown), and enough XP levels you up. Every N levels you can earn a role, and the earlier ones stay — they stack.\n\n`top` shows the ranking · `setup` configures difficulty, level cap and role interval.\n\n**Each member chooses:** when XP is turned on, Judy tells the server; `sair` erases your XP and it stops counting, `entrar` brings you back (from zero).\n\n**Leaving costs the roles, not the XP.** A role belongs to the member: leaving means no longer being one, so Stoat removes them. The XP stays. Whoever **joins** gets the roles back automatically; for those who returned before that, `&xp sincronizar [@user]` hands back everything the current level grants _(see `&help xp sincronizar`)_.\n\n(Voice-call XP isn't supported by Stoat.)",
      perm: "ManagePermissions (to configure)", ex: `${P}xp top`,
    },
    rss: {
      uso: `${P}rss [add|remove|list|canal|agora]`,
      desc: "RSS news curation with Judy's summaries. `add <url>` registers a feed, `canal aqui` sets the destination, `list` shows the feeds, `remove <url|n>` removes one, `agora` forces a cycle. Every hour Judy posts an overall summary in her own voice, followed by the new items (title, feed, time, link).",
      perm: "ManagePermissions", ex: `${P}rss add https://example.com/feed.xml`,
    },
    servidor: {
      uso: `${P}servidor [rules|roles|channels|faq]`,
      desc: "The **server you're in**: owner, creation date, members and description — and, inside the family:\n\n"
        + "`rules` — the rules: the text the staff set or, without it, the **rules** channel read on its own\n"
        + "`roles` — highest to lowest, with how many people hold each\n"
        + "`channels` — by category, with each one's description\n"
        + "`faq` — staff notices and frequent questions (`faq <number>` opens one)\n\n"
        + "**Staff** *(ManagePermissions)*: `rules set <text>` (multiple lines) · `rules channel #channel|auto` · `rules clear` · `faq add <title> | <text>` · `faq remove <n>` · `faq clear`\n\n"
        + "The staff list is `&staff`. And you can **ask Judy**: \"what are the rules?\", \"who's on staff?\", \"which channel can I promote in?\" — she answers from this data, not from memory.",
      perm: "everyone (changing: ManagePermissions)", ex: `${P}servidor rules`,
    },
    staff: {
      uso: `${P}staff [add|remove|title|clear]`,
      desc: "Shows the **server's staff**: the owner, the roles marked here, the ticket team role and the roles allowed to moderate (ban, kick, timeout, delete messages, manage the server) — with who holds each one, no bots.\n\nThe marked roles have no separate registry: they're the very same as `&acesso cargo`. So adding here **also grants access to the moderation commands** — and removing drops both at once, so the notice board can never disagree with the actual permission.\n\n`&staff add <@role>` · `&staff remove <@role>` · `&staff clear`\n`&staff title <@role> <text>` — label shown instead of the role's name\n\n_Viewing is public; changing requires ManagePermissions._",
      perm: "ManagePermissions", ex: `${P}staff add Moderator`,
    },
    economia: {
      uso: `${P}economia [minerar|saldo|top|loja|comprar|pagar]`,
      desc: "The **server's currency** — separate from the RPG, one currency per server.\n\n"
        + "`&economia minerar` — earn a handful, with a wait between rounds\n"
        + "`&economia saldo [@user]` · `&economia top` — who has the most\n"
        + "`&economia loja` · `&economia comprar <role>` — roles for sale (only charged if the role is delivered)\n"
        + "`&economia pagar @user <amount>`\n\n"
        + "**Staff** _(ManageServer)_\n"
        + "`&economia config nome <name>` · `simbolo <emoji>` · `ganho <min> <max>` · `intervalo <time>`\n"
        + "`&economia loja add <role> <price>` · `&economia loja remover <role>`\n"
        + "`&economia dar|tirar @user <amount>` · `&economia zerar confirmar`\n\n"
        + "_The bot only hands out roles below its own._",
      ex: `${P}economia minerar`,
    },
    entretenimento: {
      uso: `${P}entretenimento <ship|fight|cowsay|8ball|choose|rate|fortune|mock|reverse|minesweeper|tictactoe>`,
      desc: "The **fun & games** family. Each one lives in here:\n\n"
        + "`ship @a @b` — how many % they match (the same pair always gets the same %), plus the ship name\n"
        + "`fight @a @b` — who wins a fight, round by round, with crits and misses\n"
        + "`cowsay [critter] [think] <text>` — an ASCII critter saying (or thinking) your text · `cowsay figures` lists the critters\n"
        + "`8ball <question>` — the magic 8-ball answers\n"
        + "`choose a | b | c` — I pick one (`a, b or c` works too)\n"
        + "`rate <thing>` — a 0–10 rating, fixed for the same thing\n"
        + "`fortune` — your fortune for the day, with a lucky number\n"
        + "`mock <text>` · `reverse <text>` — mOcKiNg TeXt · text backwards\n"
        + "`minesweeper [easy|medium|hard]` — a spoiler minesweeper\n"
        + "`tictactoe [@user]` — tic-tac-toe by reaction (with nobody, against Judy)\n\n"
        + "With **one** person only, the other side is you. Things work too: `ship pizza and pineapple`, `fight Goku x Superman`.\n"
        + "_Nobody gets pinged by the answers: names come out as plain text._",
      perm: "everyone", ex: `${P}entretenimento ship @Ana @Bia`,
    },
    ticket: {
      uso: `${P}ticket [panel <#channel>|categories|log <#channel>|list|team]`,
      desc: "Support with a private channel per request, **by reaction**:\n\n"
        + "`painel <#channel>` — posts in the chosen channel a message with one reaction per topic (🎫 Support, 🚨 Report, 💡 Suggestion). **React = open**: a **#ticket-N** channel is born, visible only to the opener and the staff from `&acesso`\n"
        + "Inside the ticket, 🔒 **closes it — staff only**: the conversation **locks** (the opener can read, not write) and the whole record goes to the log as a **.txt file**. Then 🗑️ (staff) deletes the channel\n\n"
        + "`categorias 🎫 Support | 🚨 Report` — changes the topics (repost the panel)\n"
        + "`log <#channel>` — where records go (required) · `lista` — open ones\n"
        + "`equipe` — checks that the **staff gets into every ticket** (`&acesso` roles + whoever has Manage channels). Stoat won't let Judy add a role **above** hers to a ticket. **The proper fix:** in Server settings → Roles, drag Judy's role above the staff roles. Or give those roles, in their server permissions, *View channel + Read message history + Send messages*. Or use the **Ticket team** role that `equipe` creates (an admin gives it by hand to whoever is above Judy). `painel` already runs this check\n"
        + "_Typing works too: `abrir [reason]`, `fechar [note]`, `apagar`._\n\n"
        + "The bot needs **ManageChannel, ManageRole, AssignRoles, ManagePermissions** and **ManageMessages** (to clear reactions).",
      perm: "react/open: everyone · rest: staff", ex: `${P}ticket painel #support`,
    },

    musica: {
      uso: `${P}musica <link or name> | [pausar|play|skip|fila|parar|volume <0-200>|loop <faixa|fila|nao>]`,
      desc: "Music in calls — **YouTube, SoundCloud and Spotify**, with a per-channel queue.\n\n_The machine plays up to `MUSICA_MAX_SIMULTANEAS` songs at once (default 3); at the limit, the bot owner's server goes first._\n\n**The basics:**\n`&entrar` — from any channel, while you're in a call: she comes to you (or `&entrar call 1`). `&musica` works from any channel and, if she isn't in a call, joins yours\n`&musica <link or name>` — plays; if something is on, it queues\n`&musica pausar` · `&musica play` — pause and resume\n`&musica skip` — next · `&musica fila` — current queue\n`&musica parar` — stop and clear · `&sair` — she leaves the call\n\n**Tuning:** `&musica volume 80` (0 to 200%) · `&musica loop faixa|fila|nao`\n\n**Sources:** YouTube/SoundCloud link or playlist, free-text search, and Spotify tracks (keyless). Spotify playlists/albums need `SPOTIFY_ID`/`SPOTIFY_SECRET` in the host's `.env`.\n\n**When a video won't play** (age-restricted, unavailable, region-blocked): she looks for **another version** of the same song (another YouTube upload, then SoundCloud) and says which one played; if none works, she says why — and `&musica fila` shows the last one that failed.\n\n**With TTS in the same call:** the music **ducks automatically** while speech plays and comes back after.\n\n_Aliases: `&m` · `&play` · `&tocar`._",
      perm: "everyone", ex: `${P}musica tocar never gonna give you up`,
    },
    entrar: {
      uso: `${P}entrar`,
      desc: "Brings Judy into the call and she starts speaking **everything written there**. Inside, **the reader (TTS) and the music share the same connection**: `&musica` works while she keeps reading the chat.\n\n**Several servers at once:** she stays in one call per server — being called on another server doesn't pull her out of this one. On the same server, `&entrar` in another call switches calls.\n\n**How she picks the call**\n1. the channel you typed in, if it's a call _(the usual case)_\n2. the one already configured\n3. the server's only call, if there's just one\n\nWith more than one and no clue, she **asks** instead of guessing. If she's in another call, she leaves it and comes to yours.\n\nWorks for **everyone**, not just staff. Voice settings: `&help tts`.",
      ex: `${P}entrar`,
    },
    sair: {
      uso: `${P}sair`,
      desc: "Takes Judy out of the call: she stops reading the chat and stops the music.",
      ex: `${P}sair`,
    },
    tts: {
      uso: `${P}tts <text> | [canal|transmitir|entrar|sair|filtro|reiniciar|voz|estado|on|off]`,
      desc: "Judy **speaks in calls**. Someone writes, she reads it aloud in the voice channel.\n\n`&tts <text>` — speak now\n`&entrar` · `&sair` — call or dismiss Judy\n`&tts estado` — diagnostics for the whole chain\n_These three are open to **everyone**._\n\n**Broadcast mode** — no extra command\n`&entrar` already makes **everything** written in that channel become speech; `&sair` stops it.\n\n**Adjustments** _(viewing is open; changing needs ManageMessages)_\n`&tts nomes off` — stops announcing \"Someone said:\"\n`&tts cooldown <s>` — brake between one person's utterances (0 disables)\n`&tts filtro` — the **sieve**: skips repetition, walls of text and noise, and caps utterances per minute _(`&help tts filtro`)_\n\n**When something jams**\n`&tts reiniciar` — unsticks the voice service without a terminal _(ManageMessages)_. After `&sair`, the broadcast will **not** bring Judy back: only `&entrar`. _(`&help tts problemas`)_\n\n**Voice and timbre**\n`&tts voz [name]` — switch the Piper voice\n`&tts efeito [name]` — `feminina`, `sedutora`, `suave`, `glados`, `robo`, `radio`…\n`&tts tom <n>` — pitch, **separate** from the effect (1.0 = original)\n`&tts dicionario` — how chat shorthand is spoken (`vc` → `você`); `add`/`remove`/`teste`/`padrao on|off`\n_There is no GLaDOS voice in Portuguese; the effect recreates her **processing** over the voice you already use._\n\n_Inside the configured voice channels, `&tts` works for **everyone**, even with channel restriction on._\n_Synthesis runs **offline** on the owner's machine (Piper)._",
      perm: "ManageMessages (configuration only)", ex: `${P}entrar`,
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
    chat: {
      uso: `${P}chat <message>`,
      desc: "Talk to the local AI (Judy). When you ask about the world, she searches the web before answering (links only show up when you ask for the search: \"search…\", \"look it up online…\"), does exact math, reads her own code, remembers people who **agreed** to it (she asks in your first conversation; `" + citar("privacidade", "en", P) + "`) and adapts her tone to each person. She can also see images you attach.\n\n**Subcommands:**\n`&chat status` — whether the AI service is up\n`&chat perfil` — what Judy knows about you\n`&chat mapear` — captures your profile card bio/status\n`&chat cuidado [@user] on|off` — treats the person with extra kindness (opt-in)\n`&chat esquecer` — erases everything Judy knows about you\n`&chat esquecer tudo` — wipes the server's memory *(ManageServer)*\n`&chat livre on|off|modo` — Judy joins the channel on her own *(ManagePermissions)*\n`&chat comentar aqui|off|pordia <n>` — comments on her own initiative *(ManagePermissions)*\n\nWhen she replies to someone, she keeps the conversation flowing for a while. If she's already answering someone else you join the **queue** (you'll see your position) and get served in order. Arithmetic written in the message (`263857 * 3`) always goes to the calculator, never done in her head.",
      perm: null, ex: `${P}chat status`,
    },
    modia: {
      uso: `${P}modia <on|off|criterios|canal|status|limpar>`,
      desc: "AI moderation of the conversation. You write the CRITERIA in free text and Judy evaluates each message; if it violates them, she DELETES it and pings you in #log with the content and the options (warn/silence/ban) with the command ready to paste. She never bans on her own — the decision is yours. The bot owner is immune.\n\n`&modia criterios <text>` — defines what to moderate\n`&modia on|off` — toggles it\n`&modia canal add|remove` — limits it to channels (otherwise applies to all)\n`&modia limpar` — resets everything",
      perm: "ManageServer", ex: `${P}modia criterios Delete ads for other servers and personal attacks`,
    },
    debug: {
      uso: `${P}debug [@user | #channel]`,
      desc: "The bot's diagnostics on this server, in one message.\n\n`&debug` — **the full report**: first what's broken and how to fix it; then the bot's permissions, role hierarchy, configured channels, every channel, moderation, voice and AI (and recent errors, for the bot owner)\n`&debug @user` — what the bot can do with that person: punish, time out, give level roles\n`&debug #channel` — the bot's permission math in that channel, role by role (the channel name works too)\n\n`&help debug ler` explains the icons.",
      perm: "ManagePermissions",
      ex: `${P}debug`,
    },
    reactionrole: {
      uso: `${P}reactionrole <add|remove|list>`,
      desc: "Reaction roles: whoever reacts with the emoji gets the role; removing the reaction removes the role.\n\n`&reactionrole add <message> <emoji> <roleId>`\n`&reactionrole remove <message>` — removes that message's rules\n`&reactionrole exclusivo <message> on|off` — **on**: picking one emoji swaps out the previous role (e.g. colors); **off**: they stack (e.g. interests)\n`&reactionrole recarregar` — if roles stop being handed out after a restart\n`&reactionrole list` — this server's rules\n\n**The message** can be its **ID** or its **link** (`...` menu → *Copy link*) — both work.\n**The role** can be **mentioned** (`<%Role>`) or given by ID (Settings → Roles → *Copy role ID*).\n\nThe bot needs `React`, `ViewChannel`, `ReadMessageHistory` and **AssignRoles**, and its role must be above the role being handed out.",
      perm: "ManageRole",
      ex: `${P}reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...`,
    },
  };
}

const IA_TAG = "\u200b[ia]";
// `comModIA`: o &modia vale fora dos servidores da conversa (16 out 2026)
function filtrarIA(linhas, comIA, comModIA = comIA) {
  if (!Array.isArray(linhas)) return [];   // categoria inexistente/malformada
  return linhas
    .filter((l) => (comIA || !String(l).includes(IA_TAG)) && (comModIA || !String(l).includes(MODIA_TAG)))
    .map((l) => String(l).replace(IA_TAG, "").replace(MODIA_TAG, ""));
}
const podeIA = (cmd, sid) => { try { return comandoIAPermitido(cmd, sid); } catch { return false; } };

function construirSubtopicos(P, lang) {
  if (lang === "en") return {
    sentinela: {
      sensibilidade: {
        titulo: "sentinel sensitivity",
        texto: [
          `**Usage:** \`${P}automod sentinel sensitivity <low|medium|high>\``,
          "",
          "Sets from which **score (0–10)** the bot acts on suspicious content:",
          "• 🟢 **low** (threshold 7.5) — only near-certain cases; fewer false positives.",
          "• 🟡 **medium** (threshold 6.5) — recommended balance.",
          "• 🔴 **high** (threshold 5.5) — catches faint signs; protects more, errs more.",
        ].join("\n"),
      },
      testar: {
        titulo: "sentinel test",
        texto: [
          `**Usage:** \`${P}automod sentinel test <text>\``,
          "",
          "Simulates analyzing a text and shows the score (0–10) and detected signals, without punishing anyone. Useful for calibrating the sensitivity.",
        ].join("\n"),
      },
      canal: {
        titulo: "sentinel channel",
        texto: [
          `**Usage:** \`${P}automod sentinel channel <#channel|here|off>\``,
          "",
          "Sets which channel receives the suspicious-content alerts. `off` goes back to the log channel (or the message's own channel).",
        ].join("\n"),
      },
    },
    automod: {
      set: {
        titulo: "automod set",
        texto: [
          `**Usage:** \`${P}automod <group> set <parameter> <value>\``,
          "",
          "Adjusts a module's parameter. Parameters per module:",
          "• `antispam`: `mensagens`, `tempo` (ms) — velocidade · `vezes` — repetição · `minuto`, `novato` — mídia · `mencoes`",
          "• `antiruido`: `tamanho`, `limiar` (0–1 or %) — caps · `zalgo` — caracteres · `repeticao`, `ignorar` — letras · `emojis` — emoji",
          "  _Measurement ignores mentions, links, named emojis and code — only typed text counts._",
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
          `**Usage:** \`${P}automod punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
          "",
          "Sets the **global** punishment (applies to every module without its own):",
          "• `avisar` — warn only, don't remove\n• `apagar` — remove the message only\n• `confirmar` — remove, silence (native timeout) and wait for a mod's approval\n• `acumular` — stack warnings and ban at the limit\n• `banir` — instant ban",
        ].join("\n"),
      },
    },
  };

  // pt
  return {
    sentinela: {
      sensibilidade: {
        titulo: "sentinela sensibilidade",
        texto: [
          `**Uso:** \`${P}automod sentinela sensibilidade <baixa|media|alta>\``,
          "",
          "Define a partir de qual **nota (0–10)** o bot age sobre conteúdo suspeito:",
          "• 🟢 **baixa** (limiar 7,5) — só o que é quase certo; menos falsos positivos.",
          "• 🟡 **media** (limiar 6,5) — equilíbrio recomendado.",
          "• 🔴 **alta** (limiar 5,5) — pega indícios leves; protege mais, erra mais.",
        ].join("\n"),
      },
      testar: {
        titulo: "sentinela testar",
        texto: [
          `**Uso:** \`${P}automod sentinela testar <texto>\``,
          "",
          "Simula a análise de um texto e mostra a nota (0–10) e os sinais detectados, sem punir ninguém. Útil para calibrar a sensibilidade.",
        ].join("\n"),
      },
      canal: {
        titulo: "sentinela canal",
        texto: [
          `**Uso:** \`${P}automod sentinela canal <#canal|aqui|off>\``,
          "",
          "Define para qual canal vão os alertas de conteúdo suspeito. `off` volta a avisar no canal de logs (ou no próprio canal da mensagem).",
        ].join("\n"),
      },
    },
    automod: {
      set: {
        titulo: "automod set",
        texto: [
          `**Uso:** \`${P}automod <grupo> set <parâmetro> <valor>\``,
          "",
          "Ajusta um parâmetro de um módulo. Parâmetros por módulo:",
          "• `antispam`: `mensagens`, `tempo` (ms) — velocidade · `vezes` — repetição · `minuto`, `novato` — mídia · `mencoes`",
          "• `antiruido`: `tamanho`, `limiar` (0–1 ou %) — caps · `zalgo` — caracteres · `repeticao`, `ignorar` — letras · `emojis` — emoji",
          "  _A medição ignora menções, links, emojis nomeados e código — só conta o texto digitado._",
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
          `**Uso:** \`${P}automod punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
          "",
          "Define a punição **global** (vale para todos os módulos que não têm punição própria):",
          "• `avisar` — só avisa, não remove\n• `apagar` — só remove a mensagem\n• `confirmar` — remove, silencia (timeout nativo) e espera um mod aprovar\n• `acumular` — soma avisos e bane ao atingir o limite\n• `banir` — ban imediato",
        ].join("\n"),
      },
    },
  };
}

// A árvore INTEIRA da ajuda (as duas fontes fundidas, sem o filtro de IA), para
// o inventário de comandos percorrer todas as páginas (17 out 2026: as
// páginas que só existem em construirSubtopicos ficavam fora dos testes).
export function arvoreDaAjuda(P, lang = "pt") {
  const base = construirSubtopicos(P, lang);
  const fundido = { ...arvoreSubtopicos(P, lang) };
  for (const [cmd, subs] of Object.entries(base)) fundido[cmd] = mesclarNos(fundido[cmd], subs);
  return ligarFamilias(fundido);
}

export async function cmdHelp(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO } = ctx;
  const P = PREFIXO;
  const lang = lingua(ctx);
  const idioma = idiomaDe(ctx);   // "es" além dos dois: a página do registro e os rótulos já saem em espanhol
  const rot = (pt, en, es) => (idioma === "es" ? es : lang === "en" ? en : pt);
  const comIA = (() => { try { return temIA(ctx.serverId); } catch { return false; } })();
  const comModIA = podeIA("modia", ctx.serverId);

  // Ajuda detalhada por comando: &help <comando>
  const DETALHES  = construirDetalhes(P, lang, idioma);
  const SUBTOPICOS = (() => {
    const base = construirSubtopicos(P, lang);
    const extra = arvoreSubtopicos(P, lang);
    const fundido = { ...extra };
    // Fusão em PROFUNDIDADE: as duas árvores podem ter o mesmo assunto com
    // pedaços diferentes (ex.: `automod.punicao` existe nas duas).
    for (const [cmd, subs] of Object.entries(base)) {
      fundido[cmd] = mesclarNos(extra[cmd], subs);
    }
    // Sem IA no servidor, os subtópicos de IA não existem — nem para listar.
    for (const cmd of SUBTOPICOS_SO_IA) if (!podeIA(cmd, ctx.serverId)) delete fundido[cmd];
    // A fusão acima recria no topo o que a árvore de geral.js tinha solto
    // (`punicao.escada`, por exemplo). Religa tudo dentro das famílias.
    return ligarFamilias(fundido);
  })();

  const alvo = args[0]?.toLowerCase();

  // ── Quem está vendo (membro, staff ou dono) e o que o servidor tem ──
  // Cada um vê só o que pode usar aqui — ver modulos/moderacao/visao.js.
  const visao = await visaoMod.quemVe(message, ctx);
  const ehComando = (c) => !!(DETALHES[c] || SUBTOPICOS[c]);
  const barrar = (cmd, sub = "", sub2 = "") => {
    if (!ehComando(cmd) || visaoMod.podeVer(visao, cmd, sub, sub2)) return null;
    const nome = `\`${P}${cmd}\``;   // só o comando: o resto pode ser assunto da ajuda, não subcomando
    const recurso = visaoMod.recursoDoComando(cmd);
    if ((recurso === "ia" && !visao.ia) || (recurso === "voz" && !visao.voz)) {
      return tr(ctx, { title: "🚫 Não existe aqui", description: `${nome} não está disponível neste servidor.\n\nUse \`${P}help\` para ver o que existe por aqui.`, colour: COR.aviso },
        { title: "🚫 Not available here", description: `${nome} isn't available on this server.\n\nUse \`${P}help\` to see what's available here.`, colour: COR.aviso });
    }
    if (visaoMod.nivelDoComando(cmd, sub, sub2) === "dono") {
      return tr(ctx, { title: "❓ Não encontrado", description: `Não há ajuda para ${nome}. Use \`${P}help\` para o índice.`, colour: COR.aviso },
        { title: "❓ Not found", description: `There's no help for ${nome}. Use \`${P}help\` for the index.`, colour: COR.aviso });
    }
    return tr(ctx, { title: "🔒 Comando da staff", description: `${nome} é usado pela equipe do servidor.\n\nUse \`${P}help\` para ver os comandos que você pode usar.`, colour: COR.info },
      { title: "🔒 Staff command", description: `${nome} is used by the server's staff.\n\nUse \`${P}help\` to see the commands you can use.`, colour: COR.info });
  };

  // ── Descida por QUALQUER profundidade da árvore ──────────────────────────
  // Antes só existiam dois níveis (`&help <cmd> <sub>`). Como os comandos
  // viraram famílias (`&automod blocklist add`), a ajuda desce junto: cada
  // camada mostra o seu texto E as camadas de dentro, para dar para navegar
  // sem adivinhar o que existe.
  const METADADOS = new Set(["titulo", "texto"]);
  const filhosDe = (no) => Object.keys(no ?? {})
    .filter((k) => !METADADOS.has(k) && no[k] && typeof no[k] === "object");

  const caminho = args.map((a) => String(a).toLowerCase());
  // `&help automod` (1 argumento) também entra aqui quando `automod` é a raiz
  // de uma família: antes caía no livrinho do grupo "Proteger", que não
  // mostrava a família nenhuma.
  const raizDeFamilia = caminho.length === 1
    && SUBTOPICOS[caminho[0]]?.texto
    && Object.keys(SUBTOPICOS[caminho[0]]).some((k) => !["titulo", "texto"].includes(k));
  if ((caminho.length >= 2 || raizDeFamilia) && SUBTOPICOS[caminho[0]]) {
    const barrado = barrar(caminho[0], caminho[1] ?? "", caminho[2] ?? "");
    if (barrado) return sendEmbed(message.channel, barrado);
    let no = SUBTOPICOS[caminho[0]];
    const trilha = [caminho[0]];
    let i = 1;
    for (; i < caminho.length; i++) {
      const proximo = no?.[caminho[i]];
      if (!proximo || typeof proximo !== "object") break;
      no = proximo;
      trilha.push(caminho[i]);
    }

    // Um passo do caminho não existe: diz o que existe ali, em vez de só negar.
    if (i < caminho.length) {
      const opcoes = filhosDe(no);
      const lista = opcoes.length
        ? opcoes.map((k) => `\`${P}help ${trilha.join(" ")} ${k}\``).join(" · ")
        : `\`${P}help ${trilha.join(" ")}\``;
      return sendEmbed(message.channel, tr(ctx, {
        title: "❓ Subtópico desconhecido",
        description: `\`${caminho[i]}\` não existe dentro de \`${P}${trilha.join(" ")}\`.\n\n**Existem:** ${lista}`,
        colour: COR.aviso,
      }, {
        title: "❓ Unknown subtopic",
        description: `\`${caminho[i]}\` isn't inside \`${P}${trilha.join(" ")}\`.\n\n**Available:** ${lista}`,
        colour: COR.aviso,
      }));
    }

    const filhos = filhosDe(no).filter((k) => visaoMod.podeVer(visao, trilha[0], trilha[1] ?? k, trilha[1] ? k : ""));
    const rodape = filhos.length
      ? ["", lang === "en" ? "**Go deeper:**" : "**Aprofunde:**",
         filhos.map((k) => `\`${P}help ${trilha.join(" ")} ${k}\``).join(" · ")]
      : [];
    const corpo = no.texto
      ? visaoMod.filtrarLinhas(filtrarIA(String(no.texto).split("\n"), comIA, comModIA), visao)
      : [lang === "en"
          ? `\`${P}${trilha.join(" ")}\` groups the topics below.`
          : `\`${P}${trilha.join(" ")}\` reúne os assuntos abaixo.`];

    return enviarPaginado(ctx, message.channel, {
      paginas: paginarLinhas([...corpo, ...rodape], {
        titulo: `📖 ${lang === "en" ? "Help" : "Ajuda"} — ${P}${trilha.join(" › ")}`,
      }),
      autorId: message.authorId,
      colour: COR.info,
    });
  }

  // (a descida acima já resolve &help <cmd> <sub> e mais fundo)

  // ── Grupos: &help <grupo> (aceita os nomes antigos também) ──
  const GRUPOS = gruposHelp(P, lang);
  // O membro tem um grupo só dele com o básico — os grupos de configuração
  // (começar, proteger, personalizar, diagnóstico) são da staff.
  GRUPOS.voce = lang === "en" ? {
    emoji: "📌", titulo: "For you", resumo: "the basics: who's staff, server clock, info, tickets",
    linhas: [
      `\`${citar("userinfo", "en", P)} [@user]\` — ID, join date and roles`,
      `\`${P}staff\` — who the staff is`,
      `\`${P}fuso\` — the server clock (several cities at once)`,
      `\`${citar("sobre", "en", P)}\` · \`${citar("ping", "en", P)}\` — about the bot and its latency`,
      `\`${P}tutorial\` — the guide for players and members`,
      `\`${citar("privacidade", "en", P)}\` — what Judy keeps about you, and your consent`,
      "Need the staff? React on the server's **ticket panel** — a private channel opens.",
    ],
  } : {
    emoji: "📌", titulo: "Para você", resumo: "o básico: quem é a staff, relógio do servidor, informações, tickets",
    linhas: [
      `\`${citar("userinfo", "pt", P)} [@pessoa]\` — ID, data de entrada e cargos`,
      `\`${P}staff\` — quem é a equipe`,
      `\`${P}fuso\` — o relógio do servidor (várias cidades de uma vez)`,
      `\`${citar("sobre", "pt", P)}\` · \`${citar("ping", "pt", P)}\` — sobre o bot e a latência`,
      `\`${P}tutorial\` — o guia de quem joga e usa`,
      `\`${citar("privacidade", "pt", P)}\` — o que a Judy guarda sobre você, e o seu consentimento`,
      "Precisa da staff? Reaja no **painel de tickets** do servidor — abre um canal privado.",
    ],
  };
  const GRUPOS_DO_MEMBRO = ["voce", "diversao", "rpg"];
  const ehDono = (() => { try { return ctx.ehSuperAdmin?.(message.authorId); } catch { return false; } })();
  // só os grupos com algum comando que quem vê pode usar aqui
  const chavesGrupos = (visao.nivel === "membro" ? GRUPOS_DO_MEMBRO : ehDono ? [...ORDEM_GRUPOS, "dono"] : [...ORDEM_GRUPOS])
    .filter((k) => k === "dono" || visaoMod.temComandoVisivel(filtrarIA(GRUPOS[k].linhas, comIA, comModIA), visao));

  // Página de um grupo: cabeçalho + linhas (quebra em 2 páginas se não couber).
  const paginasDoGrupo = (chave) => {
    const g = GRUPOS[chave];
    const linhas = visaoMod.filtrarLinhas(filtrarIA(g.linhas, comIA, comModIA), visao);
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
      ...(visao.nivel === "membro" ? [] : [lang === "en"
        ? `🧙 **First time here?** \`${P}assistente\` sets the bot up **with you**, question by question — the fastest way.`
        : `🧙 **Primeira vez aqui?** \`${P}assistente\` configura o bot **com você**, pergunta por pergunta — é o jeito mais rápido.`, ""]),
      ...chavesGrupos.map((k) => `${GRUPOS[k].emoji} \`${P}help ${k}\` — ${(!comIA && GRUPOS[k].resumoSemIA) || GRUPOS[k].resumo}`),
      "",
      lang === "en"
        ? `📖 \`${P}help <command>\` — usage, **each parameter explained**, example (e.g. \`${P}help boasvindas\`)`
        : `📖 \`${P}help <comando>\` — uso, **cada parâmetro explicado**, exemplo (ex.: \`${P}help boasvindas\`)`,
      lang === "en"
        ? `📋 Several commands at once: **one per line** in the same message (up to 10).`
        : `📋 Vários comandos de uma vez: **um por linha** na mesma mensagem (até 10).`,
      visao.nivel === "membro"
        ? (lang === "en" ? `🔍 \`${P}help <command> <part>\` — one part of it (\`${P}help game missao\`)` : `🔍 \`${P}help <comando> <parte>\` — uma parte dele (\`${P}help game missao\`)`)
        : (lang === "en"
          ? `🔍 \`${P}help <command> <part>\` — one part of it (\`${P}help game admin\`, \`${P}help xp setup\`)`
          : `🔍 \`${P}help <comando> <parte>\` — uma parte dele (\`${P}help game admin\`, \`${P}help xp setup\`)`),
      visao.nivel === "membro" ? null : (lang === "en" ? `🌐 \`${citar("idioma", "en", P)} pt|en|es\` — server language` : `🌐 \`${citar("idioma", "pt", P)} pt|en|es\` — idioma do servidor`),
      "",
      ({ membro: lang === "en" ? "_👤 You're seeing the commands you can use. Staff sees the setup ones too._" : "_👤 Você está vendo os comandos que pode usar. A staff vê também os de configuração._",
         staff: lang === "en" ? "_🛡️ Staff view: everything this server has._" : "_🛡️ Visão da staff: tudo o que este servidor tem._",
         dono: lang === "en" ? "_👑 Bot owner view: everything, including the owner's commands._" : "_👑 Visão do dono do bot: tudo, inclusive os comandos do dono._" })[visao.nivel],
      [!visao.ia && (lang === "en" ? "AI" : "IA"), !visao.voz && (lang === "en" ? "voice and music" : "voz e música")].filter(Boolean).length
        ? (lang === "en" ? `_Not enabled on this server: ${[!visao.ia && "AI", !visao.voz && "voice and music"].filter(Boolean).join(", ")}._`
          : `_Não liberado neste servidor: ${[!visao.ia && "IA", !visao.voz && "voz e música"].filter(Boolean).join(", ")}._`)
        : null,
    ].filter((x) => x !== null).join("\n"),
    colour: COR.info,
  });

  // &help <número> → página N do índice paginado
  const numero = /^\d+$/.test(alvo ?? "") ? parseInt(alvo, 10) : null;
  const chaveGrupo = ALIAS_GRUPO[alvo];

  if (!alvo || numero !== null || (chaveGrupo && GRUPOS[chaveGrupo] && chavesGrupos.includes(chaveGrupo))) {
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
  if (alvo && COMANDOS_SO_IA.has(alvo) && !podeIA(alvo, ctx.serverId)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Não existe aqui",
      description: `\`${P}${alvo}\` não existe neste servidor.\n\nUse \`${P}help\` para ver o que existe por aqui.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Not a command here",
      description: `\`${P}${alvo}\` doesn't exist on this server.\n\nUse \`${P}help\` to see what's available here.`,
      colour: COR.aviso,
    }));
  }

  // &help <comando> (detalhe individual) — agora com a seção de parâmetros
  if (alvo && DETALHES[alvo]) {
    const barrado = barrar(alvo);
    if (barrado) return sendEmbed(message.channel, barrado);
    const d0 = DETALHES[alvo];
    // a descrição também perde as partes que quem vê não usa (o membro vê o `&xp top`, não o `&xp setup`)
    const d = { ...d0, desc: visaoMod.filtrarLinhas(String(d0.desc ?? "").split("\n"), visao).join("\n") };
    const filhosReais = filhosDe(SUBTOPICOS[alvo]).filter((k) => visaoMod.podeVer(visao, alvo, k));
    // Página do registro em espanhol (etapa 4): sai pronta, com os nomes já em
    // espanhol, e a tradução da tela não passa por ela (marcarTraduzido, aliases.js).
    const pronta = idioma === "es" && COMANDOS_COM_AJUDA.includes(alvo);
    const linkSub = (k) => (pronta ? `${citar("help", "es", P)} ${nomeExibido(alvo, "es")} ${subExibido(alvo, k, "es")}` : `${P}help ${alvo} ${k}`);
    const temSub = filhosReais.length
      ? `\n\n**${rot("Subtópicos", "Subtopics", "Subtemas")}** ${rot("_(o detalhe de cada parte)_", "_(details on each part)_", "_(el detalle de cada parte)_")}\n`
        + filhosReais.map((k) => `\`${linkSub(k)}\``).join(" · ")
      : "";
    // parâmetros que são subcomandos de outro nível (o `setup` do &xp para um membro) saem
    const params = secaoParametros(P, lang, alvo, idioma).split("\n").filter((l) => {
      const m = l.match(/^• `([a-zçãéí]+)/i);
      return !m || visaoMod.podeVer(visao, alvo, m[1].toLowerCase());
    }).join("\n");
    const cabecalho = [
      `**${rot("Uso", "Usage", "Uso")}:** \`${d.uso}\``,
      d.perm ? `**${rot("Permissão", "Permission", "Permiso")}:** ${d.perm}` : null,
      "",
      d.desc,
      d.ex ? `\n**${rot("Exemplo", "Example", "Ejemplo")}:** \`${d.ex}\`` : null,
    ].filter(Boolean).join("\n");
    const titulo = `📖 ${rot("Ajuda", "Help", "Ayuda")} — ${P}${nomeExibido(alvo, idioma)}`;
    // Páginas montadas por tamanho, quebrando entre linhas (o cabeçalho do
    // &help tts tinha 2.300 caracteres e era cortado no meio de "dicionario").
    const marca = pronta ? marcarTraduzido : (t) => t;
    const paginas = paginarLinhas([cabecalho, params.trim(), temSub.trim()].filter(Boolean).join("\n\n").split("\n"), { titulo })
      .map((p) => ({ ...p, title: marca(p.title), description: marca(p.description) }));
    if (paginas.length === 1) {
      return sendEmbed(message.channel, { title: marca(titulo), colour: COR.info,
        description: marca(cabecalho + params + temSub) });
    }
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, comandoPagina: null,
    });
  }
  // Parte do &automod pedida sozinha (`&help punishment`, `&help blocklist add`,
  // `&help topics`): é a página dela dentro do &automod (17 out 2026: "não encontrado").
  if (alvo && alvo !== "automod" && SUBTOPICOS.automod) {
    const pedido = normalizarArgs("help", ["automod", ...args]);   // inglês → nome interno, pelo caminho
    const procurar = (no, chave, caminho = []) => {
      for (const k of Object.keys(no ?? {})) {
        if (k === "titulo" || k === "texto" || typeof no[k] !== "object") continue;
        if (k === chave) return [...caminho, k];
        const fundo = procurar(no[k], chave, [...caminho, k]);
        if (fundo) return fundo;
      }
      return null;
    };
    // a palavra pode ser de um nível mais fundo (`topics` → `assuntos`, dentro do sentinela)
    const deQualquerNivel = Object.assign({}, ...Object.entries(SUB).filter(([k]) => k.startsWith("automod.")).map(([, m]) => m));
    const palavra = String(pedido[1]).toLowerCase();
    // só as partes que têm nome próprio no registro (não `canal`, `set`, `testar`, que são de dentro delas)
    const automodReg = REGISTRO.find((c) => c.id === "automod");
    const partes = new Set([...Object.keys(automodReg?.familias ?? {}), ...Object.keys(automodReg?.partes ?? {})]);
    const interno = partes.has(palavra) ? palavra : partes.has(deQualquerNivel[palavra]) ? deQualquerNivel[palavra] : null;
    const caminho = interno ? procurar(SUBTOPICOS.automod, interno) : null;
    if (caminho) return cmdHelp(message, ["automod", ...caminho, ...pedido.slice(2)], ctx);
    // um dos quatro grupos (`&help antispam`): a página do &automod, que explica os grupos
    if (interno && ["antispam", "antiruido", "antilink"].includes(interno)) return cmdHelp(message, ["automod"], ctx);
  }
  if (alvo) {
    const lista = chavesGrupos.filter((k) => k !== "dono").join(", ");
    // os grupos com o nome que o índice em inglês mostra (13 out 2026)
    const GRUPO_EN = { comecar: "start", proteger: "protect", personalizar: "customize", diversao: "fun", rpg: "game", diagnostico: "diagnostics" };
    const listaEN = chavesGrupos.filter((k) => k !== "dono").map((k) => GRUPO_EN[k] ?? k).join(", ");
    // "&help assistent" → "você quis dizer &help assistente?"
    const nomes = Object.keys(DETALHES ?? {});
    const perto = (a, b) => { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) { let ant = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = t; } } return d[b.length]; };
    const candidatos = [...nomes, ...nomes.map((k) => nomeExibido(k, "en")), ...nomes.map((k) => nomeExibido(k, "es"))];
    const sugestao = candidatos.map((k) => [k, perto(String(alvo).toLowerCase(), k)]).filter(([, d]) => d <= 2).sort((a, b) => a[1] - b[1])[0]?.[0];
    const sug = sugestao ? (lang === "en" ? nomeExibido(idDoNome(sugestao), idioma) : sugestao) : null;
    return sendEmbed(message.channel, tr(ctx, {
      title: "❓ Não encontrado",
      description: `${sug ? `Você quis dizer \`${P}help ${sug}\`?\n\n` : ""}Não há ajuda para \`${alvo}\`. Use \`${P}help\` para o índice, ou \`${P}help <grupo>\` (${lista}).`,
      colour: COR.aviso,
    }, {
      title: "❓ Not found",
      description: `${sug ? `Did you mean \`${P}help ${sug}\`?\n\n` : ""}There's no help for \`${alvo}\`. Use \`${P}help\` for the index, or \`${P}help <group>\` (${listaEN}).`,
      colour: COR.aviso,
    }));
  }
}

// %ping — mede a latência entre o envio da mensagem e o processamento
export async function cmdPing(message, args, ctx) {
  const { sendEmbed, COR } = ctx;
  // 17 out 2026: era `Date.now() - message.createdAt` — o relógio DESTA máquina
  // contra o do Stoat (o createdAt sai do ID da mensagem). Com o relógio da
  // máquina adiantado, o ping marcava 64973 ms com a resposta no mesmo minuto.
  // Agora as duas pontas vêm do Stoat: o ID do comando e o ID da resposta.
  const tempo = (m) => { const t = new Date(m?.createdAt ?? NaN).getTime(); return Number.isFinite(t) ? t : null; };
  const t0 = Date.now();
  const resposta = await sendEmbed(message.channel, { title: "🏓 Pong!", description: tr(ctx, "Medindo…", "Measuring…"), colour: COR.sucesso });
  const api = Date.now() - t0;
  const doComando = tempo(message), daResposta = tempo(resposta);
  if (typeof resposta?.edit !== "function") return resposta;
  const ida = doComando != null && daResposta != null ? Math.max(0, daResposta - doComando) : null;
  // quanto o relógio da máquina difere do Stoat: o meio do envio ≈ a hora da resposta lá
  const desvio = daResposta != null ? Math.round(t0 + api / 2 - daResposta) : 0;
  const verDesvio = Math.abs(desvio) >= 2000 && ctx.ehSuperAdmin?.(message.authorId);
  const s = (ms) => (Math.abs(ms) >= 10000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`);
  const description = tr(ctx, [
    ida != null ? `Resposta: **${s(ida)}** _(do seu comando até esta mensagem, pelo relógio do Stoat)_` : null,
    `Envio à API: **${s(api)}**`,
    verDesvio ? `\n⚠️ O relógio da máquina do bot está **${s(Math.abs(desvio))} ${desvio > 0 ? "adiantado" : "atrasado"}** em relação ao Stoat. Prazos e a idade das contas usam esse relógio — ligue a sincronização de hora (NTP) na máquina.` : null,
  ], [
    ida != null ? `Reply: **${s(ida)}** _(from your command to this message, by the Stoat's clock)_` : null,
    `API send: **${s(api)}**`,
    verDesvio ? `\n⚠️ The bot machine's clock is **${s(Math.abs(desvio))} ${desvio > 0 ? "ahead of" : "behind"}** the Stoat's. Timers and account age use that clock — turn on time sync (NTP) on the machine.` : null,
  ]).filter(Boolean).join("\n");
  await resposta.edit({ embeds: [{ title: "🏓 Pong!", description, colour: COR.sucesso }] }).catch(() => {});
  return resposta;
}

// %sobre — informações resumidas do bot
export async function cmdSobre(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, estado, config, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  const comIA = (() => { try { return temIA(serverId); } catch { return false; } })();

  // conta comandos, linhas e uptime de forma resiliente
  // Um comando por função (os apelidos apontam para a mesma), sem os que não
  // valem aqui: desativados neste servidor, só-IA fora da IA, o painel do
  // dono e o &cargomudo aposentado.
  const nComandos = (() => {
    if (!estado?.rotas) return null;
    const porFuncao = new Map();
    for (const [nome, fn] of Object.entries(estado.rotas)) if (!porFuncao.has(fn)) porFuncao.set(fn, nome);
    const fora = new Set(["servidores", "cargomudo", ...(config?.comandosDesativados ?? [])]);
    return [...porFuncao.values()].filter((n) => !fora.has(n) && (!estado.COMANDOS_SO_IA?.has(n) || podeIA(n, serverId))).length;
  })();
  const nLinhas = contarLinhas();
  const up = process.uptime();
  const dias = Math.floor(up / 86400);
  const horas = Math.floor((up % 86400) / 3600);
  const mins = Math.floor((up % 3600) / 60);
  const uptime = dias > 0 ? `${dias}d ${horas}h` : horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;

  const am = config?.automod ?? {};
  // A mesma lista do &automod (antes: 9 fixos, sem o antiduplicata e o antiimagem).
  // os quatro grupos do automod (um grupo conta como ligado se alguma parte está)
  const gruposAm = Object.keys(GRUPOS_AUTOMOD).map((g) => estadoDoGrupo(am, g));
  const modulosOn = gruposAm.filter((x) => x.ligadas > 0).length;
  const nModulos = gruposAm.length;
  const vozAqui = servidorNaLista("TTS_SERVIDORES", serverId);
  const geraImagem = (process.env.IMAGEM ?? "1").trim() !== "0";
  const nomeBot = ctx.client?.user?.displayName || "Judy";   // o nome de exibição; a conta (username) pode chamar outra coisa, como "Cobaia"
  const criador = (process.env.CRIADOR || "").trim();
  const xpOn = !!config?.xp?.enabled;
  const logOn = !!config?.log?.canalId;
  const rssN = (() => { try { return db.listarFeeds?.(serverId)?.length ?? 0; } catch { return 0; } })();
  const moedas = (() => { try { return db.listarMoedas?.(MUNDO) ?? []; } catch { return []; } })();
  const nPersonagens = (() => { try { return db.listarPersonagens?.(MUNDO, 9999)?.length ?? 0; } catch { return 0; } })();
  // Magias aprendidas no servidor inteiro: mostra se a mecânica pegou ou não.
  const nCapturados = (() => { try { return db.listarCapturados?.(MUNDO)?.length ?? 0; } catch { return 0; } })();
  const nMagias = (() => {
    try {
      return db.listarPersonagens(MUNDO, 9999)
        .reduce((t, x) => t + (db.listarMagias(MUNDO, x.userId)?.length ?? 0), 0);
    } catch { return 0; }
  })();
  const banGlobalModo = banGlobal.modoDe(config);
  const idioma = en ? "English" : "Português";

  const sim = (v) => v ? "🟢" : "🔴";
  const estadoLinhas = en ? [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/${nModulos} groups on${am.antiScam?.enabled ? ` · sentinel ${am.antiScam.porAntiguidade !== false ? "(stricter with newcomers)" : "on"}` : ""}`,
    `⚖️ **Punishment** — \`${nomeModo(config?.automod?.punicao?.modo ?? "avisar", "en")}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "en")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Leveling (XP)** — ${xpOn ? "on" : "off"}`,
    `${sim(logOn)} **Log channel** — ${logOn ? `<#${config.log.canalId}>` : "not set"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Global ban list** — mode \`${banGlobalModo}\``,
    `🎲 **RPG** _(one world for every server)_ — ${nPersonagens} character(s) · ${moedas.length} currenc${moedas.length === 1 ? "y" : "ies"}${moedas.length > 1 ? " · exchange on" : ""}${nMagias ? ` · ${nMagias} spell(s) learned` : ""}${nCapturados ? ` · ${nCapturados} companion(s) in the dungeon` : ""}`,
    comIA ? `🤖 **AI (Judy)** — enabled here: chat, code, web search, exact math, image reading${geraImagem ? " and **image generation**" : ""}`
          : `🤖 **AI (Judy)** — runs only on the servers enabled by the bot owner: chat, code, web search, exact math and image reading`,
    `🎫🪝🔊 **Tickets · Webhooks · Voice** — ${db.listarTickets(serverId).length} open ticket(s) · ${db.listarGanchos(serverId).length} webhook(s) · ${!vozAqui ? "voice and music not available here" : config?.tts?.ativo && config?.tts?.canalVoz ? `voice and music in <#${config.tts.canalVoz}>` : `voice and music: \`${PREFIXO}entrar\` from any channel, while in a call`}`,
  ] : [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/${nModulos} grupos ligados${am.antiScam?.enabled ? ` · sentinela ${am.antiScam.porAntiguidade !== false ? "(mais rígido com novatos)" : "ligado"}` : ""}`,
    `⚖️ **Punição** — \`${config?.automod?.punicao?.modo ?? "avisar"}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "pt")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Níveis (XP)** — ${xpOn ? "ligado" : "desligado"}`,
    `${sim(logOn)} **Canal de log** — ${logOn ? `<#${config.log.canalId}>` : "não definido"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Lista global de bans** — modo \`${banGlobalModo}\``,
    `🎲 **RPG** _(um mundo só, em todos os servidores)_ — ${nPersonagens} personagem(ns) · ${moedas.length} moeda(s)${moedas.length > 1 ? " · câmbio ativo" : ""}${nMagias ? ` · ${nMagias} magia(s) aprendida(s)` : ""}${nCapturados ? ` · ${nCapturados} companheiro(s) na dungeon` : ""}`,
    comIA ? `🤖 **IA (Judy)** — habilitada aqui: conversa, código, busca na web, contas exatas, leitura de imagens${geraImagem ? " e **geração de imagens**" : ""}`
          : `🤖 **IA (Judy)** — funciona apenas nos servidores habilitados pelo dono do bot: conversa, código, busca na web, contas exatas e leitura de imagens`,
    `🎫🪝🔊 **Tickets · Webhooks · Voz** — ${db.listarTickets(serverId).length} ticket(s) aberto(s) · ${db.listarGanchos(serverId).length} webhook(s) · ${!vozAqui ? "voz e música indisponíveis aqui" : config?.tts?.ativo && config?.tts?.canalVoz ? `voz e música em <#${config.tts.canalVoz}>` : `voz e música: \`${PREFIXO}entrar\` de qualquer canal, estando numa call`}`,
  ];

  // Links entre < >: continuam clicáveis, sem a prévia que o Stoat gera.
  const creditos = `_${criador ? `Criada por **${criador}**. ` : ""}Software livre ([código](<https://github.com/GhisoOF/stoat_bot>), [privacidade](<${URL_POLITICA}>)), feito com [stoat.js](<https://github.com/stoatchat/javascript-client-sdk>) — rode o seu! 🚀_`;
  const creditosEN = `_${criador ? `Made by **${criador}**. ` : ""}Free software ([source](<https://github.com/GhisoOF/stoat_bot>), [privacy](<${URL_POLITICA}>)), built with [stoat.js](<https://github.com/stoatchat/javascript-client-sdk>) — run your own! 🚀_`;

  await sendEmbed(message.channel, en ? {
    title: `🤖 ${nomeBot}`,
    description: [
      `Moderation, automod, levels, voice${comIA ? ", AI" : ""} and RPG bot for Stoat.`,
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
      "",
      creditosEN,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  } : {
    title: `🤖 ${nomeBot}`,
    description: [
      `Bot de moderação, automod, níveis, voz${comIA ? ", IA" : ""} e RPG para o Stoat.`,
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
      "",
      creditos,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  });
}

// %repete <texto> — repete o texto fornecido
export async function cmdRepete(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao } = ctx;
  // Era aberto a todos: qualquer membro fazia a bot "anunciar" o que quisesse,
  // num cartão com a cara dela — prato cheio para golpe ("@staff mandou…").
  const server = await getServer?.(message).catch(() => null);
  if (membroTemPermissao && !membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, { description: lingua(ctx) === "en" ? `🔒 \`${citar("repete", "en", ctx.PREFIXO)}\` is for staff (ManageMessages).` : `🔒 O \`${citar("repete", "pt", ctx.PREFIXO)}\` é da staff (ManageMessages).`, colour: COR.aviso });
  }
  const txt = args.join(" ");
  // sem texto, respondia nada — parecia que o comando nem existia
  if (!txt) return sendEmbed(message.channel, { description: lingua(ctx) === "en" ? `What should I repeat? \`${citar("repete", "en", ctx.PREFIXO)} <text>\`` : `Repetir o quê? \`${citar("repete", "pt", ctx.PREFIXO)} <texto>\``, colour: COR.aviso });
  await sendEmbed(message.channel, { description: txt, colour: COR.info });
}

// %userinfo [@usuário] — exibe informações de um usuário
export async function cmdUserinfo(message, args, ctx) {
  const { sendEmbed, COR, getServer, serverId, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const targetId = idEscrito(args.join(" ")) ?? message.mentionIds?.[0] ?? message.authorId;
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const desconhecido = lang === "en" ? "Unknown" : "Desconhecido";

  try {
    const server = await getServer(message);
    const member = (targetId === message.authorId && message.member)
      ? message.member
      : await server.fetchMember(targetId).catch(() => null);
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

    try {
      const avisos     = db.contarAvisos(serverId, targetId, { validadeMs: validadeDosAvisos(ctx.config?.automod?.punicao) });
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
      description: `\`${citar("kick", "pt", PREFIXO)} @usuário [motivo]\`\nVocê pode usar a menção ou o ID do usuário.`, colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: `\`${citar("kick", "en", PREFIXO)} @user [reason]\`\nYou can use the mention or the user's ID.`, colour: COR.erro,
    }));
  if (targetId === client.user.id)
    return sendEmbed(message.channel, tr(ctx,
      { description: "❌ Não posso me expulsar!", colour: COR.erro },
      { description: "❌ I can't kick myself!", colour: COR.erro }));

  // quem pede precisa estar ACIMA do alvo (15 out 2026: antes só a Judy precisava)
  {
    const pode = await podeAgirSobre(server, message, targetId, ctx);
    if (!pode.ok) return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Acima de você", description: `${pode.pt}.`, colour: COR.erro },
      { title: "🚫 Above you", description: `${pode.en}.`, colour: COR.erro }));
  }

  try {
    await server.kickUser(targetId);
    await log.registrar(ctx, "punicoes", { titulo: "👢 Usuário expulso (manual)",
      descricao: `<@${targetId}> foi expulso por <@${message.authorId}>.\n**Motivo:** ${reason}`,
      en: { titulo: "👢 User kicked (manual)", descricao: `<@${targetId}> was kicked by <@${message.authorId}>.\n**Reason:** ${reason}` } });
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
    console.error("[KICK]", descreverErro(err));
    await sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível expulsar",
      description: `**Usuário:** \`${targetId}\`\n**Erro:** ${descreverErro(err, "pt")}\n\n_Verifique se o bot tem a permissão **KickMembers** e se o cargo dele está acima do alvo._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't kick",
      description: `**User:** \`${targetId}\`\n**Error:** ${descreverErro(err, "en")}\n\n_Check that the bot has **KickMembers** and that its role sits above the target's._`,
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
      description: `\`${citar("ban", "pt", PREFIXO)} @usuário [motivo]\`\nVocê pode usar a menção ou o ID do usuário.`, colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: `\`${citar("ban", "en", PREFIXO)} @user [reason]\`\nYou can use the mention or the user's ID.`, colour: COR.erro,
    }));
  if (targetId === client.user.id)
    return sendEmbed(message.channel, tr(ctx,
      { description: "❌ Não posso me banir!", colour: COR.erro },
      { description: "❌ I can't ban myself!", colour: COR.erro }));

  // quem pede precisa estar ACIMA do alvo (15 out 2026: antes só a Judy precisava)
  {
    const pode = await podeAgirSobre(server, message, targetId, ctx);
    if (!pode.ok) return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Acima de você", description: `${pode.pt}.`, colour: COR.erro },
      { title: "🚫 Above you", description: `${pode.en}.`, colour: COR.erro }));
  }

  try {
    const { jaEstava } = await banir(server, targetId, { reason });
    // alimenta a lista global — com o nome, para a listagem ser legível depois
    await banGlobal.registrar(ctx, targetId, reason, "manual", {
      nome: ctx.client?.users?.get?.(targetId)?.username ?? null,
    });
    if (jaEstava) {
      console.log(`[BAN] ${message.authorId} -> ${targetId} | já estava banido`);
      return sendEmbed(message.channel, tr(ctx, {
        title: "✅ Já estava banido",
        description: `**Usuário:** <@${targetId}> \`${targetId}\`\nEssa pessoa **já está banida** neste servidor — não havia nada a fazer.\n**Lista global:** registrado 🌐`,
        colour: COR.info,
      }, {
        title: "✅ Already banned",
        description: `**User:** <@${targetId}> \`${targetId}\`\nThis person is **already banned** here — nothing to do.\n**Global list:** recorded 🌐`,
        colour: COR.info,
      }));
    }
    await log.registrar(ctx, "punicoes", { titulo: "🔨 Usuário banido (manual)",
      descricao: `<@${targetId}> foi banido por <@${message.authorId}>.\n**Motivo:** ${reason}`,
      en: { titulo: "🔨 User banned (manual)", descricao: `<@${targetId}> was banned by <@${message.authorId}>.\n**Reason:** ${reason}` } });
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
    console.error("[BAN]", descreverErro(err));
    await sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível banir",
      description: `**Usuário:** \`${targetId}\`\n**Erro:** ${descreverErro(err, lingua(ctx))}\n\n_Verifique se o bot tem a permissão **BanMembers** e se o cargo dele está acima do alvo._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't ban",
      description: `**User:** \`${targetId}\`\n**Error:** ${descreverErro(err, lingua(ctx))}\n\n_Check that the bot has **BanMembers** and that its role sits above the target's._`,
      colour: COR.erro,
    }));
  }
}

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
