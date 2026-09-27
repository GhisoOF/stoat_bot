// Prova de vida da conexão com o Stoat.
//
// O watchdog antigo media "chegou mensagem de alguém" e, depois de 10 min sem
// nada, derrubava o container achando que o socket tinha morrido. De
// madrugada o servidor simplesmente fica quieto: em 27/09 foram 8 reinícios
// em 3h30 — 5 seguidos entre 06:21 e 07:05, sem nenhuma mensagem no meio.
// Cada reinício derrubava IA e voz junto e ZERAVA a memória do anti-spam,
// do anti-duplicata e do sentinela (no meio de um raid, isso apaga a contagem).
//
// O stoat.js manda um Ping a cada 30s e o servidor responde Pong. Todo frame
// que chega — Pong, evento, qualquer coisa — passa por `events.handle()`.
// Registrar ali mede a CONEXÃO, não o movimento do chat: um socket vivo nunca
// fica mais de ~40s sem sinal, mesmo com o servidor inteiro dormindo.
export function vigiarConexao(eventos, aoSinal) {
  if (!eventos || typeof eventos.handle !== "function" || eventos.__vigiado) return false;
  const original = eventos.handle.bind(eventos);
  eventos.handle = (frame) => {
    try { aoSinal(frame?.type ?? "?"); } catch { /* vigiar nunca pode quebrar a conexão */ }
    return original(frame);
  };
  eventos.__vigiado = true;
  return true;
}
