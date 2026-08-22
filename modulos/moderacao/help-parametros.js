// ══════════════════════════════════════════════════════════
//  help-parametros.js — o que CADA parâmetro de um comando significa
//
//  O `&help boasvindas` mostrava `[canal|titulo|texto|cor|imagem|…]`
//  e parava aí — quem nunca viu o comando não sabe o que "cor" aceita
//  nem o que "{membros}" faz. Esta tabela alimenta a seção
//  **Parâmetros** do `&help <comando>`: uma linha por opção, com o
//  valor que ela espera e o que acontece.
//
//  Formato: { comando: [ { nome, valor?, desc } ] }
//   nome  — o token que a pessoa digita (em PT; o aliases.js traduz)
//   valor — o que vem depois (opcional)
//   desc  — o que faz, em uma linha
//
//  O teste exige que todo comando listado em PT exista em EN com o
//  mesmo número de parâmetros — ninguém fica sem explicação num
//  idioma só.
// ══════════════════════════════════════════════════════════

export function parametros(P, lang = "pt") {
  return lang === "en" ? parametrosEN(P) : parametrosPT(P);
}

// Marcadores aceitos nos textos de boas-vindas/adeus/embed.
export const MARCADORES = ["{usuario}", "{nome}", "{servidor}", "{membros}"];

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
    adeus: entradaSaida("adeus"),

    automod: [
      { nome: "status", desc: "lista cada filtro e se está ligado" },
      { nome: "<filtro>", desc: "só o nome: mostra os parâmetros daquele filtro e a punição dele" },
      { nome: "<filtro> on|off", desc: "liga/desliga. Filtros: `antispam`, `antimassspam`, `antiinvite`, `antimassmention`, `anticaps`, `antilink`, `sentinela`, `anticaracteres`, `antirepeticao`" },
      { nome: "<filtro> set", valor: "<parâmetro> <valor>", desc: "ajusta um número: `antispam set mensagens 5`, `anticaps set limiar 0.7`" },
      { nome: "<filtro> punicao", valor: "<modo|herdar>", desc: "punição só desse filtro; `herdar` volta a usar a global do `&punicao`" },
      { nome: "debug on|off", desc: "log detalhado no console (global, só o dono)" },
    ],

    punicao: [
      { nome: "modo", valor: "avisar | apagar | confirmar | acumular | banir", desc: "`avisar` só avisa · `apagar` remove a mensagem · `confirmar` silencia e chama um moderador · `acumular` sobe uma escada a cada reincidência · `banir` bane na hora" },
      { nome: "escada", valor: "[aviso,10m,2h,ban]", desc: "os degraus do modo `acumular`. Sem valor, mostra a atual. Padrão: aviso → mute 5 min → mute 1 h → ban" },
      { nome: "warns", valor: "<n>", desc: "quantos avisos até o ban (modo `acumular` antigo)" },
      { nome: "silencerole", valor: "<cargo>", desc: "qual cargo é o de silêncio (ou crie um com `&cargomudo`)" },
      { nome: "status", desc: "a configuração atual" },
    ],

    sentinela: [
      { nome: "on | off", desc: "liga/desliga o filtro que julga conteúdo (golpe, +18, gore, apologia)" },
      { nome: "sensitivity", valor: "baixa | media | alta", desc: "quão desconfiado ele é. `alta` pega mais e erra mais" },
      { nome: "antiguidade", valor: "on | off", desc: "mais rígido com quem acabou de chegar (usa o nível de XP como medida de tempo de casa)" },
      { nome: "alerta", valor: "on | off", desc: "avisa a staff quando alguém levanta suspeita repetidas vezes, antes de punir" },
      { nome: "channel", valor: "<#canal|aqui|off>", desc: "canal dos avisos e do `simulate`" },
      { nome: "test", valor: "<texto>", desc: "mostra a nota (0–10) que esse texto levaria — não pune ninguém" },
      { nome: "simulate", valor: "<texto>", desc: "dispara o fluxo real no canal de avisos" },
      { nome: "ban | dismiss", valor: "<id>", desc: "decide um caso pendente do modo `confirmar`" },
    ],

    log: [
      { nome: "canal", valor: "<#canal|aqui|id>", desc: "onde o bot escreve o que aconteceu (um canal que só a staff vê)" },
      { nome: "off", desc: "desliga o registro" },
      { nome: "<evento> on|off", desc: "`punicoes` · `membros` (entrou/saiu) · `mensagens` (apagadas/editadas) · `cargos` · `comandos` (barulhento, começa desligado)" },
    ],

    acesso: [
      { nome: "cargo add | remove", valor: "<@cargo|nome|id>", desc: "cargos com acesso aos comandos de moderação (é a mesma lista do `&staff`)" },
      { nome: "cargo limpar", desc: "esvazia a lista" },
      { nome: "canal", valor: "todos | somente | exceto", desc: "modo: comandos em todo lugar, só nos canais listados, ou em todos menos os listados" },
      { nome: "canal add | remove", valor: "<#canal>", desc: "monta a lista de canais do modo escolhido" },
      { nome: "staffignora", valor: "on | off", desc: "se a staff pode usar comandos fora dos canais permitidos" },
      { nome: "status", desc: "a configuração atual" },
    ],

    banglobal: [
      { nome: "off", desc: "ignora a lista global" },
      { nome: "avisar", desc: "quando entra alguém banido em outro servidor, avisa no log e não faz nada" },
      { nome: "banir", desc: "bane automaticamente quem está na lista **ao entrar**" },
      { nome: "lista", valor: "[servidor]", desc: "todas as pessoas da lista global; com `servidor`, só as banidas por este servidor" },
      { nome: "historico", valor: "<@pessoa|id>", desc: "em quais servidores essa pessoa foi banida e por quê" },
      { nome: "revisar", desc: "confere quem já está aqui contra a lista — **só mostra, nunca bane**" },
      { nome: "varrer", desc: "mostra quem seria banido e **espera confirmação**; só age no modo `banir`" },
      { nome: "varrer confirmar", desc: "⚠️ bane de verdade quem a varredura encontrou" },
      { nome: "isentar", valor: "<@pessoa|id>", desc: "aceita a pessoa **neste servidor** apesar da lista; se o bot a tinha banido, desfaz o ban" },
      { nome: "isentar remover", valor: "<@pessoa|id>", desc: "volta a tratá-la pela lista" },
      { nome: "isentos", desc: "quem está isento aqui" },
      { nome: "desfazer", desc: "↩️ reverte os bans que **a lista** aplicou aqui e isenta as pessoas (não toca em ban manual nem do automod)" },
      { nome: "esquecer", valor: "<@pessoa|id>", desc: "apaga os registros dessa pessoa **para todos os servidores** — bem mais forte que `isentar`" },
      { nome: "bots", desc: "acha bots que já estavam na lista e os remove (bots novos não entram mais: ninguém adiciona um bot sem querer)" },
      { nome: "Como indicar alguém", desc: "menção · **ID** · link do perfil · **nome** · `Nome#0000` · apelido no servidor. Se o nome bater em mais de uma pessoa, eu mostro os candidatos em vez de escolher" },
    ],

    reactionrole: [
      { nome: "add", valor: "<mensagem> <emoji> <cargo>", desc: "liga emoji → cargo. A mensagem pode ser o **link** (`...` → Copiar link) ou o ID" },
      { nome: "remove", valor: "<mensagem> <emoji>", desc: "desfaz uma ligação" },
      { nome: "list", desc: "tudo que está ligado neste servidor" },
      { nome: "exclusivo", valor: "<mensagem> on|off", desc: "nessa mensagem só vale um cargo por vez (cor, time): escolher um troca o anterior" },
      { nome: "recarregar", desc: "se os cargos pararam de ser dados depois de um reinício" },
    ],

    cor: [
      { nome: "<cargo> <cor>", desc: "cor sólida: `#FF00AA` ou um nome (`roxo`, `azul`…)" },
      { nome: "<cargo> gradiente", valor: "<cor> <cor> [...]", desc: "duas ou mais cores; um número no início vira o ângulo" },
      { nome: "<cargo> preset", valor: "<nome>", desc: "paleta pronta (`&cor presets` lista)" },
      { nome: "<cargo> remover", desc: "tira a cor" },
      { nome: "painel aqui", desc: "cria os cargos de cor, publica o painel, reage e liga os cargos por reação — tudo de uma vez" },
      { nome: "criar", desc: "só cria/pinta os cargos, sem publicar nada" },
      { nome: "lista | presets", desc: "o que existe" },
    ],

    embed: [
      { nome: "titulo:", valor: "<texto>", desc: "a linha de cima" },
      { nome: "descricao:", valor: "<texto>", desc: "o corpo (pode ter várias linhas; tudo até o próximo campo)" },
      { nome: "cor:", valor: "<#hex|nome>", desc: "cor da barra" },
      { nome: "rodape:", valor: "<texto>", desc: "linha pequena no fim" },
      { nome: "imagem:", valor: "<url>", desc: "capa (anexo do Stoat) ou pré-visualização (URL de fora)" },
      { nome: "canal:", valor: "<#canal>", desc: "publica em outro canal" },
      { nome: "Formato", desc: "campos separados por `|` numa linha só, ou um por linha. Ex.: `&embed titulo: Regras | descricao: Seja legal | cor: azul`" },
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
      { nome: "reset", valor: "[@pessoa] confirmar", desc: "zera o XP de alguém (ou de todos)" },
    ],

    limpar: [
      { nome: "<n>", desc: "quantas mensagens apagar (as últimas)" },
      { nome: "[@pessoa]", desc: "só as mensagens dessa pessoa, dentro das últimas n" },
    ],

    warn: [
      { nome: "<@pessoa|id|nome>", desc: "quem recebe o aviso" },
      { nome: "[motivo]", desc: "fica no histórico e no log" },
    ],

    comando: [
      { nome: "<nome> on|off", desc: "liga/desliga um comando neste servidor (todos os apelidos dele juntos)" },
      { nome: "list", desc: "o que está desligado" },
      { nome: "Essenciais", desc: "`help`, `comando`, `debug` e `idioma` nunca desligam — senão o admin se tranca fora" },
    ],

    autorole: [
      { nome: "<cargo>", desc: "cargo entregue a quem entra (nome, menção ou ID)" },
      { nome: "off", desc: "desliga" },
    ],

    idioma: [
      { nome: "pt | en", desc: "idioma das respostas e dos nomes de comando exibidos neste servidor" },
      { nome: "status", desc: "o idioma atual" },
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
      { nome: "add", valor: "<url>", desc: "acompanha um feed" },
      { nome: "remove", valor: "<url|número>", desc: "para de acompanhar" },
      { nome: "list", desc: "feeds acompanhados" },
      { nome: "canal", valor: "<#canal|aqui>", desc: "onde publicar" },
      { nome: "agora", desc: "busca e publica agora (teste)" },
      { nome: "off", desc: "desliga" },
    ],

    tts: [
      { nome: "<texto>", desc: "a Judy fala isso na call agora (não passa pela peneira — é pedido explícito)" },
      { nome: "falar", valor: "<texto>", desc: "força a fala mesmo que o texto pareça um subcomando (`&tts falar sair`)" },
      { nome: "canal", valor: "<#voz|aqui>", desc: "em qual call ela fala. Digite dentro da call e use `aqui`" },
      { nome: "transmitir", valor: "<#texto|off>", desc: "tudo escrito nesse canal vira fala na call. Vale para **todo mundo** que escrever lá" },
      { nome: "entrar | sair", desc: "conecta/desconecta da call. Depois de `sair`, a transmissão **não** traz o bot de volta sozinha" },
      { nome: "diagnostico", desc: "**onde** a entrada trava: na API do Stoat ou na rede até o LiveKit — com o veredito de cada caso *(ManageMessages)*" },
      { nome: "reiniciar", desc: "destrava o serviço de voz sem ir ao terminal — use quando `entrar` dá timeout *(ManageMessages)*" },
      { nome: "filtro", valor: "[status|on|off|porminuto <n>|teste <texto>]", desc: "a peneira anti-barulho da transmissão; `teste` mostra se uma frase seria falada e por quê" },
      { nome: "cooldown", valor: "<segundos>", desc: "espera mínima entre duas falas **da mesma pessoa** (0 desliga)" },
      { nome: "nomes", valor: "on | off", desc: "anunciar \"Fulano disse:\" antes de cada frase" },
      { nome: "voz", valor: "[nome]", desc: "qual voz do Piper usar" },
      { nome: "tom", valor: "<n>", desc: "altura da voz (1 = original)" },
      { nome: "efeito", valor: "<nome>", desc: "caráter da voz: robo, radio, glados…" },
      { nome: "dicionario", valor: "[add|remove|lista|padrao on|off]", desc: "como abreviações são lidas em voz alta (`vc` → `você`)" },
      { nome: "estado", desc: "diagnóstico da cadeia inteira: serviço, Piper, LiveKit, peneira e em quais calls está" },
    ],
    cargomudo: [
      { nome: "[nome]", desc: "cria o cargo de silêncio (padrão \"Silenciado\") e nega \"Enviar mensagens\" nele em todos os canais" },
      { nome: "canais", desc: "reaplica a negação em todos os canais (depois de criar canais novos)" },
    ],

    tutorial: [
      { nome: "(nada)", desc: "o guia em páginas, na ordem: permissões → canais → proteção → boas-vindas e cargos → XP e RPG → checklist" },
      { nome: "<número>", desc: "abre direto aquela página (para celular ou quando não dá para reagir)" },
      { nome: "<área>", desc: "aprofunda um assunto: `canais`, `permissoes`, `moderacao`, `logs`, `cargos`, `xp`, `mensagens`, `noticias`, `game`, `rpg`, `aventura`, `economia`, `ajustes`" },
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
    { nome: "canal", valor: "<#channel|aqui|id>", desc: "where to post. `aqui` = this channel. Setting the channel also **turns it on**" },
    { nome: "on | off", desc: "toggles without losing the configuration" },
    { nome: "titulo", valor: "<text>", desc: "the embed's top line. Accepts the markers below" },
    { nome: "texto", valor: "<description>", desc: "the embed body (can span lines). Accepts the markers" },
    { nome: "cor", valor: "<#hex|name>", desc: "sidebar color: `#FF71CE`, `roxo`, `azul`… (`&cor presets` lists the names)" },
    { nome: "imagem", valor: "<url|limpar>", desc: "cover. A Stoat attachment becomes the embed cover; an external URL shows as a preview below" },
    { nome: "imagem", valor: "visivel | oculto", desc: "whether the external URL is shown in text or hidden (default: hidden)" },
    { nome: "testar", desc: "posts it now using you as the example — no need to wait for someone to join" },
    { nome: "padrao", desc: "resets title and text to factory (keeps the channel)" },
    { nome: "status", desc: "shows the current setup and a preview" },
    { nome: "Markers", desc: "`{usuario}` mentions the person · `{nome}` just the name · `{servidor}` server name · `{membros}` member count" },
  ];
  return {
    boasvindas: joinLeave(),
    adeus: joinLeave(),

    automod: [
      { nome: "status", desc: "lists each filter and whether it's on" },
      { nome: "<filter>", desc: "name only: shows that filter's parameters and punishment" },
      { nome: "<filter> on|off", desc: "toggles. Filters: `antispam`, `antimassspam`, `antiinvite`, `antimassmention`, `anticaps`, `antilink`, `sentinela`, `anticaracteres`, `antirepeticao`" },
      { nome: "<filter> set", valor: "<parameter> <value>", desc: "tunes a number: `antispam set mensagens 5`, `anticaps set limiar 0.7`" },
      { nome: "<filter> punicao", valor: "<mode|herdar>", desc: "punishment for that filter only; `herdar` goes back to the global one from `&punicao`" },
      { nome: "debug on|off", desc: "verbose console log (global, owner only)" },
    ],

    punicao: [
      { nome: "modo", valor: "avisar | apagar | confirmar | acumular | banir", desc: "`avisar` warns only · `apagar` removes the message · `confirmar` silences and calls a moderator · `acumular` climbs a ladder on repeat · `banir` bans on the spot" },
      { nome: "escada", valor: "[aviso,10m,2h,ban]", desc: "the steps of `acumular` mode. Without a value, shows the current one. Default: warning → 5 min mute → 1 h mute → ban" },
      { nome: "warns", valor: "<n>", desc: "how many warnings until a ban (legacy `acumular`)" },
      { nome: "silencerole", valor: "<role>", desc: "which role is the silence role (or create one with `&cargomudo`)" },
      { nome: "status", desc: "the current setup" },
    ],

    sentinela: [
      { nome: "on | off", desc: "toggles the filter that judges content (scams, NSFW, gore, glorifying crime)" },
      { nome: "sensitivity", valor: "baixa | media | alta", desc: "how suspicious it is. `alta` catches more and errs more" },
      { nome: "antiguidade", valor: "on | off", desc: "stricter with newcomers (uses XP level as a proxy for time on the server)" },
      { nome: "alerta", valor: "on | off", desc: "alerts the staff when someone raises suspicion repeatedly, before punishing" },
      { nome: "channel", valor: "<#channel|aqui|off>", desc: "channel for alerts and `simulate`" },
      { nome: "test", valor: "<text>", desc: "shows the score (0–10) that text would get — punishes no one" },
      { nome: "simulate", valor: "<text>", desc: "fires the real flow in the alerts channel" },
      { nome: "ban | dismiss", valor: "<id>", desc: "decides a pending case from `confirmar` mode" },
    ],

    log: [
      { nome: "canal", valor: "<#channel|aqui|id>", desc: "where the bot writes down what happened (a staff-only channel)" },
      { nome: "off", desc: "turns logging off" },
      { nome: "<event> on|off", desc: "`punicoes` · `membros` (joined/left) · `mensagens` (deleted/edited) · `cargos` · `comandos` (noisy, starts off)" },
    ],

    acesso: [
      { nome: "cargo add | remove", valor: "<@role|name|id>", desc: "roles with access to moderation commands (same list as `&staff`)" },
      { nome: "cargo limpar", desc: "empties the list" },
      { nome: "canal", valor: "todos | somente | exceto", desc: "mode: commands everywhere, only in listed channels, or everywhere except listed" },
      { nome: "canal add | remove", valor: "<#channel>", desc: "builds the channel list for the chosen mode" },
      { nome: "staffignora", valor: "on | off", desc: "whether staff can use commands outside the allowed channels" },
      { nome: "status", desc: "the current setup" },
    ],

    banglobal: [
      { nome: "off", desc: "ignores the global list" },
      { nome: "avisar", desc: "when someone banned elsewhere joins, logs a warning and does nothing" },
      { nome: "banir", desc: "auto-bans anyone on the list **on join**" },
      { nome: "lista", valor: "[servidor]", desc: "everyone on the global list; with `servidor`, only those banned by this server" },
      { nome: "historico", valor: "<@user|id>", desc: "which servers banned that person, and why" },
      { nome: "revisar", desc: "checks who's already here against the list — **shows only, never bans**" },
      { nome: "varrer", desc: "shows who would be banned and **waits for confirmation**; only acts in `banir` mode" },
      { nome: "varrer confirmar", desc: "⚠️ actually bans whoever the sweep found" },
      { nome: "isentar", valor: "<@user|id>", desc: "accepts that person **on this server** despite the list; if the bot had banned them, undoes it" },
      { nome: "isentar remover", valor: "<@user|id>", desc: "makes the list apply to them again" },
      { nome: "isentos", desc: "who is exempt here" },
      { nome: "desfazer", desc: "↩️ reverts the bans **the list** applied here and exempts those people (leaves manual and automod bans alone)" },
      { nome: "esquecer", valor: "<@user|id>", desc: "deletes that person's records **for every server** — much stronger than `isentar`" },
      { nome: "bots", desc: "finds bots already on the list and removes them (new bots no longer enter: nobody adds a bot by accident)" },
      { nome: "How to point at someone", desc: "mention · **ID** · profile link · **name** · `Name#0000` · server nickname. If the name matches more than one person, I show the candidates instead of picking" },
    ],

    reactionrole: [
      { nome: "add", valor: "<message> <emoji> <role>", desc: "wires emoji → role. The message can be the **link** (`...` → Copy link) or the ID" },
      { nome: "remove", valor: "<message> <emoji>", desc: "undoes a wiring" },
      { nome: "list", desc: "everything wired on this server" },
      { nome: "exclusivo", valor: "<message> on|off", desc: "only one role at a time on that message (color, team): picking one swaps the previous" },
      { nome: "recarregar", desc: "if roles stopped being handed out after a restart" },
    ],

    cor: [
      { nome: "<role> <color>", desc: "solid color: `#FF00AA` or a name (`roxo`, `azul`…)" },
      { nome: "<role> gradiente", valor: "<color> <color> [...]", desc: "two or more colors; a leading number becomes the angle" },
      { nome: "<role> preset", valor: "<name>", desc: "ready-made palette (`&cor presets` lists them)" },
      { nome: "<role> remover", desc: "removes the color" },
      { nome: "painel aqui", desc: "creates the color roles, posts the panel, reacts and wires the reaction roles — all at once" },
      { nome: "criar", desc: "only creates/paints the roles, posts nothing" },
      { nome: "lista | presets", desc: "what exists" },
    ],

    embed: [
      { nome: "titulo:", valor: "<text>", desc: "the top line" },
      { nome: "descricao:", valor: "<text>", desc: "the body (can span lines; everything until the next field)" },
      { nome: "cor:", valor: "<#hex|name>", desc: "bar color" },
      { nome: "rodape:", valor: "<text>", desc: "small line at the end" },
      { nome: "imagem:", valor: "<url>", desc: "cover (Stoat attachment) or preview (external URL)" },
      { nome: "canal:", valor: "<#channel>", desc: "posts in another channel" },
      { nome: "Format", desc: "fields separated by `|` on one line, or one per line. E.g. `&embed titulo: Rules | descricao: Be kind | cor: azul`" },
    ],

    xp: [
      { nome: "(nothing) | rank", valor: "[@user]", desc: "level, XP and progress" },
      { nome: "top", desc: "server ranking" },
      { nome: "on | off", desc: "toggles the system" },
      { nome: "setup", desc: "opens the configuration: roles every N levels, multiplier, max level, announcement channel" },
      { nome: "setup multiplicador", valor: "<n>", desc: "XP per message × n" },
      { nome: "setup intervalo", valor: "<seconds>", desc: "minimum time between two XP-giving messages (anti-farm)" },
      { nome: "setup nivelmaximo", valor: "<n>", desc: "level cap" },
      { nome: "setup anuncio", valor: "<#channel|aqui|off>", desc: "where to announce level-ups" },
      { nome: "cargos", desc: "lists the level roles" },
      { nome: "criarcargos", desc: "creates the level roles by itself" },
      { nome: "sincronizar", valor: "[@user|todos]", desc: "hands back the roles the current level already grants — for people who left and came back, or when the roles were created later *(ManagePermissions)*" },
      { nome: "reset", valor: "[@user] confirmar", desc: "wipes someone's XP (or everyone's)" },
    ],

    limpar: [
      { nome: "<n>", desc: "how many messages to delete (the latest)" },
      { nome: "[@user]", desc: "only that person's messages, within the latest n" },
    ],

    warn: [
      { nome: "<@user|id|name>", desc: "who gets the warning" },
      { nome: "[reason]", desc: "kept in the history and the log" },
    ],

    comando: [
      { nome: "<name> on|off", desc: "toggles a command on this server (all its aliases together)" },
      { nome: "list", desc: "what's off" },
      { nome: "Essentials", desc: "`help`, `comando`, `debug` and `idioma` never turn off — otherwise the admin locks themselves out" },
    ],

    autorole: [
      { nome: "<role>", desc: "role handed to whoever joins (name, mention or ID)" },
      { nome: "off", desc: "turns it off" },
    ],

    idioma: [
      { nome: "pt | en", desc: "language of the replies and of the command names shown on this server" },
      { nome: "status", desc: "the current language" },
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
      { nome: "add", valor: "<url>", desc: "follows a feed" },
      { nome: "remove", valor: "<url|number>", desc: "stops following" },
      { nome: "list", desc: "followed feeds" },
      { nome: "canal", valor: "<#channel|aqui>", desc: "where to post" },
      { nome: "agora", desc: "fetches and posts now (test)" },
      { nome: "off", desc: "turns it off" },
    ],

    tts: [
      { nome: "<text>", desc: "Judy says it in the call right now (skips the sieve — it's an explicit request)" },
      { nome: "falar", valor: "<text>", desc: "forces speech even when the text looks like a subcommand (`&tts falar sair`)" },
      { nome: "canal", valor: "<#voice|aqui>", desc: "which call she speaks in. Type inside the call and use `aqui`" },
      { nome: "transmitir", valor: "<#text|off>", desc: "everything written in that channel becomes speech in the call. Applies to **everyone** writing there" },
      { nome: "entrar | sair", desc: "connects/disconnects from the call. After `sair`, the broadcast will **not** drag the bot back" },
      { nome: "diagnostico", desc: "**where** joining jams: at Stoat's API or on the network to LiveKit — with a verdict for each case *(ManageMessages)*" },
      { nome: "reiniciar", desc: "unsticks the voice service without a terminal — use it when `entrar` times out *(ManageMessages)*" },
      { nome: "filtro", valor: "[status|on|off|porminuto <n>|teste <text>]", desc: "the broadcast's noise sieve; `teste` shows whether a sentence would be spoken and why" },
      { nome: "cooldown", valor: "<seconds>", desc: "minimum wait between two utterances **from the same person** (0 disables)" },
      { nome: "nomes", valor: "on | off", desc: "announce \"So-and-so said:\" before each sentence" },
      { nome: "voz", valor: "[name]", desc: "which Piper voice to use" },
      { nome: "tom", valor: "<n>", desc: "voice pitch (1 = original)" },
      { nome: "efeito", valor: "<name>", desc: "voice character: robo, radio, glados…" },
      { nome: "dicionario", valor: "[add|remove|lista|padrao on|off]", desc: "how abbreviations are read aloud (`vc` → `você`)" },
      { nome: "estado", desc: "diagnostics for the whole chain: service, Piper, LiveKit, sieve and which calls it's in" },
    ],
    cargomudo: [
      { nome: "[name]", desc: "creates the silence role (default \"Silenciado\") and denies \"Send messages\" for it in every channel" },
      { nome: "canais", desc: "re-applies the denial in every channel (after creating new channels)" },
    ],

    tutorial: [
      { nome: "(nothing)", desc: "the paged guide, in order: permissions → channels → protection → welcome and roles → XP and RPG → checklist" },
      { nome: "<number>", desc: "opens that page directly (for mobile or when you can't react)" },
      { nome: "<area>", desc: "goes deeper on one subject: `canais`, `permissoes`, `moderacao`, `logs`, `cargos`, `xp`, `mensagens`, `noticias`, `game`, `rpg`, `aventura`, `economia`, `ajustes`" },
    ],

    assistente: [
      { nome: "(nothing)", desc: "menu: pick which script to follow" },
      { nome: "rapido", desc: "5 questions: language, staff, log, protection level, welcome. About 2 minutes" },
      { nome: "completo", desc: "quick + punishment ladder, global list, XP and autorole" },
      { nome: "canais", desc: "sorts your channels into the 3 types and shows exactly what to click in Stoat" },
      { nome: "protecao", desc: "only the automod, sentinel and punishment part" },
      { nome: "cancelar", desc: "abandons the running wizard" },
      { nome: "Answers", desc: "during the wizard, answer in plain text. `pular` skips a question, `voltar` goes back one" },
    ],
  };
}

// Renderiza a seção **Parâmetros** de um comando (ou "" se não houver).
export function secaoParametros(P, lang, comando) {
  const lista = parametros(P, lang)[comando];
  if (!lista?.length) return "";
  // O nome do comando entra no cabeçalho de propósito: é ele que dá CONTEXTO
  // ao tradutor de exibição (aliases.exibir) para, num servidor em inglês,
  // mostrar `channel` em vez de `canal` nas linhas abaixo.
  const titulo = lang === "en" ? `Parameters of \`${P}${comando}\`` : `Parâmetros de \`${P}${comando}\``;
  const linhas = lista.map((p) => {
    const cab = p.valor ? `\`${p.nome}\` ${p.valor}` : `\`${p.nome}\``;
    return `• ${cab} — ${p.desc}`;
  });
  return `\n\n**${titulo}**\n${linhas.join("\n")}`;
}
