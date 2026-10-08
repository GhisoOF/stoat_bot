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
import * as log from "../core/log.js";
import { lingua } from "../core/i18n.js";
import { resolverUsuario, resolverCargo } from "../core/ids.js";
import { descreverErro } from "../core/erros.js";
import { planejarCargos } from "./nivel.js";
import { lerDuracao, duracaoTexto } from "../core/duracao.js";
import { quantiaValida } from "../core/seguranca.js";
import { editarCargos } from "../core/hierarquia.js";

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
  const nomePadrao = config.language === "en" ? "Coin" : PADRAO.nome;
  const atual = config.economia ?? {};
  config.economia = { ...PADRAO, nome: nomePadrao, ...atual };
  if (!atual.nomeEscolhido && (atual.nome === "Moeda" || atual.nome === "Coin")) config.economia.nome = nomePadrao;
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
  const T = (pt, e) => (en ? e : pt);
  const cfg = configDe(ctx.config);
  const $ = (n) => `${cfg.simbolo} **${Number(n).toLocaleString(en ? "en-US" : "pt-BR")}** ${cfg.nome}`;
  const eu = message.authorId;
  const v = verbo(args[0]) ?? (args.length ? null : "saldo");
  const resto = args.slice(1);
  const enviar = (title, description, colour = COR.info) => sendEmbed(message.channel, { title, description, colour });
  const server = await getServer(message).catch(() => null);
  const staff = () => membroTemPermissao(message, server, "ManageServer");
  const negar = () => enviar(T("🚫 Permissão insuficiente", "🚫 Missing permission"),
    T("Isso é da staff: precisa de **ManageServer**.", "That's for staff: it needs **ManageServer**."), COR.erro);

  if (!v || v === "ajuda") {
    return enviar(T(`${cfg.simbolo} Economia do servidor`, `${cfg.simbolo} Server economy`), [
      T(`A moeda daqui é ${cfg.simbolo} **${cfg.nome}**.`, `This server's currency is ${cfg.simbolo} **${cfg.nome}**.`),
      "",
      `\`${P}economia minerar\` — ${T(`ganha de ${cfg.ganhoMin} a ${cfg.ganhoMax}, a cada ${duracaoTexto(cfg.intervaloMs)}`, `earn ${cfg.ganhoMin} to ${cfg.ganhoMax}, every ${duracaoTexto(cfg.intervaloMs, "en")}`)}`,
      `\`${P}economia saldo [@pessoa]\` · \`${P}economia top\``,
      `\`${P}economia loja\` · \`${P}economia comprar <cargo>\``,
      `\`${P}economia pagar @pessoa <quantia>\``,
      "",
      T(`_Staff: \`${P}economia config\` · \`${P}economia loja add <cargo> <preço>\` · \`${P}economia dar|tirar @pessoa <quantia>\`_`,
        `_Staff: \`${P}economia config\` · \`${P}economia loja add <role> <price>\` · \`${P}economia dar|tirar @user <amount>\`_`),
    ].join("\n"));
  }

  if (v === "minerar") {
    const r = minerar(sid, eu, cfg);
    if (!r.ok) return enviar("⛏️", T(`Ainda cansado da última. Volte em **${duracaoTexto(r.faltaMs)}**.`, `Still tired from the last one. Come back in **${duracaoTexto(r.faltaMs, "en")}**.`), COR.aviso);
    return enviar("⛏️", T(`Você minerou ${$(r.ganho)}.\nSaldo: ${$(r.saldo)}`, `You mined ${$(r.ganho)}.\nBalance: ${$(r.saldo)}`), COR.sucesso);
  }

  if (v === "saldo") {
    const quem = resto.length
      ? (await resolverUsuario(resto.join(" "), { message, server, client }).catch(() => null) ?? message.mentionIds?.[0] ?? eu)
      : eu;
    const l = linha(sid, quem);
    const pos = posicao(sid, quem);
    const pronto = !l.ultimaMineracao || Date.now() >= l.ultimaMineracao + cfg.intervaloMs;
    return enviar(T(`${cfg.simbolo} Saldo`, `${cfg.simbolo} Balance`), [
      `<@${quem}>: ${$(l.saldo)}`,
      pos ? T(`🏆 ${pos}º lugar no servidor`, `🏆 #${pos} on the server`) : null,
      quem === eu ? (pronto ? T(`⛏️ Dá para minerar agora: \`${P}economia minerar\``, `⛏️ You can mine now: \`${P}economia minerar\``)
        : T(`⛏️ Próxima mineração em ${duracaoTexto(l.ultimaMineracao + cfg.intervaloMs - Date.now())}`, `⛏️ Next mining in ${duracaoTexto(l.ultimaMineracao + cfg.intervaloMs - Date.now(), "en")}`)) : null,
    ].filter(Boolean).join("\n"));
  }

  if (v === "top") {
    const lista = ranking(sid, 10);
    if (!lista.length) return enviar(T("🏆 Ranking", "🏆 Leaderboard"), T(`Ninguém tem ${cfg.nome} ainda. \`${P}economia minerar\` para começar.`, `Nobody has any ${cfg.nome} yet. \`${P}economia minerar\` to start.`));
    const medalha = ["🥇", "🥈", "🥉"];
    const meu = posicao(sid, eu);
    const tot = totalEmCirculacao(sid);
    return enviar(T(`🏆 Quem tem mais ${cfg.nome}`, `🏆 Who has the most ${cfg.nome}`), [
      ...lista.map((x, i) => `${medalha[i] ?? `**${i + 1}.**`} <@${x.userId}> — ${$(x.saldo)}`),
      "",
      meu && meu > 10 ? T(`Você: ${meu}º, com ${$(saldo(sid, eu))}`, `You: #${meu}, with ${$(saldo(sid, eu))}`) : null,
      T(`_Em circulação: ${$(tot.t)} com ${tot.n} pessoa(s)._`, `_In circulation: ${$(tot.t)} across ${tot.n} people._`),
    ].filter((x) => x !== null).join("\n"));
  }

  if (v === "loja") {
    const sub = String(resto[0] ?? "").toLowerCase();
    if (["add", "adicionar", "vender", "por"].includes(sub)) {
      if (!staff()) return negar();
      const preco = inteiro(resto.at(-1));
      const cargo = resolverCargo(resto.slice(1, -1).join(" "), server);
      if (!cargo || !Number.isInteger(preco) || preco <= 0) return enviar(T("❌ Uso", "❌ Usage"), `\`${P}economia loja add <cargo> <preço>\``, COR.erro);
      tabelas().prepare("INSERT INTO eco_loja (serverId, roleId, preco, criadoEm) VALUES (?, ?, ?, ?) ON CONFLICT(serverId, roleId) DO UPDATE SET preco=excluded.preco")
        .run(sid, cargo.id, preco, Date.now());
      // Avisa já se o bot não consegue entregar esse cargo
      const plano = planejarCargos({ server, botMember: server?.member ?? null, member: { roles: [] }, faltando: [cargo.id] });
      const aviso = plano.botSemCargo || plano.acimaDoBot.length
        ? T("\n\n⚠️ Esse cargo está **acima do cargo do bot** — ninguém vai conseguir comprar até você subir o cargo do bot.", "\n\n⚠️ This role is **above the bot's role** — nobody can buy it until you move the bot's role up.") : "";
      return enviar(T("🛒 Na loja", "🛒 In the shop"), `<%${cargo.id}> — ${$(preco)}${aviso}`, aviso ? COR.aviso : COR.sucesso);
    }
    if (["remover", "tirar", "remove", "del"].includes(sub)) {
      if (!staff()) return negar();
      const cargo = resolverCargo(resto.slice(1).join(" "), server);
      const n = cargo ? tabelas().prepare("DELETE FROM eco_loja WHERE serverId=? AND roleId=?").run(sid, cargo.id).changes : 0;
      return enviar("🛒", n ? T(`<%${cargo.id}> saiu da loja.`, `<%${cargo.id}> left the shop.`) : T("Esse cargo não está na loja.", "That role isn't in the shop."), n ? COR.sucesso : COR.aviso);
    }
    const itens = loja(sid);
    return enviar(T("🛒 Loja de cargos", "🛒 Role shop"), itens.length
      ? [...itens.map((x) => `<%${x.roleId}> — ${$(x.preco)}`), "", `\`${P}economia comprar <cargo>\` · ${T("seu saldo", "your balance")}: ${$(saldo(sid, eu))}`].join("\n")
      : T(`A loja está vazia.${staff() ? `\n\n\`${P}economia loja add <cargo> <preço>\`` : ""}`, `The shop is empty.${staff() ? `\n\n\`${P}economia loja add <role> <price>\`` : ""}`));
  }

  if (v === "comprar") {
    const cargo = resolverCargo(resto.join(" "), server);
    const item = cargo ? loja(sid).find((x) => x.roleId === cargo.id) : null;
    if (!item) return enviar(T("❓ Qual cargo?", "❓ Which role?"), T(`Esse cargo não está à venda. Veja \`${P}economia loja\`.`, `That role isn't for sale. See \`${P}economia loja\`.`), COR.aviso);
    const member = await server?.fetchMember?.(eu).catch(() => null);
    if (!member) return enviar("❌", T("Não consegui te achar no servidor.", "I couldn't find you on the server."), COR.erro);
    const atuais = (member.roles ?? []).map((r) => r?.id ?? r);
    if (atuais.includes(item.roleId)) return enviar("🛒", T(`Você já tem <%${item.roleId}>.`, `You already have <%${item.roleId}>.`));
    const tem = saldo(sid, eu);
    if (tem < item.preco) return enviar("🛒", T(`Faltam ${$(item.preco - tem)} para <%${item.roleId}>.`, `You're ${$(item.preco - tem)} short for <%${item.roleId}>.`), COR.aviso);
    const plano = planejarCargos({ server, botMember: server?.member ?? null, member, faltando: [item.roleId] });
    if (!plano.dar.length) {
      return enviar("🛒", plano.membroAcima
        ? T("Seu cargo está na altura do cargo do bot ou acima — o Stoat não deixa ele te dar cargos. Nada foi cobrado.", "Your role sits at or above the bot's — the Stoat won't let it give you roles. Nothing was charged.")
        : T("O bot não consegue entregar esse cargo (ele está acima do cargo do bot). Nada foi cobrado — avise a staff.", "The bot can't hand out that role (it's above the bot's role). Nothing was charged — tell the staff."), COR.aviso);
    }
    if (!debitar(sid, eu, item.preco)) return enviar("🛒", T("Seu saldo mudou no meio do caminho. Tente de novo.", "Your balance changed midway. Try again."), COR.aviso);
    try {
      await editarCargos(server, member, (a) => [...a, item.roleId]);
    } catch (e) {
      creditar(sid, eu, item.preco);   // não entregou: devolve
      return enviar("❌", T(`O Stoat recusou o cargo (${descreverErro(e)}). Seu dinheiro foi devolvido.`, `The Stoat refused the role (${descreverErro(e, "en")}). Your money was refunded.`), COR.erro);
    }
    await log.registrar(ctx, "cargos", { titulo: "🛒 Cargo comprado", descricao: `<@${eu}> comprou <%${item.roleId}> por ${item.preco} ${cfg.nome}.` }).catch(() => {});
    return enviar("🛒", T(`Agora você tem <%${item.roleId}>! Saldo: ${$(saldo(sid, eu))}`, `You now have <%${item.roleId}>! Balance: ${$(saldo(sid, eu))}`), COR.sucesso);
  }

  if (v === "pagar") {
    const alvo = (resto[0] ? await resolverUsuario(resto[0], { message, server, client }).catch(() => null) : null) ?? message.mentionIds?.[0] ?? null;
    const qtd = inteiro(resto.at(-1));
    if (!alvo || !Number.isInteger(qtd) || qtd <= 0) return enviar(T("❌ Uso", "❌ Usage"), `\`${P}economia pagar @pessoa <quantia>\``, COR.erro);
    if (alvo === eu) return enviar("🤨", T("Pagar a si mesmo não muda nada.", "Paying yourself changes nothing."), COR.aviso);
    if (!debitar(sid, eu, qtd)) return enviar("💸", T(`Você só tem ${$(saldo(sid, eu))}.`, `You only have ${$(saldo(sid, eu))}.`), COR.aviso);
    creditar(sid, alvo, qtd);
    return enviar("💸", T(`<@${eu}> pagou ${$(qtd)} a <@${alvo}>.`, `<@${eu}> paid ${$(qtd)} to <@${alvo}>.`), COR.sucesso);
  }

  if (v === "dar" || v === "tirar") {
    if (!staff()) return negar();
    const alvo = message.mentionIds?.[0] ?? await resolverUsuario(resto[0] ?? "", { message, server, client }).catch(() => null);
    const qtd = inteiro(resto.at(-1));
    if (!alvo || !Number.isInteger(qtd) || qtd <= 0) return enviar(T("❌ Uso", "❌ Usage"), `\`${P}economia ${v} @pessoa <quantia>\``, COR.erro);
    if (v === "dar") creditar(sid, alvo, qtd);
    else { const tem = saldo(sid, alvo); debitar(sid, alvo, Math.min(tem, qtd)); }
    return enviar("🏦", T(`${v === "dar" ? "Dei" : "Tirei"} ${$(qtd)} ${v === "dar" ? "a" : "de"} <@${alvo}>. Saldo: ${$(saldo(sid, alvo))}`,
      `${v === "dar" ? "Gave" : "Took"} ${$(qtd)} ${v === "dar" ? "to" : "from"} <@${alvo}>. Balance: ${$(saldo(sid, alvo))}`), COR.sucesso);
  }

  if (v === "zerar") {
    if (!staff()) return negar();
    if (!resto.includes("confirmar") && !resto.includes("confirm")) {
      const tot = totalEmCirculacao(sid);
      return enviar(T("⚠️ Zerar a economia", "⚠️ Reset the economy"), T(`Apaga ${$(tot.t)} de ${tot.n} pessoa(s). A loja fica.\n\n\`${P}economia zerar confirmar\``, `Erases ${$(tot.t)} from ${tot.n} people. The shop stays.\n\n\`${P}economia zerar confirmar\``), COR.aviso);
    }
    const n = tabelas().prepare("DELETE FROM eco_saldos WHERE serverId=?").run(sid).changes;
    return enviar("🔄", T(`Economia zerada (${n} carteira(s)).`, `Economy reset (${n} wallet(s)).`), COR.sucesso);
  }

  if (v === "config") {
    const campo = String(resto[0] ?? "").toLowerCase();
    const valor = resto.slice(1);
    if (campo && !staff()) return negar();
    if (campo === "nome" || campo === "name") { if (valor.length) { cfg.nome = valor.join(" ").slice(0, 32); cfg.nomeEscolhido = true; } }
    else if (campo === "simbolo" || campo === "símbolo" || campo === "symbol") { if (valor[0]) cfg.simbolo = valor[0].slice(0, 16); }
    else if (campo === "ganho" || campo === "gain") {
      const a = inteiro(valor[0]), b = inteiro(valor[1] ?? valor[0]);
      if (!(a >= 1 && b >= a)) return enviar(T("❌ Uso", "❌ Usage"), `\`${P}economia config ganho <mín> <máx>\``, COR.erro);
      cfg.ganhoMin = a; cfg.ganhoMax = b;
    } else if (campo === "intervalo" || campo === "espera" || campo === "cooldown") {
      const ms = lerDuracao(valor.join(""));
      if (!ms || ms < 60e3) return enviar(T("❌ Uso", "❌ Usage"), T(`\`${P}economia config intervalo <tempo>\` — ex.: \`30m\`, \`2h\`, \`1d\` (mínimo 1 min)`, `\`${P}economia config intervalo <time>\` — e.g. \`30m\`, \`2h\`, \`1d\` (1 min minimum)`), COR.erro);
      cfg.intervaloMs = ms;
    } else if (campo) {
      return enviar(T("❓ Campo desconhecido", "❓ Unknown field"), "`nome` · `simbolo` · `ganho` · `intervalo`", COR.aviso);
    }
    if (campo) salvarConfig?.();
    return enviar(T(`${cfg.simbolo} Configuração da economia`, `${cfg.simbolo} Economy settings`), [
      `**${T("Moeda", "Currency")}:** ${cfg.simbolo} ${cfg.nome}`,
      `**${T("Mineração", "Mining")}:** ${cfg.ganhoMin}–${cfg.ganhoMax} ${T("a cada", "every")} ${duracaoTexto(cfg.intervaloMs, en ? "en" : "pt")}`,
      `**${T("Loja", "Shop")}:** ${loja(sid).length} ${T("cargo(s)", "role(s)")}`,
      "",
      `\`${P}economia config nome <nome>\` · \`simbolo <emoji>\` · \`ganho <mín> <máx>\` · \`intervalo <tempo>\``,
    ].join("\n"), campo ? COR.sucesso : COR.info);
  }
}
