
import { citar, trechoPronto } from "./aliases.js";
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


// (P2, 31 out 2026) o `&idioma` virou `&config idioma`: mora em modulos/moderacao/config-idioma.js
// (o core não tem handler de comando).

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
