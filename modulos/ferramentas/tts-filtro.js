
import { textoHumano } from "../moderacao/caracteres.js";

const RISADAS = /^(k+|(rs)+|(ha)+h?|(he)+h?|(hue)+|(hs)+|(ja)+|(js)+|s+|z+|(ah)+|(eh)+)[!?.…]*$/i;

function colapsar(t) {
  return t.replace(/(.)\1{2,}/gsu, "$1$1");
}

function blocoRepetido(t) {
  let melhor = { bloco: null, vezes: 0, cobertura: 0 };
  for (let n = 1; n <= 8; n++) {
    const re = new RegExp(`(.{${n}})\\1{2,}`, "gsu");
    let m;
    while ((m = re.exec(t))) {
      const vezes = m[0].length / n;
      if (vezes > melhor.vezes) {
        melhor = { bloco: m[1], vezes, cobertura: m[0].length / t.length };
      }
    }
  }
  return melhor;
}

export const PADROES = {
  minChars: 2,        // "a", "b", "あ" sozinhos não são frase
  maxChars: 600,      // acima disto é parede de texto, não recado
  colapsoMax: 0.35,   // encolher mais que isto ao colapsar repetições = spam
  distintosMin: 4,    // menos caracteres distintos que isto (em texto longo) = spam
  blocoVezes: 5,      // um bloco repetido tantas vezes seguidas = spam
  blocoCobertura: 0.5, // ou repetido menos, mas ocupando metade da mensagem
  porMinuto: 6,       // teto de falas por minuto NO CANAL
  silencioMs: 45_000, // quanto tempo o canal fica em silêncio depois de estourar
};

export function avaliar(bruto, opcoes = {}) {
  const P = { ...PADROES, ...opcoes };
  const original = String(bruto ?? "");

  const t = textoHumano(original).trim();

  if (!t) return { falar: false, motivo: "vazio" };

  // Sem letra nem dígito: pontuação, setas, emoji solto. Nada a dizer.
  if (!/[\p{L}\p{N}]/u.test(t)) return { falar: false, motivo: "sem-texto" };

  if (t.length < P.minChars) return { falar: false, motivo: "curto-demais" };

  if (original.length > P.maxChars) return { falar: false, motivo: "parede" };

  const semEspaco = t.replace(/\s+/gu, "");

  if (RISADAS.test(semEspaco)) return { falar: true, motivo: "risada" };

  const distintos = new Set(semEspaco.toLowerCase()).size;
  if (semEspaco.length >= 8 && distintos < P.distintosMin) {
    return { falar: false, motivo: "pouca-variedade" };
  }

  // Repetição do mesmo caractere: "renaaaaaaaa…ato", "Õõõõõõõ".
  const colapsado = colapsar(semEspaco);
  if (semEspaco.length >= 8 && 1 - colapsado.length / semEspaco.length > P.colapsoMax) {
    return { falar: false, motivo: "caractere-repetido" };
  }

  // Bloco repetido: "lalalala", "wiwiwiwi", "やきそばやきそば", "abababab".
  if (semEspaco.length >= 8) {
    const b = blocoRepetido(semEspaco.toLowerCase());
    if (b.vezes >= P.blocoVezes || (b.vezes >= 3 && b.cobertura >= P.blocoCobertura)) {
      // Confere se o bloco em si não é uma risada ("hahahaha" tem bloco
      // "ha" repetido 4x e é gente rindo).
      if (!RISADAS.test(b.bloco.repeat(2))) {
        return { falar: false, motivo: "bloco-repetido" };
      }
    }
  }

  return { falar: true, motivo: "ok" };
}

const janelas = new Map();   // canalId → { marcas: number[], silencioAte: number }

export function registrarFala(canalId, agora = Date.now(), opcoes = {}) {
  const P = { ...PADROES, ...opcoes };
  const j = janelas.get(canalId) ?? { marcas: [], silencioAte: 0 };
  j.marcas = j.marcas.filter((t) => agora - t < 60_000);
  j.marcas.push(agora);
  janelas.set(canalId, j);

  if (j.marcas.length > P.porMinuto) {
    const estreando = j.silencioAte <= agora;
    if (estreando) j.silencioAte = agora + P.silencioMs;
    return { permitido: false, estreando, ate: j.silencioAte };
  }
  return { permitido: true, estreando: false, ate: 0 };
}

export function emEnxurrada(canalId, agora = Date.now()) {
  const j = janelas.get(canalId);
  if (!j) return { silenciado: false, faltamMs: 0 };
  if (j.silencioAte > agora) return { silenciado: true, faltamMs: j.silencioAte - agora };
  return { silenciado: false, faltamMs: 0 };
}

export function limpar(canalId = null) {
  if (canalId) janelas.delete(canalId); else janelas.clear();
}

// Para o `&tts estado` mostrar o que está acontecendo agora.
export function estadoDoCanal(canalId, agora = Date.now()) {
  const j = janelas.get(canalId);
  if (!j) return { noMinuto: 0, silenciado: false, faltamMs: 0 };
  return {
    noMinuto: j.marcas.filter((t) => agora - t < 60_000).length,
    silenciado: j.silencioAte > agora,
    faltamMs: Math.max(0, j.silencioAte - agora),
  };
}
