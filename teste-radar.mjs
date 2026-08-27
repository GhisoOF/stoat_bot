// ══════════════════════════════════════════════════════════
//  teste-radar.mjs — o vigia privado de termos
//
//  Duas coisas precisam ser verdade ao mesmo tempo: ele encaminha o que
//  interessa, e não aparece em lugar nenhum. A segunda é fácil de quebrar
//  sem perceber — basta alguém registrar o comando em `rotas` um dia.
// ══════════════════════════════════════════════════════════
process.env.RADAR_CANAL = "CANAL_DESTINO_TESTE";
import fs from "node:fs";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

const radar = await import("./modulos/ferramentas/radar.js");

// ══ 1. O que casa e o que não casa ══
console.log("── termos: palavra inteira, sem acento, sem caixa ──");
{
  const casa = (t) => radar.termosNoTexto(t);
  ok(casa("o Ghiso mandou bem").includes("Ghiso"), "★ o nome solto casa");
  ok(casa("GHISO gritando")[0] === "Ghiso" && casa("ghiso minusculo")[0] === "Ghiso", "  → em qualquer caixa");
  ok(casa("fala com Ghiso#4419").join() === "Ghiso#4419", "  → e a tag completa aparece sozinha, sem repetir o nome curto");
  ok(casa("a Judy respondeu").includes("Judy"), "  → 'Judy' casa");
  ok(casa("o Cobaia#7705 bugou").join() === "Cobaia#7705", "  → e a tag do bot também");

  ok(casa("Judymar chegou").length === 0, "★ pedaço de palavra maior NÃO casa (Judymar ≠ Judy)");
  ok(casa("comprei um vaporizador").length === 0, "  → nem 'vaporizador' por causa de 'vapor'");
  ok(casa("olha https://nexus.com/vapor").length === 0, "  → e link não conta: URL sai do texto antes da comparação");
}

// ══ 2. A regra de par — o que segura o ruído ══
//
//  "Vapor" e "Nexus" sozinhos são palavras comuns: vaporizador, vapor d'água,
//  Nexus Mods, o celular. Num servidor alheio isso encaminharia conversa de
//  gente que não tem nada a ver com você.
console.log("\n── par: 'vapor' e 'nexus' só valem acompanhados ──");
{
  const casa = (t) => radar.termosNoTexto(t);
  ok(casa("entra no Vapor Nexus").join() === "Vapor Nexus", "★ 'Vapor Nexus' casa, e só o termo composto aparece");
  ok(casa("o vapor da panela subiu").length === 0, "  → 'vapor' sozinho NÃO casa");
  ok(casa("baixei do Nexus Mods").length === 0, "  → 'nexus' sozinho NÃO casa");
  ok(casa("no vapor, aquele do nexus").length === 2, "  → mas os dois na mesma frase casam, mesmo separados");
}

// ══ 3. Invisível: não pode aparecer em help, config, debug ou tutorial ══
console.log("\n── não aparece em lugar nenhum ──");
{
  const main = fs.readFileSync("./main.js", "utf8");
  const bloco = main.slice(main.indexOf("const rotas = {"), main.indexOf("estado.rotas = rotas;"));
  ok(!/radar/i.test(bloco), "★ NÃO está em `rotas` — é de lá que `&debug` e `&help` tiram a lista");
  ok(/radar\.talvezComando\(message/.test(main), "  → o comando é despachado à parte, antes do roteador");
  ok(/radar\.aoMensagem\(message/.test(main), "  → e o encaminhamento roda a cada mensagem");

  const ordem = main.indexOf("radar.aoMensagem(message") < main.indexOf("engine.runAutomod(message");
  ok(ordem, "  → ANTES do automod: uma mensagem apagada por golpe ainda é vista");

  for (const arq of ["modulos/moderacao/geral.js", "modulos/moderacao/help-arvore.js", "modulos/moderacao/debug-comando.js"]) {
    ok(!/radar/i.test(fs.readFileSync(`./${arq}`, "utf8")), `  → sem menção em ${arq}`);
  }
}

// ══ 4. Freios: laço, repetição, quem não deve entrar ══
console.log("\n── freios ──");
{
  const fonte = fs.readFileSync("./modulos/ferramentas/radar.js", "utf8");
  ok(/message\.channelId === CANAL_DESTINO\) return false/.test(fonte),
    "★ o próprio canal de destino é ignorado — senão o alerta viraria alerta de si mesmo");
  ok(/message\.authorId === client\.user\?\.id\) return false/.test(fonte), "  → e o bot nunca encaminha a si mesmo");
  ok(/jaEnviadas\.has\(/.test(fonte), "  → mensagem repetida não vai duas vezes");
  ok(/!serverId && !INCLUIR_DM\) return false/.test(fonte), "★ mensagem direta fica de fora por padrão (RADAR_DM=1 inclui)");
  ok(/!INCLUIR_DONO && ctx\.ehSuperAdmin/.test(fonte), "  → e as suas próprias mensagens também (RADAR_DONO=1 inclui)");
  ok(/TETO_POR_MINUTO/.test(fonte) && /ESPACO_MS/.test(fonte), "  → com espaçamento e teto por minuto: o Stoat derruba rajada");
}

// ══ 5. O comando só existe para quem é super admin ══
console.log("\n── `&radar` é invisível para os outros ──");
{
  const msg = (conteudo, autor) => ({ content: conteudo, authorId: autor, channel: { sendMessage: async () => {} } });
  const ctxDono = { PREFIXO: "&", ehSuperAdmin: (id) => id === "dono" };

  ok(await radar.talvezComando(msg("&radar", "dono"), ctxDono), "★ o dono recebe resposta");
  ok(!(await radar.talvezComando(msg("&radar", "outro"), ctxDono)),
    "  → qualquer outra pessoa recebe `false`: a mensagem segue e vira 'comando desconhecido'");
  ok(!(await radar.talvezComando(msg("&ping", "dono"), ctxDono)), "  → e outros comandos passam batido");
  ok(await radar.talvezComando(msg("&radar teste entra no Vapor Nexus", "dono"), ctxDono), "  → `radar teste` responde");
}

console.log(`\nRADAR: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
