// &musica — música na call

export default {
  id: "musica",
  modulo: "../ferramentas/musica.js",
  funcao: "cmdMusica",
  nomes: { en: "music" },
  apelidos: ["m", "music", "play", "tocar"],
  es: { nome: "musica" },   // espanhol (etapa 4)
  naTela: { pausar: "pause", retomar: "resume", fila: "queue", parar: "stop", faixa: "track", nao: "off" },
  gerenciavel: true,
  voz: true,
  textoLivre: true,
};
