// aleatorio.js — a ÚNICA fonte de sorteio do bot (2 nov 2026, P4.1, CodeQL "insecure randomness").
//
// Tudo sai do `node:crypto` (CSPRNG): código de confirmação, código de caso, id de categoria,
// boundary de multipart, a amostra da fila de revisão e também os jogos, dados, XP e economia
// (um sorteio só, sem distinguir o "importante" do "de brincadeira" — DRY e nada a errar).
// O `Math.random` não aparece em mais nenhum arquivo do bot nem dos scripts (o teste confere).
//
//   fracao()               → número em [0, 1), 53 bits
//   inteiro(n)             → inteiro em [0, n)        (n inteiro, 1 ≤ n < 2^48)
//   entre(min, max)        → inteiro em [min, max]    (os dois inclusos)
//   escolher(lista)        → um elemento (undefined se a lista é vazia)
//   codigo(alfabeto, n)    → n caracteres do alfabeto (cada um uniforme)
//   sufixo(n)              → n caracteres de [0-9a-z] (para ids e boundary)
//
// Os parâmetros de injeção dos módulos (`rng = …`, `sorteio = …`, `aleatorio = …`) continuam:
// o padrão deles agora é daqui. `_trocarFonte(fn)` (só testes) troca a fonte de TODAS as funções
// por uma função que devolve [0, 1) — a suíte que compara telas entre versões precisa de sorteio
// com semente fixa.
import { randomBytes, randomInt } from "node:crypto";

const DOIS_53 = 2 ** 53;
const MAX_N = 2 ** 48 - 1;   // o teto do crypto.randomInt (max − min < 2^48)
export const BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz";

let fonte = null;   // null = crypto; função = fonte de teste

export function fracao() {
  if (fonte) return fonte();
  const b = randomBytes(7);   // 56 bits; ficam 53 (o que cabe sem perda num double)
  return (b.readUIntBE(0, 6) * 32 + (b[6] >>> 3)) / DOIS_53;
}

export function inteiro(n) {
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_N) throw new RangeError("aleatorio.inteiro: n fora de 1..2^48-1");
  if (fonte) return Math.min(n - 1, Math.floor(fonte() * n));
  return randomInt(n);
}

export function entre(min, max) {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max < min) throw new RangeError("aleatorio.entre: intervalo inválido");
  return min + inteiro(max - min + 1);
}

export function escolher(lista) {
  return lista?.length ? lista[inteiro(lista.length)] : undefined;
}

export function codigo(alfabeto, n) {
  const a = String(alfabeto ?? "");
  if (!a.length || !Number.isSafeInteger(n) || n < 0) throw new RangeError("aleatorio.codigo: alfabeto vazio ou tamanho inválido");
  let s = "";
  for (let i = 0; i < n; i++) s += a[inteiro(a.length)];
  return s;
}

export const sufixo = (n) => codigo(BASE36, n);

// Só para testes: a fonte de todas as funções (null volta ao crypto). Devolve a anterior.
export function _trocarFonte(fn) { const antes = fonte; fonte = typeof fn === "function" ? fn : null; return antes; }
