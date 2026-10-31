import { normalizarCor } from "../core/cores.js";
import { ULID } from "../core/ids.js";
import { validarUrlImagem, comoExibir, formatarLinkConteudo } from "../core/midia.js";

import * as log from "../core/log.js";
import { tr, lingua, idiomaDe } from "../core/i18n.js";
import { canalDesteServidor, podeEscreverNoCanal } from "./pertence.js";
import { descreverErro, registrarErro } from "../core/erros.js";
import { erroDeUso, semPermissao } from "./punir.js";

// Converte "#RRGGBB" ou nome comum em cor aceita pelo embed

// &embed — publica um embed montado pela staff. Absorveu o &repete (P2): texto
// sem nenhum `campo:` conhecido vira a descrição, como está.
const MAX_TITULO = 100, MAX_DESCRICAO = 2000;
const escRe = (t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function cmdEmbed(message, args, ctx) {
  const { sendEmbed, COR, getServer, membroTemPermissao, PREFIXO, client } = ctx;
  const lang = lingua(ctx);
  const es = idiomaDe(ctx) === "es";
  const canal = message.channel;
  const linha = (cor, pt, en, es_) => sendEmbed(canal, { description: tr(ctx, pt, en, es_), colour: cor });

  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "ManageMessages")) return semPermissao(ctx, canal, "ManageMessages");

  // tudo depois do nome do comando é o corpo (com as quebras de linha) — vale para
  // `&embed`, `&repete` e qualquer outro nome que leve até aqui
  const raw = String(message.content ?? "");
  const m0 = raw.match(new RegExp(`^\\s*${escRe(PREFIXO)}\\S+`));
  const corpo = (m0 ? raw.slice(m0[0].length) : args.join(" ")).trim();
  if (!corpo) return erroDeUso(ctx, canal, "embed", "O que publicar?", "What should I post?", "¿Qué publico?");

  let corpoLimpo = corpo;
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
  // Sem nenhum `campo:` conhecido, é o &repete: o texto inteiro, como está, vira a descrição.
  const temCampo = (t) => t.split(/\n|\s*[|;]\s*/).some((l) => MAPA[(l.match(/^\s*[([{]?\s*([\wáéíóúâêôãõç]+)\s*[:=]/i)?.[1] ?? "").toLowerCase()]);
  const modoCampos = temCampo(corpoLimpo);
  if (modoCampos) {
    // 1) tira um par de ( ), { } ou [ ] envolvendo o bloco inteiro
    const env = corpoLimpo.match(/^\s*[([{]\s*([\s\S]*?)\s*[)\]}]\s*$/);
    if (env) corpoLimpo = env[1];
    // 2) se veio tudo numa linha só com "|" ou ";" separando, vira multi-linha
    if (!corpoLimpo.includes("\n") && /[|;]/.test(corpoLimpo)) corpoLimpo = corpoLimpo.split(/\s*[|;]\s*/).join("\n");
  } else {
    campos.descricao.push(corpoLimpo);
  }

  for (const linhaBruta of (modoCampos ? corpoLimpo.split("\n") : [])) {
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
  if (!campos.titulo && !descricao && !campos.imagem) return erroDeUso(ctx, canal, "embed", "Falta o `titulo` ou a `descricao`", "Missing the `title` or the `description`", "Falta el `titulo` o la `descripcion`");
  if ((campos.titulo ?? "").length > MAX_TITULO) return erroDeUso(ctx, canal, "embed", `Título com mais de ${MAX_TITULO} caracteres`, `Title over ${MAX_TITULO} characters`, `Título de más de ${MAX_TITULO} caracteres`);
  if (descricao.length + (campos.rodape?.length ?? 0) > MAX_DESCRICAO) return erroDeUso(ctx, canal, "embed", `Texto com mais de ${MAX_DESCRICAO} caracteres`, `Text over ${MAX_DESCRICAO} characters`, `Texto de más de ${MAX_DESCRICAO} caracteres`);

  // O canal de destino: só DESTE servidor, e onde quem pede pode escrever (R9)
  let canalDestino = canal;
  if (campos.canal) {
    const deste = ULID.test(campos.canal) ? canalDesteServidor(server, campos.canal) : null;
    canalDestino = deste ? (client.channels.get(deste.id) ?? await client.channels.fetch(deste.id).catch(() => null)) : null;
    if (!canalDestino) return linha(COR.erro, "❌ Canal não encontrado neste servidor.", "❌ Channel not found on this server.", "❌ Canal no encontrado en este servidor.");
    if (!podeEscreverNoCanal(message, canalDestino, server, ctx)) {
      return linha(COR.erro, `🚫 Sem permissão nesse canal: <#${canalDestino.id}>.`, `🚫 No permission in that channel: <#${canalDestino.id}>.`, `🚫 Sin permiso en ese canal: <#${canalDestino.id}>.`);
    }
  }

  const cor = normalizarCor(campos.cor) ?? "#5865F2";
  if (campos.cor && !normalizarCor(campos.cor)) {
    avisos.push(es ? `color \`${campos.cor}\` no válido — usé el azul` : lang === "en" ? `color \`${campos.cor}\` not valid — used blue` : `cor \`${campos.cor}\` inválida — usei o azul`);
  }
  const embed = { ...(campos.titulo ? { title: campos.titulo } : {}), ...(descricao ? { description: descricao } : {}), colour: cor };
  let imagemValidada = null;
  if (campos.imagem) {
    const v = validarUrlImagem(campos.imagem);
    if (v.ok) {
      imagemValidada = v.url;
      if (v.aviso) avisos.push(es ? v.avisoEs ?? v.avisoEn : lang === "en" ? v.avisoEn : v.aviso);
    } else {
      avisos.push(es ? `imagen ignorada — ${v.motivoEs ?? v.motivoEn}` : lang === "en" ? `image ignored — ${v.motivoEn}` : `imagem ignorada — ${v.motivo}`);
    }
  }
  if (campos.rodape) embed.description = (embed.description ?? "") + `\n\n_${campos.rodape}_`;

  const exibicao = imagemValidada ? comoExibir(imagemValidada) : null;
  const payload = { embeds: [embed] };
  if (exibicao?.modo === "media") payload.embeds = [{ ...embed, media: exibicao.id }];
  else if (exibicao?.modo === "link") payload.content = formatarLinkConteudo(exibicao.url, true);

  try {
    await canalDestino.sendMessage(payload);
  } catch (err) {
    registrarErro("EMBED", err);
    return linha(COR.erro, `❌ Não consegui publicar: ${descreverErro(err, "pt")}`, `❌ Couldn't post: ${descreverErro(err, "en")}`, `❌ No pude publicar: ${descreverErro(err, "es")}`);
  }
  await log.registrar(ctx, "comandos", { titulo: "📝 Embed enviado",
    descricao: `<@${message.authorId}> enviou um embed em <#${canalDestino.id ?? message.channelId}>.`,
    en: { titulo: "📝 Embed sent", descricao: `<@${message.authorId}> sent an embed in <#${canalDestino.id ?? message.channelId}>.` },
    es: { titulo: "📝 Embed enviado", descricao: `<@${message.authorId}> envió un embed en <#${canalDestino.id ?? message.channelId}>.` } });
  // o resultado: só quando foi para OUTRO canal, e o que foi ignorado (uma linha cada)
  const outro = canalDestino !== canal && canalDestino.id !== message.channelId;
  const linhas = [
    outro ? tr(ctx, `✅ Publicado em <#${canalDestino.id}>.`, `✅ Posted in <#${canalDestino.id}>.`, `✅ Publicado en <#${canalDestino.id}>.`) : null,
    ...avisos.map((a) => `⚠️ ${a}`),
  ].filter(Boolean);
  if (linhas.length) await sendEmbed(canal, { description: linhas.join("\n"), colour: avisos.length ? COR.aviso : COR.sucesso });
}
