// tempo.js — horários na tela pelo timestamp do Stoat (P2, 31 out 2026).
//
// O cliente do Stoat desenha `<t:SEGUNDOS:formato>` no fuso de QUEM LÊ. Por isso
// todo horário que o bot mostra passa por aqui, em vez de toLocaleString com um
// fuso escolhido pelo servidor (que acertava só para parte das pessoas).
//
// Formatos (decisão do Ghieh: valem todos, mesmo com o `hh:mm` do cliente web
// saindo em 12 h sem AM/PM):
//   t  hora curta          T  hora com segundos
//   d  data curta          D  data por extenso
//   f  data e hora         F  dia da semana, data e hora
//   R  relativo ("em 5 minutos", "há 2 horas")
// Sem formato, o cliente usa o padrão (data e hora).

const FORMATOS = new Set(["t", "T", "d", "D", "f", "F", "R"]);

// Data, número (ms) ou texto ISO → `<t:…>`. Valor inválido → "" (quem chama decide
// o que mostrar), nunca "<t:NaN>".
export function carimbo(quando, formato = "f") {
  // (P2) só Date, número ou texto: null/undefined/objeto não viram 1970
  const ms = quando instanceof Date ? quando.getTime() : typeof quando === "string" ? Date.parse(quando) : typeof quando === "number" ? quando : NaN;
  if (!Number.isFinite(ms)) return "";
  const s = Math.floor(ms / 1000);
  return FORMATOS.has(formato) ? `<t:${s}:${formato}>` : `<t:${s}>`;
}

// "às 21:30 (há 2 horas)" sem escrever o texto: a data/hora e o relativo juntos.
export const carimboComRelativo = (quando, formato = "f") => {
  const a = carimbo(quando, formato), b = carimbo(quando, "R");
  return a && b ? `${a} (${b})` : "";
};
