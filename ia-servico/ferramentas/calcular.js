
import { execFile } from "node:child_process";

const TIMEOUT_MS = Number(process.env.CALC_TIMEOUT_MS || 5000);
const MAX_SAIDA  = 4000;

// O código roda num CONTEXTO VAZIO do `node:vm`, dentro de um processo filho
// com --permission (15 out 2026). Antes ele rodava direto no filho: zerar o
// `fetch` não fechava a rede — `await import("node:http")` chegava no
// localhost (serviço de voz, ia-servico, llama-swap, a rede do host). O
// --permission do Node 22 não bloqueia rede; o contexto vazio, sim: lá dentro
// não existe import, require, process nem timer — só a linguagem (Math, Date,
// JSON, Intl, BigInt…). Nenhum objeto do lado de fora entra no contexto (é a
// porta das fugas conhecidas do vm), e gerar código de string (Function/eval)
// fica desligado. O resultado volta como TEXTO, lido por fora.
function programaDoFilho(codigo) {
  // o que roda DENTRO do contexto vazio (montado aqui, passado como texto)
  const fonte = [
    "globalThis.__saida = undefined;",
    "(async () => {",
    codigo,
    "})().then(",
    "  (r) => { globalThis.__saida = r === undefined ? \"(sem valor de retorno — use 'return')\" : ((typeof r === 'object' && r !== null) ? JSON.stringify(r) : String(r)); },",
    "  (e) => { globalThis.__saida = 'ERRO: ' + String((e && e.message) || e); });",
  ].join("\n");
  const limite = Math.max(500, TIMEOUT_MS - 500);
  return [
    'import vm from "node:vm";',
    `const fonte = ${JSON.stringify(fonte)};`,
    "const ctx = vm.createContext(Object.create(null), { codeGeneration: { strings: false, wasm: false } });",
    "try {",
    `  vm.runInContext(fonte, ctx, { timeout: ${limite} });`,
    "} catch (e) {",
    '  process.stdout.write("ERRO: " + String(e?.message ?? e).split("\\n")[0]);',
    "  process.exit(0);",
    "}",
    `const fim = Date.now() + ${limite};`,
    "while (Date.now() < fim) {",
    "  await new Promise((r) => setTimeout(r, 5));",
    "  const v = ctx.__saida;",
    '  if (v !== undefined) { process.stdout.write(typeof v === "string" ? v : "(resultado inválido)"); process.exit(0); }',
    "}",
    'process.stdout.write("(sem resultado — o código não terminou)");',
  ].join("\n");
}

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

  const programa = programaDoFilho(codigo);

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
