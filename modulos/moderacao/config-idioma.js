// &config idioma (era &idioma / &language) — o idioma do bot neste servidor.
// (P2, 31 out 2026) saiu do core/i18n.js: o core não tem handler de comando.

import { tr, idiomaDe } from "../core/i18n.js";
import { citar } from "../core/aliases.js";

const MAPA = {
  pt: "pt", "pt-br": "pt", portugues: "pt", "português": "pt", portuguese: "pt",
  en: "en", "en-us": "en", ingles: "en", "inglês": "en", english: "en", "inglés": "en",
  es: "es", "es-es": "es", espanol: "es", "español": "es", espanhol: "es", spanish: "es", castellano: "es",
};
export const idiomaPedido = (palavra) => MAPA[String(palavra ?? "").toLowerCase()] ?? null;

export async function cmdIdioma(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config, salvarConfig, membroTemPermissao, getServer } = ctx;
  const alvo = idiomaPedido(args[0]);

  // Sem argumento (ou inválido): o estado, nos três idiomas (quem não entende o atual acha o seu)
  if (!alvo) {
    const atual = idiomaDe(ctx);
    const nomeEm = { pt: { pt: "Português", en: "Inglês", es: "Espanhol" }, en: { pt: "Portuguese", en: "English", es: "Spanish" }, es: { pt: "Portugués", en: "Inglés", es: "Español" } };
    return sendEmbed(message.channel, {
      title: "🌐 Idioma / Language",
      colour: COR.info,
      description: [
        `**🇧🇷 Idioma atual:** ${nomeEm.pt[atual]} — \`${citar("idioma", "pt", P)} pt|en|es\``,
        `**🇺🇸 Current language:** ${nomeEm.en[atual]} — \`${citar("idioma", "en", P)} en|pt|es\``,
        `**🇪🇸 Idioma actual:** ${nomeEm.es[atual]} — \`${citar("idioma", "es", P)} es|en|pt\``,
      ].join("\n"),
    });
  }

  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "ManagePermissions")) {
    return sendEmbed(message.channel, { colour: COR.erro, description: tr(ctx,
      "🚫 Mudar o idioma pede **ManagePermissions**.",
      "🚫 Changing the language needs **ManagePermissions**.",
      "🚫 Cambiar el idioma requiere **ManagePermissions**.") });
  }

  config.language = alvo;
  config.idiomaPerguntado = true;   // não precisa mais sugerir
  salvarConfig();
  const titulo = { pt: "🌐 Idioma: Português 🇧🇷", en: "🌐 Language: English 🇺🇸", es: "🌐 Idioma: Español 🇪🇸" }[alvo];
  return sendEmbed(message.channel, { title: titulo, colour: COR.sucesso });
}
