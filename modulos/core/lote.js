// Vários comandos numa mensagem só — um por linha:
//
//   &automod antispam on
//   &automod anticaps on
//   &log canal aqui
//
// Só vira lote se TODA linha não vazia começar com o prefixo: uma mensagem
// com texto livre depois do comando (um &embed com descrição em várias
// linhas, um &chat longo) continua sendo UM comando, como sempre foi.
export const LOTE_MAX = 10;

export function comandosPorLinha(conteudo, prefixo) {
  const linhas = String(conteudo ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 2) return null;
  if (!linhas.every((l) => l.startsWith(prefixo) && l.length > prefixo.length)) return null;
  return linhas.slice(0, LOTE_MAX);
}

// A mesma mensagem, com o conteúdo trocado por UMA linha. É um Proxy (e não
// uma cópia) porque as classes do stoat.js usam campos privados: os getters
// precisam rodar sobre o objeto original.
export function mensagemDaLinha(message, linha) {
  return new Proxy(message, {
    get(alvo, chave) {
      if (chave === "content") return linha;
      if (chave === "__lote") return true;
      const v = Reflect.get(alvo, chave, alvo);
      return typeof v === "function" ? v.bind(alvo) : v;
    },
  });
}
