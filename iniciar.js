
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const IA_EMBUTIDA = process.env.IA_EMBUTIDA !== "0";
const VOZ_ATIVA = process.env.VOZ_ATIVA === "1";

// Padrões de localhost quando os serviços estão embutidos.
if (IA_EMBUTIDA && !process.env.IA_SERVICO_URL) process.env.IA_SERVICO_URL = "http://127.0.0.1:8090";
if (VOZ_ATIVA && !process.env.VOZ_SERVICO_URL) process.env.VOZ_SERVICO_URL = "http://127.0.0.1:8091";

const filhos = new Set();
let encerrando = false;

function subir(nome, cwd, arquivo, { reiniciar = true, env = {} } = {}) {
  if (!existsSync(`${cwd}/${arquivo}`)) {
    console.warn(`[INICIAR] ${nome}: ${cwd}/${arquivo} não existe — pulando.`);
    return;
  }
  let tentativas = 0;
  const lancar = () => {
    const p = spawn(process.execPath, [arquivo], {
      cwd, stdio: "inherit",
      env: { ...process.env, ...env },
    });
    filhos.add(p);
    console.info(`[INICIAR] ${nome} de pé (pid ${p.pid}).`);
    p.on("exit", (code) => {
      filhos.delete(p);
      if (encerrando) return;
      if (!reiniciar) { console.error(`[INICIAR] ${nome} saiu (${code}); encerrando o container.`); return encerrar(code ?? 1); }
      const espera = Math.min(30_000, 1000 * 2 ** Math.min(tentativas++, 5));
      console.error(`[INICIAR] ${nome} caiu (${code}); volta em ${espera / 1000}s.`);
      setTimeout(lancar, espera);
    });
  };
  lancar();
}

function encerrar(code = 0) {
  encerrando = true;
  for (const p of filhos) { try { p.kill("SIGTERM"); } catch {} }
  setTimeout(() => process.exit(code), 3000).unref();
}
process.on("SIGTERM", () => encerrar(0));
process.on("SIGINT", () => encerrar(0));

if (IA_EMBUTIDA) subir("ia-servico", "./ia-servico", "servidor.js", { env: { PORTA: process.env.IA_PORTA || "8090" } });
if (VOZ_ATIVA) subir("voz-servico", "./voz-servico", "servidor.js", { env: { VOZ_PORTA: process.env.VOZ_PORTA || "8091" } });

// O bot é o processo principal: se ele sair, tudo sai.
subir("bot", ".", "main.js", { reiniciar: false });
