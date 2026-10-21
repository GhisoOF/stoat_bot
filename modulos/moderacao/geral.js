import { servidorPermitido as temIA, comandoIAPermitido } from "../ai/chat.js";
import * as visaoMod from "./visao.js";
import { arvoreSubtopicos, SUBTOPICOS_SO_IA, ligarFamilias, mesclarNos, MODIA_TAG } from "./help-arvore.js";
import { nomeExibido, normalizarArgs, SUB, citar, subExibido, marcarTraduzido, idDoNome, citarInterno, trechoPronto } from "../core/aliases.js";
import { REGISTRO } from "../comandos/index.js";
import { grupos as gruposHelp, ALIAS_GRUPO, ORDEM as ORDEM_GRUPOS } from "./help-grupos.js";
import { arvoreES } from "./help-arvore-es.js";
import { secaoParametros } from "./help-parametros.js";
import { detalhesDoRegistro, COMANDOS_COM_AJUDA } from "../core/ajuda-registro.js";
import { URL_POLITICA } from "../ferramentas/privacidade.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";
import { escadaDePunicao, rotuloDegrau, GRUPOS_AUTOMOD, estadoDoGrupo, validadeDosAvisos } from "./automod-engine.js";
import { MUNDO } from "../game/mundo.js";
import { servidorNaLista } from "../core/env.js";
import { idEscrito } from "../core/ids.js";

// Comandos que só existem onde a IA roda (espelha a lista do main.js).
const COMANDOS_SO_IA = new Set(["chat", "modia"]);

import * as log from "../core/log.js";
import * as db  from "../core/db.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { descreverErro } from "../core/erros.js";
import { banir } from "../core/banir.js";

// Conta as linhas de código do projeto (uma vez, com cache).
let _linhasCache = null;
function contarLinhas() {
  if (_linhasCache !== null) return _linhasCache;
  try {
    const aqui = dirname(fileURLToPath(import.meta.url));      // modulos/moderacao
    const raizModulos = join(aqui, "..");                       // modulos/
    const raizProjeto = join(raizModulos, "..");               // raiz
    let total = 0;
    try { total += readFileSync(join(raizProjeto, "main.js"), "utf8").split("\n").length; } catch {}
    for (const sub of readdirSync(raizModulos, { withFileTypes: true })) {
      if (!sub.isDirectory()) continue;
      const pasta = join(raizModulos, sub.name);
      for (const f of readdirSync(pasta)) {
        if (f.endsWith(".js")) {
          try { total += readFileSync(join(pasta, f), "utf8").split("\n").length; } catch {}
        }
      }
    }
    _linhasCache = total || null;
  } catch { _linhasCache = null; }
  return _linhasCache;
}

import * as banGlobal from "./ban-global.js";
import { nomeModo } from "../core/nomes-automod.js";
import { podeAgirSobre } from "../core/hierarquia.js";

function extrairAlvo(message, args) {
  // 1) primeiro argumento: <@ID>, <ID> ou ID puro (ULID de 26 chars). Vem
  //    ANTES do mentionIds: numa resposta, o mentionIds pode trazer o autor da
  //    mensagem respondida — "&ban @Fulano" banía outra pessoa.
  const bruto = (args[0] ?? "").replace(/[<@#>!]/g, "");
  const ehUlid = /^[0-9A-HJKMNP-TV-Z]{26}$/i.test(bruto);
  // 2) senão, a menção resolvida pela plataforma
  const id = ehUlid ? bruto.toUpperCase() : (message.mentionIds?.[0] ?? null);

  // Se o 1º arg era o alvo (menção ou ID), o motivo é o resto
  const primeiroEraAlvo = ehUlid || (args[0] ?? "").includes("@");
  const resto = primeiroEraAlvo ? args.slice(1) : args;
  return { id, motivo: resto.join(" ").trim() };
}

export function construirDetalhes(P, lang = "pt", idioma = lang) {
  // os comandos já migrados (fase 3) têm a página no registro, e ela vence —
  // e só ela já tem espanhol (`idioma` "es"; as outras saem em inglês)
  return { ...(lang === "en" ? detalhesEN(P) : detalhesPT(P)), ...detalhesDoRegistro(P, idioma) };
}

function detalhesPT(P) {
  return {


  };
}

function detalhesEN(P) {
  return {


  };
}

const IA_TAG = "\u200b[ia]";
// `comModIA`: o &modia vale fora dos servidores da conversa (16 out 2026)
function filtrarIA(linhas, comIA, comModIA = comIA) {
  if (!Array.isArray(linhas)) return [];   // categoria inexistente/malformada
  return linhas
    .filter((l) => (comIA || !String(l).includes(IA_TAG)) && (comModIA || !String(l).includes(MODIA_TAG)))
    .map((l) => String(l).replace(IA_TAG, "").replace(MODIA_TAG, ""));
}
const podeIA = (cmd, sid) => { try { return comandoIAPermitido(cmd, sid); } catch { return false; } };

function construirSubtopicos(P, lang) {
  if (lang === "en") return {
    sentinela: {
      sensibilidade: {
        titulo: "sentinel sensitivity",
        texto: [
          `**Usage:** \`${citarInterno("automod.sentinela.sensibilidade", P)} <low|medium|high>\``,
          "",
          "Sets from which **score (0–10)** the bot acts on suspicious content:",
          "• 🟢 **low** (threshold 7.5) — only near-certain cases; fewer false positives.",
          "• 🟡 **medium** (threshold 6.5) — recommended balance.",
          "• 🔴 **high** (threshold 5.5) — catches faint signs; protects more, errs more.",
        ].join("\n"),
      },
      testar: {
        titulo: "sentinel test",
        texto: [
          `**Usage:** \`${citarInterno("automod.sentinela.testar", P)} <text>\``,
          "",
          "Simulates analyzing a text and shows the score (0–10) and detected signals, without punishing anyone. Useful for calibrating the sensitivity.",
        ].join("\n"),
      },
      canal: {
        titulo: "sentinel channel",
        texto: [
          `**Usage:** \`${citarInterno("automod.sentinela.canal", P)} <#channel|here|off>\``,
          "",
          "Sets which channel receives the suspicious-content alerts. `off` goes back to the log channel (or the message's own channel).",
        ].join("\n"),
      },
    },
    automod: {
      set: {
        titulo: "automod set",
        texto: [
          `**Usage:** \`${citarInterno("automod", P)} <group> set <parameter> <value>\``,
          "",
          "Adjusts a module's parameter. Parameters per module:",
          "• `antispam`: `mensagens`, `tempo` (ms) — velocidade · `vezes` — repetição · `minuto`, `novato` — mídia · `mencoes`",
          "• `antiruido`: `tamanho`, `limiar` (0–1 or %) — caps · `zalgo` — caracteres · `repeticao`, `ignorar` — letras · `emojis` — emoji",
          "  _Measurement ignores mentions, links, named emojis and code — only typed text counts._",
          "",
          `E.g.: \`${citarInterno("automod", P)} antispam set mensagens 3\` · \`${citarInterno("automod", P)} antispam set tempo 10000\``,
        ].join("\n"),
      },
      punicao: {
        titulo: "automod punicao",
        texto: [
          `**Usage:** \`${citarInterno("automod", P)} <module> punicao <mode|herdar>\``,
          "",
          "Gives a module its **own** punishment, independent of the global one:",
          "• `avisar` — warn only\n• `apagar` — remove the message only\n• `confirmar` — silence and wait for a mod\n• `acumular` — stack warnings until a ban\n• `banir` — instant ban\n• `herdar` — inherit the global punishment again",
          "",
          `E.g.: \`${citarInterno("automod", P)} antilink punicao apagar\``,
        ].join("\n"),
      },
      antirepeticao: {
        titulo: "automod antirepeticao",
        texto: [
          "**Anti-repetition** — blocks the same letter repeated many times in one message (e.g. `aaaaaaaaaa`).",
          "",
          "It ships **disabled** by default, because in Brazilian servers `kkkkk` (laughter) is legitimate — which is also why `k` is ignored by default.",
          "",
          `\`${citarInterno("automod", P)} antirepeticao on\` — enables it`,
          `\`${citarInterno("automod", P)} antirepeticao set repeticao 15\` — repetition limit`,
          `\`${citarInterno("automod", P)} antirepeticao set ignorar k\` — letters to ignore (laughter)`,
          `\`${citarInterno("automod", P)} antirepeticao punicao apagar\` — its own punishment`,
        ].join("\n"),
      },
    },
    punicao: {
      modo: {
        titulo: "punicao modo",
        texto: [
          `**Usage:** \`${citarInterno("automod.punicao", P)} modo <avisar|apagar|confirmar|acumular|banir>\``,
          "",
          "Sets the **global** punishment (applies to every module without its own):",
          "• `avisar` — warn only, don't remove\n• `apagar` — remove the message only\n• `confirmar` — remove, silence (native timeout) and wait for a mod's approval\n• `acumular` — stack warnings and ban at the limit\n• `banir` — instant ban",
        ].join("\n"),
      },
    },
  };

  // pt
  return {
    sentinela: {
      sensibilidade: {
        titulo: "sentinela sensibilidade",
        texto: [
          `**Uso:** \`${citarInterno("automod.sentinela.sensibilidade", P)} <baixa|media|alta>\``,
          "",
          "Define a partir de qual **nota (0–10)** o bot age sobre conteúdo suspeito:",
          "• 🟢 **baixa** (limiar 7,5) — só o que é quase certo; menos falsos positivos.",
          "• 🟡 **media** (limiar 6,5) — equilíbrio recomendado.",
          "• 🔴 **alta** (limiar 5,5) — pega indícios leves; protege mais, erra mais.",
        ].join("\n"),
      },
      testar: {
        titulo: "sentinela testar",
        texto: [
          `**Uso:** \`${citarInterno("automod.sentinela.testar", P)} <texto>\``,
          "",
          "Simula a análise de um texto e mostra a nota (0–10) e os sinais detectados, sem punir ninguém. Útil para calibrar a sensibilidade.",
        ].join("\n"),
      },
      canal: {
        titulo: "sentinela canal",
        texto: [
          `**Uso:** \`${citarInterno("automod.sentinela.canal", P)} <#canal|aqui|off>\``,
          "",
          "Define para qual canal vão os alertas de conteúdo suspeito. `off` volta a avisar no canal de logs (ou no próprio canal da mensagem).",
        ].join("\n"),
      },
    },
    automod: {
      set: {
        titulo: "automod set",
        texto: [
          `**Uso:** \`${citarInterno("automod", P)} <grupo> set <parâmetro> <valor>\``,
          "",
          "Ajusta um parâmetro de um módulo. Parâmetros por módulo:",
          "• `antispam`: `mensagens`, `tempo` (ms) — velocidade · `vezes` — repetição · `minuto`, `novato` — mídia · `mencoes`",
          "• `antiruido`: `tamanho`, `limiar` (0–1 ou %) — caps · `zalgo` — caracteres · `repeticao`, `ignorar` — letras · `emojis` — emoji",
          "  _A medição ignora menções, links, emojis nomeados e código — só conta o texto digitado._",
          "",
          `Ex.: \`${citarInterno("automod", P)} antispam set mensagens 3\` · \`${citarInterno("automod", P)} antispam set tempo 10000\``,
        ].join("\n"),
      },
      punicao: {
        titulo: "automod punicao",
        texto: [
          `**Uso:** \`${citarInterno("automod", P)} <módulo> punicao <modo|herdar>\``,
          "",
          "Dá a um módulo uma punição **própria**, independente da global:",
          "• `avisar` — só avisa\n• `apagar` — só remove a mensagem\n• `confirmar` — silencia e espera um mod\n• `acumular` — soma avisos até banir\n• `banir` — ban imediato\n• `herdar` — volta a usar a punição global",
          "",
          `Ex.: \`${citarInterno("automod", P)} antilink punicao apagar\``,
        ].join("\n"),
      },
      antirepeticao: {
        titulo: "automod antirepeticao",
        texto: [
          "**Anti-repetição** — bloqueia a mesma letra repetida muitas vezes numa mensagem (ex.: `aaaaaaaaaa`).",
          "",
          "Vem **desligado** por padrão, porque em servidores BR o `kkkkk` (risada) é legítimo — e por isso o `k` é ignorado por padrão.",
          "",
          `\`${citarInterno("automod", P)} antirepeticao on\` — ativa`,
          `\`${citarInterno("automod", P)} antirepeticao set repeticao 15\` — limite de repetições`,
          `\`${citarInterno("automod", P)} antirepeticao set ignorar k\` — letras a ignorar (risada)`,
          `\`${citarInterno("automod", P)} antirepeticao punicao apagar\` — punição própria`,
        ].join("\n"),
      },
    },
    punicao: {
      modo: {
        titulo: "punicao modo",
        texto: [
          `**Uso:** \`${citarInterno("automod.punicao", P)} modo <avisar|apagar|confirmar|acumular|banir>\``,
          "",
          "Define a punição **global** (vale para todos os módulos que não têm punição própria):",
          "• `avisar` — só avisa, não remove\n• `apagar` — só remove a mensagem\n• `confirmar` — remove, silencia (timeout nativo) e espera um mod aprovar\n• `acumular` — soma avisos e bane ao atingir o limite\n• `banir` — ban imediato",
        ].join("\n"),
      },
    },
  };
}

// A árvore INTEIRA da ajuda (as duas fontes fundidas, sem o filtro de IA), para
// o inventário de comandos percorrer todas as páginas (17 out 2026: as
// páginas que só existem em construirSubtopicos ficavam fora dos testes).
export function arvoreDaAjuda(P, lang = "pt") {
  const l = lang === "es" ? "en" : lang;
  const base = construirSubtopicos(P, l);
  const fundido = { ...arvoreSubtopicos(P, l) };
  for (const [cmd, subs] of Object.entries(base)) fundido[cmd] = mesclarNos(fundido[cmd], subs);
  const arvore = ligarFamilias(fundido);
  return lang === "es" ? comEspanhol(arvore, P) : arvore;
}

// (etapa 4b) no espanhol: a página da árvore em espanhol (help-arvore-es.js) vence a
// inglesa no mesmo caminho, e sai pronta (a tradução da tela não passa por ela)
function comEspanhol(arvore, P) {
  const sobrepor = (no, es) => {
    if (!no || !es) return no;
    const o = { ...no };
    if (typeof es.titulo === "string") o.titulo = trechoPronto(es.titulo);
    if (typeof es.texto === "string") o.texto = trechoPronto(es.texto);
    for (const [k, v] of Object.entries(es)) if (v && typeof v === "object" && o[k] && typeof o[k] === "object") o[k] = sobrepor(o[k], v);
    return o;
  };
  return sobrepor(arvore, arvoreES(P));
}

export async function cmdHelp(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO } = ctx;
  const P = PREFIXO;
  const lang = lingua(ctx);
  const idioma = idiomaDe(ctx);   // "es" além dos dois: a página do registro e os rótulos já saem em espanhol
  const rot = (pt, en, es) => (idioma === "es" ? es : lang === "en" ? en : pt);
  const comIA = (() => { try { return temIA(ctx.serverId); } catch { return false; } })();
  const comModIA = podeIA("modia", ctx.serverId);

  // Ajuda detalhada por comando: &help <comando>
  const DETALHES  = construirDetalhes(P, lang, idioma);
  const SUBTOPICOS = (() => {
    const base = construirSubtopicos(P, lang);
    const extra = arvoreSubtopicos(P, lang);
    const fundido = { ...extra };
    // Fusão em PROFUNDIDADE: as duas árvores podem ter o mesmo assunto com
    // pedaços diferentes (ex.: `automod.punicao` existe nas duas).
    for (const [cmd, subs] of Object.entries(base)) {
      fundido[cmd] = mesclarNos(extra[cmd], subs);
    }
    // Sem IA no servidor, os subtópicos de IA não existem — nem para listar.
    for (const cmd of SUBTOPICOS_SO_IA) if (!podeIA(cmd, ctx.serverId)) delete fundido[cmd];
    // A fusão acima recria no topo o que a árvore de geral.js tinha solto
    // (`punicao.escada`, por exemplo). Religa tudo dentro das famílias.
    return idioma === "es" ? comEspanhol(ligarFamilias(fundido), P) : ligarFamilias(fundido);
  })();

  const alvo = args[0]?.toLowerCase();

  // ── Quem está vendo (membro, staff ou dono) e o que o servidor tem ──
  // Cada um vê só o que pode usar aqui — ver modulos/moderacao/visao.js.
  const visao = await visaoMod.quemVe(message, ctx);
  const ehComando = (c) => !!(DETALHES[c] || SUBTOPICOS[c]);
  const barrar = (cmd, sub = "", sub2 = "") => {
    if (!ehComando(cmd) || visaoMod.podeVer(visao, cmd, sub, sub2)) return null;
    const nome = `\`${P}${cmd}\``;   // só o comando: o resto pode ser assunto da ajuda, não subcomando
    const nomeES = `\`${P}${nomeExibido(cmd, "es")}\``, ajudaES = citar("help", "es", P);
    const recurso = visaoMod.recursoDoComando(cmd);
    if ((recurso === "ia" && !visao.ia) || (recurso === "voz" && !visao.voz)) {
      return tr(ctx, { title: "🚫 Não existe aqui", description: `${nome} não está disponível neste servidor.\n\nUse \`${P}help\` para ver o que existe por aqui.`, colour: COR.aviso },
        { title: "🚫 Not available here", description: `${nome} isn't available on this server.\n\nUse \`${P}help\` to see what's available here.`, colour: COR.aviso },
        { title: "🚫 No disponible aquí", description: `${nomeES} no está disponible en este servidor.\n\nUsa \`${ajudaES}\` para ver lo que hay por aquí.`, colour: COR.aviso });
    }
    if (visaoMod.nivelDoComando(cmd, sub, sub2) === "dono") {
      return tr(ctx, { title: "❓ Não encontrado", description: `Não há ajuda para ${nome}. Use \`${P}help\` para o índice.`, colour: COR.aviso },
        { title: "❓ Not found", description: `There's no help for ${nome}. Use \`${P}help\` for the index.`, colour: COR.aviso },
        { title: "❓ No encontrado", description: `No hay ayuda para ${nomeES}. Usa \`${ajudaES}\` para ver el índice.`, colour: COR.aviso });
    }
    return tr(ctx, { title: "🔒 Comando da staff", description: `${nome} é usado pela equipe do servidor.\n\nUse \`${P}help\` para ver os comandos que você pode usar.`, colour: COR.info },
      { title: "🔒 Staff command", description: `${nome} is used by the server's staff.\n\nUse \`${P}help\` to see the commands you can use.`, colour: COR.info },
      { title: "🔒 Comando de la staff", description: `${nomeES} lo usa el staff del servidor.\n\nUsa \`${ajudaES}\` para ver los comandos que puedes usar.`, colour: COR.info });
  };

  // ── Descida por QUALQUER profundidade da árvore ──────────────────────────
  // Antes só existiam dois níveis (`&help <cmd> <sub>`). Como os comandos
  // viraram famílias (`&automod blocklist add`), a ajuda desce junto: cada
  // camada mostra o seu texto E as camadas de dentro, para dar para navegar
  // sem adivinhar o que existe.
  const METADADOS = new Set(["titulo", "texto"]);
  const filhosDe = (no) => Object.keys(no ?? {})
    .filter((k) => !METADADOS.has(k) && no[k] && typeof no[k] === "object");

  const caminho = args.map((a) => String(a).toLowerCase());
  // `&help automod` (1 argumento) também entra aqui quando `automod` é a raiz
  // de uma família: antes caía no livrinho do grupo "Proteger", que não
  // mostrava a família nenhuma.
  const raizDeFamilia = caminho.length === 1
    && SUBTOPICOS[caminho[0]]?.texto
    && Object.keys(SUBTOPICOS[caminho[0]]).some((k) => !["titulo", "texto"].includes(k));
  if ((caminho.length >= 2 || raizDeFamilia) && SUBTOPICOS[caminho[0]]) {
    const barrado = barrar(caminho[0], caminho[1] ?? "", caminho[2] ?? "");
    if (barrado) return sendEmbed(message.channel, barrado);
    let no = SUBTOPICOS[caminho[0]];
    const trilha = [caminho[0]];
    let i = 1;
    for (; i < caminho.length; i++) {
      const proximo = no?.[caminho[i]];
      if (!proximo || typeof proximo !== "object") break;
      no = proximo;
      trilha.push(caminho[i]);
    }

    // Um passo do caminho não existe: diz o que existe ali, em vez de só negar.
    if (i < caminho.length) {
      const opcoes = filhosDe(no);
      const lista = opcoes.length
        ? opcoes.map((k) => `\`${P}help ${trilha.join(" ")} ${k}\``).join(" · ")
        : `\`${P}help ${trilha.join(" ")}\``;
      const listaES = opcoes.length
        ? opcoes.map((k) => `\`${citar("help", "es", P)} ${trilha.join(" ")} ${k}\``).join(" · ")
        : `\`${citar("help", "es", P)} ${trilha.join(" ")}\``;
      return sendEmbed(message.channel, tr(ctx, {
        title: "❓ Subtópico desconhecido",
        description: `\`${caminho[i]}\` não existe dentro de \`${P}${trilha.join(" ")}\`.\n\n**Existem:** ${lista}`,
        colour: COR.aviso,
      }, {
        title: "❓ Unknown subtopic",
        description: `\`${caminho[i]}\` isn't inside \`${P}${trilha.join(" ")}\`.\n\n**Available:** ${lista}`,
        colour: COR.aviso,
      }, {
        title: "❓ Subtema desconocido",
        description: `\`${caminho[i]}\` no existe dentro de \`${P}${trilha.join(" ")}\`.\n\n**Existen:** ${listaES}`,
        colour: COR.aviso,
      }));
    }

    const filhos = filhosDe(no).filter((k) => visaoMod.podeVer(visao, trilha[0], trilha[1] ?? k, trilha[1] ? k : ""));
    const rodape = filhos.length
      ? ["", tr(ctx, "**Aprofunde:**", "**Go deeper:**", "**Profundiza:**"),
         tr(ctx, filhos.map((k) => `\`${P}help ${trilha.join(" ")} ${k}\``).join(" · "),
           filhos.map((k) => `\`${P}help ${trilha.join(" ")} ${k}\``).join(" · "),
           filhos.map((k) => `\`${citar("help", "es", P)} ${trilha.join(" ")} ${k}\``).join(" · "))]
      : [];
    const corpo = no.texto
      ? visaoMod.filtrarLinhas(filtrarIA(String(no.texto).split("\n"), comIA, comModIA), visao)
      : [tr(ctx,
          `\`${P}${trilha.join(" ")}\` reúne os assuntos abaixo.`,
          `\`${P}${trilha.join(" ")}\` groups the topics below.`,
          `\`${P}${trilha.join(" ")}\` reúne los temas de abajo.`)];

    return enviarPaginado(ctx, message.channel, {
      paginas: paginarLinhas([...corpo, ...rodape], {
        titulo: `📖 ${tr(ctx, "Ajuda", "Help", "Ayuda")} — ${P}${trilha.join(" › ")}`,
      }),
      autorId: message.authorId,
      colour: COR.info,
    });
  }

  // (a descida acima já resolve &help <cmd> <sub> e mais fundo)

  // ── Grupos: &help <grupo> (aceita os nomes antigos também) ──
  const GRUPOS = gruposHelp(P, idioma === "es" ? "es" : lang);
  // O membro tem um grupo só dele com o básico — os grupos de configuração
  // (começar, proteger, personalizar, diagnóstico) são da staff.
  GRUPOS.voce = idioma === "es" ? {
    emoji: "📌", titulo: trechoPronto("Para ti"), resumo: trechoPronto("lo básico: quién es el staff, el reloj del servidor, información, tickets"),
    linhas: [
      `\`${citar("userinfo", "es", P)} [@usuario]\` — ID, fecha de entrada y roles`,
      `\`${citar("staff", "es", P)}\` — quién es el staff`,
      `\`${citar("fuso", "es", P)}\` — el reloj del servidor (varias ciudades a la vez)`,
      `\`${citar("sobre", "es", P)}\` · \`${citar("ping", "es", P)}\` — sobre el bot y su latencia`,
      `\`${citar("tutorial", "es", P)}\` — la guía para quien juega y usa el bot`,
      `\`${citar("privacidade", "es", P)}\` — lo que Judy guarda sobre ti, y tu consentimiento`,
      "¿Necesitas al staff? Reacciona en el **panel de tickets** del servidor — se abre un canal privado.",
    ].map((l) => trechoPronto(l)),
  } : lang === "en" ? {
    emoji: "📌", titulo: "For you", resumo: "the basics: who's staff, server clock, info, tickets",
    linhas: [
      `\`${citar("userinfo", "en", P)} [@user]\` — ID, join date and roles`,
      `\`${citarInterno("staff", P)}\` — who the staff is`,
      `\`${citarInterno("fuso", P)}\` — the server clock (several cities at once)`,
      `\`${citar("sobre", "en", P)}\` · \`${citar("ping", "en", P)}\` — about the bot and its latency`,
      `\`${citarInterno("tutorial", P)}\` — the guide for players and members`,
      `\`${citar("privacidade", "en", P)}\` — what Judy keeps about you, and your consent`,
      "Need the staff? React on the server's **ticket panel** — a private channel opens.",
    ],
  } : {
    emoji: "📌", titulo: "Para você", resumo: "o básico: quem é a staff, relógio do servidor, informações, tickets",
    linhas: [
      `\`${citar("userinfo", "pt", P)} [@pessoa]\` — ID, data de entrada e cargos`,
      `\`${citarInterno("staff", P)}\` — quem é a equipe`,
      `\`${citarInterno("fuso", P)}\` — o relógio do servidor (várias cidades de uma vez)`,
      `\`${citar("sobre", "pt", P)}\` · \`${citar("ping", "pt", P)}\` — sobre o bot e a latência`,
      `\`${citarInterno("tutorial", P)}\` — o guia de quem joga e usa`,
      `\`${citar("privacidade", "pt", P)}\` — o que a Judy guarda sobre você, e o seu consentimento`,
      "Precisa da staff? Reaja no **painel de tickets** do servidor — abre um canal privado.",
    ],
  };
  const GRUPOS_DO_MEMBRO = ["voce", "diversao", "rpg"];
  const ehDono = (() => { try { return ctx.ehSuperAdmin?.(message.authorId); } catch { return false; } })();
  // só os grupos com algum comando que quem vê pode usar aqui
  const chavesGrupos = (visao.nivel === "membro" ? GRUPOS_DO_MEMBRO : ehDono ? [...ORDEM_GRUPOS, "dono"] : [...ORDEM_GRUPOS])
    .filter((k) => k === "dono" || visaoMod.temComandoVisivel(filtrarIA(GRUPOS[k].linhas, comIA, comModIA), visao));

  // Página de um grupo: cabeçalho + linhas (quebra em 2 páginas se não couber).
  const paginasDoGrupo = (chave) => {
    const g = GRUPOS[chave];
    const linhas = visaoMod.filtrarLinhas(filtrarIA(g.linhas, comIA, comModIA), visao);
    const rodape = [
      "",
      tr(ctx,
        `💡 \`${P}help <comando>\` explica cada parâmetro · \`${P}help\` para o índice`,
        `💡 \`${P}help <command>\` explains every parameter · \`${P}help\` for the index`,
        `💡 \`${citar("help", "es", P)} <comando>\` explica cada parámetro · \`${citar("help", "es", P)}\` para el índice`),
    ];
    return paginarLinhas([...linhas, ...rodape], { titulo: `${g.emoji} ${g.titulo}`, limite: 1300 });
  };

  const AJ = citar("help", "es", P);   // o &help em espanhol
  const indice = () => ({
    title: tr(ctx, "📋 Central de Ajuda", "📋 Help Center", "📋 Centro de ayuda"),
    description: [
      tr(ctx,
        "O que você quer fazer? Escolha um grupo — reaja ◀ ▶ para folhear todos, ou digite o comando.",
        "What do you want to do? Pick a group — react ◀ ▶ to browse them all, or type the command.",
        "¿Qué quieres hacer? Elige un grupo — reacciona ◀ ▶ para hojearlos todos, o escribe el comando."),
      "",
      ...(visao.nivel === "membro" ? [] : [tr(ctx,
        `🧙 **Primeira vez aqui?** \`${citarInterno("assistente", P)}\` configura o bot **com você**, pergunta por pergunta — é o jeito mais rápido.`,
        `🧙 **First time here?** \`${citarInterno("assistente", P)}\` sets the bot up **with you**, question by question — the fastest way.`,
        `🧙 **¿Primera vez aquí?** \`${citar("assistente", "es", P)}\` configura el bot **contigo**, pregunta por pregunta — es la forma más rápida.`), ""]),
      ...chavesGrupos.map((k) => `${GRUPOS[k].emoji} \`${P}help ${k}\` — ${(!comIA && GRUPOS[k].resumoSemIA) || GRUPOS[k].resumo}`),
      "",
      tr(ctx,
        `📖 \`${P}help <comando>\` — uso, **cada parâmetro explicado**, exemplo (ex.: \`${P}help boasvindas\`)`,
        `📖 \`${P}help <command>\` — usage, **each parameter explained**, example (e.g. \`${P}help boasvindas\`)`,
        `📖 \`${AJ} <comando>\` — uso, **cada parámetro explicado**, ejemplo (p. ej.: \`${AJ} ${nomeExibido("boasvindas", "es")}\`)`),
      tr(ctx,
        `📋 Vários comandos de uma vez: **um por linha** na mesma mensagem (até 10).`,
        `📋 Several commands at once: **one per line** in the same message (up to 10).`,
        `📋 Varios comandos a la vez: **uno por línea** en el mismo mensaje (hasta 10).`),
      visao.nivel === "membro"
        ? tr(ctx, `🔍 \`${P}help <comando> <parte>\` — uma parte dele (\`${P}help game missao\`)`,
          `🔍 \`${P}help <command> <part>\` — one part of it (\`${P}help game missao\`)`,
          `🔍 \`${AJ} <comando> <parte>\` — una parte de él (\`${AJ} ${nomeExibido("game", "es")} ${subExibido("game", "missao", "es")}\`)`)
        : tr(ctx,
          `🔍 \`${P}help <comando> <parte>\` — uma parte dele (\`${P}help game admin\`, \`${P}help xp setup\`)`,
          `🔍 \`${P}help <command> <part>\` — one part of it (\`${P}help game admin\`, \`${P}help xp setup\`)`,
          `🔍 \`${AJ} <comando> <parte>\` — una parte de él (\`${AJ} ${nomeExibido("game", "es")} ${subExibido("game", "admin", "es")}\`, \`${AJ} xp setup\`)`),
      visao.nivel === "membro" ? null : tr(ctx, `🌐 \`${citar("idioma", "pt", P)} pt|en|es\` — idioma do servidor`, `🌐 \`${citar("idioma", "en", P)} pt|en|es\` — server language`, `🌐 \`${citar("idioma", "es", P)} pt|en|es\` — idioma del servidor`),
      "",
      ({ membro: tr(ctx, "_👤 Você está vendo os comandos que pode usar. A staff vê também os de configuração._", "_👤 You're seeing the commands you can use. Staff sees the setup ones too._", "_👤 Estás viendo los comandos que puedes usar. El staff también ve los de configuración._"),
         staff: tr(ctx, "_🛡️ Visão da staff: tudo o que este servidor tem._", "_🛡️ Staff view: everything this server has._", "_🛡️ Vista del staff: todo lo que tiene este servidor._"),
         dono: tr(ctx, "_👑 Visão do dono do bot: tudo, inclusive os comandos do dono._", "_👑 Bot owner view: everything, including the owner's commands._", "_👑 Vista del dueño del bot: todo, incluidos los comandos del dueño._") })[visao.nivel],
      [!visao.ia && (lang === "en" ? "AI" : "IA"), !visao.voz && (lang === "en" ? "voice and music" : "voz e música")].filter(Boolean).length
        ? tr(ctx, `_Não liberado neste servidor: ${[!visao.ia && "IA", !visao.voz && "voz e música"].filter(Boolean).join(", ")}._`,
          `_Not enabled on this server: ${[!visao.ia && "AI", !visao.voz && "voice and music"].filter(Boolean).join(", ")}._`,
          `_No habilitado en este servidor: ${[!visao.ia && "IA", !visao.voz && "voz y música"].filter(Boolean).join(", ")}._`)
        : null,
    ].filter((x) => x !== null).join("\n"),
    colour: COR.info,
  });

  // &help <número> → página N do índice paginado
  const numero = /^\d+$/.test(alvo ?? "") ? parseInt(alvo, 10) : null;
  const chaveGrupo = ALIAS_GRUPO[alvo];

  if (!alvo || numero !== null || (chaveGrupo && GRUPOS[chaveGrupo] && chavesGrupos.includes(chaveGrupo))) {
    // Um livrinho: índice + uma página (ou duas) por grupo.
    const paginas = [indice()];
    const inicioDe = {};
    for (const k of chavesGrupos) {
      inicioDe[k] = paginas.length;
      paginas.push(...paginasDoGrupo(k));
    }
    let inicial = 0;
    if (numero !== null) inicial = Math.min(Math.max(numero - 1, 0), paginas.length - 1);
    else if (chaveGrupo) inicial = inicioDe[chaveGrupo] ?? 0;
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, paginaInicial: inicial, comandoPagina: `${P}help`,
    });
  }

  // Comando de IA num servidor sem IA: ele não roda aqui, então não há ajuda.
  if (alvo && COMANDOS_SO_IA.has(alvo) && !podeIA(alvo, ctx.serverId)) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Não existe aqui",
      description: `\`${P}${alvo}\` não existe neste servidor.\n\nUse \`${P}help\` para ver o que existe por aqui.`,
      colour: COR.aviso,
    }, {
      title: "🚫 Not a command here",
      description: `\`${P}${alvo}\` doesn't exist on this server.\n\nUse \`${P}help\` to see what's available here.`,
      colour: COR.aviso,
    }, {
      title: "🚫 No existe aquí",
      description: `\`${P}${alvo}\` no existe en este servidor.\n\nUsa \`${citar("help", "es", P)}\` para ver lo que hay por aquí.`,
      colour: COR.aviso,
    }));
  }

  // &help <comando> (detalhe individual) — agora com a seção de parâmetros
  if (alvo && DETALHES[alvo]) {
    const barrado = barrar(alvo);
    if (barrado) return sendEmbed(message.channel, barrado);
    const d0 = DETALHES[alvo];
    // a descrição também perde as partes que quem vê não usa (o membro vê o `&xp top`, não o `&xp setup`)
    const d = { ...d0, desc: visaoMod.filtrarLinhas(String(d0.desc ?? "").split("\n"), visao).join("\n") };
    const filhosReais = filhosDe(SUBTOPICOS[alvo]).filter((k) => visaoMod.podeVer(visao, alvo, k));
    // Página do registro em espanhol (etapa 4): sai pronta, com os nomes já em
    // espanhol, e a tradução da tela não passa por ela (marcarTraduzido, aliases.js).
    const pronta = idioma === "es" && COMANDOS_COM_AJUDA.includes(alvo);
    const linkSub = (k) => (pronta ? `${citar("help", "es", P)} ${nomeExibido(alvo, "es")} ${subExibido(alvo, k, "es")}` : `${P}help ${alvo} ${k}`);
    const temSub = filhosReais.length
      ? `\n\n**${rot("Subtópicos", "Subtopics", "Subtemas")}** ${rot("_(o detalhe de cada parte)_", "_(details on each part)_", "_(el detalle de cada parte)_")}\n`
        + filhosReais.map((k) => `\`${linkSub(k)}\``).join(" · ")
      : "";
    // parâmetros que são subcomandos de outro nível (o `setup` do &xp para um membro) saem
    const params = secaoParametros(P, lang, alvo, idioma).split("\n").filter((l) => {
      const m = l.match(/^• `([a-zçãéí]+)/i);
      return !m || visaoMod.podeVer(visao, alvo, m[1].toLowerCase());
    }).join("\n");
    const cabecalho = [
      `**${rot("Uso", "Usage", "Uso")}:** \`${d.uso}\``,
      d.perm ? `**${rot("Permissão", "Permission", "Permiso")}:** ${d.perm}` : null,
      "",
      d.desc,
      d.ex ? `\n**${rot("Exemplo", "Example", "Ejemplo")}:** \`${d.ex}\`` : null,
    ].filter(Boolean).join("\n");
    const titulo = `📖 ${rot("Ajuda", "Help", "Ayuda")} — ${P}${nomeExibido(alvo, idioma)}`;
    // Páginas montadas por tamanho, quebrando entre linhas (o cabeçalho do
    // &help tts tinha 2.300 caracteres e era cortado no meio de "dicionario").
    const marca = pronta ? marcarTraduzido : (t) => t;
    const paginas = paginarLinhas([cabecalho, params.trim(), temSub.trim()].filter(Boolean).join("\n\n").split("\n"), { titulo })
      .map((p) => ({ ...p, title: marca(p.title), description: marca(p.description) }));
    if (paginas.length === 1) {
      return sendEmbed(message.channel, { title: marca(titulo), colour: COR.info,
        description: marca(cabecalho + params + temSub) });
    }
    return enviarPaginado(ctx, message.channel, {
      paginas, autorId: message.authorId, comandoPagina: null,
    });
  }
  // Parte do &automod pedida sozinha (`&help punishment`, `&help blocklist add`,
  // `&help topics`): é a página dela dentro do &automod (17 out 2026: "não encontrado").
  if (alvo && alvo !== "automod" && SUBTOPICOS.automod) {
    const pedido = normalizarArgs("help", ["automod", ...args]);   // inglês → nome interno, pelo caminho
    const procurar = (no, chave, caminho = []) => {
      for (const k of Object.keys(no ?? {})) {
        if (k === "titulo" || k === "texto" || typeof no[k] !== "object") continue;
        if (k === chave) return [...caminho, k];
        const fundo = procurar(no[k], chave, [...caminho, k]);
        if (fundo) return fundo;
      }
      return null;
    };
    // a palavra pode ser de um nível mais fundo (`topics` → `assuntos`, dentro do sentinela)
    const deQualquerNivel = Object.assign({}, ...Object.entries(SUB).filter(([k]) => k.startsWith("automod.")).map(([, m]) => m));
    const palavra = String(pedido[1]).toLowerCase();
    // só as partes que têm nome próprio no registro (não `canal`, `set`, `testar`, que são de dentro delas)
    const automodReg = REGISTRO.find((c) => c.id === "automod");
    const partes = new Set([...Object.keys(automodReg?.familias ?? {}), ...Object.keys(automodReg?.partes ?? {})]);
    const interno = partes.has(palavra) ? palavra : partes.has(deQualquerNivel[palavra]) ? deQualquerNivel[palavra] : null;
    const caminho = interno ? procurar(SUBTOPICOS.automod, interno) : null;
    if (caminho) return cmdHelp(message, ["automod", ...caminho, ...pedido.slice(2)], ctx);
    // um dos quatro grupos (`&help antispam`): a página do &automod, que explica os grupos
    if (interno && ["antispam", "antiruido", "antilink"].includes(interno)) return cmdHelp(message, ["automod"], ctx);
  }
  if (alvo) {
    const lista = chavesGrupos.filter((k) => k !== "dono").join(", ");
    // os grupos com o nome que o índice em inglês mostra (13 out 2026)
    const GRUPO_EN = { comecar: "start", proteger: "protect", personalizar: "customize", diversao: "fun", rpg: "game", diagnostico: "diagnostics" };
    const listaEN = chavesGrupos.filter((k) => k !== "dono").map((k) => GRUPO_EN[k] ?? k).join(", ");
    // "&help assistent" → "você quis dizer &help assistente?"
    const nomes = Object.keys(DETALHES ?? {});
    const perto = (a, b) => { if (Math.abs(a.length - b.length) > 2) return 9; const d = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) { let ant = d[0]; d[0] = i; for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = t; } } return d[b.length]; };
    const candidatos = [...nomes, ...nomes.map((k) => nomeExibido(k, "en")), ...nomes.map((k) => nomeExibido(k, "es"))];
    const sugestao = candidatos.map((k) => [k, perto(String(alvo).toLowerCase(), k)]).filter(([, d]) => d <= 2).sort((a, b) => a[1] - b[1])[0]?.[0];
    const sug = sugestao ? (lang === "en" ? nomeExibido(idDoNome(sugestao), idioma) : sugestao) : null;
    return sendEmbed(message.channel, tr(ctx, {
      title: "❓ Não encontrado",
      description: `${sug ? `Você quis dizer \`${P}help ${sug}\`?\n\n` : ""}Não há ajuda para \`${alvo}\`. Use \`${P}help\` para o índice, ou \`${P}help <grupo>\` (${lista}).`,
      colour: COR.aviso,
    }, {
      title: "❓ Not found",
      description: `${sug ? `Did you mean \`${P}help ${sug}\`?\n\n` : ""}There's no help for \`${alvo}\`. Use \`${P}help\` for the index, or \`${P}help <group>\` (${listaEN}).`,
      colour: COR.aviso,
    }, {
      title: "❓ No encontrado",
      description: `${sug ? `¿Quisiste decir \`${citar("help", "es", P)} ${sug}\`?\n\n` : ""}No hay ayuda para \`${alvo}\`. Usa \`${citar("help", "es", P)}\` para ver el índice, o \`${citar("help", "es", P)} <grupo>\` (${listaEN}).`,
      colour: COR.aviso,
    }));
  }
}

// %ping — mede a latência entre o envio da mensagem e o processamento
export async function cmdPing(message, args, ctx) {
  const { sendEmbed, COR } = ctx;
  // 17 out 2026: era `Date.now() - message.createdAt` — o relógio DESTA máquina
  // contra o do Stoat (o createdAt sai do ID da mensagem). Com o relógio da
  // máquina adiantado, o ping marcava 64973 ms com a resposta no mesmo minuto.
  // Agora as duas pontas vêm do Stoat: o ID do comando e o ID da resposta.
  const tempo = (m) => { const t = new Date(m?.createdAt ?? NaN).getTime(); return Number.isFinite(t) ? t : null; };
  const t0 = Date.now();
  const resposta = await sendEmbed(message.channel, { title: "🏓 Pong!", description: tr(ctx, "Medindo…", "Measuring…", "Midiendo…"), colour: COR.sucesso });
  const api = Date.now() - t0;
  const doComando = tempo(message), daResposta = tempo(resposta);
  if (typeof resposta?.edit !== "function") return resposta;
  const ida = doComando != null && daResposta != null ? Math.max(0, daResposta - doComando) : null;
  // quanto o relógio da máquina difere do Stoat: o meio do envio ≈ a hora da resposta lá
  const desvio = daResposta != null ? Math.round(t0 + api / 2 - daResposta) : 0;
  const verDesvio = Math.abs(desvio) >= 2000 && ctx.ehSuperAdmin?.(message.authorId);
  const s = (ms) => (Math.abs(ms) >= 10000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`);
  const description = tr(ctx, [
    ida != null ? `Resposta: **${s(ida)}** _(do seu comando até esta mensagem, pelo relógio do Stoat)_` : null,
    `Envio à API: **${s(api)}**`,
    verDesvio ? `\n⚠️ O relógio da máquina do bot está **${s(Math.abs(desvio))} ${desvio > 0 ? "adiantado" : "atrasado"}** em relação ao Stoat. Prazos e a idade das contas usam esse relógio — ligue a sincronização de hora (NTP) na máquina.` : null,
  ], [
    ida != null ? `Reply: **${s(ida)}** _(from your command to this message, by the Stoat's clock)_` : null,
    `API send: **${s(api)}**`,
    verDesvio ? `\n⚠️ The bot machine's clock is **${s(Math.abs(desvio))} ${desvio > 0 ? "ahead of" : "behind"}** the Stoat's. Timers and account age use that clock — turn on time sync (NTP) on the machine.` : null,
  ], [
    ida != null ? `Respuesta: **${s(ida)}** _(desde tu comando hasta este mensaje, según el reloj del Stoat)_` : null,
    `Envío a la API: **${s(api)}**`,
    verDesvio ? `\n⚠️ El reloj de la máquina del bot va **${s(Math.abs(desvio))} ${desvio > 0 ? "adelantado" : "atrasado"}** respecto al Stoat. Los plazos y la antigüedad de las cuentas usan ese reloj — activa la sincronización de hora (NTP) en la máquina.` : null,
  ]).filter(Boolean).join("\n")
    .replace(/[\u2063\u2064]/g, "");   // a edição vai crua ao Stoat: tira a marca de "texto pronto" do espanhol
  await resposta.edit({ embeds: [{ title: "🏓 Pong!", description, colour: COR.sucesso }] }).catch(() => {});
  return resposta;
}

// %sobre — informações resumidas do bot
export async function cmdSobre(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO, estado, config, serverId } = ctx;
  const lang = lingua(ctx);
  const en = lang === "en";
  const comIA = (() => { try { return temIA(serverId); } catch { return false; } })();

  // conta comandos, linhas e uptime de forma resiliente
  // Um comando por função (os apelidos apontam para a mesma), sem os que não
  // valem aqui: desativados neste servidor, só-IA fora da IA, o painel do
  // dono e o &cargomudo aposentado.
  const nComandos = (() => {
    if (!estado?.rotas) return null;
    const porFuncao = new Map();
    for (const [nome, fn] of Object.entries(estado.rotas)) if (!porFuncao.has(fn)) porFuncao.set(fn, nome);
    const fora = new Set(["servidores", "cargomudo", ...(config?.comandosDesativados ?? [])]);
    return [...porFuncao.values()].filter((n) => !fora.has(n) && (!estado.COMANDOS_SO_IA?.has(n) || podeIA(n, serverId))).length;
  })();
  const nLinhas = contarLinhas();
  const up = process.uptime();
  const dias = Math.floor(up / 86400);
  const horas = Math.floor((up % 86400) / 3600);
  const mins = Math.floor((up % 3600) / 60);
  const uptime = dias > 0 ? `${dias}d ${horas}h` : horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;

  const am = config?.automod ?? {};
  // A mesma lista do &automod (antes: 9 fixos, sem o antiduplicata e o antiimagem).
  // os quatro grupos do automod (um grupo conta como ligado se alguma parte está)
  const gruposAm = Object.keys(GRUPOS_AUTOMOD).map((g) => estadoDoGrupo(am, g));
  const modulosOn = gruposAm.filter((x) => x.ligadas > 0).length;
  const nModulos = gruposAm.length;
  const vozAqui = servidorNaLista("TTS_SERVIDORES", serverId);
  const geraImagem = (process.env.IMAGEM ?? "1").trim() !== "0";
  const nomeBot = ctx.client?.user?.displayName || "Judy";   // o nome de exibição; a conta (username) pode chamar outra coisa, como "Cobaia"
  const criador = (process.env.CRIADOR || "").trim();
  const xpOn = !!config?.xp?.enabled;
  const logOn = !!config?.log?.canalId;
  const rssN = (() => { try { return db.listarFeeds?.(serverId)?.length ?? 0; } catch { return 0; } })();
  const moedas = (() => { try { return db.listarMoedas?.(MUNDO) ?? []; } catch { return []; } })();
  const nPersonagens = (() => { try { return db.listarPersonagens?.(MUNDO, 9999)?.length ?? 0; } catch { return 0; } })();
  // Magias aprendidas no servidor inteiro: mostra se a mecânica pegou ou não.
  const nCapturados = (() => { try { return db.listarCapturados?.(MUNDO)?.length ?? 0; } catch { return 0; } })();
  const nMagias = (() => {
    try {
      return db.listarPersonagens(MUNDO, 9999)
        .reduce((t, x) => t + (db.listarMagias(MUNDO, x.userId)?.length ?? 0), 0);
    } catch { return 0; }
  })();
  const banGlobalModo = banGlobal.modoDe(config);
  const idioma = en ? "English" : "Português";

  const sim = (v) => v ? "🟢" : "🔴";
  const estadoEN = () => [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/${nModulos} groups on${am.antiScam?.enabled ? ` · sentinel ${am.antiScam.porAntiguidade !== false ? "(stricter with newcomers)" : "on"}` : ""}`,
    `⚖️ **Punishment** — \`${nomeModo(config?.automod?.punicao?.modo ?? "avisar", "es")}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "es")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Leveling (XP)** — ${xpOn ? "on" : "off"}`,
    `${sim(logOn)} **Log channel** — ${logOn ? `<#${config.log.canalId}>` : "not set"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Global ban list** — mode \`${banGlobalModo}\``,
    `🎲 **RPG** _(one world for every server)_ — ${nPersonagens} character(s) · ${moedas.length} currenc${moedas.length === 1 ? "y" : "ies"}${moedas.length > 1 ? " · exchange on" : ""}${nMagias ? ` · ${nMagias} spell(s) learned` : ""}${nCapturados ? ` · ${nCapturados} companion(s) in the dungeon` : ""}`,
    comIA ? `🤖 **AI (Judy)** — enabled here: chat, code, web search, exact math, image reading${geraImagem ? " and **image generation**" : ""}`
          : `🤖 **AI (Judy)** — runs only on the servers enabled by the bot owner: chat, code, web search, exact math and image reading`,
    `🎫🪝🔊 **Tickets · Webhooks · Voice** — ${db.listarTickets(serverId).length} open ticket(s) · ${db.listarGanchos(serverId).length} webhook(s) · ${!vozAqui ? "voice and music not available here" : config?.tts?.ativo && config?.tts?.canalVoz ? `voice and music in <#${config.tts.canalVoz}>` : `voice and music: \`${citarInterno("entrar", PREFIXO)}\` from any channel, while in a call`}`,
  ];
  const estadoPT = () => [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/${nModulos} grupos ligados${am.antiScam?.enabled ? ` · sentinela ${am.antiScam.porAntiguidade !== false ? "(mais rígido com novatos)" : "ligado"}` : ""}`,
    `⚖️ **Punição** — \`${config?.automod?.punicao?.modo ?? "avisar"}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "pt")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Níveis (XP)** — ${xpOn ? "ligado" : "desligado"}`,
    `${sim(logOn)} **Canal de log** — ${logOn ? `<#${config.log.canalId}>` : "não definido"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Lista global de bans** — modo \`${banGlobalModo}\``,
    `🎲 **RPG** _(um mundo só, em todos os servidores)_ — ${nPersonagens} personagem(ns) · ${moedas.length} moeda(s)${moedas.length > 1 ? " · câmbio ativo" : ""}${nMagias ? ` · ${nMagias} magia(s) aprendida(s)` : ""}${nCapturados ? ` · ${nCapturados} companheiro(s) na dungeon` : ""}`,
    comIA ? `🤖 **IA (Judy)** — habilitada aqui: conversa, código, busca na web, contas exatas, leitura de imagens${geraImagem ? " e **geração de imagens**" : ""}`
          : `🤖 **IA (Judy)** — funciona apenas nos servidores habilitados pelo dono do bot: conversa, código, busca na web, contas exatas e leitura de imagens`,
    `🎫🪝🔊 **Tickets · Webhooks · Voz** — ${db.listarTickets(serverId).length} ticket(s) aberto(s) · ${db.listarGanchos(serverId).length} webhook(s) · ${!vozAqui ? "voz e música indisponíveis aqui" : config?.tts?.ativo && config?.tts?.canalVoz ? `voz e música em <#${config.tts.canalVoz}>` : `voz e música: \`${citarInterno("entrar", PREFIXO)}\` de qualquer canal, estando numa call`}`,
  ];
  const estadoES = () => [
    `${sim(modulosOn)} **AutoMod** — ${modulosOn}/${nModulos} grupos activados${am.antiScam?.enabled ? ` · centinela ${am.antiScam.porAntiguidade !== false ? "(más estricto con los recién llegados)" : "activado"}` : ""}`,
    `⚖️ **Sanción** — \`${nomeModo(config?.automod?.punicao?.modo ?? "avisar", "es")}\`${(config?.automod?.punicao?.modo === "acumular") ? ` · ${escadaDePunicao(config.automod.punicao).map((d) => rotuloDegrau(d, "es")).join(" → ")}` : ""}`,
    `${sim(xpOn)} **Niveles (XP)** — ${xpOn ? "activado" : "desactivado"}`,
    `${sim(logOn)} **Canal de registro** — ${logOn ? `<#${config.log.canalId}>` : "no definido"}`,
    `${sim(rssN)} **RSS** — ${rssN} feed(s)`,
    `${sim(banGlobalModo !== "off")} **Lista global de bans** — modo \`${banGlobalModo}\``,
    `🎲 **RPG** _(un solo mundo para todos los servidores)_ — ${nPersonagens} personaje(s) · ${moedas.length} moneda(s)${moedas.length > 1 ? " · cambio activo" : ""}${nMagias ? ` · ${nMagias} hechizo(s) aprendido(s)` : ""}${nCapturados ? ` · ${nCapturados} compañero(s) en la mazmorra` : ""}`,
    comIA ? `🤖 **IA (Judy)** — habilitada aquí: conversación, código, búsqueda web, cálculos exactos, lectura de imágenes${geraImagem ? " y **generación de imágenes**" : ""}`
          : `🤖 **IA (Judy)** — solo funciona en los servidores habilitados por el dueño del bot: conversación, código, búsqueda web, cálculos exactos y lectura de imágenes`,
    `🎫🪝🔊 **Tickets · Webhooks · Voz** — ${db.listarTickets(serverId).length} ticket(s) abierto(s) · ${db.listarGanchos(serverId).length} webhook(s) · ${!vozAqui ? "voz y música no disponibles aquí" : config?.tts?.ativo && config?.tts?.canalVoz ? `voz y música en <#${config.tts.canalVoz}>` : `voz y música: \`${citar("entrar", "es", PREFIXO)}\` desde cualquier canal, estando en una llamada`}`,
  ];
  // só o idioma da tela é montado (cada lista consulta o banco)
  const estadoLinhas = tr(ctx, estadoPT, estadoEN, estadoES)();

  // Links entre < >: continuam clicáveis, sem a prévia que o Stoat gera.
  const creditos = `_${criador ? `Criada por **${criador}**. ` : ""}Software livre ([código](<https://github.com/GhisoOF/stoat_bot>), [privacidade](<${URL_POLITICA}>)), feito com [stoat.js](<https://github.com/stoatchat/javascript-client-sdk>) — rode o seu! 🚀_`;
  const creditosEN = `_${criador ? `Made by **${criador}**. ` : ""}Free software ([source](<https://github.com/GhisoOF/stoat_bot>), [privacy](<${URL_POLITICA}>)), built with [stoat.js](<https://github.com/stoatchat/javascript-client-sdk>) — run your own! 🚀_`;
  const creditosES = `_${criador ? `Creada por **${criador}**. ` : ""}Software libre ([código](<https://github.com/GhisoOF/stoat_bot>), [privacidad](<${URL_POLITICA}>)), hecha con [stoat.js](<https://github.com/stoatchat/javascript-client-sdk>) — ¡monta la tuya! 🚀_`;

  await sendEmbed(message.channel, tr(ctx, {
    title: `🤖 ${nomeBot}`,
    description: [
      `Bot de moderação, automod, níveis, voz${comIA ? ", IA" : ""} e RPG para o Stoat.`,
      "",
      "**Neste servidor**",
      ...estadoLinhas.filter(Boolean),
      "",
      "**O bot**",
      nComandos ? `**Comandos disponíveis aqui:** ${nComandos}` : null,
      nLinhas ? `**Linhas de código:** ${nLinhas.toLocaleString("pt-BR")}` : null,
      `**No ar há:** ${uptime}  ·  **Idioma:** ${idioma}`,
      "",
      `\`${PREFIXO}help\` — tudo, agrupado pelo que você quer fazer`,
      `\`${citarInterno("tutorial", PREFIXO)}\` — o guia de primeiros passos, em páginas`,
      `\`${citarInterno("assistente", PREFIXO)}\` — configuração guiada: eu pergunto, você responde`,
      "",
      creditos,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  }, {
    title: `🤖 ${nomeBot}`,
    description: [
      `Moderation, automod, levels, voice${comIA ? ", AI" : ""} and RPG bot for Stoat.`,
      "",
      "**On this server**",
      ...estadoLinhas.filter(Boolean),
      "",
      "**The bot**",
      nComandos ? `**Commands available here:** ${nComandos}` : null,
      nLinhas ? `**Lines of code:** ${nLinhas.toLocaleString("en-US")}` : null,
      `**Uptime:** ${uptime}  ·  **Language:** ${idioma}`,
      "",
      `\`${PREFIXO}help\` — everything, grouped by what you want to do`,
      `\`${citarInterno("tutorial", PREFIXO)}\` — the paged first-steps guide`,
      `\`${citarInterno("assistente", PREFIXO)}\` — guided setup: I ask, you answer`,
      "",
      creditosEN,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  }, {
    title: `🤖 ${nomeBot}`,
    description: [
      `Bot de moderación, automod, niveles, voz${comIA ? ", IA" : ""} y RPG para el Stoat.`,
      "",
      "**En este servidor**",
      ...estadoLinhas.filter(Boolean),
      "",
      "**El bot**",
      nComandos ? `**Comandos disponibles aquí:** ${nComandos}` : null,
      nLinhas ? `**Líneas de código:** ${nLinhas.toLocaleString("es-ES")}` : null,
      `**En línea desde hace:** ${uptime}  ·  **Idioma:** Español`,
      "",
      `\`${citar("help", "es", PREFIXO)}\` — todo, agrupado según lo que quieras hacer`,
      `\`${citar("tutorial", "es", PREFIXO)}\` — la guía de primeros pasos, en páginas`,
      `\`${citar("assistente", "es", PREFIXO)}\` — configuración guiada: yo pregunto, tú respondes`,
      "",
      creditosES,
    ].filter((l) => l !== null).join("\n"),
    colour: COR.info,
  }));
}

// %repete <texto> — repete o texto fornecido
export async function cmdRepete(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao } = ctx;
  // Era aberto a todos: qualquer membro fazia a bot "anunciar" o que quisesse,
  // num cartão com a cara dela — prato cheio para golpe ("@staff mandou…").
  const server = await getServer?.(message).catch(() => null);
  if (membroTemPermissao && !membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, { description: tr(ctx, `🔒 O \`${citar("repete", "pt", ctx.PREFIXO)}\` é da staff (ManageMessages).`, `🔒 \`${citar("repete", "en", ctx.PREFIXO)}\` is for staff (ManageMessages).`, `🔒 \`${citar("repete", "es", ctx.PREFIXO)}\` es del staff (ManageMessages).`), colour: COR.aviso });
  }
  const txt = args.join(" ");
  // sem texto, respondia nada — parecia que o comando nem existia
  if (!txt) return sendEmbed(message.channel, { description: tr(ctx, `Repetir o quê? \`${citar("repete", "pt", ctx.PREFIXO)} <texto>\``, `What should I repeat? \`${citar("repete", "en", ctx.PREFIXO)} <text>\``, `¿Repetir qué? \`${citar("repete", "es", ctx.PREFIXO)} <texto>\``), colour: COR.aviso });
  await sendEmbed(message.channel, { description: txt, colour: COR.info });
}

// %userinfo [@usuário] — exibe informações de um usuário
export async function cmdUserinfo(message, args, ctx) {
  const { sendEmbed, COR, getServer, serverId, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const targetId = idEscrito(args.join(" ")) ?? message.mentionIds?.[0] ?? message.authorId;
  const locale = idiomaDe(ctx) === "es" ? "es-ES" : lang === "en" ? "en-US" : "pt-BR";
  const T = (pt, eng, es) => tr(ctx, pt, eng, es);
  const desconhecido = T("Desconhecido", "Unknown", "Desconocido");

  try {
    const server = await getServer(message);
    const member = (targetId === message.authorId && message.member)
      ? message.member
      : await server.fetchMember(targetId).catch(() => null);
    const user = member?.user ?? member ?? { id: targetId };

    const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString(locale) : desconhecido;
    const joinedAt  = member?.joinedAt
      ? new Date(member.joinedAt).toLocaleDateString(locale)
      : (member ? desconhecido : T("Não está no servidor", "Not on this server", "No está en el servidor"));
    const roles     = member?.roles?.map((r) => r.name ?? r).join(", ") || T("Nenhum", "None", "Ninguno");

    const linhas = T([
      `**ID:** ${user.id ?? targetId}`,
      `**Conta criada em:** ${createdAt}`,
      `**Entrou no servidor:** ${joinedAt}`,
      `**Cargos:** ${roles}`,
    ], [
      `**ID:** ${user.id ?? targetId}`,
      `**Account created:** ${createdAt}`,
      `**Joined the server:** ${joinedAt}`,
      `**Roles:** ${roles}`,
    ], [
      `**ID:** ${user.id ?? targetId}`,
      `**Cuenta creada el:** ${createdAt}`,
      `**Entró al servidor:** ${joinedAt}`,
      `**Roles:** ${roles}`,
    ]);

    try {
      const avisos     = db.contarAvisos(serverId, targetId, { validadeMs: validadeDosAvisos(ctx.config?.automod?.punicao) });
      const silenciado = db.estaSilenciado(serverId, targetId);
      const hist       = db.historicoBans(targetId);
      const outros     = hist.filter((b) => b.serverId !== serverId);

      linhas.push("", T("**📋 Histórico de moderação**", "**📋 Moderation history**", "**📋 Historial de moderación**"));

      if (avisos > 0 || silenciado) {
        const partes = [];
        if (avisos > 0)  partes.push(T(
          `**${avisos}** aviso(s) neste servidor`,
          `**${avisos}** warning(s) on this server`,
          `**${avisos}** aviso(s) en este servidor`));
        if (silenciado)  partes.push(T("🔇 **silenciado**", "🔇 **silenced**", "🔇 **silenciado**"));
        linhas.push(partes.join(" · "));
      } else {
        linhas.push(T("Sem avisos neste servidor. ✅", "No warnings on this server. ✅", "Sin avisos en este servidor. ✅"));
      }

      if (outros.length) {
        linhas.push(
          "",
          T(
            `🌐 **Lista global:** banido em **${outros.length}** outro(s) servidor(es).`,
            `🌐 **Global list:** banned on **${outros.length}** other server(s).`,
            `🌐 **Lista global:** baneado en **${outros.length}** servidor(es) más.`),
          ...outros.slice(0, 3).map((b) =>
            `• \`${b.serverId}\` — ${b.motivo ?? T("_sem motivo_", "_no reason_", "_sin motivo_")} _(${new Date(b.criadoEm).toLocaleDateString(locale)})_`),
        );
        if (outros.length > 3) linhas.push(T(
          `_… e mais ${outros.length - 3}. Veja \`${citarInterno("banglobal.historico", PREFIXO)} ${targetId}\`._`,
          `_… and ${outros.length - 3} more. See \`${citarInterno("banglobal.historico", PREFIXO)} ${targetId}\`._`,
          `_… y ${outros.length - 3} más. Mira \`${citar("banglobal.historico", "es", PREFIXO)} ${targetId}\`._`));
      } else {
        linhas.push("", T("🌐 **Lista global:** não consta. ✅", "🌐 **Global list:** not listed. ✅", "🌐 **Lista global:** no figura. ✅"));
      }
    } catch (e) {
      console.error("[USERINFO][HIST]", e?.message);
    }

    await sendEmbed(message.channel, {
      title: `👤 ${user.username ?? user.name ?? T("Usuário", "User", "Usuario")}`,
      colour: COR.info,
      description: linhas.join("\n"),
    });
  } catch (err) {
    console.error("[USERINFO]", err.message);
    await sendEmbed(message.channel, tr(ctx,
      { title: "❌ Erro", description: "Não foi possível buscar as informações.", colour: COR.erro },
      { title: "❌ Error", description: "Couldn't fetch the information.", colour: COR.erro },
      { title: "❌ Error", description: "No se pudo obtener la información.", colour: COR.erro }));
  }
}

// %kick @usuário [motivo]   (KickMembers)
export async function cmdKick(message, args, ctx) {
  const { client, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "KickMembers"))
    return negarPermissao(ctx, message.channel, "KickMembers");

  const { id: targetId, motivo } = extrairAlvo(message, args);
  const reason = motivo || (lang === "en" ? "No reason given" : "Sem motivo especificado");
  if (!targetId)
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Uso incorreto",
      description: `\`${citar("kick", "pt", PREFIXO)} @usuário [motivo]\`\nVocê pode usar a menção ou o ID do usuário.`, colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: `\`${citar("kick", "en", PREFIXO)} @user [reason]\`\nYou can use the mention or the user's ID.`, colour: COR.erro,
    }, {
      title: "❌ Uso incorrecto",
      description: `\`${citar("kick", "es", PREFIXO)} @usuario [motivo]\`\nPuedes usar la mención o el ID del usuario.`, colour: COR.erro,
    }));
  if (targetId === client.user.id)
    return sendEmbed(message.channel, tr(ctx,
      { description: "❌ Não posso me expulsar!", colour: COR.erro },
      { description: "❌ I can't kick myself!", colour: COR.erro },
      { description: "❌ ¡No puedo expulsarme a mí misma!", colour: COR.erro }));

  // quem pede precisa estar ACIMA do alvo (15 out 2026: antes só a Judy precisava)
  {
    const pode = await podeAgirSobre(server, message, targetId, ctx);
    if (!pode.ok) return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Acima de você", description: `${pode.pt}.`, colour: COR.erro },
      { title: "🚫 Above you", description: `${pode.en}.`, colour: COR.erro },
      { title: "🚫 Por encima de ti", description: `${pode.es ?? pode.en}.`, colour: COR.erro }));
  }

  try {
    await server.kickUser(targetId);
    await log.registrar(ctx, "punicoes", { titulo: "👢 Usuário expulso (manual)",
      descricao: `<@${targetId}> foi expulso por <@${message.authorId}>.\n**Motivo:** ${reason}`,
      en: { titulo: "👢 User kicked (manual)", descricao: `<@${targetId}> was kicked by <@${message.authorId}>.\n**Reason:** ${reason}` },
      es: { titulo: "👢 Usuario expulsado (manual)", descricao: `<@${targetId}> fue expulsado por <@${message.authorId}>.\n**Motivo:** ${motivo || "Sin motivo especificado"}` } });
    await sendEmbed(message.channel, tr(ctx, {
      title: "✅ Ação executada: EXPULSÃO",
      description: [
        `**Usuário:** <@${targetId}> \`${targetId}\``,
        `**Ação:** expulso do servidor (pode voltar com novo convite)`,
        `**Motivo:** ${motivo ? reason : "_(nenhum informado)_"}`,
        `**Por:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: "✅ Action executed: KICK",
      description: [
        `**User:** <@${targetId}> \`${targetId}\``,
        `**Action:** kicked from the server (can come back with a new invite)`,
        `**Reason:** ${motivo ? reason : "_(none given)_"}`,
        `**By:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    }, {
      title: "✅ Acción ejecutada: EXPULSIÓN",
      description: [
        `**Usuario:** <@${targetId}> \`${targetId}\``,
        `**Acción:** expulsado del servidor (puede volver con una nueva invitación)`,
        `**Motivo:** ${motivo ? reason : "_(ninguno indicado)_"}`,
        `**Por:** <@${message.authorId}>`,
      ].join("\n"),
      colour: COR.sucesso,
    }));
    console.log(`[KICK] ${message.authorId} -> ${targetId} | ${reason}`);
  } catch (err) {
    console.error("[KICK]", descreverErro(err));
    await sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível expulsar",
      description: `**Usuário:** \`${targetId}\`\n**Erro:** ${descreverErro(err, "pt")}\n\n_Verifique se o bot tem a permissão **KickMembers** e se o cargo dele está acima do alvo._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't kick",
      description: `**User:** \`${targetId}\`\n**Error:** ${descreverErro(err, "en")}\n\n_Check that the bot has **KickMembers** and that its role sits above the target's._`,
      colour: COR.erro,
    }, {
      title: "❌ No se pudo expulsar",
      description: `**Usuario:** \`${targetId}\`\n**Error:** ${descreverErro(err, "es")}\n\n_Comprueba que el bot tenga el permiso **KickMembers** y que su rol esté por encima del de la persona._`,
      colour: COR.erro,
    }));
  }
}

// %ban @usuário [motivo]   (BanMembers)
export async function cmdBan(message, args, ctx) {
  const { client, sendEmbed, COR, getServer, membroTemPermissao, PREFIXO } = ctx;
  const lang = lingua(ctx);
  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "BanMembers"))
    return negarPermissao(ctx, message.channel, "BanMembers");

  const { id: targetId, motivo } = extrairAlvo(message, args);
  const reason = motivo || (lang === "en" ? "No reason given" : "Sem motivo especificado");
  if (!targetId)
    return sendEmbed(message.channel, tr(ctx, {
      title: "❌ Uso incorreto",
      description: `\`${citar("ban", "pt", PREFIXO)} @usuário [motivo]\`\nVocê pode usar a menção ou o ID do usuário.`, colour: COR.erro,
    }, {
      title: "❌ Wrong usage",
      description: `\`${citar("ban", "en", PREFIXO)} @user [reason]\`\nYou can use the mention or the user's ID.`, colour: COR.erro,
    }, {
      title: "❌ Uso incorrecto",
      description: `\`${citar("ban", "es", PREFIXO)} @usuario [motivo]\`\nPuedes usar la mención o el ID del usuario.`, colour: COR.erro,
    }));
  if (targetId === client.user.id)
    return sendEmbed(message.channel, tr(ctx,
      { description: "❌ Não posso me banir!", colour: COR.erro },
      { description: "❌ I can't ban myself!", colour: COR.erro },
      { description: "❌ ¡No puedo banearme a mí misma!", colour: COR.erro }));

  // quem pede precisa estar ACIMA do alvo (15 out 2026: antes só a Judy precisava)
  {
    const pode = await podeAgirSobre(server, message, targetId, ctx);
    if (!pode.ok) return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Acima de você", description: `${pode.pt}.`, colour: COR.erro },
      { title: "🚫 Above you", description: `${pode.en}.`, colour: COR.erro },
      { title: "🚫 Por encima de ti", description: `${pode.es ?? pode.en}.`, colour: COR.erro }));
  }

  try {
    const { jaEstava } = await banir(server, targetId, { reason });
    // alimenta a lista global — com o nome, para a listagem ser legível depois
    await banGlobal.registrar(ctx, targetId, reason, "manual", {
      nome: ctx.client?.users?.get?.(targetId)?.username ?? null,
    });
    if (jaEstava) {
      console.log(`[BAN] ${message.authorId} -> ${targetId} | já estava banido`);
      return sendEmbed(message.channel, tr(ctx, {
        title: "✅ Já estava banido",
        description: `**Usuário:** <@${targetId}> \`${targetId}\`\nEssa pessoa **já está banida** neste servidor — não havia nada a fazer.\n**Lista global:** registrado 🌐`,
        colour: COR.info,
      }, {
        title: "✅ Already banned",
        description: `**User:** <@${targetId}> \`${targetId}\`\nThis person is **already banned** here — nothing to do.\n**Global list:** recorded 🌐`,
        colour: COR.info,
      }, {
        title: "✅ Ya estaba baneado",
        description: `**Usuario:** <@${targetId}> \`${targetId}\`\nEsta persona **ya está baneada** en este servidor — no había nada que hacer.\n**Lista global:** registrado 🌐`,
        colour: COR.info,
      }));
    }
    await log.registrar(ctx, "punicoes", { titulo: "🔨 Usuário banido (manual)",
      descricao: `<@${targetId}> foi banido por <@${message.authorId}>.\n**Motivo:** ${reason}`,
      en: { titulo: "🔨 User banned (manual)", descricao: `<@${targetId}> was banned by <@${message.authorId}>.\n**Reason:** ${reason}` },
      es: { titulo: "🔨 Usuario baneado (manual)", descricao: `<@${targetId}> fue baneado por <@${message.authorId}>.\n**Motivo:** ${motivo || "Sin motivo especificado"}` } });
    await sendEmbed(message.channel, tr(ctx, {
      title: "🔨 Ação executada: BANIMENTO",
      description: [
        `**Usuário:** <@${targetId}> \`${targetId}\``,
        `**Ação:** banido permanentemente (não pode voltar)`,
        `**Motivo:** ${motivo ? reason : "_(nenhum informado)_"}`,
        `**Por:** <@${message.authorId}>`,
        `**Lista global:** registrado 🌐`,
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "🔨 Action executed: BAN",
      description: [
        `**User:** <@${targetId}> \`${targetId}\``,
        `**Action:** permanently banned (can't come back)`,
        `**Reason:** ${motivo ? reason : "_(none given)_"}`,
        `**By:** <@${message.authorId}>`,
        `**Global list:** recorded 🌐`,
      ].join("\n"),
      colour: COR.erro,
    }, {
      title: "🔨 Acción ejecutada: BAN",
      description: [
        `**Usuario:** <@${targetId}> \`${targetId}\``,
        `**Acción:** baneado permanentemente (no puede volver)`,
        `**Motivo:** ${motivo ? reason : "_(ninguno indicado)_"}`,
        `**Por:** <@${message.authorId}>`,
        `**Lista global:** registrado 🌐`,
      ].join("\n"),
      colour: COR.erro,
    }));
    console.log(`[BAN] ${message.authorId} -> ${targetId} | ${reason}`);
  } catch (err) {
    console.error("[BAN]", descreverErro(err));
    await sendEmbed(message.channel, tr(ctx, {
      title: "❌ Não foi possível banir",
      description: `**Usuário:** \`${targetId}\`\n**Erro:** ${descreverErro(err, lingua(ctx))}\n\n_Verifique se o bot tem a permissão **BanMembers** e se o cargo dele está acima do alvo._`,
      colour: COR.erro,
    }, {
      title: "❌ Couldn't ban",
      description: `**User:** \`${targetId}\`\n**Error:** ${descreverErro(err, lingua(ctx))}\n\n_Check that the bot has **BanMembers** and that its role sits above the target's._`,
      colour: COR.erro,
    }, {
      title: "❌ No se pudo banear",
      description: `**Usuario:** \`${targetId}\`\n**Error:** ${descreverErro(err, lingua(ctx))}\n\n_Comprueba que el bot tenga el permiso **BanMembers** y que su rol esté por encima del de la persona._`,
      colour: COR.erro,
    }));
  }
}

function negarPermissao(ctx, channel, permName) {
  return ctx.sendEmbed(channel, tr(ctx, {
    title: "🚫 Permissão insuficiente",
    description: `Você precisa da permissão **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  }, {
    title: "🚫 Missing permission",
    description: `You need the **${permName}** permission to use this command.`,
    colour: ctx.COR.erro,
  }, {
    title: "🚫 Permiso insuficiente",
    description: `Necesitas el permiso **${permName}** para usar este comando.`,
    colour: ctx.COR.erro,
  }));
}
