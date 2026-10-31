// &help — a ajuda, toda do registro (P2, 31 out 2026).
//
//   &help                    índice curto: os comandos de cada grupo
//   &help <grupo>            os comandos do grupo, com uma linha cada
//   &help <comando>          a página do comando (uso, permissão, descrição, exemplo, parâmetros)
//   &help <comando> <parte>  a página de uma parte (`ajuda.paginas` no registro)
//
// O comando vence o grupo (`&help xp`, `&help game` abriam o grupo — o bug do P1), e um
// atalho de mais palavras vence o comando (`&help chat sair` → `&privacidade chat sair`).
// Cada um vê só o que pode usar aqui (visao.js): membro, staff ou dono do bot; sem IA ou
// sem voz no servidor, os comandos deles somem.

import * as visaoMod from "./visao.js";
import { tr, idiomaDe } from "../core/i18n.js";
import { citar, nomeExibido, subExibido, marcarTraduzido, idDoNome } from "../core/aliases.js";
import { enviarPaginado, paginarLinhas } from "../core/paginas.js";
import { maisParecido } from "../core/parecido.js";
import { REGISTRO } from "../comandos/index.js";
import { GRUPOS, ORDEM } from "./help-grupos.js";
import { resolverPedido, pagina, comandosPorGrupo, resumoDe, entrada, tituloDoGrupo, noDaPagina } from "../core/ajuda-registro.js";

export async function cmdHelp(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;
  const lang = idiomaDe(ctx);
  const visao = await visaoMod.quemVe(message, ctx);
  const pedido = resolverPedido(args);
  const ajuda = (l = lang) => citar("help", l, P);
  // texto que vai numa página "pronta" (o espanhol inteiro marcado): sem o tr(), que marca cada trecho
  const L = (pt, en, es) => ({ pt, en, es })[lang];
  // o que quem vê pode ver: o comando inteiro (e o grupo do dono só para o dono)
  const vePodeVer = (id) => visaoMod.podeVer(visao, id);
  const porGrupo = comandosPorGrupo();
  const gruposVisiveis = ORDEM.filter((g) => (!GRUPOS[g].soDono || visao.nivel === "dono") && porGrupo[g].some(vePodeVer));
  const enviar = (titulo, linhas, pronto) => {
    const marca = pronto && lang === "es" ? marcarTraduzido : (t) => t;
    const paginas = paginarLinhas(linhas, { titulo }).map((p) => ({ ...p, title: marca(p.title), description: marca(p.description) }));
    if (paginas.length === 1) return sendEmbed(message.channel, { ...paginas[0], colour: COR.info });
    return enviarPaginado(ctx, message.channel, { paginas, autorId: message.authorId, colour: COR.info });
  };

  // ── o índice ──
  if (pedido.tipo === "indice") {
    const linhas = gruposVisiveis.map((g) => `${GRUPOS[g].emoji} **${GRUPOS[g].titulo[lang]}** — ${porGrupo[g].filter(vePodeVer).map((id) => `\`${citar(id, lang, P)}\``).join(" ")}`);
    linhas.push("", L(
      `\`${ajuda("pt")} <comando>\` · \`${ajuda("pt")} <grupo>\``,
      `\`${ajuda("en")} <command>\` · \`${ajuda("en")} <group>\``,
      `\`${ajuda("es")} <comando>\` · \`${ajuda("es")} <grupo>\``));
    return enviar(L("📋 Ajuda", "📋 Help", "📋 Ayuda"), linhas, true);
  }

  // ── um grupo ──
  if (pedido.tipo === "grupo") {
    const g = pedido.grupo;
    if (!gruposVisiveis.includes(g)) return naoAchei(pedido.grupo);
    const linhas = porGrupo[g].filter(vePodeVer).map((id) => `\`${citar(id, lang, P)}\` — ${resumoDe(entrada(id), lang, P)}`);
    return enviar(tituloDoGrupo(g, lang), linhas, true);
  }

  // ── um comando (ou uma parte dele) ──
  if (pedido.tipo === "comando") {
    const { id } = pedido;
    const sub = pedido.caminho?.[0] ?? pedido.resto?.[0] ?? "";
    const barrado = barrar(id, String(sub).toLowerCase());
    if (barrado) return sendEmbed(message.channel, barrado);
    // página marcada `soDono` no registro (ex.: `&help game admin`): só o dono do bot a vê
    if (visao.nivel !== "dono" && (pedido.caminho ?? []).some((_, i) => noDaPagina(id, pedido.caminho.slice(0, i + 1))?.soDono)) return naoAchei(sub);
    // página marcada `recurso: "ia"` (ex.: `&help config ia`, `&help chat`): onde a IA não roda, como se não existisse
    if (!visao.ia && (pedido.caminho ?? []).some((_, i) => noDaPagina(id, pedido.caminho.slice(0, i + 1))?.recurso === "ia")) return naoAchei(args[0]);
    // a parte pedida não tem página própria: se é um subcomando do comando, a página dele
    // explica; se nem isso, diz quais partes existem
    if (pedido.resto?.length && !pedido.caminho?.length && !ehSubcomando(id, pedido.resto[0])) {
      const pg = pagina(id, [], lang, P);
      const partes = pg.filhos.map((k) => `\`${ajuda()} ${nomeExibido(id, lang)} ${subExibido(id, k, lang)}\``).join(" · ");
      return sendEmbed(message.channel, { colour: COR.aviso, description: tr(ctx,
        `❓ \`${String(pedido.resto[0]).slice(0, 30)}\` não é parte de \`${citar(id, "pt", P)}\`.${partes ? ` ${partes}` : ` \`${ajuda("pt")} ${id}\``}`,
        `❓ \`${String(pedido.resto[0]).slice(0, 30)}\` isn't part of \`${citar(id, "en", P)}\`.${partes ? ` ${partes}` : ` \`${ajuda("en")} ${nomeExibido(id, "en")}\``}`,
        `❓ \`${String(pedido.resto[0]).slice(0, 30)}\` no es parte de \`${citar(id, "es", P)}\`.${partes ? ` ${partes}` : ` \`${ajuda("es")} ${nomeExibido(id, "es")}\``}`) });
    }
    const pg = pagina(id, pedido.caminho ?? [], lang, P);
    if (!pg) return naoAchei(args[0]);
    const corpo = visaoMod.filtrarLinhas(pg.linhas, visao);
    const caminho = pedido.caminho ?? [];
    const tabela = caminho.length ? `${id}.${caminho.at(-1)}` : id;
    const filhos = pg.filhos.filter((k) => visaoMod.podeVer(visao, id, caminho[0] ?? k, caminho[0] ? k : "")
      && (visao.nivel === "dono" || !noDaPagina(id, [...caminho, k])?.soDono));
    if (filhos.length) {
      const prefixo = [nomeExibido(id, lang), ...caminho.map((k, i) => subExibido(i ? `${id}.${caminho[i - 1]}` : id, k, lang))].join(" ");
      corpo.push("", `**${L("Partes", "Parts", "Partes")}:** ${filhos.map((k) => `\`${ajuda()} ${prefixo} ${subExibido(tabela, k, lang)}\``).join(" · ")}`);
    }
    return enviar(pg.titulo, corpo, pg.pronto);
  }

  return naoAchei(pedido.palavra);

  // ── ajudantes ──
  function ehSubcomando(id, palavra) {
    const w = String(palavra ?? "").toLowerCase();
    const c = entrada(id);
    const conhecidos = new Set([...Object.keys(c?.subcomandos ?? {}), ...Object.values(c?.subcomandos ?? {}).flat(), ...Object.keys(c?.familias ?? {}), ...Object.values(c?.es?.subcomandos ?? {}).flat()]);
    return conhecidos.has(w);
  }
  function barrar(id, sub = "") {
    if (visaoMod.podeVer(visao, id, sub)) return null;
    const nome = `\`${citar(id, lang, P)}\``;
    const recurso = visaoMod.recursoDoComando(id);
    if ((recurso === "ia" && !visao.ia) || (recurso === "voz" && !visao.voz)) {
      // (integração P2) com título: quem lê a tela (e o teste que pula a página restrita) vê o 🚫 na 1ª linha
      return { colour: COR.aviso, title: tr(ctx, "🚫 Não disponível aqui", "🚫 Not available here", "🚫 No disponible aquí"), description: tr(ctx, `${nome} não está disponível neste servidor.`, `${nome} isn't available on this server.`, `${nome} no está disponible en este servidor.`) };
    }
    if (visaoMod.nivelDoComando(id, sub) === "dono") return naoAcheiEmbed(id);
    return { colour: COR.info, description: tr(ctx, `🔒 ${nome} é da staff.`, `🔒 ${nome} is for staff.`, `🔒 ${nome} es del staff.`) };
  }
  function naoAcheiEmbed(palavra) {
    const w = String(palavra ?? "").slice(0, 30);
    // "você quis dizer": comandos que quem vê pode usar, em qualquer idioma
    const nomes = REGISTRO.filter((c) => vePodeVer(c.id)).flatMap((c) => [c.id, nomeExibido(c.id, "en"), nomeExibido(c.id, "es")]);
    const parecido = maisParecido(String(palavra ?? "").toLowerCase(), new Set(nomes));
    const sug = parecido ? `\`${ajuda()} ${nomeExibido(idDoNome(parecido), lang)}\`` : null;
    return { colour: COR.aviso, description: tr(ctx,
      `❓ Não há ajuda para \`${w}\`.${sug ? ` Você quis dizer ${sug}?` : ` \`${ajuda("pt")}\``}`,
      `❓ There's no help for \`${w}\`.${sug ? ` Did you mean ${sug}?` : ` \`${ajuda("en")}\``}`,
      `❓ No hay ayuda para \`${w}\`.${sug ? ` ¿Quisiste decir ${sug}?` : ` \`${ajuda("es")}\``}`) };
  }
  function naoAchei(palavra) { return sendEmbed(message.channel, naoAcheiEmbed(palavra)); }
}

// Os grupos com o nome que se digita em cada idioma (para quem monta texto)
