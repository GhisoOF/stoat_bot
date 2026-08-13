import { servidorPermitido as temIA } from "../ai/chat.js";
// ══════════════════════════════════════════════════════════
//  tutorial.js — &tutorial
//
//  Guia de primeiros passos. Não configura nada: mostra o
//  CAMINHO — por quais áreas passar, em que ordem, e qual
//  comando usar em cada uma. Cada área tem sua própria página
//  com os comandos exatos e o que esperar.
//
//  `&tutorial`          → o roteiro (visão geral, em ordem)
//  `&tutorial <área>`   → detalhes daquela área
//  `&tutorial permissoes` → o que o BOT precisa para funcionar
// ══════════════════════════════════════════════════════════

// Cada área: título, quando fazer, e os passos concretos.
function AREAS(P) {
  return {
    permissoes: {
      titulo: "🔑 Permissões do bot",
      ordem: 0,
      resumo: "Antes de tudo: sem isso, nada funciona.",
      corpo: [
        "Em **Configurações do servidor → Cargos**, dê ao cargo do bot:",
        "",
        "**Essenciais**",
        "• `ViewChannel`, `ReadMessageHistory` — ver e ler os canais",
        "• `SendMessage`, `SendEmbeds` — responder",
        "• `React` — reações (cargos por reação, 👀 da Judy)",
        "",
        "**Para moderar**",
        "• `ManageMessages` — apagar mensagens (automod, `&limpar`)",
        "• `KickMembers`, `BanMembers` — `&kick`, `&ban`, ban global",
        "• `TimeoutMembers` — silenciar por tempo",
        "",
        "**Para gerir cargos e canais**",
        "• `ManageRole` — **criar** cargos (cargo de silêncio, cargos de nível)",
        "• `AssignRoles` — **dar** cargos a alguém (autorole, nível, reação)",
        "• `ManageChannel` — criar/editar canais",
        "",
        "⚠️ `ManageRole` e `AssignRoles` são coisas **diferentes**: uma cria o cargo, a outra entrega para a pessoa. Faltando a segunda, o bot cria os cargos e falha na hora de aplicar.",
        "",
        "💡 O cargo do bot precisa estar **acima** dos cargos que ele vai gerenciar na lista de cargos.",
      ],
    },

    moderacao: {
      titulo: "🛡️ Moderação automática",
      ordem: 1,
      resumo: "Os filtros que agem sozinhos e o que acontece com quem infringe.",
      corpo: [
        `**1. Veja o estado atual:** \`${P}automod\``,
        "Lista cada filtro (convites, spam, links, caps, menções em massa, caracteres estranhos) e se está ligado.",
        "",
        `**2. Ligue/desligue o que quiser:** \`${P}automod <filtro> on|off\``,
        `Ex.: \`${P}automod antilink on\``,
        "",
        `**3. Defina a punição:** \`${P}punicao modo <avisar|apagar|confirmar|acumular|banir>\``,
        "• `avisar` — só avisa (bom para testar)",
        "• `apagar` — remove a mensagem, não pune a pessoa",
        "• `confirmar` — apaga, silencia e chama um moderador",
        "• `acumular` — dá avisos e bane ao atingir o limite",
        "• `banir` — bane na hora",
        "",
        `**4. Se usar \`acumular\`:** \`${P}punicao warns <número>\``,
        `**5. Se usar \`confirmar\`:** precisa de um cargo de silêncio → \`${P}cargomudo\` cria um pronto.`,
        "",
        `**Detecção de conteúdo** (golpes, divulgação): \`${P}scam on\` e \`${P}scam sensibilidade <baixa|media|alta>\`.`,
        `**Links permitidos:** \`${P}whitelist add <domínio>\`.`,
        "",
        `**Aviso manual:** \`${P}warn @pessoa <motivo>\` — conta junto com os avisos do automod.`,
        `**Quem pode moderar:** \`${P}acesso cargo add <@cargo>\` dá poder de moderação a um cargo, sem precisar mexer nas permissões do Stoat.`,
        `**Onde os comandos valem:** \`${P}acesso canal somente\` + \`${P}acesso canal add\` limita os comandos a canais escolhidos.`,
      ],
    },

    logs: {
      titulo: "📋 Registro (logs)",
      ordem: 2,
      resumo: "Onde o bot anota o que aconteceu.",
      corpo: [
        "Crie um canal (ex.: **#log**) visível só para a equipe. Depois, **dentro dele**:",
        "",
        `\`${P}log canal aqui\` — define este canal como o de registro`,
        `\`${P}log\` — mostra o que está sendo registrado`,
        `\`${P}log evento <punicoes|membros|mensagens|cargos|comandos> on|off\``,
        "",
        "Vale registrar punições e entradas/saídas; `comandos` é ruidoso e começa desligado.",
        "",
        "💡 É no canal de log que a Judy te marca quando a moderação por IA apaga algo.",
      ],
    },

    cargos: {
      titulo: "🎭 Cargos",
      ordem: 3,
      resumo: "Cargo ao entrar, cargos por reação e cargo de silêncio.",
      corpo: [
        `**Cargo automático para quem entra:** \`${P}autorole <id-do-cargo>\``,
        "Pegue o ID em Configurações → Cargos → *Copy role ID*.",
        "",
        `**Cargos por reação** (a pessoa reage e ganha o cargo):`,
        `1. Publique a mensagem: \`${P}embed titulo: Escolha seus cargos | descricao: 🎮 Jogos · 📢 Avisos\``,
        `2. Ligue emoji → cargo: \`${P}reactionrole add <mensagem> 🎮 <id-do-cargo>\``,
        "   A **mensagem** pode ser o ID **ou o link** (menu `...` → *Copiar link*).",
        `3. Confira com \`${P}reactionrole list\``,
        `4. Se só uma opção pode valer (cor, time, idade): \`${P}reactionrole exclusivo <mensagem> on\``,
        "   Aí escolher um emoji **troca** o cargo anterior em vez de acumular.",
        "",
        `**Cargo de silêncio** (para \`${P}silence\`): \`${P}cargomudo\``,
        "Cria um cargo com tudo negado e já bloqueia nos canais.",
        "",
        `**Cor dos cargos:** \`${P}cor <cargo> <cor>\``,
        `Aceita hex, nome, e até **gradiente** — que o cliente do Stoat não oferece:`,
        `\`${P}cor VIP gradiente #FF71CE #01CDFE #05FFA1\``,
        `\`${P}cor VIP preset vaporwave\` · \`${P}cor presets\` lista os prontos`,
        `\`${P}cor painel aqui\` — **faz tudo**: cria os cargos coloridos, publica a mensagem de escolha, reage e liga os cargos por reação`,
      ],
    },

    xp: {
      titulo: "🎮 XP e níveis",
      ordem: 4,
      resumo: "As pessoas ganham XP conversando e sobem de nível.",
      corpo: [
        `**Ligar:** \`${P}xp on\``,
        `**Criar os cargos de nível:** \`${P}xp criarcargos\` (um a cada 10 níveis)`,
        `**Ajustar:** \`${P}xp setup\` mostra tudo que dá para mudar:`,
        `• \`${P}xp setup intervalo <5|10>\` — de quantos em quantos níveis dar cargo`,
        `• \`${P}xp setup xp <min> <max>\` — quanto ganha por mensagem`,
        `• \`${P}xp setup cooldown <segundos>\` — evita farm por spam`,
        `• \`${P}xp setup canal aqui|off\` — onde anunciar o level up`,
        "",
        `**Ver o ranking:** \`${P}xp top\` · **seu perfil:** \`${P}nivel\``,
      ],
    },

    ia: {
      titulo: "🤖 A Judy (IA)",
      ordem: 5,
      soComIA: true,
      resumo: "Conversa, memória, participação e moderação por IA.",
      corpo: [
        `**Testar:** \`${P}chat status\` mostra se o serviço de IA está no ar.`,
        "Depois é só mencionar o bot ou usar `&chat <mensagem>`.",
        "",
        `**Deixar ela participar sozinha:** \`${P}chat livre on\` (neste canal)`,
        `• \`${P}chat livre modo relevante\` — só quando o assunto vale`,
        `• \`${P}chat livre modo todas\` — responde tudo`,
        "",
        `**Comentários por iniciativa:** \`${P}chat comentar aqui\` · \`${P}chat comentar pordia <n>\``,
        "",
        `**Perfil e memória:** \`${P}chat perfil\` mostra o que ela sabe de você.`,
        `\`${P}chat cuidado @pessoa on\` — trata alguém com gentileza extra.`,
        `\`${P}chat esquecer\` apaga o seu; \`${P}chat esquecer tudo\` zera o servidor.`,
        "",
        `**Moderação por IA:** \`${P}modia criterios <o que moderar, em texto livre>\` e depois \`${P}modia on\`.`,
        "Ela apaga o que violar e marca o dono no log — nunca bane sozinha.",
      ],
    },

    noticias: {
      titulo: "📰 Notícias (RSS)",
      ordem: 6,
      resumo: "O bot posta as novidades dos feeds a cada hora.",
      corpo: [
        "Crie um canal (ex.: **#noticias**) e, **dentro dele**:",
        "",
        `\`${P}rss canal aqui\` — define onde publicar`,
        `\`${P}rss add <url-do-feed>\` — ex.: \`${P}rss add https://g1.globo.com/rss/g1/\``,
        `\`${P}rss list\` — feeds cadastrados`,
        `\`${P}rss agora\` — força um ciclo para testar`,
        "",
        "A cada hora o bot posta os itens novos. Onde a IA está disponível, a Judy escreve também um resumo geral no tom dela.",
      ],
    },

    mensagens: {
      titulo: "✉️ Mensagens bonitas",
      ordem: 7,
      resumo: "Publicar avisos e regras com visual de embed.",
      corpo: [
        `\`${P}embed\` sozinho mostra a ajuda. O formato é \`campo: valor\`, um por linha:`,
        "```",
        `${P}embed`,
        "titulo: Regras",
        "descricao: Seja legal com todos.",
        "cor: #5865F2",
        "```",
        "",
        `Ou tudo numa linha: \`${P}embed titulo: Regras | descricao: Seja legal | cor: azul\``,
        "",
        "**Campos:** `titulo` `descricao` `cor` `rodape` `imagem` `canal`.",
      ],
    },

    rpg: {
      titulo: "🎲 RPG (personagem)",
      ordem: 8,
      resumo: "Cada pessoa cria um personagem, sobe de nível e monta sua build.",
      corpo: [
        `**Criar o personagem:** \`${P}game criar <nome>\``,
        `**Ver a ficha:** \`${P}game\` · de outra pessoa: \`${P}game ficha @pessoa\``,
        "",
        "**Os 9 atributos:**",
        "💪 Força · 🎯 Destreza · 🛡️ Resistência · 💨 Agilidade · ❤️ Vida",
        "🔷 Mana · 🧠 Inteligência · 🍀 Sorte · ✨ Carisma",
        "",
        `**Distribuir pontos:** \`${P}game pontos <atributo> [quantos]\``,
        `Aceita abreviação: \`${P}game pontos int 3\``,
        "",
        "🧠 **Inteligência** e 🍀 **Sorte** aumentam o XP que você ganha **e** quantos",
        "pontos recebe por nível — com retorno decrescente, então nunca param de valer",
        "e nunca viram a única escolha possível.",
        "",
        "",
        "**Itens e equipamento**",
        `\`${P}game itens\` — sua mochila, agrupada por raridade`,
        `\`${P}game equipar <item>\` — equipa (o bônus entra na ficha)`,
        `\`${P}game desequipar <slot ou item>\``,
        `\`${P}game catalogo [raridade]\` — o que existe no jogo`,
        "",
        "**Slots:** ⚔️ Arma · 🪖 Capacete · 🛡️ Armadura · 💍 3 Acessórios",
        "**Raridades:** ⚪ Comum · 🟢 Incomum · 🔵 Raro · 🟣 Épico · 🟠 Lendário",
        "Os comuns (♾️) estão sempre disponíveis — ninguém fica sem equipamento.",
        "",
        `**Ranking:** \`${P}game top\` · **Recomeçar:** \`${P}game apagar confirmar\``,
        "",
        `⚠️ Não confunda com \`${P}xp\`: aquele é o nível por mensagens do servidor.`,
        "Este é o RPG, com personagem próprio.",
        "",
        "_Missões, followers e economia chegam nas próximas etapas._",
      ],
    },

    ajustes: {
      titulo: "⚙️ Ajustes gerais",
      ordem: 9,
      resumo: "Panorama, comandos desativados e lista global.",
      corpo: [
        `\`${P}config\` — panorama de tudo que está configurado neste servidor`,
        `\`${P}comando <nome> on|off\` — liga/desliga um comando aqui`,
        `\`${P}banglobal <off|avisar|banir>\` — o que fazer quando entra alguém banido em outro servidor`,
        `\`${P}debug\` — diagnóstico quando algo não funciona`,
        `\`${P}debug canais\` — o que o bot enxerga e pode fazer em CADA canal`,
        `\`${P}debug silence @pessoa\` — checa se o silêncio vai funcionar mesmo`,
        "",
        `E \`${P}help\` lista tudo, com \`${P}help <comando>\` para detalhes.`,
      ],
    },
  };
}

const APELIDOS = {
  permissao: "permissoes", permissões: "permissoes", perms: "permissoes", bot: "permissoes",
  automod: "moderacao", moderação: "moderacao", punicao: "moderacao", punição: "moderacao", filtros: "moderacao",
  log: "logs", registro: "logs",
  cargo: "cargos", autorole: "cargos", reactionrole: "cargos", roles: "cargos",
  nivel: "xp", niveis: "xp", "níveis": "xp", level: "xp",
  game: "rpg", personagem: "rpg", jogo: "rpg",
  judy: "ia", chat: "ia", modia: "ia",
  rss: "noticias", feed: "noticias", "notícias": "noticias",
  embed: "mensagens", avisos: "mensagens",
  config: "ajustes", geral: "ajustes",
};

export async function cmdTutorial(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P } = ctx;

  // A IA só roda nos servidores da allowlist. Mostrar essa área onde ela não
  // funciona é pior que omitir: a pessoa tenta e nada acontece.
  const comIA = (() => { try { return temIA(ctx.serverId); } catch { return false; } })();

  const todas = AREAS(P);
  const areas = {};
  for (const [k, v] of Object.entries(todas)) {
    if (v.soComIA && !comIA) continue;
    areas[k] = v;
  }
  const pedido = args[0]?.toLowerCase();

  // ── Página de uma área ──
  if (pedido) {
    const chave = areas[pedido] ? pedido : APELIDOS[pedido];
    const area = chave ? areas[chave] : null;
    if (!area) {
      const nomes = Object.keys(areas).map((k) => `\`${k}\``).join(" · ");
      return sendEmbed(message.channel, {
        title: "❓ Área desconhecida",
        description: `Não conheço essa área. As que existem:\n${nomes}\n\nOu use \`${P}tutorial\` para ver o roteiro completo.`,
        colour: COR.aviso,
      });
    }
    const ordem = Object.entries(areas).sort((a, b) => a[1].ordem - b[1].ordem).map(([k]) => k);
    const i = ordem.indexOf(chave);
    const prox = ordem[i + 1];
    const rodape = prox
      ? `\n\n➡️ Próxima área: \`${P}tutorial ${prox}\` (${areas[prox].titulo})`
      : `\n\n✅ Essa é a última área. \`${P}config\` mostra como tudo ficou.`;
    return sendEmbed(message.channel, {
      title: area.titulo,
      description: area.corpo.join("\n").slice(0, 1900) + rodape,
      colour: COR.info,
    });
  }

  // ── Roteiro geral ──
  const ordenadas = Object.entries(areas).sort((a, b) => a[1].ordem - b[1].ordem);
  const linhas = [
    "Um servidor novo costuma ficar pronto nesta ordem. **Nada é obrigatório** — pule o que não fizer sentido para você.",
    "",
  ];
  for (const [chave, a] of ordenadas) {
    linhas.push(`**${a.ordem === 0 ? "⚠️" : a.ordem + "."} ${a.titulo}**`);
    linhas.push(`${a.resumo}`);
    linhas.push(`\`${P}tutorial ${chave}\``);
    linhas.push("");
  }
  linhas.push(`Cada página traz os comandos exatos. \`${P}help\` lista todos os comandos, \`${P}config\` mostra o estado atual do servidor.`);

  return sendEmbed(message.channel, {
    title: "📚 Por onde começar",
    description: linhas.join("\n").slice(0, 1950),
    colour: COR.info,
  });
}
