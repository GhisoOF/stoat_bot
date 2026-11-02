
// O serviço de IA da moderação (P4, 2 nov 2026). O chat IA saiu, e com ele o laço de
// ferramentas (/chat, /ferramenta, /ferramentas: ler o código, buscar na web, RSS,
// calcular, gerar e ver imagem). Ficam as rotas da moderação: /moderar-imagem (a
// visão descreve, o bot decide) e /hash-imagem (o dHash do perfil, sem modelo), e as
// de diagnóstico (/saude, /dns, /diagnostico). O bot fala com ele só por
// modulos/moderacao/modelo.js.
import { createServer } from "node:http";
import { garantirDNS, estaInstalado, servidoresUsados } from "./dns-fallback.js";
import { moderarImagem } from "./ferramentas/ver-imagem.js";
import { hashImagem } from "./ferramentas/hash-imagem.js";   // (31 out 2026, P3a) o dHash do perfil
import { LLM_URL, modelosDoLLM } from "./llm.js";
import { chaveServicoIA } from "../modulos/moderacao/modelo-enderecos.js";   // (P4, revisão) sem o core/env.js

const PORTA        = Number(process.env.PORTA || 8090);
const MODELO_VISAO = process.env.LLM_MODEL_VISAO || "";
const CHAVE        = chaveServicoIA();   // obrigatória: header x-chave

const log = (...a) => console.log("[IA]", ...a);

// (31 out 2026, P1) Sem chave, o serviço não sobe: qualquer processo que alcançasse a
// porta baixaria imagens e gastaria o modelo em nome do bot. Embutido, o iniciar.js
// gera uma chave por boot sozinho.
if (!CHAVE) {
  console.error("[IA] sem chave (IA_SERVICO_CHAVE ou IA_CHAVE no ambiente): o serviço de IA não sobe sem ela. Defina a mesma chave no .env do bot e do serviço.");
  process.exit(1);
}

// (2 nov 2026, P4.1, CodeQL "stack trace exposure") O que volta no corpo de um erro: só o texto
// fixo que o próprio código escreve (ErroDoPedido: corpo grande, JSON inválido) ou, para qualquer
// outra exceção, a mensagem genérica com o código "interno". Mensagem e stack da exceção ficam no
// log do processo. O bot só confere se `erro` veio (e loga): nada nele depende do texto.
class ErroDoPedido extends Error {
  constructor(texto, status = 400) { super(texto); this.status = status; }
}
const ERRO_INTERNO = { erro: "erro interno do serviço de IA", codigo: "interno" };

const json = (res, code, obj) => {
  const corpo = JSON.stringify(obj);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(corpo) });
  res.end(corpo);
};

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let dados = "";
    req.on("data", (c) => {
      dados += c;
      if (dados.length > 2_000_000) { reject(new ErroDoPedido("corpo grande demais", 413)); req.destroy(); }
    });
    req.on("end", () => {
      let v;
      try { v = dados ? JSON.parse(dados) : {}; } catch { return reject(new ErroDoPedido("corpo não é JSON válido")); }
      if (v === null || typeof v !== "object" || Array.isArray(v)) return reject(new ErroDoPedido("o corpo tem de ser um objeto JSON"));
      resolve(v);
    });
    req.on("error", reject);
  });
}

const servidor = createServer(async (req, res) => {
  // Chave obrigatória (o serviço nem sobe sem ela) — vale para todas as rotas.
  if (req.headers["x-chave"] !== CHAVE) return json(res, 401, { erro: "não autorizado" });

  try {
    if (req.method === "GET" && req.url === "/saude") {
      let llmOk = false, modelos = [];
      try { modelos = await modelosDoLLM(); llmOk = true; }
      catch (e) { log(`/saude: LLM inalcançável (${e?.message ?? e})`); }
      return json(res, 200, {
        // O campo `ollama` que duplicava `llm` saiu: o backend é llama.cpp desde
        // a migração, nada no bot lia esse campo, e o nome enganava quem depurava.
        ok: true, llm: { url: LLM_URL, alcancavel: llmOk, modelos }, visao: MODELO_VISAO || null,
      });
    }

    if (req.method === "GET" && req.url === "/dns") {
      // Rota curta para conferir só o DNS, sem rodar o diagnóstico inteiro.
      const info = await garantirDNS();
      return json(res, 200, {
        fallbackAtivo: estaInstalado(),
        servidores: servidoresUsados(),
        estado: info.motivo,
      });
    }

    if (req.method === "GET" && req.url === "/diagnostico") {
      const problemas = await diagnosticoDeBoot();
      return json(res, 200, { ok: problemas.length === 0, problemas });
    }

    // Moderação de imagem: sessão nova por imagem, só descreve (o bot decide).
    if (req.method === "POST" && req.url === "/moderar-imagem") {
      const { url } = (await lerCorpo(req)) ?? {};
      if (!url) return json(res, 400, { erro: "informe { url }" });
      return json(res, 200, await moderarImagem({ url }));
    }

    // (31 out 2026, P3a) o dHash de uma imagem do CDN, sem modelo (a moderação do perfil)
    if (req.method === "POST" && req.url === "/hash-imagem") {
      const { url } = (await lerCorpo(req)) ?? {};
      if (!url) return json(res, 400, { erro: "informe { url }" });
      return json(res, 200, await hashImagem({ url }));
    }

    json(res, 404, { erro: "rota desconhecida" });
  } catch (e) {
    if (e instanceof ErroDoPedido) return json(res, e.status, { erro: e.message, codigo: "pedido" });
    log("erro:", e?.stack ?? e?.message ?? e);
    json(res, 500, ERRO_INTERNO);
  }
});

async function diagnosticoDeBoot() {
  const problemas = [];

  const dnsInfo = await garantirDNS();
  if (!dnsInfo.trocou) {
    if (dnsInfo.motivo.includes("resolvendo")) {
      log("✓ DNS resolvendo");
    } else {
      problemas.push(
        `DNS NÃO resolve e o fallback está indisponível (${dnsInfo.motivo}).`,
        "   → confira /etc/resolv.conf DENTRO do container:",
        "     cat /etc/resolv.conf",
        "   → precisa ter uma linha 'nameserver'. Se só tiver comentários,",
        "     precisa ter uma linha 'nameserver'; se não tiver, o DNS do sistema está quebrado",
      );
    }
  } else if (dnsInfo.funciona) {
    log(`⚠ DNS do sistema quebrado — usando ${dnsInfo.servidores.join(", ")} por dentro`);
    problemas.push(
      "O /etc/resolv.conf do container não tem 'nameserver' — o DNS do sistema não funciona.",
      `   → contornado: resolvendo por ${dnsInfo.servidores.join(", ")} dentro do processo.`,
      "   → a Judy funciona assim, mas nomes locais/Tailscale não resolvem.",
      "   → conserto de verdade: arrume o /etc/resolv.conf da máquina",
      "     (e confira o /etc/resolv.conf do HOST, que é de onde o container copia)",
    );
  } else {
    problemas.push(
      "DNS NÃO resolve, nem pelo sistema nem pelos servidores de fallback.",
      "   → o container parece estar sem saída para a internet (firewall/rota).",
      "     Teste: curl -s -o /dev/null -w '%{http_code}' https://1.1.1.1",
    );
  }

  // 2. Alcance real ao CDN do Stoat (DNS pode resolver e a rota estar bloqueada): é
  // de lá que vêm as imagens a moderar
  const cdn = (process.env.CDN_URL || "https://cdn.stoatusercontent.com").replace(/\/$/, "");
  try {
    const r = await fetch(cdn, { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "judy-ia" } });
    log(`✓ CDN alcançável (HTTP ${r.status})`);
  } catch (e) {
    const causa = e?.cause?.code ?? e?.message ?? "?";
    if (!problemas.length) {
      problemas.push(
        `Sem acesso ao CDN do Stoat (${causa}), mesmo com DNS ok.`,
        "   → firewall ou rota bloqueando saída?",
      );
    }
  }

  // 3. O servidor de LLM — sem ele a visão não responde nada (o hash funciona)
  try {
    const nomes = await modelosDoLLM();
    log(`✓ LLM respondendo em ${LLM_URL} (${nomes.length} modelo(s): ${nomes.join(", ") || "—"})`);
    if (MODELO_VISAO && nomes.length && !nomes.includes(MODELO_VISAO)) {
      problemas.push(
        `O modelo de visão "${MODELO_VISAO}" não está na lista do servidor.`,
        `   → disponíveis: ${nomes.join(", ")}. Confira LLM_MODEL_VISAO/MODELO_VISAO.`,
      );
    }
  } catch (e) {
    problemas.push(
      `Servidor de LLM inacessível em ${LLM_URL} (${e?.cause?.code ?? e?.message}).`,
      "   → a visão das imagens não vai responder (o hash do perfil continua).",
    );
  }

  if (problemas.length) {
    console.error("");
    console.error("[IA] ═══════════════════════════════════════════");
    console.error("[IA] ⚠️  PROBLEMAS DETECTADOS NO BOOT");
    for (const p of problemas) console.error(`[IA] ${p}`);
    console.error("[IA] ═══════════════════════════════════════════");
    console.error("");
  } else {
    log("✓ diagnóstico de boot: tudo certo");
  }
  return problemas;
}

// (31 out 2026, P1) 127.0.0.1 por padrão: a porta não fica aberta na rede de casa;
// quem roda o serviço em outra máquina diz o endereço em SERVICO_HOST.
servidor.listen(PORTA, process.env.SERVICO_HOST || "127.0.0.1", () => {
  log(`serviço de IA na porta ${PORTA}`);
  log(`LLM: ${LLM_URL || "⚠️ NENHUM (IA_MODO=local ou LLM_URL)"} | visão: ${MODELO_VISAO || "desligada"}`);
  // roda depois de subir: um problema de rede não deve impedir o serviço
  diagnosticoDeBoot().catch((e) => console.error("[IA] diagnóstico falhou:", e?.message));
});
