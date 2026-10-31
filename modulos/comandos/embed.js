// &embed — publica um embed montado pela staff (absorveu o &repete: texto solto vira a descrição)

export default {
  id: "embed",
  modulo: "../moderacao/embed.js",
  funcao: "cmdEmbed",
  // (P2) o &repete saiu: os nomes dele levam aqui (texto sem `campo:` é publicado como está)
  apelidos: ["repete", "repeat", "repetir"],
  es: { nome: "embed", subcomandos: { campos: "campos", cores: "colores" } },
  subcomandos: { campos: "fields", cores: "colors" },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    grupo: "personalizar",
    perm: "ManageMessages",
    uso: {
      pt: "{&embed} <texto> | campo: valor, um por linha",
      en: "{&embed} <text> | field: value, one per line",
      es: "{&embed} <texto> | campo: valor, uno por línea",
    },
    desc: {
      pt: "Publica uma mensagem embed. Texto solto vira a descrição, como está.\n\nCom campos, um por linha (ou separados por `|`):\n```\n{&embed}\ntitulo: Idade\ndescricao: Você tem +18 ou -18 anos?\ncor: #FF00FF\n```\n**Campos:** `titulo:` (até 100 caracteres) `descricao:` `cor:` `rodape:` `imagem:` (URL) `canal:` (outro canal deste servidor onde você escreve).",
      en: "Posts an embed message. Plain text becomes the description, as is.\n\nWith fields, one per line (or separated by `|`):\n```\n{&embed}\ntitle: Age\ndescription: Are you over or under 18?\ncolor: #FF00FF\n```\n**Fields:** `title:` (up to 100 characters) `description:` `color:` `footer:` `image:` (URL) `channel:` (another channel of this server you can post in).",
      es: "Publica un mensaje embed. El texto suelto se vuelve la descripción, tal cual.\n\nCon campos, uno por línea (o separados por `|`):\n```\n{&embed}\ntitulo: Edad\ndescripcion: ¿Tienes más o menos de 18 años?\ncolor: #FF00FF\n```\n**Campos:** `titulo:` (hasta 100 caracteres) `descripcion:` `color:` `pie:` `imagen:` (URL) `canal:` (otro canal de este servidor donde escribas).",
    },
    ex: {
      pt: "{&embed} titulo: Idade | descricao: +18 ou -18? | cor: rosa",
      en: "{&embed} title: Age | description: 18+ or under? | color: pink",
      es: "{&embed} titulo: Edad | descripcion: ¿+18 o -18? | color: rosa",
    },
    paginas: {
      campos: {
        titulo: {
          pt: "embed (campos)",
          en: "embed (fields)",
          es: "embed (campos)",
        },
        texto: {
          pt: "Um campo por linha, no formato `campo: valor`. Sem parênteses em volta e\nsem vírgula no fim — os dois erros mais comuns (e eu tolero os dois).\n\n**Campos**\n`titulo:` — o título\n`descricao:` — o corpo; pode ocupar várias linhas\n`cor:` — hex `#RRGGBB` ou nome (`roxo`, `verde`…)\n`rodape:` — uma linha em itálico no fim\n`imagem:` — URL da imagem de capa\n`canal:` — ID, para publicar em **outro** canal\n\n**Aceito também**\n• chaves em inglês (`title`, `description`, `color`…)\n• tudo numa linha só, separando com `|`\n• `\\n` no meio de um valor, para quebrar linha\n\n_Se algo for ignorado, eu envio e aviso o que não entendi — em vez de falhar calado._",
          en: "One field per line, in the `field: value` format. No parentheses around it and\nno trailing comma — the two most common mistakes (and I tolerate both).\n\n**Fields**\n`title:` — the title\n`description:` — the body; it can span several lines\n`color:` — hex `#RRGGBB` or a name (`purple`, `green`…)\n`footer:` — an italic line at the end\n`image:` — cover image URL\n`channel:` — an ID, to post in **another** channel\n\n**Also accepted**\n• the Portuguese keys too\n• everything on one line, separated by `|`\n• `\\n` inside a value, for a line break\n\n_If something is ignored, I send it and tell you what I didn't understand — instead of failing silently._",
          es: "Un campo por línea, en el formato `campo: valor`. Sin paréntesis alrededor y\nsin coma al final — los dos errores más comunes (y tolero ambos).\n\n**Campos**\n`title:` — el título\n`description:` — el cuerpo; puede ocupar varias líneas\n`color:` — hex `#RRGGBB` o un nombre (`purple`, `green`…)\n`footer:` — una línea en cursiva al final\n`image:` — URL de la imagen de portada\n`channel:` — un ID, para publicar en **otro** canal\n\n**También acepto**\n• las claves en portugués\n• todo en una sola línea, separado con `|`\n• `\\n` dentro de un valor, para un salto de línea\n\n_Si algo se ignora, lo envío y te aviso de lo que no entendí — en vez de fallar en silencio._",
        },
      },
    },
  },
};
