// Novidades da Judy: o anúncio de atualização no canal de log (20 out 2026).
//
// Cada pacote novo traz UMA entrada no topo desta lista, escrita para quem usa o
// bot (não para quem programa), nos três idiomas. Na subida, a Judy anuncia o que
// ainda não anunciou nos servidores que ligaram `&log atualizacoes on` (começa
// desligado) — uma vez só: a marca do último anunciado fica na config global, e é
// gravada ANTES do envio (um reinício no meio não repete o anúncio).
//
// A primeira subida com esta lista só grava a marca: ninguém tinha como ter ligado
// a opção antes, e o que já existia não é novidade.

import { idiomaDaTela } from "../core/i18n.js";
import { citar, citarNoTexto } from "../core/aliases.js";

// A mais nova primeiro. `id` nunca muda (é a marca); `data` é só para a tela.
// Comandos no texto vão como a marca de citação (chave, &, comando.sub, chave — ex.:
// a do &privacidade apagar, mais abaixo) e viram o nome no idioma do servidor. Não
// escreva a marca de exemplo num comentário: o verificar-build lê toda marca como
// citação, e uma inventada aborta o build do Docker (aconteceu do P5 ao P7).
export const NOVIDADES = [
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

// As entradas mais novas que `marca` (a mais nova primeiro). Marca desconhecida
// (entrada removida da lista): nada — não dá para saber o que é novo.
export function novasDesde(marca, lista = NOVIDADES) {
  const i = lista.findIndex((n) => n.id === marca);
  return i < 0 ? [] : lista.slice(0, i);
}

export function embedNovidades(novas, lang, P = "&", COR = {}) {
  const t = { pt: "🆕 Novidades da Judy", en: "🆕 What's new in Judy", es: "🆕 Novedades de Judy" }[lang] ?? "🆕 What's new in Judy";
  const desligar = `\`${citar("log.atualizacoes", lang, P)} off\``;
  const rodape = { pt: `_Para não receber mais: ${desligar}_`, en: `_To stop receiving these: ${desligar}_`, es: `_Para no recibir más: ${desligar}_` }[lang];
  const corpo = novas.map((n) => `**${n.data}**\n${citarNoTexto(n[lang] ?? n.en, lang, P)}`).join("\n\n");
  const max = 1900 - rodape.length;
  return { title: t, description: `${corpo.length > max ? corpo.slice(0, max - 1) + "…" : corpo}\n\n${rodape}`, colour: COR.info };
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
  let enviados = 0;
  for (const s of client?.servers?.values?.() ?? []) {
    const cfg = configDoServidor(s.id);
    if (!cfg?.log?.canalId || cfg.log.eventos?.atualizacoes !== true) continue;
    const canal = client.channels?.get?.(cfg.log.canalId) ?? await client.channels?.fetch?.(cfg.log.canalId).catch(() => null);
    if (!canal || canal.serverId !== s.id) continue;   // o canal tem de ser do próprio servidor
    try { await enviar(canal, embedNovidades(novas, idiomaDaTela(cfg.language), P, COR)); enviados++; }
    catch (e) { console.warn(`[NOVIDADES] ${s.id}: ${e?.message ?? e}`); }
  }
  return { enviados, novas: novas.length };
}
