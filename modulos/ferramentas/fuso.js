
import { buscarFuso, fusoValido, agoraEm, diferenca, cidadeDoFuso } from "../core/fusos.js";
import { tr, lingua } from "../core/i18n.js";

const LIMITE = 12;   // além disso o embed vira parede de texto

function garantirConfig(config) {
  config.fusos ??= {};
  config.fusos.lista ??= [];        // [{ zona, apelido }]
  config.fusos.principal ??= null;  // zona de referência das diferenças
  config.fusos.formato24 ??= true;
  return config.fusos;
}

const rotulo = (item) => item.apelido || cidadeDoFuso(item.zona);

// Mensagem de "não achei", com sugestões quando houver.
function naoAchei(ctx, termo, candidatos) {
  const { sendEmbed, COR, PREFIXO } = ctx;
  const sugestoes = candidatos.length
    ? "\n\n" + candidatos.slice(0, 8).map((z) => `• \`${cidadeDoFuso(z)}\` _(${z})_`).join("\n")
    : "";
  return sendEmbed(ctx._canal, tr(ctx, {
    title: "❌ Cidade não encontrada",
    description: [
      `Não identifiquei um fuso para \`${termo}\`.`,
      candidatos.length ? "\nVocê quis dizer:" : `\nTente o nome da cidade em inglês (\`Tokyo\`) ou procure com \`${PREFIXO}fuso buscar <termo>\`.`,
    ].join("") + sugestoes,
    colour: COR.erro,
  }, {
    title: "❌ City not found",
    description: [
      `I couldn't find a timezone for \`${termo}\`.`,
      candidatos.length ? "\nDid you mean:" : `\nTry the city's English name (\`Tokyo\`) or search with \`${PREFIXO}fuso buscar <term>\`.`,
    ].join("") + sugestoes,
    colour: COR.erro,
  }));
}

export async function cmdFuso(message, args, ctx) {
  const { config, sendEmbed, COR, PREFIXO, getServer, membroTemPermissao, salvarConfig } = ctx;
  const lang = lingua(ctx);
  const cfg = garantirConfig(config);
  ctx._canal = message.channel;   // usado pelo helper naoAchei

  const sub = args[0]?.toLowerCase();
  const resto = args.slice(1).join(" ").trim();

  // ── &fuso → o relógio (público) ──
  if (!sub || sub === "lista" || sub === "list") {
    if (!cfg.lista.length) {
      return sendEmbed(message.channel, tr(ctx, {
        title: "🕐 Fusos horários",
        description: [
          "Nenhuma cidade configurada ainda.",
          "",
          `Quem tem **ManageMessages** monta a lista com \`${PREFIXO}fuso add <cidade>\`.`,
          `Ex.: \`${PREFIXO}fuso add São Paulo\` · \`${PREFIXO}fuso add Madrid\``,
          "",
          `_Para ver a hora de uma cidade sem configurar nada: \`${PREFIXO}fuso ver <cidade>\`._`,
        ].join("\n"),
        colour: COR.info,
      }, {
        title: "🕐 Timezones",
        description: [
          "No city configured yet.",
          "",
          `Anyone with **ManageMessages** builds the list with \`${PREFIXO}fuso add <city>\`.`,
          `E.g.: \`${PREFIXO}fuso add São Paulo\` · \`${PREFIXO}fuso add Madrid\``,
          "",
          `_To check a city's time without configuring anything: \`${PREFIXO}fuso ver <city>\`._`,
        ].join("\n"),
        colour: COR.info,
      }));
    }

    const quando = new Date();
    // Ordena do fuso mais atrasado ao mais adiantado — a leitura natural.
    const ordenada = [...cfg.lista].sort(
      (a, b) => agoraEm(a.zona, { quando }).offsetMin - agoraEm(b.zona, { quando }).offsetMin
    );
    const principal = cfg.principal && cfg.lista.some((i) => i.zona === cfg.principal)
      ? cfg.principal : null;

    const linhas = ordenada.map((item) => {
      const t = agoraEm(item.zona, { lang, formato24: cfg.formato24, quando });
      const dif = principal && item.zona !== principal
        ? ` · _${diferenca(item.zona, principal, lang, quando)}_`
        : (principal && item.zona === principal
          ? ` · _${lang === "en" ? "reference" : "referência"}_` : "");
      return `**${t.hora}** — ${rotulo(item)}\n${t.diaSemana} ${t.data} · ${t.offset}${dif}`;
    });

    return sendEmbed(message.channel, {
      title: lang === "en" ? "🕐 Timezones" : "🕐 Fusos horários",
      description: linhas.join("\n\n"),
      colour: COR.info,
    });
  }

  // ── &fuso ver <cidade> (público) ──
  if (["ver", "hora", "agora", "check", "now", "time"].includes(sub)) {
    if (!resto) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Faltou a cidade", description: `Uso: \`${PREFIXO}fuso ver <cidade>\``, colour: COR.erro },
        { title: "❌ Missing city",    description: `Usage: \`${PREFIXO}fuso ver <city>\``, colour: COR.erro }));
    }
    const r = buscarFuso(resto);
    if (!r.exato) return naoAchei(ctx, resto, r.candidatos);

    const t = agoraEm(r.exato, { lang, formato24: cfg.formato24 });
    const principal = cfg.principal;
    const dif = principal && principal !== r.exato
      ? `\n\n${lang === "en" ? "Compared to" : "Em relação a"} **${cidadeDoFuso(principal)}**: _${diferenca(r.exato, principal, lang)}_`
      : "";
    return sendEmbed(message.channel, {
      title: `🕐 ${cidadeDoFuso(r.exato)}`,
      description: `**${t.hora}** · ${t.diaSemana} ${t.data}\n${t.offset} _(${r.exato})_${dif}`,
      colour: COR.info,
    });
  }

  // ── &fuso buscar <termo> (público) ──
  if (["buscar", "procurar", "search", "find"].includes(sub)) {
    if (!resto) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Faltou o termo", description: `Uso: \`${PREFIXO}fuso buscar <termo>\``, colour: COR.erro },
        { title: "❌ Missing term",   description: `Usage: \`${PREFIXO}fuso buscar <term>\``, colour: COR.erro }));
    }
    const r = buscarFuso(resto);
    const achados = r.exato ? [r.exato, ...r.candidatos] : r.candidatos;
    if (!achados.length) return naoAchei(ctx, resto, []);

    return sendEmbed(message.channel, {
      title: lang === "en" ? `🔎 Results for "${resto}"` : `🔎 Resultados para "${resto}"`,
      description: achados.slice(0, 10).map((z) => {
        const t = agoraEm(z, { lang, formato24: cfg.formato24 });
        return `• **${cidadeDoFuso(z)}** — ${t.hora} (${t.offset})\n  \`${z}\``;
      }).join("\n"),
      colour: COR.info,
    });
  }

  // ── daqui em diante: configuração ──
  const server = await getServer(message).catch(() => null);
  if (!membroTemPermissao(message, server, "ManageMessages")) {
    return sendEmbed(message.channel, tr(ctx,
      { title: "🚫 Permissão insuficiente",
        description: "Você precisa de **ManageMessages** para mexer na lista de fusos.", colour: COR.erro },
      { title: "🚫 Missing permission",
        description: "You need **ManageMessages** to change the timezone list.", colour: COR.erro }));
  }

  // ── &fuso add <cidade> ──
  if (["add", "adicionar", "incluir"].includes(sub)) {
    if (!resto) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Faltou a cidade",
          description: `Uso: \`${PREFIXO}fuso add <cidade>\`\nEx.: \`${PREFIXO}fuso add São Paulo\``, colour: COR.erro },
        { title: "❌ Missing city",
          description: `Usage: \`${PREFIXO}fuso add <city>\`\nE.g.: \`${PREFIXO}fuso add Madrid\``, colour: COR.erro }));
    }
    if (cfg.lista.length >= LIMITE) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Lista cheia",
          description: `O limite é de ${LIMITE} cidades — além disso a mensagem vira uma parede de texto. Remova alguma com \`${PREFIXO}fuso remove <cidade>\`.`,
          colour: COR.erro },
        { title: "❌ List is full",
          description: `The limit is ${LIMITE} cities — beyond that the message becomes a wall of text. Remove one with \`${PREFIXO}fuso remove <city>\`.`,
          colour: COR.erro }));
    }

    const r = buscarFuso(resto);
    if (!r.exato) return naoAchei(ctx, resto, r.candidatos);
    if (cfg.lista.some((i) => i.zona === r.exato)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "🕐 Já está na lista",
          description: `**${cidadeDoFuso(r.exato)}** já aparece em \`${PREFIXO}fuso\`.`, colour: COR.aviso },
        { title: "🕐 Already on the list",
          description: `**${cidadeDoFuso(r.exato)}** is already shown in \`${PREFIXO}fuso\`.`, colour: COR.aviso }));
    }

    cfg.lista.push({ zona: r.exato, apelido: null });
    if (!cfg.principal) cfg.principal = r.exato;   // a primeira vira referência
    salvarConfig?.();

    const t = agoraEm(r.exato, { lang, formato24: cfg.formato24 });
    return sendEmbed(message.channel, tr(ctx, {
      title: "🕐 Cidade adicionada",
      description: `**${cidadeDoFuso(r.exato)}** — agora são **${t.hora}** lá (${t.offset}).\n_${r.exato}_\n\nVeja tudo com \`${PREFIXO}fuso\`.`,
      colour: COR.sucesso,
    }, {
      title: "🕐 City added",
      description: `**${cidadeDoFuso(r.exato)}** — it's **${t.hora}** there right now (${t.offset}).\n_${r.exato}_\n\nSee them all with \`${PREFIXO}fuso\`.`,
      colour: COR.sucesso,
    }));
  }

  // ── &fuso remove <cidade> ──
  if (["remove", "remover", "rem", "del", "tirar"].includes(sub)) {
    const r = buscarFuso(resto);
    // Também aceita remover pelo apelido dado ("casa da vó")
    const porApelido = cfg.lista.find(
      (i) => (i.apelido ?? "").toLowerCase() === resto.toLowerCase()
    );
    const zona = porApelido?.zona ?? r.exato;
    if (!zona) return naoAchei(ctx, resto, r.candidatos);

    const antes = cfg.lista.length;
    cfg.lista = cfg.lista.filter((i) => i.zona !== zona);
    if (cfg.principal === zona) cfg.principal = cfg.lista[0]?.zona ?? null;
    salvarConfig?.();

    const saiu = cfg.lista.length < antes;
    return sendEmbed(message.channel, tr(ctx, {
      title: saiu ? "🕐 Cidade removida" : "🕐 Não estava na lista",
      description: saiu
        ? `**${cidadeDoFuso(zona)}** não aparece mais em \`${PREFIXO}fuso\`.`
        : `**${cidadeDoFuso(zona)}** já não constava.`,
      colour: saiu ? COR.sucesso : COR.aviso,
    }, {
      title: saiu ? "🕐 City removed" : "🕐 It wasn't on the list",
      description: saiu
        ? `**${cidadeDoFuso(zona)}** no longer shows in \`${PREFIXO}fuso\`.`
        : `**${cidadeDoFuso(zona)}** wasn't there already.`,
      colour: saiu ? COR.sucesso : COR.aviso,
    }));
  }

  // ── &fuso apelido <cidade> <texto> ──
  if (["apelido", "nome", "rotulo", "rótulo", "alias", "label", "name"].includes(sub)) {
    const partes = resto.split(/\s+/);
    let alvo = null, texto = "";
    for (let corte = partes.length; corte >= 1; corte--) {
      const tentativa = partes.slice(0, corte).join(" ");
      const item = cfg.lista.find((i) => i.zona === buscarFuso(tentativa).exato);
      if (item) { alvo = item; texto = partes.slice(corte).join(" ").trim(); break; }
    }
    if (!alvo) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Cidade não está na lista",
          description: `Adicione primeiro: \`${PREFIXO}fuso add <cidade>\`.\nUso: \`${PREFIXO}fuso apelido <cidade> <texto>\``,
          colour: COR.erro },
        { title: "❌ City isn't on the list",
          description: `Add it first: \`${PREFIXO}fuso add <city>\`.\nUsage: \`${PREFIXO}fuso apelido <city> <text>\``,
          colour: COR.erro }));
    }

    if (!texto || ["limpar", "clear", "off", "reset"].includes(texto.toLowerCase())) {
      alvo.apelido = null; salvarConfig?.();
      return sendEmbed(message.channel, tr(ctx,
        { title: "🕐 Apelido removido",
          description: `Volta a aparecer como **${cidadeDoFuso(alvo.zona)}**.`, colour: COR.sucesso },
        { title: "🕐 Label removed",
          description: `It shows as **${cidadeDoFuso(alvo.zona)}** again.`, colour: COR.sucesso }));
    }

    alvo.apelido = texto.slice(0, 40);
    salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx, {
      title: "🕐 Apelido definido",
      description: `**${cidadeDoFuso(alvo.zona)}** aparece como **${alvo.apelido}**.`,
      colour: COR.sucesso,
    }, {
      title: "🕐 Label set",
      description: `**${cidadeDoFuso(alvo.zona)}** shows as **${alvo.apelido}**.`,
      colour: COR.sucesso,
    }));
  }

  // ── &fuso principal <cidade> ──
  if (["principal", "referencia", "referência", "base", "main", "reference"].includes(sub)) {
    const r = buscarFuso(resto);
    if (!r.exato || !cfg.lista.some((i) => i.zona === r.exato)) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Precisa estar na lista",
          description: `A referência tem de ser uma das cidades já adicionadas. Veja \`${PREFIXO}fuso\`.`, colour: COR.erro },
        { title: "❌ Must be on the list",
          description: `The reference must be one of the cities already added. See \`${PREFIXO}fuso\`.`, colour: COR.erro }));
    }
    cfg.principal = r.exato; salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx, {
      title: "🕐 Referência definida",
      description: `As diferenças passam a ser contadas a partir de **${cidadeDoFuso(r.exato)}**.`,
      colour: COR.sucesso,
    }, {
      title: "🕐 Reference set",
      description: `Differences are now counted from **${cidadeDoFuso(r.exato)}**.`,
      colour: COR.sucesso,
    }));
  }

  // ── &fuso formato <12|24> ──
  if (["formato", "format", "hora12", "hora24"].includes(sub)) {
    const querendo12 = /12/.test(resto) || sub === "hora12";
    const querendo24 = /24/.test(resto) || sub === "hora24";
    if (!querendo12 && !querendo24) {
      return sendEmbed(message.channel, tr(ctx,
        { title: "❌ Formato inválido", description: `Uso: \`${PREFIXO}fuso formato 12\` ou \`${PREFIXO}fuso formato 24\``, colour: COR.erro },
        { title: "❌ Invalid format",   description: `Usage: \`${PREFIXO}fuso formato 12\` or \`${PREFIXO}fuso formato 24\``, colour: COR.erro }));
    }
    cfg.formato24 = querendo24; salvarConfig?.();
    const exemplo = agoraEm(cfg.principal ?? "UTC", { lang, formato24: cfg.formato24 }).hora;
    return sendEmbed(message.channel, tr(ctx,
      { title: "🕐 Formato atualizado", description: `As horas aparecem assim: **${exemplo}**`, colour: COR.sucesso },
      { title: "🕐 Format updated",     description: `Times now look like: **${exemplo}**`, colour: COR.sucesso }));
  }

  // ── &fuso limpar ──
  if (["limpar", "clear", "reset"].includes(sub)) {
    cfg.lista = []; cfg.principal = null; salvarConfig?.();
    return sendEmbed(message.channel, tr(ctx,
      { title: "🕐 Lista esvaziada", description: "Nenhuma cidade configurada.", colour: COR.sucesso },
      { title: "🕐 List cleared",    description: "No city configured.", colour: COR.sucesso }));
  }

  const talvezCidade = buscarFuso(args.join(" "));
  if (talvezCidade.exato) {
    const t = agoraEm(talvezCidade.exato, { lang, formato24: cfg.formato24 });
    return sendEmbed(message.channel, {
      title: `🕐 ${cidadeDoFuso(talvezCidade.exato)}`,
      description: `**${t.hora}** · ${t.diaSemana} ${t.data}\n${t.offset} _(${talvezCidade.exato})_`,
      colour: COR.info,
    });
  }

  return sendEmbed(message.channel, tr(ctx, {
    title: "🕐 Fusos horários",
    description: [
      `\`${PREFIXO}fuso\` — a hora em cada cidade da lista`,
      `\`${PREFIXO}fuso ver <cidade>\` — hora de qualquer cidade`,
      `\`${PREFIXO}fuso buscar <termo>\` — procura cidades`,
      "",
      `**Configuração** _(ManageMessages)_`,
      `\`${PREFIXO}fuso add <cidade>\` · \`${PREFIXO}fuso remove <cidade>\``,
      `\`${PREFIXO}fuso apelido <cidade> <texto>\` — rótulo personalizado`,
      `\`${PREFIXO}fuso principal <cidade>\` — referência das diferenças`,
      `\`${PREFIXO}fuso formato <12|24>\` · \`${PREFIXO}fuso limpar\``,
    ].join("\n"),
    colour: COR.info,
  }, {
    title: "🕐 Timezones",
    description: [
      `\`${PREFIXO}fuso\` — the time in each city on the list`,
      `\`${PREFIXO}fuso ver <city>\` — any city's time`,
      `\`${PREFIXO}fuso buscar <term>\` — search cities`,
      "",
      `**Configuration** _(ManageMessages)_`,
      `\`${PREFIXO}fuso add <city>\` · \`${PREFIXO}fuso remove <city>\``,
      `\`${PREFIXO}fuso apelido <city> <text>\` — custom label`,
      `\`${PREFIXO}fuso principal <city>\` — reference for the differences`,
      `\`${PREFIXO}fuso formato <12|24>\` · \`${PREFIXO}fuso limpar\``,
    ].join("\n"),
    colour: COR.info,
  }));
}
