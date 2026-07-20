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

// Converte "#RRGGBB" ou nome comum em cor aceita pelo embed
const CORES_NOMEADAS = {
  vermelho: "#ED4245", verde: "#57F287", azul: "#5865F2",
  amarelo: "#FEE75C", laranja: "#E67E22", roxo: "#9B59B6",
  rosa: "#EB459E", cinza: "#95A5A6", preto: "#23272A", branco: "#FFFFFF",
};

function normalizarCor(v) {
  if (!v) return null;
  const t = v.trim().toLowerCase();
  if (CORES_NOMEADAS[t]) return CORES_NOMEADAS[t];
  if (/^#?[0-9a-f]{6}$/i.test(t)) return t.startsWith("#") ? t : `#${t}`;
  return null;
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

export async function cmdEmbed(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, client } = ctx;

  const server = await getServer(message);
  if (!membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManageMessages** para enviar embeds pelo bot.", colour: COR.erro });
  }

  // Tudo após "&embed" é o corpo (preservando quebras de linha)
  const raw = message.content ?? "";
  const idx = raw.toLowerCase().indexOf(PREFIXO + "embed");
  const corpo = (idx >= 0 ? raw.slice(idx + (PREFIXO + "embed").length) : raw).trim();

  if (!corpo) {
    return sendEmbed(message.channel, {
      title: "📝 Como usar o &embed",
      description: [
        "Envie campos `chave: valor`, um por linha:",
        "```",
        `${PREFIXO}embed`,
        "titulo: Bem-vindo!",
        "descricao: Leia as regras no canal fixado.",
        "Pode usar várias linhas.",
        "cor: #5865F2",
        "rodape: Equipe",
        "canal: (opcional, ID do canal)",
        "imagem: (opcional, URL)",
        "```",
        "**Cores:** hex (`#5865F2`) ou nomes: " + Object.keys(CORES_NOMEADAS).map((c) => `\`${c}\``).join(", "),
      ].join("\n"),
      colour: COR.info,
    });
  }

  // Faz o parse linha a linha; a primeira chave desconhecida vira parte da descrição
  const campos = { titulo: null, descricao: [], cor: null, rodape: null, canal: null, imagem: null };
  const CHAVES = ["titulo", "título", "descricao", "descrição", "cor", "rodape", "rodapé", "canal", "imagem"];
  let emDescricao = false;

  for (const linha of corpo.split("\n")) {
    const m = linha.match(/^(\w+[áéíóúâ]?\w*)\s*:\s*(.*)$/);
    const chave = m ? m[1].toLowerCase() : null;
    if (m && CHAVES.includes(chave)) {
      const valor = m[2];
      if (chave === "titulo" || chave === "título") campos.titulo = valor;
      else if (chave === "descricao" || chave === "descrição") { campos.descricao.push(valor); emDescricao = true; }
      else if (chave === "cor") campos.cor = valor;
      else if (chave === "rodape" || chave === "rodapé") campos.rodape = valor;
      else if (chave === "canal") campos.canal = valor.replace(/[<#>]/g, "").trim();
      else if (chave === "imagem") campos.imagem = valor.trim();
    } else if (emDescricao) {
      campos.descricao.push(linha);   // continuação da descrição (multi-linha)
    } else if (!campos.titulo && linha.trim()) {
      campos.descricao.push(linha);   // texto solto antes de qualquer chave
    }
  }

  const descricao = campos.descricao.join("\n").replace(/\\n/g, "\n").trim();
  if (!campos.titulo && !descricao && !campos.imagem) {
    return sendEmbed(message.channel, { title: "❌ Embed vazio",
      description: "Informe pelo menos um `titulo` ou uma `descricao`.", colour: COR.erro });
  }

  // Resolve o canal de destino
  let canalDestino = message.channel;
  if (campos.canal) {
    if (!ULID.test(campos.canal))
      return sendEmbed(message.channel, { title: "❌ Canal inválido",
        description: `\`${campos.canal}\` não é um ID de canal válido.`, colour: COR.erro });
    canalDestino = client.channels.get(campos.canal)
      ?? await client.channels.fetch(campos.canal).catch(() => null);
    if (!canalDestino)
      return sendEmbed(message.channel, { title: "❌ Canal não encontrado",
        description: `Não consegui acessar o canal \`${campos.canal}\`.`, colour: COR.erro });
  }

  const cor = normalizarCor(campos.cor) ?? "#5865F2";

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
      await sendEmbed(message.channel, { title: "✅ Embed enviado",
        description: `A mensagem foi publicada em <#${campos.canal}>.`, colour: COR.sucesso });
    }
  } catch (err) {
    console.error("[EMBED]", err.message);
    await sendEmbed(message.channel, { title: "❌ Falha ao enviar",
      description: `**Erro:** ${err.message}`, colour: COR.erro });
  }
}
