// "Você quis dizer…": o nome conhecido mais perto do que a pessoa digitou.
//
// Um lugar só para a regra (17 out 2026). Antes ela morava no main.js e valia
// só para o NOME do comando: `&comado destivar ping` sugeria
// `&comando destivar ping`, com o erro do subcomando intacto.

// Distância de edição com troca de duas letras vizinhas ("destaivar" = 1)
export function distancia(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) m[i][j] = Math.min(m[i][j], m[i - 2][j - 2] + 1);
  }
  return m[a.length][b.length];
}

// O mais parecido entre `nomes`, ou null. Aceita até 2 erros, e no máximo um a
// cada 3 letras (um erro em nome curto). No empate: quem `secundario()` não
// marca vem antes (o nome do comando antes do apelido), depois a ordem
// alfabética — nunca a ordem da lista, que muda sem ninguém pensar nisso.
export function maisParecido(digitado, nomes, { secundario = () => false } = {}) {
  const t = String(digitado ?? "").toLowerCase();
  if (!t) return null;
  const chave = (n, x) => [x, secundario(n) ? 1 : 0, n];
  const antes = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
  let melhor = null, melhorChave = null;
  for (const n of new Set(nomes)) {
    const x = distancia(t, n);
    if (x >= 3 || x > Math.max(1, Math.floor(n.length / 3))) continue;
    const k = chave(n, x);
    if (!melhorChave || antes(k, melhorChave)) { melhor = n; melhorChave = k; }
  }
  return melhor;
}
