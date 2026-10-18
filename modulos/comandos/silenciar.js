// &silenciar — silêncio manual (timeout nativo do Stoat)

export default {
  id: "silenciar",
  modulo: "../moderacao/silenciar.js",
  funcao: "cmdSilenciar",
  nomes: { en: "silence" },
  apelidos: ["silence", "mute", "timeout", "silencio"],
  es: { nome: "silenciar", subcomandos: { tirar: "quitar" } },   // espanhol (etapa 4)
  subcomandos: { tirar: ["remove", "undo", "lift", "off"] },
  gerenciavel: true,
  ajuda: {
    perm: "TimeoutMembers",
    uso: { pt: "{&silenciar} @usuário <tempo> [motivo]", en: "{&silenciar} @user <time> [reason]", es: "{&silenciar} @usuario <tiempo> [motivo]" },
    desc: {
      pt: "Silencia alguém por um tempo com o **silêncio nativo do Stoat**: a pessoa só consegue ver o servidor até o tempo acabar — não depende de cargo nem de permissão de canal.\n\nTempo: `30s`, `10m`, `2h`, `1d`, `1w` ou combinados (`1h30m`); número sozinho = minutos; máximo 28 dias.\nTirar antes da hora: `{&silenciar.tirar} @usuário`.\n\n_O bot precisa de **TimeoutMembers** e estar acima da pessoa. Quem tem TimeoutMembers não pode ser silenciado (regra do Stoat)._",
      en: "Times someone out with the **Stoat's native timeout**: they can only view the server until it ends — no role or channel permission involved.\n\nTime: `30s`, `10m`, `2h`, `1d`, `1w` or combined (`1h30m`); a bare number = minutes; up to 28 days.\nLift it early: `{&silenciar.tirar} @user`.\n\n_The bot needs **TimeoutMembers** and must sit above the person. Whoever has TimeoutMembers can't be timed out (Stoat rule)._",
      es: "Silencia a alguien por un tiempo con el **silencio nativo de Stoat**: la persona solo puede ver el servidor hasta que se acabe el tiempo — no depende de roles ni de permisos de canal.\n\nTiempo: `30s`, `10m`, `2h`, `1d`, `1w` o combinados (`1h30m`); un número solo = minutos; máximo 28 días.\nQuitarlo antes de tiempo: `{&silenciar.tirar} @usuario`.\n\n_El bot necesita **TimeoutMembers** y estar por encima de la persona. A quien tiene TimeoutMembers no se le puede silenciar (regla de Stoat)._",
    },
    ex: { pt: "{&silenciar} @fulano 30m flood", en: "{&silenciar} @someone 30m flood", es: "{&silenciar} @alguien 30m flood" },
    parametros: [
      { nome: { pt: "@pessoa <tempo> [motivo]", en: "@user <time> [reason]", es: "@usuario <tiempo> [motivo]" },
        desc: { pt: "silencia com o timeout nativo do Stoat: `30s`, `10m`, `2h`, `1d`, `1w` ou combinados (`1h30m`); número sozinho = minutos; máximo 28 dias", en: "times someone out with the Stoat's native timeout: `30s`, `10m`, `2h`, `1d`, `1w` or combined (`1h30m`); a bare number = minutes; up to 28 days", es: "silencia con el timeout nativo de Stoat: `30s`, `10m`, `2h`, `1d`, `1w` o combinados (`1h30m`); un número solo = minutos; máximo 28 días" } },
      { nome: { pt: "tirar @pessoa", en: "remove @user", es: "quitar @usuario" },
        desc: { pt: "devolve a voz antes da hora", en: "lifts it early", es: "le devuelve la voz antes de tiempo" } },
    ],
  },
};
