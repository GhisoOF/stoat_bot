// &embed — publica um embed montado pela staff

export default {
  id: "embed",
  modulo: "../moderacao/embed.js",
  funcao: "cmdEmbed",
  es: { nome: "embed", subcomandos: { campos: "campos", cores: "colores" } },   // espanhol (etapa 4)
  subcomandos: { campos: "fields", cores: "colors" },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    perm: "ManageMessages",
    uso: {
      pt: "{&embed} → depois campo: valor, um por linha",
      en: "{&embed} → then field: value, one per line",
      es: "{&embed} → después campo: valor, uno por línea",
    },
    desc: {
      pt: "Publica uma mensagem embed customizável.\n\n**Escreva assim** (sem parênteses, sem vírgula no fim):\n```\n{&embed}\ntitulo: Idade\ndescricao: Você tem +18 ou -18 anos?\ncor: #FF00FF\n```\n**Campos:** `titulo:` `descricao:` `cor:` `rodape:` `imagem:` (URL) `canal:` (ID p/ publicar em outro canal).\nCor por hex (`#5865F2`) ou nome (azul, verde, rosa…).\nTambém aceita tudo numa linha separando com `|`.",
      en: "Posts a customizable embed message.\n\n**Write it like this** (no parentheses, no trailing comma):\n```\n{&embed}\ntitle: Age\ndescription: Are you over or under 18?\ncolor: #FF00FF\n```\n**Fields:** `title:` `description:` `color:` `footer:` `image:` (URL) `channel:` (ID to post in another channel) — the Portuguese names work too.\nColor by hex (`#5865F2`) or name (blue, green, pink…).\nAlso accepts everything on one line separated by `|`.",
      es: "Publica un mensaje embed personalizable.\n\n**Escríbelo así** (sin paréntesis, sin coma al final):\n```\n{&embed}\ntitulo: Edad\ndescripcion: ¿Tienes más o menos de 18 años?\ncolor: #FF00FF\n```\n**Campos:** `titulo:` `descripcion:` `color:` `pie:` `imagen:` (URL) `canal:` (ID para publicar en otro canal) — los nombres en portugués y en inglés también funcionan.\nColor en hex (`#5865F2`) o por nombre (azul, verde, rojo…).\nTambién acepta todo en una sola línea, separado con `|`.",
    },
    ex: {
      pt: "{&embed} titulo: Idade | descricao: +18 ou -18? | cor: rosa",
      en: "{&embed} title: Age | description: 18+ or under? | color: pink",
      es: "{&embed} titulo: Edad | descripcion: ¿+18 o -18? | color: rosa",
    },
    parametros: [
      { nome: { pt: "titulo:", en: "title:", es: "titulo:" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" },
        desc: { pt: "a linha de cima", en: "the top line", es: "la línea de arriba" } },
      { nome: { pt: "descricao:", en: "description:", es: "descripcion:" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" },
        desc: { pt: "o corpo (pode ter várias linhas; tudo até o próximo campo)", en: "the body (can span lines; everything until the next field)", es: "el cuerpo (puede tener varias líneas; todo hasta el siguiente campo)" } },
      { nome: { pt: "cor:", en: "color:", es: "color:" }, valor: { pt: "<#hex|nome>", en: "<#hex|name>", es: "<#hex|nombre>" },
        desc: { pt: "cor da barra", en: "bar color", es: "el color de la barra" } },
      { nome: { pt: "rodape:", en: "footer:", es: "pie:" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" },
        desc: { pt: "linha pequena no fim", en: "small line at the end", es: "una línea pequeña al final" } },
      { nome: { pt: "imagem:", en: "image:", es: "imagen:" }, valor: "<url>",
        desc: { pt: "capa (anexo do Stoat) ou pré-visualização (URL de fora)", en: "cover (Stoat attachment) or preview (external URL)", es: "portada (adjunto de Stoat) o vista previa (URL externa)" } },
      { nome: { pt: "canal:", en: "channel:", es: "canal:" }, valor: { pt: "<#canal>", en: "<#channel>", es: "<#canal>" },
        desc: { pt: "publica em outro canal", en: "posts in another channel", es: "publica en otro canal" } },
      { nome: { pt: "Formato", en: "Format", es: "Formato" },
        desc: { pt: "campos separados por `|` numa linha só, ou um por linha. Ex.: `{&embed} titulo: Regras | descricao: Seja legal | cor: azul`", en: "fields separated by `|` on one line, or one per line. E.g. `{&embed} title: Rules | description: Be kind | color: blue`", es: "campos separados por `|` en una sola línea, o uno por línea. Ej.: `{&embed} titulo: Reglas | descripcion: Sé amable | color: azul`" } },
    ],
  },
};
