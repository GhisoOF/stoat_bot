// &cor — cores e gradientes de cargo, painel de cores

export default {
  id: "cor",
  modulo: "../moderacao/cor-cargo.js",
  funcao: "cmdCor",
  nomes: { en: "color" },
  apelidos: ["cores", "cargocor", "color", "colour"],
  es: { nome: "color" },   // espanhol (etapa 4)
  subcomandos: {
    painel: "panel", criar: "create", gerar: "generate", gradiente: "gradient", preset: "preset",
    presets: "presets", lista: "list", cargos: "roles", remover: "remove", limpar: "clear",
    padrao: "default", aqui: "here", ajuda: "help",
  },
  aninhados: ["painel", "criar", "gerar"],
  gerenciavel: true,
  ajuda: {
    perm: "ManageRole",
    uso: { pt: "{&cor} <cargo> <cor|gradiente|preset>", en: "{&cor} <role> <color|gradient|preset>", es: "{&cor} <rol> <color|gradient|preset>" },
    desc: { pt: "Customiza a cor dos cargos — inclusive com **gradiente**, que o cliente do Stoat não oferece na interface.\n\n**Sólida:** `{&cor} VIP #FF00AA` ou `{&cor} VIP roxo`\n**Gradiente:** `{&cor} VIP gradiente #FF0000 #0000FF` (aceita 2+ cores; um número no início vira o ângulo)\n**Pronto:** `{&cor} VIP preset vaporwave` — veja todos com `{&cor.presets}`\n**Automático:** `{&cor.painel.aqui}` — cria os cargos, publica a mensagem de escolha (mencionando os cargos), reage com os emojis, liga os cargos por reação e ativa o modo exclusivo. Tudo num comando. Vêm 10 cores sólidas e 20 gradientes (`{&cor.painel.aqui} solidas` ou `gradientes` para só um grupo).\n**Só os cargos:** `{&cor.criar}` — cria/pinta sem publicar nada\n**CSS na mão:** `{&cor} VIP linear-gradient(90deg, #f00 0%, #00f 100%)`\n**Limpar:** `{&cor} VIP remover` · **Ver:** `{&cor.lista}`\n\nO cargo pode ser pelo nome (mesmo parcial) ou pelo ID. O cargo do bot precisa de **ManageRole** e estar **acima** do cargo editado.", en: "Customizes role colors — including **gradients**, which the Stoat client doesn't offer in its UI.\n\n**Solid:** `{&cor} VIP #FF00AA` or `{&cor} VIP purple`\n**Gradient:** `{&cor} VIP gradient #FF0000 #0000FF` (2+ colors; a leading number sets the angle)\n**Preset:** `{&cor} VIP preset vaporwave` — see them all with `{&cor.presets}`\n**Automatic:** `{&cor.painel.aqui}` — creates the roles, posts the picker message (mentioning the roles), adds the emoji reactions, wires up reaction roles and enables exclusive mode. All in one command. It brings 10 solid colors and 20 gradients (`{&cor.painel.aqui} solid` or `gradients` for only one group).\n**Roles only:** `{&cor.criar}` — creates/paints without posting anything\n**Raw CSS:** `{&cor} VIP linear-gradient(90deg, #f00 0%, #00f 100%)`\n**Clear:** `{&cor} VIP remove` · **View:** `{&cor.lista}`\n\nThe role can be given by name (even partial) or by ID. The bot's role needs **ManageRole** and must sit **above** the edited role.", es: "Personaliza el color de los roles — incluso con **degradado**, que el cliente de Stoat no ofrece en su interfaz.\n\n**Sólido:** `{&cor} VIP #FF00AA` o `{&cor} VIP purple`\n**Degradado:** `{&cor} VIP gradient #FF0000 #0000FF` (acepta 2+ colores; un número al principio se vuelve el ángulo)\n**Predefinido:** `{&cor} VIP preset vaporwave` — míralos todos con `{&cor.presets}`\n**Automático:** `{&cor.painel.aqui}` — crea los roles, publica el mensaje para elegir (mencionando los roles), reacciona con los emojis, conecta los roles por reacción y activa el modo exclusivo. Todo en un comando. Trae 10 colores sólidos y 20 degradados (`{&cor.painel.aqui} solid` o `gradients` para un solo grupo).\n**Solo los roles:** `{&cor.criar}` — crea/pinta sin publicar nada\n**CSS a mano:** `{&cor} VIP linear-gradient(90deg, #f00 0%, #00f 100%)`\n**Quitar:** `{&cor} VIP remove` · **Ver:** `{&cor.lista}`\n\nEl rol se puede indicar por nombre (aunque sea parcial) o por ID. El rol del bot necesita **ManageRole** y estar **por encima** del rol editado." },
    ex: { pt: "{&cor} VIP gradiente #FF71CE #01CDFE #05FFA1", en: "{&cor} VIP gradient #FF71CE #01CDFE #05FFA1", es: "{&cor} VIP gradient #FF71CE #01CDFE #05FFA1" },
    parametros: [
      { nome: { pt: "<cargo> <cor>", en: "<role> <color>", es: "<rol> <color>" }, desc: { pt: "cor sólida: `#FF00AA` ou um nome (`roxo`, `azul`…)", en: "solid color: `#FF00AA` or a name (`purple`, `blue`…)", es: "color sólido: `#FF00AA` o un nombre (`purple`, `blue`…)" } },
      { nome: { pt: "<cargo> gradiente", en: "<role> gradient", es: "<rol> gradient" }, valor: { pt: "<cor> <cor> [...]", en: "<color> <color> [...]", es: "<color> <color> [...]" }, desc: { pt: "duas ou mais cores; um número no início vira o ângulo", en: "two or more colors; a leading number becomes the angle", es: "dos o más colores; un número al principio se vuelve el ángulo" } },
      { nome: { pt: "<cargo> preset", en: "<role> preset", es: "<rol> preset" }, valor: { pt: "<nome>", en: "<name>", es: "<nombre>" }, desc: { pt: "paleta pronta (`{&cor.presets}` lista)", en: "ready-made palette (`{&cor.presets}` lists them)", es: "paleta predefinida (`{&cor.presets}` las lista)" } },
      { nome: { pt: "<cargo> remover", en: "<role> remove", es: "<rol> remove" }, desc: { pt: "tira a cor", en: "removes the color", es: "quita el color" } },
      { nome: { pt: "painel aqui", en: "panel here", es: "panel here" }, desc: { pt: "cria os cargos de cor (sólidas e gradientes), publica o painel, reage e liga os cargos por reação — tudo de uma vez. `solidas` ou `gradientes` no fim: só um grupo", en: "creates the color roles (solid and gradients), posts the panel, reacts and wires the reaction roles — all at once. `solid` or `gradients` at the end: only one group", es: "crea los roles de color (sólidos y degradados), publica el panel, reacciona y conecta los roles por reacción — todo de una vez. `solid` o `gradients` al final: solo un grupo" } },
      { nome: { pt: "criar", en: "create", es: "create" }, desc: { pt: "só cria/pinta os cargos, sem publicar nada", en: "only creates/paints the roles, posts nothing", es: "solo crea/pinta los roles, sin publicar nada" } },
      { nome: { pt: "lista | presets", en: "list | presets", es: "list | presets" }, desc: { pt: "o que existe", en: "what exists", es: "lo que hay" } },
    ],
  },
};
