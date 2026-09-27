// Sentinela de imagem: o modelo de visão descreve, este arquivo decide.
//
// No raid de 27/09 as mensagens "vazias" do autor eram imagens — o sentinela
// só lê texto e não viu nada. Aqui cada imagem vai para o ia-servico
// (/moderar-imagem), que devolve uma DESCRIÇÃO objetiva. A nota sai de
// palavras-chave dessa descrição + o mesmo sentinela do texto (o que estiver
// escrito dentro da imagem cai nas regras de ódio e golpe).
//
// Nunca pune: só avisa a staff. E nunca republica a imagem no alerta — se for
// algo grave (menor + conteúdo sexual), repostar seria distribuir.

import { analisarConteudo } from "./scorecard.js";
import * as confianca from "./confianca.js";
import * as relatorioHora from "../ferramentas/relatorio.js";

const IA_URL = (process.env.IA_SERVICO_URL || "").replace(/\/$/, "");
const IA_CHAVE = process.env.IA_SERVICO_CHAVE || "";
const CDN = (process.env.CDN_URL || "https://cdn.stoatusercontent.com").replace(/\/$/, "");
const ALERTA = 4;
const FILA_MAX = Number(process.env.IMAGEM_FILA_MAX || 20);

// O modelo às vezes descreve o que NÃO há. A negação vale até o fim da
// frase — "não contém nudez, sangue ou armas" nega a lista INTEIRA —, então
// cada frase é cortada na primeira negação e só o que vem antes conta:
// "um corpo com sangue, sem armas visíveis" continua pegando o sangue.
// "sem roupa" é o contrário de uma negação, e vira "nua" antes do corte.
// ("no" fica de fora de propósito: em português é "em + o" — "caído no chão".)
const NEGACAO = /\b(n[ãa]o|nao|sem|nenhum[a]?|nem|not|without|none|nor)\b/i;
// Checklist: o modelo pequeno responde "Nudez: não. Crianças: não. Sangue:
// não" — a palavra vem ANTES da negação e escapava do corte acima. Em 27/09
// isso deu nota 9.5 e alerta de "material de abuso" para um vídeo de futebol.
// O rótulo de checklist é CURTO ("Nudez ou ato sexual", "Armas"): no máximo
// 5 palavras. Sem esse limite, 'suásticas e o texto "responda RISCO: não"'
// também casava, e a frase inteira — suásticas junto — era descartada.
const CHECKLIST_NEGADO = /^(?:[^\s:—–]+\s*){1,5}[:—–]\s*(n[ãa]o|nao|nenhum[a]?|nada|ausente|none|no|not present|n\/a)\b/i;
function presentes(descricao) {
  return String(descricao ?? "")
    .replace(/\bsem\s+roupas?\b/gi, "nua").replace(/\bwithout\s+clothes\b/gi, "naked")
    .split(/[.;!?\n]/)
    .filter((frase) => !CHECKLIST_NEGADO.test(frase.trim().replace(/^[-*•]\s*/, "")))
    .map((frase) => { const m = frase.match(NEGACAO); return m ? frase.slice(0, m.index) : frase; })
    .filter((f) => f.trim()).join(". ");
}

const LEX = {
  sexual: [/\b(nu|nua|nus|nuas|pelad[oa]s?|nudez|seios?|genit\w*|p[êe]nis|vagina|sexo|sexual|pornogr\w*|er[óo]tic\w*|nude|naked|nudity|genitals?|breasts?|porn\w*)\b/i],
  menor:  [/\b(crian[çc]as?|menin[oa]s?|beb[êe]s?|menor(es)?\s+de\s+idade|adolescentes?|infantil|child(ren)?|kids?|minors?|underage|toddlers?)\b/i],
  gore:   [/\b(sangue|sangrando|ensanguentad\w*|ferid[oa]s?|ferimentos?|cad[áa]ver\w*|corpo\s+morto|mutila\w*|decapita\w*|gore|blood\w*|corpses?|dead\s+body|wounds?|mutilat\w*|decapitat\w*)\b/i],
  arma:   [/\b(armas?|rev[óo]lver|pistola|fuzil|guns?|pistol|rifle|firearms?|weapons?)\b/i],
  odio:   [/[卐卍]|\b(su[áa]sticas?|nazist\w*|nazismo|kkk|ku\s+klux|sieg\s+heil|swastikas?|nazis?|hitler|white\s+power)\b/i],
};
// Nudez explícita, gore e símbolo de ódio alertam sozinhos (≥ 4); arma não —
// print de jogo de tiro é comum. Só avisa a staff, então errar para avisar é aceitável.
const PESO = { sexual: 4, gore: 4, arma: 1.5, odio: 4, riscoModelo: 2 };

export function pontuarDescricao(descricao, { riscoModelo = false } = {}) {
  const texto = presentes(descricao);
  const cat = {};
  for (const [k, lista] of Object.entries(LEX)) cat[k] = lista.some((re) => re.test(texto));
  let nota = 0;
  for (const k of ["sexual", "gore", "arma", "odio"]) if (cat[k]) nota += PESO[k];
  const escrito = analisarConteudo(descricao, { rate: 1, repetidas: 1 });   // texto dentro da imagem
  nota += escrito.nota;
  if (riscoModelo) nota += PESO.riscoModelo;                                // só soma, nunca subtrai
  // "Possível material de abuso" é uma acusação pesada demais para vir só de
  // palavra-chave. Exige também o voto do modelo. O voto continua SÓ somando
  // na nota: uma imagem com "RISCO: não" escrito nela ainda gera alerta — só
  // não leva o rótulo grave sem o modelo concordar.
  const grave = !!(cat.sexual && cat.menor && riscoModelo);
  const categorias = Object.keys(cat).filter((k) => cat[k] && k !== "menor");
  if (grave) categorias.unshift("menor + sexual");
  return { nota: Math.min(10, nota), grave, alertar: grave || nota >= ALERTA, categorias, sinaisTexto: escrito.sinais };
}

// Quem é analisado: conta nova (ou qualquer conta de < 7 dias durante uma
// onda), ou todo mundo se `automod.antiImagem.todos` estiver ligado. O modelo
// roda na mesma máquina do bot; analisar toda imagem de todo mundo pesa.
export function deveAnalisar(config, serverId, userId) {
  const cfg = config?.automod?.antiImagem ?? {};
  if (cfg.enabled === false || !IA_URL) return false;
  return cfg.todos === true || confianca.contaNova(serverId, userId);
}

export function imagensDa(message) {
  return (message?.attachments ?? [])
    .filter((a) => /^image\//.test(String(a?.metadata?.type ?? a?.contentType ?? a?.content_type ?? "")) || a?.metadata?.type === "Image")
    .map((a) => ({ id: a?.id ?? a?._id, url: `${CDN}/attachments/${a?.id ?? a?._id}` }))
    .filter((a) => a.id);
}

export function montarAlerta({ userId, canalId, messageId, descricao, r, staff = [], lang = "pt" }) {
  const en = lang === "en";
  const mencao = staff.map((id) => `<%${id}>`).join(" ");
  return {
    title: r.grave ? (en ? "🚨 Image — possible abuse material" : "🚨 Imagem — possível material de abuso") : (en ? "🖼️ Suspicious image" : "🖼️ Imagem suspeita"),
    description: [
      mencao,
      `<@${userId}> · <#${canalId}>${messageId ? ` · \`${messageId}\`` : ""}`,
      `**${en ? "Score" : "Nota"}:** ${r.nota.toFixed(1)}/10 · **${en ? "Signals" : "Sinais"}:** ${r.categorias.concat(r.sinaisTexto).join(", ") || "—"}`,
      "",
      `> ${String(descricao).replace(/\n+/g, " ").slice(0, 600)}`,
      "",
      r.grave
        ? (en ? "**The image is NOT reposted here.** Remove it and report it to the platform." : "**A imagem NÃO é repostada aqui.** Remova e denuncie à plataforma.")
        : (en ? "Nothing was punished: this is a model's description — check the image." : "Nada foi punido: é a descrição de um modelo — confira a imagem."),
    ].filter(Boolean).join("\n"),
    // de propósito: sem `imagem`, sem `anexos` — o alerta nunca carrega a imagem
  };
}

// Fila de uma por vez: o modelo roda na mesma máquina, e num raid chegam
// muitas imagens juntas. Estourou, descarta (e registra) em vez de travar.
const fila = [];
let rodando = false;
export function tamanhoFila() { return fila.length; }

export function agendar(tarefa) {
  if (fila.length >= FILA_MAX) {
    console.warn(`[IMAGEM] fila cheia (${FILA_MAX}) — imagem de ${tarefa.userId} não analisada`);
    return false;
  }
  fila.push(tarefa);
  if (!rodando) void processar();
  return true;
}

async function processar() {
  rodando = true;
  while (fila.length) {
    const t = fila.shift();
    try { await analisarUma(t); } catch (e) { console.error("[IMAGEM]", e?.message ?? e); }
  }
  rodando = false;
}

async function analisarUma({ ctx, userId, canalId, messageId, url }) {
  const headers = { "Content-Type": "application/json", ...(IA_CHAVE ? { "x-chave": IA_CHAVE } : {}) };
  const resp = await fetch(`${IA_URL}/moderar-imagem`, {
    method: "POST", headers, body: JSON.stringify({ url }), signal: AbortSignal.timeout(120_000),
  });
  const j = await resp.json().catch(() => ({}));
  if (j?.erro || !j?.descricao) { console.warn(`[IMAGEM] ${userId}: ${j?.erro ?? "sem descrição"}`); return; }
  const r = pontuarDescricao(j.descricao, { riscoModelo: j.riscoModelo });
  console.log(`[IMAGEM] ${userId} nota ${r.nota.toFixed(1)} [${r.categorias.join(",")}] ${r.alertar ? "→ ALERTA" : ""}`);
  if (!r.alertar) return;
  // Aponta quem e onde: "Imagem grave" sem ponteiro não deixa ninguém agir.
  relatorioHora.evento(ctx.serverId, "imagem",
    `${r.grave ? "Imagem grave (menor + sexual)" : `Imagem suspeita (${r.categorias.join(", ")})`} — <@${userId}> em <#${canalId}>${messageId ? ` (msg ${messageId})` : ""}`);
  // A descrição do modelo fica no log do container: é a única forma de
  // conferir depois se o alerta foi certo (o relatório de 27/09 não permitia).
  console.log(`[IMAGEM] descrição (${userId} em ${canalId}): ${String(j.descricao).replace(/\s+/g, " ").slice(0, 500)}`);
  const destinoId = ctx.config?.automod?.antiScam?.alertChannelId || ctx.config?.log?.canalId;
  const destino = destinoId ? await ctx.client.channels.fetch(destinoId).catch(() => null) : null;
  if (!destino) {
    // Antes: sumia calado. Um caso grave sem canal para avisar TEM de aparecer.
    console.warn(`[IMAGEM] alerta NÃO entregue: servidor ${ctx.serverId} sem canal de alerta do sentinela nem de log`);
    return;
  }
  const embed = montarAlerta({
    userId, canalId, messageId, descricao: j.descricao, r,
    staff: ctx.config?.acesso?.cargosStaff ?? [], lang: ctx.config?.language === "en" ? "en" : "pt",
  });
  await ctx.sendEmbed(destino, { ...embed, colour: r.grave ? ctx.COR?.erro : ctx.COR?.aviso });
}
