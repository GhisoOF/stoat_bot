// Os nomes do automod em inglês (13 out 2026).
//
// Num servidor grande em inglês, a tela mostrava `velocidade`, `rajada`,
// `conteudo`, `confirmar`… e só os nomes em português funcionavam ao digitar.
// Aqui fica o par PT ⇄ EN de cada grupo, parte, modo e opção, que os painéis
// usam para mostrar o nome em inglês. A tradução do que se digita mora no registro
// de comandos (modulos/comandos/automod.js) desde 17 out 2026; um teste da suíte
// comandos-17out garante que as duas listas não se afastam.

export const GRUPO_EN = { antispam: "antispam", antiruido: "antinoise", antilink: "antilink", sentinela: "sentinel" };

export const PARTE_EN = {
  velocidade: "speed", rajada: "burst", repeticao: "repeat", midia: "media", mencoes: "mentions",
  caps: "caps", caracteres: "characters", letras: "letters", emoji: "emoji",
  dominios: "domains", convites: "invites",
  conteudo: "content", odio: "hate", imagens: "images", assuntos: "topics", avatar: "avatar",
};

export const MODO_EN = { avisar: "warn", apagar: "delete", confirmar: "confirm", acumular: "stack", banir: "ban", herdar: "inherit" };
export const SENS_EN = { baixa: "low", media: "medium", alta: "high" };
export const TEMA_EN = { politica: "politics", religiao: "religion", drogas: "drugs", sexual: "sexual" };
export const ACAO_TEMA_EN = { off: "off", alertar: "alert", apagar: "delete", punir: "punish" };
export const ACAO_AVATAR_EN = { alertar: "alert", silenciar: "silence", expulsar: "kick", banir: "ban" };
export const EVENTO_LOG_EN = { punicoes: "punishments", membros: "members", mensagens: "messages", cargos: "roles", comandos: "commands" };

// (etapa 4b) no espanhol, os nomes que se digitam são os do inglês (o mesmo que a tela
// em espanhol sempre mostrou): `nomeModo("acumular", "es")` → `stack`, nunca `acumular`
const de = (mapa) => (pt, lang) => (lang === "en" || lang === "es" ? mapa[pt] ?? pt : pt);
export const nomeGrupo = de(GRUPO_EN);
export const nomeParte = de(PARTE_EN);
export const nomeModo = de(MODO_EN);
export const nomeSens = de(SENS_EN);
export const nomeTema = de(TEMA_EN);
export const nomeAcaoTema = de(ACAO_TEMA_EN);
export const nomeAcaoAvatar = de(ACAO_AVATAR_EN);
export const nomeEventoLog = de(EVENTO_LOG_EN);
