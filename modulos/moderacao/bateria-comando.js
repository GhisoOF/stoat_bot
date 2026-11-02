// &bateria — as imagens da bateria de teste da moderação de imagem (P4.3, 2 nov 2026). O motor
// (e o contrato do arquivo com a bateria): bateria.js.
//
//   &bateria <categoria>  + 1 a 10 imagens anexadas   registra cada uma (só o link do Stoat)
//   &bateria                                          a contagem por categoria e o total
//   &bateria remover <código|ultima>                  tira um registro
//   &bateria limpar <categoria>                       pede confirmação (código, 2 min)
//   &bateria limpar confirmar <código>                tira todos daquela categoria
//   &bateria avisos [on|off]                          (P4.4) os avisos da bateria na DM (bateria-avisos.js)
//
// Só o dono do bot, só na DM com a Judy (o nível "dono" do MAPA do visao.js: num servidor, o
// main.js responde só a linha da DM e nada roda). Saída mínima (R1/R2): uma linha por ação;
// a explicação mora no `&help bateria`. Nunca baixa nem copia a imagem.

import * as bateria from "./bateria.js";
import { tr } from "../core/i18n.js";
import { citar } from "../core/aliases.js";
import { carimbo } from "../core/tempo.js";
import { erroDeUso, erro, responder } from "../core/saida.js";
import { pedirDM } from "../core/dono.js";
import * as aleatorio from "../core/aleatorio.js";
import { avisosLigados, definirAvisos } from "./bateria-avisos.js";

const pedidosLimpar = new Map();   // userId → { codigo, categoria, ate }
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export async function cmdBateria(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P = "&" } = ctx;
  const uid = message.authorId;
  if (!ctx.ehSuperAdmin?.(uid)) {
    return sendEmbed(message.channel, { colour: COR.erro, description: tr(ctx, "🚫 Só o dono do bot.", "🚫 Bot owner only.", "🚫 Solo el dueño del bot.") });
  }
  // o main.js já responde isto num servidor (o MAPA do visao.js); aqui, por garantia: nada roda fora da DM
  if (ctx.serverId ?? message.serverId) return sendEmbed(message.channel, pedirDM(ctx));
  const sub = String(args[0] ?? "").toLowerCase();
  const anexos = Array.isArray(message.attachments) ? message.attachments : [];
  const uso = (pt, en, es) => erroDeUso(ctx, message.channel, "bateria", pt, en, es);
  const cat = (c) => `\`${c}\``;
  const CATEGORIA_INVALIDA = ["Categoria: 2 a 30 caracteres, só letras, números e hífen.", "Category: 2 to 30 characters, only letters, digits and hyphens.", "Categoría: de 2 a 30 caracteres, solo letras, números y guiones."];

  // ── avisos [on|off] (P4.4): o estado fica na config global; padrão ligado ──
  if (sub === "avisos") {
    const o = String(args[1] ?? "").toLowerCase();
    if (args.length > 2 || (o && o !== "on" && o !== "off")) return uso("Use `on` ou `off`.", "Use `on` or `off`.", "Usa `on` u `off`.");
    if (o) definirAvisos(o === "on");
    const l = linhaDosAvisos();
    return responder(ctx, message.channel, l.pt, l.en, l.es, o ? "sucesso" : "info");
  }

  // ── remover <código|ultima> ──
  if (sub === "remover") {
    if (args.length !== 2) return uso("Use um código ou `ultima`.", "Use a code or `last`.", "Usa un código o `ultima`.");
    const qual = semAcento(args[1]) === "ultima" ? "ultima" : String(args[1]);
    const r = bateria.remover(qual);
    if (!r.removido) {
      return qual === "ultima"
        ? erro(ctx, message.channel, "A bateria está vazia.", "The test set is empty.", "La batería está vacía.")
        : erro(ctx, message.channel, `Não há registro \`${String(args[1]).toUpperCase().slice(0, 12)}\`.`, `There's no record \`${String(args[1]).toUpperCase().slice(0, 12)}\`.`, `No hay registro \`${String(args[1]).toUpperCase().slice(0, 12)}\`.`);
    }
    const x = r.removido, falha = avisoArquivo(r.arquivo);
    return responder(ctx, message.channel,
      `🗑️ \`${x.codigo}\` (${cat(x.categoria)}) removida · ${r.total} no total${falha.pt}`,
      `🗑️ \`${x.codigo}\` (${cat(x.categoria)}) removed · ${r.total} in total${falha.en}`,
      `🗑️ \`${x.codigo}\` (${cat(x.categoria)}) quitada · ${r.total} en total${falha.es}`, r.arquivo === false ? "aviso" : "sucesso");
  }

  // ── limpar <categoria> | limpar confirmar <código> ──
  if (sub === "limpar") {
    if (String(args[1] ?? "").toLowerCase() === "confirmar" && args.length === 3) {
      const p = pedidosLimpar.get(uid);
      const certo = p && p.ate >= Date.now() && String(args[2]).toUpperCase() === p.codigo;
      const c = (l) => `\`${citar("bateria.limpar", l, P)}\``;
      if (!certo) return responder(ctx, message.channel, `❌ Código errado ou vencido — ${c("pt")}.`, `❌ Wrong or expired code — ${c("en")}.`, `❌ Código incorrecto o vencido — ${c("es")}.`, "erro");
      pedidosLimpar.delete(uid);
      const r = bateria.limpar(p.categoria), falha = avisoArquivo(r.arquivo);
      return responder(ctx, message.channel,
        `🗑️ ${r.n} imagem(ns) de ${cat(p.categoria)} removida(s) · ${r.total} no total${falha.pt}`,
        `🗑️ ${r.n} image(s) removed from ${cat(p.categoria)} · ${r.total} in total${falha.en}`,
        `🗑️ ${r.n} imagen(es) de ${cat(p.categoria)} quitada(s) · ${r.total} en total${falha.es}`, r.arquivo === false ? "aviso" : "sucesso");
    }
    if (args.length < 2) return uso("Diga a categoria.", "Name the category.", "Indica la categoría.");
    const categoria = bateria.normalizarCategoria(args.slice(1).join(" "));
    if (!categoria) return uso(...CATEGORIA_INVALIDA);
    const n = bateria.contarCategoria(categoria);
    if (!n) return erro(ctx, message.channel, `Não há imagens em ${cat(categoria)}.`, `There are no images in ${cat(categoria)}.`, `No hay imágenes en ${cat(categoria)}.`);
    const codigo = aleatorio.codigo("0123456789ABCDEF", 4);
    const ate = Date.now() + bateria.PRAZO_LIMPAR_MS;
    pedidosLimpar.set(uid, { codigo, categoria, ate });
    const confirma = (l) => `\`${citar("bateria.limpar.confirmar", l, P)} ${codigo}\``;
    return responder(ctx, message.channel,
      `⚠️ Apagar **${n}** imagem(ns) de ${cat(categoria)}? Confirme até ${carimbo(ate, "t")}: ${confirma("pt")}`,
      `⚠️ Erase **${n}** image(s) from ${cat(categoria)}? Confirm by ${carimbo(ate, "t")}: ${confirma("en")}`,
      `⚠️ ¿Borrar **${n}** imagen(es) de ${cat(categoria)}? Confirma antes de ${carimbo(ate, "t")}: ${confirma("es")}`, "aviso");
  }

  // ── sem nada: a contagem ──
  if (!sub) {
    if (anexos.length) return uso("Diga a categoria das imagens.", "Name the images' category.", "Indica la categoría de las imágenes.");
    const { total, categorias } = bateria.contagem();
    const av = linhaDosAvisos();   // (P4.4) o estado dos avisos, na mesma resposta
    if (!total) return responder(ctx, message.channel, `🧪 Nenhuma imagem na bateria.\n${av.pt}`, `🧪 No images in the test set.\n${av.en}`, `🧪 Ninguna imagen en la batería.\n${av.es}`, "info");
    const MOSTRA = 40;
    const linhas = categorias.slice(0, MOSTRA).map((x) => `${cat(x.categoria)} — **${x.n}**`);
    const mais = categorias.length > MOSTRA ? categorias.length - MOSTRA : 0;
    const lista = (resto) => [...linhas, ...(mais ? [resto(mais)] : [])].join("\n");
    return responder(ctx, message.channel,
      `🧪 **${total}**/${bateria.TETO} imagem(ns)\n${lista((m) => `… e mais ${m} categoria(s)`)}\n${av.pt}`,
      `🧪 **${total}**/${bateria.TETO} image(s)\n${lista((m) => `… and ${m} more categor(ies)`)}\n${av.en}`,
      `🧪 **${total}**/${bateria.TETO} imagen(es)\n${lista((m) => `… y ${m} categoría(s) más`)}\n${av.es}`, "info");
  }

  // ── <categoria> + imagens ──
  const categoria = bateria.normalizarCategoria(args.join(" "));
  if (!categoria) return uso(...CATEGORIA_INVALIDA);
  if (!anexos.length) return uso(`Anexe de 1 a ${bateria.MAX_POR_MENSAGEM} imagens na mesma mensagem.`, `Attach 1 to ${bateria.MAX_POR_MENSAGEM} images to the same message.`, `Adjunta de 1 a ${bateria.MAX_POR_MENSAGEM} imágenes en el mismo mensaje.`);
  if (anexos.length > bateria.MAX_POR_MENSAGEM) return erro(ctx, message.channel, `No máximo ${bateria.MAX_POR_MENSAGEM} imagens por mensagem.`, `At most ${bateria.MAX_POR_MENSAGEM} images per message.`, `Como máximo ${bateria.MAX_POR_MENSAGEM} imágenes por mensaje.`);
  const r = bateria.registrar(anexos, categoria);
  const codigos = r.codigos.map((c) => `\`${c}\``).join(" ");
  const fora = (pt, en, es) => [
    [r.naoImagem, `⚠️ ${r.naoImagem} ${pt[0]}`, `⚠️ ${r.naoImagem} ${en[0]}`, `⚠️ ${r.naoImagem} ${es[0]}`],
    [r.foraDoCdn, `⚠️ ${r.foraDoCdn} ${pt[1]}`, `⚠️ ${r.foraDoCdn} ${en[1]}`, `⚠️ ${r.foraDoCdn} ${es[1]}`],
    [r.repetidas, `${r.repetidas} ${pt[2]}`, `${r.repetidas} ${en[2]}`, `${r.repetidas} ${es[2]}`],
    [r.acimaDoTeto, `⚠️ ${r.acimaDoTeto} ${pt[3]}`, `⚠️ ${r.acimaDoTeto} ${en[3]}`, `⚠️ ${r.acimaDoTeto} ${es[3]}`],
  ].filter(([n]) => n);
  const motivos = fora(
    ["não é imagem", "fora do CDN do Stoat", "já estava", `acima do teto (${bateria.TETO})`],
    ["not an image", "outside Stoat's CDN", "already in", `over the cap (${bateria.TETO})`],
    ["no es imagen", "fuera del CDN de Stoat", "ya estaba", `por encima del tope (${bateria.TETO})`]);
  const falha = avisoArquivo(r.arquivo);
  const junta = (i, cab) => [cab, ...(codigos ? [codigos] : []), ...motivos.map((m) => m[i])].join(" · ") + falha[["pt", "en", "es"][i - 1]];
  return responder(ctx, message.channel,
    junta(1, `📥 ${r.codigos.length} imagem(ns) em ${cat(categoria)} · ${r.total} no total`),
    junta(2, `📥 ${r.codigos.length} image(s) in ${cat(categoria)} · ${r.total} in total`),
    junta(3, `📥 ${r.codigos.length} imagen(es) en ${cat(categoria)} · ${r.total} en total`),
    motivos.length || r.arquivo === false ? "aviso" : "sucesso");
}

// (P4.4) "Avisos da bateria: 🟢/🔴" — a resposta do `avisos` e a última linha do `&bateria`
function linhaDosAvisos() {
  const e = avisosLigados() ? "🟢" : "🔴";
  return { pt: `🔔 Avisos da bateria: ${e}`, en: `🔔 Test set alerts: ${e}`, es: `🔔 Avisos de la batería: ${e}` };
}

// O arquivo da bateria não foi gravado (o banco está certo; o erro foi ao log)
function avisoArquivo(arquivo) {
  return arquivo === false
    ? { pt: " · ⚠️ arquivo da bateria não gravado", en: " · ⚠️ test set file not written", es: " · ⚠️ archivo de la batería no guardado" }
    : { pt: "", en: "", es: "" };
}
