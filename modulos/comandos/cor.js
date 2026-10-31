// &cor — cor sólida, gradiente ou preset num cargo; painel de cores; lista

export default {
  id: "cor",
  modulo: "../moderacao/cor-cargo.js",
  funcao: "cmdCor",
  nomes: { en: "color" },
  apelidos: ["cores", "cargocor", "color", "colour"],
  es: { nome: "color", subcomandos: { painel: "panel", criar: "crear", gerar: "generar", gradiente: "degradado", lista: "lista", remover: "quitar", limpar: "limpiar", padrao: "predeterminado", aqui: "aqui", ajuda: "ayuda" } },
  subcomandos: {
    painel: "panel", criar: "create", gerar: "generate", gradiente: "gradient", preset: "preset",
    presets: "presets", lista: ["list", "roles", "cargos"], remover: "remove", limpar: "clear",
    padrao: "default", aqui: "here", ajuda: "help",
  },
  aninhados: ["painel", "criar", "gerar"],
  gerenciavel: true,
  ajuda: {
    grupo: "personalizar",
    perm: "ManageRole",
    uso: { pt: "{&cor} <cargo> <cor> [cor…] | painel | lista", en: "{&cor} <role> <color> [color…] | panel | list", es: "{&cor} <rol> <color> [color…] | panel | list" },
    desc: {
      pt: "Pinta um cargo.\n\n`{&cor} VIP #FF00AA` — uma cor: sólida (hex ou nome: `roxo`)\n`{&cor} VIP #FF0000 #0000FF` — duas ou mais: gradiente (um número antes é o ângulo)\n`{&cor} VIP fogo` — um preset (`{&cor.presets}`)\n`{&cor} VIP remover` — volta à cor padrão\n`{&cor.painel.aqui}` — cria os cargos de cor e publica o painel para escolher por reação\n`{&cor.lista}` — os cargos e as cores\n\nO cargo: menção, nome exato ou ID; só cargos abaixo do seu.",
      en: "Paints a role.\n\n`{&cor} VIP #FF00AA` — one color: solid (hex or name: `purple`)\n`{&cor} VIP #FF0000 #0000FF` — two or more: gradient (a number before them is the angle)\n`{&cor} VIP fire` — a preset (`{&cor.presets}`)\n`{&cor} VIP remove` — back to the default color\n`{&cor.painel.aqui}` — creates the color roles and posts the panel to pick by reaction\n`{&cor.lista}` — the roles and their colors\n\nThe role: mention, exact name or ID; only roles below yours.",
      es: "Pinta un rol.\n\n`{&cor} VIP #FF00AA` — un color: sólido (hex o nombre: `purple`)\n`{&cor} VIP #FF0000 #0000FF` — dos o más: degradado (un número antes es el ángulo)\n`{&cor} VIP fire` — un predefinido (`{&cor.presets}`)\n`{&cor} VIP remove` — vuelve al color predeterminado\n`{&cor.painel.aqui}` — crea los roles de color y publica el panel para elegir por reacción\n`{&cor.lista}` — los roles y sus colores\n\nEl rol: mención, nombre exacto o ID; solo roles por debajo del tuyo.",
    },
    ex: { pt: "{&cor} VIP #FF71CE #01CDFE #05FFA1", en: "{&cor} VIP #FF71CE #01CDFE #05FFA1", es: "{&cor} VIP #FF71CE #01CDFE #05FFA1" },
    paginas: {
      painel: {
        titulo: { pt: "cor painel", en: "color panel", es: "color panel" },
        texto: {
          pt: "`{&cor.painel.aqui}` — painel neste canal, com as 10 sólidas e os 20 gradientes\n`{&cor.painel} <#canal>` — em outro canal deste servidor\n`{&cor.painel.aqui} fogo gelo neon` — só essas cores · `solidas` · `gradientes` — só um grupo\n`{&cor.criar}` — só cria e pinta os cargos\n\nEscolher uma cor tira a anterior. Cargo com o nome da cor que **tem permissões** fica de fora.\n_O bot precisa de **ManageRole**, **React** no canal e estar acima dos cargos de cor._",
          en: "`{&cor.painel.aqui}` — panel in this channel, with the 10 solid colors and 20 gradients\n`{&cor.painel} <#channel>` — in another channel of this server\n`{&cor.painel.aqui} fire ice neon` — only those colors · `solid` · `gradients` — only one group\n`{&cor.criar}` — only creates and paints the roles\n\nPicking a color removes the previous one. A role with the color's name that **has permissions** is left out.\n_The bot needs **ManageRole**, **React** in the channel and to sit above the color roles._",
          es: "`{&cor.painel.aqui}` — panel en este canal, con los 10 sólidos y los 20 degradados\n`{&cor.painel} <#canal>` — en otro canal de este servidor\n`{&cor.painel.aqui} fire ice neon` — solo esos colores · `solid` · `gradients` — solo un grupo\n`{&cor.criar}` — solo crea y pinta los roles\n\nElegir un color quita el anterior. Un rol con el nombre del color que **tiene permisos** se deja fuera.\n_El bot necesita **ManageRole**, **React** en el canal y estar por encima de los roles de color._",
        },
      },
      gradiente: {
        titulo: { pt: "cor gradiente", en: "color gradient", es: "color gradient" },
        texto: {
          pt: "`{&cor} <cargo> #FF0000 #0000FF` — de uma cor à outra · `{&cor} <cargo> 45 vermelho azul` — com ângulo\n`{&cor} <cargo> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — CSS na mão\n\nO Stoat aceita: ângulo como `224deg`, paradas em `%` inteiro, cores em hex, `rgb()` ou nome, até **128 caracteres**, sem `hsl()`.",
          en: "`{&cor} <role> #FF0000 #0000FF` — from one color to the other · `{&cor} <role> 45 red blue` — with an angle\n`{&cor} <role> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — raw CSS\n\nStoat accepts: angle as `224deg`, stops as whole `%`, colors in hex, `rgb()` or a name, up to **128 characters**, no `hsl()`.",
          es: "`{&cor} <rol> #FF0000 #0000FF` — de un color a otro · `{&cor} <rol> 45 red blue` — con ángulo\n`{&cor} <rol> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — CSS a mano\n\nStoat acepta: ángulo como `224deg`, paradas en `%` enteros, colores en hex, `rgb()` o nombre, hasta **128 caracteres**, sin `hsl()`.",
        },
      },
    },
  },
};
