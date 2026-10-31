import { CORES as CORES_NOMEADAS, normalizarCor, nomesDeCor } from "../core/cores.js";
import { citar } from "../core/aliases.js";
import { ULID } from "../core/ids.js";
import { validarUrlImagem, comoExibir, formatarLinkConteudo } from "../core/midia.js";

import * as log from "../core/log.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { canalDesteServidor, podeEscreverNoCanal } from "./pertence.js";
import { descreverErro } from "../core/erros.js";

// Converte "#RRGGBB" ou nome comum em cor aceita pelo embed

export async function cmdEmbed(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, client } = ctx;
  const lang = lingua(ctx);
  const es = idiomaDe(ctx) === "es";

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageMessages** para enviar embeds pelo bot.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageMessages** to send embeds through the bot.", colour: COR.erro },
      { title: "🚫 Permiso insuficiente",
        description: "Necesitas **ManageMessages** para enviar embeds con el bot.", colour: COR.erro }));
  }

  // Tudo após "&embed" é o corpo (preservando quebras de linha)
  const raw = message.content ?? "";
  const idx = raw.toLowerCase().indexOf(PREFIXO + "embed");
  const corpo = (idx >= 0 ? raw.slice(idx + (PREFIXO + "embed").length) : raw).trim();

  if (!corpo) {
    return sendEmbed(message.channel, tr(ctx, {
      title: `📝 Como usar o ${citar("embed", "pt", PREFIXO)}`,
      description: [
        "Cada campo numa **linha**, no formato `campo: valor`. **Sem parênteses e sem vírgulas no fim.**",
        "",
        "**Exemplo — copie e edite:**",
        "```",
        `${citar("embed", "pt", PREFIXO)}`,
        "titulo: Idade",
        "descricao: Você tem +18 ou -18 anos?",
        "cor: #FF00FF",
        "```",
        "",
        "**Campos** (só `titulo` ou `descricao` é obrigatório):",
        "`titulo:` · `descricao:` (aceita várias linhas) · `cor:` · `rodape:` · `imagem:` (URL) · `canal:` (ID, para publicar em outro canal)",
        "",
        "**Cores:** hex `#RRGGBB` ou nomes: " + Object.keys(CORES_NOMEADAS).map((c) => `\`${c}\``).join(", "),
        "",
        `_Também aceito tudo numa linha separando com \`|\`:_ \`${citar("embed", "pt", PREFIXO)} titulo: Idade | descricao: +18 ou -18? | cor: rosa\``,
      ].join("\n"),
      colour: COR.info,
    }, {
      title: `📝 How to use ${citar("embed", "en", PREFIXO)}`,
      description: [
        "Each field on its own **line**, in the `field: value` format. **No parentheses and no trailing commas.**",
        "",
        "**Example — copy and edit:**",
        "```",
        `${citar("embed", "en", PREFIXO)}`,
        "title: Age",
        "description: Are you over or under 18?",
        "cor: #FF00FF",
        "```",
        "",
        "**Fields** (only `title` or `description` is required — Portuguese names work too):",
        "`title:` · `description:` (multi-line allowed) · `color:` · `footer:` · `image:` (URL) · `channel:` (ID, to post in another channel)",
        "",
        "**Colors:** hex `#RRGGBB` or names: " + nomesDeCor(0, "en").map((c) => `\`${c}\``).join(", "),
        "",
        `_I also accept everything on one line separated by \`|\`:_ \`${citar("embed", "en", PREFIXO)} title: Age | description: 18+ or under? | color: pink\``,
      ].join("\n"),
      colour: COR.info,
    }, {
      title: `📝 Cómo usar ${citar("embed", "es", PREFIXO)}`,
      description: [
        "Cada campo en su propia **línea**, con el formato `campo: valor`. **Sin paréntesis y sin comas al final.**",
        "",
        "**Ejemplo — cópialo y edítalo:**",
        "```",
        `${citar("embed", "es", PREFIXO)}`,
        "titulo: Edad",
        "descripcion: ¿Tienes más o menos de 18 años?",
        "color: #FF00FF",
        "```",
        "",
        "**Campos** (solo `titulo` o `descripcion` es obligatorio — los nombres en portugués y en inglés también funcionan):",
        "`titulo:` · `descripcion:` (admite varias líneas) · `color:` · `pie:` · `imagen:` (URL) · `canal:` (ID, para publicar en otro canal)",
        "",
        "**Colores:** hex `#RRGGBB` o nombres: " + nomesDeCor(0, "en").map((c) => `\`${c}\``).join(", "),
        "",
        `_También acepto todo en una línea separado con \`|\`:_ \`${citar("embed", "es", PREFIXO)} titulo: Edad | descripcion: ¿+18 o -18? | color: pink\``,
      ].join("\n"),
      colour: COR.info,
    }));
  }

  let corpoLimpo = corpo;
  // 1) tira um par de ( ), { } ou [ ] envolvendo o bloco inteiro
  const env = corpoLimpo.match(/^\s*[([{]\s*([\s\S]*?)\s*[)\]}]\s*$/);
  if (env) corpoLimpo = env[1];
  // 2) se veio tudo numa linha só com "|" ou ";" separando, vira multi-linha
  if (!corpoLimpo.includes("\n") && /[|;]/.test(corpoLimpo)) {
    corpoLimpo = corpoLimpo.split(/\s*[|;]\s*/).join("\n");
  }

  const campos = { titulo: null, descricao: [], cor: null, rodape: null, canal: null, imagem: null };
  // aceita também as chaves em inglês e variações sem acento
  const MAPA = {
    titulo: "titulo", "título": "titulo", title: "titulo",
    descricao: "descricao", "descrição": "descricao", desc: "descricao", description: "descricao",
    descripcion: "descricao", "descripción": "descricao",   // espanhol (etapa 4)
    cor: "cor", color: "cor", colour: "cor",
    rodape: "rodape", "rodapé": "rodape", footer: "rodape", pie: "rodape",
    canal: "canal", channel: "canal",
    imagem: "imagem", image: "imagem", img: "imagem", imagen: "imagem",
  };
  let emDescricao = false;
  const avisos = [];

  for (const linhaBruta of corpoLimpo.split("\n")) {
    // tira vírgula solta no fim da linha (padrão "campo: valor,")
    const linha = linhaBruta.replace(/,\s*$/, "");
    const m = linha.match(/^\s*([\wáéíóúâêôãõç]+)\s*[:=]\s*(.*)$/i);
    const chaveBruta = m ? m[1].toLowerCase() : null;
    const chave = chaveBruta ? MAPA[chaveBruta] : null;
    if (m && chave) {
      const valor = m[2].trim();
      if (chave === "titulo") { campos.titulo = valor; emDescricao = false; }
      else if (chave === "descricao") { campos.descricao.push(valor); emDescricao = true; }
      else if (chave === "cor") { campos.cor = valor; emDescricao = false; }
      else if (chave === "rodape") { campos.rodape = valor; emDescricao = false; }
      else if (chave === "canal") { campos.canal = valor.replace(/[<#>]/g, "").trim(); emDescricao = false; }
      else if (chave === "imagem") { campos.imagem = valor.trim(); emDescricao = false; }
    } else if (m && chaveBruta && !chave) {
      if (emDescricao) campos.descricao.push(linha);
      else avisos.push(es ? `\`${chaveBruta}\` no es un campo válido` : lang === "en" ? `\`${chaveBruta}\` is not a valid field` : `\`${chaveBruta}\` não é um campo válido`);
    } else if (emDescricao) {
      campos.descricao.push(linha);   // continuação da descrição (multi-linha)
    } else if (!campos.titulo && linha.trim()) {
      campos.descricao.push(linha);   // texto solto antes de qualquer chave
    }
  }

  const descricao = campos.descricao.join("\n").replace(/\\n/g, "\n").trim();
  if (!campos.titulo && !descricao && !campos.imagem) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "❌ Embed vazio",
        description: "Informe pelo menos um `titulo` ou uma `descricao`.", colour: COR.erro },
      { title: "❌ Empty embed",
        description: "Provide at least a `title` or a `description`.", colour: COR.erro },
      { title: "❌ Embed vacío",
        description: "Indica al menos un `titulo` o una `descripcion`.", colour: COR.erro }));
  }

  // Resolve o canal de destino
  let canalDestino = message.channel;
  if (campos.canal) {
    if (!ULID.test(campos.canal))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Canal inválido", description: `\`${campos.canal}\` não é um ID de canal válido.`, colour: COR.erro },
        { title: "❌ Invalid channel", description: `\`${campos.canal}\` is not a valid channel ID.`, colour: COR.erro },
        { title: "❌ Canal inválido", description: `\`${campos.canal}\` no es un ID de canal válido.`, colour: COR.erro }));
    // (31 out 2026, R9) só canal DESTE servidor, e onde quem pede pode escrever
    const deste = canalDesteServidor(server, campos.canal);
    canalDestino = deste ? (client.channels.get(deste.id) ?? await client.channels.fetch(deste.id).catch(() => null)) : null;
    if (canalDestino && !podeEscreverNoCanal(message, canalDestino, server, ctx))
      return sendEmbed(message.channel, tr(ctx,
        { title: "🚫 Sem permissão nesse canal", description: `Você não pode enviar mensagens em <#${canalDestino.id}> — então eu também não publico lá por você.`, colour: COR.erro },
        { title: "🚫 No permission in that channel", description: `You can't send messages in <#${canalDestino.id}> — so I won't post there for you.`, colour: COR.erro },
        { title: "🚫 Sin permiso en ese canal", description: `No puedes enviar mensajes en <#${canalDestino.id}> — así que yo tampoco publico ahí por ti.`, colour: COR.erro }));
    if (!canalDestino)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Canal não encontrado", description: `Não consegui acessar o canal \`${campos.canal}\` **neste servidor**.`, colour: COR.erro },
        { title: "❌ Channel not found", description: `I couldn't access the \`${campos.canal}\` channel **on this server**.`, colour: COR.erro },
        { title: "❌ Canal no encontrado", description: `No pude acceder al canal \`${campos.canal}\` **en este servidor**.`, colour: COR.erro }));
  }

  const cor = normalizarCor(campos.cor) ?? "#5865F2";
  if (campos.cor && !normalizarCor(campos.cor)) {
    avisos.push(es
      ? `el color \`${campos.cor}\` no es válido — usé el azul por defecto (usa \`#RRGGBB\` o un nombre: ${nomesDeCor(5, "en").join(", ")}…)`
      : lang === "en"
      ? `the color \`${campos.cor}\` isn't valid — I used the default blue (use \`#RRGGBB\` or a name: ${nomesDeCor(5, "en").join(", ")}…)`
      : `a cor \`${campos.cor}\` não é válida — usei o azul padrão (use \`#RRGGBB\` ou um nome: ${Object.keys(CORES_NOMEADAS).slice(0, 5).join(", ")}…)`);
  }

  // Monta e envia o embed
  const embed = {
    ...(campos.titulo ? { title: campos.titulo } : {}),
    ...(descricao ? { description: descricao } : {}),
    colour: cor,
  };
  let imagemValidada = null;
  if (campos.imagem) {
    const v = validarUrlImagem(campos.imagem);
    if (v.ok) {
      imagemValidada = v.url;
      if (v.aviso) avisos.push(es ? v.avisoEs ?? v.avisoEn : lang === "en" ? v.avisoEn : v.aviso);
    } else {
      avisos.push(es
        ? `imagen ignorada — ${v.motivoEs ?? v.motivoEn}`
        : lang === "en"
        ? `image ignored — ${v.motivoEn}`
        : `imagem ignorada — ${v.motivo}`);
    }
  }
  if (campos.rodape) embed.description = (embed.description ?? "") + `\n\n_${campos.rodape}_`;

  const exibicao = imagemValidada ? comoExibir(imagemValidada) : null;
  const payload = { embeds: [embed] };
  if (exibicao?.modo === "media") payload.embeds = [{ ...embed, media: exibicao.id }];
  else if (exibicao?.modo === "link") payload.content = formatarLinkConteudo(exibicao.url, true);

  try {
    await canalDestino.sendMessage(payload);
    await log.registrar(ctx, "comandos", { titulo: "📝 Embed enviado",
      descricao: `<@${message.authorId}> enviou um embed em <#${campos.canal ?? message.channelId}>.`,
      en: { titulo: "📝 Embed sent", descricao: `<@${message.authorId}> sent an embed in <#${campos.canal ?? message.channelId}>.` },
      es: { titulo: "📝 Embed enviado", descricao: `<@${message.authorId}> envió un embed en <#${campos.canal ?? message.channelId}>.` } });
    // confirma discretamente se foi para OUTRO canal
    if (campos.canal && campos.canal !== message.channelId) {
      await sendEmbed(message.channel, tr(ctx,
        { title: "✅ Embed enviado", description: `A mensagem foi publicada em <#${campos.canal}>.`, colour: COR.sucesso },
        { title: "✅ Embed sent", description: `The message was posted in <#${campos.canal}>.`, colour: COR.sucesso },
        { title: "✅ Embed enviado", description: `El mensaje se publicó en <#${campos.canal}>.`, colour: COR.sucesso }));
    }
    // Avisa sobre o que foi ignorado/corrigido — melhor que falhar em silêncio.
    if (avisos.length) {
      await sendEmbed(message.channel, tr(ctx, {
        title: "⚠️ Enviei, mas repare nisto",
        description: avisos.map((a) => `• ${a}`).join("\n") + `\n\nVeja a sintaxe com \`${citar("embed", "pt", PREFIXO)}\` (sem argumentos).`,
        colour: COR.aviso,
      }, {
        title: "⚠️ Sent, but note this",
        description: avisos.map((a) => `• ${a}`).join("\n") + `\n\nSee the syntax with \`${citar("embed", "en", PREFIXO)}\` (no arguments).`,
        colour: COR.aviso,
      }, {
        title: "⚠️ Lo envié, pero fíjate en esto",
        description: avisos.map((a) => `• ${a}`).join("\n") + `\n\nMira la sintaxis con \`${citar("embed", "es", PREFIXO)}\` (sin argumentos).`,
        colour: COR.aviso,
      }));
    }
  } catch (err) {
    await sendEmbed(message.channel, tr(ctx,
      { title: "❌ Falha ao enviar", description: `**Erro:** ${descreverErro(err, "pt")}`, colour: COR.erro },
      { title: "❌ Failed to send", description: `**Error:** ${descreverErro(err, "en")}`, colour: COR.erro },
      { title: "❌ Error al enviar", description: `**Error:** ${descreverErro(err, "es")}`, colour: COR.erro }));
  }
}
