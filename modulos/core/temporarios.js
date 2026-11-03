// temporarios.js — os temporários das escritas atômicas do bot (3 nov 2026, P5, integração).
//
// O bot grava alguns arquivos ao lado do banco de forma atômica: escreve num temporário na mesma
// pasta e renomeia por cima (treino.js, bateria.js, bateria-avisos.js; o cache da blocklist em
// indice-dominios.js). Se o processo morre no meio (restart, SIGKILL, fim de uma suíte de teste),
// o temporário ficava para sempre — a rodada de testes deixava ~15 em /tmp a cada vez.
//
//   • abrir/fechar: o temporário que ESTE processo está escrevendo agora; se ele sair no meio
//     (process.exit no SIGTERM, fim de suíte), o gancho "exit" apaga — síncrono, só esses.
//   • limparOrfaos(pasta): na subida e no ciclo de 6 h (retencao.limparVencidos), apaga da pasta do
//     banco os temporários do bot com mais de 10 min (o que está sendo escrito agora tem menos).
//     Só os nomes do PADRAO, só arquivo comum (nunca link nem pasta).

import { readdirSync, lstatSync, rmSync } from "node:fs";
import { join } from "node:path";

// `.<arquivo>.<pid>.<aleatório base36>.tmp` e `blocklist-cache.bin.tmp` — nada além disso
export const PADRAO = /^(?:\.(?:bateria-treino\.jsonl|bateria-imagens\.jsonl|bateria-aviso\.chave)\.\d{1,10}\.[0-9a-z]{1,16}|blocklist-cache\.bin)\.tmp$/;
export const IDADE_MS = 10 * 60_000;

const emEscrita = new Set();
// Devolve quantos apagou.
export function limparOrfaos(pasta, { agora = Date.now(), idadeMs = IDADE_MS } = {}) {
  if (!pasta) return 0;
  let nomes;
  try { nomes = readdirSync(pasta); } catch { return 0; }
  let n = 0;
  for (const nome of nomes) {
    if (!PADRAO.test(nome)) continue;
    const arq = join(pasta, nome);
    if (emEscrita.has(arq)) continue;   // este processo está escrevendo nele agora
    try {
      const st = lstatSync(arq);
      if (!st.isFile() || agora - st.mtimeMs < idadeMs) continue;
      rmSync(arq);
      n++;
    } catch { /* sumiu no meio (a escrita terminou ou outro ciclo apagou): nada a fazer */ }
  }
  return n;
}

let gancho = false;
function sairLimpo() {
  for (const arq of emEscrita) {
    try { rmSync(arq, { force: true }); } catch { /* saindo: o próximo boot apaga (limparOrfaos) */ }
  }
  emEscrita.clear();
}
// Marca o temporário que vai ser escrito agora (devolve o mesmo caminho).
export function abrir(arq) {
  emEscrita.add(arq);
  if (!gancho) { gancho = true; process.on("exit", sairLimpo); }
  return arq;
}
// A escrita terminou (renomeado ou apagado): o gancho não mexe mais nele.
export function fechar(arq) { emEscrita.delete(arq); }
