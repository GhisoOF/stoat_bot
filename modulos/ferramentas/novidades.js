// Novidades da Judy: o anúncio de atualização no canal de log (20 out 2026).
//
// Cada pacote novo traz UMA entrada no topo desta lista, escrita para quem usa o
// bot (não para quem programa), nos três idiomas. Na subida, a Judy anuncia o que
// ainda não anunciou no canal de log de CADA servidor (P2, 31 out 2026: sempre — saiu
// o `&log atualizacoes on|off`; servidor sem canal de log não recebe) — uma vez só: a
// marca do último anunciado fica na config global, e é gravada ANTES do envio (um
// reinício no meio não repete o anúncio).
//
// A primeira subida com esta lista só grava a marca: o que já existia não é novidade.
//
// Trava do build (P2): a entrada do TOPO tem `pacote` igual ao de `docs/pacote.json`, e a
// `data` dela não é mais velha que a do pacote — o scripts/verificar-build.js falha se não.
// Pacote novo = troque o docs/pacote.json E escreva a entrada nova aqui (nos três idiomas).

import { idiomaDaTela } from "../core/i18n.js";
import { citarNoTexto, marcarTraduzido } from "../core/aliases.js";

// A mais nova primeiro. `id` nunca muda (é a marca); `data` é só para a tela.
// Comandos no texto vão como a marca de citação (chave, &, comando.sub, chave — ex.:
// a do &privacidade apagar, mais abaixo) e viram o nome no idioma do servidor. Não
// escreva a marca de exemplo num comentário: o verificar-build lê toda marca como
// citação, e uma inventada aborta o build do Docker (aconteceu do P5 ao P7).
export const NOVIDADES = [
  {
    id: "2026-11-03-p6",
    pacote: "P6",
    data: "2026-11-03",
    pt: "• **Qualquer escrita:** quem escreve em russo, árabe, grego, chinês… nunca é punido pela escrita; a repetição (`{&automod.antiduplicata}`) vale nessas escritas como no português, e a caixa alta (`{&automod.antiruido}`) conta também em cirílico, grego e armênio.\n• **Menos falso positivo:** repetir uma mensagem inocente não pesa mais na nota do `{&automod.sentinela}`.",
    en: "• **Any script:** people writing in Russian, Arabic, Greek, Chinese… are never punished for the script; repetition (`{&automod.antiduplicata}`) works in those scripts just like in English, and caps (`{&automod.antiruido}`) now also count in Cyrillic, Greek and Armenian.\n• **Fewer false positives:** repeating a harmless message no longer weighs on the `{&automod.sentinela}` score.",
    es: "• **Cualquier escritura:** quien escribe en ruso, árabe, griego, chino… nunca recibe un castigo por la escritura; la repetición (`{&automod.antiduplicata}`) vale en esas escrituras igual que en español, y las mayúsculas (`{&automod.antiruido}`) cuentan también en cirílico, griego y armenio.\n• **Menos falsos positivos:** repetir un mensaje inofensivo ya no pesa en la nota de `{&automod.sentinela}`.",
  },
  {
    id: "2026-11-03-p5",
    pacote: "P5",
    data: "2026-11-03",
    pt: "• **Ameaças sem palavrão:** o `{&automod.sentinela}` agora reconhece cobrança com ultimato (\"paga até sexta ou…\") e ameaça de expor dados ou fotos de alguém (\"se você não… vou mandar seu endereço pro grupo\"), em português, inglês e espanhol.\n• **Motivos no idioma do servidor:** os motivos das punições automáticas saem no idioma de `{&config.idioma}`.",
    en: "• **Threats without swear words:** `{&automod.sentinela}` now recognizes payment ultimatums (\"pay by Friday or…\") and threats to expose someone's data or photos (\"if you don't… I'll send your address to the group\"), in English, Portuguese and Spanish.\n• **Reasons in the server's language:** automatic punishment reasons now come in the language set in `{&config.idioma}`.",
    es: "• **Amenazas sin groserías:** `{&automod.sentinela}` ahora reconoce cobros con ultimátum (\"págame antes del viernes o…\") y amenazas de exponer datos o fotos de alguien (\"si no… mando tu dirección al grupo\"), en español, portugués e inglés.\n• **Motivos en el idioma del servidor:** los motivos de los castigos automáticos salen en el idioma de `{&config.idioma}`.",
  },
  {
    id: "2026-11-02-p4",
    pacote: "P4",
    data: "2026-11-02",
    pt: "• **O RPG e a conversa com a Judy saíram**, e os dados deles foram apagados (personagens, memória e histórico da conversa). Ela não responde mais a menções; com a conversa saíram a personalidade, a busca na web, a geração de imagem e o resumo do RSS pela IA (o telejornal é a lista). Ficam os dados de mesa (`{&rolar}`), os jogos (`{&entretenimento}`) e a `{&economia}`.\n• **A IA ficou só na moderação:** confirma os temas proibidos (`{&automod.sentinela.assuntos}`) e olha imagens e fotos de perfil. `{&debug}` mostra o estado.\n• **`{&privacidade}`:** ficam o status, `{&privacidade.xp.sair}` e `{&privacidade.apagar}`; a memória, o sair da conversa, o esquecer e o mapear saíram com a conversa.",
    en: "• **The RPG and chatting with Judy are gone**, and their data was erased (characters, memory and chat history). She no longer answers mentions; with the chat went the personality, web search, image generation and the AI summary of RSS (the news digest is the list). Tabletop dice (`{&rolar}`), the games (`{&entretenimento}`) and the `{&economia}` stay.\n• **AI stays only in moderation:** it confirms banned topics (`{&automod.sentinela.assuntos}`) and looks at images and profile pictures. `{&debug}` shows its state.\n• **`{&privacidade}`:** the status, `{&privacidade.xp.sair}` and `{&privacidade.apagar}` stay; memory, leaving the chat, forget and map went with the chat.",
    es: "• **El RPG y la conversación con Judy salieron**, y sus datos se borraron (personajes, memoria e historial de la conversación). Ya no responde a menciones; con la conversación salieron la personalidad, la búsqueda web, la generación de imágenes y el resumen del RSS por la IA (el noticiero es la lista). Siguen los dados de mesa (`{&rolar}`), los juegos (`{&entretenimento}`) y la `{&economia}`.\n• **La IA quedó solo en la moderación:** confirma los temas prohibidos (`{&automod.sentinela.assuntos}`) y mira imágenes y fotos de perfil. `{&debug}` muestra el estado.\n• **`{&privacidade}`:** quedan el estado, `{&privacidade.xp.sair}` y `{&privacidade.apagar}`; la memoria, salir de la conversación, olvidar y mapear salieron con la conversación.",
  },
  {
    id: "2026-11-01-p3a1",
    pacote: "P3a.1",
    data: "2026-11-01",
    pt: "• **Caixa alta:** título (`#`) em maiúsculas ou só de risada agora conta como grito, mesmo curto (o resto da mensagem continua com o tamanho mínimo de `{&automod.antiruido}`).\n• **Repetição:** uma risada passa; a 3ª mensagem só de risada da mesma pessoa em 1 minuto conta como repetição.",
    en: "• **Caps:** a heading (`#`) in capitals or made only of laughter now counts as shouting, even when short (the rest of the message keeps the minimum length of `{&automod.antiruido}`).\n• **Repetition:** one laugh is fine; the 3rd laughter-only message from the same person within 1 minute counts as repetition.",
    es: "• **Mayúsculas:** un título (`#`) en mayúsculas o solo de risa ahora cuenta como grito, aunque sea corto (el resto del mensaje sigue con el tamaño mínimo de `{&automod.antiruido}`).\n• **Repetición:** una risa pasa; el 3.er mensaje solo de risa de la misma persona en 1 minuto cuenta como repetición.",
  },
  {
    id: "2026-10-31-p3a",
    pacote: "P3a",
    data: "2026-10-31",
    pt: "• **Moderação que aprende com a staff:** caso duvidoso não pune sozinho — a staff do servidor recebe um alerta com ✅/❌, e o que ela decide vale e ajusta a Judy **neste servidor**. Detalhes em `{&privacidade}`.\n• **Temas proibidos** (`{&automod.sentinela.assuntos}`): a IA separa fora do tema, zoeira, discussão e ataque. Zoeira nunca é punida; ofender alguém por causa do tema sempre conta; discussão só nos temas ligados.\n• **O perfil inteiro** (`{&automod.sentinela.avatar}`): além da foto, banner, bio, nome, apelido e status, ao entrar e ao trocar — inclusive desenho feito de caracteres (braille, blocos). O silêncio dura até a pessoa trocar o que apitou.",
    en: "• **Moderation that learns from the staff:** doubtful cases aren't punished automatically — the server's staff gets an alert with ✅/❌, and what it decides counts and tunes Judy **on this server**. Details in `{&privacidade}`.\n• **Forbidden topics** (`{&automod.sentinela.assuntos}`): the AI tells apart off-topic, joking, discussion and attack. Joking is never punished; insulting someone over the topic always counts; discussion only on topics turned on.\n• **The whole profile** (`{&automod.sentinela.avatar}`): besides the picture, banner, bio, name, nickname and status, on join and on change — including drawings made of characters (braille, blocks). The timeout lasts until the person changes what was flagged.",
    es: "• **Moderación que aprende del staff:** los casos dudosos no se castigan solos — el staff del servidor recibe una alerta con ✅/❌, y lo que decide vale y ajusta a Judy **en este servidor**. Detalles en `{&privacidade}`.\n• **Temas prohibidos** (`{&automod.sentinela.assuntos}`): la IA distingue fuera de tema, broma, discusión y ataque. La broma nunca se castiga; ofender a alguien por el tema siempre cuenta; la discusión solo en los temas activados.\n• **El perfil entero** (`{&automod.sentinela.avatar}`): además de la foto, banner, bio, nombre, apodo y estado, al entrar y al cambiarlo — incluidos los dibujos hechos con caracteres (braille, bloques). El silencio dura hasta que la persona cambie lo detectado.",
  },
  {
    id: "2026-10-31-p2",
    pacote: "P2",
    data: "2026-10-31",
    pt: "• **Comandos mais simples:** `{&help}` abre a página certa de cada comando; `{&config}` reúne log, idioma, acesso e comandos (os nomes antigos continuam valendo). Novos: `{&unban}` e `{&untimeout}` (número da lista, menção, ID ou nome). As respostas ficaram curtas e saem inteiras em espanhol.\n• **Privacidade num lugar só:** `{&privacidade}` — o que é guardado, sair do XP, apagar tudo.\n• **Horários** aparecem na hora de quem lê; `{&fuso} 21:30 Madrid` converte. **RSS** virou telejornal: um resumo por dia (`{&rss.horario} 21:00`) e o urgente na hora.",
    en: "• **Simpler commands:** `{&help}` opens the right page for each command; `{&config}` gathers log, language, access and commands (the old names still work). New: `{&unban}` and `{&untimeout}` (list number, mention, ID or name). Replies are short and fully in Spanish on Spanish servers.\n• **Privacy in one place:** `{&privacidade}` — what is kept, leave XP, erase everything.\n• **Times** show in the reader's own time; `{&fuso} 21:30 Madrid` converts. **RSS** became a newscast: one summary a day (`{&rss.horario} 21:00`) and urgent items right away.",
    es: "• **Comandos más simples:** `{&help}` abre la página correcta de cada comando; `{&config}` reúne log, idioma, acceso y comandos (los nombres antiguos siguen valiendo). Nuevos: `{&unban}` y `{&untimeout}` (número de la lista, mención, ID o nombre). Las respuestas son cortas y salen enteras en español.\n• **Privacidad en un solo lugar:** `{&privacidade}` — lo que se guarda, salir del XP, borrar todo.\n• **Los horarios** aparecen en la hora de quien lee; `{&fuso} 21:30 Madrid` convierte. **El RSS** pasó a ser un noticiero: un resumen al día (`{&rss.horario} 21:00`) y lo urgente al momento.",
  },
  {
    id: "2026-10-31-seguranca",
    pacote: "P1",   // (P2) a trava do build: o topo tem de ser o pacote de docs/pacote.json
    data: "2026-10-31",
    pt: "• **Moderação:** alertas da staff vão só para o canal de log/sentinela deste servidor. `{&banglobal}` e `{&userinfo}` não mostram mais dados de outros servidores, e ban automático de outro servidor só alerta. O cargo de staff segue moderando, mas a configuração (`{&automod}`, `{&log}`, `{&acesso}`…) e os cargos passam a exigir a permissão do próprio Stoat.\n• **Webhooks:** a URL do gancho chega por DM. **Tickets:** até 20 abertos por servidor. **RSS:** `{&rss.agora}` a cada 5 min.\n• Mensagens de erro ficaram curtas, sem detalhe interno.",
    en: "• **Moderation:** staff alerts go only to this server's log/sentinel channel. `{&banglobal}` and `{&userinfo}` no longer show other servers' data, and another server's automatic ban only alerts. The staff role still moderates, but configuration (`{&automod}`, `{&log}`, `{&acesso}`…) and roles now need Stoat's own permission.\n• **Webhooks:** the hook URL arrives by DM. **Tickets:** up to 20 open per server. **RSS:** `{&rss.agora}` every 5 min.\n• Error messages are short, with no internal detail.",
    es: "• **Moderación:** las alertas del staff van solo al canal de log/centinela de este servidor. `{&banglobal}` y `{&userinfo}` ya no muestran datos de otros servidores, y el ban automático de otro servidor solo alerta. El rol de staff sigue moderando, pero la configuración (`{&automod}`, `{&log}`, `{&acesso}`…) y los roles pasan a exigir el permiso del propio Stoat.\n• **Webhooks:** la URL del gancho llega por DM. **Tickets:** hasta 20 abiertos por servidor. **RSS:** `{&rss.agora}` cada 5 min.\n• Los mensajes de error son cortos, sin detalles internos.",
  },
  {
    id: "2026-10-20-jogos",
    data: "2026-10-20",
    pt: "• **Jogos:** `{&entretenimento.campominado}` (campo minado de spoilers — `facil`, `medio` ou `dificil`) e `{&entretenimento.velha}` (jogo da velha por reação, contra alguém ou contra a Judy).\n• **Em qualquer canal:** com os comandos restritos a alguns canais, a staff libera um comando para valer em todos — `{&acesso.livre} entretenimento on` solta os jogos.",
    en: "• **Games:** `{&entretenimento.campominado}` (a spoiler minesweeper — `easy`, `medium` or `hard`) and `{&entretenimento.velha}` (tic-tac-toe by reaction, against someone or against Judy).\n• **In any channel:** with commands restricted to some channels, staff can free a command to work everywhere — `{&acesso.livre} entertainment on` frees the games.",
    es: "• **Juegos:** `{&entretenimento.campominado}` (buscaminas de spoilers — `easy`, `medium` o `hard`) y `{&entretenimento.velha}` (tres en raya por reacción, contra alguien o contra Judy).\n• **En cualquier canal:** con los comandos restringidos a algunos canales, el staff libera un comando para que valga en todos — `{&acesso.livre} entretenimiento on` libera los juegos.",
  },
  {
    id: "2026-10-20-cores",
    data: "2026-10-20",
    pt: "• **Painel de cores:** `{&cor.painel} aqui` agora traz **10 cores sólidas** além dos gradientes — e 8 gradientes novos (aurora, galáxia, sakura, menta, pêssego, lava, crepúsculo, algodão-doce). Sólidas e gradientes saem em duas mensagens, e continua valendo uma cor por vez.\n• `{&cor.painel} aqui solidas` ou `gradientes` publica só um grupo.",
    en: "• **Color panel:** `{&cor.painel} here` now brings **10 solid colors** besides the gradients — and 8 new gradients (aurora, galaxy, sakura, mint, peach, lava, twilight, cotton candy). Solid colors and gradients go in two messages, and it's still one color at a time.\n• `{&cor.painel} here solid` or `gradients` publishes only one group.",
    es: "• **Panel de colores:** `{&cor.painel} here` ahora trae **10 colores sólidos** además de los degradados — y 8 degradados nuevos (aurora, galaxia, sakura, menta, durazno, lava, crepúsculo, algodón de azúcar). Sólidos y degradados salen en dos mensajes, y sigue valiendo un color a la vez.\n• `{&cor.painel} here solid` o `gradients` publica solo un grupo.",
  },
  {
    id: "2026-10-20-privacidade",
    data: "2026-10-20",
    pt: "• **Privacidade:** `{&privacidade}` mostra o que a Judy guarda; `{&privacidade.apagar}` apaga tudo.\n• **XP:** ao ligar, a Judy avisa o servidor, e `{&xp.sair}` deixa você de fora.\n• **Relatório de ataques:** o servidor pode mandar ao dono da Judy um relatório anônimo (`{&log.relatorio} on`).\n• **Este anúncio:** `{&log.atualizacoes} on` traz as novidades da Judy para este canal.",
    en: "• **Privacy:** `{&privacidade}` shows what Judy keeps; `{&privacidade.apagar}` erases it all.\n• **XP:** when it's turned on, Judy tells the server, and `{&xp.sair}` keeps you out.\n• **Attack report:** a server can send Judy's owner an anonymous report (`{&log.relatorio} on`).\n• **This announcement:** `{&log.atualizacoes} on` brings Judy's news to this channel.",
    es: "• **Privacidad:** `{&privacidade}` muestra lo que Judy guarda; `{&privacidade.apagar}` lo borra todo.\n• **XP:** al activarlo, Judy avisa al servidor, y `{&xp.sair}` te deja fuera.\n• **Informe de ataques:** el servidor puede enviar al dueño de Judy un informe anónimo (`{&log.relatorio} on`).\n• **Este anuncio:** `{&log.atualizacoes} on` trae las novedades de Judy a este canal.",
  },
];

// A trava do build (P2): o problema da lista diante do pacote atual (docs/pacote.json), ou null
export function problemaDaTrava(lista, pacote) {
  const topo = lista?.[0];
  if (!topo) return "NOVIDADES vazia";
  if (!pacote?.pacote) return "docs/pacote.json sem o campo `pacote`";
  if (topo.pacote !== pacote.pacote) return `a entrada do topo (${topo.id}) é do pacote ${topo.pacote ?? "(nenhum)"}, e o pacote atual é ${pacote.pacote} — escreva a entrada do ${pacote.pacote} em modulos/ferramentas/novidades.js`;
  if (String(topo.data) < String(pacote.data ?? "")) return `a entrada do topo (${topo.data}) é mais velha que o pacote ${pacote.pacote} (${pacote.data})`;
  if (["pt", "en", "es"].some((l) => !String(topo[l] ?? "").trim())) return `a entrada do topo (${topo.id}) precisa de pt, en e es`;
  return null;
}

// As entradas mais novas que `marca` (a mais nova primeiro). Marca desconhecida
// (entrada removida da lista): nada — não dá para saber o que é novo.
export function novasDesde(marca, lista = NOVIDADES) {
  const i = lista.findIndex((n) => n.id === marca);
  return i < 0 ? [] : lista.slice(0, i);
}

export function embedNovidades(novas, lang, P = "&", COR = {}) {
  const t = { pt: "🆕 Novidades da Judy", en: "🆕 What's new in Judy", es: "🆕 Novedades de Judy" }[lang] ?? "🆕 What's new in Judy";
  const corpo = novas.map((n) => `**${n.data}**\n${citarNoTexto(n[lang] ?? n.en, lang, P)}`).join("\n\n");
  const max = 1900;
  return { title: t, description: corpo.length > max ? corpo.slice(0, max - 1) + "…" : corpo, colour: COR.info };
}

// Publica um embed no canal de LOG de cada servidor (as novidades, o `&servidores aviso`
// do dono do bot). Servidor sem canal de log não recebe; canal de outro servidor nunca.
// `embedPorIdioma`: (lang) => embed, ou { pt, en, es }. O texto já vem no idioma do
// servidor (o espanhol sai pronto, sem a tradução da tela por cima).
// `enviar(canal, embed, serverId)`: quem manda de fato (o main.js passa o sendEmbed).
export async function anunciarNoLog(client, embedPorIdioma, { configDoServidor, enviar } = {}) {
  let enviados = 0, semLog = 0, falhas = 0;
  for (const s of client?.servers?.values?.() ?? []) {
    const cfg = configDoServidor?.(s.id);
    if (!cfg?.log?.canalId) { semLog++; continue; }
    const canal = client.channels?.get?.(cfg.log.canalId) ?? await client.channels?.fetch?.(cfg.log.canalId).catch(() => null);
    if (!canal || canal.serverId !== s.id) { semLog++; continue; }   // o canal tem de ser do próprio servidor
    const lang = idiomaDaTela(cfg.language);
    const e0 = typeof embedPorIdioma === "function" ? embedPorIdioma(lang) : (embedPorIdioma?.[lang] ?? embedPorIdioma?.en);
    if (!e0) continue;
    const e = lang === "es" ? { ...e0, title: marcarTraduzido(e0.title), description: marcarTraduzido(e0.description) } : e0;
    try { await enviar(canal, e, s.id); enviados++; }
    catch (err) { falhas++; console.warn(`[ANUNCIO] ${s.id}: ${err?.message ?? err}`); }
  }
  return { enviados, semLog, falhas };
}

// Na subida. Devolve o que fez (para o log e os testes).
export async function anunciar({ client, global, salvarGlobal, configDoServidor, enviar, P = "&", COR = {}, lista = NOVIDADES }) {
  const topo = lista[0]?.id;
  if (!topo) return { enviados: 0, novas: 0 };
  const marca = global.novidadesAnunciadas;
  if (!marca) { global.novidadesAnunciadas = topo; salvarGlobal(); return { enviados: 0, novas: 0, primeira: true }; }
  const novas = novasDesde(marca, lista);
  if (!novas.length) {
    if (marca !== topo) { global.novidadesAnunciadas = topo; salvarGlobal(); }
    return { enviados: 0, novas: 0 };
  }
  global.novidadesAnunciadas = topo;   // antes do envio: um reinício no meio não repete
  salvarGlobal();
  const { enviados } = await anunciarNoLog(client, (lang) => embedNovidades(novas, lang, P, COR), { configDoServidor, enviar });
  return { enviados, novas: novas.length };
}
