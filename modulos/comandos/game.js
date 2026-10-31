// &game — o RPG (P2, 31 out 2026: 10 comandos + admin; os nomes antigos viram
// apelidos ou dizem numa linha que saíram — ver modulos/game/game.js)

// a página de cada subcomando (`&help game <subcomando>`): uso, o que faz, exemplo
const SUB = {
  ficha: {
    uso: { pt: "{&game} [@pessoa]", en: "{&game} [@person]", es: "{&game} [@usuario]" },
    desc: { pt: "A ficha curta: build, nível, ouro, aliados, a chance numa missão do seu nível e quando pode ir de novo. Com @, a de outro membro deste servidor.",
      en: "The short sheet: build, level, gold, allies, your odds on a mission of your level and when you can go again. With @, another member's of this server.",
      es: "La ficha corta: build, nivel, oro, aliados, tu probabilidad en una misión de tu nivel y cuándo puedes volver a ir. Con @, la de otro miembro de este servidor." },
    ex: "{&game}" },
  criar: {
    uso: { pt: "{&game.criar} <nome>", en: "{&game.criar} <name>", es: "{&game.criar} <nombre>" },
    desc: { pt: "Cria o personagem: kit inicial, dois aliados e a build Guerreiro (troque com {&game.build}). O nome é obrigatório e aparece para todos — sem menção, link nem formatação, até 32 letras.",
      en: "Creates the character: starter kit, two allies and the Warrior build (change it with {&game.build}). The name is required and visible to everyone — no mentions, links or formatting, up to 32 letters.",
      es: "Crea el personaje: kit inicial, dos aliados y la build Guerrero (cámbiala con {&game.build}). El nombre es obligatorio y lo ve todo el mundo — sin menciones, enlaces ni formato, hasta 32 letras." },
    ex: "{&game.criar} Kael" },
  build: {
    uso: { pt: "{&game.build} [lista|build]", en: "{&game.build} [list|build]", es: "{&game.build} [lista|build]" },
    desc: { pt: "Sem nada, mostra como a **sua** build está montada: atributos, equipamento, magias e aliados. `lista` (ou `&game builds`) mostra as builds. Com o nome de uma, troca: os pontos voltam e se redistribuem, o equipamento e as magias se refazem para ela. Pontos, equipamento e magias são sempre automáticos.",
      en: "On its own, shows how **your** build is put together: attributes, gear, spells and allies. `list` (or `&game builds`) shows the builds. With a build's name, switches: points come back and are spent again, gear and spells are redone for it. Points, gear and spells are always automatic.",
      es: "Sola, muestra cómo está armada **tu** build: atributos, equipo, hechizos y aliados. `lista` (o `&game builds`) muestra las builds. Con el nombre de una, la cambia: los puntos vuelven y se reparten de nuevo, el equipo y los hechizos se rehacen para ella. Puntos, equipo y hechizos son siempre automáticos." },
    ex: "{&game.build} paladino" },
  missao: {
    uso: { pt: "{&game.missao} [@amigos]", en: "{&game.missao} [@friends]", es: "{&game.missao} [@amigos]" },
    desc: { pt: "Uma missão sorteada no seu nível (contrato, dungeon ou, às vezes, especial). Com @amigos (até 3, deste servidor): só eles entram, com ✅ ou digitando o mesmo comando; o grupo parte quando todos aceitam ou em 2 min.",
      en: "A random mission at your level (contract, dungeon or, sometimes, special). With @friends (up to 3, from this server): only they can join, with ✅ or by typing the same command; the group leaves when everyone accepts or in 2 min.",
      es: "Una misión al azar en tu nivel (contrato, mazmorra o, a veces, especial). Con @amigos (hasta 3, de este servidor): solo ellos entran, con ✅ o escribiendo el mismo comando; el grupo sale cuando todos aceptan o en 2 min." },
    ex: "{&game.missao}" },
  chefe: {
    uso: { pt: "{&game.chefe} [@amigos]", en: "{&game.chefe} [@friends]", es: "{&game.chefe} [@amigos]" },
    desc: { pt: "O próximo chefe do seu nível. Feito para 4 jogadores: chame amigos como na missão. 1 h por pessoa, por chefe.",
      en: "The next boss for your level. Made for 4 players: call friends like in a mission. 1 h per person, per boss.",
      es: "El próximo jefe de tu nivel. Hecho para 4 jugadores: llama a amigos como en la misión. 1 h por persona, por jefe." },
    ex: "{&game.chefe}" },
  comprar: {
    uso: { pt: "{&game.comprar} [número|item]", en: "{&game.comprar} [number|item]", es: "{&game.comprar} [número|objeto]" },
    desc: { pt: "Sem nada, a loja: só o que melhora a sua build. Com o número ou o nome, compra e equipa na hora.",
      en: "Alone, the shop: only what improves your build. With the number or the name, buys and equips it right away.",
      es: "Solo, la tienda: solo lo que mejora tu build. Con el número o el nombre, lo compra y lo equipa al momento." },
    ex: "{&game.comprar}" },
  aliado: {
    uso: { pt: "{&game.aliado} [nome]", en: "{&game.aliado} [name]", es: "{&game.aliado} [nombre]" },
    desc: { pt: "Seus aliados (⭐ = os dois que vão junto, escolhidos sozinhos) e os mercenários à venda. Com o nome, contrata.",
      en: "Your allies (⭐ = the two who come along, picked automatically) and the mercenaries for hire. With a name, hires one.",
      es: "Tus aliados (⭐ = los dos que van contigo, elegidos solos) y los mercenarios en venta. Con el nombre, contrata." },
    ex: "{&game.aliado}" },
  duelo: {
    uso: { pt: "{&game.duelo} <@pessoa> [ouro]", en: "{&game.duelo} <@person> [gold]", es: "{&game.duelo} <@usuario> [oro]" },
    desc: { pt: "Duelo 1 contra 1 com um membro deste servidor, apostando ouro (inteiro) ou nada. Só a pessoa desafiada aceita: ✅ ou {&game.duelo.aceitar}. {&game.duelo.recusar} · {&game.duelo.cancelar}. Quem perde só perde a aposta.",
      en: "A 1-on-1 duel with a member of this server, betting gold (whole number) or nothing. Only the challenged person accepts: ✅ or {&game.duelo.aceitar}. {&game.duelo.recusar} · {&game.duelo.cancelar}. The loser only loses the bet.",
      es: "Duelo 1 contra 1 con un miembro de este servidor, apostando oro (entero) o nada. Solo la persona desafiada acepta: ✅ o {&game.duelo.aceitar}. {&game.duelo.recusar} · {&game.duelo.cancelar}. Quien pierde solo pierde la apuesta." },
    ex: { pt: "{&game.duelo} @‹pessoa› 100", en: "{&game.duelo} @‹person› 100", es: "{&game.duelo} @‹usuario› 100" } },
  top: {
    uso: { pt: "{&game.top}", en: "{&game.top}", es: "{&game.top}" },
    desc: { pt: "Os 10 aventureiros de nível mais alto do mundo.", en: "The 10 highest-level adventurers in the world.", es: "Los 10 aventureros de nivel más alto del mundo." },
    ex: "{&game.top}" },
  apagar: {
    uso: { pt: "{&game.apagar}", en: "{&game.apagar}", es: "{&game.apagar}" },
    desc: { pt: "Apaga o seu personagem (pede confirmação). O de antes do recomeço de 31 out 2026 só sai pelo {&privacidade}.",
      en: "Deletes your character (asks for confirmation). The one from before the 31 Oct 2026 restart only goes away through {&privacidade}.",
      es: "Borra tu personaje (pide confirmación). El de antes del reinicio del 31 oct 2026 solo se borra con {&privacidade}." },
    ex: "{&game.apagar}" },
  admin: {
    soDono: true,
    uso: { pt: "{&game.admin} [dar|nivel|item|imagem]", en: "{&game.admin} [dar|nivel|item|imagem]", es: "{&game.admin} [dar|nivel|item|imagem]" },
    desc: { pt: "Só o dono do bot. Sem nada: as eras, o banco e o prazo da purga. {&game.admin.dar} <qtd> [@pessoa] · {&game.admin.nivel} <n> [@pessoa] · {&game.admin.item} <nome> [@pessoa] · {&game.admin.imagem} [id] [link]",
      en: "Bot owner only. Alone: the eras, the bank and the purge date. {&game.admin.dar} <amount> [@person] · {&game.admin.nivel} <n> [@person] · {&game.admin.item} <name> [@person] · {&game.admin.imagem} [id] [link]",
      es: "Solo el dueño del bot. Solo: las eras, el banco y la fecha de la purga. {&game.admin.dar} <cant> [@usuario] · {&game.admin.nivel} <n> [@usuario] · {&game.admin.item} <nombre> [@usuario] · {&game.admin.imagem} [id] [enlace]" },
    ex: "{&game.admin}" },
};

// → `ajuda.paginas` (o formato do registro-ajuda): uma página por subcomando
const EXEMPLO = { pt: "Exemplo", en: "Example", es: "Ejemplo" };
const PAGINAS = Object.fromEntries(Object.entries(SUB).map(([k, v]) => [k, {
  ...(v.soDono ? { soDono: true } : {}),
  titulo: { pt: `game ${k}`, en: `game ${k}`, es: `game ${k}` },
  texto: Object.fromEntries(["pt", "en", "es"].map((l) => [l, `\`${v.uso[l]}\`\n\n${v.desc[l]}\n\n${EXEMPLO[l]}: \`${typeof v.ex === "string" ? v.ex : v.ex[l]}\``])),
}]));

export default {
  id: "game",
  modulo: "../game/game.js",
  funcao: "cmdGame",
  nomes: { en: "game" },
  apelidos: ["rpg", "personagem", "character"],
  es: { nome: "juego", subcomandos: { criar: "crear", missao: "mision", chefe: "jefe", comprar: "comprar", aliado: "aliado", duelo: "duelo",
    apagar: "borrar", top: "top", build: "build", ficha: "ficha", aceitar: "aceptar", recusar: "rechazar", cancelar: "cancelar", confirmar: "confirmar", dar: "dar", nivel: "nivel", imagem: "imagen", novo: "nuevo", pontos: "puntos", itens: "objetos", inventario: "inventario", mochila: "mochila", magia: "hechizo", magias: "hechizos", aprender: "aprender", grimorio: "grimorio", equipar: "equipar", desequipar: "desequipar", vestir: "vestir", catalogo: "catalogo", loja: "tienda", carteira: "cartera", saldo: "saldo", mercado: "mercado", cambio: "cambio", trocar: "intercambiar", escambo: "trueque", taxas: "tasas", banco: "banco", vender: "vender", contratar: "contratar", recrutar: "reclutar", descansar: "descansar", follower: "seguidor", followers: "seguidores", recrutas: "reclutas", mercenarios: "mercenarios", missoes: "misiones", contrato: "contrato", contratos: "contratos", bico: "encargo", bicos: "encargos", especial: "especial", especiais: "especiales", chefes: "jefes", resgatar: "rescatar", classe: "clase", evoluir: "evolucionar", usar: "usar", historia: "historia", prever: "prever", refazer: "rehacer", perfil: "perfil", ajuda: "ayuda", comandos: "comandos", entrar: "entrar", sair: "salir", energia: "energia", moeda: "moneda", teste: "prueba", simular: "simular", servidor: "servidor", tudo: "todo", modelo: "modelo", ver: "ver", detalhe: "detalle", remover: "quitar", padrao: "predeterminado", mundo: "mundo", fantasia: "fantasia", simples: "simple", levar: "llevar", adicionar: "agregar", tirar: "sacar", dispensar: "despedir", pegar: "recoger", fotos: "fotos", anunciar: "anunciar", abrir: "abrir", partir: "partir", com: "con", por: "por", mao1: "mano1", mao2: "mano2" } },
  // Os 10 + admin primeiro; depois os nomes antigos (apelidos ou "saiu" — game.js decide),
  // que continuam aqui para quem digitava em inglês chegar ao mesmo lugar
  subcomandos: {
    criar: "create", build: "build", missao: "mission", chefe: "boss", comprar: "buy", aliado: ["ally", "allies"], duelo: ["duel", "pvp"], top: "top", apagar: ["delete", "erase"], admin: "admin",
    ficha: "sheet", aceitar: "accept", recusar: "decline", cancelar: "cancel", confirmar: "confirm", dar: "give", nivel: "level", item: "item", imagem: ["image", "picture"],
    novo: "new", pontos: ["points", "spend"], itens: "items", inventario: "inventory", mochila: "bag",
    magia: ["spell", "magic"], magias: "spells", aprender: "learn", grimorio: "grimoire",
    equipar: "equip", desequipar: "unequip", vestir: "wear", catalogo: "catalog",
    loja: "shop", carteira: "wallet", saldo: "balance", mercado: "market",
    cambio: "exchange", trocar: "trade", escambo: "barter", taxas: "rates", banco: "bank",
    vender: "sell", contratar: "hire", recrutar: "recruit",
    descansar: "rest", follower: "companion", followers: "companions", party: "party",
    recrutas: "recruits", mercenarios: "mercenaries", missoes: "missions",
    quest: "quest", contrato: "contract", contratos: "contracts", bico: "job", bicos: "jobs",
    especial: "special", especiais: "specials", chefes: "bosses",
    dungeon: "dungeon", dungeons: "dungeons", resgatar: "rescue", classe: "class",
    evoluir: "evolve", usar: "use", historia: "story", prever: "preview", refazer: "redo",
    ranking: "ranking", perfil: "profile", ajuda: "help",
    comandos: "commands", entrar: "join", sair: "leave", energia: "energy", eco: "eco", status: "status",
    moeda: ["currency", "coin"], teste: "test", simular: "simulate", reset: "reset",
    servidor: "server", tudo: "all", modelo: "model", ver: "view",
    detalhe: "info", remover: "remove", padrao: ["default", "main"], mundo: "world",
    fantasia: "fantasy", simples: "simple", levar: "take", adicionar: "add", tirar: "drop",
    dispensar: "dismiss", pegar: "retrieve", fotos: "photos", album: "album",
    anunciar: "announce",
  },
  aninhados: ["admin", "apagar", "coop", "duelo", "equipe", "escambo", "follower", "followers", "mercado", "moeda", "party", "reset", "trocar"],
  naTela: { abrir: "open", partir: "go", com: "with", por: "for", mao1: "hand1", mao2: "hand2" },
  gerenciavel: true,
  ajuda: {
    grupo: "rpg",
    resumo: { pt: "o RPG: um personagem, uma build, missões, chefes e duelos", en: "the RPG: one character, one build, missions, bosses and duels", es: "el RPG: un personaje, una build, misiones, jefes y duelos" },
    perm: null,
    uso: { pt: "{&game} [criar|build|missao|chefe|comprar|aliado|duelo|top|apagar]", en: "{&game} [create|build|mission|boss|buy|ally|duel|top|delete]", es: "{&game} [crear|build|mision|jefe|comprar|aliado|duelo|top|borrar]" },
    desc: {
      pt: "RPG — um mundo só, o mesmo personagem em todo servidor. Você escolhe a build; pontos, equipamento e magias são automáticos.\n\n`{&game}` — a sua ficha\n`{&game.criar} <nome>` — cria o personagem\n`{&game.build} [build]` — escolhe a build\n`{&game.missao} [@amigos]` — uma missão sorteada, sozinho ou em grupo\n`{&game.chefe} [@amigos]` — um chefe\n`{&game.comprar}` — a loja · `{&game.aliado}` — aliados\n`{&game.duelo} <@pessoa> [ouro]` — duelo valendo ouro\n`{&game.top}` · `{&game.apagar}`\n\n_A wiki do jogo: `{&tutorial} rpg`. Não confundir com `{&xp}`._",
      en: "RPG — one world, the same character on every server. You pick the build; points, gear and spells are automatic.\n\n`{&game}` — your sheet\n`{&game.criar} <name>` — creates the character\n`{&game.build} [build]` — picks the build\n`{&game.missao} [@friends]` — a random mission, alone or in a group\n`{&game.chefe} [@friends]` — a boss\n`{&game.comprar}` — the shop · `{&game.aliado}` — allies\n`{&game.duelo} <@person> [gold]` — a duel for gold\n`{&game.top}` · `{&game.apagar}`\n\n_The game wiki: `{&tutorial} rpg`. Not to be confused with `{&xp}`._",
      es: "RPG — un solo mundo, el mismo personaje en todos los servidores. Tú eliges la build; puntos, equipo y hechizos son automáticos.\n\n`{&game}` — tu ficha\n`{&game.criar} <nombre>` — crea el personaje\n`{&game.build} [build]` — elige la build\n`{&game.missao} [@amigos]` — una misión al azar, solo o en grupo\n`{&game.chefe} [@amigos]` — un jefe\n`{&game.comprar}` — la tienda · `{&game.aliado}` — aliados\n`{&game.duelo} <@usuario> [oro]` — duelo por oro\n`{&game.top}` · `{&game.apagar}`\n\n_La wiki del juego: `{&tutorial} rpg`. No confundir con `{&xp}`._",
    },
    ex: "{&game.criar} Kael",
    paginas: PAGINAS,
  },
};
