// &embed — publica um embed montado pela staff

export default {
  id: "embed",
  modulo: "../moderacao/embed.js",
  funcao: "cmdEmbed",
  subcomandos: { campos: "fields", cores: "colors" },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    perm: "ManageMessages",
    uso: {
      pt: "{&embed} → depois campo: valor, um por linha",
      en: "{&embed} → then field: value, one per line",
    },
    desc: {
      pt: "Publica uma mensagem embed customizável.\n\n**Escreva assim** (sem parênteses, sem vírgula no fim):\n```\n{&embed}\ntitulo: Idade\ndescricao: Você tem +18 ou -18 anos?\ncor: #FF00FF\n```\n**Campos:** `titulo:` `descricao:` `cor:` `rodape:` `imagem:` (URL) `canal:` (ID p/ publicar em outro canal).\nCor por hex (`#5865F2`) ou nome (azul, verde, rosa…).\nTambém aceita tudo numa linha separando com `|`.",
      en: "Posts a customizable embed message.\n\n**Write it like this** (no parentheses, no trailing comma):\n```\n{&embed}\ntitle: Age\ndescription: Are you over or under 18?\ncolor: #FF00FF\n```\n**Fields:** `title:` `description:` `color:` `footer:` `image:` (URL) `channel:` (ID to post in another channel) — the Portuguese names work too.\nColor by hex (`#5865F2`) or name (blue, green, pink…).\nAlso accepts everything on one line separated by `|`.",
    },
    ex: {
      pt: "{&embed} titulo: Idade | descricao: +18 ou -18? | cor: rosa",
      en: "{&embed} title: Age | description: 18+ or under? | color: pink",
    },
    parametros: [
      { nome: { pt: "titulo:", en: "title:" }, valor: { pt: "<texto>", en: "<text>" },
        desc: { pt: "a linha de cima", en: "the top line" } },
      { nome: { pt: "descricao:", en: "description:" }, valor: { pt: "<texto>", en: "<text>" },
        desc: { pt: "o corpo (pode ter várias linhas; tudo até o próximo campo)", en: "the body (can span lines; everything until the next field)" } },
      { nome: { pt: "cor:", en: "color:" }, valor: { pt: "<#hex|nome>", en: "<#hex|name>" },
        desc: { pt: "cor da barra", en: "bar color" } },
      { nome: { pt: "rodape:", en: "footer:" }, valor: { pt: "<texto>", en: "<text>" },
        desc: { pt: "linha pequena no fim", en: "small line at the end" } },
      { nome: { pt: "imagem:", en: "image:" }, valor: "<url>",
        desc: { pt: "capa (anexo do Stoat) ou pré-visualização (URL de fora)", en: "cover (Stoat attachment) or preview (external URL)" } },
      { nome: { pt: "canal:", en: "channel:" }, valor: { pt: "<#canal>", en: "<#channel>" },
        desc: { pt: "publica em outro canal", en: "posts in another channel" } },
      { nome: { pt: "Formato", en: "Format" },
        desc: { pt: "campos separados por `|` numa linha só, ou um por linha. Ex.: `{&embed} titulo: Regras | descricao: Seja legal | cor: azul`", en: "fields separated by `|` on one line, or one per line. E.g. `{&embed} title: Rules | description: Be kind | color: blue`" } },
    ],
  },
};
