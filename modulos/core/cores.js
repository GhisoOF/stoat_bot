
export const CORES = {
  // básicas
  vermelho: "#EF4444", laranja: "#F97316", amarelo: "#EAB308",
  verde: "#22C55E", azul: "#3B82F6", roxo: "#A855F7",
  rosa: "#EC4899", branco: "#FFFFFF", preto: "#111111", cinza: "#6B7280",
  // extras
  esmeralda: "#10B981", ciano: "#06B6D4", indigo: "#6366F1",
  magenta: "#FF00FF", dourado: "#D4AF37", prata: "#C0C0C0",
  turquesa: "#14B8A6", vinho: "#7F1D1D", lima: "#84CC16",
  lavanda: "#C4B5FD", coral: "#FB7185", marrom: "#78350F",
};

// Os nomes em inglês (13 out 2026): num servidor em inglês, "blue" não
// funcionava. Ficam fora do CORES para a lista de nomes não sair em dobro.
export const CORES_EN = {
  red: "vermelho", orange: "laranja", yellow: "amarelo", green: "verde", blue: "azul", purple: "roxo",
  pink: "rosa", white: "branco", black: "preto", gray: "cinza", grey: "cinza", emerald: "esmeralda",
  cyan: "ciano", indigo: "indigo", magenta: "magenta", gold: "dourado", golden: "dourado", silver: "prata",
  turquoise: "turquesa", wine: "vinho", burgundy: "vinho", lime: "lima", lavender: "lavanda", coral: "coral", brown: "marrom",
};
// Os nomes em espanhol (etapa 4, 18 out 2026) — só os que diferem do português
// (verde, azul, rosa, magenta, turquesa, lima, lavanda, coral e esmeralda são iguais).
export const CORES_ES = {
  rojo: "vermelho", naranja: "laranja", amarillo: "amarelo", morado: "roxo", violeta: "roxo",
  blanco: "branco", negro: "preto", gris: "cinza", cian: "ciano", "índigo": "indigo",
  dorado: "dourado", plateado: "prata", plata: "prata", vino: "vinho", "marrón": "marrom", marron: "marrom",
};
const NOME_EN = Object.fromEntries(Object.entries(CORES_EN).reverse().map(([en, pt]) => [pt, en]));

export function normalizarCor(v) {
  if (!v) return null;
  const t = String(v).trim().toLowerCase()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/[,;.)\]}]+$/g, "")
    .trim();
  if (CORES[t]) return CORES[t];
  if (CORES[CORES_EN[t]]) return CORES[CORES_EN[t]];
  if (CORES[CORES_ES[t]]) return CORES[CORES_ES[t]];
  if (/^#?[0-9a-f]{6}$/i.test(t)) return (t.startsWith("#") ? t : `#${t}`).toUpperCase();
  if (/^#?[0-9a-f]{3}$/i.test(t)) {                 // #f0f → #FF00FF
    const h = t.replace("#", "");
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (/^rgba?\([\d\s.,%]+\)$/i.test(t)) return t;   // rgb()/rgba() são CSS válidos
  return null;
}

// Lista dos nomes, para mensagens de ajuda.
export function nomesDeCor(limite = 0, lang = "pt") {
  const n = Object.keys(CORES).map((x) => (lang === "en" ? NOME_EN[x] ?? x : x));
  return limite ? n.slice(0, limite) : n;
}
