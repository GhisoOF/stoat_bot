// A ajuda em árvore em espanhol (etapa 4b, 21 out 2026).
//
// As páginas `&help <comando> <sub>…` e os grupos do índice existem em português e em
// inglês (help-arvore.js, help-grupos.js, construirSubtopicos no geral.js). Aqui fica
// o espanhol, página a página, pelo MESMO caminho da árvore em inglês. No servidor em
// espanhol, cada página daqui vence a inglesa; a que não estiver aqui sai em inglês,
// como antes. O texto daqui sai PRONTO: a tradução da tela (feita para o inglês) não
// passa por ele. Comando citado pela marca de citação do registro (chave, &, ref, chave),
// resolvida em espanhol.
import { citarNoTexto } from "../core/aliases.js";

// { cmd: { sub: { titulo, texto } } } — o mesmo formato da árvore em inglês
export const ARVORE_ES = {
  "automod": {
    "titulo": "automod",
    "texto": "Todo lo que el bot filtra por su cuenta vive aquí, en cuatro grupos. La mayoría de las partes **mide** algo exacto (ritmo, mayúsculas, enlaces), salvo el sentinel, que **juzga** el contenido.\n\n**Ver qué está activo**\n`{&automod}` — los cuatro grupos y sus partes\n`{&automod} <grupo>` — un grupo: cada parte, sus números y su castigo\n`{&automod} <grupo> on|off` — el grupo entero\n`{&automod} <grupo> <parte> on|off` — solo una parte\n\n**Los cuatro grupos**\n🌊 `antispam` — avalanchas: `speed` y `burst` (demasiados mensajes), `repetition` (el MISMO mensaje o imagen una y otra vez), `media` (adjuntos por minuto, más estricto con cuentas nuevas), `mentions`\n🔊 `antinoise` — texto ruidoso: `caps`, `characters` (zalgo, invisibles), `letters` (letras alargadas; apagado por defecto, `kkkkk` es risa), `emoji` (20+ en un mensaje)\n🔗 `antilink` — `domains` (dominios de la lista de bloqueo) e `invites` (invitaciones a otros servidores)\n🛡️ `sentinel` — contenido dañino: `content` (juzga estafas, NSFW, gore, ilícitos; ve a través de los disfraces), `hate` (insultos, aunque estén disfrazados; `hate add <término>` añade más), `images` (imágenes de cuentas nuevas, descritas por el modelo de visión; solo avisa), `topics` (temas que las reglas prohíben: política, religión, drogas, sexual; una nota ponderada, suavizada por la risa, y la IA distingue una discusión de una broma), `avatar` (foto de perfil al entrar o al cambiarla, modelo de visión)\n\n**Dentro de la familia**\n`{&automod} blocklist` · `{&automod} whitelist` · `{&automod.sentinela}` · `{&automod.punicao}`",
    "blocklist": {
      "dominios": {
        "titulo": "blocklist adddomain",
        "texto": "Aquí conviven dos cosas distintas: **fuentes** (listas Pi-hole enteras, con millones\nde dominios) y **dominios manuales** (uno a uno, los tuyos).\n\n**Fuentes**\n`{&automod} blocklist add <url>` — descarga e incorpora una lista\n`{&automod} blocklist remove <url>` — quita la fuente\n\n**Manuales**\n`{&automod} blocklist adddomain 02giga.link`\n`{&automod} blocklist removedomain 02giga.link`\n\n**Mantenimiento**\n`{&automod} blocklist list` — fuentes, entradas manuales y el total cargado\n`{&automod} blocklist reload` — vuelve a descargarlo todo\n`{&automod} blocklist clear` — borra fuentes y entradas manuales\n\n_La lista es **global** para el bot, no por servidor: una vez descargada, vale para todos; por eso **cambiarla** (add, remove, adddomain, removedomain, clear, reload) es **solo del dueño del bot**; el staff de cada servidor la ve con `list` y permite un sitio **solo aquí** con `{&automod} whitelist add <enlace>`._\n_El índice listo queda en caché en disco: tras un reinicio, el antienlaces arranca ya armado._\n_Si una fuente falla durante el `reload`, se mantiene la lista actual: nunca se encoge por un fallo de red._"
      }
    },
    "whitelist": {
      "titulo": "whitelist",
      "texto": "Lo que siempre pasa, aunque un filtro lo bloquearía. Pega un enlace y el bot averigua en qué lista va:\n• **un sitio** (`https://linksta.cc/@tu`) → el dominio queda permitido en el **antienlaces**, subdominios incluidos\n• **una invitación de Stoat** (`stt.gg/abc`) → la invitación queda permitida en el **antiinvitaciones**\n• **un canal** (`#promocion`) → ahí se puede publicar **cualquier** invitación — el canal de promoción. El antienlaces, el Centinela y el antispam siguen aplicándose\n\n`{&automod} whitelist add <enlace>` · `{&automod} whitelist remove <enlace>` · `{&automod} whitelist` — ver ambas listas\n\nEl staff (el dueño del servidor y los roles de `{&staff}`) **nunca** pasa por el automod: no hace falta permitir tus propios enlaces."
    },
    "sentinela": {
      "sensibilidade": {
        "titulo": "sentinel sensitivity",
        "texto": "**Uso:** `{&automod.sentinela.sensibilidade} <low|medium|high>`\n\nDefine a partir de qué **nota (0–10)** el bot actúa sobre contenido sospechoso:\n• 🟢 **low** (umbral 7.5) — solo lo casi seguro; menos falsos positivos.\n• 🟡 **medium** (umbral 6.5) — el equilibrio recomendado.\n• 🔴 **high** (umbral 5.5) — capta indicios leves; protege más, se equivoca más."
      },
      "testar": {
        "titulo": "sentinel test",
        "texto": "**Uso:** `{&automod.sentinela.testar} <texto>`\n\nSimula el análisis de un texto y muestra la nota (0–10) y las señales detectadas, sin castigar a nadie. Útil para calibrar la sensibilidad."
      },
      "canal": {
        "titulo": "sentinel channel",
        "texto": "**Uso:** `{&automod.sentinela.canal} <#canal|here|off>`\n\nDefine a qué canal van las alertas de contenido sospechoso. `off` vuelve a avisar en el canal de registro (o en el propio canal del mensaje)."
      },
      "antiguidade": {
        "titulo": "sentinel tenure",
        "texto": "El sentinel es el único módulo que **juzga** en lugar de medir,\ny por eso el único cuyo rigor cambia según quién escribe.\n\n**La idea**\nUna cuenta creada hace minutos que llega mandando enlaces y hablando\nde ventas es el patrón clásico de estafa. La misma frase de alguien\nque lleva semanas aquí casi siempre es una broma que el detector no capta.\n\n**Cómo se mide la antigüedad**\nCon el **XP activado**, es el nivel: solo sube conversando, con el tiempo.\nCon el **XP desactivado**, es el **tiempo en el servidor** (la fecha de entrada);\nsin esa fecha, la persona queda neutral. (Antes, sin XP, todo el mundo era\nrecién llegado para siempre: demasiado estricto.)\n\n| nivel de XP | tiempo en el servidor | franja | umbral (medium 6.5) |\n|---|---|---|---|\n| 0 | menos de 1 día | recién llegado | 5.75 |\n| 1–2 | — | conocido | 6.0 |\n| 3–5 | de 1 a 7 días | habitual | 6.25 |\n| 6–10 | de 7 a 30 días (o desconocido) | establecido | 6.5 |\n| 11+ | más de 30 días | veterano | 7.0 |\n\nUna cuenta creada hace menos de 1 h pierde otros 2.5; creada hoy, 1.\n\nHay un suelo y un techo: ningún veterano es inmune, y ningún recién llegado\nrecibe un castigo por cualquier tontería.\n\n`{&automod.sentinela.antiguidade} on|off`\n\n_Vale SOLO para el sentinel. Spam, mayúsculas, enlaces, menciones, repetición_\n_y caracteres miden cosas exactas: ahí el límite es igual para todos._"
      },
      "alerta": {
        "titulo": "sentinel alerts",
        "texto": "Avisa al staff cuando alguien levanta sospechas **repetidas veces** en poco\ntiempo, aunque no llegue al umbral de castigo.\n\n**Por qué va aparte del castigo**\nNo todo patrón sospechoso merece un castigo, pero todo patrón sospechoso\nmerece ojos humanos **mientras está ocurriendo**. Es justo el caso\ndudoso (nota alta, pero no lo bastante) el que la moderación\nnecesita ver antes de que el bot decida por su cuenta.\n\n**Cómo se dispara**\n3 señales en 10 minutos de la misma persona. Una señal suelta es ruido.\nTras avisar, guarda silencio sobre esa persona durante 30 min: una alerta\nque se repite se vuelve ruido y el staff deja de leerla.\n\n**Qué trae la alerta**\nQuién es, cuántas veces, el perfil (recién llegado/veterano y nivel), la\nnota más alta, las señales vistas y los comandos de acción.\n\n`{&automod.sentinela.alerta} on|off`\n`{&automod.sentinela.canal} <#canal|here>` — dónde avisar (si no, usa el canal de registro)\n_Menciona a los roles de `{&acesso.cargo}`._"
      },
      "assuntos": {
        "titulo": "sentinel topics",
        "texto": "Para servidores cuyas reglas dicen \"aquí no se habla de política, religión…\",\npero donde la gente bromea con esos temas, y bromear está bien.\n\n**Cómo decide: una nota de 0 a 10, como el sentinel**\n• **la suben:** términos con peso: fuertes (insultos partidistas, \"porro\") 3, nombres\n  (políticos, partidos) 2.5, ideas (\"derecha\", \"comunismo\", \"iglesia\") 2,\n  genéricos (\"gobierno\", \"elecciones\") 1; señales de debate (\"no tienes ni idea\",\n  \"el hecho es\"), ataques (\"estúpido\", \"idiota\"), mensajes largos y el\n  **contexto**: el tema que vuelve al canal, con otras personas\n• **la suavizan:** \"lol\"/\"haha\"/\"kkkk\", emojis de risa, \"es broma\",\n  mensajes cortos, preguntas neutrales y todo el canal riéndose\n• **no cuentan:** \"Dios mío\", \"gira a la derecha\"; los disfraces se deshacen antes\nSi pasa el umbral (medium 4.5; high 3.5; low 6) → la IA lee el hilo\ny confirma si es una **discusión de verdad** o una broma (en la duda,\nbroma). Con `ai off`, la nota decide sola.\n\n**Los temas y la acción de cada uno**\n`politics` · `religion` · `drugs` · `sexual` (texto) — cada uno con:\n• `off` — desactivado (el valor por defecto)\n• `alert` — llama al staff; el mensaje se queda\n• `delete` — solo quita el mensaje (lo avisa en el canal, sin castigo)\n• `punish` — borra y cuenta en la escalera (`stack`; cámbialo con `punishment`)\n\n`{&automod.sentinela.assuntos}` — el panel\n`{&automod.sentinela.assuntos.politica.apagar}`\n`{&automod.sentinela.assuntos.religiao.alertar}`\n`{&automod.sentinela.assuntos.drogas.add} <término>` — una palabra extra (peso de nombre)\n`{&automod.sentinela.assuntos.test} <texto>` — la nota de cada tema, sin castigar\n`{&automod.sentinela.assuntos.sensibilidade} <low|medium|high>` · `ai on|off`\n`{&automod.sentinela.assuntos.liberar} #debate` · `watch #debate` — un canal donde está permitido\n`{&automod.sentinela.assuntos} punishment <modo>` — qué hace `punish`\n\n_Un error del modelo nunca se convierte en castigo. El staff no es moderado (pero lo que dice cuenta como contexto)._\n_Funciona en segundo plano: el mensaje no espera al modelo._"
      },
      "avatar": {
        "titulo": "sentinel avatar",
        "texto": "La foto de perfil de quien **entra** o la **cambia** (la del perfil y la\ndel servidor) pasa por el modelo de visión. Nunca se vuelve a publicar.\n\n**Qué la delata**\nGenitales, actos sexuales o pornografía descritos: bastan por sí solos.\nDesnudez, gore o símbolos de odio, solo con el voto de riesgo del modelo\n(\"sin camiseta en la playa\" no castiga a nadie).\n\n**La acción** (el staff siempre recibe aviso)\n• `silence` — timeout nativo por el tiempo elegido (24 h por defecto) — **el valor por defecto**\n• `alert` — solo avisa\n• `kick` (expulsar) · `ban` (banear)\n\n`{&automod.sentinela.avatar}` — el panel\n`{&automod.sentinela.avatar.acao} <alert|silence|kick|ban>`\n`{&automod.sentinela.avatar.tempo} 24h`\n`{&automod.sentinela.avatar.checar} @persona` — analiza ahora, sin castigar\n`{&automod.sentinela.liberar} <@usuario|id>` — libera a quien fue silenciado\n\n_El staff, el dueño y los bots no pasan por la revisión. Necesita **TimeoutMembers** (silenciar),_\n_**KickMembers** o **BanMembers** según la acción._"
      }
    },
    "punicao": {
      "titulo": "automod punishment",
      "texto": "**Uso:** `{&automod} <módulo> punishment <modo|inherit>`\n\nDa a un módulo un castigo **propio**, independiente del global:\n• `warn` — solo avisa\n• `delete` — solo quita el mensaje\n• `confirm` — silencia y espera a un mod\n• `stack` — suma advertencias hasta el ban\n• `ban` — ban inmediato\n• `inherit` — vuelve a usar el castigo global\n\nEj.: `{&automod} antilink punishment delete`",
      "modo": {
        "titulo": "punishment mode",
        "texto": "**Uso:** `{&automod.punicao} mode <warn|delete|confirm|stack|ban>`\n\nDefine el castigo **global** (vale para todos los módulos sin castigo propio):\n• `warn` — solo avisa, no quita nada\n• `delete` — solo quita el mensaje\n• `confirm` — quita, silencia (timeout nativo) y espera la aprobación de un mod\n• `stack` — suma advertencias y banea al llegar al límite\n• `ban` — ban inmediato"
      },
      "escada": {
        "titulo": "punishment ladder",
        "texto": "En el modo `stack`, cada reincidencia sube un peldaño. Por defecto:\n\n**1.** advertencia\n**2.** silencio de 5 min\n**3.** silencio de 1 h\n**4.** ban\n\n**Por qué una escalera y no un contador**\nAntes eran N advertencias y luego ban, sin nada en medio. Eso\ncastigaba igual un desliz puntual que un ataque deliberado, y le daba\na un miembro corriente un susto desproporcionado con el único castigo\nque llegaba a ver. La escalera suma peso poco a poco y, sobre todo, da\nuna **oportunidad**: quien para en el primer peldaño nunca llega al último.\n\n**Cambiarla**\n`{&automod.punicao} ladder` — muestra la escalera actual\n`{&automod.punicao} ladder warn,10m,2h,ban` — más tiempo en cada peldaño\n`{&automod.punicao} ladder warn,ban` — una sola advertencia antes del ban\n\nAcepta `warn`, `ban` y duraciones como `30s`, `10m`, `2h`, `1d`.\nEl ban es siempre el último peldaño, aunque no lo escribas.\n\n_Los peldaños de silencio usan el **timeout nativo** de Stoat: el bot necesita **TimeoutMembers**._\n_El plazo se guarda en la base de datos, así que un silencio de 1 h sobrevive a un reinicio del bot._"
      }
    },
    "set": {
      "titulo": "automod set",
      "texto": "**Uso:** `{&automod} <grupo> set <parámetro> <valor>`\n\nAjusta un parámetro de un módulo. Parámetros por módulo:\n• `antispam`: `messages`, `time` (ms) — velocidad · `times` — repetición · `minute`, `newcomer` — multimedia · `mentions`\n• `antinoise`: `size`, `threshold` (0–1 o %) — mayúsculas · `zalgo` — caracteres · `repetition`, `ignore` — letras · `emojis` — emoji\n  _La medición ignora menciones, enlaces, emojis con nombre y código: solo cuenta el texto escrito._\n\nEj.: `{&automod} antispam set messages 3` · `{&automod} antispam set time 10000`"
    },
    "antirepeticao": {
      "titulo": "automod antirepeticao",
      "texto": "**Antirrepetición** — bloquea la misma letra repetida muchas veces en un mensaje (p. ej. `aaaaaaaaaa`).\n\nViene **desactivado** por defecto, porque en los servidores brasileños `kkkkk` (risa) es legítimo; por eso también la `k` se ignora por defecto.\n\n`{&automod} antirepeticao on` — lo activa\n`{&automod} antirepeticao set repetition 15` — límite de repeticiones\n`{&automod} antirepeticao set ignore k` — letras que ignorar (risa)\n`{&automod} antirepeticao punishment delete` — castigo propio"
    }
  },
  "cor": {
    "painel": {
      "titulo": "color panel",
      "texto": "Lo hace todo por ti: crea los roles de colores, publica el mensaje para elegir,\nreacciona con un emoji por color y conecta los roles por reacción en modo exclusivo.\n\n`{&cor.painel.aqui}` — panel en este canal, con todos los colores (10 sólidos y 20 degradados)\n`{&cor.painel} <id-del-canal>` — publica en otro canal\n`{&cor.painel.aqui} fire ice neon` — solo los colores que indiques\n`{&cor.painel.aqui} green blue` — los sólidos también valen por su nombre\n`{&cor.painel.aqui} solid` · `{&cor.painel.aqui} gradients` — solo un grupo\n`{&cor.criar}` — solo crea y pinta los roles, no publica nada\n\n**Exclusivo por defecto:** elegir un color quita el anterior. Es lo que\ntiene sentido para un color: nadie quiere dos a la vez.\n\n**Dos mensajes:** Stoat admite hasta 20 reacciones por mensaje, así que los colores\nsólidos y los degradados van cada uno en el suyo, y el modo exclusivo abarca los dos.\nUn rol que ya existe con el nombre del color y **tiene permisos** se deja fuera.\n\n_El bot necesita **ManageRole**, **React** en el canal, y su rol debe estar_\n_por encima de los roles de color._"
    },
    "gradiente": {
      "titulo": "color gradient",
      "texto": "El campo de color de los roles en Stoat acepta colores y **degradados** CSS, pero en un formato\nestricto (abajo).\n\n`{&cor} <rol> gradient #FF0000 #0000FF` — de un color a otro\n`{&cor} <rol> gradient 45 red blue` — el número inicial es el ángulo\n`{&cor} <rol> preset fire` — uno de los ya hechos (`{&cor.presets}`)\n`{&cor} <rol> linear-gradient(224deg, #73E696 50%, #F7EEB2 50%)` — CSS a mano (aquí, mitad de cada color)\n\n**El formato que acepta Stoat**\n• ángulo como `224deg` (no `224 deg`) · paradas en `%` enteros · colores en hex, `rgb()` o por nombre\n• nada entre `linear-gradient` y `(` · como máximo **128 caracteres** · sin `hsl()`\nLos espacios de más, el `°`, los `%` con decimales y el `gradient(` sin `linear-` los corrijo antes de enviar;\ntodo lo demás te lo explico en lugar de dejar que la API responda con un error 400.\n\n**El rol:** una mención (`@Rol`), su nombre exacto (con espacios, sin comillas: `{&cor} Le Gooby #FF00AA`) o su ID.\n\n_Color sólido: `{&cor} <rol> #FF00AA` o un nombre (`purple`)._\n_Volver al color por defecto: `{&cor} <rol> remove`._"
    }
  },
  "acesso": {
    "cargo": {
      "titulo": "access role",
      "texto": "Roles que cuentan como **staff**: usan los comandos de moderación aunque no tengan\nel permiso nativo de Stoat. Útil para dar poder de moderar sin entregar\npermisos reales del servidor.\n\n`{&acesso.cargo.add} <@rol|id>`\n`{&acesso.cargo.remove} <@rol|id>`\n`{&acesso.cargo.limpar}` — vuelve a valer solo el permiso nativo\n\n_No cubre **ManageServer**: la administración de verdad sigue exigiendo el_\n_permiso real. Configurarlo requiere ManagePermissions._"
    },
    "canal": {
      "titulo": "access channel",
      "texto": "Dónde funcionan los comandos, para que no ensucien los canales de charla.\n\n**Modos**\n`{&acesso.canal.todos}` — en cualquier canal (por defecto)\n`{&acesso.canal.somente}` — solo en los canales de la lista\n`{&acesso.canal.exceto}` — en todos menos los de la lista\n\n**La lista** _(sin #canal, usa el canal donde escribiste)_\n`{&acesso.canal.add} [#canal]`\n`{&acesso.canal.remove} [#canal]`\n`{&acesso.canal.limpar}`\n\n**Staff**\n`{&acesso.staffignora} on|off` — si el staff se salta la restricción\n\n**Un comando en cualquier canal**\n`{&acesso.livre} entertainment on` — los juegos funcionan fuera de los canales de comandos\n`{&acesso.livre} entertainment off` — vuelven a la regla · `{&acesso.livre}` los lista\n\n_En el modo `all` la lista sigue existiendo, pero no tiene efecto._"
    }
  },
  "reactionrole": {
    "exclusivo": {
      "titulo": "reactionrole exclusive",
      "texto": "Define si una persona puede acumular los roles de ese mensaje o si elegir uno\n**sustituye** al anterior.\n\n`{&reactionrole.exclusivo} <mensaje> on` — sustituye (color, edad, equipo)\n`{&reactionrole.exclusivo} <mensaje> off` — acumula (intereses, juegos)\n\nEn el modo exclusivo el bot también **quita la reacción antigua**, para que el panel\nrefleje la elección actual.\n\n_El mensaje puede ser su ID o su enlace. Debe tener ya reglas registradas._"
    },
    "recarregar": {
      "titulo": "reactionrole reload",
      "texto": "**El síntoma:** funcionaba, el bot se reinició y dejó de dar roles, pero\nlos emojis siguen ahí.\n\n**La causa:** la librería solo emite eventos de reacción de los mensajes que conoce.\nTras un reinicio, los mensajes antiguos no están en caché.\n\n`{&reactionrole.recarregar}` — vuelve a traer los mensajes a la caché\n\nEsto ya se ejecuta **solo en cada reinicio**; el comando existe para\ncuando quieras forzarlo, o para diagnosticar qué no se encontró.\n\n_Mensaje no encontrado = canal borrado, o al bot le falta \\`ViewChannel\\`/_\n_\\`ReadMessageHistory\\`._"
    }
  },
  "staff": {
    "equipe": {
      "titulo": "staff",
      "texto": "El **staff del servidor**, agrupado por rol, con quién tiene cada uno: el dueño, los roles marcados, el rol del equipo de tickets y los roles con permiso para moderar.\n\n**La lista no es un registro aparte.** Lee los mismos roles que\n`{&acesso.cargo}` usa para decidir quién puede moderar. Ascender con\n`{&staff.add}` es un ascenso de verdad; quitar aquí también quita el acceso.\nAsí el tablón nunca contradice el permiso real.\n\n**Comandos** _(cambiar requiere ManagePermissions; consultar es público)_\n`{&staff}` — muestra el equipo\n`{&staff.add} <@rol>` — marca el rol como staff\n`{&staff.remove} <@rol>` — lo desmarca\n`{&staff.titulo} <@rol> <texto>` — etiqueta en lugar del nombre del rol\n`{&staff.limpar}` — vacía la lista\n\n_El orden es el de inserción: el primer rol añadido aparece arriba._"
    }
  },
  "modia": {
    "criterios": {
      "titulo": "modia criteria",
      "texto": "Escribes **en lenguaje natural** lo que hay que moderar. No hay lista de\npalabras: Judy lee el mensaje y lo juzga según lo que describiste.\n\n`{&modia.criterios} <texto>`\n\n**Un buen ejemplo** _(concreto, y dice también lo que NO moderar)_\n```\n{&modia.criterios} Borra la publicidad de otros servidores, la venta de cuentas\ny los ataques personales directos. No moderes palabrotas leves ni discusiones acaloradas.\n```\n\n**Qué hace cuando encuentra algo:** borra el mensaje y menciona al dueño en el canal\nde registro con las opciones. **Nunca banea por su cuenta.**\n\n_Actívalo después de definirlo: `{&modia} on`. Requiere ManageServer._"
    }
  },
  "comando": {
    "gerenciar": {
      "titulo": "command disable/enable",
      "texto": "`{&comando}` — lista los comandos y el estado de cada uno\n`{&comando.desativar} <nombre>` — lo desactiva en este servidor\n`{&comando.ativar} <nombre>` — lo vuelve a activar\n\n**El seguro**\n`help` y `command` **no se pueden** desactivar: si no, te quedarías fuera,\nsin forma de volver atrás.\n\n_Es por servidor: desactivarlo aquí no afecta a los demás._\n_Usa el nombre canónico (el de la lista), no un alias._"
    }
  },
  "game": {
    "admin": {
      "titulo": "game admin",
      "texto": "**Solo el dueño del bot.** Herramientas para preparar y depurar el RPG.\n\n**Dar cosas a alguien** _(sin @usuario, es para ti)_\n`{&game.admin.dar} <cant> [@usuario]` — acredita moneda\n`{&game.admin.item} <nombre> [@usuario]` — entrega un ítem del catálogo\n`{&game.admin.follower} <nombre> [nivel] [@usuario]` — entrega un compañero\n`{&game.admin.pontos} <n> [@usuario]` — da puntos libres de atributo\n`{&game.admin.nivel} <n> [@usuario]` — fuerza el nivel del personaje\n\n**Desbloquear**\n`{&game.admin.energia} [@usuario]` — recarga la energía de los compañeros\n`{&game.admin} cooldown [@usuario]` — reinicia la espera de misión y la recuperación\n\n**Monedas del juego**\n`{&game.admin.moeda}` — crea y configura las monedas _(ver `{&help.game} currency`)_\n`{&game.admin.eco}` — los números de la economía: banco, P, tesoros de las mazmorras\n`{&game.admin.dungeon} <cant> [mazmorra]` — pone Oro en el tesoro de una mazmorra\n`{&game.admin.imagem} [id] [enlace]` — imágenes de personajes, jefes, especiales y mazmorras (adjunta la imagen; el enlace queda en la base de datos, no en el repositorio)\n\n**Probar sin romper nada**\n`{&game.admin.teste}` — crea un personaje de prueba y recorre todo el juego\n`{&game.admin.simular} <contract|boss> [n]` — lo ejecuta n veces, sin efecto real\n\n**Empezar de cero** _(requiere `confirm`)_\n`{&game.admin.reset.mundo.confirmar}` — borra el progreso de todos, en todos los servidores\n`{&game.admin.reset.catalogo.confirmar}` — borra el catálogo curado\n`{&game.admin.reset.tudo.confirmar}` — las dos cosas"
    },
    "moeda": {
      "titulo": "game admin moeda",
      "texto": "**Solo el dueño del bot.** El RPG es un único mundo con **dos** monedas fijas:\n♾️ `gold` — **infinita**: el dinero del día a día, sin techo\n🔒 `crystal` — **finita**: suministro fijo; cuando el banco se agota, solo circula entre jugadores\n\n`{&game.admin.moeda}` — las dos, con el saldo en carteras, banco y P\n`{&game.admin.moeda.ver} <id>` — ficha completa y cuánto rinde\n`{&game.admin.moeda} set <id> <campo> <valor>` — ajusta (varios: `campo=valor`)\n\n**Campos**\n`nome` · `simbolo` — cómo se muestra\n`dificuldade` — qué tan rara es en las misiones (y cuánto rinde)\n`nivelMin` — solo cae en misiones de ese nivel en adelante\n`market` — lo que el banco tiene ahora · `suprimentoBase` — el total de referencia\n\n_El tipo (finita o infinita) es fijo, y no se pueden crear ni borrar monedas._"
    },
    "mercado": {
      "titulo": "game mercado",
      "texto": "Comercio **entre jugadores**, con custodia: lo que publicas sale de tu cartera y\nse queda conmigo hasta que se cierre o lo canceles. Sin eso, se vuelve estafa.\n\n`{&game.mercado}` — lista las ofertas abiertas\n`{&game.mercado.vender} <ítem> <precio>` — publica un ítem tuyo\n`{&game.mercado.comprar} <#>` — cierra la oferta de alguien\n`{&game.mercado.cancelar} <#>` — retira la tuya y te la devuelve\n\n**Primos del mercado**\n`{&game.cambio}` — cambio de monedas _(ver `{&help.game} exchange`)_\n`{&game.trocar} [@usuario] <tu ítem> for <su ítem>` — trueque ítem por ítem\n`{&game.trocar.aceitar} <#>` — cierra un trueque que te propusieron\n\n_Toda venta paga una comisión al mercado; crece con el valor de la oferta._\n_Tienda del sistema (precio fijo, sin otro jugador): `{&game.comprar}` y `{&game.vender}`._"
    },
    "magia": {
      "titulo": "game magias",
      "texto": "La magia es lo que le da uso al atributo **Mana**. Antes solo venía\nde los compañeros; ahora puedes comprar la tuya y llevarla en el grimorio.\n\n`{&game.magias}` — el catálogo y lo que ya sabes\n`{&game.magia} <nombre>` — la ficha: coste, poder, precio en cada moneda\n`{&game.aprender} <nombre> [with <moneda>]` — compra el hechizo\n\n**El Mana es el límite, no la colección**\nLos hechizos entran del **más fuerte al más débil**, mientras dure el Mana. Aprender\ndiez no sirve si solo tienes Mana para dos — los demás quedan dormidos\n(💤 en la lista) hasta que subas el Mana.\n\n**Dos escuelas**\n🔥 **Ataque** — sube la probabilidad de cumplir la misión\n✨ **Apoyo** — sube la probabilidad de volver con vida\n\n**Comparte el mana con los compañeros**\nLos hechizos de compañero entran en la misma disputa. Un grupo de magos con poco Mana\ndesperdicia poder — conviene equilibrar.\n\n_Sin nivel mínimo: cada uno pide **Inteligencia ≥ 5 × dificultad − 4** (🔒 en la lista)._\n_El Carisma descuenta el precio, igual que al contratar un mercenario._"
    },
    "cambio": {
      "titulo": "game cambio",
      "texto": "Dos formas de cambiar moneda, y sirven para cosas distintas.\n\n**Cuánto vale en cada moneda**\n`{&game.cambio} <cant> <moneda>` — el valor en TODAS las demás\n   ej.: `{&game.cambio} 1 crystal`\n`{&game.cambio.taxas}` — la tabla completa, de cada una a cada una\n\n**Con el banco — al instante, sin depender de nadie**\n`{&game.cambio} <cant> <moneda> to <moneda>`\n   ej.: `{&game.cambio} 200 gold to crystal`\n   todo de una vez: `{&game.cambio.tudo} gold to crystal` (o sin la cantidad)\n\n**Con otro jugador — tú pones la tasa**\n`{&game.cambio} <cant> <moneda> for <cant> <moneda>`\n   ej.: `{&game.cambio} 100 gold for 2 crystal`\nEl monto sale de tu cartera y queda en custodia hasta que alguien acepte\no lo canceles con `{&game.mercado.cancelar} <#>`.\n\n**De dónde sale la tasa del banco**\nEs la proporción entre lo que el banco guarda de cada moneda. Quien cambia mucho\nen una dirección vacía ese lado y encarece el siguiente cambio —\nla tasa se mueve sola según juega el mundo.\n\n**Solo unidades enteras**\nLas monedas no se dividen. El banco entrega el máximo de unidades enteras\nque alcanzas a pagar y usa solo lo que cuestan — el resto se queda en tu\ncartera. Hoy, 1 Cristal cuesta unos 40 de Oro.\n\n**Por qué A→B→A no te hace rico**\nCada cambio cobra un spread. Ida y vuelta cuestan más de lo que la oscilación\ndevuelve, así que dar vueltas a la moneda solo quema saldo.\n\n_Las monedas finitas tienen existencias: si al banco no le alcanza, lo dice —\ny el mostrador entre jugadores sigue abierto._"
    },
    "missao": {
      "titulo": "game contratos",
      "texto": "`{&game.contratos}` — el tablón del gremio, con tu probabilidad en cada uno · `{&game.contratos} <1-10>` — otra dificultad\n`{&game.contrato} <nombre>` — parte · `{&game.bico} <nombre>` — un trabajo sin riesgo\n`{&game.dungeons}` · `{&game.chefes}` · `{&game.especiais}` · `{&game.historia}`\n\n**Quién paga**\n📜 **Contrato** — el gremio (el banco). 🕳️ **Mazmorra** — su propio tesoro, que se renueva con quien juega allí.\nToda victoria paga **Oro y Cristal**; un banco o tesoro lleno paga más, uno vacío, menos.\n\n**La probabilidad que importa**\nEl 🏆 que se muestra es `éxito × supervivencia`. Toda misión es justa en su propio nivel (40% / 70% para un grupo bien equipado).\n**Margen por fuerza:** con más fuerza de la que pide la misión, la probabilidad sube — con 3×, está garantizada. Nunca por nivel.\nRecolectar, entregar e investigar tienen **peligro bajo** (1/4 del riesgo).\n\n**La recompensa** — la fuerza de la misión, igual para todos (también en co-op).\nUn éxito en tu nivel vale **80% de un nivel**; fallar no paga nada.\n\n**Las esperas** — 45 min entre combates (10 en los trabajos); ~30 min si caes; 24 h por jefe; 2 h en una especial hasta el primer éxito.\n**En grupo:** `{&game} coop open <contrato>` — hasta 4 personas, un mismo desenlace para todos."
    },
    "follower": {
      "titulo": "game follower",
      "texto": "Los compañeros luchan contigo y pesan mucho en el grupo — de media, cada uno es un tercio de él.\n\n`{&game.followers}` — los tuyos, y quién está en el grupo\n`{&game.follower.ficha} <nombre>` — atributos, hechizo, ataque y defensa\n`{&game.follower.levar} <nombre>` — lo suma al grupo (máximo **2**)\n`{&game.follower.tirar} <nombre>` — lo devuelve a la reserva\n`{&game.follower.dispensar} <nombre>` — lo libera para siempre\n`{&game.follower.fotos} <nombre>` — su álbum\n\n**Suben contigo, sin ítems**\nEntran en tu nivel y suben contigo. No usan equipo: el kit de la clase ya está en su ganancia por nivel.\n\n**Energía** ⚡\nCada combate gasta 1. Vuelve sola (1 por hora) o toda de una vez\ncon `{&game.descansar.confirmar}`, pagando.\n\n**De dónde salen**\n`{&game.recrutas}` — todos los que existen en el juego\n`{&game.contratar} <nombre>` — mercenarios hasta raro (tu Carisma da descuento)\nBotín de contratos, mazmorras y jefes — los más raros solo así 🗝️\nCon nombre (✦): solo como **contrato**, de un jefe o una misión especial — `{&game.usar} <contrato>`. Uno de cada por jugador."
    },
    "dungeon": {
      "titulo": "game dungeon",
      "texto": "`{&game.dungeons}` — las mazmorras, sus niveles y cómo está el tesoro de cada una\n`{&game.dungeon} <nombre>` — un encuentro en tu nivel · `{&game.dungeon} <nombre> boss` — su jefe\n`{&game.dungeon}` — quién está atrapado ahora\n\n**Mundo abierto**\nCada mazmorra paga de **su propio tesoro**, que se renueva con quien juega allí — el único dinero nuevo del juego.\nEl 70% del botín es temático (la de Warhammer suelta armas de 40k). Quien cae deja parte de sus monedas en el tesoro.\n\n**Captura y rescate**\nSolo en mazmorras: si el grupo cae, cada compañero tiene un 20% de quedar atrapado **en esa** mazmorra.\nEl rescate es automático: cada regreso de esa mazmorra es un intento — ganar da la probabilidad completa; volver sin ganar, la mitad.\nEn las primeras horas **solo** el dueño puede rescatarlo; después, quien lo libere se queda con él."
    },
    "itens": {
      "titulo": "game itens",
      "texto": "`{&game.itens}` — tu mochila, agrupada por rareza\n`{&game.equipar} <ítem> [hand1|hand2]` — equipa (✅ marca lo que está en uso)\n`{&game.usar} <contrato|pergamino>` — se convierte en compañero o hechizo\n`{&game.desequipar} <ranura o ítem>` — lo quita y lo devuelve a la mochila\n`{&game.catalogo} [rareza] [tipo] [obra]` — separado por tipo (cuerpo a cuerpo, de fuego, mágica, escudo, foco, cabeza, armadura, accesorio, bioware, cyberware) · `{&game.item} <nombre>` — la ficha de un ítem\n\n**Las 13 ranuras**\nmao1 · mao2 · capacete · armadura · acessorio1-3 · bio1-3 · ciber1-3\n\n**Qué da cada cosa**\n⚔️ **Arma** — daño propio, que escala con los atributos (letras E a S); por debajo del requisito, rinde un 40%.\nUn arma sola en una mano, con la otra libre, va **a dos manos**: Fuerza ×1,5 y la mitad del requisito. Un **arma única** gana +80%.\n🛡️ **Escudo** (mano secundaria) — defensa y +10% de defensa. 🪖 Cabeza y 🛡️ cuerpo — defensa.\n💍 **Accesorio** — atributos. 🧬 **Bioware** y 🦾 **cyberware** — daño, defensa, refuerzo o atributos.\n\n_¿No sabes qué usar? `{&game.classe}` y `{&game.evoluir}` eligen por ti._"
    },
    "pontos": {
      "titulo": "game pontos",
      "texto": "`{&game.pontos} <atributo> [cuántos]` — reparte tus puntos libres\n\n**Atributos** _(acepto abreviaturas: for, des, res, agi, int, sor, car…)_\n⚔️ **Fuerza** — daño cuerpo a cuerpo; escala las armas de golpear\n🏃 **Destreza** — la precisión de todos; escala las armas de apuntar\n🛡 **Resistencia** · ❤️ **Vida** · 🌀 **Agilidad** — la defensa (y los requisitos de los implantes)\n🧠 **Inteligencia** — daño mágico, armas místicas, desbloquea hechizos y (con la Suerte) más puntos por nivel\n🍀 **Suerte** — defensa del grupo y más puntos por nivel\n✨ **Carisma** — fortalece a tus compañeros; descuento al contratar y mejor precio al vender\n_Con una clase elegida, `{&game.evoluir}` los reparte por ti._\n\n**Cómo se ganan puntos**\nSubiendo de nivel. Cuánto ganas por nivel depende de la Inteligencia y la Suerte —\ncon rendimiento decreciente, así que invertir en ellas siempre vale la pena.\n\n_Cada nivel también da una ganancia automática en **todos** los atributos._"
    }
  },
  "xp": {
    "sincronizar": {
      "titulo": "xp sincronizar",
      "texto": "**Cómo funcionan los roles de nivel**\n`{&xp.criarcargos}` crea un rol cada N niveles (el N viene de `{&xp.setup}`).\nAl alcanzar el nivel se gana el rol — y los anteriores **se mantienen**: se acumulan.\n\n**Quien sale pierde los roles**\nEs Stoat quien los quita: el rol es del MIEMBRO, y quien sale deja de serlo.\nEl **XP no se pierde** — queda guardado en la base de datos.\n\nPor eso existe `{&xp.sincronizar}`: devuelve todo lo que el nivel actual\nya garantiza. Sin él, alguien que volviera en el nivel 14 solo recuperaría\nsu rol al llegar al 15 — semanas después, con la sensación de haber perdido el progreso.\n\n`{&xp.sincronizar}` — revisa todo el servidor\n`{&xp.sincronizar} @usuario` — solo una persona\n\n_Desde ahora, quien **entra** recupera los roles automáticamente; el comando_\n_es para quienes ya habían vuelto antes, y para cuando creas los roles después_\n_de que la gente ya haya subido de nivel._\n\n**Si falla:** el rol del bot necesita **AssignRoles** y estar **por encima**\nde los roles de nivel en la lista."
    },
    "setup": {
      "titulo": "xp setup",
      "texto": "Asistente de configuración del sistema de niveles. **Requiere ManagePermissions.**\n\n`{&xp.setup}` — muestra la configuración actual\n`{&xp.setup.multiplicador} <1–5>` — dificultad de la curva (ej.: 1.5)\n`{&xp.setup.nivelmaximo} <5–1000>` — el tope\n`{&xp.setup.intervalo} <5|10>` — cada cuántos niveles llega un rol\n`{&xp.setup} xp <min> <max>` — cuánto paga cada mensaje\n`{&xp.setup} cooldown <segundos>` — intervalo mínimo entre ganancias\n`{&xp.setup.canal} <here|off>` — dónde anunciar las subidas de nivel\n`{&xp.setup.anuncio} <on|off>` — anunciar o no\n\n**El orden que funciona**\n1. `{&xp.setup}` y ajusta lo que quieras\n2. `{&xp.criarcargos}` — crea los roles de nivel\n3. `{&xp} on` — enciende el sistema\n\n_El XP viene solo de mensajes: Stoat no emite eventos de voz, así que no hay_\n_forma fiable de cronometrar las llamadas._"
    },
    "cargos": {
      "titulo": "xp cargos",
      "texto": "`{&xp.cargos}` — lista los roles de nivel ya configurados\n`{&xp.sincronizar}` — devuelve los roles a quien salió y volvió _(`{&help.xp} sync`)_\n`{&xp.criarcargos}` — los crea automáticamente, uno cada N niveles\n\n**Jerarquía**\nStoat solo deja que el bot dé roles que están **por debajo** del suyo, a quien\ntambién está por debajo de él (el staff, normalmente por encima, se queda sin ellos). Un rol de\nnivel por encima del bot aparece con ⚠️ en `{&xp.cargos}`.\n\n_El bot necesita **ManageRole**, y su rol debe estar por encima de los que crea._"
    }
  },
  "chat": {
    "livre": {
      "titulo": "chat livre",
      "texto": "Hace que Judy participe en el canal **sin necesidad de mención**.\n\n`{&chat.livre} on` — lo activa en este canal\n`{&chat.livre} off` — lo desactiva\n`{&chat.livre.modo.relevante}` — solo responde lo que considere importante\n`{&chat.livre.modo.todas}` — responde todos los mensajes\n\n**Cuándo entra sin que la llamen** _(modo relevante)_\n• nunca en un mensaje para **otra persona**: una respuesta a alguien, una @mención a alguien, \"gracias, Fulano\";\n• nunca en una reacción suelta (\"jajaja\", \"qué\", \"uf\");\n• solo en una **pregunta al grupo** o una **foto mostrada al grupo** — y aun así pasa por un juez que, en la duda, no entra;\n• como máximo una entrada sin invitación cada 5 min por canal, y 4 por hora.\nQuien la llama por su nombre o responde a uno de sus mensajes siempre recibe respuesta; mientras la conversación con ella sigue, ella continúa — pero no responde lo que esa persona les dice a los demás.\n\n_Una conversación a la vez: mientras responde a alguien, los demás esperan._\n_Requiere ManagePermissions._"
    },
    "memoria": {
      "titulo": "chat esquecer / perfil",
      "texto": "Judy solo guarda datos de quien **aceptó** que los recuerde: lo pregunta en tu primera conversación, y la respuesta vale en todos los servidores.\n`{&privacidade}` — lo que guarda sobre ti, y activa/desactiva la memoria\n\n`{&chat.perfil}` — lo que sabe de ti\n`{&chat.mapear}` — captura la bio/estado de tu tarjeta de perfil\n`{&chat.esquecer}` — borra todo sobre **ti**\n`{&chat.esquecer.tudo}` — borra la memoria de todo el servidor _(ManageServer)_\n`{&chat.cuidado} [@usuario] on|off` — trato amable, sin ironía ácida\n\n_Cualquiera puede activar `care` para sí mismo; para otra persona requiere ManagePermissions._"
    },
    "comentar": {
      "titulo": "chat comentar",
      "texto": "Judy suelta comentarios **por iniciativa propia** sobre la conversación en curso —\nsolo en el canal elegido, y con frenos para que no se vuelva spam.\n\n`{&chat.comentar.aqui}` — lo activa en este canal\n`{&chat.comentar} off` — lo desactiva\n`{&chat.comentar.pordia} <1–20>` — tope diario (4 por defecto)\n`{&chat.comentar.status}` — cómo está ahora\n\n_No saca temas de la nada: solo comenta lo que ya está pasando._"
    }
  },
  "servidor": {
    "regras": {
      "titulo": "servidor reglas",
      "texto": "Las **reglas del servidor**, estén donde estén:\n1. el texto que defina el staff — gana sobre todo;\n2. el canal indicado con `rules channel`;\n3. por sí sola: el canal llamado **rules**/**regras** (sus mensajes, en el orden en que se escribieron).\n\n`{&servidor.regras}` — las muestra (y dice de dónde salieron)\n`{&servidor.regras} set <texto>` — texto propio, puede tener varias líneas *(ManagePermissions)*\n`{&servidor.regras} channel #canal` · `auto` — de qué canal leer *(ManagePermissions)*\n`{&servidor.regras} clear` — borra el texto y vuelve al canal *(ManagePermissions)*\n\n_Judy usa las mismas reglas cuando alguien pregunta \"¿cuáles son las reglas?\". Para leer el canal necesita **ViewChannel** y **ReadMessageHistory** en él._"
    },
    "faq": {
      "titulo": "servidor faq",
      "texto": "**Avisos y preguntas frecuentes** que registra el staff (hasta 25). Judy los usa al responder sobre el servidor.\n\n`{&servidor} faq` — la lista · `{&servidor} faq 2` — un elemento completo\n`{&servidor} faq add ¿Cómo subo de nivel? | Charlando: cada mensaje da XP.` *(ManagePermissions)*\n`{&servidor} faq remove 2` · `{&servidor} faq clear` *(ManagePermissions)*"
    }
  },
  "fuso": {
    "cidades": {
      "titulo": "fuso (husos horarios)",
      "texto": "Un reloj del servidor que muestra **varias ciudades a la vez** — para cuando la gente\nestá repartida y cada plan se convierte en una cuenta mental.\n\n**Consultar** _(cualquiera)_\n`{&fuso}` — la hora actual en cada ciudad de la lista\n`{&fuso.ver} <ciudad>` — la hora de cualquier ciudad, sin configurar nada\n`{&fuso.buscar} <término>` — busca ciudades disponibles\n`{&fuso} <ciudad>` — atajo de `now`\n\n**Configurar** _(ManageMessages)_\n`{&fuso.add} <ciudad>` · `{&fuso.remove} <ciudad>`\n`{&fuso.apelido} <ciudad> <texto>` — ej.: Madrid mostrándose como \"Europa\"\n`{&fuso.principal} <ciudad>` — desde qué ciudad se cuentan las diferencias\n`{&fuso.formato} <12|24>` · `{&fuso.limpar}`\n\n**Cómo escribir la ciudad**\nLas tildes funcionan (`São Paulo`), el formato `Ciudad/País` también\n(`Madrid/Europa`), y hay apodos incorporados: `sp`, `nova york`,\n`toquio`, `londres`, `utc`. Si hay empate, el bot te muestra las opciones.\n\n_La lista va del huso más atrasado al más adelantado — como el ojo_\n_espera leer un reloj mundial. El límite es de 12 ciudades._"
    }
  },
  "embed": {
    "campos": {
      "titulo": "embed (campos)",
      "texto": "Un campo por línea, en el formato `campo: valor`. Sin paréntesis alrededor y\nsin coma al final — los dos errores más comunes (y tolero ambos).\n\n**Campos**\n`title:` — el título\n`description:` — el cuerpo; puede ocupar varias líneas\n`color:` — hex `#RRGGBB` o un nombre (`purple`, `green`…)\n`footer:` — una línea en cursiva al final\n`image:` — URL de la imagen de portada\n`channel:` — un ID, para publicar en **otro** canal\n\n**También acepto**\n• las claves en portugués\n• todo en una sola línea, separado con `|`\n• `\\n` dentro de un valor, para un salto de línea\n\n_Si algo se ignora, lo envío y te aviso de lo que no entendí — en vez de fallar en silencio._"
    }
  },
  "rss": {
    "feeds": {
      "titulo": "rss add/remove",
      "texto": "`{&rss.add} <url>` — valida el feed y lo registra\n`{&rss.list}` — los feeds con sus IDs\n`{&rss.remove} <id|url>` — quita uno\n\n**Al añadir**, todo lo que ya está en el feed se marca como visto — solo recibes\nlo que salga **a partir de entonces**. Sin eso, el primer ciclo volcaría todo\nel historial en el canal.\n\n**El ciclo**\n`{&rss.canal.aqui}` — dónde publicar (obligatorio)\n`{&rss.agora}` — fuerza un ciclo inmediato\nAutomático cada hora, con un tope de elementos por ciclo.\n\n_Donde la IA está activada, Judy escribe un resumen antes de la lista._​[ia]"
    }
  },
  "personalidade": {
    "prompt": {
      "titulo": "personalidad",
      "texto": "El **prompt de personalidad** de la IA, configurable por servidor.\n\n`{&personalidade}` — muestra el actual (personalizado o por defecto)\n`{&personalidade.definir} <texto>` — define el prompt de este servidor\n`{&personalidade.resetar}` — vuelve al predeterminado integrado\n\n_Requiere ManageServer. El texto reemplaza solo la PERSONALIDAD; las reglas de_\n_seguridad, formato e idioma siguen vigentes. Máx. 2000 caracteres._"
    }
  },
  "banglobal": {
    "varrer": {
      "titulo": "banglobal varrer",
      "texto": "El ban global actúa cuando alguien **entra**. Quien ya estaba aquí cuando lo banearon\nen otro servidor pasaba desapercibido — el barrido cierra ese punto ciego.\n\n**Dos comandos, a propósito**\n`{&banglobal.revisar}` — **solo muestra** quién está en la lista. Nunca banea a nadie.\n`{&banglobal.varrer}` — muestra la lista y **espera tu confirmación**\n`{&banglobal.varrer.confirmar}` — ⚠️ banea de verdad\n\n_Antes, `review` era un alias de `sweep`, y `sweep` baneaba directamente: una_\n_palabra que significa \"revisar\" ejecutaba la acción irreversible. Eso ya causó_\n_bans por error, y por eso ahora son comandos separados._\n\n**El barrido solo banea en los modos `instant` y `consensus`**\nEn `consensus`, solo a quien tiene 3+ servidores distintos; el resto aparece aparte.\nEn `off` y `warn` se niega y te remite a la revisión.\n\n**Si algo sale mal**\n`{&banglobal.desfazer} [@usuario]` — revierte los bans que LA LISTA aplicó aquí (todos, o solo el de una persona) y exime a quien volvió\n`{&banglobal.isentar} <@usuario>` — salva a alguien ANTES de confirmar\n\n_El bot necesita ver a los miembros y tener **BanMembers**, con su rol_\n_por encima del de la persona. Los fallos aparecen al final del informe._"
    },
    "pessoas": {
      "titulo": "banglobal pessoas",
      "texto": "**Cómo señalar a alguien** — todo comando de `banglobal` acepta:\n\n• **mención** — `@alguien` (la más segura: hiciste clic en ella)\n• **ID** — `01ARZ3NDEKTSV4RRFFQ69G5FAV`\n• **enlace del perfil** — lo que copie el cliente\n• **nombre** — `Renan`, sin distinguir mayúsculas\n• **nombre con tag** — `AutoMod#0800`, como aparece en el perfil\n• **apodo en el servidor**\n\nLa búsqueda pasa por los **miembros**, los **baneados** del servidor y la\n**propia lista global** — por eso funciona con quien ya se fue, que es\njusto de quien suelen ocuparse estos comandos.\n\n**Un nombre ambiguo no se convierte en una apuesta**\nSi `Ren` coincide con Renan y Renata, muestro a los dos con sus IDs y no hago\nnada. Banear a la persona equivocada por un apodo parecido no es algo\nque se arregle pidiendo perdón.\n\n**Si no está en ningún servidor en común**, solo funciona el ID —\ny aparece en `{&banglobal.lista}`."
    },
    "bots": {
      "titulo": "banglobal bots",
      "texto": "**Los bots no entran en la lista global.**\n\nUn bot no elige entrar en ningún sitio: alguien lo añade. Si lo banearon en\nun servidor, es asunto suyo y de quien lo añadió allí — no es un\nhistorial de comportamiento que valga la pena llevar a otros servidores.\n\nPeor: los bots populares acaban baneados en algún sitio tarde o temprano. La lista\nse llenaría justo de los más usados, y el modo `ban` empezaría a\ntumbar integraciones que el dueño del servidor acaba de instalar.\n\n**Lo que entró antes sigue ahí**\n`{&banglobal.bots}` — muestra los bots que siguen en la lista\n`{&banglobal.bots.confirmar}` — los quita todos\n\n_A partir de ahora no entran: ni por la importación, ni por un ban_\n_manual, ni por el automod. Y un bot que entra en un servidor nunca es_\n_baneado por la lista, aunque esté en ella._"
    },
    "isentar": {
      "titulo": "banglobal isentar",
      "texto": "La lista global se forma con el criterio de moderación de **otros** servidores.\nA veces no es el tuyo: a alguien lo banearon en un servidor de juegos por\ndiscutir y, aquí, es bienvenido.\n\n`{&banglobal.isentar} <@usuario|id>` — acepta a esa persona **en este servidor**\n`{&banglobal.isentos}` — quién está exento aquí\n`{&banglobal.isentar.remover} <@usuario>` — hace que la lista vuelva a aplicarse\n\n**Qué hace la exención**\n• entra y se queda, aunque esté en la lista\n• el barrido pasa de largo\n• si el bot ya la había baneado por la lista, ese ban se **deshace** al momento\n\n**Eximir ≠ olvidar**\n`exempt` vale **solo aquí** y no toca los registros de otros servidores.\n`{&banglobal.esquecer}` _(solo el dueño del bot)_ borra el registro **para todos** — úsalo cuando el\nban en sí no se sostiene, no cuando simplemente no estás de acuerdo.\n\n_Desbanear quita el bloqueo, no trae a nadie de vuelta: envía una invitación nueva._"
    },
    "lista": {
      "titulo": "banglobal lista",
      "texto": "`{&banglobal.lista}` — todos los que están en la lista global, en páginas (reacciona ◀ ▶)\n`{&banglobal.lista.servidor}` — solo los que baneó **este** servidor\n\nCada línea muestra en cuántos servidores banearon a esa persona y cuándo fue la\núltima vez. El 🛡️ marca a quien está **exento** aquí.\n\nPara ver un caso en detalle: `{&banglobal.historico} <@usuario>` — los servidores, los\nmotivos y el origen de cada registro."
    },
    "contribuicao": {
      "titulo": "banglobal contribución",
      "texto": "**Todo servidor donde está el bot alimenta la lista. Siempre.**\nNo hay comando para activar, desactivar ni importar a mano.\n\n**Lo que entra solo**\n• Bans **nuevos** — en el momento en que ocurren (automod o `{&ban}`).\n• Bans **antiguos** — sincronizados ~1 min después de que arranca el bot y cada 6h.\n• Un servidor **nuevo** — su historial entra en cuanto se añade el bot.\n\n**Lo que sigue siendo tu elección**\n`{&banglobal} <off|warn|instant|consensus>` — si ESTE servidor se beneficia de la lista.\n`instant` banea con **un** ban en otro servidor; `consensus` solo con **3+ servidores distintos** (por debajo de eso, avisa al staff). Los bans que aplicó la propia lista no cuentan para el consenso.\nPuedes no usar la lista; no puedes usarla sin alimentarla.\n\n**Poner a alguien en la lista a mano**\n`{&banglobal} add <id> [id…] [motivo]` — **solo el dueño del bot**: entra **por ID**, aunque no esté en ningún servidor de Judy (la cuenta se comprueba con Stoat; los bots y los IDs inexistentes quedan fuera). Quien ya esté en un servidor de Judy lo nota al momento\n\n**Si un registro no se sostiene**\n`{&banglobal.esquecer} <@usuario|id|nombre> [nota]` — **solo el dueño del bot**: lo quita de la lista de **todos** los servidores y **lo mantiene fuera** (los bans futuros no lo traen de vuelta)\n`{&banglobal.ignorados}` — quién está fuera · `{&banglobal.lembrar} <@usuario>` lo deshace\n`{&banglobal.historico} <@usuario|id>` — dónde y por qué lo banearon\n\n_Los registros que ya existen no se duplican._\n_Piénsalo antes de añadir el bot al servidor de otra persona: su criterio de moderación pasa a ser el tuyo._"
    }
  },
  "entretenimento": {
    "ship": {
      "titulo": "entretenimento ship",
      "texto": "Cuántos **%** combinan dos personas (o dos cosas), con una barra de corazones, un veredicto y el **nombre de la pareja** (la mitad de un nombre + la mitad del otro).\n\n`{&entretenimento} ship @Ana @Bia` — esas dos\n`{&entretenimento} ship @Ana` — tú y Ana\n`{&entretenimento} ship pizza and pineapple` — las cosas también valen (separa con `and`, `x` o `|`)\n\n_La misma pareja da **siempre** el mismo %, en cualquier orden — puedes discutir el resultado, no repetirlo hasta que salga 100%._"
    },
    "briga": {
      "titulo": "entretenimento fight",
      "texto": "**Quién gana una pelea.** Cada lado empieza con 100 de vida y se turnan hasta que alguien cae (o pasan 8 rondas — entonces gana quien tenga más vida).\n\n👊 golpe normal (10–35) · 💥 **crítico** (daño doble) · 💨 fallo (a veces se tropiezan solos)\n\n`{&entretenimento.briga} @Ana @Bia` · `{&entretenimento.briga} @Ana` (tú contra Ana)\n`{&entretenimento.briga} Goku x Superman` — personajes y cosas también\n\n_A diferencia del ship, cada pelea es una pelea nueva: la revancha existe._"
    },
    "cowsay": {
      "titulo": "entretenimento cowsay",
      "texto": "Un **bicho en ASCII** diciendo tu texto en un globo — el clásico juguete de terminal.\n\n`{&entretenimento} cowsay ¡Muu!` — habla la vaca\n`{&entretenimento} cowsay cat hola` — elige el bicho: `cow`, `penguin`, `cat`, `dragon`, `robot`, `ghost`\n`{&entretenimento} cowsay think mmm` — un globo de **pensamiento** en vez de habla\n`{&entretenimento} cowsay figures` — lista los bichos\n\n_Hasta 300 caracteres; el globo corta las líneas solo._"
    },
    "bola8": {
      "titulo": "entretenimento 8ball",
      "texto": "La **bola 8 mágica**: haz una pregunta de sí o no y responde — a veces sí, a veces no, a veces \"pregunta más tarde\".\n\n`{&entretenimento.bola8} ¿lloverá mañana?`"
    },
    "escolher": {
      "titulo": "entretenimento choose",
      "texto": "**Elige por ti** entre dos o más opciones (hasta 20).\n\n`{&entretenimento.escolher} pizza | hamburguesa | sushi`\n`{&entretenimento.escolher} pizza, sushi or lasaña`"
    },
    "nota": {
      "titulo": "entretenimento rate",
      "texto": "**Una nota de 0 a 10** para cualquier cosa — una película, una comida, una persona — con estrellas y un comentario.\n\n`{&entretenimento.nota} lasaña` · `{&entretenimento.nota} @Ana`\n\n_La misma cosa recibe siempre la misma nota (las mayúsculas y los acentos no cambian nada)._"
    },
    "sorte": {
      "titulo": "entretenimento fortune",
      "texto": "**Tu suerte de hoy**, como una galleta de la fortuna, con un número de la suerte.\n\n`{&entretenimento.sorte}`\n\n_Cada persona tiene la suya, y es la misma todo el día — cambia a medianoche (UTC)._"
    },
    "zoeira": {
      "titulo": "entretenimento mock",
      "texto": "Devuelve el texto **aLtErNaNdO** mayúsculas y minúsculas — la forma clásica de repetir a alguien con burla.\n\n`{&entretenimento.zoeira} nunca me equivoco`"
    },
    "inverter": {
      "titulo": "entretenimento reverse",
      "texto": "Devuelve el texto **al revés** (los emojis compuestos quedan enteros).\n\n`{&entretenimento.inverter} anita lava la tina`"
    },
    "campominado": {
      "titulo": "entretenimento minesweeper",
      "texto": "Un **buscaminas** hecho de spoilers: cada casilla se abre con un clic. Si sale 💣, pierdes.\nLos números dicen cuántas minas hay alrededor; la casilla que ya viene abierta es un comienzo seguro.\n\n`{&entretenimento.campominado}` — medio: 8×8, 10 minas\n`{&entretenimento.campominado} easy` — 6×6, 5 minas\n`{&entretenimento.campominado} hard` — 10×10, 18 minas\n\n_Fuera de los canales de comandos, solo si el staff lo permite: `{&acesso.livre} entertainment on`._"
    },
    "velha": {
      "titulo": "entretenimento tictactoe",
      "texto": "**Tres en raya** por reacción: reacciona con el número de la casilla (1️⃣–9️⃣) en tu turno.\nQuien lo inició empieza, con ❌.\n\n`{&entretenimento.velha} @Ana` — contra Ana\n`{&entretenimento.velha}` — contra mí (juego bien, pero puedes ganar)\n\n_La partida termina sola tras 10 minutos sin jugadas._"
    }
  },
  "tts": {
    "filtro": {
      "titulo": "tts filtro",
      "texto": "La **criba** existe porque la transmisión automática lee todo lo que se escribe — y un muro de `Lalalala…` de 2000 caracteres se convierte en 40 segundos de voz ocupando toda la llamada.\n\n**Qué ignora** _(la forma, nunca el contenido)_\n• letra repetida: `renaaaaaaaaato`\n• bloque repetido: `lalalala`, `wiwiwiwi`\n• pocos caracteres distintos: `9?99?999?9999?`\n• solo puntuación o emoji · un único carácter\n• muro de texto (más de 600 caracteres)\n\n_La risa pasa a propósito: `kkkk`, `rsrs`, `hahaha`._\n\n**El tope por canal**\nPor encima de `{&tts.filtro.porminuto}` lecturas por minuto (6 por defecto), el canal se calla durante 45s. Es el freno COLECTIVO: `{&tts.cooldown}` es por persona, y cinco personas escribiendo a la vez lo superan sin esfuerzo.\n\n**Comandos**\n`{&tts.filtro}` — estado y qué se está ignorando\n`{&tts.filtro.teste} <texto>` — ¿se leería esa frase? ¿por qué?\n`{&tts.filtro} on|off` — la activa o desactiva *(ManageMessages)*\n`{&tts.filtro.porminuto} <n>` — ajusta el tope *(ManageMessages)*\n\n_`{&tts} <texto>` NO pasa por la criba: una petición explícita siempre se lee._"
    },
    "problemas": {
      "titulo": "tts problemas",
      "texto": "**\"Ya no puedo entrar en la llamada\"**\nEntrar en una llamada son **dos pasos** que fallan con el mismo síntoma y piden remedios opuestos:\n**1. HTTP** — Stoat autoriza y devuelve la dirección de LiveKit\n**2. WebRTC** — el servicio se conecta ahí y publica el audio\n\n`{&tts.diagnostico}` los ejecuta por separado y da un veredicto:\n• se atasca en el **1** con `AlreadyConnected` → Stoat tiene registrado que ya estoy en una llamada y rechaza la entrada. No es permiso ni red: es un registro atascado de su lado.\n   `{&entrar}` lo resuelve solo: entra por otra llamada del servidor (saltándose las que también estén atascadas) y se mueve a la atascada — el mover de Stoat emite un token sin comprobar el registro. `{&tts.resgatar} #llamada` hace lo mismo eligiendo la auxiliar a mano. (Expulsar no ayuda: lee la misma clave que destravar.)\n• se atasca en el **1** de otra forma → el token, o el permiso (**Connect**/**Speak**), o un canal que no existe\n• se atasca en el **2** → la red de la máquina del servicio: UDP de salida, MTU de Tailscale, firewall\n• pasa los dos y aun así no entra → es el **UDP**, que la prueba no cubre\n\nSi se acaba de atascar, `{&tts.reiniciar}` tira las salas fantasma y rehace la conexión. Si ni `{&tts.estado}` responde, el servicio está caído — eso necesita una mano en la máquina.\n\n**\"Entra pero nadie la oye\"**\nEl rol del bot necesita **Connect** y **Speak** en el canal de voz. El permiso del canal gana al del rol.\n\n**\"Volvió sola después de decirle que saliera\"**\nYa no: la transmisión automática no reconecta el bot. Solo `{&entrar}` la trae de vuelta.\n\n**\"No para de decir tonterías\"**\n`{&sair}` la corta al momento · `{&tts.filtro}` muestra la criba · `{&tts.cooldown} <s>` frena a quien escribe demasiado."
    }
  },
  "boasvindas": {
    "mensagens": {
      "titulo": "welcome / goodbye",
      "texto": "Embeds que se publican cuando alguien **entra** (`{&boasvindas}`) o **sale**\n(`{&adeus}`) del servidor. Los dos tienen exactamente las mismas opciones.\n\n**Configurar**\n`{&boasvindas.canal.aqui}` — dónde publicar _(ya lo activa)_\n`{&boasvindas.titulo} <texto>` · `{&boasvindas.texto} <descripción>`\n`{&boasvindas.cor} <color>` · `{&boasvindas.imagem} <url|clear>`\n`{&boasvindas.testar}` — publica usándote de ejemplo\n`{&boasvindas.padrao}` — vuelve al texto de fábrica\n`{&boasvindas} on|off` — activa/desactiva sin perder lo que escribiste\n\n**Marcadores**\n`{usuario}` — mención clicable · `{nombre}` — solo el nombre\n`{servidor}` — nombre del servidor · `{miembros}` — total de miembros\n\n_En la despedida `{usuario}` se convierte en el **nombre**, no en mención: quien salió_\n_ya no está en el servidor y la mención aparecería como un ID en bruto._\n\n_El texto acepta varias líneas; `\\n` también se convierte en salto de línea._\n\n**Sobre la imagen**\nHay **dos resultados distintos**, según de dónde venga el enlace:\n• **Adjunto de Stoat** → la imagen se convierte en la **portada del embed**. Es lo mejor.\n• **Enlace externo** → aparece como **vista previa debajo** del embed.\n  _(El campo de portada de Stoat solo acepta sus propios adjuntos, no URLs externas.)_\n  La URL va enmascarada, así que **no queda un enlace enorme en pantalla**.\n  Si la imagen no aparece: `{&boasvindas.imagem.visivel}` devuelve la URL en bruto.\n\nLo recomendado es **subir el archivo aquí en Stoat y usar el enlace del\nadjunto**: así la imagen vive en la infraestructura de Stoat, no se pierde, y nadie\nde fuera se entera de quién vio el mensaje.\n\nUn enlace de un sitio de terceros funciona, pero el dueño de ese sitio **ve la IP de cada\npersona que carga el mensaje** — en una bienvenida, la de todo el que entra.\nTiene que ser el enlace del **archivo** (`.png`, `.jpg`, `.gif`, `.webp`); un enlace de\nresultado de búsqueda (Brave, Google, Bing) es una miniatura temporal y suele fallar.\n\n_Las direcciones de red interna (`localhost`, `192.168.x`, el `100.x` de Tailscale, puertos\nfuera de 80/443) se **rechazan**: guardarlas crearía un atajo hacia la red de la\nmáquina del bot. El bot nunca descarga la imagen — solo pasa el enlace._\nSi la imagen falla al enviarse, el mensaje sale igual — solo que sin portada."
    }
  },
  "servidores": {
    "relatorio": {
      "titulo": "servidores relatorio",
      "texto": "**Informe por hora** — un resumen de todos los servidores donde está Judy, a cada hora en punto (UTC), en el canal que elijas.\n\n**Actívalo y elige el canal**\n`{&servidores.relatorio.canal} <#canal|here>` — fija el canal y lo activa\n`{&servidores.relatorio} on|off` — lo activa o desactiva, conservando el canal\n`{&servidores.relatorio.agora}` — genera ahora mismo el informe de la última hora\n`{&servidores.relatorio}` — muestra la configuración actual\n\n**Qué incluye**\n• todo lo que registró el log de moderación (bans, castigos, entradas y salidas)\n• raids, imágenes sospechosas (quién y dónde) y cambios de rol\n• reinicios del bot **con la causa**: deploy/restart, watchdog o caída sin aviso\n• errores agrupados por patrón, con **en cuántas de las últimas 24 h** apareció cada uno\n\n**Horas vacías**\n`{&servidores.relatorio.vazias} on|off` — `off` se salta las horas sin eventos\n\n**Temas más comentados** _(privacidad)_\nSolo de los servidores de los que **eres dueño** (con `RELATORIO_SERVIDOR` en el `.env`: ese siempre, más los tuyos que añadas a la lista).\n**Los demás servidores** solo aparecen si se apuntan (`{&log.relatorio} on`), y **de forma anónima**: un código en vez del nombre, y solo bans, castigos, raids e imágenes sospechosas, sin nombres ni IDs. Los que no se apuntaron no aparecen — ni siquiera como números.\n`{&servidores.relatorio.assuntos}` — lista los servidores permitidos\n`{&servidores.relatorio.assuntos} add <id> [id…]` — permite uno o varios de los tuyos (con espacio o coma)\n`{&servidores.relatorio.assuntos} remove <id> [id…]` — los quita de la lista\nUn servidor solo recibe temas si tiene **muestras de conversación** de esa hora — nunca a partir de su nombre.\n\n**Reparto del trabajo:** los números salen del código; el modelo solo escribe Destacados, Temas y la lectura de los Errores. Si el modelo falla, el informe sale solo con los números."
    }
  },
  "debug": {
    "ler": {
      "titulo": "debug ler",
      "texto": "**Cómo leer el diagnóstico**\n🔴 **problema** — algo en uso que no funciona. Aparece arriba, en \"Resuelve esto primero\", con qué hacer\n🟡 **aviso** — funciona, pero vale la pena mirarlo (canal sin permisos completos, sin canal de log…)\n🟢 **ok** · ▫️ **info**\n\n**Qué comprueba**\n• los permisos del bot, ligados a lo que está en uso (que falte TimeoutMembers solo es 🔴 si la escalera silencia)\n• la jerarquía: roles que entrega el bot (automáticos, de nivel, de reacción) por encima de él o borrados\n• los canales configurados (log, bienvenida, RSS, tickets…): si existen y si el bot puede escribir en ellos\n• todos los canales: dónde el bot no puede ver o no puede responder\n• voz, música e IA, en los servidores donde están activadas\n\n`{&debug} @usuario` — qué puede hacer el bot con esa persona: castigar, silenciar, dar roles de nivel\n`{&debug} #canal` — la cuenta de permisos en ese canal, rol por rol. En Stoat, el permiso del **canal** gana al del rol.\n\n_Cuando el silencio falla, el castigo pasa a cuarentena: se borra todo lo que la persona envíe durante 30 min._"
    }
  },
  "tutorial": {
    "areas": {
      "titulo": "tutorial <área>",
      "texto": "El tutorial está dividido por temas — cada uno explica el camino, no solo el comando.\n\n`{&tutorial}` — la guía de 6 páginas (reacciona ◀ ▶, o `{&tutorial} 3`)\n\n**Preparar el servidor**\n`{&tutorial.permissoes}` · `{&tutorial} ids` (menciones e IDs) · `{&tutorial.canais}` (los 3 tipos) · `{&tutorial.moderacao}` · `{&tutorial} logs`\n`{&tutorial.cargos}` · `{&tutorial.mensagens}` · `{&tutorial.ajustes}`\n\n**Juego y comunidad**\n`{&tutorial} xp` · `{&tutorial} game` (la wiki del RPG)\n`{&tutorial} rpg` · `{&tutorial.aventura}`\n`{&tutorial.noticias}`\n`{&tutorial.ia}` — Judy​[ia]\n\n_También acepto los nombres en inglés (`moderation`, `roles`, `levels`…)._\n_Para la referencia escueta de un comando, usa `{&help} <comando>`._"
    }
  },
  "log": {
    "eventos": {
      "titulo": "log <evento>",
      "texto": "Cada categoría se activa y desactiva por separado: `{&log} <evento> <on|off>`.\n\n`punishments` — advertencias, silencios y bans (automod y manuales)\n`members` — entradas y salidas del servidor\n`messages` — mensajes borrados y editados\n`roles` — roles creados y roles dados a alguien\n`commands` — intentos de uso de comandos\n\n**Ejemplo**\n`{&log.mensagens.off}` — deja de registrar ediciones/borrados\n\n_Todas empiezan activadas. Fija el canal con `{&log.canal.here}` (o una mención, enlace, ID, nombre)._\n_Los registros en el canal de log salen siempre en portugués._"
    }
  }
};

// os grupos do índice: { grupo: { titulo, resumo, linhas: [...] } }
export const GRUPOS_ES = {
  "comecar": {
    "titulo": "Primeros pasos",
    "resumo": "¿acabas de añadir el bot? empieza aquí",
    "linhas": [
      "**Los tres primeros comandos**",
      "`{&assistente}` — ⭐ configuración **guiada**: el bot pregunta, tú respondes, listo",
      "`{&assistente.servidor}` — 🏗️ ¿servidor nuevo? crea canales y roles con los permisos listos",
      "`{&tutorial}` — guía por páginas: permisos, canales, protección, bienvenida…",
      "`{&config}` — resumen de todo lo configurado en este servidor",
      "",
      "**La regla de oro de los canales**",
      "Los permisos **del canal** mandan sobre los **del rol**. Si el canal lo niega, el rol no lo salva.",
      "Mira los 3 tipos de canal en `{&tutorial.canais}`: resuelve el 80% de los \"¿por qué no funciona?\".",
      "",
      "**Del día a día**",
      "`{&idioma} pt|en|es` — el idioma del bot en este servidor *(ManagePermissions)*",
      "`{&staff}` — quién es el equipo · `{&servidor}` — reglas, canales, roles y FAQ",
      "`{&userinfo} [@usuario]` — ID, fecha de entrada y roles",
      "`{&sobre}` · `{&ping}` — información y latencia del bot",
      "`{&repete} <texto>` — el bot lo repite (anuncios rápidos)"
    ]
  },
  "proteger": {
    "titulo": "Proteger",
    "resumo": "spam, estafas, enlaces, raids y castigos",
    "linhas": [
      "**Automático** *(ManagePermissions)*",
      "`{&automod}` — los 4 grupos: antispam, antinoise, antilink, sentinel",
      "`{&automod} antispam off` · `{&automod} off` — un grupo · todo _(empieza desactivado)_",
      "`{&automod.sentinela}` — lo que **juzga** el contenido (estafas, NSFW, odio, imágenes, temas, avatares)",
      "`{&automod.punicao} mode <warn|delete|confirm|stack|ban>` — qué les pasa a los infractores",
      "`{&automod.punicao} ladder` — los peldaños del modo `stack` (advertencia → silencio → ban)",
      "`{&banglobal} <off|warn|instant|consensus>` — gente baneada en otros servidores *(BanMembers)*",
      "`{&automod} whitelist` · `{&automod} blocklist` — invitaciones permitidas · dominios prohibidos",
      "`{&modia}` — moderación por IA con criterios en texto libre *(ManageServer)*​[mia]",
      "",
      "**Manual**",
      "`{&warn} @usuario [motivo]` — advertencia (cuenta en la escalera) *(ManageMessages)*",
      "`{&warn.lista} [@usuario]` · `{&warn.limpar} @usuario` — ver y borrar advertencias",
      "`{&silenciar} @usuario <tiempo> [motivo]` — timeout nativo de Stoat *(TimeoutMembers)*",
      "`{&kick} @usuario [motivo]` · `{&ban} @usuario [motivo]`",
      "`{&limpar} <n> [@usuario]` — borra mensajes *(ManageMessages)*",
      "",
      "**Quién modera y dónde**",
      "`{&acesso.cargo.add} @rol` — da acceso a los comandos de moderación",
      "`{&acesso.canal.somente}` + `{&acesso.canal.add} #canal` — comandos solo en los canales elegidos"
    ]
  },
  "personalizar": {
    "titulo": "Personalizar",
    "resumo": "bienvenida, roles, colores, embeds, registros, noticias",
    "linhas": [
      "**Entrada y salida** *(ManageMessages)*",
      "`{&boasvindas.canal.aqui}` — embed cuando alguien entra (`{&help} welcome` explica cada parámetro)",
      "`{&adeus.canal.aqui}` — embed cuando alguien se va",
      "`{&autorole} <rol>` — rol automático al entrar *(ManageRole)*",
      "",
      "**Roles** *(ManageRole)*",
      "`{&reactionrole.add} <mensaje> <emoji> <rol>` — roles por reacción",
      "`{&cor} <rol> <color|degradado>` — colores de los roles, degradados incluidos",
      "`{&cor.painel.aqui}` — un panel \"elige tu color\" listo, en un solo comando",
      "",
      "**Mensajes y registro**",
      "`{&embed} title: … | description: …` — publica un embed bonito *(ManageMessages)*",
      "`{&log.canal.here}` — dónde anota el bot lo que pasó *(ManagePermissions)*",
      "`{&rss.add} <url>` — selección de noticias en un canal",
      "`{&fuso.add} <ciudad>` — reloj con varias ciudades",
      "`{&webhook.criar} <nombre> [#canal]` — GitHub, Crafty/Minecraft y compañía publicando en tus canales, un gancho por tema",
      "`{&rolar} 2d20kh1+5` — dados de rol completos (ventaja, explosión, éxitos, Fate) · `{&iniciativa}` — orden de combate",
      "`{&ticket.painel} #canal` — un panel en el que se **reacciona** para abrir un ticket; 🔒 (staff) lo cierra y manda el registro .txt al log",
      "",
      "**El propio bot**",
      "`{&comando.desativar}|enable <nombre>` — activa o desactiva un comando en este servidor",
      "`{&idioma} pt|en|es` — idioma de las respuestas · `{&reset}` — configuración de fábrica *(dueño del servidor)*"
    ]
  },
  "diversao": {
    "titulo": "Diversión",
    "resumo": "niveles de XP, la moneda del servidor, juegos, charlar con Judy, voz",
    "linhas": [
      "**Niveles (XP por mensaje)**",
      "`{&xp}` — tu nivel y progreso · `{&xp.rank} [@usuario]` · `{&xp.sair}` — quedarte fuera del XP",
      "`{&xp.top}` — ranking del servidor",
      "`{&economia}` — la moneda del servidor: `mine`, `top`, la `shop` de roles y `buy`",
      "`{&xp.setup}` — configurar: roles por nivel, multiplicador, canal de anuncios *(ManagePermissions)*",
      "`{&xp.criarcargos}` — crea los roles de nivel por sí solo",
      "",
      "**Entretenimiento**",
      "`{&entretenimento} ship @a @b` — cuánto % encajan · `{&entretenimento.briga} @a @b` — quién gana",
      "`{&entretenimento} cowsay <texto>` — un bicho en ASCII hablando · y más: `8ball`, `choose`, `rate`, `fortune`, `mock`, `reverse`",
      "`{&entretenimento.campominado}` · `{&entretenimento.velha} [@usuario]` — buscaminas y tres en raya",
      "",
      "**Judy (IA)**​[ia]",
      "`{&chat} <mensaje>` — charlar (o simplemente menciona al bot)​[ia]",
      "`{&chat.livre} on|off` — se une sola a la conversación de este canal​[ia]",
      "`{&chat.comentar.aqui}|off` — comenta por iniciativa propia​[ia]",
      "`{&personalidade}` — ver/definir el prompt de personalidad de la IA *(ManageServer)*​[ia]",
      "`{&chat.perfil}` · `{&chat.esquecer} [all]` — lo que recuerda de ti​[ia]",
      "",
      "**Voz**",
      "`{&entrar}` — desde cualquier canal: entra en tu llamada y lee el canal donde lo escribiste (`{&sair}` lo deshace)",
      "`{&tts} <texto>` — o solo una frase concreta",
      "`{&musica} <enlace o nombre>` — música en la llamada (YouTube, SoundCloud, Spotify) con cola, saltar y volumen; baja sola mientras habla el TTS",
      "",
      "_El RPG es un sistema aparte, con su propio personaje, mercado y monedas: `{&help} game`._"
    ]
  },
  "rpg": {
    "titulo": "RPG",
    "resumo": "personaje, misiones, compañeros y mercado",
    "linhas": [
      "**Personaje**",
      "`{&game.criar} [nombre]` — crear · `{&game}` — tu ficha · `{&game.ficha} [@usuario]`",
      "`{&game.pontos} <atributo> [cantidad]` — reparte puntos (str, int, luck…)",
      "`{&game.magias}` · `{&game.aprender} <nombre>` — grimorio",
      "`{&game.top}` — ranking · `{&game.apagar.confirmar}` — empezar de cero",
      "",
      "**Aventura**",
      "`{&game.missao}` — misiones y tus probabilidades · `{&game.missao} <nombre>` — partir",
      "`{&game} coop open <misión>` — llama a hasta 4 personas a la mazmorra · `{&game} coop join`",
      "`{&game} respec points` — devuelve los puntos gastados para repartirlos de nuevo (cuesta Oro)",
      "`{&game.followers}` · `{&game.recrutas}` · `{&game.contratar} [nombre]` — compañeros",
      "`{&game.follower.levar}|drop <nombre>` — arma el grupo · `{&game.follower.ficha} <nombre>`",
      "`{&game.dungeon}` — quién está capturado · `{&game.descansar}` — energía",
      "",
      "**Objetos**",
      "`{&game.itens}` — mochila · `{&game.item} <nombre>` · `{&game.catalogo} [rareza] [tipo]`",
      "`{&game.equipar} <item>` · `{&game.desequipar} <slot|item>`",
      "",
      "**Mercado y monedas del juego**",
      "`{&game.carteira}` · `{&game.comprar} [item]` · `{&game.vender} <item>`",
      "`{&game.mercado}` — bazar entre jugadores · `{&game.trocar}` — trueque",
      "`{&game.cambio} <cant> <moneda> [to <moneda>]` — cambio con el banco",
      "",
      "_El RPG es un solo mundo, el mismo en todos los servidores; la wiki: `{&tutorial} game`. No lo confundas con `{&xp}`._"
    ]
  },
  "diagnostico": {
    "titulo": "Diagnóstico",
    "resumo": "cuando algo no funciona",
    "linhas": [
      "`{&debug}` — **el diagnóstico completo**: primero lo que está roto, luego permisos, jerarquía, canales, voz e IA",
      "`{&debug} @usuario` — lo que el bot puede hacer con esa persona (castigar, silenciar, roles de nivel)",
      "`{&debug} #canal` — la cuenta de permisos del bot en ese canal (¡permiso del canal > rol!)",
      "`{&config}` — resumen de todo lo que está activo",
      "`{&automod.status}` · `{&automod.sentinela}` · `{&automod.punicao}` — estado de la protección",
      "`{&reactionrole.list}` · `{&reactionrole.recarregar}` — si los roles por reacción dejaron de funcionar",
      "`{&ping}` — ¿responde el bot?",
      "",
      "**Los tres sospechosos de siempre**",
      "1. Falta un permiso en el **canal** (no en el rol) → `debug #canal`",
      "2. El rol del bot está **por debajo** del rol que necesita tocar → súbelo en la lista",
      "3. `ManageRole` ≠ `AssignRoles`: uno crea roles, el otro los reparte → el bot necesita los dos"
    ]
  },
  "dono": {
    "titulo": "Dueño del bot",
    "resumo": "solo tú puedes ver esta página",
    "linhas": [
      "`{&servidores}` — cada servidor: nombre, miembros, mensajes por minuto",
      "`{&game.admin}` — herramientas de prueba y monedas del RPG (`{&help.game} admin`)",
      "`{&automod.debug} on|off` — registro detallado del automod (global)",
      "`{&banglobal.revisar}` — revisa la lista global",
      "",
      "_La IA de charla (`chat`, comentarios espontáneos, generación de imágenes, resumen de RSS) solo funciona en los servidores de `SERVIDOR`; en los demás solo queda la moderación por IA (`modia`, temas prohibidos, imágenes y fotos de perfil)._​[ia]"
    ]
  }
};

const resolver = (t, P) => (typeof t === "string" ? citarNoTexto(t, "es", P) : t);
// a árvore com as marcas resolvidas (o prefixo do bot só se sabe na hora)
export function arvoreES(P) {
  const visita = (no) => Object.fromEntries(Object.entries(no).map(([k, v]) =>
    [k, v && typeof v === "object" && !Array.isArray(v) ? visita(v) : resolver(v, P)]));
  return visita(ARVORE_ES);
}
export function gruposES(P) {
  return Object.fromEntries(Object.entries(GRUPOS_ES).map(([k, g]) =>
    [k, { ...g, titulo: resolver(g.titulo, P), resumo: resolver(g.resumo, P), linhas: (g.linhas ?? []).map((l) => resolver(l, P)) }]));
}
