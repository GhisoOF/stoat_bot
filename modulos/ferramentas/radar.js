// ══════════════════════════════════════════════════════════
//  radar.js — vigia PRIVADO de termos (não aparece em lugar nenhum)
//
//  Encaminha para um canal escolhido toda mensagem, de qualquer servidor
//  onde o bot esteja, que cite um dos termos vigiados.
//
//  DE PROPÓSITO FORA DE TUDO: não há entrada em `rotas`, então não aparece
//  no `&help`, no `&config`, no `&debug` (que enumera `Object.keys(rotas)`)
//  nem no `&tutorial`. O comando `&radar` existe, mas é despachado por este
//  módulo, antes do roteador, e só responde a quem está em SUPER_ADMINS —
//  para qualquer outra pessoa ele é uma mensagem comum que não aconteceu.
//
//  ── Sobre o que isto encaminha ────────────────────────────
//
//  Três dos termos são palavras comuns fora deste contexto: "Vapor" (vapor
//  d'água, vaporizador, a loja de jogos), "Nexus" (Nexus Mods, o celular) e
//  "Judy" (nome de gente). Num servidor grande e alheio, cada acerto falso
//  encaminha a conversa de alguém para um canal privado — por isso:
//
//   • `RADAR_PARES` exige que certos termos venham acompanhados. Por padrão
//     "vapor" e "nexus" só valem se aparecerem junto do outro (ou seja,
//     "Vapor Nexus"), o que elimina quase todo o ruído.
//   • DM não entra (`RADAR_DM=1` liga, se quiser).
//   • O que sai é um recorte da mensagem, não o histórico do canal.
//
//  Ajuste os termos depois de ver o volume real: `&radar termos` mostra o
//  que está valendo, e as variáveis abaixo mudam sem redeploy do código.
//
//  Variáveis (todas opcionais; os padrões são os desta instalação):
//    RADAR_CANAL      canal de destino
//    RADAR_TERMOS     termos separados por vírgula
//    RADAR_PARES      termos que exigem companhia: "vapor:nexus,nexus:vapor"
//    RADAR_DM         "1" para incluir mensagens diretas
//    RADAR_DONO       "1" para incluir as suas próprias mensagens
//    RADAR_BOTS       "1" para incluir mensagens de outros bots
//    RADAR_OFF        "1" desliga tudo
// ══════════════════════════════════════════════════════════

const CANAL_DESTINO = process.env.RADAR_CANAL || "01M116CQSERP1RDX86Q0X33D9A";

const TERMOS_PADRAO = ["Ghiso", "Ghiso#4419", "Judy", "Cobaia#7705", "Vapor", "Nexus", "Vapor Nexus"];

const LIGADO = process.env.RADAR_OFF !== "1" && !!CANAL_DESTINO;
const INCLUIR_DM   = process.env.RADAR_DM   === "1";
const INCLUIR_DONO = process.env.RADAR_DONO === "1";
const INCLUIR_BOTS = process.env.RADAR_BOTS === "1";

// ── Termos ────────────────────────────────────────────────
const termos = (process.env.RADAR_TERMOS
  ? process.env.RADAR_TERMOS.split(",")
  : TERMOS_PADRAO
).map((t) => t.trim()).filter(Boolean);

// "vapor:nexus" = a palavra `vapor` só conta se `nexus` estiver na mensagem.
// Sem isso, um servidor de vaping ou de Nexus Mods entope o canal sozinho.
const PARES_PADRAO = "vapor:nexus,nexus:vapor";
const pares = new Map(
  (process.env.RADAR_PARES ?? PARES_PADRAO).split(",")
    .map((p) => p.split(":").map((x) => x.trim().toLowerCase()))
    .filter(([a, b]) => a && b),
);

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Um termo casa como PALAVRA, não como pedaço: "vaporizador" não é "vapor",
// "Judymar" não é "Judy". A tag (`Ghiso#4419`) usa a mesma regra, mas o `#`
// e os dígitos entram no corpo do padrão.
function padraoDe(termo) {
  const t = escapar(semAcento(termo));
  return new RegExp(`(?<![\\p{L}\\p{N}_])${t}(?![\\p{L}\\p{N}_])`, "u");
}
const padroes = termos.map((t) => ({ termo: t, re: padraoDe(t) }));

// URL fora: o próprio link do canal de destino contém "stoat.chat", e um link
// qualquer com "nexus" no caminho não é alguém falando de você.
const semLinks = (texto) => String(texto ?? "").replace(/https?:\/\/\S+/gi, " ");

/**
 * Quais termos vigiados aparecem no texto (já aplicadas as regras de par).
 * Exportada para teste — é o coração da coisa e merece ser verificável.
 */
export function termosNoTexto(texto) {
  const limpo = semAcento(semLinks(texto));
  if (!limpo.trim()) return [];
  const presentes = padroes.filter(({ re }) => re.test(limpo));
  const achados = presentes
    .filter(({ termo }) => {
      const exige = pares.get(semAcento(termo));
      if (!exige) return true;
      // O companheiro pode estar sozinho OU dentro de um termo composto.
      return padraoDe(exige).test(limpo);
    })
    .map(({ termo }) => termo);

  // "Ghiso#4419" já contém "Ghiso", e "Vapor Nexus" já contém os dois: mostrar
  // os três no título do alerta é ruído. Fica o mais específico.
  return achados.filter((t) => !achados.some((outro) =>
    outro !== t && semAcento(outro).includes(semAcento(t))));
}

// ── Freios ────────────────────────────────────────────────
//
//  Uma mensagem só é encaminhada uma vez (ela pode casar com vários termos, e
//  o evento pode repetir). E o envio é espaçado: o Stoat derruba rajada, e um
//  canal movimentado citando "Vapor Nexus" viraria uma enxurrada.
const jaEnviadas = new Set();
const TETO_MEMORIA = 2000;
const ESPACO_MS = Number(process.env.RADAR_ESPACO_MS || 1200);
const TETO_POR_MINUTO = Number(process.env.RADAR_TETO_MIN || 20);

const fila = [];
let enviando = false;
let janela = { inicio: Date.now(), enviadas: 0 };

function podeEnviarAgora() {
  const agora = Date.now();
  if (agora - janela.inicio > 60_000) janela = { inicio: agora, enviadas: 0 };
  return janela.enviadas < TETO_POR_MINUTO;
}

async function drenarFila(client) {
  if (enviando) return;
  enviando = true;
  try {
    while (fila.length) {
      if (!podeEnviarAgora()) {
        // Estourou o teto do minuto: descarta o excedente com um aviso único,
        // em vez de acumular uma fila que chegaria dez minutos atrasada.
        const perdidas = fila.length;
        fila.length = 0;
        console.warn(`[RADAR] teto de ${TETO_POR_MINUTO}/min atingido — ${perdidas} alerta(s) descartado(s)`);
        break;
      }
      const item = fila.shift();
      try {
        const canal = client.channels?.get?.(CANAL_DESTINO)
          ?? await client.channels?.fetch?.(CANAL_DESTINO).catch(() => null);
        if (!canal?.sendMessage) {
          console.error(`[RADAR] canal de destino ${CANAL_DESTINO} indisponível — alerta perdido`);
          continue;
        }
        await canal.sendMessage({ embeds: [item.embed] });
        janela.enviadas++;
      } catch (e) {
        console.error("[RADAR] falha ao enviar alerta:", e?.message ?? JSON.stringify(e));
      }
      await new Promise((r) => setTimeout(r, ESPACO_MS));
    }
  } finally { enviando = false; }
}

function recortar(texto, max = 900) {
  const t = String(texto ?? "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// ── O gancho, chamado a cada mensagem ─────────────────────
export async function aoMensagem(message, ctx = {}) {
  if (!LIGADO) return false;
  try {
    const client = ctx.client;
    if (!client) return false;

    // Nunca a si mesmo, nunca o próprio canal de destino (laço infinito).
    if (message.authorId === client.user?.id) return false;
    if (message.channelId === CANAL_DESTINO) return false;

    const serverId = message.serverId ?? message.server?.id ?? message.server?._id ?? null;
    if (!serverId && !INCLUIR_DM) return false;
    if (!INCLUIR_BOTS && message.author?.bot) return false;
    if (!INCLUIR_DONO && ctx.ehSuperAdmin?.(message.authorId)) return false;

    const achados = termosNoTexto(message.content);
    if (!achados.length) return false;

    if (jaEnviadas.has(message._id ?? message.id)) return false;
    jaEnviadas.add(message._id ?? message.id);
    if (jaEnviadas.size > TETO_MEMORIA) {
      // Set mantém ordem de inserção: descarta os mais antigos.
      for (const k of [...jaEnviadas].slice(0, TETO_MEMORIA / 2)) jaEnviadas.delete(k);
    }

    const autor = message.author?.username ?? message.member?.nickname ?? message.authorId ?? "?";
    const servidor = message.server?.name ?? (serverId ? `servidor ${serverId}` : "mensagem direta");
    const canalNome = message.channel?.name ? `#${message.channel.name}` : message.channelId;
    const msgId = message._id ?? message.id;
    const link = serverId
      ? `https://stoat.chat/server/${serverId}/channel/${message.channelId}${msgId ? `/${msgId}` : ""}`
      : null;

    fila.push({
      embed: {
        title: `📡 ${achados.join(" · ")}`,
        description: [
          `**${autor}** em ${servidor} · ${canalNome}`,
          "",
          recortar(message.content),
          link ? `\n[abrir a mensagem](${link})` : "",
        ].filter(Boolean).join("\n"),
        colour: "#5a8dee",
      },
    });
    drenarFila(client).catch((e) => console.error("[RADAR]", e?.message ?? e));
    return true;
  } catch (e) {
    // O radar nunca pode derrubar o processamento normal da mensagem.
    console.error("[RADAR] erro:", e?.message ?? e);
    return false;
  }
}

// ── `&radar`: comando invisível, só para quem é super admin ──
//
//  Fica fora de `rotas` de propósito. O `main.js` chama isto ANTES de
//  resolver o comando; se não for você, devolve false e a mensagem segue o
//  caminho normal — quem digitar `&radar` sem ser você recebe o "comando
//  desconhecido" de sempre, e nada revela que o comando existe.
export async function talvezComando(message, ctx = {}) {
  const conteudo = (message.content ?? "").trim();
  const prefixo = ctx.PREFIXO ?? "&";
  if (!conteudo.toLowerCase().startsWith(`${prefixo}radar`)) return false;
  if (!ctx.ehSuperAdmin?.(message.authorId)) return false;

  const args = conteudo.slice(prefixo.length + "radar".length).trim().split(/\s+/).filter(Boolean);
  const sub = (args[0] ?? "estado").toLowerCase();
  const responder = (texto) => message.channel?.sendMessage?.(texto).catch(() => {});

  if (sub === "termos") {
    const linhas = termos.map((t) => {
      const exige = pares.get(semAcento(t));
      return `• \`${t}\`${exige ? ` — só conta junto de \`${exige}\`` : ""}`;
    });
    return responder([
      "**📡 Termos vigiados**", ...linhas, "",
      `Destino: \`${CANAL_DESTINO}\``,
      `DM: ${INCLUIR_DM ? "sim" : "não"} · suas mensagens: ${INCLUIR_DONO ? "sim" : "não"} · bots: ${INCLUIR_BOTS ? "sim" : "não"}`,
    ].join("\n")), true;
  }

  if (sub === "teste") {
    const texto = args.slice(1).join(" ");
    if (!texto) return responder(`Uso: \`${prefixo}radar teste <frase>\``), true;
    const achados = termosNoTexto(texto);
    return responder(achados.length
      ? `📡 Casaria: ${achados.map((t) => `\`${t}\``).join(", ")}`
      : "🔇 Não casaria com nada."), true;
  }

  // estado
  return responder([
    `**📡 Radar** — ${LIGADO ? "ligado" : "desligado (RADAR_OFF)"}`,
    `Termos: ${termos.length} · destino \`${CANAL_DESTINO}\``,
    `Na fila: ${fila.length} · enviados neste minuto: ${janela.enviadas}/${TETO_POR_MINUTO}`,
    `Vistas e ignoradas por repetição: ${jaEnviadas.size}`,
    "",
    `\`${prefixo}radar termos\` · \`${prefixo}radar teste <frase>\``,
  ].join("\n")), true;
}

export function estaLigado() { return LIGADO; }
export function canalDestino() { return CANAL_DESTINO; }
