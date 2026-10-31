// Os grupos do índice do &help (P2, 31 out 2026).
//
// Só dados, sem import: o aliases.js lê daqui (ciclo nenhum). O conteúdo de cada
// grupo NÃO mora aqui — sai do registro: cada comando diz o grupo dele
// (`ajuda.grupo` em modulos/comandos/<comando>.js) e a linha dele (`ajuda.resumo`,
// ou a 1ª frase do `desc`). Antes (até o P1) cada grupo era uma lista escrita à mão
// em três idiomas, que se afastava do registro a cada comando novo.

export const GRUPOS = {
  comecar: {
    emoji: "🚀",
    titulo: { pt: "Começar", en: "Getting started", es: "Empezar" },
    nome: { pt: "comecar", en: "start", es: "empezar" },
    apelidos: ["começar", "inicio", "início", "getting-started", "geral", "general", "basico", "básico", "basics"],
  },
  proteger: {
    emoji: "🛡️",
    titulo: { pt: "Proteger", en: "Protect", es: "Proteger" },
    nome: { pt: "proteger", en: "protect", es: "proteger" },
    apelidos: ["protecao", "proteção", "protection", "proteccion", "protección", "moderacao", "moderação", "moderation", "moderacion", "moderación", "mod"],
  },
  personalizar: {
    emoji: "🎨",
    titulo: { pt: "Personalizar", en: "Customize", es: "Personalizar" },
    nome: { pt: "personalizar", en: "customize", es: "personalizar" },
    apelidos: ["customise", "personalize", "ferramentas", "ferramenta", "tools", "tool", "herramientas"],
  },
  diversao: {
    emoji: "🎮",
    titulo: { pt: "Diversão", en: "Fun", es: "Diversión" },
    nome: { pt: "diversao", en: "fun", es: "diversion" },
    apelidos: ["diversão", "diversión"],
  },
  rpg: {
    emoji: "🎲",
    titulo: { pt: "RPG", en: "RPG", es: "RPG" },
    nome: { pt: "rpg", en: "rpg", es: "rpg" },
    apelidos: ["jogo", "juego"],
  },
  diagnostico: {
    emoji: "🩺",
    titulo: { pt: "Diagnóstico", en: "Diagnostics", es: "Diagnóstico" },
    nome: { pt: "diagnostico", en: "diagnostics", es: "diagnostico" },
    apelidos: ["diagnóstico", "troubleshooting", "problemas", "problems"],
  },
  dono: {
    emoji: "👑",
    titulo: { pt: "Dono do bot", en: "Bot owner", es: "Dueño del bot" },
    nome: { pt: "dono", en: "owner", es: "dueno" },
    apelidos: ["dueño"],
    soDono: true,
  },
};

// Ordem fixa dos grupos no índice.
export const ORDEM = ["comecar", "proteger", "personalizar", "diversao", "rpg", "diagnostico", "dono"];

// Nome digitado (qualquer idioma, apelido) → chave do grupo, ou null.
const POR_NOME = (() => {
  const m = {};
  for (const [k, g] of Object.entries(GRUPOS)) for (const n of [k, ...Object.values(g.nome), ...(g.apelidos ?? [])]) m[n.toLowerCase()] ??= k;
  return m;
})();
export const grupoDoNome = (nome) => POR_NOME[String(nome ?? "").toLowerCase()] ?? null;
export const nomeDoGrupo = (k, lang = "pt") => GRUPOS[k]?.nome?.[lang] ?? GRUPOS[k]?.nome?.pt ?? k;
