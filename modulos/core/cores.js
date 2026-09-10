
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

export function normalizarCor(v) {
  if (!v) return null;
  const t = String(v).trim().toLowerCase()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/[,;.)\]}]+$/g, "")
    .trim();
  if (CORES[t]) return CORES[t];
  if (/^#?[0-9a-f]{6}$/i.test(t)) return (t.startsWith("#") ? t : `#${t}`).toUpperCase();
  if (/^#?[0-9a-f]{3}$/i.test(t)) {                 // #f0f → #FF00FF
    const h = t.replace("#", "");
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (/^rgba?\([\d\s.,%]+\)$/i.test(t)) return t;   // rgb()/rgba() são CSS válidos
  return null;
}

// Lista dos nomes, para mensagens de ajuda.
export function nomesDeCor(limite = 0) {
  const n = Object.keys(CORES);
  return limite ? n.slice(0, limite) : n;
}
