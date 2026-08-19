// ══════════════════════════════════════════════════════════
//  boas-vindas.js — &boasvindas e &adeus (embeds de entrada e saída)
//
//  Dois comandos com a MESMA mecânica, então um módulo só: mudam o
//  gatilho (entrou / saiu), o ramo da config e os textos padrão.
//
//   &boasvindas                    → status e prévia
//   &boasvindas canal <alvo|aqui>  → onde publicar (liga se estava desligado)
//   &boasvindas titulo <texto>
//   &boasvindas texto <descrição>  → aceita várias linhas e \n
//   &boasvindas cor <cor|#hex>
//   &boasvindas imagem <url|limpar>
//   &boasvindas testar             → dispara como se você tivesse entrado
//   &boasvindas padrao             → volta ao texto de fábrica
//   &boasvindas on | off
//
//  `&adeus` idem, para quem sai. Em inglês: `&welcome` e `&goodbye`.
//
//  ── Marcadores ──
//   {usuario}  menção clicável       {nome}     nome de quem entrou/saiu
//   {servidor} nome do servidor      {membros}  total de membros
//   {contagem} idem {membros}
//
//  Nota de projeto: a saída NÃO menciona a pessoa com <@id>. Quem saiu não
//  está mais no servidor, e a menção viraria um ID cru na tela — em vez
//  disso {usuario} vira o nome em negrito nas despedidas.
// ══════════════════════════════════════════════════════════

import { resolverCanal } from "../core/ids.js";
import { contarMembros, invalidar as invalidarMembros } from "../core/membros.js";
import { validarUrlImagem, comoExibir } from "../core/midia.js";
import { normalizarCor, nomesDeCor } from "../core/cores.js";
import { tr, lingua } from "../core/i18n.js";

// ── Padrões de fábrica ─────────────────────────────────────
const PADRAO = {
  boasVindas: {
    pt: { titulo: "👋 Bem-vindo(a)!", texto: "{usuario} acabou de chegar em **{servidor}**!\n\nAgora somos **{membros}** por aqui." },
    en: { titulo: "👋 Welcome!",      texto: "{usuario} just arrived at **{servidor}**!\n\nWe're **{membros}** now." },
    cor: "#22C55E",
  },
  adeus: {
    pt: { titulo: "👋 Até mais", texto: "{usuario} saiu de **{servidor}**.\n\nAgora somos **{membros}**." },
    en: { titulo: "👋 Farewell", texto: "{usuario} left **{servidor}**.\n\nWe're **{membros}** now." },
    cor: "#6B7280",
  },
};

// Ramo da config de cada tipo + rótulos para as mensagens.
const TIPOS = {
  boasvindas: { chave: "boasVindas", cmdPt: "boasvindas", cmdEn: "welcome",  ptNome: "Boas-vindas", enNome: "Welcome" },
  adeus:      { chave: "adeus",      cmdPt: "adeus",      cmdEn: "goodbye",  ptNome: "Despedida",   enNome: "Farewell" },
};

function garantirConfig(config, chave, lang) {
  config[chave] ??= {};
  const c = config[chave];
  const tipo = chave === "boasVindas" ? PADRAO.boasVindas : PADRAO.adeus;
  const base = tipo[lang === "en" ? "en" : "pt"];
  c.ativo   ??= false;
  c.canalId ??= null;
  c.titulo  ??= base.titulo;
  c.texto   ??= base.texto;
  c.cor     ??= tipo.cor;
  c.imagem  ??= null;
  c.imagemLinkOculto ??= true;   // link de fora entra mascarado (sem URL crua na tela)
  return c;
}

// ── Renderização dos marcadores ────────────────────────────
// `mencionar: false` (saídas) troca {usuario} pelo nome, porque uma menção
// a quem já saiu aparece como um ID cru na tela.
export function renderizar(texto, { userId, nome, servidor, membros, mencionar = true }) {
  const quem = mencionar && userId ? `<@${userId}>` : `**${nome || userId || "?"}**`;
  return String(texto ?? "")
    .replaceAll("{usuario}",  quem)
    .replaceAll("{usuário}",  quem)
    .replaceAll("{user}",     quem)
    .replaceAll("{nome}",     nome || userId || "?")
    .replaceAll("{name}",     nome || userId || "?")
    .replaceAll("{servidor}", servidor || "?")
    .replaceAll("{server}",   servidor || "?")
    .replaceAll("{membros}",  membros ?? "?")
    .replaceAll("{members}",  membros ?? "?")
    .replaceAll("{contagem}", membros ?? "?")
    .replaceAll("{count}",    membros ?? "?");
}

// ── Disparo pelos eventos do main ──────────────────────────
// Nunca lança: uma falha aqui não pode derrubar o autorole nem a
// reaplicação de punição que rodam no mesmo handler.
async function disparar(ctx, chave, { userId, nome, server, mencionar }) {
  try {
    const c = ctx?.config?.[chave];
    if (!c?.ativo || !c.canalId) return;

    const canal = ctx.client?.channels?.get?.(c.canalId)
              ?? await ctx.client?.channels?.fetch?.(c.canalId).catch(() => null);
    if (!canal) return;

    // O objeto de servidor do Stoat quase nunca traz `memberCount`: é preciso
    // buscar a lista. O módulo core cuida disso (com cache) — antes daqui saía
    // sempre "?" no lugar de {membros}.
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

// ── Comando ────────────────────────────────────────────────
function criarComando(tipoId) {
  const T = TIPOS[tipoId];

  return async function cmd(message, args, ctx) {
    const { config, sendEmbed, COR, PREFIXO, getServer, membroTemPermissao, salvarConfig } = ctx;
    const lang = lingua(ctx);
    const c = garantirConfig(config, T.chave, lang);
    const NOME = lang === "en" ? T.enNome : T.ptNome;
    const CMD  = lang === "en" ? T.cmdEn : T.cmdPt;
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
          "",
          lang === "en" ? "**Commands**" : "**Comandos**",
          `\`${PREFIXO}${CMD} ${lang === "en" ? "channel <target|here>" : "canal <alvo|aqui>"}\``,
          `\`${PREFIXO}${CMD} ${lang === "en" ? "title <text>" : "titulo <texto>"}\` · \`${PREFIXO}${CMD} ${lang === "en" ? "text <description>" : "texto <descrição>"}\``,
          `\`${PREFIXO}${CMD} ${lang === "en" ? "colour <colour>" : "cor <cor>"}\` · \`${PREFIXO}${CMD} ${lang === "en" ? "image <url|clear>" : "imagem <url|limpar>"}\``,
          `\`${PREFIXO}${CMD} ${lang === "en" ? "test" : "testar"}\` · \`${PREFIXO}${CMD} ${lang === "en" ? "default" : "padrao"}\` · \`${PREFIXO}${CMD} on|off\``,
          "",
          lang === "en"
            ? "_Markers:_ `{usuario}` `{nome}` `{servidor}` `{membros}`"
            : "_Marcadores:_ `{usuario}` `{nome}` `{servidor}` `{membros}`",
        ].join("\n"),
        colour: c.cor,
      });
    }

    // ── daqui em diante exige permissão ──
    const server = await getServer(message).catch(() => null);
    if (!membroTemPermissao(message, server, "ManageMessages")) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Permissão insuficiente",
          description: `Você precisa de **ManageMessages** para configurar as mensagens de ${NOME.toLowerCase()}.`,
          colour: COR.erro },
        { title: "🚫 Missing permission",
          description: `You need **ManageMessages** to configure the ${NOME.toLowerCase()} message.`,
          colour: COR.erro }));
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
            description: `Set where to post before turning it on: \`${PREFIXO}${CMD} channel here\`.`, colour: COR.erro }));
      }
      c.ativo = ligando;
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: ligando ? `✅ ${NOME} ligada` : `🔴 ${NOME} desligada`,
          description: ligando
            ? `As mensagens serão publicadas em <#${c.canalId}>.`
            : `Nada será publicado até você ligar de novo com \`${PREFIXO}${CMD} on\`.`,
          colour: ligando ? COR.sucesso : COR.mod },
        { title: ligando ? `✅ ${NOME} enabled` : `🔴 ${NOME} disabled`,
          description: ligando
            ? `Messages will be posted in <#${c.canalId}>.`
            : `Nothing will be posted until you turn it back on with \`${PREFIXO}${CMD} on\`.`,
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
            colour: COR.erro }));
      }
      c.canalId = id;
      c.ativo = true;   // definir o canal já liga: é o que a pessoa quis dizer
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: `✅ ${NOME} configurada`,
          description: `As mensagens serão publicadas em <#${id}>.\n\nVeja como ficou: \`${PREFIXO}${CMD} testar\``,
          colour: COR.sucesso },
        { title: `✅ ${NOME} configured`,
          description: `Messages will be posted in <#${id}>.\n\nSee how it looks: \`${PREFIXO}${CMD} test\``,
          colour: COR.sucesso }));
    }

    // ── titulo ──
    if (["titulo", "título", "title"].includes(sub)) {
      if (!resto) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Faltou o texto", description: `Uso: \`${PREFIXO}${CMD} titulo <texto>\``, colour: COR.erro },
          { title: "❌ Missing text",   description: `Usage: \`${PREFIXO}${CMD} title <text>\``, colour: COR.erro }));
      }
      c.titulo = resto.slice(0, 100);
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Título atualizado", description: `Novo título: **${c.titulo}**`, colour: COR.sucesso },
        { title: "✅ Title updated",     description: `New title: **${c.titulo}**`, colour: COR.sucesso }));
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
            ].join("\n"), colour: COR.erro }));
      }
      c.texto = corpo.slice(0, 1200);
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Mensagem atualizada",
          description: `Veja como ficou: \`${PREFIXO}${CMD} testar\``, colour: COR.sucesso },
        { title: "✅ Message updated",
          description: `See how it looks: \`${PREFIXO}${CMD} test\``, colour: COR.sucesso }));
    }

    // ── cor ──
    if (["cor", "colour", "color"].includes(sub)) {
      const nova = normalizarCor(resto);
      if (!nova) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Cor inválida",
            description: `Use \`#RRGGBB\` ou um nome: ${nomesDeCor(12).map((n) => `\`${n}\``).join(", ")}…`, colour: COR.erro },
          { title: "❌ Invalid colour",
            description: `Use \`#RRGGBB\` or a name: ${nomesDeCor(12).map((n) => `\`${n}\``).join(", ")}…`, colour: COR.erro }));
      }
      c.cor = nova;
      salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "✅ Cor atualizada", description: `A borda do embed agora é \`${nova}\`.`, colour: nova },
        { title: "✅ Colour updated",  description: `The embed's border is now \`${nova}\`.`, colour: nova }));
    }

    // ── imagem ──
    if (["imagem", "image", "img"].includes(sub)) {
      if (!resto || ["limpar", "clear", "off", "remover", "remove"].includes(resto.toLowerCase())) {
        c.imagem = null; salvarConfig?.();
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Imagem removida", description: "O embed volta a ser só texto.", colour: COR.sucesso },
          { title: "✅ Image removed",   description: "The embed goes back to text only.", colour: COR.sucesso }));
      }
      // ── &... imagem oculto | visivel ──
      // Para imagem de FORA, a URL precisa ir no conteúdo da mensagem (é assim
      // que o Stoat gera a pré-visualização). Mascarada, ela some da tela; se
      // alguma versão do Stoat deixar de pré-visualizar link mascarado, o
      // `visivel` devolve a URL crua sem precisar de atualização do bot.
      if (["oculto", "ocultar", "hidden", "hide", "mascarar"].includes(resto.toLowerCase())) {
        c.imagemLinkOculto = true; salvarConfig?.();
        return sendEmbed(message.channel, tr(ctx,
          { title: "✅ Link oculto",
            description: `A URL não aparece mais acima do embed.\n\nConfira: \`${PREFIXO}${CMD} testar\``,
            colour: COR.sucesso },
          { title: "✅ Link hidden",
            description: `The URL no longer shows above the embed.\n\nCheck: \`${PREFIXO}${CMD} test\``,
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
            colour: COR.sucesso }));
      }

      const v = validarUrlImagem(resto);
      if (!v.ok) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Link recusado",
            description: `${v.motivo}\n\nUse \`${PREFIXO}${CMD} imagem limpar\` para remover a atual.`,
            colour: COR.erro },
          { title: "❌ Link rejected",
            description: `${v.motivoEn}\n\nUse \`${PREFIXO}${CMD} image clear\` to remove the current one.`,
            colour: COR.erro }));
      }

      c.imagem = v.url;
      salvarConfig?.();

      // Os dois caminhos possíveis rendem resultados visualmente diferentes,
      // e a pessoa merece saber qual vai ver antes de testar.
      const ex = comoExibir(v.url);
      const comoPt = ex.modo === "media"
        ? "Como é um **anexo do Stoat**, ela vira a **capa do embed** — o melhor resultado."
        : `Como é um link **de fora**, ela aparece como **pré-visualização logo abaixo** do embed, não dentro dele. A URL fica **oculta** (sem aquele link enorme na tela).\n_Para virar capa do embed: envie o arquivo aqui no Stoat, clique nele, copie o link do anexo e use esse._\n_Se a imagem não aparecer: \`${PREFIXO}${CMD} imagem visivel\`._`;
      const comoEn = ex.modo === "media"
        ? "Since it's a **Stoat attachment**, it becomes the **embed's cover** — the best result."
        : `Since it's an **external** link, it shows as a **preview right below** the embed, not inside it. The URL stays **hidden** (no giant link on screen).\n_To make it the embed's cover: upload the file here on Stoat, click it, copy the attachment link and use that._\n_If the image doesn't show up: \`${PREFIXO}${CMD} image visible\`._`;

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
      }));
    }

    // ── padrao ──
    if (["padrao", "padrão", "default", "reset"].includes(sub)) {
      const base = (T.chave === "boasVindas" ? PADRAO.boasVindas : PADRAO.adeus)[lang === "en" ? "en" : "pt"];
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
          colour: COR.sucesso }));
    }

    // ── testar ──
    if (["testar", "test", "preview", "previa", "prévia"].includes(sub)) {
      if (!c.canalId) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Falta o canal",
            description: `Defina o canal primeiro: \`${PREFIXO}${CMD} canal aqui\`.`, colour: COR.erro },
          { title: "❌ No channel yet",
            description: `Set the channel first: \`${PREFIXO}${CMD} channel here\`.`, colour: COR.erro }));
      }
      const canal = ctx.client?.channels?.get?.(c.canalId)
                ?? await ctx.client?.channels?.fetch?.(c.canalId).catch(() => null);
      if (!canal) {
        return sendEmbed(message.channel, tr(ctx,
          { title: "❌ Canal inacessível",
            description: `Não consegui acessar <#${c.canalId}>. Verifique as permissões do bot lá.`, colour: COR.erro },
          { title: "❌ Channel unreachable",
            description: `I couldn't reach <#${c.canalId}>. Check the bot's permissions there.`, colour: COR.erro }));
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
          description: `Publiquei em <#${c.canalId}> usando você como exemplo.${c.ativo ? "" : `\n\n⚠️ O envio automático está **desligado** — ligue com \`${PREFIXO}${CMD} on\`.`}`,
          colour: COR.sucesso },
        { title: "✅ Test sent",
          description: `Posted in <#${c.canalId}> using you as the example.${c.ativo ? "" : `\n\n⚠️ Automatic posting is **off** — turn it on with \`${PREFIXO}${CMD} on\`.`}`,
          colour: COR.sucesso }));
    }

    // ── desconhecido ──
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Subcomando desconhecido",
        description: `Use \`${PREFIXO}${CMD}\` para ver o estado e a lista de opções.`, colour: COR.erro },
      { title: "❌ Unknown subcommand",
        description: `Use \`${PREFIXO}${CMD}\` to see the status and the list of options.`, colour: COR.erro }));
  };
}

export const cmdBoasVindas = criarComando("boasvindas");
export const cmdAdeus      = criarComando("adeus");
