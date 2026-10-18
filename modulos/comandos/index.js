// O registro de comandos (fase 1, 17 out 2026).
//
// Cada comando é declarado UMA vez, num arquivo desta pasta (um por família).
// Tudo o que antes era escrito à mão em vários lugares sai daqui: as rotas e os
// apelidos do main.js, o nome mostrado na tela em inglês e os apelidos do
// aliases.js, e as listas soltas (gerenciáveis, só de IA, de voz, essenciais).
//
// O formato de uma entrada:
//
//   export default {
//     id: "warn",                  // o nome interno — o que o banco e o `&comando desativar` guardam.
//                                  // NUNCA renomear: servidores antigos têm esse nome salvo.
//     modulo: "../moderacao/warn.js", funcao: "cmdWarn",   // onde está o handler
//     nomes: { en: "warn" },       // o nome na tela de cada idioma (sem a chave, o id)
//     apelidos: ["avisar"],        // outros nomes que levam ao MESMO comando
//     es: { nome: "advertir", subcomandos: { lista: "lista", limpar: "borrar" } },
//                                  // espanhol (etapa 4): o nome e as palavras na tela de um servidor
//                                  //   em espanhol; também valem ao digitar, em qualquer servidor
//     subcomandos: {               // nome interno do subcomando → nome(s) em inglês. O inglês
//       lista: "list",             //   digitado vira o nome interno antes do handler, e a tela em
//       limpar: ["clear", "wipe"], //   inglês mostra o primeiro. ["status"] = mesmo nome nos dois.
//     },
//     aninhados: ["setup"],        // subcomandos que têm mais um nível traduzido (`&xp setup canal`)
//     naTela: { aqui: "here" },    // só a tela: o handler já aceita as duas palavras
//     familias: { sentinela: { subcomandos, naTela } },  // níveis dentro do comando (vira "automod.sentinela")
//     partes: { punicao: { en: "punishment", subcomandos } }, // partes citadas sozinhas (`&help punicao`)
//     gerenciavel: true,           // o admin pode desligar com `&comando desativar`
//     soIA: true,                  // só existe onde a IA roda (&chat, &modia)
//     voz: true,                   // vale dentro da call, mesmo fora dos canais liberados
//     essencial: true,             // nunca é desligado (a ajuda, o próprio &comando…)
//     qualquerCanal: true,         // vale até nos canais onde o &acesso restringe os comandos
//     textoLivre: true,            // os argumentos são texto livre: `<div>` ou `‹algo›` não é molde da ajuda
//     ajuda: {                     // a página `&help warn` (fase 3) — sai daqui, não do geral.js
//       perm: "ManageMessages",
//       uso: { pt: "{&warn} <@pessoa> [motivo]", en: "{&warn} <@user> [reason]" },
//       desc: { pt: "…", en: "…", es: "…" }, ex: { pt: "…", en: "…", es: "…" },   // texto solto vale para todos
//       parametros: [{ nome: { pt: "[motivo]", en: "[reason]" }, desc: { pt: "…", en: "…" } }],
//     },
//   };
//
// Citação por referência (fase 3): nos textos do registro, `{&warn.lista}` vira
// `&warn lista` / `&warn list`; no código, `citar("warn.lista", lang, P)` (aliases.js).
// Referência a comando ou subcomando que não existe é erro — o verificar-build.js
// confere todas.
//
// O handler vem por caminho + nome (e não por import) de propósito: assim este
// registro não carrega módulo nenhum, e o aliases.js pode lê-lo no carregamento
// sem ciclo. O `montarTabela()` importa os handlers no boot; o
// `scripts/verificar-build.js` confere no build que cada caminho e cada export existem.
//
// Um arquivo pode exportar uma lista de entradas (o voz.js tem &tts, &entrar e &sair).
//
// Desde a fase 2 todos os subcomandos também moram aqui. O &automod tem ainda
// `familias` (os níveis dentro dele: `&automod sentinela assuntos …`) e `partes`
// (as que têm tabela própria: `&help punishment ladder`). A fase 3 traz para cá a
// página de ajuda (`ajuda`), uma família por vez: o que já tem `ajuda` não tem
// mais cópia no geral.js nem no help-parametros.js.
//
// Arquivo novo nesta pasta tem de entrar na lista abaixo — a suíte comandos-17out
// falha se sobrar arquivo fora dela.

import ping from "./ping.js";
import repete from "./repete.js";
import userinfo from "./userinfo.js";
import kick from "./kick.js";
import ban from "./ban.js";
import silenciar from "./silenciar.js";
import limpar from "./limpar.js";
import warn from "./warn.js";
import acesso from "./acesso.js";
import automod from "./automod.js";
import tutorial from "./tutorial.js";
import assistente from "./assistente.js";
import cor from "./cor.js";
import log from "./log.js";
import banglobal from "./banglobal.js";
import embed from "./embed.js";
import reactionrole from "./reactionrole.js";
import chat from "./chat.js";
import rss from "./rss.js";
import xp from "./xp.js";
import game from "./game.js";
import autorole from "./autorole.js";
import staff from "./staff.js";
import boasvindas from "./boasvindas.js";
import adeus from "./adeus.js";
import fuso from "./fuso.js";
import voz from "./voz.js";
import musica from "./musica.js";
import webhook from "./webhook.js";
import rolar from "./rolar.js";
import iniciativa from "./iniciativa.js";
import ticket from "./ticket.js";
import economia from "./economia.js";
import entretenimento from "./entretenimento.js";
import servidor from "./servidor.js";
import help from "./help.js";
import sobre from "./sobre.js";
import personalidade from "./personalidade.js";
import config from "./config.js";
import servidores from "./servidores.js";
import comando from "./comando.js";
import cargomudo from "./cargomudo.js";
import debug from "./debug.js";
import modia from "./modia.js";
import reset from "./reset.js";
import idioma from "./idioma.js";

// A ordem desta lista é a ordem das rotas e da lista de gerenciáveis do `&comando`.
export const REGISTRO = [
  ping, repete, userinfo, kick, ban, silenciar, limpar, warn, acesso, automod,
  tutorial, assistente, cor, log, banglobal, embed, reactionrole, chat, rss, xp,
  game, autorole, staff, boasvindas, adeus, fuso, voz, musica, webhook, rolar,
  iniciativa, ticket, economia, entretenimento, servidor, help, sobre, personalidade,
  config, servidores, comando, cargomudo, debug, modia, reset, idioma,
].flat();

// ── O que só depende dos nomes (o aliases.js usa; não toca nos handlers) ──

// Os nomes em espanhol (etapa 4, 18 out 2026): `es: { nome, subcomandos }`. O nome
// em espanhol também é digitável em qualquer servidor, como os apelidos.
const nomesEs = (c) => [c.es?.nome, ...(c.es?.apelidos ?? [])].filter((n) => n && n !== c.id && !(c.apelidos ?? []).includes(n));

// id → nome na tela em inglês (inclui as partes que o texto antigo cita sozinhas)
export const COMANDO_EN = Object.fromEntries(REGISTRO.flatMap((c) => [
  ...(c.nomes?.en ? [[c.id, c.nomes.en]] : []),
  ...Object.entries(c.partes ?? {}).filter(([, n]) => n.en).map(([id, n]) => [id, n.en]),
]));

// id → nome na tela em espanhol (sem nome próprio, a tela usa o inglês)
export const COMANDO_ES = Object.fromEntries(REGISTRO.filter((c) => c.es?.nome).map((c) => [c.id, c.es.nome]));

// apelido → id (todos os apelidos, de todos os comandos, e os nomes em espanhol)
export const COMANDO_EXTRA = Object.fromEntries(REGISTRO.flatMap((c) => [...(c.apelidos ?? []), ...nomesEs(c)].map((a) => [a, c.id])));

// Os problemas do registro (vazio = íntegro). O boot para se houver algum: um
// nome em dois comandos faria um deles sumir em silêncio.
export function problemasDoRegistro(registro = REGISTRO) {
  const problemas = [];
  const dono = new Map();
  for (const c of registro) {
    if (!c || typeof c.id !== "string" || !c.id) { problemas.push(`entrada sem id: ${JSON.stringify(c)?.slice(0, 80)}`); continue; }
    if (typeof c.funcao !== "function" && !(typeof c.modulo === "string" && typeof c.funcao === "string")) problemas.push(`${c.id}: precisa de modulo + funcao (ou funcao local)`);
    for (const nome of [c.id, ...(c.apelidos ?? []), ...nomesEs(c)]) {
      if (nome !== nome.toLowerCase() || /\s/.test(nome)) problemas.push(`${c.id}: o nome "${nome}" precisa ser minúsculo e sem espaço`);
      if (dono.has(nome)) problemas.push(`"${nome}" está em ${dono.get(nome)} e em ${c.id}`);
      else dono.set(nome, c.id);
    }
  }
  return problemas;
}

// A tabela que o main.js usa. Só aqui os handlers são carregados (no boot).
export async function montarTabela(registro = REGISTRO) {
  const problemas = problemasDoRegistro(registro);
  if (problemas.length) throw new Error(`registro de comandos inválido:\n  ${problemas.join("\n  ")}`);
  const rotas = {}, CANONICO = {};
  for (const c of registro) {
    const fn = typeof c.funcao === "function" ? c.funcao : (await import(new URL(c.modulo, import.meta.url)))[c.funcao];
    if (typeof fn !== "function") throw new Error(`registro de comandos: ${c.id} — ${c.modulo} não exporta a função ${c.funcao}`);
    rotas[c.id] = fn;
    for (const a of [...(c.apelidos ?? []), ...nomesEs(c)]) { rotas[a] = fn; CANONICO[a] = c.id; }
  }
  const comFlag = (f) => registro.filter((c) => c[f]).map((c) => c.id);
  return {
    rotas, CANONICO,
    COMANDOS_GERENCIAVEIS: comFlag("gerenciavel"),
    COMANDOS_SO_IA: new Set(comFlag("soIA")),
    COMANDOS_DE_VOZ: new Set(comFlag("voz")),
    ESSENCIAIS: new Set(comFlag("essencial")),
    SEMPRE_LIBERADOS: new Set(comFlag("qualquerCanal")),
    TEXTO_LIVRE: new Set(comFlag("textoLivre")),
  };
}
