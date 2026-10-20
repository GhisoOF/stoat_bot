import { parametrosDoRegistro } from "../core/ajuda-registro.js";
import { citar, nomeExibido } from "../core/aliases.js";

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
    { nome: "cor", valor: "<#hex|nome>", desc: "cor da barra lateral: `#FF71CE`, `roxo`, `azul`… (`&cor presets` lista os nomes)" },
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
    automod: [
      { nome: "off | on", desc: "desliga ou liga o automod inteiro de uma vez (servidor novo começa desligado)" },
      { nome: "<grupo>", desc: "só o nome: mostra as partes, os números e a punição do grupo" },
      { nome: "<grupo> on|off", desc: "liga/desliga o grupo inteiro: `antispam`, `antiruido`, `antilink`, `sentinela`" },
      { nome: "<grupo> <parte> on|off", desc: "só uma parte (ex.: `antiruido caps off`, `antispam midia on`) — `&automod <grupo>` lista as partes" },
      { nome: "<grupo> set", valor: "<parâmetro> <valor>", desc: "ajusta um número: `antispam set mensagens 5`, `antiruido set limiar 0.7` — `&automod <grupo>` mostra os parâmetros" },
      { nome: "<grupo> punicao", valor: "<modo|herdar>", desc: "punição só desse grupo; `herdar` volta a usar a de `&automod punicao`" },
      { nome: "debug on|off", desc: "log detalhado no console (global, só o dono)" },
    ],

    punicao: [
      { nome: "modo", valor: "avisar | apagar | confirmar | acumular | banir", desc: "`avisar` só avisa · `apagar` remove a mensagem · `confirmar` silencia e chama um moderador · `acumular` sobe uma escada a cada reincidência · `banir` bane na hora" },
      { nome: "escada", valor: "[aviso,10m,2h,ban]", desc: "os degraus do modo `acumular`. Sem valor, mostra a atual. Padrão: aviso → mute 5 min → mute 1 h → ban" },
      { nome: "warns", valor: "<n>", desc: `quantos avisos até o ban — ajusta a escada (o ban é sempre o último degrau). Vale para o automod e para o \`${citar("warn", "pt", P)}\`` },
      { nome: "validade", valor: "<dias|0>", desc: "os avisos zeram depois de tantos dias sem um novo (padrão 30; 0 = nunca). Sem valor, mostra a atual" },
      { nome: "status", desc: "a configuração atual" },
      { nome: "Não existe aqui", desc: `\`testar\`/\`simular\` são do \`&automod sentinela\` (é ele que lê o texto); avisos são com \`${citar("warn", "pt", P)}\`, \`${citar("warn.lista", "pt", P)}\` e \`${citar("warn.limpar", "pt", P)}\`. O \`&automod punicao\` só decide **o que acontece** depois` },
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

    acesso: [
      { nome: "cargo add | remove", valor: "<@cargo|nome|id>", desc: "cargos com acesso aos comandos de moderação (é a mesma lista do `&staff`)" },
      { nome: "cargo limpar", desc: "esvazia a lista" },
      { nome: "canal", valor: "todos | somente | exceto", desc: "modo: comandos em todo lugar, só nos canais listados, ou em todos menos os listados" },
      { nome: "canal add | remove", valor: "<#canal>", desc: "monta a lista de canais do modo escolhido" },
      { nome: "staffignora", valor: "on | off", desc: "se a staff pode usar comandos fora dos canais permitidos" },
      { nome: "livre", valor: "<comando> on | off", desc: "o comando vale em qualquer canal, mesmo com a restrição (ex.: `entretenimento`, para os jogos)" },
      { nome: "status", desc: "a configuração atual" },
    ],

    banglobal: [
      { nome: "off", desc: "ignora a lista global" },
      { nome: "avisar", desc: "quando entra alguém banido em outro servidor, avisa no log e não faz nada" },
      { nome: "imediato", desc: "bane **ao entrar** quem foi banido em **qualquer** outro servidor (1 ban basta) — `banir`, o nome antigo, vale igual" },
      { nome: "consenso", desc: "bane **ao entrar** só quem foi banido em **3+ servidores diferentes**; com menos, avisa a staff no log" },
      { nome: "lista", valor: "[servidor]", desc: "todas as pessoas da lista global; com `servidor`, só as banidas por este servidor" },
      { nome: "historico", valor: "<@pessoa|id>", desc: "em quais servidores essa pessoa foi banida e por quê" },
      { nome: "revisar", desc: "confere quem já está aqui contra a lista — **só mostra, nunca bane**" },
      { nome: "varrer", desc: "mostra quem seria banido e **espera confirmação**; só age nos modos `imediato` e `consenso`" },
      { nome: "varrer confirmar", desc: "⚠️ bane de verdade quem a varredura encontrou" },
      { nome: "isentar", valor: "<@pessoa|id>", desc: "aceita a pessoa **neste servidor** apesar da lista; se o bot a tinha banido, desfaz o ban" },
      { nome: "isentar remover", valor: "<@pessoa|id>", desc: "volta a tratá-la pela lista" },
      { nome: "isentos", desc: "quem está isento aqui" },
      { nome: "desfazer", desc: "↩️ reverte os bans que **a lista** aplicou aqui e isenta as pessoas (não toca em ban manual nem do automod)" },
      { nome: "esquecer", valor: "<@pessoa|id> [nota]", desc: "apaga os registros dessa pessoa **para todos os servidores** e a mantém fora: bans futuros e a importação de 6h passam a ignorá-la — bem mais forte que `isentar`" },
      { nome: "ignorados", desc: "quem está marcado para ficar fora da lista, e por quê" },
      { nome: "lembrar", valor: "<@pessoa|id>", desc: "desfaz o `esquecer`: a pessoa volta a entrar na lista no próximo ban (os registros antigos continuam apagados)" },
      { nome: "bots", valor: "[confirmar|<@pessoa>]", desc: "acha bots que já estavam na lista e os remove **de vez**. Com uma pessoa, diz **qual sinal** a identificou (ou por que nenhum identificou)" },
      { nome: "Como indicar alguém", desc: "menção · **ID** · link do perfil · **nome** · `Nome#0000` · apelido no servidor. Se o nome bater em mais de uma pessoa, eu mostro os candidatos em vez de escolher" },
    ],

    reactionrole: [
      { nome: "add", valor: "<mensagem> <emoji> <cargo>", desc: "liga emoji → cargo. A mensagem pode ser o **link** (`...` → Copiar link) ou o ID" },
      { nome: "remove", valor: "<mensagem> <emoji>", desc: "desfaz uma ligação" },
      { nome: "list", desc: "tudo que está ligado neste servidor" },
      { nome: "exclusivo", valor: "<mensagem> on|off", desc: "nessa mensagem só vale um cargo por vez (cor, time): escolher um troca o anterior" },
      { nome: "recarregar", desc: "se os cargos pararam de ser dados depois de um reinício. Também **repõe** emojis que sumiram do painel (entram no fim da fila)" },
      { nome: "ordem", valor: "<mensagem> confirmar", desc: "recompõe o painel na ordem configurada. Limpa as reações de todos e reage de novo, uma a uma — os cargos ficam, só o ✓ some. Painel grande leva ~1s por emoji: o Stoat só aceita 15 requisições por janela" },
    ],

    cor: [
      { nome: "<cargo> <cor>", desc: "cor sólida: `#FF00AA` ou um nome (`roxo`, `azul`…)" },
      { nome: "<cargo> gradiente", valor: "<cor> <cor> [...]", desc: "duas ou mais cores; um número no início vira o ângulo" },
      { nome: "<cargo> preset", valor: "<nome>", desc: "paleta pronta (`&cor presets` lista)" },
      { nome: "<cargo> remover", desc: "tira a cor" },
      { nome: "painel aqui", desc: "cria os cargos de cor (sólidas e gradientes), publica o painel, reage e liga os cargos por reação — tudo de uma vez. `solidas` ou `gradientes` no fim: só um grupo" },
      { nome: "criar", desc: "só cria/pinta os cargos, sem publicar nada" },
      { nome: "lista | presets", desc: "o que existe" },
    ],

    xp: [
      { nome: "(nada) | rank", valor: "[@pessoa]", desc: "nível, XP e progresso" },
      { nome: "top", desc: "ranking do servidor" },
      { nome: "on | off", desc: "liga/desliga o sistema" },
      { nome: "setup", desc: "abre a configuração: a cada quantos níveis dá cargo, multiplicador, nível máximo, canal de anúncio" },
      { nome: "setup multiplicador", valor: "<n>", desc: "XP por mensagem × n" },
      { nome: "setup intervalo", valor: "<segundos>", desc: "tempo mínimo entre duas mensagens que dão XP (anti-farm)" },
      { nome: "setup nivelmaximo", valor: "<n>", desc: "teto de nível" },
      { nome: "setup anuncio", valor: "<#canal|aqui|off>", desc: "onde anunciar quem subiu de nível" },
      { nome: "cargos", desc: "lista os cargos por nível" },
      { nome: "criarcargos", desc: "cria os cargos de nível sozinho" },
      { nome: "sincronizar", valor: "[@pessoa|todos]", desc: "devolve os cargos que o nível já garante — para quem saiu e voltou, ou quando os cargos foram criados depois *(ManagePermissions)*" },
      { nome: "reset", valor: "confirmar", desc: "zera o XP de **todos** do servidor" },
    ],

    staff: [
      { nome: "(nada)", desc: "a equipe: cada cargo de staff e quem o tem" },
      { nome: "add | remove", valor: "<@cargo|nome>", desc: "mesma lista do `&acesso cargo` — quem está aqui pode usar os comandos de moderação" },
      { nome: "titulo", valor: "<texto>", desc: "o título do painel" },
    ],

    fuso: [
      { nome: "(nada) | lista", desc: "a hora em todas as cidades configuradas" },
      { nome: "add", valor: "<cidade>", desc: "aceita nome, `Cidade/País` e apelidos (`sp`, `toquio`)" },
      { nome: "remove", valor: "<cidade>", desc: "tira da lista" },
      { nome: "ver", valor: "<cidade>", desc: "a hora de uma cidade sem adicioná-la" },
      { nome: "buscar", valor: "<texto>", desc: "encontra o nome certo" },
      { nome: "apelido", valor: "<cidade> <nome>", desc: "como a cidade aparece (\"Casa\", \"Escritório\")" },
      { nome: "principal", valor: "<cidade>", desc: "a referência de onde se conta a diferença" },
      { nome: "formato", valor: "12 | 24", desc: "formato da hora" },
    ],

    rss: [
      { nome: "add", valor: "<url> [categoria]", desc: "acompanha um feed. A categoria agrupa os resumos: cada assunto sai num bloco próprio, em vez de tudo espremido num apanhado só" },
      { nome: "categoria", valor: "<id|url> <nome|off>", desc: "define ou tira a categoria de um feed já cadastrado (`&rss list` mostra os ids). Sem categoria, o feed resume no bloco **Geral**" },
      { nome: "remove", valor: "<url|número>", desc: "para de acompanhar" },
      { nome: "list", desc: "feeds acompanhados" },
      { nome: "canal", valor: "<#canal|aqui>", desc: "onde publicar" },
      { nome: "agora", desc: "busca e publica agora (teste)" },
      { nome: "off", desc: "desliga" },
    ],

    musica: [
      { nome: "<link ou nome>", desc: "toca (YouTube, SoundCloud, Spotify); com som rolando, entra na fila. Playlists de YouTube/SoundCloud entram inteiras" },
      { nome: "pausar | play", desc: "pausa e retoma (`play` com texto depois vira `tocar`)" },
      { nome: "skip", desc: "pula para a próxima da fila" },
      { nome: "fila", desc: "o que está tocando e a lista de reprodução atual" },
      { nome: "parar", desc: "para e limpa a fila" },
      { nome: "volume", valor: "<0-200>", desc: "volume da música em % (o ducking respeita esse valor ao voltar)" },
      { nome: "loop", valor: "faixa | fila | nao", desc: "repete a faixa atual, a fila inteira, ou desliga" },
      { nome: "Entrar e sair", desc: "`&entrar` e `&sair` — a mesma call serve TTS e música; quando o TTS fala, a música **abaixa sozinha** e volta depois" },
      { nome: "Spotify", desc: "faixa avulsa sem chave; playlist/álbum pede `SPOTIFY_ID`/`SPOTIFY_SECRET` no `.env` de quem hospeda" },
    ],

    tts: [
      { nome: "<texto>", desc: "a Judy fala isso na call agora (não passa pela peneira — é pedido explícito)" },
      { nome: "falar", valor: "<texto>", desc: "força a fala mesmo que o texto pareça um subcomando (`&tts falar sair`)" },
      { nome: "entrar", desc: "⭐ **o único comando que importa**: de qualquer canal, ela entra na call em que você está (ou `&entrar <call>`) e passa a falar tudo que for escrito **no canal onde você digitou**. Se já estiver em outra call, **vem para a sua**. Liga o sistema, escolhe a call e a leitura sozinha" },
      { nome: "sair", desc: "sai da call **e** para de ler. Depois disso, só `entrar` traz o bot de volta" },
      { nome: "diagnostico", desc: "**onde** a entrada trava: na API do Stoat ou na rede até o LiveKit — com o veredito de cada caso *(ManageMessages)*" },
      { nome: "destravar", desc: "limpa o `AlreadyConnected` — quando o Stoat acha que o bot já está numa call e recusa toda entrada nova *(ManageMessages)*" },
      { nome: "resgatar", valor: "[#call-auxiliar]", desc: "o que o `entrar` já faz sozinho quando o Stoat acusa `AlreadyConnected`, só que escolhendo a call auxiliar à mão: entra nela, move-se para a call presa pelo PATCH do Stoat e conecta de verdade" },
      { nome: "reiniciar", desc: "recria a conexão do serviço de voz sem ir ao terminal — use quando `entrar` dá timeout *(ManageMessages)*" },
      { nome: "filtro", valor: "[status|on|off|porminuto <n>|teste <texto>]", desc: "a peneira anti-barulho da transmissão; `teste` mostra se uma frase seria falada e por quê" },
      { nome: "cooldown", valor: "<segundos>", desc: "espera mínima entre duas falas **da mesma pessoa** (0 desliga)" },
      { nome: "nomes", valor: "on | off", desc: "anunciar \"Fulano disse:\" antes de cada frase" },
      { nome: "voz", valor: "[nome]", desc: "qual voz do Piper usar" },
      { nome: "tom", valor: "<n>", desc: "altura da voz (1 = original)" },
      { nome: "efeito", valor: "<nome>", desc: "caráter da voz: robo, radio, glados…" },
      { nome: "dicionario", valor: "[lista|teste <frase>|add <abrev> <texto>|remove <abrev>|padrao on|off]", desc: "como abreviações são lidas em voz alta (`vc` → `você`). Ver e testar é livre; mudar é *(ManageMessages)*" },
      { nome: "estado", desc: "diagnóstico da cadeia inteira: serviço, Piper, LiveKit, peneira e em quais calls está" },
    ],
    debug: [
      { nome: "(nada)", desc: "o relatório completo: o que está quebrado primeiro, depois cada área" },
      { nome: "@pessoa", desc: "o que o bot consegue fazer com essa pessoa" },
      { nome: "#canal", desc: "a conta de permissão do bot nesse canal (aceita o nome)" },
    ],
    tutorial: [
      { nome: "(nada)", desc: "o guia em páginas, na ordem: permissões → canais → proteção → boas-vindas e cargos → XP e RPG → checklist" },
      { nome: "<número>", desc: "abre direto aquela página (para celular ou quando não dá para reagir)" },
      { nome: "<área>", desc: "aprofunda um assunto: `canais`, `permissoes`, `moderacao`, `logs`, `cargos`, `xp`, `mensagens`, `noticias`, `rpg`, `aventura`, `economia`, `ajustes`" },
    ],

    assistente: [
      { nome: "(nada)", desc: "menu: escolhe qual roteiro seguir" },
      { nome: "rapido", desc: "5 perguntas: idioma, staff, log, nível de proteção, boas-vindas. Uns 2 minutos" },
      { nome: "completo", desc: "o rápido + escada de punição, lista global, XP e cargo automático" },
      { nome: "canais", desc: "classifica seus canais nos 3 tipos e mostra exatamente o que clicar no Stoat" },
      { nome: "protecao", desc: "só a parte de automod, sentinela e punição" },
      { nome: "cancelar", desc: "abandona o assistente em andamento" },
      { nome: "Respostas", desc: "durante o assistente, responda em texto normal. `pular` pula a pergunta, `voltar` volta uma" },
    ],
  };
}

function parametrosEN(P) {
  const joinLeave = () => [
    { nome: "canal", valor: "<#channel|here|id>", desc: "where to post. `here` = this channel. Setting the channel also **turns it on**" },
    { nome: "on | off", desc: "toggles without losing the configuration" },
    { nome: "titulo", valor: "<text>", desc: "the embed's top line. Accepts the markers below" },
    { nome: "texto", valor: "<description>", desc: "the embed body (can span lines). Accepts the markers" },
    { nome: "cor", valor: "<#hex|name>", desc: "sidebar color: `#FF71CE`, `purple`, `blue`… (`&cor presets` lists the gradients)" },
    { nome: "imagem", valor: "<url|clear>", desc: "cover. A Stoat attachment becomes the embed cover; an external URL shows as a preview below" },
    { nome: "imagem", valor: "visible | hidden", desc: "whether the external URL is shown in text or hidden (default: hidden)" },
    { nome: "testar", desc: "posts it now using you as the example — no need to wait for someone to join" },
    { nome: "padrao", desc: "resets title and text to factory (keeps the channel)" },
    { nome: "status", desc: "shows the current setup and a preview" },
    { nome: "Markers", desc: "`{usuario}` mentions the person · `{nome}` just the name · `{servidor}` server name · `{membros}` member count" },
  ];
  return {
    boasvindas: joinLeave(),

    automod: [
      { nome: "off | on", desc: "turns the whole automod off or on at once (a new server starts off)" },
      { nome: "<group>", desc: "name only: shows the group's parts, numbers and punishment" },
      { nome: "<group> on|off", desc: "toggles the whole group: `antispam`, `antinoise`, `antilink`, `sentinel`" },
      { nome: "<group> <part> on|off", desc: "one part only (e.g. `antinoise caps off`, `antispam media on`) — `&automod <group>` lists the parts" },
      { nome: "<group> set", valor: "<parameter> <value>", desc: "tunes a number: `antispam set messages 5`, `antinoise set threshold 0.7` — `&automod <group>` shows the parameters" },
      { nome: "<group> punishment", valor: "<mode|inherit>", desc: "punishment for that group only; `inherit` goes back to the one from `&automod punishment`" },
      { nome: "debug on|off", desc: "verbose console log (global, owner only)" },
    ],

    punicao: [
      { nome: "mode", valor: "warn | delete | confirm | stack | ban", desc: "`warn` only warns · `delete` removes the message · `confirm` silences and calls a moderator · `stack` climbs a ladder on repeat · `ban` bans on the spot" },
      { nome: "ladder", valor: "[warn,10m,2h,ban]", desc: "the steps of `stack` mode. Without a value, shows the current one. Default: warning → 5 min mute → 1 h mute → ban" },
      { nome: "warns", valor: "<n>", desc: `how many warnings until a ban — adjusts the ladder (the ban is always the last step). Applies to the automod and to \`${citar("warn", "en", P)}\`` },
      { nome: "expiry", valor: "<days|0>", desc: "warnings reset after that many days without a new one (default 30; 0 = never). Without a value, shows the current one" },
      { nome: "status", desc: "the current setup" },
      { nome: "Not here", desc: `\`test\`/\`simulate\` belong to \`&automod sentinel\` (it's the one that reads the text); warnings are \`${citar("warn", "en", P)}\`, \`${citar("warn.lista", "en", P)}\` and \`${citar("warn.limpar", "en", P)}\`. \`&automod punishment\` only decides **what happens** afterwards` },
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

    acesso: [
      { nome: "cargo add | remove", valor: "<@role|name|id>", desc: "roles with access to moderation commands (same list as `&staff`)" },
      { nome: "cargo limpar", desc: "empties the list" },
      { nome: "canal", valor: "all | only | except", desc: "mode: commands everywhere, only in listed channels, or everywhere except listed" },
      { nome: "canal add | remove", valor: "<#channel>", desc: "builds the channel list for the chosen mode" },
      { nome: "staffignora", valor: "on | off", desc: "whether staff can use commands outside the allowed channels" },
      { nome: "livre", valor: "<command> on | off", desc: "the command works in any channel, even with the restriction (e.g. `entertainment`, for the games)" },
      { nome: "status", desc: "the current setup" },
    ],

    banglobal: [
      { nome: "off", desc: "ignores the global list" },
      { nome: "avisar", desc: "when someone banned elsewhere joins, logs a warning and does nothing" },
      { nome: "imediato", desc: "bans **on join** anyone banned on **any** other server (1 ban is enough) — `banir`, the old name, works the same" },
      { nome: "consenso", desc: "bans **on join** only people banned on **3+ different servers**; with fewer, alerts the staff in the log" },
      { nome: "lista", valor: "[server]", desc: "everyone on the global list; with `server`, only those banned by this server" },
      { nome: "historico", valor: "<@user|id>", desc: "which servers banned that person, and why" },
      { nome: "revisar", desc: "checks who's already here against the list — **shows only, never bans**" },
      { nome: "varrer", desc: "shows who would be banned and **waits for confirmation**; only acts in `imediato` and `consenso` modes" },
      { nome: "varrer confirmar", desc: "⚠️ actually bans whoever the sweep found" },
      { nome: "isentar", valor: "<@user|id>", desc: "accepts that person **on this server** despite the list; if the bot had banned them, undoes it" },
      { nome: "isentar remover", valor: "<@user|id>", desc: "makes the list apply to them again" },
      { nome: "isentos", desc: "who is exempt here" },
      { nome: "desfazer", desc: "↩️ reverts the bans **the list** applied here and exempts those people (leaves manual and automod bans alone)" },
      { nome: "esquecer", valor: "<@user|id> [note]", desc: "deletes that person's records **for every server** and keeps them out: future bans and the 6-hourly import skip them — much stronger than `isentar`" },
      { nome: "ignorados", desc: "who is marked to stay off the list, and why" },
      { nome: "lembrar", valor: "<@user|id>", desc: "undoes `esquecer`: they can enter the list again on their next ban (old records stay deleted)" },
      { nome: "bots", valor: "[confirm|<@user>]", desc: "finds bots already on the list and removes them **for good**. With a user, says **which signal** identified them (or why none did)" },
      { nome: "How to point at someone", desc: "mention · **ID** · profile link · **name** · `Name#0000` · server nickname. If the name matches more than one person, I show the candidates instead of picking" },
    ],

    reactionrole: [
      { nome: "add", valor: "<message> <emoji> <role>", desc: "wires emoji → role. The message can be the **link** (`...` → Copy link) or the ID" },
      { nome: "remove", valor: "<message> <emoji>", desc: "undoes a wiring" },
      { nome: "list", desc: "everything wired on this server" },
      { nome: "exclusivo", valor: "<message> on|off", desc: "only one role at a time on that message (color, team): picking one swaps the previous" },
      { nome: "recarregar", desc: "if roles stopped being handed out after a restart. It also **puts back** emojis that vanished from the panel (they go to the end of the row)" },
      { nome: "ordem", valor: "<message> confirm", desc: "rebuilds the panel in the configured order. Clears everyone's reactions and reacts again one by one — roles stay, only the ✓ goes. A big panel takes ~1s per emoji: Stoat only accepts 15 requests per window" },
    ],

    cor: [
      { nome: "<role> <color>", desc: "solid color: `#FF00AA` or a name (`purple`, `blue`…)" },
      { nome: "<role> gradiente", valor: "<color> <color> [...]", desc: "two or more colors; a leading number becomes the angle" },
      { nome: "<role> preset", valor: "<name>", desc: "ready-made palette (`&cor presets` lists them)" },
      { nome: "<role> remover", desc: "removes the color" },
      { nome: "painel aqui", desc: "creates the color roles (solid and gradients), posts the panel, reacts and wires the reaction roles — all at once. `solid` or `gradients` at the end: only one group" },
      { nome: "criar", desc: "only creates/paints the roles, posts nothing" },
      { nome: "lista | presets", desc: "what exists" },
    ],

    xp: [
      { nome: "(nothing) | rank", valor: "[@user]", desc: "level, XP and progress" },
      { nome: "top", desc: "server ranking" },
      { nome: "on | off", desc: "toggles the system" },
      { nome: "setup", desc: "opens the configuration: roles every N levels, multiplier, max level, announcement channel" },
      { nome: "setup multiplicador", valor: "<n>", desc: "XP per message × n" },
      { nome: "setup intervalo", valor: "<seconds>", desc: "minimum time between two XP-giving messages (anti-farm)" },
      { nome: "setup nivelmaximo", valor: "<n>", desc: "level cap" },
      { nome: "setup anuncio", valor: "<#channel|here|off>", desc: "where to announce level-ups" },
      { nome: "cargos", desc: "lists the level roles" },
      { nome: "criarcargos", desc: "creates the level roles by itself" },
      { nome: "sincronizar", valor: "[@user|all]", desc: "hands back the roles the current level already grants — for people who left and came back, or when the roles were created later *(ManagePermissions)*" },
      { nome: "reset", valor: "confirm", desc: "wipes **everyone's** XP on the server" },
    ],

    staff: [
      { nome: "(nothing)", desc: "the team: each staff role and who has it" },
      { nome: "add | remove", valor: "<@role|name>", desc: "same list as `&acesso cargo` — whoever is here can use moderation commands" },
      { nome: "titulo", valor: "<text>", desc: "the panel title" },
    ],

    fuso: [
      { nome: "(nothing) | lista", desc: "the time in every configured city" },
      { nome: "add", valor: "<city>", desc: "accepts a name, `City/Country` and nicknames (`sp`, `tokyo`)" },
      { nome: "remove", valor: "<city>", desc: "removes from the list" },
      { nome: "ver", valor: "<city>", desc: "one city's time without adding it" },
      { nome: "buscar", valor: "<text>", desc: "finds the right name" },
      { nome: "apelido", valor: "<city> <name>", desc: "how the city is labelled (\"Home\", \"Office\")" },
      { nome: "principal", valor: "<city>", desc: "the reference the difference is counted from" },
      { nome: "formato", valor: "12 | 24", desc: "time format" },
    ],

    rss: [
      { nome: "add", valor: "<url> [category]", desc: "follows a feed. The category groups the digests: each topic gets its own block instead of everything squeezed into one" },
      { nome: "category", valor: "<id|url> <name|off>", desc: "sets or clears the category of an existing feed (`&rss list` shows the ids). Without one, the feed digests under **General**" },
      { nome: "remove", valor: "<url|number>", desc: "stops following" },
      { nome: "list", desc: "followed feeds" },
      { nome: "canal", valor: "<#channel|here>", desc: "where to post" },
      { nome: "agora", desc: "fetches and posts now (test)" },
      { nome: "off", desc: "turns it off" },
    ],

    musica: [
      { nome: "<link or name>", desc: "plays (YouTube, SoundCloud, Spotify); if something is on, it queues. YouTube/SoundCloud playlists come in whole" },
      { nome: "pausar | play", desc: "pause and resume (`play` followed by text becomes `tocar`)" },
      { nome: "skip", desc: "skips to the next in the queue" },
      { nome: "fila", desc: "what's playing and the current queue" },
      { nome: "parar", desc: "stops and clears the queue" },
      { nome: "volume", valor: "<0-200>", desc: "music volume in % (ducking restores to this value)" },
      { nome: "loop", valor: "faixa | fila | nao", desc: "repeats the current track, the whole queue, or turns it off" },
      { nome: "Joining and leaving", desc: "`&entrar` and `&sair` — the same call serves TTS and music; while TTS speaks, the music **ducks by itself** and comes back after" },
      { nome: "Spotify", desc: "single tracks keyless; playlists/albums need `SPOTIFY_ID`/`SPOTIFY_SECRET` in the host's `.env`" },
    ],

    tts: [
      { nome: "<text>", desc: "Judy says it in the call right now (skips the sieve — it's an explicit request)" },
      { nome: "falar", valor: "<text>", desc: "forces speech even when the text looks like a subcommand (`&tts falar sair`)" },
      { nome: "entrar", desc: "⭐ **the only command that matters**: from any channel, she joins the call you're in (or `&entrar <call>`) and starts speaking everything written **in the channel where you typed it**. If she's in another call, she **moves to yours**. Turns the system on, picks the call and the reading by herself" },
      { nome: "sair", desc: "leaves the call **and** stops reading. After that, only `entrar` brings the bot back" },
      { nome: "diagnostico", desc: "**where** joining jams: at Stoat's API or on the network to LiveKit — with a verdict for each case *(ManageMessages)*" },
      { nome: "destravar", desc: "clears `AlreadyConnected` — when Stoat thinks the bot is already in a call and refuses every new join *(ManageMessages)*" },
      { nome: "resgatar", valor: "[#helper-call]", desc: "what `entrar` already does by itself when Stoat says `AlreadyConnected`, but picking the helper call by hand: joins it, moves itself into the stuck call through Stoat's PATCH and connects for real" },
      { nome: "reiniciar", desc: "rebuilds the voice service's connection without a terminal — use it when `entrar` times out *(ManageMessages)*" },
      { nome: "filtro", valor: "[status|on|off|porminuto <n>|teste <text>]", desc: "the broadcast's noise sieve; `teste` shows whether a sentence would be spoken and why" },
      { nome: "cooldown", valor: "<seconds>", desc: "minimum wait between two utterances **from the same person** (0 disables)" },
      { nome: "nomes", valor: "on | off", desc: "announce \"So-and-so said:\" before each sentence" },
      { nome: "voz", valor: "[name]", desc: "which Piper voice to use" },
      { nome: "tom", valor: "<n>", desc: "voice pitch (1 = original)" },
      { nome: "efeito", valor: "<name>", desc: "voice character: robo, radio, glados…" },
      { nome: "dicionario", valor: "[lista|teste <phrase>|add <abbrev> <text>|remove <abbrev>|padrao on|off]", desc: "how abbreviations are read aloud (`vc` → `você`). Viewing and testing is open; changing needs *(ManageMessages)*" },
      { nome: "estado", desc: "diagnostics for the whole chain: service, Piper, LiveKit, sieve and which calls it's in" },
    ],
    debug: [
      { nome: "(nothing)", desc: "the full report: what's broken first, then each area" },
      { nome: "@user", desc: "what the bot can do with that person" },
      { nome: "#channel", desc: "the bot's permission math in that channel (the name works too)" },
    ],
    tutorial: [
      { nome: "(nothing)", desc: "the paged guide, in order: permissions → channels → protection → welcome and roles → XP and RPG → checklist" },
      { nome: "<number>", desc: "opens that page directly (for mobile or when you can't react)" },
      { nome: "<area>", desc: "goes deeper on one subject: `canais`, `permissoes`, `moderacao`, `logs`, `cargos`, `xp`, `mensagens`, `noticias`, `rpg`, `aventura`, `economia`, `ajustes`" },
    ],

    assistente: [
      { nome: "(nothing)", desc: "menu: pick which script to follow" },
      { nome: "rapido", desc: "5 questions: language, staff, log, protection level, welcome. About 2 minutes" },
      { nome: "completo", desc: "quick + punishment ladder, global list, XP and autorole" },
      { nome: "canais", desc: "sorts your channels into the 3 types and shows exactly what to click in Stoat" },
      { nome: "protecao", desc: "only the automod, sentinel and punishment part" },
      { nome: "cancelar", desc: "abandons the running wizard" },
      { nome: "Answers", desc: "during the wizard, answer in plain text. `skip` skips a question, `back` goes back one" },
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
