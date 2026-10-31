// &timeout (id `silenciar`) — silêncio manual com o timeout nativo do Stoat

export default {
  id: "silenciar",
  modulo: "../moderacao/punir.js",
  funcao: "cmdTimeout",
  nomes: { en: "timeout" },
  // (P2) o &cargomudo (aposentado) leva ao silêncio de hoje
  apelidos: ["silence", "mute", "timeout", "silencio", "cargomudo", "muterole", "mutedrole", "criarcargomudo", "rolsilencio"],
  es: { nome: "silenciar", subcomandos: { tirar: "quitar" } },
  // `tirar` (o &untimeout de antes) continua valendo como caminho para o &untimeout
  subcomandos: { tirar: ["remove", "undo", "lift", "off"] },
  gerenciavel: true,
  ajuda: {
    grupo: "proteger",
    perm: "TimeoutMembers",
    uso: { pt: "{&silenciar} <@pessoa|id|nome> <tempo> [motivo]", en: "{&silenciar} <@user|id|name> <time> [reason]", es: "{&silenciar} <@usuario|id|nombre> <tiempo> [motivo]" },
    desc: {
      pt: "Silencia alguém por um tempo: a pessoa só vê o servidor até o tempo acabar.\n\nTempo: `30s`, `10m`, `2h`, `1d`, `1w` ou combinados (`1h30m`); número sozinho = minutos; máximo 28 dias.\nRespondendo a uma mensagem, `{&silenciar} 10m` silencia o autor dela.\nTirar antes: `{&untimeout}` ou ↩️ na mensagem do silêncio.\n\n_O bot precisa de **TimeoutMembers** e estar acima da pessoa. Quem tem TimeoutMembers não pode ser silenciado._",
      en: "Times someone out: they can only view the server until it ends.\n\nTime: `30s`, `10m`, `2h`, `1d`, `1w` or combined (`1h30m`); a bare number = minutes; up to 28 days.\nReplying to a message, `{&silenciar} 10m` times out its author.\nLift it early: `{&untimeout}` or ↩️ on the timeout message.\n\n_The bot needs **TimeoutMembers** and must sit above the person. Whoever has TimeoutMembers can't be timed out._",
      es: "Silencia a alguien por un tiempo: la persona solo ve el servidor hasta que se acabe.\n\nTiempo: `30s`, `10m`, `2h`, `1d`, `1w` o combinados (`1h30m`); un número solo = minutos; máximo 28 días.\nRespondiendo a un mensaje, `{&silenciar} 10m` silencia a su autor.\nQuitarlo antes: `{&untimeout}` o ↩️ en el mensaje del silencio.\n\n_El bot necesita **TimeoutMembers** y estar por encima de la persona. A quien tiene TimeoutMembers no se le puede silenciar._",
    },
    ex: { pt: "{&silenciar} @fulano 30m flood", en: "{&silenciar} @someone 30m flood", es: "{&silenciar} @alguien 30m flood" },
    parametros: [
      { nome: { pt: "<@pessoa|id|nome>", en: "<@user|id|name>", es: "<@usuario|id|nombre>" },
        desc: { pt: "quem é silenciado (ou responda à mensagem da pessoa)", en: "who is timed out (or reply to their message)", es: "a quién se silencia (o responde a su mensaje)" } },
      { nome: { pt: "<tempo>", en: "<time>", es: "<tiempo>" },
        desc: { pt: "`30s`, `10m`, `2h`, `1d`, `1w` ou combinados; número sozinho = minutos; máximo 28 dias", en: "`30s`, `10m`, `2h`, `1d`, `1w` or combined; a bare number = minutes; up to 28 days", es: "`30s`, `10m`, `2h`, `1d`, `1w` o combinados; un número solo = minutos; máximo 28 días" } },
    ],
  },
};
