// &servidor — regras, cargos, canais e FAQ do servidor

export default {
  id: "servidor",
  modulo: "../ferramentas/servidor-info.js",
  funcao: "cmdServidor",
  nomes: { en: "server" },
  apelidos: ["server", "serverinfo", "servidorinfo"],
  es: { nome: "servidor" },   // espanhol (etapa 4)
  subcomandos: { regras: "rules", cargos: "roles", canais: "channels", info: "about" },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    perm: { pt: "todo mundo (mudar: ManagePermissions)", en: "everyone (changing: ManagePermissions)", es: "todos (cambiar: ManagePermissions)" },
    uso: { pt: "{&servidor} [regras|cargos|canais|faq]", en: "{&servidor} [rules|roles|channels|faq]", es: "{&servidor} [rules|roles|channels|faq]" },
    desc: { pt: "O **servidor em que você está**: dono, criação, membros e descrição — e, dentro da família:\n\n`regras` — as regras: o texto que a staff definir ou, sem ele, o canal **regras/rules** lido sozinho (só canal público)\n`cargos` — do mais alto ao mais baixo, com quantos têm cada um\n`canais` — por categoria, com a descrição de cada um (só os canais que **você** vê)\n`faq` — avisos e perguntas frequentes da staff (`faq <número>` abre um)\n\n**Staff** *(ManagePermissions)*: `regras definir <texto>` (várias linhas) · `regras canal #canal|auto` · `regras limpar` · `faq add <título> | <texto>` · `faq remover <n>` · `faq limpar`\n\nA equipe fica em `{&staff}`. E dá para **perguntar à Judy**: \"quais são as regras?\", \"quem é da staff?\", \"em que canal posso divulgar?\" — ela responde com estes dados, não de cabeça.", en: "The **server you're in**: owner, creation date, members and description — and, inside the family:\n\n`rules` — the rules: the text the staff set or, without it, the **rules** channel read on its own (public channel only)\n`roles` — highest to lowest, with how many people hold each\n`channels` — by category, with each one's description (only the channels **you** can see)\n`faq` — staff notices and frequent questions (`faq <number>` opens one)\n\n**Staff** *(ManagePermissions)*: `rules set <text>` (multiple lines) · `rules channel #channel|auto` · `rules clear` · `faq add <title> | <text>` · `faq remove <n>` · `faq clear`\n\nThe staff list is `{&staff}`. And you can **ask Judy**: \"what are the rules?\", \"who's on staff?\", \"which channel can I promote in?\" — she answers from this data, not from memory.", es: "El **servidor en el que estás**: dueño, creación, miembros y descripción — y, dentro de la familia:\n\n`rules` — las reglas: el texto que defina el staff o, sin él, el canal **reglas/rules** leído automáticamente (solo canal público)\n`roles` — del más alto al más bajo, con cuántos tienen cada uno\n`channels` — por categoría, con la descripción de cada uno (solo los canales que **tú** ves)\n`faq` — avisos y preguntas frecuentes del staff (`faq <número>` abre uno)\n\n**Staff** *(ManagePermissions)*: `rules set <texto>` (varias líneas) · `rules channel #canal|auto` · `rules clear` · `faq add <título> | <texto>` · `faq remove <n>` · `faq clear`\n\nEl staff está en `{&staff}`. Y puedes **preguntarle a Judy**: \"¿cuáles son las reglas?\", \"¿quién es del staff?\", \"¿en qué canal puedo hacer promoción?\" — responde con estos datos, no de memoria." },
    ex: "{&servidor.regras}",
  },
};
