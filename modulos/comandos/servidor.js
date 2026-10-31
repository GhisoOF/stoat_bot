// &servidor — regras, cargos, canais e FAQ do servidor

export default {
  id: "servidor",
  modulo: "../ferramentas/servidor-info.js",
  funcao: "cmdServidor",
  nomes: { en: "server" },
  apelidos: ["server", "serverinfo", "servidorinfo"],
  es: { nome: "servidor", subcomandos: { regras: "reglas", cargos: "roles", canais: "canales", info: "info" } },   // espanhol (etapa 4)
  subcomandos: { regras: "rules", cargos: "roles", canais: "channels", info: "about" },
  gerenciavel: true,
  textoLivre: true,
  // P2 (31 out 2026): na ajuda, `regras`, `cargos` e `canais` (só o que quem pede consegue
  // ver). `faq`, `info` e a configuração das regras continuam funcionando fora dela.
  ajuda: {
    grupo: "comecar",
    paginas: {
      "regras": {
        "titulo": {
          "pt": "servidor regras",
          "en": "servidor rules",
          "es": "servidor reglas"
        },
        "texto": {
          "pt": "As **regras do servidor**, de onde estiverem:\n1. o texto que a staff definir — vence tudo;\n2. o canal apontado com `regras canal`;\n3. sozinho: o canal chamado **regras**/**rules** (as mensagens, na ordem em que foram escritas).\n\n`{&servidor.regras}` — mostra (e diz de onde veio)\n`{&servidor.regras} definir <texto>` — texto próprio, pode ter várias linhas *(ManagePermissions)*\n`{&servidor.regras} canal #canal` · `auto` — de qual canal ler *(ManagePermissions)*\n`{&servidor.regras} limpar` — apaga o texto e volta ao canal *(ManagePermissions)*\n\n_A Judy usa as mesmas regras quando alguém pergunta \"quais são as regras?\". Para ler o canal ela precisa de **ViewChannel** e **ReadMessageHistory** nele._",
          "en": "The **server rules**, wherever they are:\n1. the text the staff set — beats everything;\n2. the channel pointed to with `rules channel`;\n3. on its own: the channel named **rules**/**regras** (its messages, in the order they were written).\n\n`{&servidor.regras}` — show them (and where they came from)\n`{&servidor.regras} set <text>` — your own text, multiple lines allowed *(ManagePermissions)*\n`{&servidor.regras} channel #channel` · `auto` — which channel to read *(ManagePermissions)*\n`{&servidor.regras} clear` — drop the text and go back to the channel *(ManagePermissions)*\n\n_Judy uses the same rules when someone asks \"what are the rules?\". To read the channel she needs **ViewChannel** and **ReadMessageHistory** there._",
          "es": "Las **reglas del servidor**, estén donde estén:\n1. el texto que defina el staff — gana sobre todo;\n2. el canal indicado con `rules channel`;\n3. por sí sola: el canal llamado **rules**/**regras** (sus mensajes, en el orden en que se escribieron).\n\n`{&servidor.regras}` — las muestra (y dice de dónde salieron)\n`{&servidor.regras} set <texto>` — texto propio, puede tener varias líneas *(ManagePermissions)*\n`{&servidor.regras} channel #canal` · `auto` — de qué canal leer *(ManagePermissions)*\n`{&servidor.regras} clear` — borra el texto y vuelve al canal *(ManagePermissions)*\n\n_Judy usa las mismas reglas cuando alguien pregunta \"¿cuáles son las reglas?\". Para leer el canal necesita **ViewChannel** y **ReadMessageHistory** en él._"
        }
      }
    },
    perm: { pt: "todo mundo (mudar as regras: ManagePermissions)", en: "everyone (changing the rules: ManagePermissions)", es: "todos (cambiar las reglas: ManagePermissions)" },
    uso: { pt: "{&servidor} [regras|cargos|canais]", en: "{&servidor} [rules|roles|channels]", es: "{&servidor} [rules|roles|channels]" },
    desc: {
      pt: "O **servidor em que você está**: dono, criação, membros e descrição.\n\n`{&servidor.regras}` — as regras: o texto da staff ou, sem ele, o canal **regras/rules**\n`{&servidor.cargos}` — do mais alto ao mais baixo, com quantos têm cada um\n`{&servidor.canais}` — por categoria, só os canais que **você** vê\n\n**Staff** *(ManagePermissions)*: `{&servidor.regras} definir <texto>` · `{&servidor.regras} canal #canal|auto`",
      en: "The **server you're in**: owner, creation date, members and description.\n\n`{&servidor.regras}` — the rules: the staff's text or, without it, the **rules** channel\n`{&servidor.cargos}` — highest to lowest, with how many have each\n`{&servidor.canais}` — by category, only the channels **you** can see\n\n**Staff** *(ManagePermissions)*: `{&servidor.regras} set <text>` · `{&servidor.regras} channel #channel|auto`",
      es: "El **servidor en el que estás**: dueño, creación, miembros y descripción.\n\n`{&servidor.regras}` — las reglas: el texto del staff o, sin él, el canal **regras/rules**\n`{&servidor.cargos}` — del más alto al más bajo, con cuántos tienen cada uno\n`{&servidor.canais}` — por categoría, solo los canales que **tú** ves\n\n**Staff** *(ManagePermissions)*: `{&servidor.regras} set <texto>` · `{&servidor.regras} channel #canal|auto`",
    },
    ex: "{&servidor.regras}",
  },
};
