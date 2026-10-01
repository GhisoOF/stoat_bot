// Durações digitadas ("10m", "2h30m", "1d", "1w", "90" = minutos) e o texto
// de volta ("1 h 30 min"). Usado pelo &silenciar e pelo intervalo da &economia.

const UNIDADE = { s: 1e3, m: 60e3, h: 3600e3, d: 86400e3, w: 7 * 86400e3, sem: 7 * 86400e3 };

// "10m", "2h30m", "1d", "45s", "1w", "90" (minutos) → ms; null se inválido.
export function lerDuracao(txt) {
  const t = String(txt ?? "").trim().toLowerCase().replace(/min(utos?)?/g, "m").replace(/horas?/g, "h").replace(/dias?/g, "d").replace(/semanas?/g, "sem");
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t) * 60e3;   // número puro = minutos
  const partes = [...t.matchAll(/(\d+)\s*(sem|[smhdw])/g)];
  if (!partes.length || partes.map((p) => p[0]).join("").replace(/\s/g, "") !== t.replace(/\s/g, "")) return null;
  const ms = partes.reduce((n, [, v, u]) => n + Number(v) * UNIDADE[u], 0);
  return ms > 0 ? ms : null;
}

export function duracaoTexto(ms, lang = "pt") {
  const en = lang === "en";
  const d = Math.floor(ms / 86400e3), h = Math.floor((ms % 86400e3) / 3600e3), m = Math.floor((ms % 3600e3) / 60e3), s = Math.floor((ms % 60e3) / 1e3);
  const p = [];
  if (d) p.push(`${d} ${en ? (d > 1 ? "days" : "day") : (d > 1 ? "dias" : "dia")}`);
  if (h) p.push(`${h} h`);
  if (m) p.push(`${m} min`);
  if (s && !d && !h) p.push(`${s} s`);
  return p.join(" ") || (en ? "0 s" : "0 s");
}
