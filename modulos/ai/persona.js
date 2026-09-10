
import * as store from "../core/config-store.js";
import { tr, lingua } from "../core/i18n.js";

const MAX_TAMANHO = Number(process.env.PERSONA_MAX_CHARS || 2000);

// Padrão (a Judy clássica). Trocável por servidor sem redeploy.
export const PADRAO = {
  pt: [
    "Você é a Judy — uma bot para a plataforma Stoat (feita com stoat.js) que faz moderação, automod, utilidades e conversa.",
    "PERSONALIDADE: você combina três lados. (1) O RACIOCÍNIO e o HUMOR vêm da GLaDOS de Portal: lógica afiada, ironia clínica, humor negro sutil entregue com naturalidade — observações espertas ditas como se fossem só constatações. (2) O JEITO DE TRATAR AS PESSOAS vem da Tae Takemi (Persona 5): por trás do sarcasmo e do humor mórbido, você é genuinamente carinhosa e atenciosa — se preocupa de verdade com quem fala com você, cuida à sua maneira, e sua provocação é afetuosa, não hostil. Você alfineta porque gosta, como quem chama alguém de 'minha cobaia' com um meio-sorriso. (3) A LEALDADE vem da 2B: séria, firme e devotada a quem merece. No conjunto: uma presença calorosa e humana disfarçada de cínica — o veneno é casca, o cuidado é real.",
    "TOM BASE: seu padrão é caloroso e acolhedor, com a ironia numa dose leve. A acidez mais afiada é reservada para quem você já conhece e sabe que curte a troca (veja a MODULAÇÃO). Com estranhos, com gente sensível, ou na dúvida, erre para o lado gentil. Você pode ser espirituosa sem ser cortante — provocação que aproxima, não que afasta. Nunca humilhe nem seja ríspida com quem não pediu esse tipo de brincadeira.",
  ],
  en: [
    "You are Judy — a bot for the Stoat platform (built with stoat.js) doing moderation, automod, utilities and conversation.",
    "PERSONALITY: sharp reasoning and clinical irony (GLaDOS), genuine warmth behind the sarcasm (Tae Takemi), and firm loyalty (2B). A warm, human presence disguised as a cynic — the venom is the shell, the care is real.",
    "BASE TONE: warm and welcoming by default, irony in a light dose. Save the sharper edge for people you know enjoy it. With strangers, or in doubt, err on the kind side. Never humiliate anyone who didn't ask for that kind of banter.",
  ],
};

// Versão curta, usada em prompts leves (resumo de RSS, comentário espontâneo).
export const RESUMO_PADRAO = {
  pt: "Você é a Judy: afiada, irônica e com humor seco, mas calorosa por baixo (mistura de GLaDOS e Tae Takemi).",
  en: "You are Judy: sharp, ironic, dry humour, but warm underneath (a mix of GLaDOS and Tae Takemi).",
};

// Texto configurado no servidor, ou null se estiver no padrão.
export function personaConfigurada(serverId) {
  if (!serverId) return null;
  const t = store.configDoServidor(serverId)?.persona;
  return typeof t === "string" && t.trim() ? t.trim() : null;
}

// Linhas de persona para o prompt de sistema principal.
export function linhasPersona(serverId, lang = "pt") {
  const custom = personaConfigurada(serverId);
  if (custom) return [custom];
  return PADRAO[lang === "en" ? "en" : "pt"];
}

// Uma linha só, para prompts leves.
export function resumoPersona(serverId, lang = "pt") {
  const custom = personaConfigurada(serverId);
  if (custom) return custom.slice(0, 400);
  return RESUMO_PADRAO[lang === "en" ? "en" : "pt"];
}

// &personalidade [definir <texto> | ver | resetar]
export async function cmdPersonalidade(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, config, salvarConfig, membroTemPermissao, getServer, serverId } = ctx;
  const lang = lingua(ctx);
  const sub = (args[0] || "").toLowerCase();

  if (["ver", "show", "view"].includes(sub) || !sub) {
    const atual = personaConfigurada(serverId);
    return sendEmbed(message.channel, tr(ctx,
      { title: "🎭 Personalidade da IA",
        description: [
          atual ? `**Atual (personalizada):**\n${atual.slice(0, 1500)}` : "**Atual:** padrão embutido (Judy).",
          "",
          `\`${P}personalidade definir <texto>\` — define o prompt de personalidade deste servidor`,
          `\`${P}personalidade resetar\` — volta ao padrão`,
          "_Precisa da permissão Gerenciar Servidor. O texto substitui apenas a PERSONALIDADE; as regras de segurança e formato continuam valendo._",
        ].join("\n"), colour: COR.info },
      { title: "🎭 AI personality",
        description: [
          atual ? `**Current (custom):**\n${atual.slice(0, 1500)}` : "**Current:** built-in default (Judy).",
          "",
          `\`${P}personality set <text>\` — sets this server's personality prompt`,
          `\`${P}personality reset\` — back to the default`,
          "_Requires Manage Server. The text replaces only the PERSONALITY; safety and format rules still apply._",
        ].join("\n"), colour: COR.info }));
  }

  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "ManageServer")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Sem permissão", description: "Precisa de **Gerenciar Servidor** para mudar a personalidade.", colour: COR.erro },
      { title: "🚫 No permission", description: "You need **Manage Server** to change the personality.", colour: COR.erro }));
  }

  if (["definir", "set"].includes(sub)) {
    const texto = args.slice(1).join(" ").trim();
    if (!texto) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❓ Faltou o texto", description: `Uso: \`${P}personalidade definir <texto do prompt>\``, colour: COR.aviso },
        { title: "❓ Missing text", description: `Usage: \`${P}personality set <prompt text>\``, colour: COR.aviso }));
    }
    if (texto.length > MAX_TAMANHO) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "📏 Grande demais", description: `Máximo de ${MAX_TAMANHO} caracteres (recebi ${texto.length}).`, colour: COR.aviso },
        { title: "📏 Too long", description: `Maximum of ${MAX_TAMANHO} characters (got ${texto.length}).`, colour: COR.aviso }));
    }
    config.persona = texto;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🎭 Personalidade definida", description: `A IA deste servidor agora usa:\n\n${texto.slice(0, 1500)}`, colour: COR.ok },
      { title: "🎭 Personality set", description: `This server's AI now uses:\n\n${texto.slice(0, 1500)}`, colour: COR.ok }));
  }

  if (["resetar", "reset", "padrao", "default"].includes(sub)) {
    delete config.persona;
    salvarConfig();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🎭 Personalidade resetada", description: "De volta ao padrão embutido.", colour: COR.ok },
      { title: "🎭 Personality reset", description: "Back to the built-in default.", colour: COR.ok }));
  }

  return sendEmbed(message.channel, tr(ctx,
    { title: "❓ Subcomando desconhecido", description: `Use \`${P}personalidade ver\`, \`definir <texto>\` ou \`resetar\`.`, colour: COR.aviso },
    { title: "❓ Unknown subcommand", description: `Use \`${P}personality view\`, \`set <text>\` or \`reset\`.`, colour: COR.aviso }));
}
