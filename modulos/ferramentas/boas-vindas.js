
import { resolverCanal } from "../core/ids.js";
import { contarMembros, invalidar as invalidarMembros } from "../core/membros.js";
import { validarUrlImagem, comoExibir } from "../core/midia.js";
import { normalizarCor, nomesDeCor } from "../core/cores.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { citar } from "../core/aliases.js";
import { semPermissao, erroDeUso } from "../core/saida.js";

const PADRAO = {
  boasVindas: {
    pt: { titulo: "👋 Bem-vindo(a)!", texto: "{usuario} acabou de chegar em **{servidor}**!\n\nAgora somos **{membros}** por aqui." },
    en: { titulo: "👋 Welcome!",      texto: "{usuario} just arrived at **{servidor}**!\n\nWe're **{membros}** now." },
    es: { titulo: "👋 ¡Bienvenido(a)!", texto: "¡{usuario} acaba de llegar a **{servidor}**!\n\nAhora somos **{miembros}**." },
    cor: "#22C55E",
  },
  adeus: {
    pt: { titulo: "👋 Até mais", texto: "{usuario} saiu de **{servidor}**.\n\nAgora somos **{membros}**." },
    en: { titulo: "👋 Farewell", texto: "{usuario} left **{servidor}**.\n\nWe're **{membros}** now." },
    es: { titulo: "👋 Hasta luego", texto: "{usuario} salió de **{servidor}**.\n\nAhora somos **{miembros}**." },
    cor: "#6B7280",
  },
};

// Ramo da config de cada tipo + rótulos para as mensagens.
const TIPOS = {
  boasvindas: { chave: "boasVindas", cmdPt: "boasvindas", cmdEn: "welcome",  ptNome: "Boas-vindas", enNome: "Welcome", esNome: "Bienvenida" },
  adeus:      { chave: "adeus",      cmdPt: "adeus",      cmdEn: "goodbye",  ptNome: "Despedida",   enNome: "Farewell", esNome: "Despedida" },
};

function garantirConfig(config, chave, lang) {
  config[chave] ??= {};
  const c = config[chave];
  const tipo = chave === "boasVindas" ? PADRAO.boasVindas : PADRAO.adeus;
  const base = tipo[lang === "en" ? "en" : lang === "es" ? "es" : "pt"];
  c.ativo   ??= false;
  c.canalId ??= null;
  c.titulo  ??= base.titulo;
  c.texto   ??= base.texto;
  c.cor     ??= tipo.cor;
  c.imagem  ??= null;
  c.imagemLinkOculto ??= true;   // link de fora entra mascarado (sem URL crua na tela)
  return c;
}

function limparValor(txt) {
  return String(txt ?? "")
    .replace(/[<>[\]`*_~|]/g, "")   // tira o que forma menção/link/markdown
    .replace(/@(everyone|here|online)/gi, "@\u200b$1")  // quebra pings em massa
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);                  // nome não vira parágrafo
}

export function renderizar(texto, { userId, nome, servidor, membros, mencionar = true }) {
  const nomeLimpo = limparValor(nome);
  const quem = mencionar && userId ? `<@${userId}>` : `**${nomeLimpo || userId || "?"}**`;
  const servidorLimpo = limparValor(servidor);
  return String(texto ?? "")
    .replaceAll("{usuario}",  quem)
    .replaceAll("{usuário}",  quem)
    .replaceAll("{user}",     quem)
    .replaceAll("{nome}",     nomeLimpo || userId || "?")
    .replaceAll("{name}",     nomeLimpo || userId || "?")
    .replaceAll("{nombre}",   nomeLimpo || userId || "?")
    .replaceAll("{servidor}", servidorLimpo || "?")
    .replaceAll("{server}",   servidorLimpo || "?")
    .replaceAll("{membros}",  membros ?? "?")
    .replaceAll("{members}",  membros ?? "?")
    .replaceAll("{miembros}", membros ?? "?")
    .replaceAll("{contagem}", membros ?? "?")
    .replaceAll("{count}",    membros ?? "?");
}

async function disparar(ctx, chave, { userId, nome, server, mencionar }) {
  try {
    const c = ctx?.config?.[chave];
    if (!c?.ativo || !c.canalId) return;

    const canal = ctx.client?.channels?.get?.(c.canalId)
              ?? await ctx.client?.channels?.fetch?.(c.canalId).catch(() => null);
    if (!canal) return;

    const membros = await contarMembros(server);
    const dados = {
      userId, nome,
      servidor: server?.name ?? "",
      membros: membros ?? "?",
      mencionar,
    };

    await ctx.sendEmbed(canal, {
      title: renderizar(c.titulo, dados),
      description: renderizar(c.texto, dados),
      colour: c.cor,
      imagem: c.imagem || null,   // capa configurada em `imagem`
      ocultarLink: c.imagemLinkOculto !== false,
    });
  } catch (err) {
    console.error(`[${chave === "boasVindas" ? "BOASVINDAS" : "ADEUS"}]`, err?.message);
  }
}

export async function aoEntrar(member, ctx) {
  const userId = member?.id?.user ?? member?._id?.user;
  if (!userId) return;
  const serverId = member?.id?.server;
  invalidarMembros(serverId);   // acabou de entrar alguém: recontar, não usar cache velho
  const server = await ctx.getServerPorId?.(serverId).catch(() => null);
  await disparar(ctx, "boasVindas", {
    userId,
    nome: member?.user?.username ?? member?.nickname ?? null,
    server,
    mencionar: true,
  });
}

export async function aoSair(userId, serverId, ctx, nome = null) {
  if (!userId) return;
  invalidarMembros(serverId);   // acabou de sair alguém: recontar
  const server = await ctx.getServerPorId?.(serverId).catch(() => null);
  await disparar(ctx, "adeus", { userId, nome: nome ?? userId, server, mencionar: false });
}

function criarComando(tipoId) {
  const T = TIPOS[tipoId];

  return async function cmd(message, args, ctx) {
    const { config, sendEmbed, COR, PREFIXO, getServer, membroTemPermissao, salvarConfig } = ctx;
    const lang = lingua(ctx);
    const c = garantirConfig(config, T.chave, idiomaDe(ctx));   // (o texto de fábrica no idioma do servidor, espanhol incluído)
    const NOME = lang === "en" ? T.enNome : T.ptNome;
    const CMD  = lang === "en" ? T.cmdEn : T.cmdPt;
    // no espanhol: o nome e os comandos vêm do registro (`&bienvenida probar`)
    const NOME_ES = T.esNome;
    const C = (sub) => citar(sub ? `${tipoId}.${sub}` : tipoId, "es", PREFIXO);
    const sub  = args[0]?.toLowerCase();

    // ── status (público) ──
    if (!sub || sub === "status") {
      const canal = c.canalId ? `<#${c.canalId}>` : (lang === "en" ? "_(none)_" : "_(nenhum)_");
      const estado = c.ativo && c.canalId
        ? (lang === "en" ? "🟢 on" : "🟢 ligado")
        : (lang === "en" ? "🔴 off" : "🔴 desligado");
      const srvPrevia = await getServer(message).catch(() => null);
      const nPrevia = (await contarMembros(srvPrevia).catch(() => null)) ?? "?";
      const previa = renderizar(c.texto, {
        userId: message.authorId,
        nome: message.author?.username ?? "?",
        servidor: srvPrevia?.name ?? "?",
        membros: nPrevia,
        mencionar: tipoId === "boasvindas",
      });

      const tituloPrevia = renderizar(c.titulo, { userId: message.authorId, nome: message.author?.username, servidor: srvPrevia?.name ?? "?", membros: nPrevia, mencionar: tipoId === "boasvindas" });
      const statusES = {
        title: `${tipoId === "boasvindas" ? "👋" : "🚪"} ${NOME_ES}`,
        description: [
          `**Estado:** ${c.ativo && c.canalId ? "🟢 activado" : "🔴 desactivado"}`,
          `**Canal:** ${c.canalId ? `<#${c.canalId}>` : "_(ninguno)_"}`,
          `**Color:** \`${c.cor}\`${c.imagem ? `\n**Imagen:** ${c.imagem.length > 70 ? c.imagem.slice(0, 70) + "…" : c.imagem}${comoExibir(c.imagem)?.modo === "media" ? " _(portada del embed)_" : (c.imagemLinkOculto !== false ? " _(vista previa, enlace oculto)_" : " _(vista previa, enlace visible)_")}` : ""}`,
          "",
          "**Vista previa**",
          `> **${tituloPrevia}**`,
          ...previa.split("\n").map((l) => `> ${l}`),
        ].join("\n"),
        colour: c.cor,
      };
      if (idiomaDe(ctx) === "es") return sendEmbed(message.channel, tr(ctx, null, null, statusES));
      return sendEmbed(message.channel, {
        title: `${tipoId === "boasvindas" ? "👋" : "🚪"} ${NOME}`,
        description: [
          `**${lang === "en" ? "Status" : "Estado"}:** ${estado}`,
          `**${lang === "en" ? "Channel" : "Canal"}:** ${canal}`,
          `**${lang === "en" ? "Colour" : "Cor"}:** \`${c.cor}\`${c.imagem ? `\n**${lang === "en" ? "Image" : "Imagem"}:** ${c.imagem.length > 70 ? c.imagem.slice(0, 70) + "…" : c.imagem}${comoExibir(c.imagem)?.modo === "media" ? (lang === "en" ? " _(embed cover)_" : " _(capa do embed)_") : (c.imagemLinkOculto !== false ? (lang === "en" ? " _(preview, link hidden)_" : " _(pré-visualização, link oculto)_") : (lang === "en" ? " _(preview, link visible)_" : " _(pré-visualização, link visível)_"))}` : ""}`,
          "",
          lang === "en" ? "**Preview**" : "**Prévia**",
          `> **${renderizar(c.titulo, { userId: message.authorId, nome: message.author?.username, servidor: srvPrevia?.name ?? "?", membros: nPrevia, mencionar: tipoId === "boasvindas" })}**`,
          ...previa.split("\n").map((l) => `> ${l}`),
        ].join("\n"),
        colour: c.cor,
      });
    }

    // ── daqui em diante exige permissão ──
    const server = await getServer(message).catch(() => null);
    if (!membroTemPermissao(message, server, "ManageMessages")) {
      return semPermissao(ctx, message.channel, "ManageMessages");
    }

    const resto = args.slice(1).join(" ").trim();

    // ── on / off ──
    if (sub === "on" || sub === "ligar" || sub === "off" || sub === "desligar") {
      const ligando = sub === "on" || sub === "ligar";
      if (ligando && !c.canalId) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falta o canal",
            description: `Defina onde publicar antes de ligar: \`${PREFIXO}${CMD} canal aqui\`.`, colour: COR.erro },
          { title: "❌ No channel yet",
            description: `Set where to post before turning it on: \`${PREFIXO}${CMD} channel here\`.`, colour: COR.erro },
        { title: "❌ Falta el canal",
            description: `Define dónde publicar antes de activarlo: \`${C("canal.aqui")}\`.`, colour: COR.erro }));
      }
      c.ativo = ligando;
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: ligando ? `✅ ${NOME} ligada` : `🔴 ${NOME} desligada`,
          description: ligando
            ? `As mensagens serão publicadas em <#${c.canalId}>.`
            : "Nada será publicado.",
          colour: ligando ? COR.sucesso : COR.mod },
        { title: ligando ? `✅ ${NOME} enabled` : `🔴 ${NOME} disabled`,
          description: ligando
            ? `Messages will be posted in <#${c.canalId}>.`
            : "Nothing will be posted.",
          colour: ligando ? COR.sucesso : COR.mod },
        { title: ligando ? `✅ ${NOME_ES} activada` : `🔴 ${NOME_ES} desactivada`,
          description: ligando
            ? `Los mensajes se publicarán en <#${c.canalId}>.`
            : "No se publicará nada.",
          colour: ligando ? COR.sucesso : COR.mod }));
    }

    // ── canal ──
    if (["canal", "channel"].includes(sub)) {
      const id = resolverCanal(resto || "aqui", { message, server });
      if (!id) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inválido",
            description: `Não identifiquei um canal em \`${resto}\`. Aceito menção, link, ID, nome — ou \`aqui\`.`,
            colour: COR.erro },
          { title: "❌ Invalid channel",
            description: `I couldn't identify a channel in \`${resto}\`. I accept a mention, link, ID, name — or \`here\`.`,
            colour: COR.erro },
        { title: "❌ Canal no válido",
            description: `No identifiqué ningún canal en \`${resto}\`. Acepto mención, enlace, ID, nombre — o \`aqui\`.`,
            colour: COR.erro }));
      }
      c.canalId = id;
      c.ativo = true;   // definir o canal já liga: é o que a pessoa quis dizer
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: `✅ ${NOME} configurada`,
          description: `As mensagens serão publicadas em <#${id}>.`,
          colour: COR.sucesso },
        { title: `✅ ${NOME} configured`,
          description: `Messages will be posted in <#${id}>.`,
          colour: COR.sucesso },
        { title: `✅ ${NOME_ES} configurada`,
          description: `Los mensajes se publicarán en <#${id}>.`,
          colour: COR.sucesso }));
    }

    // ── titulo ──
    if (["titulo", "título", "title"].includes(sub)) {
      if (!resto) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Faltou o texto", description: `Uso: \`${PREFIXO}${CMD} titulo <texto>\``, colour: COR.erro },
          { title: "❌ Missing text",   description: `Usage: \`${PREFIXO}${CMD} title <text>\``, colour: COR.erro },
        { title: "❌ Falta el texto", description: `Uso: \`${C("titulo")} <texto>\``, colour: COR.erro }));
      }
      c.titulo = resto.slice(0, 100);
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Título atualizado", description: `Novo título: **${c.titulo}**`, colour: COR.sucesso },
        { title: "✅ Title updated",     description: `New title: **${c.titulo}**`, colour: COR.sucesso },
        { title: "✅ Título actualizado", description: `Nuevo título: **${c.titulo}**`, colour: COR.sucesso }));
    }

    // ── texto ──
    if (["texto", "text", "mensagem", "message", "descricao", "descrição", "description"].includes(sub)) {
      // Preserva as quebras de linha que a pessoa digitou (args vem quebrado por espaço)
      const raw = message.content ?? "";
      const marca = new RegExp(`${PREFIXO}\\S+\\s+${sub}\\s+`, "i");
      const corpo = (raw.match(marca) ? raw.slice(raw.search(marca) + raw.match(marca)[0].length) : resto)
        .replace(/\\n/g, "\n").trim();
      if (!corpo) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Faltou o texto",
            description: [
              `Uso: \`${PREFIXO}${CMD} texto <descrição>\``,
              "",
              "Marcadores: `{usuario}` `{nome}` `{servidor}` `{membros}`",
              "Várias linhas funcionam; `\\n` também vira quebra de linha.",
            ].join("\n"), colour: COR.erro },
          { title: "❌ Missing text",
            description: [
              `Usage: \`${PREFIXO}${CMD} text <description>\``,
              "",
              "Markers: `{usuario}` `{nome}` `{servidor}` `{membros}`",
              "Multiple lines work; `\\n` also becomes a line break.",
            ].join("\n"), colour: COR.erro },
        { title: "❌ Falta el texto",
            description: [
              `Uso: \`${C("texto")} <descripción>\``,
              "",
              "Marcadores: `{usuario}` `{nombre}` `{servidor}` `{miembros}`",
              "Funcionan varias líneas; `\\n` también se convierte en salto de línea.",
            ].join("\n"), colour: COR.erro }));
      }
      c.texto = corpo.slice(0, 1200);
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Mensagem atualizada",
          description: `Veja como ficou: \`${PREFIXO}${CMD} testar\``, colour: COR.sucesso },
        { title: "✅ Message updated",
          description: `See how it looks: \`${PREFIXO}${CMD} test\``, colour: COR.sucesso },
        { title: "✅ Mensaje actualizado",
          description: `Mira cómo quedó: \`${C("testar")}\``, colour: COR.sucesso }));
    }

    // ── cor ──
    if (["cor", "colour", "color"].includes(sub)) {
      const nova = normalizarCor(resto);
      if (!nova) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Cor inválida",
            description: `Use \`#RRGGBB\` ou um nome: ${nomesDeCor(12).map((n) => `\`${n}\``).join(", ")}…`, colour: COR.erro },
          { title: "❌ Invalid colour",
            description: `Use \`#RRGGBB\` or a name: ${nomesDeCor(12, "en").map((n) => `\`${n}\``).join(", ")}…`, colour: COR.erro },
        { title: "❌ Color no válido",
            description: `Usa \`#RRGGBB\` o un nombre: ${nomesDeCor(12, "en").map((n) => `\`${n}\``).join(", ")}…`, colour: COR.erro }));
      }
      c.cor = nova;
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Cor atualizada", description: `A borda do embed agora é \`${nova}\`.`, colour: nova },
        { title: "✅ Colour updated",  description: `The embed's border is now \`${nova}\`.`, colour: nova },
        { title: "✅ Color actualizado", description: `El borde del embed ahora es \`${nova}\`.`, colour: nova }));
    }

    // ── imagem ──
    if (["imagem", "image", "img"].includes(sub)) {
      if (!resto || ["limpar", "clear", "off", "remover", "remove", "borrar", "quitar", "eliminar"].includes(resto.toLowerCase())) {
        c.imagem = null; salvarConfig?.();
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Imagem removida", description: "O embed volta a ser só texto.", colour: COR.sucesso },
          { title: "✅ Image removed",   description: "The embed goes back to text only.", colour: COR.sucesso },
        { title: "✅ Imagen quitada", description: "El embed vuelve a ser solo texto.", colour: COR.sucesso }));
      }
      if (["oculto", "ocultar", "hidden", "hide", "mascarar"].includes(resto.toLowerCase())) {
        c.imagemLinkOculto = true; salvarConfig?.();
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Link oculto",
            description: "A URL não aparece mais acima do embed.",
            colour: COR.sucesso },
          { title: "✅ Link hidden",
            description: "The URL no longer shows above the embed.",
            colour: COR.sucesso },
        { title: "✅ Enlace oculto",
            description: "La URL ya no aparece encima del embed.",
            colour: COR.sucesso }));
      }
      if (["visivel", "visível", "visible", "show", "mostrar"].includes(resto.toLowerCase())) {
        c.imagemLinkOculto = false; salvarConfig?.();
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Link visível",
            description: `A URL volta a aparecer acima do embed.\n_Use isto só se a imagem parar de ser exibida com o link oculto._`,
            colour: COR.sucesso },
          { title: "✅ Link visible",
            description: `The URL shows above the embed again.\n_Only use this if the image stops displaying with the link hidden._`,
            colour: COR.sucesso },
        { title: "✅ Enlace visible",
            description: `La URL vuelve a aparecer encima del embed.\n_Usa esto solo si la imagen deja de mostrarse con el enlace oculto._`,
            colour: COR.sucesso }));
      }

      const v = validarUrlImagem(resto);
      if (!v.ok) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Link recusado",
            description: v.motivo,
            colour: COR.erro },
          { title: "❌ Link rejected",
            description: v.motivoEn,
            colour: COR.erro },
        { title: "❌ Enlace rechazado",
            description: (v.motivoEs ?? v.motivoEn),
            colour: COR.erro }));
      }

      c.imagem = v.url;
      salvarConfig?.();

      const ex = comoExibir(v.url);
      const comoPt = ex.modo === "media"
        ? "Como é um **anexo do Stoat**, ela vira a **capa do embed** — o melhor resultado."
        : `Como é um link **de fora**, ela aparece como **pré-visualização logo abaixo** do embed, não dentro dele. A URL fica **oculta** (sem aquele link enorme na tela).\n_Para virar capa do embed: envie o arquivo aqui no Stoat, clique nele, copie o link do anexo e use esse._\n_Se a imagem não aparecer: \`${PREFIXO}${CMD} imagem visivel\`._`;
      const comoEn = ex.modo === "media"
        ? "Since it's a **Stoat attachment**, it becomes the **embed's cover** — the best result."
        : `Since it's an **external** link, it shows as a **preview right below** the embed, not inside it. The URL stays **hidden** (no giant link on screen).\n_To make it the embed's cover: upload the file here on Stoat, click it, copy the attachment link and use that._\n_If the image doesn't show up: \`${PREFIXO}${CMD} image visible\`._`;

      const comoEs = ex.modo === "media"
        ? "Como es un **adjunto del Stoat**, se convierte en la **portada del embed** — el mejor resultado."
        : `Como es un enlace **externo**, aparece como **vista previa justo debajo** del embed, no dentro de él. La URL queda **oculta** (sin ese enlace enorme en pantalla).\n_Para que sea la portada del embed: sube el archivo aquí en el Stoat, haz clic en él, copia el enlace del adjunto y usa ese._\n_Si la imagen no aparece: \`${C("imagem")} visible\`._`;

      return sendEmbed(message.channel, tr(ctx, {
        title: "✅ Imagem definida",
        description: [
          v.url,
          "",
          comoPt,
          "",
          `Confira como ficou: \`${PREFIXO}${CMD} testar\``,
          ...(v.aviso ? ["", v.aviso] : []),
        ].join("\n"),
        colour: v.aviso ? COR.aviso : COR.sucesso,
      }, {
        title: "✅ Image set",
        description: [
          v.url,
          "",
          comoEn,
          "",
          `Check how it looks: \`${PREFIXO}${CMD} test\``,
          ...(v.avisoEn ? ["", v.avisoEn] : []),
        ].join("\n"),
        colour: v.avisoEn ? COR.aviso : COR.sucesso,
      }, {
        title: "✅ Imagen definida",
        description: [
          v.url,
          "",
          comoEs,
          "",
          `Mira cómo quedó: \`${C("testar")}\``,
          ...((v.avisoEs ?? v.avisoEn) ? ["", v.avisoEs ?? v.avisoEn] : []),
        ].join("\n"),
        colour: v.avisoEn ? COR.aviso : COR.sucesso,
      }));
    }

    // ── padrao ──
    if (["padrao", "padrão", "default", "reset"].includes(sub)) {
      const base = (T.chave === "boasVindas" ? PADRAO.boasVindas : PADRAO.adeus)[idiomaDe(ctx) === "es" ? "es" : lang === "en" ? "en" : "pt"];
      c.titulo = base.titulo;
      c.texto  = base.texto;
      c.cor    = (T.chave === "boasVindas" ? PADRAO.boasVindas : PADRAO.adeus).cor;
      c.imagem = null;
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Voltou ao padrão",
          description: `Título, texto, cor e imagem de fábrica. O canal e o estado (${c.ativo ? "ligado" : "desligado"}) continuam como estavam.`,
          colour: COR.sucesso },
        { title: "✅ Back to default",
          description: `Factory title, text, colour and image. The channel and state (${c.ativo ? "on" : "off"}) stay as they were.`,
          colour: COR.sucesso },
        { title: "✅ Volvió a lo predeterminado",
          description: `Título, texto, color e imagen de fábrica. El canal y el estado (${c.ativo ? "activado" : "desactivado"}) siguen como estaban.`,
          colour: COR.sucesso }));
    }

    // ── testar ──
    if (["testar", "test", "preview", "previa", "prévia"].includes(sub)) {
      if (!c.canalId) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falta o canal",
            description: `Defina o canal primeiro: \`${PREFIXO}${CMD} canal aqui\`.`, colour: COR.erro },
          { title: "❌ No channel yet",
            description: `Set the channel first: \`${PREFIXO}${CMD} channel here\`.`, colour: COR.erro },
        { title: "❌ Falta el canal",
            description: `Define primero el canal: \`${C("canal.aqui")}\`.`, colour: COR.erro }));
      }
      const canal = ctx.client?.channels?.get?.(c.canalId)
                ?? await ctx.client?.channels?.fetch?.(c.canalId).catch(() => null);
      if (!canal) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inacessível",
            description: `Não consegui acessar <#${c.canalId}>. Verifique as permissões do bot lá.`, colour: COR.erro },
          { title: "❌ Channel unreachable",
            description: `I couldn't reach <#${c.canalId}>. Check the bot's permissions there.`, colour: COR.erro },
        { title: "❌ Canal inaccesible",
            description: `No pude acceder a <#${c.canalId}>. Revisa los permisos del bot allí.`, colour: COR.erro }));
      }
      const dados = {
        userId: message.authorId,
        nome: message.author?.username ?? "?",
        servidor: server?.name ?? "?",
        membros: (await contarMembros(server).catch(() => null)) ?? "?",
        mencionar: tipoId === "boasvindas",
      };
      await ctx.sendEmbed(canal, {
        title: renderizar(c.titulo, dados),
        description: renderizar(c.texto, dados),
        colour: c.cor,
        imagem: c.imagem || null,
        ocultarLink: c.imagemLinkOculto !== false,
      });
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Teste enviado",
          description: `Publiquei em <#${c.canalId}> usando você como exemplo.${c.ativo ? "" : "\n⚠️ O envio automático está **desligado**."}`,
          colour: COR.sucesso },
        { title: "✅ Test sent",
          description: `Posted in <#${c.canalId}> using you as the example.${c.ativo ? "" : "\n⚠️ Automatic posting is **off**."}`,
          colour: COR.sucesso },
        { title: "✅ Prueba enviada",
          description: `Publiqué en <#${c.canalId}> usándote como ejemplo.${c.ativo ? "" : "\n⚠️ La publicación automática está **desactivada**."}`,
          colour: COR.sucesso }));
    }

    // ── desconhecido ──
    return erroDeUso(ctx, message.channel, tipoId, "Subcomando desconhecido.", "Unknown subcommand.", "Subcomando desconocido.");
  };
}

export const cmdBoasVindas = criarComando("boasvindas");
export const cmdAdeus      = criarComando("adeus");
