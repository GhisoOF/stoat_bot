// &silenciar — silêncio manual (timeout nativo do Stoat)

export default {
  id: "silenciar",
  modulo: "../moderacao/silenciar.js",
  funcao: "cmdSilenciar",
  nomes: { en: "silence" },
  apelidos: ["silence", "mute", "timeout", "silencio"],
  subcomandos: { tirar: ["remove", "undo", "lift", "off"] },
  gerenciavel: true,
};
