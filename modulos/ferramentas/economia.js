// &economia — a moeda DO SERVIDOR (pedido de Ghieh, 1 out 2026).
//
// À parte do RPG (que agora é um mundo só, com duas moedas): aqui cada
// servidor tem UMA moeda própria, simples:
//   &economia minerar      → ganha um punhado, com espera entre uma e outra
//   &economia saldo [@x]   · &economia top · &economia pagar @x <qtd>
//   &economia loja         → cargos à venda · &economia comprar <cargo>
// Staff (ManageServer): &economia config …, &economia loja add|remover …,
//   &economia dar|tirar @x <qtd>, &economia zerar confirmar.
//
// O cargo só é cobrado se for entregue: o saldo sai, o cargo é dado, e se o
// Stoat recusar (cargo acima do bot, falta de AssignRoles) o dinheiro volta.

import * as db from "../core/db.js";
import { citarInterno, citar } from "../core/aliases.js";
import * as log from "../core/log.js";
import { lingua, textoDoIdioma, idiomaDaTela, tr } from "../core/i18n.js";
import { resolverUsuario, resolverCargo } from "../core/ids.js";
import { descreverErro } from "../core/erros.js";
import { planejarCargos } from "./nivel.js";
import { lerDuracao, duracaoTexto } from "../core/duracao.js";
import { quantiaValida } from "../core/seguranca.js";
import { editarCargos, podeUsarCargo } from "../core/hierarquia.js";

export const PADRAO = { nome: "Moeda", simbolo: "🪙", ganhoMin: 10, ganhoMax: 30, intervaloMs: 3600e3 };

// ── Banco ────────────────────────────────────────────────────────────────────
let pronto = false;
function tabelas() {
  if (pronto) return db.getDb();
  const d = db.getDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS eco_saldos (
      serverId TEXT NOT NULL, userId TEXT NOT NULL,
      saldo INTEGER NOT NULL DEFAULT 0,
      ultimaMineracao INTEGER NOT NULL DEFAULT 0,
      totalMinerado INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (serverId, userId)
    );
    CREATE INDEX IF NOT EXISTS eco_saldos_rank ON eco_saldos (serverId, saldo DESC);
    CREATE TABLE IF NOT EXISTS eco_loja (
      serverId TEXT NOT NULL, roleId TEXT NOT NULL,
      preco INTEGER NOT NULL, criadoEm INTEGER NOT NULL,
      PRIMARY KEY (serverId, roleId)
    );
  `);
  pronto = true;
  return d;
}
const linha = (sid, uid) => tabelas().prepare("SELECT * FROM eco_saldos WHERE serverId=? AND userId=?").get(sid, uid)
  ?? { serverId: sid, userId: uid, saldo: 0, ultimaMineracao: 0, totalMinerado: 0 };
const garantirLinha = (sid, uid) => tabelas().prepare("INSERT OR IGNORE INTO eco_saldos (serverId, userId) VALUES (?, ?)").run(sid, uid);

export function saldo(sid, uid) { return linha(sid, uid).saldo; }
export function creditar(sid, uid, qtd) {
  garantirLinha(sid, uid);
  tabelas().prepare("UPDATE eco_saldos SET saldo = saldo + ? WHERE serverId=? AND userId=?").run(Math.trunc(qtd), sid, uid);
  return saldo(sid, uid);
}
// Débito atômico: só tira se tiver. Devolve true/false.
export function debitar(sid, uid, qtd) {
  garantirLinha(sid, uid);
  return tabelas().prepare("UPDATE eco_saldos SET saldo = saldo - ? WHERE serverId=? AND userId=? AND saldo >= ?")
    .run(Math.trunc(qtd), sid, uid, Math.trunc(qtd)).changes === 1;
}
export function ranking(sid, limite = 10) {
  return tabelas().prepare("SELECT userId, saldo FROM eco_saldos WHERE serverId=? AND saldo > 0 ORDER BY saldo DESC, userId LIMIT ?").all(sid, limite);
}
export function posicao(sid, uid) {
  const s = saldo(sid, uid);
  if (s <= 0) return null;
  return tabelas().prepare("SELECT COUNT(*) n FROM eco_saldos WHERE serverId=? AND saldo > ?").get(sid, s).n + 1;
}
export function loja(sid) {
  return tabelas().prepare("SELECT roleId, preco FROM eco_loja WHERE serverId=? ORDER BY preco, roleId").all(sid);
}
export function totalEmCirculacao(sid) {
  return tabelas().prepare("SELECT COALESCE(SUM(saldo), 0) t, COUNT(*) n FROM eco_saldos WHERE serverId=? AND saldo > 0").get(sid);
}

// Mineração: um sorteio entre o mínimo e o máximo, e a espera.
export function minerar(sid, uid, cfg, { agora = Date.now(), aleatorio = Math.random } = {}) {
  const l = linha(sid, uid);
  const falta = (l.ultimaMineracao + cfg.intervaloMs) - agora;
  if (l.ultimaMineracao && falta > 0) return { ok: false, faltaMs: falta };
  const ganho = cfg.ganhoMin + Math.floor(aleatorio() * (cfg.ganhoMax - cfg.ganhoMin + 1));
  garantirLinha(sid, uid);
  tabelas().prepare("UPDATE eco_saldos SET saldo = saldo + ?, totalMinerado = totalMinerado + ?, ultimaMineracao = ? WHERE serverId=? AND userId=?")
    .run(ganho, ganho, agora, sid, uid);
  return { ok: true, ganho, saldo: saldo(sid, uid) };
}

export function configDe(config) {
  // o nome padrão no idioma do servidor ("Coin" em inglês), até a staff escolher um
  const nomePadrao = idiomaDaTela(config.language) === "es" ? "Moneda" : textoDoIdioma(config.language) === "en" ? "Coin" : PADRAO.nome;
  const atual = config.economia ?? {};
  config.economia = { ...PADRAO, nome: nomePadrao, ...atual };
  if (!atual.nomeEscolhido && (atual.nome === "Moeda" || atual.nome === "Coin" || atual.nome === "Moneda")) config.economia.nome = nomePadrao;
  return config.economia;
}

// ── Comando ──────────────────────────────────────────────────────────────────
const VERBOS = {
  minerar: ["minerar", "mine", "mina", "garimpar"],
  saldo: ["saldo", "balance", "carteira", "wallet"],
  top: ["top", "ranking", "rank", "placar", "leaderboard"],
  loja: ["loja", "shop", "store"],
  comprar: ["comprar", "buy"],
  pagar: ["pagar", "pay", "transferir", "enviar"],
  config: ["config", "configurar", "settings"],
  dar: ["dar", "give", "adicionar"],
  tirar: ["tirar", "take", "remover"],
  zerar: ["zerar", "reset", "resetar"],
  ajuda: ["ajuda", "help", "?"],
};
const verbo = (x) => Object.keys(VERBOS).find((k) => VERBOS[k].includes(String(x ?? "").toLowerCase())) ?? null;
const inteiro = (x) => { const n = Number(String(x ?? "").replace(/[._\s]/g, "")); return quantiaValida(n) ? n : NaN; };   // inteiro, positivo, com teto

export async function cmdEconomia(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, serverId: sid, getServer, membroTemPermissao, salvarConfig, client } = ctx;
  const en = lingua(ctx) === "en";
  const T = (pt, e, es) => tr(ctx, pt, e, es);
  const ce = (ref) => citar(ref, "es", P);   // o comando citado no espanhol
  const cfg = configDe(ctx.config);
  const $ = (n) => `${cfg.simbolo} **${Number(n).toLocaleString(en ? "en-US" : "pt-BR")}** ${cfg.nome}`;
  const eu = message.authorId;
  const v = verbo(args[0]) ?? (args.length ? null : "saldo");
  const resto = args.slice(1);
  const enviar = (title, description, colour = COR.info) => sendEmbed(message.channel, { title, description, colour });
  const server = await getServer(message).catch(() => null);
  const staff = () => membroTemPermissao(message, server, "ManageServer");
  const negar = () => enviar(T("🚫 Permissão insuficiente", "🚫 Missing permission", "🚫 Permiso insuficiente"),
    T("Isso é da staff: precisa de **ManageServer**.", "That's for staff: it needs **ManageServer**.", "Esto es del staff: hace falta **ManageServer**."), COR.erro);

  if (!v || v === "ajuda") {
    return enviar(T(`${cfg.simbolo} Economia do servidor`, `${cfg.simbolo} Server economy`, `${cfg.simbolo} Economía del servidor`), [
      T(`A moeda daqui é ${cfg.simbolo} **${cfg.nome}**.`, `This server's currency is ${cfg.simbolo} **${cfg.nome}**.`, `La moneda de aquí es ${cfg.simbolo} **${cfg.nome}**.`),
      "",
      T(`\`${citarInterno("economia.minerar", P)}\` — ganha de ${cfg.ganhoMin} a ${cfg.ganhoMax}, a cada ${duracaoTexto(cfg.intervaloMs)}`,
        `\`${citarInterno("economia.minerar", P)}\` — earn ${cfg.ganhoMin} to ${cfg.ganhoMax}, every ${duracaoTexto(cfg.intervaloMs, "en")}`,
        `\`${ce("economia.minerar")}\` — ganas de ${cfg.ganhoMin} a ${cfg.ganhoMax}, cada ${duracaoTexto(cfg.intervaloMs, "es")}`),
      T(`\`${citarInterno("economia.saldo", P)} [@pessoa]\` · \`${citarInterno("economia", P)} top\``,
        `\`${citarInterno("economia.saldo", P)} [@pessoa]\` · \`${citarInterno("economia", P)} top\``,
        `\`${ce("economia.saldo")} [@usuario]\` · \`${ce("economia")} top\``),
      T(`\`${citarInterno("economia.loja", P)}\` · \`${citarInterno("economia.comprar", P)} <cargo>\``,
        `\`${citarInterno("economia.loja", P)}\` · \`${citarInterno("economia.comprar", P)} <cargo>\``,
        `\`${ce("economia.loja")}\` · \`${ce("economia.comprar")} <rol>\``),
      T(`\`${citarInterno("economia.pagar", P)} @pessoa <quantia>\``, `\`${citarInterno("economia.pagar", P)} @pessoa <quantia>\``,
        `\`${ce("economia.pagar")} @usuario <cantidad>\``),
      "",
      T(`_Staff: \`${citarInterno("economia", P)} config\` · \`${citarInterno("economia.loja", P)} add <cargo> <preço>\` · \`${citarInterno("economia.dar", P)}|tirar @pessoa <quantia>\`_`,
        `_Staff: \`${citarInterno("economia", P)} config\` · \`${citarInterno("economia.loja", P)} add <role> <price>\` · \`${citarInterno("economia.dar", P)}|tirar @user <amount>\`_`,
        `_Staff: \`${ce("economia")} config\` · \`${ce("economia.loja")} add <rol> <precio>\` · \`${ce("economia.dar")} @usuario <cantidad>\` · \`${ce("economia.tirar")} @usuario <cantidad>\`_`),
    ].join("\n"));
  }

  if (v === "minerar") {
    const r = minerar(sid, eu, cfg);
    if (!r.ok) return enviar("⛏️", T(`Ainda cansado da última. Volte em **${duracaoTexto(r.faltaMs)}**.`, `Still tired from the last one. Come back in **${duracaoTexto(r.faltaMs, "en")}**.`,
      `Todavía cansado de la última. Vuelve en **${duracaoTexto(r.faltaMs, "es")}**.`), COR.aviso);
    return enviar("⛏️", T(`Você minerou ${$(r.ganho)}.\nSaldo: ${$(r.saldo)}`, `You mined ${$(r.ganho)}.\nBalance: ${$(r.saldo)}`, `Minaste ${$(r.ganho)}.\nSaldo: ${$(r.saldo)}`), COR.sucesso);
  }

  if (v === "saldo") {
    const quem = resto.length
      ? (await resolverUsuario(resto.join(" "), { message, server, client }).catch(() => null) ?? message.mentionIds?.[0] ?? eu)
      : eu;
    const l = linha(sid, quem);
    const pos = posicao(sid, quem);
    const pronto = !l.ultimaMineracao || Date.now() >= l.ultimaMineracao + cfg.intervaloMs;
    return enviar(T(`${cfg.simbolo} Saldo`, `${cfg.simbolo} Balance`, `${cfg.simbolo} Saldo`), [
      `<@${quem}>: ${$(l.saldo)}`,
      pos ? T(`🏆 ${pos}º lugar no servidor`, `🏆 #${pos} on the server`, `🏆 ${pos}º puesto en el servidor`) : null,
      quem === eu ? (pronto ? T(`⛏️ Dá para minerar agora: \`${citarInterno("economia.minerar", P)}\``, `⛏️ You can mine now: \`${citarInterno("economia.minerar", P)}\``, `⛏️ Ya puedes minar: \`${ce("economia.minerar")}\``)
        : T(`⛏️ Próxima mineração em ${duracaoTexto(l.ultimaMineracao + cfg.intervaloMs - Date.now())}`, `⛏️ Next mining in ${duracaoTexto(l.ultimaMineracao + cfg.intervaloMs - Date.now(), "en")}`,
          `⛏️ Próxima minería en ${duracaoTexto(l.ultimaMineracao + cfg.intervaloMs - Date.now(), "es")}`)) : null,
    ].filter(Boolean).join("\n"));
  }

  if (v === "top") {
    const lista = ranking(sid, 10);
    if (!lista.length) return enviar(T("🏆 Ranking", "🏆 Leaderboard", "🏆 Ranking"), T(`Ninguém tem ${cfg.nome} ainda. \`${citarInterno("economia.minerar", P)}\` para começar.`, `Nobody has any ${cfg.nome} yet. \`${citarInterno("economia.minerar", P)}\` to start.`,
      `Nadie tiene ${cfg.nome} todavía. \`${ce("economia.minerar")}\` para empezar.`));
    const medalha = ["🥇", "🥈", "🥉"];
    const meu = posicao(sid, eu);
    const tot = totalEmCirculacao(sid);
    return enviar(T(`🏆 Quem tem mais ${cfg.nome}`, `🏆 Who has the most ${cfg.nome}`, `🏆 Quién tiene más ${cfg.nome}`), [
      ...lista.map((x, i) => `${medalha[i] ?? `**${i + 1}.**`} <@${x.userId}> — ${$(x.saldo)}`),
      "",
      meu && meu > 10 ? T(`Você: ${meu}º, com ${$(saldo(sid, eu))}`, `You: #${meu}, with ${$(saldo(sid, eu))}`, `Tú: ${meu}º, con ${$(saldo(sid, eu))}`) : null,
      T(`_Em circulação: ${$(tot.t)} com ${tot.n} pessoa(s)._`, `_In circulation: ${$(tot.t)} across ${tot.n} people._`, `_En circulación: ${$(tot.t)} entre ${tot.n} persona(s)._`),
    ].filter((x) => x !== null).join("\n"));
  }

  if (v === "loja") {
    const sub = String(resto[0] ?? "").toLowerCase();
    if (["add", "adicionar", "vender", "por"].includes(sub)) {
      if (!staff()) return negar();
      const preco = inteiro(resto.at(-1));
      const cargo = resolverCargo(resto.slice(1, -1).join(" "), server);
      if (!cargo || !Number.isInteger(preco) || preco <= 0) return enviar(T("❌ Uso", "❌ Usage", "❌ Uso"), T(`\`${citarInterno("economia.loja", P)} add <cargo> <preço>\``, `\`${citarInterno("economia.loja", P)} add <cargo> <preço>\``,
        `\`${ce("economia.loja")} add <rol> <precio>\``), COR.erro);
      // quem põe na loja precisa estar ACIMA do cargo (15 out 2026)
      const pode = await podeUsarCargo(server, message, cargo.id, ctx);
      if (!pode.ok) return enviar(T("🚫 Cargo acima do seu", "🚫 Role above yours", "🚫 Rol por encima del tuyo"), T(`${pode.pt}.`, `${pode.en}.`, `${pode.es ?? pode.en}.`), COR.erro);
      tabelas().prepare("INSERT INTO eco_loja (serverId, roleId, preco, criadoEm) VALUES (?, ?, ?, ?) ON CONFLICT(serverId, roleId) DO UPDATE SET preco=excluded.preco")
        .run(sid, cargo.id, preco, Date.now());
      // Avisa já se o bot não consegue entregar esse cargo
      const plano = planejarCargos({ server, botMember: server?.member ?? null, member: { roles: [] }, faltando: [cargo.id] });
      const aviso = plano.botSemCargo || plano.acimaDoBot.length
        ? T("\n\n⚠️ Esse cargo está **acima do cargo do bot** — ninguém vai conseguir comprar até você subir o cargo do bot.", "\n\n⚠️ This role is **above the bot's role** — nobody can buy it until you move the bot's role up.",
          "\n\n⚠️ Este rol está **por encima del rol del bot** — nadie podrá comprarlo hasta que subas el rol del bot.") : "";
      return enviar(T("🛒 Na loja", "🛒 In the shop", "🛒 En la tienda"), `<%${cargo.id}> — ${$(preco)}${aviso}`, aviso ? COR.aviso : COR.sucesso);
    }
    if (["remover", "tirar", "remove", "del"].includes(sub)) {
      if (!staff()) return negar();
      const cargo = resolverCargo(resto.slice(1).join(" "), server);
      const n = cargo ? tabelas().prepare("DELETE FROM eco_loja WHERE serverId=? AND roleId=?").run(sid, cargo.id).changes : 0;
      return enviar("🛒", n ? T(`<%${cargo.id}> saiu da loja.`, `<%${cargo.id}> left the shop.`, `<%${cargo.id}> salió de la tienda.`) : T("Esse cargo não está na loja.", "That role isn't in the shop.", "Ese rol no está en la tienda."), n ? COR.sucesso : COR.aviso);
    }
    const itens = loja(sid);
    return enviar(T("🛒 Loja de cargos", "🛒 Role shop", "🛒 Tienda de roles"), itens.length
      ? [...itens.map((x) => `<%${x.roleId}> — ${$(x.preco)}`), "", T(`\`${citarInterno("economia.comprar", P)} <cargo>\` · seu saldo: ${$(saldo(sid, eu))}`,
        `\`${citarInterno("economia.comprar", P)} <cargo>\` · your balance: ${$(saldo(sid, eu))}`, `\`${ce("economia.comprar")} <rol>\` · tu saldo: ${$(saldo(sid, eu))}`)].join("\n")
      : T(`A loja está vazia.${staff() ? `\n\n\`${citarInterno("economia.loja", P)} add <cargo> <preço>\`` : ""}`, `The shop is empty.${staff() ? `\n\n\`${citarInterno("economia.loja", P)} add <role> <price>\`` : ""}`,
        `La tienda está vacía.${staff() ? `\n\n\`${ce("economia.loja")} add <rol> <precio>\`` : ""}`));
  }

  if (v === "comprar") {
    const cargo = resolverCargo(resto.join(" "), server);
    const item = cargo ? loja(sid).find((x) => x.roleId === cargo.id) : null;
    if (!item) return enviar(T("❓ Qual cargo?", "❓ Which role?", "❓ ¿Qué rol?"), T(`Esse cargo não está à venda. Veja \`${citarInterno("economia.loja", P)}\`.`, `That role isn't for sale. See \`${citarInterno("economia.loja", P)}\`.`,
      `Ese rol no está a la venta. Mira \`${ce("economia.loja")}\`.`), COR.aviso);
    const member = await server?.fetchMember?.(eu).catch(() => null);
    if (!member) return enviar("❌", T("Não consegui te achar no servidor.", "I couldn't find you on the server.", "No te encontré en el servidor."), COR.erro);
    const atuais = (member.roles ?? []).map((r) => r?.id ?? r);
    if (atuais.includes(item.roleId)) return enviar("🛒", T(`Você já tem <%${item.roleId}>.`, `You already have <%${item.roleId}>.`, `Ya tienes <%${item.roleId}>.`));
    const tem = saldo(sid, eu);
    if (tem < item.preco) return enviar("🛒", T(`Faltam ${$(item.preco - tem)} para <%${item.roleId}>.`, `You're ${$(item.preco - tem)} short for <%${item.roleId}>.`, `Te faltan ${$(item.preco - tem)} para <%${item.roleId}>.`), COR.aviso);
    const plano = planejarCargos({ server, botMember: server?.member ?? null, member, faltando: [item.roleId] });
    if (!plano.dar.length) {
      return enviar("🛒", plano.membroAcima
        ? T("Seu cargo está na altura do cargo do bot ou acima — o Stoat não deixa ele te dar cargos. Nada foi cobrado.", "Your role sits at or above the bot's — the Stoat won't let it give you roles. Nothing was charged.",
          "Tu rol está a la altura del rol del bot o por encima — Stoat no le deja darte roles. No se cobró nada.")
        : T("O bot não consegue entregar esse cargo (ele está acima do cargo do bot). Nada foi cobrado — avise a staff.", "The bot can't hand out that role (it's above the bot's role). Nothing was charged — tell the staff.",
          "El bot no puede entregar ese rol (está por encima del rol del bot). No se cobró nada — avisa al staff."), COR.aviso);
    }
    if (!debitar(sid, eu, item.preco)) return enviar("🛒", T("Seu saldo mudou no meio do caminho. Tente de novo.", "Your balance changed midway. Try again.", "Tu saldo cambió a mitad de camino. Inténtalo de nuevo."), COR.aviso);
    try {
      await editarCargos(server, member, (a) => [...a, item.roleId]);
    } catch (e) {
      creditar(sid, eu, item.preco);   // não entregou: devolve
      return enviar("❌", T(`O Stoat recusou o cargo (${descreverErro(e)}). Seu dinheiro foi devolvido.`, `The Stoat refused the role (${descreverErro(e, "en")}). Your money was refunded.`,
        `Stoat rechazó el rol (${descreverErro(e, "es")}). Se te devolvió el dinero.`), COR.erro);
    }
    await log.registrar(ctx, "cargos", { titulo: "🛒 Cargo comprado", descricao: `<@${eu}> comprou <%${item.roleId}> por ${item.preco} ${cfg.nome}.`,
      en: { titulo: "🛒 Role bought", descricao: `<@${eu}> bought <%${item.roleId}> for ${item.preco} ${cfg.nome}.` },
      es: { titulo: "🛒 Rol comprado", descricao: `<@${eu}> compró <%${item.roleId}> por ${item.preco} ${cfg.nome}.` } }).catch(() => {});
    return enviar("🛒", T(`Agora você tem <%${item.roleId}>! Saldo: ${$(saldo(sid, eu))}`, `You now have <%${item.roleId}>! Balance: ${$(saldo(sid, eu))}`, `¡Ahora tienes <%${item.roleId}>! Saldo: ${$(saldo(sid, eu))}`), COR.sucesso);
  }

  if (v === "pagar") {
    const alvo = (resto[0] ? await resolverUsuario(resto[0], { message, server, client }).catch(() => null) : null) ?? message.mentionIds?.[0] ?? null;
    const qtd = inteiro(resto.at(-1));
    if (!alvo || !Number.isInteger(qtd) || qtd <= 0) return enviar(T("❌ Uso", "❌ Usage", "❌ Uso"), T(`\`${citarInterno("economia.pagar", P)} @pessoa <quantia>\``, `\`${citarInterno("economia.pagar", P)} @pessoa <quantia>\``,
      `\`${ce("economia.pagar")} @usuario <cantidad>\``), COR.erro);
    if (alvo === eu) return enviar("🤨", T("Pagar a si mesmo não muda nada.", "Paying yourself changes nothing.", "Pagarte a ti mismo no cambia nada."), COR.aviso);
    if (!debitar(sid, eu, qtd)) return enviar("💸", T(`Você só tem ${$(saldo(sid, eu))}.`, `You only have ${$(saldo(sid, eu))}.`, `Solo tienes ${$(saldo(sid, eu))}.`), COR.aviso);
    creditar(sid, alvo, qtd);
    return enviar("💸", T(`<@${eu}> pagou ${$(qtd)} a <@${alvo}>.`, `<@${eu}> paid ${$(qtd)} to <@${alvo}>.`, `<@${eu}> pagó ${$(qtd)} a <@${alvo}>.`), COR.sucesso);
  }

  if (v === "dar" || v === "tirar") {
    if (!staff()) return negar();
    const alvo = message.mentionIds?.[0] ?? await resolverUsuario(resto[0] ?? "", { message, server, client }).catch(() => null);
    const qtd = inteiro(resto.at(-1));
    if (!alvo || !Number.isInteger(qtd) || qtd <= 0) return enviar(T("❌ Uso", "❌ Usage", "❌ Uso"), T(`\`${citarInterno("economia", P)} ${v} @pessoa <quantia>\``, `\`${citarInterno("economia", P)} ${v} @pessoa <quantia>\``,
      `\`${ce(`economia.${v}`)} @usuario <cantidad>\``), COR.erro);
    if (v === "dar") creditar(sid, alvo, qtd);
    else { const tem = saldo(sid, alvo); debitar(sid, alvo, Math.min(tem, qtd)); }
    return enviar("🏦", T(`${v === "dar" ? "Dei" : "Tirei"} ${$(qtd)} ${v === "dar" ? "a" : "de"} <@${alvo}>. Saldo: ${$(saldo(sid, alvo))}`,
      `${v === "dar" ? "Gave" : "Took"} ${$(qtd)} ${v === "dar" ? "to" : "from"} <@${alvo}>. Balance: ${$(saldo(sid, alvo))}`,
      `${v === "dar" ? "Di" : "Quité"} ${$(qtd)} a <@${alvo}>. Saldo: ${$(saldo(sid, alvo))}`), COR.sucesso);
  }

  if (v === "zerar") {
    if (!staff()) return negar();
    if (!resto.includes("confirmar") && !resto.includes("confirm")) {
      const tot = totalEmCirculacao(sid);
      return enviar(T("⚠️ Zerar a economia", "⚠️ Reset the economy", "⚠️ Reiniciar la economía"), T(`Apaga ${$(tot.t)} de ${tot.n} pessoa(s). A loja fica.\n\n\`${citarInterno("economia.zerar.confirmar", P)}\``, `Erases ${$(tot.t)} from ${tot.n} people. The shop stays.\n\n\`${citarInterno("economia.zerar.confirmar", P)}\``,
        `Borra ${$(tot.t)} de ${tot.n} persona(s). La tienda se queda.\n\n\`${ce("economia.zerar.confirmar")}\``), COR.aviso);
    }
    const n = tabelas().prepare("DELETE FROM eco_saldos WHERE serverId=?").run(sid).changes;
    return enviar("🔄", T(`Economia zerada (${n} carteira(s)).`, `Economy reset (${n} wallet(s)).`, `Economía reiniciada (${n} cartera(s)).`), COR.sucesso);
  }

  if (v === "config") {
    const campo = String(resto[0] ?? "").toLowerCase();
    const valor = resto.slice(1);
    if (campo && !staff()) return negar();
    if (campo === "nome" || campo === "name") { if (valor.length) { cfg.nome = valor.join(" ").slice(0, 32); cfg.nomeEscolhido = true; } }
    else if (campo === "simbolo" || campo === "símbolo" || campo === "symbol") { if (valor[0]) cfg.simbolo = valor[0].slice(0, 16); }
    else if (campo === "ganho" || campo === "gain") {
      const a = inteiro(valor[0]), b = inteiro(valor[1] ?? valor[0]);
      if (!(a >= 1 && b >= a)) return enviar(T("❌ Uso", "❌ Usage", "❌ Uso"), T(`\`${citarInterno("economia", P)} config ganho <mín> <máx>\``, `\`${citarInterno("economia", P)} config ganho <mín> <máx>\``,
        `\`${ce("economia")} config gain <mín> <máx>\``), COR.erro);
      cfg.ganhoMin = a; cfg.ganhoMax = b;
    } else if (campo === "intervalo" || campo === "espera" || campo === "cooldown") {
      const ms = lerDuracao(valor.join(""));
      if (!ms || ms < 60e3) return enviar(T("❌ Uso", "❌ Usage", "❌ Uso"), T(`\`${citarInterno("economia", P)} config intervalo <tempo>\` — ex.: \`30m\`, \`2h\`, \`1d\` (mínimo 1 min)`, `\`${citarInterno("economia", P)} config intervalo <time>\` — e.g. \`30m\`, \`2h\`, \`1d\` (1 min minimum)`,
        `\`${ce("economia")} config interval <tiempo>\` — p. ej.: \`30m\`, \`2h\`, \`1d\` (mínimo 1 min)`), COR.erro);
      cfg.intervaloMs = ms;
    } else if (campo) {
      return enviar(T("❓ Campo desconhecido", "❓ Unknown field", "❓ Campo desconocido"), T("`nome` · `simbolo` · `ganho` · `intervalo`", "`nome` · `simbolo` · `ganho` · `intervalo`", "`name` · `symbol` · `gain` · `interval`"), COR.aviso);
    }
    if (campo) salvarConfig?.();
    return enviar(T(`${cfg.simbolo} Configuração da economia`, `${cfg.simbolo} Economy settings`, `${cfg.simbolo} Configuración de la economía`), [
      T(`**Moeda:** ${cfg.simbolo} ${cfg.nome}`, `**Currency:** ${cfg.simbolo} ${cfg.nome}`, `**Moneda:** ${cfg.simbolo} ${cfg.nome}`),
      T(`**Mineração:** ${cfg.ganhoMin}–${cfg.ganhoMax} a cada ${duracaoTexto(cfg.intervaloMs, en ? "en" : "pt")}`, `**Mining:** ${cfg.ganhoMin}–${cfg.ganhoMax} every ${duracaoTexto(cfg.intervaloMs, en ? "en" : "pt")}`,
        `**Minería:** ${cfg.ganhoMin}–${cfg.ganhoMax} cada ${duracaoTexto(cfg.intervaloMs, "es")}`),
      T(`**Loja:** ${loja(sid).length} cargo(s)`, `**Shop:** ${loja(sid).length} role(s)`, `**Tienda:** ${loja(sid).length} rol(es)`),
      "",
      T(`\`${citarInterno("economia", P)} config nome <nome>\` · \`simbolo <emoji>\` · \`ganho <mín> <máx>\` · \`intervalo <tempo>\``,
        `\`${citarInterno("economia", P)} config nome <nome>\` · \`simbolo <emoji>\` · \`ganho <mín> <máx>\` · \`intervalo <tempo>\``,
        `\`${ce("economia")} config name <nombre>\` · \`symbol <emoji>\` · \`gain <mín> <máx>\` · \`interval <tiempo>\``),
    ].join("\n"), campo ? COR.sucesso : COR.info);
  }
}
