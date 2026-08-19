import { CORES as CORES_NOMEADAS, normalizarCor } from "../core/cores.js";
import { ULID } from "../core/ids.js";
// ══════════════════════════════════════════════════════════
//  embed.js — &embed (mensagem embed customizável)
//
//  Sintaxe por campos "chave: valor", um por linha:
//
//    &embed
//    titulo: Regras do servidor
//    descricao: Seja legal com todos.
//    Use várias linhas à vontade.
//    cor: #5865F2
//    canal: 01ABC...            (opcional; padrão = canal atual)
//    rodape: Equipe de moderação (opcional)
//    imagem: https://...        (opcional)
//
//  Também aceita `\n` no meio de um valor para quebra de linha.
//  Exige ManageMessages.
// ══════════════════════════════════════════════════════════

import * as log from "../core/log.js";
import { tr, lingua } from "../core/i18n.js";

// Converte "#RRGGBB" ou nome comum em cor aceita pelo embed



export async function cmdEmbed(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, client } = ctx;
  const lang = lingua(ctx);

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageMessages** para enviar embeds pelo bot.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageMessages** to send embeds through the bot.", colour: COR.erro }));
  }

  // Tudo após "&embed" é o corpo (preservando quebras de linha)
  const raw = message.content ?? "";
  const idx = raw.toLowerCase().indexOf(PREFIXO + "embed");
  const corpo = (idx >= 0 ? raw.slice(idx + (PREFIXO + "embed").length) : raw).trim();

  if (!corpo) {
    return sendEmbed(message.channel, lang === "en" ? {
      title: "📝 How to use &embed",
      description: [
        "Each field on its own **line**, in the `field: value` format. **No parentheses and no trailing commas.**",
        "",
        "**Example — copy and edit:**",
        "```",
        `${PREFIXO}embed`,
        "titulo: Age",
        "descricao: Are you over or under 18?",
        "cor: #FF00FF",
        "```",
        "",
        "**Fields** (only `titulo` or `descricao` is required):",
        "`titulo:` · `descricao:` (multi-line allowed) · `cor:` · `rodape:` · `imagem:` (URL) · `canal:` (ID, to post in another channel)",
        "",
        "**Colors:** hex `#RRGGBB` or names: " + Object.keys(CORES_NOMEADAS).map((c) => `\`${c}\``).join(", "),
        "",
        `_I also accept everything on one line separated by \`|\`:_ \`${PREFIXO}embed titulo: Age | descricao: 18+ or under? | cor: rosa\``,
      ].join("\n"),
      colour: COR.info,
    } : {
      title: "📝 Como usar o &embed",
      description: [
        "Cada campo numa **linha**, no formato `campo: valor`. **Sem parênteses e sem vírgulas no fim.**",
        "",
        "**Exemplo — copie e edite:**",
        "```",
        `${PREFIXO}embed`,
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
        `_Também aceito tudo numa linha separando com \`|\`:_ \`${PREFIXO}embed titulo: Idade | descricao: +18 ou -18? | cor: rosa\``,
      ].join("\n"),
      colour: COR.info,
    });
  }

  // ── Normalização tolerante ────────────────────────────────
  // As pessoas escrevem de tudo: com parênteses/chaves em volta, vírgula no
  // fim de cada campo, tudo numa linha só, chaves em inglês. Em vez de falhar
  // silenciosamente, a gente aceita e limpa.
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
    cor: "cor", color: "cor", colour: "cor",
    rodape: "rodape", "rodapé": "rodape", footer: "rodape",
    canal: "canal", channel: "canal",
    imagem: "imagem", image: "imagem", img: "imagem",
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
      // Dentro da descrição, "Palavra: algo" é texto normal (ex.: "Exemplo: X").
      // Só avisa quando a linha parece um campo mal escrito fora da descrição.
      if (emDescricao) campos.descricao.push(linha);
      else avisos.push(lang === "en" ? `\`${chaveBruta}\` is not a valid field` : `\`${chaveBruta}\` não é um campo válido`);
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
        description: "Provide at least a `titulo` or a `descricao`.", colour: COR.erro }));
  }

  // Resolve o canal de destino
  let canalDestino = message.channel;
  if (campos.canal) {
    if (!ULID.test(campos.canal))
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Canal inválido", description: `\`${campos.canal}\` não é um ID de canal válido.`, colour: COR.erro },
        { title: "❌ Invalid channel", description: `\`${campos.canal}\` is not a valid channel ID.`, colour: COR.erro }));
    canalDestino = client.channels.get(campos.canal)
      ?? await client.channels.fetch(campos.canal).catch(() => null);
    if (!canalDestino)
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Canal não encontrado", description: `Não consegui acessar o canal \`${campos.canal}\`.`, colour: COR.erro },
        { title: "❌ Channel not found", description: `I couldn't access the \`${campos.canal}\` channel.`, colour: COR.erro }));
  }

  const cor = normalizarCor(campos.cor) ?? "#5865F2";
  if (campos.cor && !normalizarCor(campos.cor)) {
    avisos.push(lang === "en"
      ? `the color \`${campos.cor}\` isn't valid — I used the default blue (use \`#RRGGBB\` or a name: ${Object.keys(CORES_NOMEADAS).slice(0, 5).join(", ")}…)`
      : `a cor \`${campos.cor}\` não é válida — usei o azul padrão (use \`#RRGGBB\` ou um nome: ${Object.keys(CORES_NOMEADAS).slice(0, 5).join(", ")}…)`);
  }

  // Monta e envia o embed
  const embed = {
    ...(campos.titulo ? { title: campos.titulo } : {}),
    ...(descricao ? { description: descricao } : {}),
    colour: cor,
  };
  if (campos.imagem) embed.media = campos.imagem;   // capa/imagem do embed
  if (campos.rodape) embed.description = (embed.description ?? "") + `\n\n_${campos.rodape}_`;

  try {
    await canalDestino.sendMessage({ embeds: [embed] });
    await log.registrar(ctx, "comandos", { titulo: "📝 Embed enviado",
      descricao: `<@${message.authorId}> enviou um embed em <#${campos.canal ?? message.channelId}>.` });
    // confirma discretamente se foi para OUTRO canal
    if (campos.canal && campos.canal !== message.channelId) {
      await sendEmbed(message.channel, tr(ctx,
        { title: "✅ Embed enviado", description: `A mensagem foi publicada em <#${campos.canal}>.`, colour: COR.sucesso },
        { title: "✅ Embed sent", description: `The message was posted in <#${campos.canal}>.`, colour: COR.sucesso }));
    }
    // Avisa sobre o que foi ignorado/corrigido — melhor que falhar em silêncio.
    if (avisos.length) {
      await sendEmbed(message.channel, tr(ctx, {
        title: "⚠️ Enviei, mas repare nisto",
        description: avisos.map((a) => `• ${a}`).join("\n") + `\n\nVeja a sintaxe com \`${PREFIXO}embed\` (sem argumentos).`,
        colour: COR.aviso,
      }, {
        title: "⚠️ Sent, but note this",
        description: avisos.map((a) => `• ${a}`).join("\n") + `\n\nSee the syntax with \`${PREFIXO}embed\` (no arguments).`,
        colour: COR.aviso,
      }));
    }
  } catch (err) {
    console.error("[EMBED]", err.message);
    await sendEmbed(message.channel, tr(ctx,
      { title: "❌ Falha ao enviar", description: `**Erro:** ${err.message}`, colour: COR.erro },
      { title: "❌ Failed to send", description: `**Error:** ${err.message}`, colour: COR.erro }));
  }
}
