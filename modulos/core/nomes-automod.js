// Os nomes do automod em inglês (13 out 2026).
//
// Num servidor grande em inglês, a tela mostrava `velocidade`, `rajada`,
// `conteudo`, `confirmar`… e só os nomes em português funcionavam ao digitar.
// Aqui fica o par PT ⇄ EN de cada grupo, parte, modo e opção, que os painéis
// usam para mostrar o nome em inglês. A tradução do que se digita mora no registro
// de comandos (modulos/comandos/automod.js) desde 17 out 2026; um teste da suíte
// comandos-17out garante que as duas listas não se afastam.

import { REGISTRO } from "../comandos/index.js";

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

// (P2, 31 out 2026) o espanhol vem do registro (`es.subcomandos` de cada nível do automod),
// que também o torna digitável: `nomeModo("acumular", "es")` → `acumular`, `nomeSens("media",
// "es")` → `media` (antes a tela espanhola mostrava o inglês: `stack`, `medium`, `content`).
// Sem nome espanhol no registro, o interno (o teste p2-registro-ajuda exige o espanhol de
// toda palavra que tem inglês diferente).
const AUTOMOD = REGISTRO.find((c) => c.id === "automod") ?? {};
const esDe = (...niveis) => Object.assign({}, ...niveis.map((n) => n?.es?.subcomandos ?? {}));
const F = AUTOMOD.familias ?? {}, PT = AUTOMOD.partes ?? {};
const GRUPO_ES = esDe(AUTOMOD);
const PARTE_ES = esDe(F.antispam, F.antiruido, F.antilink, F.sentinela);
const MODO_ES = esDe(AUTOMOD, PT.punicao);
const SENS_ES = esDe(F.sentinela);
const TEMA_ES = esDe(F.assuntos), ACAO_TEMA_ES = esDe(F.assuntos), ACAO_AVATAR_ES = esDe(F.avatar);

const de = (mapa, es) => (pt, lang) => (lang === "en" ? mapa[pt] ?? pt : lang === "es" ? [].concat(es[pt] ?? pt)[0] : pt);
export const nomeGrupo = de(GRUPO_EN, GRUPO_ES);
export const nomeParte = de(PARTE_EN, PARTE_ES);
export const nomeModo = de(MODO_EN, MODO_ES);
export const nomeSens = de(SENS_EN, SENS_ES);
export const nomeTema = de(TEMA_EN, TEMA_ES);
export const nomeAcaoTema = de(ACAO_TEMA_EN, ACAO_TEMA_ES);
export const nomeAcaoAvatar = de(ACAO_AVATAR_EN, ACAO_AVATAR_ES);
