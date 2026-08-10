import { limparId } from "../core/ids.js";
// ══════════════════════════════════════════════════════════
//  cor-cargo.js — &cor
//
//  Customiza a cor dos cargos, inclusive com GRADIENTE.
//
//  Por que via REST e não pelo SDK: o campo `colour` do cargo no
//  Stoat aceita qualquer valor CSS válido — e é isso que permite
//  `linear-gradient(...)`. O SDK trata cor como hex simples, então
//  falamos direto com a API:
//
//    PATCH https://api.stoat.chat/servers/{serverId}/roles/{roleId}
//    Header: X-Bot-Token
//    Body:   { "colour": "<qualquer cor CSS>" }
//
//  Armadilha conhecida: escrever `gradient(...)` em vez de
//  `linear-gradient(...)` devolve 400. A validação avisa antes.
// ══════════════════════════════════════════════════════════

const API = (process.env.STOAT_API || "https://api.stoat.chat").replace(/\/$/, "");
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

// Cores nomeadas para quem não quer pensar em hex.
const NOMES = {
  vermelho: "#EF4444", laranja: "#F97316", amarelo: "#EAB308", verde: "#22C55E",
  esmeralda: "#10B981", ciano: "#06B6D4", azul: "#3B82F6", indigo: "#6366F1",
  roxo: "#A855F7", rosa: "#EC4899", magenta: "#FF00FF", branco: "#FFFFFF",
  preto: "#111111", cinza: "#6B7280", dourado: "#D4AF37", prata: "#C0C0C0",
};

// Gradientes prontos — o atalho para o efeito bonito sem montar nada.
const PRESETS = {
  "arco-iris":  "linear-gradient(90deg, #FF0018 0%, #FFA52C 17%, #FFFF41 33%, #008018 50%, #0000F9 67%, #86007D 100%)",
  fogo:         "linear-gradient(90deg, #FF0000 0%, #FF7A00 50%, #FFD600 100%)",
  oceano:       "linear-gradient(90deg, #0EA5E9 0%, #2563EB 50%, #1E1B4B 100%)",
  neon:         "linear-gradient(90deg, #00F0FF 0%, #FF00E5 50%, #FFE600 100%)",
  vaporwave:    "linear-gradient(90deg, #FF71CE 0%, #01CDFE 50%, #05FFA1 100%)",
  poente:       "linear-gradient(90deg, #FF512F 0%, #F09819 100%)",
  floresta:     "linear-gradient(90deg, #134E5E 0%, #71B280 100%)",
  ouro:         "linear-gradient(90deg, #BF953F 0%, #FCF6BA 45%, #B38728 100%)",
  cyberpunk:    "linear-gradient(90deg, #F8EF00 0%, #FF00A0 50%, #00E0FF 100%)",
  sangue:       "linear-gradient(90deg, #7F0000 0%, #FF0000 60%, #FF6A6A 100%)",
  gelo:         "linear-gradient(90deg, #E0F7FF 0%, #7DD3FC 50%, #0369A1 100%)",
  trans:        "linear-gradient(90deg, #5BCEFA 0%, #F5A9B8 33%, #FFFFFF 50%, #F5A9B8 67%, #5BCEFA 100%)",
};

// ── Normalização de uma cor sólida ────────────────────────
function corSolida(txt) {
  if (!txt) return null;
  const t = txt.trim().toLowerCase().replace(/^["'`]|["'`]$/g, "").replace(/[,;.]+$/, "");
  if (NOMES[t]) return NOMES[t];
  if (/^#?[0-9a-f]{6}$/i.test(t)) return t.startsWith("#") ? t.toUpperCase() : `#${t.toUpperCase()}`;
  if (/^#?[0-9a-f]{3}$/i.test(t)) {
    const h = t.replace("#", "");
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  }
  if (/^rgba?\([\d\s.,%]+\)$/i.test(t)) return t;   // rgb()/rgba() são CSS válidos
  return null;
}

// ── Monta um linear-gradient a partir de 2+ cores ─────────
function montarGradiente(cores, angulo = 90) {
  const paradas = cores.map((c, i) => {
    const pct = cores.length === 1 ? 0 : Math.round((i / (cores.length - 1)) * 100);
    return `${c} ${pct}%`;
  });
  return `linear-gradient(${angulo}deg, ${paradas.join(", ")})`;
}

// ── Valida um CSS colado pelo usuário ─────────────────────
function validarCss(txt) {
  const t = txt.trim();
  // erro clássico: `gradient(...)` sem o `linear-`
  if (/^\s*gradient\s*\(/i.test(t)) {
    return { erro: "Faltou o `linear-` no começo: use `linear-gradient(...)`, não `gradient(...)`. É o motivo mais comum de erro 400." };
  }
  if (/^(linear|radial|conic|repeating-linear|repeating-radial)-gradient\s*\(/i.test(t)) {
    if (!t.includes(")")) return { erro: "O gradiente está incompleto — faltou fechar o parêntese." };
    return { valor: t };
  }
  const solida = corSolida(t);
  if (solida) return { valor: solida };
  return null;   // não reconhecido: quem chamou decide o que fazer
}

// ── Acha o cargo por ID ou por nome ───────────────────────
function acharCargo(server, alvo) {
  const limpo = limparId(alvo);
  if (ULID.test(limpo)) {
    const r = server.roles?.get?.(limpo);
    return r ? { id: limpo, nome: r.name ?? limpo } : { id: limpo, nome: limpo };
  }
  const busca = limpo.toLowerCase();
  const lista = server.roles ? [...server.roles.entries()] : [];
  let exato = null, parcial = null;
  for (const [id, role] of lista) {
    const nome = (role?.name ?? "").toLowerCase();
    if (nome === busca) { exato = { id, nome: role.name }; break; }
    if (!parcial && nome.includes(busca)) parcial = { id, nome: role.name };
  }
  return exato ?? parcial ?? null;
}

// ── Chamada à API ─────────────────────────────────────────
async function aplicarCor(serverId, roleId, colour) {
  const token = process.env.BOT_TOKEN;
  if (!token) return { ok: false, erro: "BOT_TOKEN não está definido no ambiente do bot." };

  const url = `${API}/servers/${serverId}/roles/${roleId}`;
  try {
    const r = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "X-Bot-Token": token },
      body: JSON.stringify(colour === null ? { remove: ["Colour"] } : { colour }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) return { ok: true };
    const corpo = await r.text().catch(() => "");
    const dica = r.status === 403 ? " — o cargo do bot precisa de **ManageRole** e estar **acima** do cargo que está editando."
      : r.status === 400 ? " — o Stoat recusou o valor da cor."
      : r.status === 404 ? " — cargo ou servidor não encontrado."
      : "";
    return { ok: false, erro: `API respondeu ${r.status}${dica}${corpo ? `\n\`\`\`\n${corpo.slice(0, 300)}\n\`\`\`` : ""}` };
  } catch (e) {
    return { ok: false, erro: `Não consegui falar com a API: ${e?.message ?? e}` };
  }
}

// ══════════════════════════════════════════════════════════
export async function cmdCor(message, args, ctx) {
  const { sendEmbed, COR, PREFIXO: P, getServer, membroTemPermissao, serverId } = ctx;

  const server = await getServer(message);
  if (!server) {
    return sendEmbed(message.channel, { title: "❌ Fora de um servidor",
      description: "Este comando só funciona dentro de um servidor.", colour: COR.erro });
  }

  const sub = args[0]?.toLowerCase();

  // ── Ajuda ──
  if (!sub || sub === "ajuda" || sub === "help") {
    return sendEmbed(message.channel, {
      title: "🎨 Cor dos cargos",
      description: [
        "**Cor sólida**",
        `\`${P}cor <cargo> #FF00AA\` · \`${P}cor <cargo> roxo\``,
        "",
        "**Gradiente** (2 ou mais cores)",
        `\`${P}cor <cargo> gradiente #FF0000 #00FF00 #0000FF\``,
        `\`${P}cor <cargo> gradiente 45 vermelho azul\` — o número no início é o ângulo`,
        "",
        "**Prontos**",
        `\`${P}cor <cargo> preset <nome>\` — ${Object.keys(PRESETS).map((k) => `\`${k}\``).join(", ")}`,
        "",
        "**CSS na mão** (qualquer gradiente válido)",
        `\`${P}cor <cargo> linear-gradient(90deg, #f00 0%, #00f 100%)\``,
        "",
        "**Outros**",
        `\`${P}cor <cargo> remover\` — volta à cor padrão`,
        `\`${P}cor lista\` — cargos e suas cores atuais`,
        `\`${P}cor presets\` — vê os gradientes prontos`,
        "",
        "_O cargo pode ser pelo **nome** ou pelo ID._",
      ].join("\n"),
      colour: COR.info,
    });
  }

  // ── Presets ──
  if (["presets", "preset", "prontos"].includes(sub) && !args[1]) {
    return sendEmbed(message.channel, {
      title: "🎨 Gradientes prontos",
      description: Object.entries(PRESETS).map(([k, v]) =>
        `**${k}**\n\`${v.slice(0, 90)}${v.length > 90 ? "…" : ""}\``).join("\n\n").slice(0, 1900),
      colour: COR.info,
    });
  }

  // ── Lista ──
  if (["lista", "list", "cargos"].includes(sub)) {
    const lista = server.roles ? [...server.roles.entries()] : [];
    if (!lista.length) {
      return sendEmbed(message.channel, { title: "🎨 Cargos", description: "Não consegui ler os cargos deste servidor.", colour: COR.aviso });
    }
    const linhas = lista.slice(0, 25).map(([id, r]) => {
      const c = r?.colour ?? r?.color;
      const desc = !c ? "_padrão_" : /gradient/i.test(c) ? "🌈 gradiente" : `\`${c}\``;
      return `• **${r?.name ?? id}** — ${desc}`;
    });
    return sendEmbed(message.channel, { title: "🎨 Cores dos cargos",
      description: linhas.join("\n").slice(0, 1900), colour: COR.info });
  }

  // A partir daqui mexe em cargo → precisa de permissão
  if (membroTemPermissao && !membroTemPermissao(message, server, "ManageRole")) {
    return sendEmbed(message.channel, { title: "🚫 Permissão insuficiente",
      description: "Você precisa de **ManageRole** para mudar a cor dos cargos.", colour: COR.erro });
  }

  const cargo = acharCargo(server, args[0]);
  if (!cargo) {
    return sendEmbed(message.channel, { title: "❌ Cargo não encontrado",
      description: `Não achei o cargo **${args[0]}**. Veja os nomes com \`${P}cor lista\` — ou passe o ID.`,
      colour: COR.erro });
  }

  const resto = args.slice(1);
  if (!resto.length) {
    return sendEmbed(message.channel, { title: "❌ Faltou a cor",
      description: `\`${P}cor ${args[0]} <cor|gradiente ...|preset <nome>|remover>\`\nVeja as opções com \`${P}cor\`.`,
      colour: COR.erro });
  }

  const acao = resto[0].toLowerCase();
  let colour = null, descricao = "";

  // ── remover ──
  if (["remover", "remove", "limpar", "padrao", "padrão"].includes(acao)) {
    const r = await aplicarCor(serverId, cargo.id, null);
    if (!r.ok) return sendEmbed(message.channel, { title: "❌ Não consegui remover", description: r.erro, colour: COR.erro });
    return sendEmbed(message.channel, { title: "🎨 Cor removida",
      description: `**${cargo.nome}** voltou à cor padrão.`, colour: COR.sucesso });
  }

  // ── preset ──
  if (["preset", "pronto"].includes(acao)) {
    const nome = resto[1]?.toLowerCase();
    if (!nome || !PRESETS[nome]) {
      return sendEmbed(message.channel, { title: "❌ Preset desconhecido",
        description: `Escolha um: ${Object.keys(PRESETS).map((k) => `\`${k}\``).join(", ")}`, colour: COR.erro });
    }
    colour = PRESETS[nome];
    descricao = `preset **${nome}**`;
  }

  // ── gradiente montado ──
  else if (["gradiente", "gradient", "grad"].includes(acao)) {
    let idx = 1, angulo = 90;
    if (/^\d{1,3}$/.test(resto[1] ?? "")) { angulo = Number(resto[1]); idx = 2; }
    const cores = [];
    for (const bruto of resto.slice(idx)) {
      const c = corSolida(bruto);
      if (!c) {
        return sendEmbed(message.channel, { title: "❌ Cor inválida no gradiente",
          description: `Não entendi **${bruto}**. Use hex (\`#FF0000\`) ou nome: ${Object.keys(NOMES).slice(0, 8).map((n) => `\`${n}\``).join(", ")}…`,
          colour: COR.erro });
      }
      cores.push(c);
    }
    if (cores.length < 2) {
      return sendEmbed(message.channel, { title: "❌ Gradiente precisa de 2+ cores",
        description: `\`${P}cor ${args[0]} gradiente #FF0000 #0000FF\``, colour: COR.erro });
    }
    colour = montarGradiente(cores, angulo);
    descricao = `gradiente de ${cores.length} cores (${angulo}°)`;
  }

  // ── CSS/cor colada direto ──
  else {
    const bruto = resto.join(" ");
    const v = validarCss(bruto);
    if (!v) {
      return sendEmbed(message.channel, { title: "❌ Não entendi a cor",
        description: `\`${bruto.slice(0, 100)}\` não é uma cor que eu reconheça.\n\nUse hex (\`#FF00AA\`), um nome (\`roxo\`), \`gradiente <cores>\`, \`preset <nome>\` ou um \`linear-gradient(...)\` completo.`,
        colour: COR.erro });
    }
    if (v.erro) {
      return sendEmbed(message.channel, { title: "❌ Gradiente malformado", description: v.erro, colour: COR.erro });
    }
    colour = v.valor;
    descricao = /gradient/i.test(colour) ? "gradiente personalizado" : `cor \`${colour}\``;
  }

  const r = await aplicarCor(serverId, cargo.id, colour);
  if (!r.ok) {
    return sendEmbed(message.channel, { title: "❌ Não consegui aplicar", description: r.erro, colour: COR.erro });
  }
  return sendEmbed(message.channel, {
    title: "🎨 Cor aplicada",
    description: [
      `**${cargo.nome}** agora usa ${descricao}.`,
      "",
      `\`\`\`\n${colour.slice(0, 400)}\n\`\`\``,
      /gradient/i.test(colour) ? "_O gradiente aparece no nome do cargo em clientes que suportam CSS._" : "",
    ].filter(Boolean).join("\n"),
    colour: /gradient/i.test(colour) ? COR.sucesso : colour,
  });
}
