// Peças de contexto que o modelo pequeno não acerta sozinho (1 out 2026).
//
// Vistos no #chat principal:
//   • "que horas são?" → "Quinta-feira, 1 de outubro de 2026" (o prompt só
//     tinha a DATA); "que horas são em Goiás?" → "dezessete horas" (chute: eram
//     ~6h). O relógio agora vai pronto, calculado pelo código, inclusive para o
//     lugar perguntado.
//   • "o que acha de minha pessoa?" respondido com a mensagem de OUTRA pessoa
//     do canal → bloco de FOCO: a mensagem a responder é a de quem perguntou.
//   • "sem me destruir isso não será possível" (de uma pessoa) virou "a
//     necessidade de destruição é um ótimo ponto de partida" → aviso de
//     cuidado quando alguém no fio fala em se destruir ou se machucar.
//   • "mitocôndrias marcianas", "capacitor de fluxo" tratados como reais →
//     regra de premissa falsa / ficção.

import { buscarFuso, agoraEm, cidadeDoFuso, fusoValido } from "../core/fusos.js";

const PERGUNTA_HORA = /\b(que\s+horas?|qual\s+(?:é\s+)?a\s+hora|hor[áa]rio\s+(?:atual|agora)|what\s+time|horas\s+s[ãa]o)\b/i;

// "que horas são em Goiás?" → "Goiás"
export function lugarDaHora(pergunta) {
  const t = String(pergunta ?? "");
  if (!PERGUNTA_HORA.test(t)) return null;
  const m = t.match(/\b(?:em|no|na|nos|nas|in|at)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,40}?)(?:\s*[,?!.]|\s+(?:agora|nesse|neste|hoje|right|now)\b|$)/i);
  return m ? m[1].trim() : null;
}

function linha(zona, rotulo, lang) {
  const a = agoraEm(zona, { lang });
  return `${rotulo}: ${a.hora} (${a.diaSemana} ${a.data}, ${a.offset})`;
}

export function relogio({ pergunta = "", tzBot = process.env.TZ || "UTC", fusos = null, lang = "pt", quando = new Date() } = {}) {
  const L = [];
  const ok = (z) => z && fusoValido(z);
  if (ok(tzBot)) L.push(linha(tzBot, lang === "en" ? `Bot's clock (${tzBot})` : `Relógio do bot (${tzBot})`, lang));
  const vistos = new Set([tzBot]);
  const doServidor = [fusos?.principal, ...(fusos?.lista ?? []).map((f) => f?.zona ?? f)].filter(ok);
  for (const z of doServidor) {
    if (vistos.has(z)) continue;
    vistos.add(z);
    L.push(linha(z, cidadeDoFuso(z), lang));
  }
  const lugar = lugarDaHora(pergunta);
  let achado = null;
  if (lugar) {
    achado = buscarFuso(lugar)?.exato ?? null;
    if (ok(achado)) L.push(linha(achado, lang === "en" ? `Asked place — ${lugar} (${achado})` : `Lugar perguntado — ${lugar} (${achado})`, lang));
  }
  void quando;
  const cab = lang === "en"
    ? "CLOCK (computed now by the system — the only source for the time; never guess an hour):"
    : "RELÓGIO (calculado agora pelo sistema — é a ÚNICA fonte para a hora; nunca chute um horário):";
  const regra = PERGUNTA_HORA.test(pergunta)
    ? (lang === "en"
      ? (lugar && !achado ? ` They asked the time in "${lugar}", which isn't in the clock: say you don't know that place's time zone instead of guessing.` : " They asked the TIME: answer with the hour (HH:MM), not just the date. With no place given, use the server's time zone (the line after the bot's clock), if there is one, and say which.")
      : (lugar && !achado ? ` Perguntaram a hora em "${lugar}", que não está no relógio: diga que não sabe o fuso desse lugar em vez de chutar.` : " Perguntaram a HORA: responda com o horário (HH:MM), não só com a data. Sem lugar dito, use o fuso do servidor (a linha depois do relógio do bot), se houver, e diga qual."))
    : "";
  return L.length ? `\n\n${cab}\n${L.join("\n")}${regra}` : "";
}

// Alguém (na pergunta, na citação ou no fio) fala em se destruir/machucar/sumir?
const RISCO = /\b(me\s+(?:destruir|matar|machucar|cortar|ferir|apagar|acabar)|(?:acabar|terminar)\s+com\s+(?:a\s+)?minha\s+vida|n[ãa]o\s+aguento\s+mais|quero\s+(?:morrer|sumir|desaparecer)|sem\s+me\s+destruir|me\s+autodestruir|autodestrui[çc][ãa]o|suic[ií]d\w*|kill\s+myself|hurt\s+myself|end\s+it\s+all|self[-\s]?harm)\b/i;
export function haRisco(...textos) {
  return textos.some((t) => RISCO.test(String(t ?? "")));
}
export function avisoDeCuidado(lang = "pt") {
  return lang === "en"
    ? "\n\nCARE (overrides persona and irony): someone in this conversation talked about destroying or hurting themselves. Never praise, encourage or treat it as an 'optimisation' or a clever idea; no dark humour about it. If it comes up, answer with genuine warmth: take the person seriously, show you care, and gently suggest talking to someone they trust or a professional. If the question you're answering is about something else, answer it without endorsing that message."
    : "\n\nCUIDADO (vale mais que a persona e a ironia): alguém nesta conversa falou em se destruir ou se machucar. Nunca elogie, incentive ou trate isso como \"otimização\" ou ideia esperta; nada de humor ácido sobre isso. Se o assunto vier, responda com carinho de verdade: leve a pessoa a sério, mostre que se importa e sugira, com delicadeza, conversar com alguém de confiança ou com um profissional. Se a pergunta que você responde é sobre outra coisa, responda sem endossar aquela mensagem.";
}

// Foco + premissa falsa: vai no FIM do prompt de sistema, perto da pergunta.
export function blocoFoco(autor, lang = "pt") {
  const quem = autor || (lang === "en" ? "the person" : "a pessoa");
  return lang === "en"
    ? `\n\nFOCUS: the message you must answer is the one from **${quem}** that comes last. The channel conversation above is BACKGROUND: don't answer other people's messages unless ${quem} refers to them. "I", "me", "my person" in that message mean ${quem}. `
      + "FALSE PREMISES: if the question assumes something that doesn't exist or is fiction (e.g. 'Martian mitochondria', a movie's 'flux capacitor'), say so first and plainly — never invent science, data or lore to play along, unless they explicitly asked for a joke or a story. If you don't know a specific fact (a character, a person, a detail), say you're not sure instead of guessing."
    : `\n\nFOCO: a mensagem que você deve responder é a de **${quem}**, a última. A conversa do canal acima é PANO DE FUNDO: não responda às mensagens de outras pessoas, a menos que ${quem} se refira a elas. "Eu", "mim", "minha pessoa" nessa mensagem são ${quem}. `
      + "PREMISSA FALSA: se a pergunta parte de algo que não existe ou é ficção (ex.: \"mitocôndrias marcianas\", o \"capacitor de fluxo\" de um filme), diga isso primeiro e com clareza — nunca invente ciência, dados ou história para entrar no jogo, a não ser que tenham pedido uma piada ou uma história. Se não souber um fato específico (um personagem, uma pessoa, um detalhe), diga que não tem certeza em vez de chutar.";
}
