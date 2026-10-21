// O assistente de criação de servidor (21 out 2026): `&assistente servidor`.
//
// A pessoa escolhe um modelo (Comunidade, Gaming, Estudo, Mínimo) e dois ajustes (canais
// de voz? canal de divulgação?). O bot mostra a prévia, e só depois do `confirmar` cria os
// cargos, as categorias e os canais com as permissões já feitas:
//   • 📢 só a staff escreve (regras, avisos, boas-vindas): Padrão nega Enviar mensagens
//   • 🔒 só a staff vê (staff-chat, registro): Padrão nega Ver canal
//   • 💬 o resto: sem mexer
// A staff e o cargo "Bots" (que a Judy recebe) ganham a permissão de volta nos canais
// fechados — é por ele que a Judy escreve no #registro e no #boas-vindas. (Não dá para
// pôr a permissão no cargo da PRÓPRIA Judy: o Stoat recusa mexer no cargo de quem está
// na mesma altura — o mesmo motivo do cargo do ticket.)
//
// Regras (decisão do Ghieh):
//   • só ADICIONA: nada que já existe é apagado, renomeado ou tem a permissão mexida.
//     Cargo ou canal com o mesmo nome é reaproveitado como está;
//   • se der errado no meio, desfaz o que ESTA rodada criou e diz o que faltou;
//   • no fim, segue para o `&assistente completo` com o registro, as boas-vindas, a staff
//     e o cargo automático já respondidos (pelos canais e cargos daqui).
import { Permission } from "stoat.js";
import { editarCargos } from "../core/hierarquia.js";
import { descreverErro } from "../core/erros.js";

const P = Permission;
// o que cada cargo novo pode no servidor (o Stoat só deixa o bot dar o que ELE tem: o
// resto sai da conta e aparece na prévia)
const PERMS_CARGO = {
  staff: ["KickMembers", "BanMembers", "TimeoutMembers", "ManageMessages", "ManageNicknames", "RemoveAvatars",
    "MuteMembers", "DeafenMembers", "MoveMembers"],
  ajudante: ["ManageMessages", "TimeoutMembers"],
  membro: [],
  bots: [],
};
const VER = P.ViewChannel | P.ReadMessageHistory;
const ESCREVER = P.SendMessage | P.SendEmbeds | P.UploadFiles | P.React;

// Os textos de cada idioma: [pt, en, es]. Nomes de canal sem acento e sem espaço (o
// jeito que se digita `#boas-vindas`); nomes de cargo e de categoria como se lê.
const N = {
  cargo: {
    staff:    ["Moderação", "Moderators", "Moderación"],
    ajudante: ["Ajudante", "Helper", "Ayudante"],
    membro:   ["Membro", "Member", "Miembro"],
    bots:     ["Bots", "Bots", "Bots"],
  },
  categoria: {
    info:       ["📌 Informações", "📌 Information", "📌 Información"],
    comunidade: ["💬 Comunidade", "💬 Community", "💬 Comunidad"],
    jogos:      ["🎮 Jogos", "🎮 Games", "🎮 Juegos"],
    estudos:    ["📚 Estudos", "📚 Study", "📚 Estudio"],
    geral:      ["💬 Geral", "💬 General", "💬 General"],
    voz:        ["🔊 Voz", "🔊 Voice", "🔊 Voz"],
    staff:      ["🔒 Staff", "🔒 Staff", "🔒 Staff"],
  },
  canal: {
    regras:      ["regras", "rules", "reglas"],
    avisos:      ["avisos", "announcements", "anuncios"],
    boasvindas:  ["boas-vindas", "welcome", "bienvenida"],
    geral:       ["geral", "general", "general"],
    offtopic:    ["off-topic", "off-topic", "off-topic"],
    midia:       ["midia", "media", "multimedia"],
    divulgacao:  ["divulgacao", "promo", "promocion"],
    grupo:       ["procurando-grupo", "looking-for-group", "buscando-grupo"],
    clipes:      ["clipes", "clips", "clips"],
    duvidas:     ["duvidas", "questions", "dudas"],
    materiais:   ["materiais", "resources", "materiales"],
    staffchat:   ["staff-chat", "staff-chat", "staff-chat"],
    registro:    ["registro", "logs", "registro"],
    vozPapo:     ["Bate-papo", "Hangout", "Charla"],
    vozSala2:    ["Sala 2", "Room 2", "Sala 2"],
    squad1:      ["Squad 1", "Squad 1", "Squad 1"],
    squad2:      ["Squad 2", "Squad 2", "Squad 2"],
    squad3:      ["Squad 3", "Squad 3", "Squad 3"],
    vozEstudo:   ["Sala de estudo", "Study room", "Sala de estudio"],
    vozFoco:     ["Foco", "Focus", "Enfoque"],
    vozUnica:    ["Voz", "Voice", "Voz"],
  },
  desc: {
    regras:     ["As regras do servidor. Leia antes de participar.", "The server rules. Read them before joining in.", "Las reglas del servidor. Léelas antes de participar."],
    avisos:     ["Novidades e avisos da staff.", "News and announcements from the staff.", "Novedades y avisos del staff."],
    boasvindas: ["Quem chega é recebido aqui.", "Newcomers are greeted here.", "Aquí se recibe a quien llega."],
    divulgacao: ["Divulgue seu servidor, canal ou projeto. Convites liberados aqui.", "Promote your server, channel or project. Invites are allowed here.", "Promociona tu servidor, canal o proyecto. Aquí se permiten invitaciones."],
    staffchat:  ["Conversa da staff.", "Staff talk.", "Charla del staff."],
    registro:   ["O registro da Judy: punições, entradas e saídas.", "Judy's log: punishments, joins and leaves.", "El registro de Judy: sanciones, entradas y salidas."],
  },
  modelo: {
    comunidade: ["Comunidade", "Community", "Comunidad"],
    gaming:     ["Gaming", "Gaming", "Gaming"],
    estudo:     ["Estudo", "Study", "Estudio"],
    minimo:     ["Mínimo", "Minimal", "Mínimo"],
  },
};
const I = (lang) => (lang === "es" ? 2 : lang === "en" ? 1 : 0);

// acesso: "geral" (sem mexer) · "leitura" (só a staff escreve) · "staff" (só a staff vê)
// papel: o que o assistente completo recebe já respondido (log, boas-vindas)
const C = (chave, acesso = "geral", extra = {}) => ({ chave, acesso, tipo: "Text", ...extra });
const V = (chave) => ({ chave, acesso: "geral", tipo: "Voice" });
const INFO = (comAvisos = true) => ({ chave: "info", canais: [C("regras", "leitura", { papel: "regras" }), ...(comAvisos ? [C("avisos", "leitura")] : []), C("boasvindas", "leitura", { papel: "boasvindas" })] });
const STAFF = (comChat = true) => ({ chave: "staff", canais: [...(comChat ? [C("staffchat", "staff")] : []), C("registro", "staff", { papel: "log" })] });

export const MODELOS = {
  comunidade: {
    cargos: ["staff", "ajudante", "membro", "bots"],
    categorias: [INFO(), { chave: "comunidade", canais: [C("geral"), C("offtopic"), C("midia"), C("divulgacao", "geral", { opcional: "divulgacao" })] }, { chave: "voz", opcional: "voz", canais: [V("vozPapo"), V("vozSala2")] }, STAFF()],
  },
  gaming: {
    cargos: ["staff", "ajudante", "membro", "bots"],
    categorias: [INFO(), { chave: "jogos", canais: [C("geral"), C("grupo"), C("clipes"), C("divulgacao", "geral", { opcional: "divulgacao" })] }, { chave: "voz", opcional: "voz", canais: [V("squad1"), V("squad2"), V("squad3")] }, STAFF()],
  },
  estudo: {
    cargos: ["staff", "ajudante", "membro", "bots"],
    categorias: [INFO(), { chave: "estudos", canais: [C("geral"), C("duvidas"), C("materiais"), C("divulgacao", "geral", { opcional: "divulgacao" })] }, { chave: "voz", opcional: "voz", canais: [V("vozEstudo"), V("vozFoco")] }, STAFF()],
  },
  minimo: {
    cargos: ["staff", "membro", "bots"],
    categorias: [INFO(false), { chave: "geral", canais: [C("geral"), C("divulgacao", "geral", { opcional: "divulgacao" })] }, { chave: "voz", opcional: "voz", canais: [V("vozUnica")] }, STAFF(false)],
  },
};
export const NOME_MODELO = (modelo, lang) => N.modelo[modelo]?.[I(lang)] ?? modelo;

// nome comparável: sem acento, sem emoji, minúsculas, só letras e números
export const normalizar = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const lista = (x) => (Array.isArray(x) ? x : x && typeof x.values === "function" ? [...x.values()] : x && typeof x === "object" ? Object.entries(x).map(([id, v]) => ({ id, ...v })) : []);
const cargosDe = (server) => {
  const r = server?.roles;
  if (r && typeof r.entries === "function") return [...r.entries()].map(([id, v]) => ({ id, name: v?.name }));
  return lista(r).map((v) => ({ id: v.id ?? v._id, name: v.name }));
};
const canaisDe = (server) => lista(server?.channels).map((c) => ({ id: c?.id ?? c?._id, name: c?.name }));

// o que o bot pode dar: só as permissões que ele mesmo tem (sem como saber, todas)
function bitsQueOBotDa(server, nomes) {
  let bits = 0n; const faltam = [];
  for (const nome of nomes) {
    let tem = null;
    try { tem = typeof server?.havePermission === "function" ? server.havePermission(nome) : null; } catch {}
    if (tem === false) faltam.push(nome); else bits |= P[nome];
  }
  return { bits, faltam };
}

// O bot precisa disto para montar qualquer coisa: criar canal e cargo, mexer em permissão
// e dar o cargo "Bots" a si mesmo.
export const PERMS_DO_BOT = ["ManageChannel", "ManageRole", "ManagePermissions", "AssignRoles"];
export function faltamAoBot(server) {
  return PERMS_DO_BOT.filter((nome) => { try { return typeof server?.havePermission === "function" && server.havePermission(nome) === false; } catch { return false; } });
}

// ── O plano: o que vai ser criado e o que já existe (nada roda aqui) ──
export function planejar({ modelo, voz = true, divulgacao = true, lang = "pt", server }) {
  const m = MODELOS[modelo];
  if (!m) throw new Error(`modelo desconhecido: ${modelo}`);
  const i = I(lang);
  const cargosHoje = cargosDe(server), canaisHoje = canaisDe(server);
  const cargoExistente = (nome) => cargosHoje.find((c) => normalizar(c.name) === normalizar(nome))?.id ?? null;
  const canalExistente = (nome) => canaisHoje.find((c) => normalizar(c.name) === normalizar(nome))?.id ?? null;

  const cargos = m.cargos.map((chave) => {
    const nome = N.cargo[chave][i];
    const { bits, faltam } = bitsQueOBotDa(server, PERMS_CARGO[chave]);
    return { chave, nome, existeId: cargoExistente(nome), perms: bits, permsFora: faltam, hoist: chave === "staff" || chave === "ajudante",
      cor: { staff: "#E74C3C", ajudante: "#3498DB" }[chave] ?? null };
  });
  const categorias = [];
  for (const cat of m.categorias) {
    if (cat.opcional === "voz" && !voz) continue;
    const canais = cat.canais
      .filter((c) => !(c.opcional === "divulgacao" && !divulgacao))
      .map((c) => ({ ...c, nome: N.canal[c.chave][i], descricao: N.desc[c.chave]?.[i] ?? null, existeId: canalExistente(N.canal[c.chave][i]),
        convitesLivres: c.chave === "divulgacao" }));
    if (canais.length) categorias.push({ chave: cat.chave, titulo: N.categoria[cat.chave][i], canais });
  }
  return { modelo, lang, cargos, categorias };
}

// ── A execução, com o desfazer ──
// `pausaMs`: espera entre chamadas (o Stoat limita a taxa); os testes zeram `ritmo.pausaMs`.
export const ritmo = { pausaMs: 300 };
export async function executar(plano, { server, ctx, pausaMs = ritmo.pausaMs } = {}) {
  const esperar = () => (pausaMs ? new Promise((r) => setTimeout(r, pausaMs)) : null);
  const lang = plano.lang;
  const criados = { cargos: [], canais: [] };
  const ids = { cargo: {}, canal: {} };   // chave → id (criado ou reaproveitado)
  const reaproveitados = { cargos: [], canais: [] };
  let categoriasAntes = null;
  const avisos = [];

  try {
    // 1. cargos — na ordem do modelo (o primeiro criado fica mais acima)
    for (const c of plano.cargos) {
      if (c.existeId) { ids.cargo[c.chave] = c.existeId; reaproveitados.cargos.push(c); continue; }
      const r = await server.createRole(c.nome);
      const id = r?.id ?? r?.role?._id ?? r?.role?.id ?? r?._id;
      if (!id) throw new Error(lang === "es" ? "la API no devolvió el id del rol" : lang === "en" ? "the API didn't return the role id" : "a API não devolveu o id do cargo");
      criados.cargos.push({ id, ...c }); ids.cargo[c.chave] = id;
      await esperar();
      if (c.perms) { await server.setPermissions(id, { allow: Number(c.perms), deny: 0 }); await esperar(); }
      if (c.cor || c.hoist) { await server.editRole?.(id, { ...(c.cor ? { colour: c.cor } : {}), ...(c.hoist ? { hoist: true } : {}) }); await esperar(); }
    }

    // 2. a Judy recebe o cargo "Bots" (é por ele que ela vê e escreve nos canais fechados)
    const idBots = ids.cargo.bots;
    if (idBots) {
      const eu = (() => { try { return server.member ?? null; } catch { return null; } })()
        ?? await server.fetchMember?.(ctx?.client?.user?.id).catch(() => null);
      if (eu) await editarCargos(server, eu, (atuais) => [...atuais, idBots]);
      else avisos.push("bots-sem-membro");
      await esperar();
    }

    // 3. os canais, com as permissões dos fechados (só nos criados agora)
    const staffIds = ["staff", "ajudante"].map((k) => ids.cargo[k]).filter(Boolean);
    for (const cat of plano.categorias) {
      for (const canal of cat.canais) {
        if (canal.existeId) { ids.canal[canal.chave] = canal.existeId; reaproveitados.canais.push(canal); continue; }
        const novo = await server.createChannel({ type: canal.tipo, name: canal.nome, ...(canal.descricao ? { description: canal.descricao } : {}) });
        const id = novo?.id ?? novo?._id;
        if (!id) throw new Error(lang === "es" ? "la API no devolvió el canal" : lang === "en" ? "the API didn't return the channel" : "a API não devolveu o canal");
        criados.canais.push({ id, objeto: novo, ...canal }); ids.canal[canal.chave] = id;
        await esperar();
        if (canal.acesso === "leitura") {
          for (const r of [...staffIds, idBots].filter(Boolean)) { await novo.setPermissions(r, { allow: Number(ESCREVER), deny: 0 }); await esperar(); }
          await novo.setPermissions("default", { allow: 0, deny: Number(P.SendMessage) }); await esperar();
        } else if (canal.acesso === "staff") {
          for (const r of [...staffIds, idBots].filter(Boolean)) { await novo.setPermissions(r, { allow: Number(VER | ESCREVER), deny: 0 }); await esperar(); }
          await novo.setPermissions("default", { allow: 0, deny: Number(P.ViewChannel) }); await esperar();
        }
      }
    }

    // 4. as categorias: as de hoje ficam; a de mesmo título ganha os canais novos
    const novosPorCategoria = plano.categorias.map((cat) => ({ cat, novos: criados.canais.filter((c) => cat.canais.some((x) => x.chave === c.chave)).map((c) => c.id) }))
      .filter((x) => x.novos.length);
    if (novosPorCategoria.length && typeof server.edit === "function") {
      categoriasAntes = structuredClone(server.categories ?? []);
      const cats = structuredClone(server.categories ?? []);
      for (const { cat, novos } of novosPorCategoria) {
        const igual = cats.find((c) => normalizar(c.title) === normalizar(cat.titulo));
        if (igual) igual.channels = [...new Set([...(igual.channels ?? []), ...novos])];
        else cats.push({ id: idDeCategoria(), title: cat.titulo, channels: novos });
      }
      await server.edit({ categories: cats });
    }
  } catch (e) {
    const motivo = e instanceof Error ? e.message : descreverErro(e, lang);
    const desfeito = await desfazer(server, criados, categoriasAntes);
    return { ok: false, motivo, desfeito, criados, reaproveitados };
  }
  return { ok: true, ids, criados, reaproveitados, avisos };
}

// apaga só o que esta rodada criou (o que já existia nunca é tocado)
async function desfazer(server, criados, categoriasAntes) {
  const r = { canais: 0, cargos: 0, falhas: [] };
  if (categoriasAntes && typeof server.edit === "function") { try { await server.edit({ categories: categoriasAntes }); } catch (e) { r.falhas.push("categorias"); } }
  for (const c of [...criados.canais].reverse()) {
    try { await c.objeto?.delete?.(); r.canais++; } catch { r.falhas.push(`#${c.nome}`); }
  }
  for (const c of [...criados.cargos].reverse()) {
    try { await server.deleteRole(c.id); r.cargos++; } catch { r.falhas.push(c.nome); }
  }
  return r;
}

// id de categoria: o Stoat aceita qualquer texto único (até 32 caracteres)
const idDeCategoria = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toUpperCase().slice(0, 26);

// ── O que vai para a config já agora (a parte que não é pergunta do assistente) ──
export function aplicarNaConfig(config, plano, res) {
  const div = res.ids.canal.divulgacao;
  if (div && plano.categorias.some((c) => c.canais.some((x) => x.chave === "divulgacao"))) {
    config.automod ??= {}; config.automod.antiInvite ??= { enabled: true, punicao: null };
    config.automod.antiInvite.canaisLiberados = [...new Set([...(config.automod.antiInvite.canaisLiberados ?? []), div])];
  }
  const regras = res.ids.canal.regras;
  if (regras) { config.servidorInfo ??= {}; config.servidorInfo.regrasCanal ??= regras; }
}

// ── As respostas que o assistente completo recebe prontas ──
export function respostasProntas(plano, res) {
  const prontas = {};
  const nomeCargo = (k) => plano.cargos.find((c) => c.chave === k)?.nome;
  const staff = ["staff", "ajudante"].filter((k) => res.ids.cargo[k]).map((k) => ({ id: res.ids.cargo[k], nome: nomeCargo(k) }));
  if (staff.length) prontas.staff = { valor: staff, rotulo: staff.map((c) => c.nome).join(", ") };
  if (res.ids.canal.registro) prontas.log = { valor: res.ids.canal.registro, rotulo: `<#${res.ids.canal.registro}>` };
  if (res.ids.canal.boasvindas) prontas.boasvindas = { valor: res.ids.canal.boasvindas, rotulo: `<#${res.ids.canal.boasvindas}>` };
  if (res.ids.cargo.membro) prontas.autorole = { valor: res.ids.cargo.membro, rotulo: nomeCargo("membro") };
  return prontas;
}

// ── Textos ──
const T3 = (lang, pt, en, es) => (lang === "es" ? es : lang === "en" ? en : pt);
const NOME_PERM = {
  KickMembers: ["expulsar", "kick", "expulsar"], BanMembers: ["banir", "ban", "banear"], TimeoutMembers: ["silenciar", "timeout", "silenciar"],
  ManageMessages: ["apagar mensagens", "delete messages", "borrar mensajes"], ManageNicknames: ["apelidos", "nicknames", "apodos"],
  RemoveAvatars: ["fotos de perfil", "avatars", "fotos de perfil"], MuteMembers: ["mutar na voz", "voice mute", "silenciar en voz"],
  DeafenMembers: ["ensurdecer na voz", "voice deafen", "ensordecer en voz"], MoveMembers: ["mover na voz", "move in voice", "mover en voz"],
};
const nomePerm = (nome, lang) => NOME_PERM[nome]?.[I(lang)] ?? nome;
const ROTULO_ACESSO = {
  leitura: ["📢 só a staff escreve", "📢 staff-only posting", "📢 solo el staff escribe"],
  staff:   ["🔒 só a staff vê", "🔒 staff-only", "🔒 solo el staff ve"],
};

// a prévia, linha a linha (o chamador marca como pronta e envia)
export function textoPrevia(plano, lang) {
  const L = [];
  const novo = "✨", existe = "↪️";
  L.push(`**${T3(lang, "Cargos", "Roles", "Roles")}**`);
  for (const c of plano.cargos) {
    if (c.existeId) { L.push(`${existe} **${c.nome}** — ${T3(lang, "já existe: uso como está", "already exists: used as is", "ya existe: lo uso como está")}`); continue; }
    const perms = Object.entries(P).filter(([k, v]) => typeof v === "bigint" && NOME_PERM[k] && (c.perms & v)).map(([k]) => nomePerm(k, lang));
    const papel = { staff: T3(lang, "a staff", "the staff", "el staff"), ajudante: T3(lang, "ajuda a moderar", "helps moderate", "ayuda a moderar"),
      membro: T3(lang, "todo mundo que entra", "everyone who joins", "todos los que entran"), bots: T3(lang, "a Judy (e outros bots) — vê os canais fechados", "Judy (and other bots) — sees the closed channels", "Judy (y otros bots) — ve los canales cerrados") }[c.chave];
    L.push(`${novo} **${c.nome}** — ${papel}${perms.length ? ` · ${perms.join(", ")}` : ""}`);
    if (c.permsFora.length) L.push(`   ⚠️ ${T3(lang, "sem", "without", "sin")} ${c.permsFora.map((p) => nomePerm(p, lang)).join(", ")} — ${T3(lang, "o cargo do bot não tem", "the bot's role lacks it", "el rol del bot no la tiene")}`);
  }
  for (const cat of plano.categorias) {
    L.push("", `**${cat.titulo}**`);
    for (const c of cat.canais) {
      const nome = c.tipo === "Voice" ? `🔊 ${c.nome}` : `#${c.nome}`;
      if (c.existeId) { L.push(`${existe} ${nome} — ${T3(lang, "já existe: não mexo nele", "already exists: left untouched", "ya existe: no lo toco")}`); continue; }
      const extras = [ROTULO_ACESSO[c.acesso]?.[I(lang)], c.convitesLivres ? T3(lang, "🔗 convites liberados", "🔗 invites allowed", "🔗 invitaciones permitidas") : null,
        c.papel === "log" ? T3(lang, "o registro da Judy", "Judy's log", "el registro de Judy") : null,
        c.papel === "boasvindas" ? T3(lang, "as boas-vindas", "the welcome messages", "la bienvenida") : null].filter(Boolean);
      L.push(`${novo} ${nome}${extras.length ? ` — ${extras.join(" · ")}` : ""}`);
    }
  }
  return L;
}

export function textoResultado(plano, res, lang) {
  const L = [];
  if (!res.ok) {
    L.push(T3(lang, `Parei no meio: **${res.motivo}**.`, `I stopped halfway: **${res.motivo}**.`, `Me detuve a mitad de camino: **${res.motivo}**.`));
    L.push(T3(lang, `Desfiz o que tinha criado: ${res.desfeito.canais} canal(is), ${res.desfeito.cargos} cargo(s). Nada que já existia foi tocado.`,
      `I undid what I had created: ${res.desfeito.canais} channel(s), ${res.desfeito.cargos} role(s). Nothing that already existed was touched.`,
      `Deshice lo que había creado: ${res.desfeito.canais} canal(es), ${res.desfeito.cargos} rol(es). No se tocó nada de lo que ya existía.`));
    if (res.desfeito.falhas.length) L.push(T3(lang, `⚠️ Não consegui apagar: ${res.desfeito.falhas.join(", ")} — apague à mão.`, `⚠️ I couldn't delete: ${res.desfeito.falhas.join(", ")} — delete them by hand.`, `⚠️ No pude borrar: ${res.desfeito.falhas.join(", ")} — bórralos a mano.`));
    return L;
  }
  const nC = res.criados.canais.length, nR = res.criados.cargos.length;
  const reap = res.reaproveitados.canais.length + res.reaproveitados.cargos.length;
  L.push(T3(lang, `Criei **${nC}** canal(is) e **${nR}** cargo(s)${reap ? ` (${reap} já existiam e ficaram como estavam)` : ""}.`,
    `I created **${nC}** channel(s) and **${nR}** role(s)${reap ? ` (${reap} already existed and were left as they were)` : ""}.`,
    `Creé **${nC}** canal(es) y **${nR}** rol(es)${reap ? ` (${reap} ya existían y quedaron como estaban)` : ""}.`));
  if (res.ids.canal.divulgacao) L.push(T3(lang, `🔗 <#${res.ids.canal.divulgacao}>: convites de outros servidores liberados (o resto do automod continua valendo).`,
    `🔗 <#${res.ids.canal.divulgacao}>: invites to other servers allowed (the rest of the automod still applies).`,
    `🔗 <#${res.ids.canal.divulgacao}>: invitaciones a otros servidores permitidas (el resto del automod sigue aplicándose).`));
  if (res.criados.cargos.length) L.push(T3(lang, "Os cargos novos ficaram abaixo dos que já existiam — arraste-os nas configurações do servidor se quiser outra ordem.",
    "The new roles sit below the existing ones — drag them in the server settings if you want another order.",
    "Los roles nuevos quedaron por debajo de los que ya existían — arrástralos en los ajustes del servidor si quieres otro orden."));
  if (res.avisos.includes("bots-sem-membro")) L.push(T3(lang, "⚠️ Não consegui me dar o cargo **Bots** — dê-o à Judy à mão, senão ela não escreve nos canais fechados.",
    "⚠️ I couldn't give myself the **Bots** role — give it to Judy by hand, or she can't write in the closed channels.",
    "⚠️ No pude darme el rol **Bots** — dáselo a Judy a mano, o no podrá escribir en los canales cerrados."));
  return L;
}
