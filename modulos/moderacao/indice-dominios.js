
import fs from "node:fs";
import path from "node:path";

export function hashDominio(str) {
  let h1 = 0x811c9dc5 | 0;
  let h2 = 0x811c9dc5 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x01000197);
  }
  return (BigInt(h1 >>> 0) << 32n) | BigInt(h2 >>> 0);
}

// ── O índice em si: array ordenado + busca binária ──
export class IndiceDominios {
  /** @param {BigUint64Array} ordenado hashes já ordenados e sem duplicatas */
  constructor(ordenado = new BigUint64Array(0)) {
    this._h = ordenado;
  }

  get size() { return this._h.length; }

  /** Mesma assinatura do Set: recebe o domínio (string) e responde se está na lista. */
  has(dominio) {
    if (!this._h.length || !dominio) return false;
    const alvo = hashDominio(dominio);
    let lo = 0, hi = this._h.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const v = this._h[mid];
      if (v === alvo) return true;
      if (v < alvo) lo = mid + 1; else hi = mid - 1;
    }
    return false;
  }
}

export function criarIndiceVazio() { return new IndiceDominios(); }

const BLOCO = 1 << 18;   // 262.144 hashes por bloco (2 MB cada)

export class ConstrutorIndice {
  constructor() {
    this._blocos = [];
    this._atual = new BigUint64Array(BLOCO);
    this._n = 0;
    this._total = 0;
  }

  adicionar(dominio) {
    if (this._n === BLOCO) {
      this._blocos.push(this._atual);
      this._atual = new BigUint64Array(BLOCO);
      this._n = 0;
    }
    this._atual[this._n++] = hashDominio(dominio);
    this._total++;
  }

  get total() { return this._total; }

  construir() {
    const tudo = new BigUint64Array(this._total);
    let o = 0;
    for (const b of this._blocos) { tudo.set(b, o); o += b.length; }
    tudo.set(this._atual.subarray(0, this._n), o);
    tudo.sort();   // sort nativo de TypedArray: rápido mesmo com milhões

    // Dedup in-place (as fontes se sobrepõem bastante entre si)
    let escreve = 0;
    for (let i = 0; i < tudo.length; i++) {
      if (i === 0 || tudo[i] !== tudo[i - 1]) tudo[escreve++] = tudo[i];
    }
    return new IndiceDominios(tudo.slice(0, escreve));
  }
}

const MAGIA = Buffer.from("SBLKIDX1", "ascii");

function checksumConfig(cfgGlobal) {
  const s = JSON.stringify({
    f: cfgGlobal?.linkBlocklistSources ?? [],
    m: cfgGlobal?.linkBlocklistManual ?? [],
  });
  let h = 0x811c9dc5 | 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function caminhoCache() {
  const base = process.env.CONFIG_PATH
    ? path.dirname(process.env.CONFIG_PATH)
    : ".";
  return path.join(base, "blocklist-cache.bin");
}

export async function salvarCache(indice, cfgGlobal) {
  try {
    const cab = Buffer.alloc(16);
    MAGIA.copy(cab, 0);
    cab.writeUInt32LE(indice.size, 8);
    cab.writeUInt32LE(checksumConfig(cfgGlobal), 12);
    const corpo = Buffer.from(indice._h.buffer, indice._h.byteOffset, indice._h.byteLength);
    const alvo = caminhoCache();
    // escreve num temporário e renomeia: nunca deixa cache pela metade
    await fs.promises.writeFile(alvo + ".tmp", Buffer.concat([cab, corpo]));
    await fs.promises.rename(alvo + ".tmp", alvo);
  } catch (e) {
    console.error("[BLOCKLIST] Falha ao salvar cache:", e.message);
  }
}

export function carregarCache(cfgGlobal) {
  try {
    const buf = fs.readFileSync(caminhoCache());
    if (buf.length < 16 || !buf.subarray(0, 8).equals(MAGIA)) return null;
    const n = buf.readUInt32LE(8);
    if (buf.readUInt32LE(12) !== checksumConfig(cfgGlobal)) return null;   // config mudou
    if (buf.length !== 16 + n * 8) return null;                            // truncado
    // copia para um ArrayBuffer próprio (alinhamento garantido para o view)
    const ab = new ArrayBuffer(n * 8);
    new Uint8Array(ab).set(buf.subarray(16));
    return new IndiceDominios(new BigUint64Array(ab));
  } catch {
    return null;   // sem cache ainda — normal no primeiro boot
  }
}
