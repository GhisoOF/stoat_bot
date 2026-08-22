// ══════════════════════════════════════════════════════════
//  tts-filtro.js — o que NÃO vale a pena falar na call
//
//  A transmissão automática (`&tts transmitir #canal`) fala tudo que é
//  escrito. Num canal movimentado isso é o recurso funcionando; numa
//  brincadeira de "vamos ver o que ela faz", vira um megafone travado.
//
//  Uma parede de `Lalalala…` de 2 000 caracteres, cortada em 400, são
//  ~40 segundos de fala contínua ocupando a fila inteira — e mais 4
//  iguais atrás dela. Ninguém consegue conversar, e o `&tts sair` não
//  resolve, porque a mensagem seguinte faz o bot tentar voltar.
//
//  Este módulo é a peneira. Duas partes:
//
//   1. `avaliar(texto)` — a mensagem é FALA ou é barulho?
//      Só regras de FORMA: repetição, diversidade de caracteres,
//      tamanho. Nada de julgar conteúdo — isso é papel do automod e do
//      sentinela, e uma heurística que tentasse adivinhar "isto é bobo"
//      calaria gente falando sério.
//
//   2. `registrarFala` / `emEnxurrada` — o teto POR CANAL.
//      O cooldown de `tts.js` é por pessoa: cinco pessoas escrevendo
//      juntas passam por ele sem esforço. O teto por canal é o freio que
//      falta quando a brincadeira é coletiva.
//
//  Falso negativo (deixar passar barulho) custa uma frase estranha.
//  Falso positivo (calar alguém) custa a confiança no recurso. Na
//  dúvida, este filtro DEIXA PASSAR — por isso as margens são largas.
// ══════════════════════════════════════════════════════════

import { textoHumano } from "../moderacao/caracteres.js";

// Risadas e interjeições que SÃO repetição legítima. Sem esta lista,
// "kkkkkk" e "rsrsrs" — que é como metade do servidor ri — cairiam na
// regra de bloco repetido.
const RISADAS = /^(k+|(rs)+|(ha)+h?|(he)+h?|(hue)+|(hs)+|(ja)+|(js)+|s+|z+|(ah)+|(eh)+)[!?.…]*$/i;

// Colapsa corridas do mesmo caractere: "aaaa" → "aa". Mantém duas para
// não confundir "carro" com "caro" na contagem.
function colapsar(t) {
  return t.replace(/(.)\1{2,}/gsu, "$1$1");
}

// O maior bloco de 1–8 caracteres que se repete seguidamente, e quantas
// vezes. "lalalala" → { bloco: "la", vezes: 4 }.
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

// ──────────────────────────────────────────────────────────
//  avaliar(texto) → { falar, motivo }
//  `motivo` é uma chave curta e estável (serve para log e para o
//  `&tts filtro teste`), não uma frase para o usuário final.
// ──────────────────────────────────────────────────────────
export function avaliar(bruto, opcoes = {}) {
  const P = { ...PADROES, ...opcoes };
  const original = String(bruto ?? "");

  // Analisa o que a pessoa DIGITOU: sem menções (ULIDs de 26 chars),
  // links e emojis nomeados, que distorceriam toda contagem abaixo.
  const t = textoHumano(original).trim();

  if (!t) return { falar: false, motivo: "vazio" };

  // Sem letra nem dígito: pontuação, setas, emoji solto. Nada a dizer.
  if (!/[\p{L}\p{N}]/u.test(t)) return { falar: false, motivo: "sem-texto" };

  if (t.length < P.minChars) return { falar: false, motivo: "curto-demais" };

  // Parede de texto. Falar os primeiros 400 caracteres de uma mensagem de
  // 2 000 não entrega o recado nem para quem escreveu — só ocupa a call.
  if (original.length > P.maxChars) return { falar: false, motivo: "parede" };

  const semEspaco = t.replace(/\s+/gu, "");

  // Risada e interjeição passam direto: são repetição por natureza e as
  // regras abaixo as pegariam todas.
  if (RISADAS.test(semEspaco)) return { falar: true, motivo: "risada" };

  // Poucos caracteres distintos num texto longo: "9?99?999?9999?" (dois),
  // "Nnnnnnnn" (um). Texto curto fica de fora — "ok", "aa", "hm" são
  // legítimos e têm poucos distintos por serem curtos.
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

// ──────────────────────────────────────────────────────────
//  Teto por canal: janela deslizante de 1 minuto
//
//  Estourou → o canal entra em silêncio por `silencioMs`. Não é punição
//  de ninguém: é o bot reconhecendo que a call virou ruído e esperando
//  passar. Quem quiser falar mesmo assim usa `&tts <texto>`, que não
//  passa por aqui.
// ──────────────────────────────────────────────────────────
const janelas = new Map();   // canalId → { marcas: number[], silencioAte: number }

export function registrarFala(canalId, agora = Date.now(), opcoes = {}) {
  const P = { ...PADROES, ...opcoes };
  const j = janelas.get(canalId) ?? { marcas: [], silencioAte: 0 };
  j.marcas = j.marcas.filter((t) => agora - t < 60_000);
  j.marcas.push(agora);
  janelas.set(canalId, j);

  if (j.marcas.length > P.porMinuto) {
    // Já estava em silêncio? Não empurra o prazo para frente a cada
    // mensagem nova — senão uma enxurrada longa deixaria o canal mudo
    // por muito mais tempo que o combinado.
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

// Zera o estado de um canal (usado pelo `&tts entrar` e pelos testes):
// quem acabou de chamar o bot de volta não deve herdar o silêncio da
// bagunça anterior.
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
