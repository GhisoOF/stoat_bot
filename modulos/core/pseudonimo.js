// IDs anônimos no log do container (privacidade P2, 20 out 2026).
//
// O log continua com o conteúdo — é o que se lê quando um servidor sofre um
// ataque —, mas quem escreveu e onde viram um pseudônimo estável: a mesma
// pessoa aparece sempre com o mesmo código (dá para seguir um atacante), e o ID
// real não fica escrito. Com o segredo (no volume /data), o dono do bot calcula
// o pseudônimo de um ID quando precisa procurar alguém: `&servidores pseudonimo <id>`.
//
// LOG_ANONIMO=0 no .env desliga (o log volta a ter os IDs reais).

import { createHmac, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// ID do Stoat: ULID, 26 caracteres em Crockford base32
const ULID_NO_TEXTO = /\b[0-9A-HJKMNP-TV-Z]{26}\b/g;

let segredo = null;
function lerSegredo() {
  if (segredo) return segredo;
  if (process.env.LOG_SEGREDO) return (segredo = process.env.LOG_SEGREDO);
  const arq = join(dirname(process.env.DB_PATH || "./stoat.db"), "log-segredo.key");
  try { segredo = readFileSync(arq, "utf8").trim(); } catch {}
  if (!segredo) {
    segredo = randomBytes(32).toString("hex");
    try { mkdirSync(dirname(arq), { recursive: true }); writeFileSync(arq, segredo + "\n", { mode: 0o600 }); } catch {}
  }
  return segredo;
}

export function pseudonimo(id) {
  return "~" + createHmac("sha256", lerSegredo()).update(String(id).toUpperCase()).digest("hex").slice(0, 10);
}
export const anonimizar = (texto) => (typeof texto === "string" ? texto.replace(ULID_NO_TEXTO, (id) => pseudonimo(id)) : texto);

let instalado = false;
export function instalarNoConsole() {
  if (instalado || process.env.LOG_ANONIMO === "0") return false;
  for (const nivel of ["log", "info", "warn", "error"]) {
    const original = console[nivel].bind(console);
    console[nivel] = (...args) => original(...args.map((a) => (typeof a === "string" ? anonimizar(a)
      : a instanceof Error ? Object.assign(new Error(anonimizar(a.message)), { stack: anonimizar(a.stack) }) : a)));
  }
  instalado = true;
  return true;
}
