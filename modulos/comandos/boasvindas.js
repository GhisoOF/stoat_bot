// &boasvindas — embed de boas-vindas

export default {
  id: "boasvindas",
  modulo: "../ferramentas/boas-vindas.js",
  funcao: "cmdBoasVindas",
  nomes: { en: "welcome" },
  apelidos: ["boas-vindas", "welcome", "greeting", "bemvindo"],
  es: { nome: "bienvenida", subcomandos: { canal: "canal", titulo: "titulo", texto: "texto", cor: "color", imagem: "imagen", testar: "probar", padrao: "predeterminado", status: "estado", limpar: "borrar", aqui: "aqui", oculto: "oculto", visivel: "visible", mensagens: "mensajes" } },   // espanhol (etapa 4)
  subcomandos: {
    canal: "channel", titulo: "title", texto: ["text", "message"], cor: ["colour", "color"],
    imagem: "image", testar: "test", padrao: "default", status: "status", limpar: "clear",
    aqui: "here", oculto: ["hidden", "hide"], visivel: ["visible", "show"],
    mensagens: "messages",
  },
  gerenciavel: true,
  textoLivre: true,
  ajuda: {
    perm: "ManageMessages",
    uso: { pt: "{&boasvindas} [canal|titulo|texto|cor|imagem|testar|padrao|on|off]", en: "{&boasvindas} [channel|title|text|colour|image|test|default|on|off]", es: "{&boasvindas} [canal|titulo|texto|color|imagen|probar|predeterminado|on|off]" },
    desc: { pt: "Embed publicado quando alguém **entra** no servidor.\n\n`{&boasvindas.canal.aqui}` — define onde publicar (já liga)\n`{&boasvindas.titulo} <texto>` · `{&boasvindas.texto} <descrição>`\n`{&boasvindas.cor} <cor>` · `{&boasvindas.imagem} <url|limpar>`\n`{&boasvindas.testar}` — publica usando você de exemplo\n`{&boasvindas.padrao}` — volta ao texto de fábrica\n\n**Marcadores:** `{usuario}` `{nome}` `{servidor}` `{membros}`", en: "Embed posted when someone **joins** the server.\n\n`{&boasvindas.canal.aqui}` — where to post (turns it on)\n`{&boasvindas.titulo} <text>` · `{&boasvindas.texto} <description>`\n`{&boasvindas.cor} <colour>` · `{&boasvindas.imagem} <url|clear>`\n`{&boasvindas.testar}` — posts using you as the example\n`{&boasvindas.padrao}` — back to the factory text\n\n**Markers:** `{user}` `{name}` `{server}` `{members}`", es: "Embed que se publica cuando alguien **entra** al servidor.\n\n`{&boasvindas.canal.aqui}` — define dónde publicar (ya lo activa)\n`{&boasvindas.titulo} <texto>` · `{&boasvindas.texto} <descripción>`\n`{&boasvindas.cor} <color>` · `{&boasvindas.imagem} <url|borrar>`\n`{&boasvindas.testar}` — lo publica usándote como ejemplo\n`{&boasvindas.padrao}` — vuelve al texto de fábrica\n\n**Marcadores:** `{usuario}` `{nombre}` `{servidor}` `{miembros}`" },
    ex: "{&boasvindas.canal.aqui}",
    parametros: [
      { nome: { pt: "canal", en: "channel", es: "canal" }, valor: { pt: "<#canal|aqui|id>", en: "<#channel|here|id>", es: "<#canal|aqui|id>" }, desc: { pt: "onde publicar. `aqui` = este canal. Definir o canal já **liga** a mensagem", en: "where to post. `here` = this channel. Setting the channel also **turns it on**", es: "dónde publicar. `aqui` = este canal. Definir el canal ya **activa** el mensaje" } },
      { nome: "on | off", desc: { pt: "liga/desliga sem perder a configuração", en: "toggles without losing the configuration", es: "lo activa o desactiva sin perder la configuración" } },
      { nome: { pt: "titulo", en: "title", es: "titulo" }, valor: { pt: "<texto>", en: "<text>", es: "<texto>" }, desc: { pt: "a linha de cima do embed. Aceita os marcadores abaixo", en: "the embed's top line. Accepts the markers below", es: "la línea de arriba del embed. Acepta los marcadores de abajo" } },
      { nome: { pt: "texto", en: "text", es: "texto" }, valor: { pt: "<descrição>", en: "<description>", es: "<descripción>" }, desc: { pt: "o corpo do embed (pode ter várias linhas). Aceita os marcadores", en: "the embed body (can span lines). Accepts the markers", es: "el cuerpo del embed (puede tener varias líneas). Acepta los marcadores" } },
      { nome: { pt: "cor", en: "colour", es: "color" }, valor: { pt: "<#hex|nome>", en: "<#hex|name>", es: "<#hex|nombre>" }, desc: { pt: "cor da barra lateral: `#FF71CE`, `roxo`, `azul`… (`{&cor.presets}` lista os nomes)", en: "sidebar color: `#FF71CE`, `purple`, `blue`… (`{&cor.presets}` lists the gradients)", es: "el color de la barra lateral: `#FF71CE`, `morado`, `azul`… (`{&cor.presets}` lista los degradados)" } },
      { nome: { pt: "imagem", en: "image", es: "imagen" }, valor: { pt: "<url|limpar>", en: "<url|clear>", es: "<url|borrar>" }, desc: { pt: "capa. Anexo do Stoat vira capa do embed; URL de fora aparece como pré-visualização abaixo", en: "cover. A Stoat attachment becomes the embed cover; an external URL shows as a preview below", es: "la portada. Un adjunto de Stoat se vuelve la portada del embed; una URL externa aparece como vista previa debajo" } },
      { nome: { pt: "imagem", en: "image", es: "imagen" }, valor: { pt: "visivel | oculto", en: "visible | hidden", es: "visible | oculto" }, desc: { pt: "se a URL externa aparece escrita ou fica escondida (padrão: oculta)", en: "whether the external URL is shown in text or hidden (default: hidden)", es: "si la URL externa aparece escrita o queda oculta (predeterminado: oculta)" } },
      { nome: { pt: "testar", en: "test", es: "probar" }, desc: { pt: "publica agora usando você de exemplo — sem esperar alguém entrar", en: "posts it now using you as the example — no need to wait for someone to join", es: "lo publica ahora usándote como ejemplo — sin esperar a que alguien entre" } },
      { nome: { pt: "padrao", en: "default", es: "predeterminado" }, desc: { pt: "volta título e texto ao de fábrica (mantém o canal)", en: "resets title and text to factory (keeps the channel)", es: "vuelve el título y el texto a los de fábrica (mantiene el canal)" } },
      { nome: "status", desc: { pt: "mostra a configuração atual e uma prévia", en: "shows the current setup and a preview", es: "muestra la configuración actual y una vista previa" } },
      { nome: { pt: "Marcadores", en: "Markers", es: "Marcadores" }, desc: { pt: "`{usuario}` menciona a pessoa · `{nome}` só o nome · `{servidor}` nome do servidor · `{membros}` total de membros", en: "`{user}` mentions the person · `{name}` just the name · `{server}` server name · `{members}` member count", es: "`{usuario}` menciona a la persona · `{nombre}` solo el nombre · `{servidor}` el nombre del servidor · `{miembros}` el total de miembros" } },
    ],
  },
};
