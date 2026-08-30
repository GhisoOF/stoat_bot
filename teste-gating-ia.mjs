// teste-gating-ia.mjs — a IA não existe fora do Vapor Nexus
//
// A regra: fora do servidor com IA, a única menção é UMA linha informativa no
// &info (onde a IA funciona e o que faz, sem tom de convite). Fora isso —
// nem tutorial, nem &info, nem &help, nem a recusa de comando (que dizia
// "faz parte dos recursos de IA" e virava convite a perguntar onde). Dentro,
// tudo continua lá, com a visão anunciada. Executa os comandos DE VERDADE nos
// dois idiomas — a lição do embedIdioma: só node --check não pega helper
// inexistente.
//
// Smoke do gating: fora do servidor com IA, NENHUMA menção a Judy/IA pode
// escapar em &tutorial e &info — e dentro dele, a Judy tem que aparecer.
process.env.CHAT_SERVIDORES = "01KH9SJYWVD7XAHJ28TP0YP4Q0";   // só o Vapor Nexus
const geral = await import("./modulos/moderacao/geral.js");
const tutorial = await import("./modulos/moderacao/tutorial.js");

let passou = 0, falhou = 0;
const caso = (n, c, d = "") => { if (c) { passou++; console.log(`  ✅ ${n}`); } else { falhou++; console.log(`  ❌ ${n}${d ? " — " + d : ""}`); } };

async function coletar(fn, serverId, lang, args = []) {
  const saidas = [];
  const ctx = {
    sendEmbed: async (_c, e) => saidas.push(JSON.stringify(e)),
    COR: { info: 1, erro: 2, aviso: 3, sucesso: 4 }, PREFIXO: "&",
    serverId, config: { idioma: lang }, cfgGlobal: {}, estado: {},
    salvarConfig: () => {}, membroTemPermissao: () => true, ehSuperAdmin: () => true,
  };
  const msg = { authorId: "u1", channelId: "c1", content: "&x",
    channel: { sendMessage: async (t) => { saidas.push(typeof t === "string" ? t : JSON.stringify(t)); return { edit: async () => {} }; } },
    client: { user: { id: "bot" } }, reply_ids: [] };
  const logs = [];
  const lo = console.log; console.log = (...a) => logs.push(a.join(" "));
  try { await fn(msg, args, ctx); } finally { console.log = lo; }
  return { txt: saidas.join("\n"), logs: logs.join("\n") };
}

const FORA = "01OUTROSERVIDORQUALQUER000";
const DENTRO = "01KH9SJYWVD7XAHJ28TP0YP4Q0";

for (const lang of ["pt", "en"]) {
  // &tutorial (roteiro): fora, zero Judy/IA
  let r = await coletar(tutorial.cmdTutorial, FORA, lang);
  caso(`tutorial ${lang} fora: sem Judy nem IA`, !/Judy|\bIA\b|\bAI\b/i.test(r.txt.replace(/"colour":\d+/g,"")), (r.txt.match(/[^"]*(?:Judy|IA)[^"]*/i)||[""])[0].slice(0,90));
  caso(`tutorial ${lang} fora: sem erro de escopo`, !/is not defined|is not a function/.test(r.txt + r.logs));

  // dentro, a página da Judy existe e a visão está anunciada
  r = await coletar(tutorial.cmdTutorial, DENTRO, lang, ["ia"]);
  caso(`tutorial ia ${lang} dentro: Judy presente com visão`, /Judy/.test(r.txt) && /imagens|images/i.test(r.txt));

  // &info: fora, zero menção; dentro, a linha da IA com leitura de imagens
  // O &info é a ÚNICA superfície que menciona a IA fora do servidor dela:
  // uma linha informativa (onde funciona + o que faz), sem tom de convite.
  r = await coletar(geral.cmdSobre, FORA, lang);
  caso(`info ${lang} fora: informa o servidor oficial e as funções`,
    /Vapor Nexus/.test(r.txt) && /leitura de imagens|image reading/.test(r.txt));
  caso(`info ${lang} fora: sem tom de propaganda`,
    !/venha|junte-se|join us|entre no|convite|invite/i.test(r.txt));
  r = await coletar(geral.cmdSobre, DENTRO, lang);
  caso(`info ${lang} dentro: anuncia leitura de imagens`, /leitura de imagens|image reading/.test(r.txt));

  // índice do &help fora: nenhuma linha de IA no catálogo
  r = await coletar(geral.cmdHelp, FORA, lang);
  caso(`help índice ${lang} fora: sem Judy nem IA`, !/Judy|`&chat`|`&modia`/i.test(r.txt));

  // help de comando de IA fora: neutro, sem citar IA
  r = await coletar(geral.cmdHelp, FORA, lang, ["chat"]);
  caso(`help chat ${lang} fora: nega sem citar IA`, /não existe|doesn't exist/i.test(r.txt) && !/\bIA\b|\bAI\b/.test(r.txt));
}

console.log(`\n${passou} passou, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
