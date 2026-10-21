
import { citar, citarInterno, trechoPronto } from "./aliases.js";
// Idioma efetivo do servidor deste ctx. Sem idioma definido → o padrão do bot
// (inglês desde 13 out 2026; IDIOMA_PADRAO=pt no .env volta ao português).
const padrao = () => ((process.env.IDIOMA_PADRAO || "en").trim().toLowerCase() === "pt" ? "pt" : "en");
//
// Espanhol (etapa 4, 18 out 2026): `language: "es"` é um idioma de verdade para os
// NOMES de comando (registro, aliases.js), mas os textos ainda não têm versão em
// espanhol — então, para o texto, o espanhol vale como inglês. `lingua()` é o idioma
// do TEXTO (pt | en); `idiomaDe()` é o idioma escolhido (pt | en | es).
export function idiomaDe(ctx) {
  const l = ctx?.config?.language;
  return l === "en" || l === "pt" || l === "es" ? l : padrao();
}
export function lingua(ctx) {
  return idiomaDe(ctx) === "pt" ? "pt" : "en";
}
// o idioma do texto a partir do valor salvo (para quem lê `config.language` direto)
export const textoDoIdioma = (l) => (l === "pt" ? "pt" : l === "en" || l === "es" ? "en" : padrao());
// O idioma da TELA (pt, en ou es) de um config.language qualquer — os rótulos
// que já existem nos três (o rodapé das páginas, a ajuda do registro).
export const idiomaDaTela = (l) => (l === "es" ? "es" : textoDoIdioma(l));

// Escolhe entre dois valores (strings, objetos de embed, arrays…). O terceiro, o
// espanhol, é opcional: sem ele, o servidor em espanhol recebe o inglês.
//
// Etapa 4b (21 out 2026): o espanhol que vem daqui sai PRONTO — a tradução da tela
// (feita para o inglês) não passa por ele: ela trocava `aqui` por `here` e `{usuario}`
// por `{user}`. Por isso o texto em espanhol cita comando com `citar(ref, "es", P)`.
export function tr(ctx, pt, en, es) {
  const l = idiomaDe(ctx);
  if (l === "es" && es !== undefined) return pronto(es);
  return l === "pt" ? pt : en;
}
// O texto (ou o embed, ou a lista de linhas) em espanhol, marcado como pronto
function pronto(v) {
  if (typeof v === "string") return trechoPronto(v);
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? trechoPronto(x) : x));
  if (v && typeof v === "object") {
    const o = { ...v };
    for (const k of ["title", "description", "titulo", "descricao"]) if (typeof o[k] === "string") o[k] = trechoPronto(o[k]);
    return o;
  }
  return v;
}


// ── &idioma / &language — o admin define o idioma do servidor ──
export async function cmdIdioma(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config, salvarConfig, membroTemPermissao, getServer } = ctx;

  const pedido = (args[0] ?? "").toLowerCase();
  const mapa = {
    pt: "pt", "pt-br": "pt", portugues: "pt", "português": "pt", portuguese: "pt",
    en: "en", "en-us": "en", ingles: "en", "inglês": "en", english: "en", "inglés": "en",
    es: "es", "es-es": "es", espanol: "es", "español": "es", espanhol: "es", spanish: "es", castellano: "es",
  };
  const alvo = mapa[pedido] ?? null;

  // Sem argumento (ou argumento inválido) → mostra o estado, nos três idiomas.
  if (!alvo) {
    const atual = idiomaDe(ctx);
    const nomeEm = { pt: { pt: "Português", en: "Inglês", es: "Espanhol" }, en: { pt: "Portuguese", en: "English", es: "Spanish" }, es: { pt: "Portugués", en: "Inglés", es: "Español" } };
    return sendEmbed(message.channel, {
      title: "🌐 Idioma / Language",
      colour: COR.info,
      description: [
        `**🇧🇷 Idioma atual:** ${nomeEm.pt[atual]}`,
        `Para mudar (staff): \`${citar("idioma", "pt", P)} pt\`, \`${citar("idioma", "pt", P)} en\` ou \`${citar("idioma", "pt", P)} es\``,
        "",
        `**🇺🇸 Current language:** ${nomeEm.en[atual]}`,
        `To change it (staff): \`${citar("idioma", "en", P)} en\`, \`${citar("idioma", "en", P)} pt\` or \`${citar("idioma", "en", P)} es\``,
        "",
        `**🇪🇸 Idioma actual:** ${nomeEm.es[atual]}`,
        `Para cambiarlo (staff): \`${citar("idioma", "es", P)} es\`, \`${citar("idioma", "es", P)} en\` o \`${citar("idioma", "es", P)} pt\``,
      ].join("\n"),
    });
  }

  const server = await getServer(message).catch(() => null);
  const podeMudar = membroTemPermissao(message, server, "ManagePermissions");
  if (!podeMudar) {
    return sendEmbed(message.channel, tr(ctx, {
      title: "🚫 Permissão insuficiente",
      description: "Só quem tem **ManagePermissions** pode mudar o idioma do servidor.",
      colour: COR.erro,
    }, {
      title: "🚫 Missing permission",
      description: "Only members with **ManagePermissions** can change the server language.",
      colour: COR.erro,
    }));
  }

  config.language = alvo;
  config.idiomaPerguntado = true;   // não precisa mais sugerir
  salvarConfig();

  if (alvo === "es") return sendEmbed(message.channel, {
    title: "🌐 Idioma: Español 🇪🇸",
    colour: COR.sucesso,
    description: [
      "Desde ahora respondo en **español** en este servidor — los nombres de los comandos también.",
      "_Algunas partes todavía salen en inglés (las historias del RPG y los nombres del catálogo)._",
      `Para volver: \`${citar("idioma", "es", P)} pt\` · \`${citar("idioma", "es", P)} en\``,
      "",
      `Empieza por: \`${citar("help", "es", P)}\` · \`${citar("tutorial", "es", P)}\``,
    ].join("\n"),
  });
  return sendEmbed(message.channel, alvo === "en" ? {
    title: "🌐 Language set: English 🇺🇸",
    colour: COR.sucesso,
    description: [
      "From now on I will reply in **English** on this server.",
      `Change it back anytime with \`${citar("idioma", "en", P)} pt\`.`,
      "",
      `Start here: \`${P}help\` · \`${citarInterno("tutorial", P)}\``,
    ].join("\n"),
  } : {
    title: "🌐 Idioma definido: Português 🇧🇷",
    colour: COR.sucesso,
    description: [
      "A partir de agora respondo em **Português** neste servidor.",
      `Para trocar: \`${citar("idioma", "pt", P)} en\`.`,
      "",
      `Comece por: \`${P}help\` · \`${citarInterno("tutorial", P)}\``,
    ].join("\n"),
  });
}

export async function talvezSugerirIdioma(message, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config, salvarConfig, serverId } = ctx;
  if (!serverId) return;                    // fora de servidor não faz sentido
  if (config.idiomaPerguntado) return;      // já perguntamos (ou já escolheram)

  config.idiomaPerguntado = true;
  salvarConfig();

  // inglês primeiro: é o idioma oficial do bot (13 out 2026)
  const en = lingua(ctx) === "en";
  const blocoEN = ["🇺🇸 **English** — this server hasn't picked a language yet. Anyone with",
    `**ManagePermissions** can set it with: \`${citar("idioma", "en", P)} en\``];
  const blocoPT = ["🇧🇷 **Português** — este servidor ainda não escolheu um idioma. Quem tem",
    `**ManagePermissions** define com: \`${citar("idioma", "pt", P)} pt\``];
  const blocoES = ["🇪🇸 **Español** — este servidor aún no eligió un idioma. Quien tenga",
    `**ManagePermissions** lo elige con: \`${citar("idioma", "es", P)} es\``];
  await sendEmbed(message.channel, {
    title: en ? "🌐 Choose the language / Escolha o idioma" : "🌐 Escolha o idioma / Choose the language",
    colour: COR.info,
    description: [
      ...(en ? blocoEN : blocoPT), "", ...(en ? blocoPT : blocoEN), "", ...blocoES, "",
      en ? "_Until someone picks, I reply in English. / Enquanto ninguém escolher, respondo em inglês._"
         : "_Enquanto ninguém escolher, respondo em Português. / Until someone picks, I reply in Portuguese._",
    ].join("\n"),
  });
}
