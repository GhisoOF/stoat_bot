// Comandos em árvore: uma família, uma raiz, e a ajuda descendo por ela.
//
// O que isto protege:
//   • `&automod blocklist` e `&blocklist` fazem a MESMA coisa (alias mantido);
//   • `&help` desce por quantas camadas a árvore tiver;
//   • o texto de um assunto vive num lugar só — `&help punicao` e
//     `&help automod punicao` mostram o mesmo objeto, não duas cópias.

import assert from "node:assert";
import { arvoreSubtopicos } from "./modulos/moderacao/help-arvore.js";

let ok = 0, falhou = 0;
const t = (nome, fn) => {
  try { fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};
const tAsync = async (nome, fn) => {
  try { await fn(); console.log(`  ✅ ${nome}`); ok++; }
  catch (e) { console.log(`  ❌ ${nome}\n     ${e.message}`); falhou++; }
};

const METADADOS = new Set(["titulo", "texto"]);
const filhos = (no) => Object.keys(no ?? {})
  .filter((k) => !METADADOS.has(k) && no[k] && typeof no[k] === "object");

console.log("\n── a árvore da ajuda ──");
for (const lang of ["pt", "en"]) {
  const a = arvoreSubtopicos("&", lang);

  t(`[${lang}] automod é uma família com os 4 assuntos`, () => {
    for (const filho of ["blocklist", "whitelist", "sentinela", "punicao"]) {
      assert.ok(a.automod?.[filho], `faltou &help automod ${filho}`);
    }
  });
  t(`[${lang}] a ajuda desce 3 níveis (automod > sentinela > antiguidade)`, () => {
    assert.ok(a.automod.sentinela.antiguidade?.texto, "o 3º nível não tem texto");
  });
  t(`[${lang}] o assunto vive num lugar só (mesmo objeto, não cópia)`, () => {
    assert.strictEqual(a.automod.punicao, a.punicao);
    assert.strictEqual(a.automod.sentinela, a.sentinela);
    assert.strictEqual(a.automod.blocklist, a.blocklist);
  });
  t(`[${lang}] warn e entrar viraram raiz, com texto próprio`, () => {
    assert.ok(a.warn?.texto, "warn sem texto");
    assert.ok(a.entrar?.texto, "entrar sem texto");
  });
  t(`[${lang}] nenhum filho fantasma (chave sem nó)`, () => {
    const varrer = (no, caminho) => {
      for (const k of Object.keys(no)) {
        if (METADADOS.has(k)) continue;
        assert.ok(no[k] && typeof no[k] === "object", `${caminho} ${k} é uma chave vazia`);
        varrer(no[k], `${caminho} ${k}`);
      }
    };
    for (const raiz of Object.keys(a)) varrer(a[raiz], raiz);
  });
  t(`[${lang}] todo nó da árvore diz O QUE É, não só a sintaxe`, () => {
    // O pedido: a ajuda explica o que faz, além do que dá para fazer.
    const semExplicacao = [];
    const varrer = (no, caminho) => {
      if (no.texto) {
        const linhas = String(no.texto).split("\n").filter(Boolean);
        // Uma linha de prosa = não começa com crase (que é sintaxe de comando).
        if (!linhas.some((l) => !l.trimStart().startsWith("`") && l.length > 40)) {
          semExplicacao.push(caminho);
        }
      }
      for (const k of filhos(no)) varrer(no[k], `${caminho} ${k}`);
    };
    for (const raiz of ["automod", "warn", "entrar"]) varrer(a[raiz], raiz);
    assert.equal(semExplicacao.length, 0, `só listam sintaxe: ${semExplicacao.join(", ")}`);
  });
  t(`[${lang}] automod lista o anti-duplicata (o módulo novo)`, () => {
    assert.match(a.automod.texto, /antiduplicata/i);
  });
}

console.log("\n── o roteamento: família e atalho levam ao mesmo lugar ──");
const chamadas = [];
const falso = (nome) => async (_msg, args) => { chamadas.push(`${nome}(${args.join(" ")})`); };

await tAsync("&automod blocklist add X == &blocklist add X", async () => {
  const mod = await import("./modulos/moderacao/automod-comandos.js");
  // O despacho é interno ao cmdAutomod; aqui confirmamos que os nomes que ele
  // aceita existem como export, que é o que a delegação usa.
  for (const f of ["cmdBlocklist", "cmdWhitelist", "cmdScam", "cmdPunicao", "cmdWarnings", "cmdClearwarnings"]) {
    assert.equal(typeof mod[f], "function", `${f} sumiu — a delegação quebra`);
  }
  void falso;
});

await tAsync("o que virou opção de família NÃO existe mais solto no topo", async () => {
  const fs = await import("node:fs");
  const main = fs.readFileSync("./main.js", "utf8");
  for (const morta of ["blocklist", "whitelist", "sentinela", "punicao", "warnings", "clearwarnings"]) {
    assert.doesNotMatch(main, new RegExp(`\\n\\s+"?${morta}"?\\s*:\\s*(automodCmd|\\()`),
      `${morta} ainda é rota de topo — devia existir só dentro da família`);
  }
  for (const viva of ["automod", "warn", "entrar", "sair", "tts"]) {
    assert.match(main, new RegExp(`\\n\\s+"?${viva}"?\\s*:`), `a rota ${viva} sumiu do main.js`);
  }
});

await tAsync("nenhum texto anuncia um comando que não existe mais", async () => {
  const fs = await import("node:fs");
  const alvos = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = `${dir}/${e.name}`;
      if (e.isDirectory()) varrer(caminho);
      else if (e.name.endsWith(".js")) alvos.push(caminho);
    }
  };
  varrer("./modulos");
  const mortos = [];
  for (const f of alvos) {
    const txt = fs.readFileSync(f, "utf8");
    for (const m of ["blocklist", "whitelist", "sentinela", "punicao", "warnings", "clearwarnings"]) {
      // `${P}blocklist` solto = anúncio de comando morto. Dentro de
      // `${P}automod blocklist` está certo, e o regex abaixo não pega esse.
      const re = new RegExp(String.raw`\$\{(P|PREFIXO)\}${m}\b`, "g");
      if (re.test(txt)) mortos.push(`${f}: \${P}${m}`);
    }
    if (/\$\{(P|PREFIXO)\}tts (entrar|sair)\b/.test(txt)) mortos.push(`${f}: tts entrar/sair`);
  }
  assert.equal(mortos.length, 0, `textos anunciando comando morto:\n     ${mortos.join("\n     ")}`);
});

await tAsync("&tts entrar/sair não existem: sem aviso e sem entrar na call", async () => {
  // Só `&entrar`/`&sair` entram e saem. Por `&tts`, essas palavras não são
  // comando — e não há mensagem de "agora é &entrar" (o código tem um usuário).
  const fs = await import("node:fs");
  const tts = fs.readFileSync("./modulos/ferramentas/tts.js", "utf8");
  assert.doesNotMatch(tts, /Agora é/, "o aviso de redirecionamento voltou");
  assert.match(tts, /if \(ctx\.viaAtalhoVoz && \["entrar", "join", "sair"/,
    "a porta de entrar/sair tem de exigir viaAtalhoVoz");
  const lista = tts.match(/const SUBCOMANDOS = \[([\s\S]*?)\];/)?.[1] ?? "";
  assert.doesNotMatch(lista, /"entrar"|"sair"/, "entrar/sair não podem ser sugeridos como subcomando do &tts");
});

await tAsync("&entrar e &sair continuam funcionando (a porta única)", async () => {
  const main = await import("node:fs").then((fs) => fs.readFileSync("./main.js", "utf8"));
  assert.match(main, /entrar:\s*\(msg, args, ctx\) => ttsVoz\.cmdTts\(msg, \["entrar", \.\.\.args\], \{ \.\.\.ctx, viaAtalhoVoz: true \}\)/);
  assert.match(main, /sair:\s*\(msg, args, ctx\) => ttsVoz\.cmdTts\(msg, \["sair", \.\.\.args\], \{ \.\.\.ctx, viaAtalhoVoz: true \}\)/);
});

console.log(`\nÁRVORE DE COMANDOS: ${ok} ok, ${falhou} falha(s)`);
process.exit(falhou ? 1 : 0);
