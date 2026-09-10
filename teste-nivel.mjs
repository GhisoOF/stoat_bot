
// fórmula ORIGINAL (copiada tal como era, para servir de gabarito)
function xpParaNivelOriginal(nivel, base = 100, mult = 1.5) {
  if (nivel <= 0) return 0;
  let total = 0;
  for (let i = 1; i <= nivel; i++) total += Math.floor(base * Math.pow(i, mult));
  return total;
}
function nivelPorXpOriginal(xp, mult = 1.5, nivelMax = 100, base = 100) {
  let nivel = 0;
  while (nivel < nivelMax && xp >= xpParaNivelOriginal(nivel + 1, base, mult)) nivel++;
  return nivel;
}

const _tab = new Map();
function tabelaXp(base, mult, ateNivel) {
  const k = `${base}|${mult}`;
  let tab = _tab.get(k);
  if (!tab) { tab = [0]; _tab.set(k, tab); }
  while (tab.length <= ateNivel) {
    const i = tab.length;
    tab.push(tab[i - 1] + Math.floor(base * Math.pow(i, mult)));
  }
  return tab;
}
function nivelPorXpNovo(xp, mult = 1.5, nivelMax = 100, base = 100) {
  const tab = tabelaXp(base, mult, nivelMax);
  let lo = 0, hi = nivelMax;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xp >= tab[mid]) lo = mid; else hi = mid - 1;
  }
  return lo;
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log(`❌ ${m}`)); };

// Varre configs realistas × faixa larga de XP, incluindo as bordas exatas
for (const mult of [1.0, 1.2, 1.5, 2.0]) {
  for (const nivelMax of [10, 50, 100]) {
    for (const base of [50, 100, 250]) {
      // bordas exatas de cada nível (o ponto mais traiçoeiro: >= vs >)
      for (let n = 0; n <= nivelMax; n++) {
        const borda = xpParaNivelOriginal(n, base, mult);
        for (const xp of [borda - 1, borda, borda + 1]) {
          if (xp < 0) continue;
          const a = nivelPorXpOriginal(xp, mult, nivelMax, base);
          const b = nivelPorXpNovo(xp, mult, nivelMax, base);
          ok(a === b, `divergiu: mult=${mult} max=${nivelMax} base=${base} xp=${xp} → original=${a} novo=${b}`);
        }
      }
      // amostras aleatórias
      for (let i = 0; i < 200; i++) {
        const xp = Math.floor(Math.random() * xpParaNivelOriginal(nivelMax, base, mult) * 1.1);
        const a = nivelPorXpOriginal(xp, mult, nivelMax, base);
        const b = nivelPorXpNovo(xp, mult, nivelMax, base);
        ok(a === b, `divergiu (aleatório): mult=${mult} max=${nivelMax} base=${base} xp=${xp} → ${a} vs ${b}`);
      }
    }
  }
}

// velocidade: o motivo da mudança
const N = 100_000;
let t0 = performance.now();
for (let i = 0; i < N; i++) nivelPorXpOriginal(123_456, 1.5, 100, 100);
const tOrig = performance.now() - t0;
t0 = performance.now();
for (let i = 0; i < N; i++) nivelPorXpNovo(123_456, 1.5, 100, 100);
const tNovo = performance.now() - t0;
console.log(`velocidade: original ${(tOrig / N * 1000).toFixed(1)} µs → novo ${(tNovo / N * 1000).toFixed(2)} µs por chamada (${(tOrig / tNovo).toFixed(0)}x)`);

console.log(`\nNÍVEL: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
