// Quem está vendo a ajuda, e o que este servidor tem (1 out 2026).
//
// O &help e o &tutorial mostravam tudo para todo mundo: o membro comum via
// `&ban`, `&automod punicao`, `&game admin`… e, num servidor sem IA ou sem
// voz, a ajuda ensinava `&chat` e `&entrar`. Agora são três versões —
// MEMBRO, STAFF e DONO (do bot) — e cada uma só vê os recursos que o servidor
// tem liberados (IA, voz e música).

import { servidorPermitido as temIA } from "../ai/chat.js";
import { servidorPermitido as temVoz } from "../ferramentas/tts.js";

export const NIVEIS = { membro: 0, staff: 1, dono: 2 };

export async function quemVe(message, ctx) {
  let dono = false, staff = false;
  try { dono = !!ctx.ehSuperAdmin?.(message?.authorId); } catch {}
  if (!dono) {
    const server = await ctx.getServer?.(message).catch(() => null);
    try {
      staff = !!(ctx.membroTemPermissao?.(message, server, "ManageMessages") || ctx.membroTemPermissao?.(message, server, "ManageServer"));
    } catch {}
  }
  const ia = (() => { try { return temIA(ctx.serverId); } catch { return false; } })();
  const voz = (() => { try { return temVoz(ctx.serverId); } catch { return false; } })();
  return { nivel: dono ? "dono" : staff ? "staff" : "membro", ia, voz };
}

// Nível de cada comando (e das partes que fogem do padrão do comando).
// O que não está aqui é "staff".
const MAPA = {
  help: { padrao: "membro" }, tutorial: { padrao: "membro" }, ping: { padrao: "membro" }, sobre: { padrao: "membro" },
  info: { padrao: "membro" }, userinfo: { padrao: "membro" }, rolar: { padrao: "membro" }, iniciativa: { padrao: "membro" },
  nivel: { padrao: "membro" },
  xp: { padrao: "membro", subs: { on: "staff", off: "staff", setup: "staff", criarcargos: "staff", cargo: "staff", cargos: "staff", sincronizar: "staff", canal: "staff", dar: "staff", tirar: "staff", reset: "staff", zerar: "staff", anunciar: "staff" } },
  economia: { padrao: "membro", subs: { config: "staff", dar: "staff", tirar: "staff", zerar: "staff", "loja add": "staff", "loja remover": "staff" } },
  game: { padrao: "membro", subs: { admin: "dono" } },
  ticket: { padrao: "membro", subs: { painel: "staff", log: "staff", lista: "staff", categorias: "staff", fechar: "staff", apagar: "staff" } },
  staff: { padrao: "membro", subs: { add: "staff", remove: "staff", remover: "staff", titulo: "staff", limpar: "staff" } },
  fuso: { padrao: "membro", subs: { add: "staff", remover: "staff", remove: "staff", principal: "staff", limpar: "staff" } },
  tts: { padrao: "membro", subs: { filtro: "staff", cooldown: "staff", nomes: "staff", dicionario: "staff", "dicionário": "staff", reiniciar: "staff", destravar: "staff", resgatar: "staff", diagnostico: "staff", "diagnóstico": "staff" } },
  entrar: { padrao: "membro" }, sair: { padrao: "membro" }, musica: { padrao: "membro" },
  chat: { padrao: "membro", subs: { livre: "staff", esquecer: "staff", projeto: "staff", espontaneo: "staff", "espontâneo": "staff" } },
  servidores: { padrao: "dono" },
  banglobal: { padrao: "staff", subs: { esquecer: "dono" } },
};
export const SO_IA = new Set(["chat", "modia", "personalidade"]);
export const SO_VOZ = new Set(["tts", "entrar", "sair", "musica"]);

export function nivelDoComando(cmd, sub = "", sub2 = "") {
  const m = MAPA[cmd];
  if (!m) return "staff";
  return m.subs?.[`${sub} ${sub2}`.trim()] ?? m.subs?.[sub] ?? m.padrao;
}
export function recursoDoComando(cmd) {
  return SO_IA.has(cmd) ? "ia" : SO_VOZ.has(cmd) ? "voz" : null;
}
export function podeVer(visao, cmd, sub = "", sub2 = "") {
  const r = recursoDoComando(cmd);
  if (r === "ia" && !visao.ia) return false;
  if (r === "voz" && !visao.voz) return false;
  return NIVEIS[visao.nivel] >= NIVEIS[nivelDoComando(cmd, sub, sub2)];
}

// As linhas de uma página de ajuda: fica o que quem vê pode usar. Cabeçalho
// (**...**) sem nada embaixo também sai; linha sem comando fica como está.
const RE_CMD = /`&([a-zçãéí]+)(?:\s+([a-zçãéí]+))?(?:\s+([a-zçãéí]+))?[^`]*`/i;
export function filtrarLinhas(linhas, visao) {
  const marcadas = linhas.map((l) => {
    const m = String(l).match(RE_CMD);
    if (!m) return { l, tipo: /^\*\*[^*]+\*\*\s*$/.test(String(l).trim()) ? "cabecalho" : "texto" };
    return { l, tipo: "comando", ok: podeVer(visao, m[1].toLowerCase(), (m[2] ?? "").toLowerCase(), (m[3] ?? "").toLowerCase()) };
  });
  const saida = [];
  for (let i = 0; i < marcadas.length; i++) {
    const x = marcadas[i];
    if (x.tipo === "comando" && !x.ok) continue;
    if (x.tipo === "cabecalho") {
      // some só se a seção era de comandos e TODOS saíram (seção de texto fica)
      let comandos = 0, visiveis = 0;
      for (let j = i + 1; j < marcadas.length && marcadas[j].tipo !== "cabecalho"; j++) {
        if (marcadas[j].tipo === "comando") { comandos++; if (marcadas[j].ok) visiveis++; }
      }
      if (comandos > 0 && visiveis === 0) continue;
    }
    saida.push(x.l);
  }
  return saida.filter((l, i, a) => !(String(l).trim() === "" && String(a[i - 1] ?? "").trim() === ""));
}

export function temComandoVisivel(linhas, visao) {
  return linhas.some((l) => { const m = String(l).match(RE_CMD); return m && podeVer(visao, m[1].toLowerCase(), (m[2] ?? "").toLowerCase(), (m[3] ?? "").toLowerCase()); });
}

// Tutorial: para quem é cada área
export const AREAS_DO_MEMBRO = new Set(["rpg", "aventura", "economia"]);
