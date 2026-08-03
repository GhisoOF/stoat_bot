// ══════════════════════════════════════════════════════════
//  calcular.js — cálculos matemáticos VIA PROGRAMAÇÃO
//
//  A LLM escreve código JS e nós executamos num PROCESSO
//  SEPARADO, endurecido em duas camadas:
//
//   1) MODELO DE PERMISSÕES DO NODE (--permission): bloqueia
//      sistema de arquivos, child_process e worker threads no
//      nível do runtime. Isso vale inclusive para `import()`
//      dinâmico — que é como um sandbox ingênuo é furado.
//   2) Prelúdio que remove fetch/rede e esconde process.env,
//      para não vazar token nem chamar a internet.
//
//  Mais: timeout curto (mata laço infinito), limite de memória,
//  env vazio e cwd em /tmp.
//
//  Isso resolve o ponto fraco de LLM em conta: em vez de "achar"
//  o resultado, ela calcula de verdade.
// ══════════════════════════════════════════════════════════

import { execFile } from "node:child_process";

const TIMEOUT_MS = Number(process.env.CALC_TIMEOUT_MS || 5000);
const MAX_SAIDA  = 4000;

// Prelúdio: derruba rede e esconde o ambiente.
const PRELUDIO = `
globalThis.fetch = undefined;
globalThis.WebSocket = undefined;
globalThis.XMLHttpRequest = undefined;
const __proc = { version: process.version, platform: process.platform };
Object.defineProperty(globalThis, "process", { value: __proc, configurable: false });
`;

export const definicao = {
  type: "function",
  function: {
    name: "calcular",
    description: "Executa código JavaScript para fazer contas de verdade (aritmética, estatística, conversões, séries, datas). Use SEMPRE que precisar de um número exato em vez de estimar. O código deve terminar com uma expressão ou usar 'return'. Sem acesso a rede ou arquivos.",
    parameters: {
      type: "object",
      required: ["codigo"],
      properties: {
        codigo: {
          type: "string",
          description: "Código JavaScript. Ex.: 'return (1234*5678)/3' ou 'const xs=[1,2,3]; return xs.reduce((a,b)=>a+b,0)/xs.length'",
        },
      },
    },
  },
};

export async function executar({ codigo }) {
  if (!codigo || typeof codigo !== "string") return { erro: "Nenhum código recebido." };
  if (codigo.length > 8000) return { erro: "Código longo demais." };

  // Embrulha em função para aceitar 'return' e capturar o resultado.
  const programa = `${PRELUDIO}
const __f = async () => { ${codigo} };
__f().then((r) => {
  if (r === undefined) { console.log("(sem valor de retorno — use 'return')"); return; }
  console.log((typeof r === "object" && r !== null) ? JSON.stringify(r) : String(r));
}).catch((e) => { console.log("ERRO: " + (e?.message ?? e)); });`;

  return new Promise((resolve) => {
    const filho = execFile(
      process.execPath,
      [
        "--permission",              // modelo de permissões: fs/child_process/worker bloqueados
        "--max-old-space-size=128",
        "--no-warnings",
        "--input-type=module",
        "-e", programa,
      ],
      {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_SAIDA,
        env: {},                 // sem variáveis de ambiente (não vaza token)
        cwd: "/tmp",
      },
      (err, stdout, stderr) => {
        const saida = (stdout || "").trim();
        if (err?.killed) return resolve({ erro: `Tempo esgotado (${TIMEOUT_MS}ms) — provável laço infinito.` });
        if (err && !saida)  return resolve({ erro: (stderr || err.message).split("\n")[0].slice(0, 300) });
        resolve({ resultado: saida.slice(0, MAX_SAIDA) });
      },
    );
    filho.on("error", (e) => resolve({ erro: e.message }));
  });
}
