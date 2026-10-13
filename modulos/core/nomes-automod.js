// Os nomes do automod em inglês (13 out 2026).
//
// Num servidor grande em inglês, a tela mostrava `velocidade`, `rajada`,
// `conteudo`, `confirmar`… e só os nomes em português funcionavam ao digitar.
// Aqui fica o par PT ⇄ EN de cada grupo, parte, modo e opção — UMA tabela, que
// serve para as duas pontas: o aliases.js traduz o que se digita em inglês
// para o nome interno, e os painéis mostram o nome em inglês.

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

const de = (mapa) => (pt, lang) => (lang === "en" ? mapa[pt] ?? pt : pt);
export const nomeGrupo = de(GRUPO_EN);
export const nomeParte = de(PARTE_EN);
export const nomeModo = de(MODO_EN);
export const nomeSens = de(SENS_EN);
export const nomeTema = de(TEMA_EN);
export const nomeAcaoTema = de(ACAO_TEMA_EN);
export const nomeAcaoAvatar = de(ACAO_AVATAR_EN);
export const nomeEventoLog = de(EVENTO_LOG_EN);

// inglês → português, para o aliases.js
const inverter = (mapa) => Object.fromEntries(Object.entries(mapa).filter(([pt, en]) => pt !== en).map(([pt, en]) => [en, pt]));
export const EN_PARA_PT = {
  grupos: { ...inverter(GRUPO_EN), noise: "antiruido" },
  partes: inverter(PARTE_EN),
  modos: inverter(MODO_EN),
  temas: inverter(TEMA_EN),
  acoesTema: inverter(ACAO_TEMA_EN),
  acoesAvatar: { ...inverter(ACAO_AVATAR_EN), mute: "silenciar", timeout: "silenciar" },
  sens: inverter(SENS_EN),
};
