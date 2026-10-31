// Os rótulos da tela do &config, nos três idiomas (P2, 31 out 2026).
//
// A tela sai do `padraoServidor` (core/config-store.js), chave por chave: toda chave de
// lá tem rótulo aqui (o teste p2-registro-ajuda confere). O rótulo vem do CAMINHO
// (`automod.antiScam.alertChannelId`) se houver um próprio; senão, do NOME da chave
// (`enabled`, `canalId`…), que se repete em vários lugares com o mesmo sentido.

const r = (pt, en, es) => ({ pt, en, es });

// As seções (as chaves de primeiro nível) com o emoji do cabeçalho
export const SECOES = {
  language: { emoji: "🌐", ...r("Idioma", "Language", "Idioma") },
  idiomaPerguntado: { emoji: "🌐", ...r("Idioma já perguntado", "Language already asked", "Idioma ya preguntado") },
  automod: { emoji: "🛡", ...r("AutoMod", "AutoMod", "AutoMod") },
  inviteWhitelist: { emoji: "✅", ...r("Convites permitidos", "Allowed invites", "Invitaciones permitidas") },
  dominiosPermitidos: { emoji: "✅", ...r("Domínios permitidos", "Allowed domains", "Dominios permitidos") },
  log: { emoji: "📜", ...r("Canal de log", "Log channel", "Canal de registro") },
  acesso: { emoji: "🔐", ...r("Acesso aos comandos", "Command access", "Acceso a los comandos") },
  banGlobal: { emoji: "🌐", ...r("Lista global de bans", "Global ban list", "Lista global de bans") },
  comandosDesativados: { emoji: "🎛", ...r("Comandos desativados", "Disabled commands", "Comandos desactivados") },
  relatorioDono: { emoji: "🛰️", ...r("Relatório anônimo de ataques", "Anonymous attack report", "Informe anónimo de ataques") },
  rss: { emoji: "📰", ...r("RSS", "RSS", "RSS") },
  autorole: { emoji: "🎭", ...r("Cargo automático", "Auto role", "Rol automático") },
  chatLivre: { emoji: "💬", ...r("Conversa livre da IA", "AI free chat", "Conversación libre de la IA") },
  comentarioEspontaneo: { emoji: "💬", ...r("Comentários espontâneos", "Spontaneous comments", "Comentarios espontáneos") },
  ia: { emoji: "🤖", ...r("IA (Judy)", "AI (Judy)", "IA (Judy)") },
  tts: { emoji: "🔊", ...r("Voz (TTS)", "Voice (TTS)", "Voz (TTS)") },
  servidorInfo: { emoji: "📌", ...r("Regras e FAQ", "Rules and FAQ", "Reglas y FAQ") },
  staff: { emoji: "🛡️", ...r("Staff", "Staff", "Staff") },
  corPainel: { emoji: "🎨", ...r("Painel de cores", "Color panel", "Panel de colores") },
  fusos: { emoji: "🕒", ...r("Fusos horários", "Time zones", "Husos horarios") },
  tickets: { emoji: "🎫", ...r("Tickets", "Tickets", "Tickets") },
  boasVindas: { emoji: "👋", ...r("Boas-vindas", "Welcome", "Bienvenida") },
  adeus: { emoji: "👋", ...r("Despedida", "Farewell", "Despedida") },
  economia: { emoji: "🪙", ...r("Economia", "Economy", "Economía") },
  xp: { emoji: "⭐", ...r("Níveis (XP)", "Levels (XP)", "Niveles (XP)") },
};

// Rótulo por caminho (vence o rótulo pelo nome)
export const POR_CAMINHO = {
  "automod.antiSpam": r("Anti-spam", "Anti-spam", "Anti-spam"),
  "automod.antiMassSpam": r("Avalanche de mensagens", "Message flood", "Avalancha de mensajes"),
  "automod.antiInvite": r("Convites", "Invites", "Invitaciones"),
  "automod.antiMassMention": r("Menções em massa", "Mass mentions", "Menciones masivas"),
  "automod.antiCaps": r("Caixa alta", "Caps", "Mayúsculas"),
  "automod.antiLink": r("Links", "Links", "Enlaces"),
  "automod.antiCaracteres": r("Caracteres estranhos", "Odd characters", "Caracteres raros"),
  "automod.antiRepeticao": r("Letra repetida", "Repeated letters", "Letras repetidas"),
  "automod.antiOdio": r("Ofensas", "Slurs", "Insultos"),
  "automod.antiEmoji": r("Emojis", "Emojis", "Emojis"),
  "automod.antiMidia": r("Anexos", "Attachments", "Adjuntos"),
  "automod.antiDuplicata": r("Mensagem repetida", "Duplicate messages", "Mensajes repetidos"),
  "automod.antiImagem": r("Imagens", "Images", "Imágenes"),
  "automod.antiAssuntos": r("Assuntos proibidos", "Banned topics", "Temas prohibidos"),
  "automod.antiAvatar": r("Foto de perfil", "Profile picture", "Foto de perfil"),
  "automod.antiScam": r("Sentinela", "Sentinel", "Centinela"),
  "automod.punicao": r("Punição", "Punishment", "Castigo"),
  "automod.antiAssuntos.ia": r("a IA confirma", "AI confirms", "la IA confirma"),
  "automod.antiAssuntos.acoes": r("temas", "topics", "temas"),
  "automod.antiAvatar.tempo": r("silêncio", "timeout", "silencio"),
  "automod.antiImagem.todos": r("todas as contas", "all accounts", "todas las cuentas"),
  "automod.antiScam.alertChannelId": r("alertas em", "alerts in", "alertas en"),
  "acesso.canais": r("canais", "channels", "canales"),
  "acesso.canais.lista": r("lista", "list", "lista"),
  "acesso.canais.modo": r("modo", "mode", "modo"),
  "ia.chat": r("conversa", "chat", "conversación"),
  "ia.imagem": r("geração de imagem", "image generation", "generación de imágenes"),
  "chatLivre.canais": r("canais", "channels", "canales"),
  "fusos.lista": r("cidades", "cities", "ciudades"),
  "log.eventos": r("eventos", "events", "eventos"),
  "tts.tom": r("tom", "pitch", "tono"),
  "tts.voz": r("voz", "voice", "voz"),
  "tickets.painel": r("painel", "panel", "panel"),
};

// Rótulo pelo nome da chave
export const POR_NOME = {
  enabled: r("ligado", "on", "activado"), ativo: r("ligado", "on", "activado"), ativa: r("ligada", "on", "activada"),
  maxMessages: r("mensagens", "messages", "mensajes"), windowMs: r("janela", "window", "ventana"),
  punicao: r("punição própria", "own punishment", "castigo propio"), canaisLiberados: r("canais liberados", "allowed channels", "canales liberados"),
  maxMentions: r("menções", "mentions", "menciones"), minLength: r("tamanho mínimo", "min length", "longitud mínima"),
  threshold: r("limiar", "threshold", "umbral"), limiteZalgo: r("limiar de zalgo", "zalgo threshold", "umbral de zalgo"),
  maxRepeticao: r("repetições", "repeats", "repeticiones"), ignorar: r("ignora", "ignores", "ignora"),
  termos: r("termos próprios", "custom terms", "términos propios"), maxEmojis: r("emojis", "emojis", "emojis"),
  maxPorMinuto: r("por minuto", "per minute", "por minuto"), maxNovato: r("conta nova", "new account", "cuenta nueva"),
  maxRepetidas: r("repetições", "repeats", "repeticiones"), todos: r("todos", "all", "todos"),
  acoes: r("ações", "actions", "acciones"), politica: r("política", "politics", "política"), religiao: r("religião", "religion", "religión"),
  drogas: r("drogas", "drugs", "drogas"), sexual: r("sexual", "sexual", "sexual"),
  sensibilidade: r("sensibilidade", "sensitivity", "sensibilidad"), sensitivity: r("sensibilidade", "sensitivity", "sensibilidad"),
  ia: r("IA", "AI", "IA"), acao: r("ação", "action", "acción"), tempo: r("tempo", "time", "tiempo"),
  alertChannelId: r("canal de alertas", "alert channel", "canal de alertas"),
  porAntiguidade: r("mais rígido com novatos", "stricter with newcomers", "más estricto con los nuevos"),
  alertarAdmin: r("alerta à staff", "staff alerts", "alerta al staff"),
  modo: r("modo", "mode", "modo"), warnsParaBan: r("avisos até o ban", "warnings to ban", "avisos hasta el ban"),
  silenceRoleId: r("cargo de silêncio (antigo)", "silence role (legacy)", "rol de silencio (antiguo)"),
  escada: r("escada", "ladder", "escalera"), isentarStaff: r("staff isenta", "staff exempt", "staff exento"),
  criterios: r("critérios", "criteria", "criterios"), canais: r("canais", "channels", "canales"),
  canalId: r("canal", "channel", "canal"), eventos: r("eventos", "events", "eventos"),
  punicoes: r("punições", "punishments", "sanciones"), membros: r("membros", "members", "miembros"),
  mensagens: r("mensagens", "messages", "mensajes"), cargos: r("cargos", "roles", "roles"), comandos: r("comandos", "commands", "comandos"),
  cargosStaff: r("cargos de staff", "staff roles", "roles de staff"), lista: r("lista", "list", "lista"),
  staffIgnoraCanais: r("staff ignora a restrição", "staff bypasses it", "el staff se la salta"),
  livres: r("livres em qualquer canal", "free in any channel", "libres en cualquier canal"),
  isentos: r("isentos", "exempt", "exentos"), roleId: r("cargo", "role", "rol"),
  porDia: r("por dia", "per day", "por día"), minParaFalar: r("mensagens antes de falar", "messages before speaking", "mensajes antes de hablar"),
  chat: r("conversa", "chat", "conversación"), imagem: r("imagem", "image", "imagen"),
  canalVoz: r("call", "call", "llamada"), canalTexto: r("canal lido em voz", "channel read aloud", "canal leído en voz"),
  voz: r("voz", "voice", "voz"), cooldown: r("intervalo", "cooldown", "intervalo"), anunciarNome: r("diz o nome", "says the name", "dice el nombre"),
  dicionario: r("dicionário", "dictionary", "diccionario"), expandir: r("abreviações", "abbreviations", "abreviaturas"),
  efeito: r("efeito", "effect", "efecto"), tom: r("tom", "pitch", "tono"), filtro: r("peneira", "filter", "filtro"),
  porMinuto: r("falas por minuto", "lines per minute", "frases por minuto"),
  regrasCanal: r("canal das regras", "rules channel", "canal de reglas"), regrasTexto: r("texto das regras", "rules text", "texto de las reglas"),
  faq: r("FAQ", "FAQ", "FAQ"), titulos: r("rótulos", "labels", "etiquetas"),
  principal: r("principal", "main", "principal"), formato24: r("24 h", "24 h", "24 h"),
  painel: r("painel", "panel", "panel"), logCanal: r("log", "log", "registro"), cargoEquipe: r("equipe", "team", "equipo"),
  categorias: r("assuntos", "topics", "temas"), contador: r("tickets abertos até hoje", "tickets opened so far", "tickets abiertos hasta hoy"),
  xpMin: r("XP mínimo", "min XP", "XP mínimo"), xpMax: r("XP máximo", "max XP", "XP máximo"),
  cooldownMs: r("intervalo", "cooldown", "intervalo"), multiplicador: r("multiplicador", "multiplier", "multiplicador"),
  nivelMaximo: r("nível máximo", "max level", "nivel máximo"), intervaloCargos: r("cargo a cada", "role every", "rol cada"),
  canalAnuncio: r("anúncio em", "announced in", "anuncio en"),
  horario: r("telejornal às", "news digest at", "noticiero a las"), urgentes: r("termos urgentes", "urgent terms", "términos urgentes"), anunciarLevelUp: r("anuncia subida", "announces level-up", "anuncia subida"),
};

// O rótulo de um caminho (`["automod", "antiSpam", "windowMs"]`) no idioma, ou null
export function rotulo(caminho, lang = "pt") {
  const c = caminho.join(".");
  const r0 = caminho.length === 1 ? SECOES[c] : (POR_CAMINHO[c] ?? POR_NOME[caminho.at(-1)]);
  return r0?.[lang] ?? null;
}
