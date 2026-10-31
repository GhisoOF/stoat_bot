// &game — o RPG (P2, 31 out 2026: "simplificação absurda" pedida por Ghieh).
//
// O motor (regras.js, combate.js, missoes.js, tesouro.js, evolucionador.js) fica;
// a superfície encolheu para 10 comandos + admin:
//   &game · criar <nome> · build [nome] · missao [@amigos] · chefe [@amigos]
//   comprar [n|item] · aliado [nome] · duelo @pessoa [ouro] · top · apagar
//
// Este arquivo só despacha: um mapa sub → handler, os nomes antigos como apelidos
// (ou uma linha dizendo que saíram), e `semPersonagem()` uma vez.
//   jogador.js  ficha, criar, build, comprar, aliado, top, apagar
//   lutas.js    missão e chefe (solo e co-op com ✅), o pós-luta automático
//   duelo.js    o PvP com aposta em ouro
//   admin.js    as ferramentas do dono do bot
//   wiki.js     as páginas do `&tutorial rpg`, geradas dos dados
// A era (`mundo:v5`, sem apagar a antiga) está em era.js.

import * as db from "../core/db.js";
import { registrarErro } from "../core/erros.js";
import { semear as semearConteudo } from "./conteudo.js";
import * as TS from "./tesouro.js";
import * as DU from "./duelo.js";
import * as J from "./jogador.js";
import { cmdLuta, aoReagir as reagirConvite } from "./lutas.js";
import { cmdAdmin } from "./admin.js";
import { ERA } from "./era.js";
import { T, cmd, idioma, enviar } from "./telas.js";

export { apagarJogadorTodasAsEras } from "./era.js";
export { paginasWikiRpg } from "./wiki.js";

// ── O boot ───────────────────────────────────────────────────────────────────
let semeado = false;
let RPG_FECHADO = null;   // a etapa do boot que falhou (o jogo fica fechado)
export const rpgFechado = () => RPG_FECHADO;
// (Regra do Reparo) qualquer falha no boot do jogo fecha o jogo e vai para o log
export function iniciarCatalogo() {
  if (semeado && !RPG_FECHADO) return;
  RPG_FECHADO = null;
  const etapa = (nome, fn) => { try { return fn(); } catch (e) { RPG_FECHADO ??= nome; registrarErro("RPG", e); return null; } };
  const n = etapa("catálogo", () => semearConteudo(db));
  etapa("ouro", () => TS.garantirOuro());
  if (n && !RPG_FECHADO) { semeado = true; console.log(`[RPG] catálogo pronto (${n.itens} item(ns), ${n.companheiros} aliado(s)) · era ${ERA}`); }
}

// ── O mapa ───────────────────────────────────────────────────────────────────
// sub → handler. `precisa`: o handler só roda com personagem (semPersonagem() é aqui, uma vez)
const HANDLERS = {
  ficha:   { precisa: false, fn: (g) => ficha(g) },
  criar:   { precisa: false, fn: J.criar },
  build:   { precisa: true,  fn: J.build },
  missao:  { precisa: true,  fn: (g) => cmdLuta(g, "missao") },
  chefe:   { precisa: true,  fn: (g) => cmdLuta(g, "chefe") },
  comprar: { precisa: true,  fn: J.comprar },
  aliado:  { precisa: true,  fn: J.aliado },
  duelo:   { precisa: false, fn: (g) => DU.cmdDuelo(g.message, g.args, g.ctx, g.l) },
  top:     { precisa: false, fn: J.top },
  apagar:  { precisa: true,  fn: J.apagar },
  admin:   { precisa: false, fn: cmdAdmin },
};
export const SUBCOMANDOS = Object.keys(HANDLERS);
// Os nomes de antes que ainda têm para onde ir (a ajuda mostra só o nome principal)
export const APELIDOS = {
  perfil: "ficha", status: "ficha",
  // (P2.5) o que a pessoa leva (itens, magias) está na montagem da build
  itens: "build", inventario: "build", "inventário": "build", mochila: "build", item: "build", equipamento: "build", equipo: "build", gear: "build",
  magia: "build", magias: "build", grimorio: "build", "grimório": "build", hechizos: "build", spells: "build",
  builds: "build", classes: "build", montagem: "build",
  carteira: "ficha", saldo: "ficha", historia: "ficha", "história": "ficha", energia: "ficha",
  moedas: "ficha", story: "ficha",
  novo: "criar", comecar: "criar", "começar": "criar", start: "criar", crear: "criar",
  classe: "build",
  "missão": "missao", missoes: "missao", "missões": "missao", quest: "missao", contrato: "missao", contratos: "missao", bico: "missao", bicos: "missao",
  especial: "missao", especiais: "missao", dungeon: "missao", dungeons: "missao", coop: "missao", "co-op": "missao", grupo: "missao", resgatar: "missao", resgate: "missao",
  chamado: "missao", group: "missao", "misión": "missao", misiones: "missao",
  chefes: "chefe", boss: "chefe", jefe: "chefe", jefes: "chefe",
  loja: "comprar", catalogo: "comprar", "catálogo": "comprar", "itens-jogo": "comprar", "ficha-item": "comprar", preco: "comprar", "preço": "comprar", price: "comprar", tienda: "comprar",
  contratar: "aliado", recrutar: "aliado", recrutas: "aliado", mercenarios: "aliado", "mercenários": "aliado", follower: "aliado", followers: "aliado",
  companheiro: "aliado", companheiros: "aliado", party: "aliado", equipe: "aliado", aliados: "aliado",
  ranking: "top", rank: "top",
  deletar: "apagar", resetar: "apagar", reset: "apagar", borrar: "apagar",
  debug: "admin",
  duelar: "duelo", desafiar: "duelo", desafio: "duelo", pvp: "duelo",
};
// O que saiu do jogo (decisão de Ghieh: uma moeda, sem trocas entre jogadores)
export const SAIU = new Set(["mercado", "bazar", "p2p", "cambio", "câmbio", "taxas", "banco", "trocar", "escambo", "permuta", "vender", "moeda", "descansar", "descanso", "fotos", "album", "imagem"]);
// O que a build faz sozinha
export const AUTOMATICO = new Set(["pontos", "ponto", "distribuir", "upar", "equipar", "desequipar", "vestir", "usar", "tirar", "remover", "aprender", "evoluir", "respec", "redistribuir", "prever", "refazer", "auto"]);
export const subDe = (palavra) => (HANDLERS[palavra] ? palavra : APELIDOS[palavra] ?? null);

// ── A ficha (a sua ou a de um membro deste servidor) ────────────────────────
async function ficha(g) {
  const { message, args, ctx, eu, l, P, COR, responder, erro } = g;
  // `&game @pessoa` · `&game ficha @pessoa`; os outros apelidos (itens, carteira…) mostram a sua
  const entrada = J.mencaoOuId(g.palavra) ? args[0] : ["ficha", "perfil", "status"].includes(g.palavra) ? args[1] : undefined;
  const alvo = entrada ? J.mencaoOuId(entrada) : eu;
  if (!alvo) return erro(T(l, "Use uma menção ou um ID.", "Use a mention or an ID.", "Usa una mención o un ID."));
  if (alvo !== eu) {
    const server = await Promise.resolve(ctx.getServer?.(message)).catch(() => null);
    const membro = await Promise.resolve(server?.fetchMember?.(alvo)).catch(() => null);
    if (!membro) return erro(T(l, "Essa pessoa não está neste servidor.", "That person isn't on this server.", "Esa persona no está en este servidor."));
  }
  const p = db.getPersonagem(ERA, alvo);
  if (!p) return alvo === eu ? g.semPersonagem() : responder({ title: "🎭", colour: COR.aviso, description: T(l, "Essa pessoa não tem personagem.", "That person has no character.", "Esa persona no tiene personaje.") });
  return responder(J.ficha(p, l, COR));
}

// ── O despacho ───────────────────────────────────────────────────────────────
export async function cmdGame(message, args, ctx) {
  const { COR, PREFIXO: P } = ctx;
  const l = idioma(ctx), eu = message.authorId;
  const responder = (e) => enviar(ctx, message.channel, l, e);
  const erro = (desc) => responder({ title: "❌", colour: COR.erro, description: desc });
  if (RPG_FECHADO) return responder({ title: T(l, "🛠️ RPG em manutenção", "🛠️ RPG under maintenance", "🛠️ RPG en mantenimiento"), colour: COR.aviso,
    description: T(l, "Nada foi perdido.", "Nothing was lost.", "No se perdió nada.") });
  if (!ctx.serverId) return erro(T(l, "O RPG funciona dentro de um servidor.", "The RPG works inside a server.", "El RPG funciona dentro de un servidor."));

  const palavra = String(args[0] ?? "").toLowerCase();
  if (SAIU.has(palavra)) return responder({ title: "ℹ️", colour: COR.aviso, description: T(l, "Isso saiu do jogo.", "That's no longer in the game.", "Eso ya no está en el juego.") });
  // "resetar pontos" era o respec (o "resetar" sozinho é o apagar)
  if (AUTOMATICO.has(palavra) || (["resetar", "reset"].includes(palavra) && ["pontos", "atributos"].includes(String(args[1] ?? "").toLowerCase()))) return responder({ title: "⚙️", colour: COR.info,
    description: T(l, `Automático pela build — \`${cmd(l, "game.build", P)}\`.`, `Automatic from the build — \`${cmd(l, "game.build", P)}\`.`, `Automático por la build — \`${cmd(l, "game.build", P)}\`.`) });
  if (["ajuda", "comandos"].includes(palavra)) return responder({ title: "🎲", colour: COR.info, description: `\`${cmd(l, "help", P)} game\`` });
  const sub = !palavra || J.mencaoOuId(palavra) ? "ficha" : subDe(palavra);
  if (!sub) return erro(T(l, `Subcomando desconhecido — \`${cmd(l, "help", P)} game\`.`, `Unknown subcommand — \`${cmd(l, "help", P)} game\`.`, `Subcomando desconocido — \`${cmd(l, "help", P)} game\`.`));

  try { DU.expirar(); } catch (e) { registrarErro("DUELO", e); }
  const h = HANDLERS[sub];
  const p = db.getPersonagem(ERA, eu);
  const semPersonagem = () => responder({ title: T(l, "🎭 Sem personagem", "🎭 No character", "🎭 Sin personaje"), colour: COR.aviso,
    description: `\`${cmd(l, "game.criar", P)} <${T(l, "nome", "name", "nombre")}>\`` });
  if (h.precisa && !p) return semPersonagem();
  return h.fn({ message, args, ctx, eu, p, l, P, COR, sub, palavra, responder, erro, semPersonagem });
}

// Reação numa mensagem do jogo (convite de co-op, desafio de duelo) — o main.js chama
export async function aoReagir(msgId, userId, emoji) {
  if (await reagirConvite(msgId, userId, emoji)) return true;
  return DU.aoReagir(msgId, userId, emoji);
}
