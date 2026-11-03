// motivos.js — os motivos das punições automáticas de regra fixa e de ruído, nos 3 idiomas
// (P5, 3 nov 2026). A bateria mostrou: num servidor em inglês ou espanhol, o motivo do toque,
// do aviso, do log e do ban saía em português ("evite escrever em CAIXA ALTA em excesso").
//
// Um lugar só (DRY): o automod-engine e o caracteres.js pegam o texto daqui pela CHAVE, no
// idioma do servidor. O motivo que vai ao banco (punicoes.motivo, bans_globais.motivo) e ao
// motivo do ban no Stoat ("[AutoMod] …") é o mesmo texto que a staff daquele servidor lê — a
// coluna continua texto livre, como o motivo do `&warn` manual. Puro: sem import.

const n = (p) => Number.isFinite(Number(p?.n)) ? Number(p.n) : "?";

export const MOTIVOS = Object.freeze({
  odio: {
    pt: () => "linguagem de ódio não é tolerada aqui",
    en: () => "hate speech isn't tolerated here",
    es: () => "el lenguaje de odio no se tolera aquí",
  },
  emoji: {
    pt: (p) => `muitos emojis numa mensagem só (${n(p)})`,
    en: (p) => `too many emojis in a single message (${n(p)})`,
    es: (p) => `demasiados emojis en un solo mensaje (${n(p)})`,
  },
  midia: {
    pt: (p) => `muitas imagens/arquivos em pouco tempo (${n(p)} em 1 min)`,
    en: (p) => `too many images/files in a short time (${n(p)} in 1 min)`,
    es: (p) => `demasiadas imágenes/archivos en poco tiempo (${n(p)} en 1 min)`,
  },
  convite: {
    pt: () => "não é permitido enviar convites neste servidor",
    en: () => "server invites aren't allowed here",
    es: () => "no se permite enviar invitaciones en este servidor",
  },
  conteudo: {
    pt: () => "conteúdo proibido detectado",
    en: () => "forbidden content detected",
    es: () => "contenido prohibido detectado",
  },
  link: {
    pt: () => "este link está em uma lista de bloqueio do servidor",
    en: () => "this link is on one of the server's blocklists",
    es: () => "este enlace está en una lista de bloqueo del servidor",
  },
  mencoes: {
    pt: (p) => `você mencionou ${n(p)} usuários diferentes de uma só vez`,
    en: (p) => `you mentioned ${n(p)} different users at once`,
    es: (p) => `mencionaste a ${n(p)} usuarios distintos de una sola vez`,
  },
  caps: {
    pt: () => "evite escrever em CAIXA ALTA em excesso",
    en: () => "please avoid excessive CAPS",
    es: () => "evita escribir en MAYÚSCULAS en exceso",
  },
  capsTitulo: {
    pt: () => "evite escrever em CAIXA ALTA em excesso (título)",
    en: () => "please avoid excessive CAPS (heading)",
    es: () => "evita escribir en MAYÚSCULAS en exceso (título)",
  },
  risadaTitulo: {
    pt: () => "título só com risada é grito",
    en: () => "a heading that's only laughter is shouting",
    es: () => "un título solo con risas es gritar",
  },
  invisiveis: {
    pt: () => "uso de caracteres invisíveis ou de controle de texto",
    en: () => "use of invisible or text-control characters",
    es: () => "uso de caracteres invisibles o de control de texto",
  },
  zalgo: {
    pt: () => "texto com caracteres 'zalgo' (acentos empilhados) que quebram o chat",
    en: () => "'zalgo' text (stacked accents) that breaks the chat",
    es: () => "texto con caracteres 'zalgo' (acentos apilados) que rompen el chat",
  },
  repeticao: {
    pt: () => "repetição excessiva do mesmo caractere",
    en: () => "excessive repetition of the same character",
    es: () => "repetición excesiva del mismo carácter",
  },
  duplicata: {
    pt: (p) => `você repetiu a mesma mensagem ${n(p)} vezes`,
    en: (p) => `you repeated the same message ${n(p)} times`,
    es: (p) => `repetiste el mismo mensaje ${n(p)} veces`,
  },
  risadaSeguida: {
    pt: (p) => `risada em sequência (${n(p)} mensagens só de risada em 1 minuto)`,
    en: (p) => `laughing in a row (${n(p)} laugh-only messages in 1 minute)`,
    es: (p) => `risas seguidas (${n(p)} mensajes solo de risa en 1 minuto)`,
  },
  massSpam: {
    pt: () => "flood de mensagens (mass spam)",
    en: () => "message flood (mass spam)",
    es: () => "avalancha de mensajes (mass spam)",
  },
  spam: {
    pt: () => "você está enviando mensagens muito rapidamente",
    en: () => "you're sending messages too fast",
    es: () => "estás enviando mensajes demasiado rápido",
  },
});

// O motivo no idioma pedido (pt | en | es; outro → pt). Chave desconhecida é erro de programa.
export function textoDoMotivo(chave, params = {}, idioma = "pt") {
  const m = MOTIVOS[chave];
  if (!m) throw new Error(`motivo desconhecido: ${chave}`);
  return (m[idioma] ?? m.pt)(params ?? {});
}

// (revisão do P5, R4) O motivo do ban automático no último degrau, com quantos avisos — no idioma do
// servidor (vai ao motivo do ban no Stoat, "[AutoMod] …", e à lista global, que só o mostra ao próprio
// servidor). Antes: "(N avisos)" em português em todo servidor.
const AVISOS = { pt: (n) => `${n} avisos`, en: (n) => `${n} warnings`, es: (n) => `${n} avisos` };
export function comAvisos(motivo, n, idioma = "pt") {
  return `${motivo} (${(AVISOS[idioma] ?? AVISOS.pt)(Number.isFinite(Number(n)) ? Number(n) : "?")})`;
}
