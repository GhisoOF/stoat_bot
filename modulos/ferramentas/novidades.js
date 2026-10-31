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
    id: "2026-10-31-p2",
    pacote: "P2",
    data: "2026-10-31",
    pt: "• **Comandos mais simples:** `{&help}` abre a página certa de cada comando; `{&config}` reúne log, idioma, acesso, comandos e IA (os nomes antigos continuam valendo). Novos: `{&unban}` e `{&untimeout}` (número da lista, menção, ID ou nome). As respostas ficaram curtas e saem inteiras em espanhol.\n• **Privacidade num lugar só:** `{&privacidade}` — o que é guardado, sair da conversa ou do XP, esquecer, apagar tudo. Para falar com a Judy, basta chamá-la pelo nome.\n• **Horários** aparecem na hora de quem lê; `{&fuso} 21:30 Madrid` converte. **RSS** virou telejornal: um resumo por dia (`{&rss.horario} 21:00`) e o urgente na hora.\n• **RPG recomeçou, bem mais simples:** `{&game.criar}` com um nome e uma build (`{&game.build}`, 18 delas); pontos, equipamento e magias são automáticos; uma moeda só. O personagem antigo fica guardado até 29 jan 2027.",
    en: "• **Simpler commands:** `{&help}` opens the right page for each command; `{&config}` gathers log, language, access, commands and AI (the old names still work). New: `{&unban}` and `{&untimeout}` (list number, mention, ID or name). Replies are short and fully in Spanish on Spanish servers.\n• **Privacy in one place:** `{&privacidade}` — what is kept, leave the chat or XP, forget, erase everything. To talk to Judy, just call her by name.\n• **Times** show in the reader's own time; `{&fuso} 21:30 Madrid` converts. **RSS** became a newscast: one summary a day (`{&rss.horario} 21:00`) and urgent items right away.\n• **The RPG restarted, much simpler:** `{&game.criar}` with a name and a build (`{&game.build}`, 18 of them); points, gear and spells are automatic; one currency. Your old character is kept until 29 Jan 2027.",
    es: "• **Comandos más simples:** `{&help}` abre la página correcta de cada comando; `{&config}` reúne log, idioma, acceso, comandos e IA (los nombres antiguos siguen valiendo). Nuevos: `{&unban}` y `{&untimeout}` (número de la lista, mención, ID o nombre). Las respuestas son cortas y salen enteras en español.\n• **Privacidad en un solo lugar:** `{&privacidade}` — lo que se guarda, salir de la conversación o del XP, olvidar, borrar todo. Para hablar con Judy, basta con llamarla por su nombre.\n• **Los horarios** aparecen en la hora de quien lee; `{&fuso} 21:30 Madrid` convierte. **El RSS** pasó a ser un noticiero: un resumen al día (`{&rss.horario} 21:00`) y lo urgente al momento.\n• **El RPG empezó de nuevo, mucho más simple:** `{&game.criar}` con un nombre y una build (`{&game.build}`, 18); puntos, equipo y hechizos son automáticos; una sola moneda. Tu personaje anterior se guarda hasta el 29 ene 2027.",
  },
  {
    id: "2026-10-31-seguranca",
    pacote: "P1",   // (P2) a trava do build: o topo tem de ser o pacote de docs/pacote.json
    data: "2026-10-31",
    pt: "• **Privacidade:** a Judy só lembra do que você diz **a ela**, e a busca automática não pesquisa pessoas. `{&chat.esquecer.tudo}` apaga só a memória deste servidor; `{&chat.cuidado}` agora é só para você mesmo.\n• **Moderação:** alertas da staff vão só para o canal de log/sentinela deste servidor. `{&banglobal}` e `{&userinfo}` não mostram mais dados de outros servidores, e ban automático de outro servidor só alerta. O cargo de staff segue moderando, mas a configuração (`{&automod}`, `{&log}`, `{&acesso}`…) e os cargos passam a exigir a permissão do próprio Stoat.\n• **Webhooks:** a URL do gancho chega por DM. **Tickets:** até 20 abertos por servidor. **RSS:** `{&rss.agora}` a cada 5 min.\n• Mensagens de erro ficaram curtas, sem detalhe interno.",
    en: "• **Privacy:** Judy only remembers what you say **to her**, and the automatic search doesn't look people up. `{&chat.esquecer.tudo}` erases only this server's memory; `{&chat.cuidado}` is now only for yourself.\n• **Moderation:** staff alerts go only to this server's log/sentinel channel. `{&banglobal}` and `{&userinfo}` no longer show other servers' data, and another server's automatic ban only alerts. The staff role still moderates, but configuration (`{&automod}`, `{&log}`, `{&acesso}`…) and roles now need Stoat's own permission.\n• **Webhooks:** the hook URL arrives by DM. **Tickets:** up to 20 open per server. **RSS:** `{&rss.agora}` every 5 min.\n• Error messages are short, with no internal detail.",
    es: "• **Privacidad:** Judy solo recuerda lo que le dices **a ella**, y la búsqueda automática no busca personas. `{&chat.esquecer.tudo}` borra solo la memoria de este servidor; `{&chat.cuidado}` ahora es solo para ti.\n• **Moderación:** las alertas del staff van solo al canal de log/centinela de este servidor. `{&banglobal}` y `{&userinfo}` ya no muestran datos de otros servidores, y el ban automático de otro servidor solo alerta. El rol de staff sigue moderando, pero la configuración (`{&automod}`, `{&log}`, `{&acesso}`…) y los roles pasan a exigir el permiso del propio Stoat.\n• **Webhooks:** la URL del gancho llega por DM. **Tickets:** hasta 20 abiertos por servidor. **RSS:** `{&rss.agora}` cada 5 min.\n• Los mensajes de error son cortos, sin detalles internos.",
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
    pt: "• **Privacidade:** a memória da IA agora é opt-in — a Judy pergunta antes de lembrar de você. `{&privacidade}` mostra o que ela guarda; `{&privacidade.apagar}` apaga tudo.\n• **XP:** ao ligar, a Judy avisa o servidor, e `{&xp.sair}` deixa você de fora.\n• **Relatório de ataques:** o servidor pode mandar ao dono da Judy um relatório anônimo (`{&log.relatorio} on`).\n• **Este anúncio:** `{&log.atualizacoes} on` traz as novidades da Judy para este canal.",
    en: "• **Privacy:** AI memory is now opt-in — Judy asks before remembering you. `{&privacidade}` shows what she keeps; `{&privacidade.apagar}` erases it all.\n• **XP:** when it's turned on, Judy tells the server, and `{&xp.sair}` keeps you out.\n• **Attack report:** a server can send Judy's owner an anonymous report (`{&log.relatorio} on`).\n• **This announcement:** `{&log.atualizacoes} on` brings Judy's news to this channel.",
    es: "• **Privacidad:** la memoria de la IA ahora es opt-in — Judy pregunta antes de recordarte. `{&privacidade}` muestra lo que guarda; `{&privacidade.apagar}` lo borra todo.\n• **XP:** al activarlo, Judy avisa al servidor, y `{&xp.sair}` te deja fuera.\n• **Informe de ataques:** el servidor puede enviar al dueño de Judy un informe anónimo (`{&log.relatorio} on`).\n• **Este anuncio:** `{&log.atualizacoes} on` trae las novedades de Judy a este canal.",
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
