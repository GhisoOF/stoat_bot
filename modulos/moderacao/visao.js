// Quem está vendo a ajuda, e o que este servidor tem (1 out 2026).
//
// O &help e o &tutorial mostravam tudo para todo mundo: o membro comum via
// `&ban`, `&automod punicao`, `&servidores`… e, num servidor sem voz, a ajuda
// ensinava `&entrar`. Agora são três versões —
// MEMBRO, STAFF e DONO (do bot) — e cada uma só vê os recursos que o servidor
// tem liberados (voz e música). (P4, 2 nov 2026: o chat IA saiu — a IA ficou só na
// moderação, que não tem comando próprio; não há mais recurso "IA" na ajuda.)

import { servidorPermitido as temVoz } from "../ferramentas/tts.js";
import { idDoNome, normalizarArgs } from "../core/aliases.js";

export const NIVEIS = { membro: 0, staff: 1, dono: 2 };

// (P4, 2 nov 2026) o nível "dono" só na DM com a Judy: os comandos dele só rodam lá (main.js),
// e num servidor ele vê a ajuda da staff (é o "controle total" da R9: os comandos de sempre).
export async function quemVe(message, ctx) {
  let dono = false, staff = false;
  const naDM = !(ctx?.serverId ?? message?.serverId ?? message?.server?.id);
  try { dono = naDM && !!ctx.ehSuperAdmin?.(message?.authorId); } catch {}
  if (!dono) {
    const server = await ctx.getServer?.(message).catch(() => null);
    try {
      staff = !!(ctx.membroTemPermissao?.(message, server, "ManageMessages") || ctx.membroTemPermissao?.(message, server, "ManageServer"));
    } catch {}
  }
  const voz = (() => { try { return temVoz(ctx.serverId); } catch { return false; } })();
  return { nivel: dono ? "dono" : staff ? "staff" : "membro", voz };
}

// Nível de cada comando (e das partes que fogem do padrão do comando).
// O que não está aqui é "staff".
const MAPA = {
  help: { padrao: "membro" }, tutorial: { padrao: "membro" }, ping: { padrao: "membro" }, sobre: { padrao: "membro" },
  info: { padrao: "membro" }, userinfo: { padrao: "membro" }, rolar: { padrao: "membro" }, iniciativa: { padrao: "membro" },
  nivel: { padrao: "membro" }, privacidade: { padrao: "membro" },
  xp: { padrao: "membro", subs: { on: "staff", off: "staff", setup: "staff", criarcargos: "staff", cargo: "staff", cargos: "staff", sincronizar: "staff", canal: "staff", dar: "staff", tirar: "staff", reset: "staff", zerar: "staff", anunciar: "staff" } },
  economia: { padrao: "membro", subs: { config: "staff", dar: "staff", tirar: "staff", zerar: "staff", "loja add": "staff", "loja remover": "staff" } },
  ticket: { padrao: "membro", subs: { painel: "staff", log: "staff", lista: "staff", categorias: "staff", fechar: "staff", apagar: "staff" } },
  staff: { padrao: "membro", subs: { add: "staff", remove: "staff", remover: "staff", titulo: "staff", limpar: "staff" } },
  fuso: { padrao: "membro", subs: { add: "staff", remover: "staff", remove: "staff", principal: "staff", limpar: "staff" } },
  tts: { padrao: "membro", subs: { filtro: "staff", cooldown: "staff", nomes: "staff", dicionario: "staff", "dicionário": "staff", reiniciar: "staff", destravar: "staff", resgatar: "staff", diagnostico: "staff", "diagnóstico": "staff" } },
  entrar: { padrao: "membro" }, sair: { padrao: "membro" }, musica: { padrao: "membro" },
  servidores: { padrao: "dono" }, caso: { padrao: "dono" },   // (31 out 2026, P3a) a fila de revisão é só do dono do bot
  bateria: { padrao: "dono" },   // (2 nov 2026, P4.3) as imagens da bateria de teste da visão: só o dono, só na DM
  // (P2) a staff vê o modo, isenta e consulta o histórico; o resto é do dono do bot
  // (P4) `desfazer <pessoa>` é o `isentar` da staff; `desfazer [confirmar]` sozinho, do dono
  banglobal: { padrao: "staff", subs: { ...Object.fromEntries(["off", "avisar", "imediato", "consenso", "lista", "varrer", "revisar", "add", "esquecer", "lembrar", "ignorados", "bots"].map((s) => [s, "dono"])),
    desfazer: (resto) => (resto && resto !== "confirmar" ? "staff" : "dono") } },
  // (P4) a lista de bloqueio é global ao bot: mudar nela é do dono (ver, da staff); o debug é global
  automod: { padrao: "staff", subs: { debug: "dono", ...Object.fromEntries(["blocklist", "bloqueio"].flatMap((p) => ["add", "remove", "adddomain", "removedomain", "clear", "reload"].map((a) => [`${p} ${a}`, "dono"]))) } },
  entretenimento: { padrao: "membro" },
  servidor: { padrao: "membro", subs: { "regras definir": "staff", "regras canal": "staff", "regras limpar": "staff", "faq add": "staff", "faq remover": "staff", "faq limpar": "staff" } },
};
export const SO_VOZ = new Set(["tts", "entrar", "sair", "musica"]);

export function nivelDoComando(cmd, sub = "", sub2 = "") {
  const m = MAPA[cmd];
  if (!m) return "staff";
  const n = m.subs?.[`${sub} ${sub2}`.trim()] ?? m.subs?.[sub] ?? m.padrao;
  return typeof n === "function" ? n(sub2) : n;
}
// (P4, 2 nov 2026) o comando (ou subcomando) é só do dono do bot? Então só roda na DM com a
// Judy: num servidor o main.js responde só a linha da DM (core/dono.js → pedirDM).
export function soDoDono(cmd, args = []) {
  cmd = idDoNome(cmd);
  const [sub = "", sub2 = ""] = MAPA[cmd]?.subs ? normalizarArgs(cmd, (args ?? []).slice(0, 2)).map((s) => String(s ?? "").toLowerCase()) : [];
  return nivelDoComando(cmd, sub, sub2) === "dono";
}
// (P4, 2 nov 2026, revisão) Na DM com a Judy não há servidor: o comando que mexe na config, nos
// cargos ou nos dados de um servidor respondia sucesso falso ali (gravava na config "sem
// servidor"). Na DM roda só: o que é só do dono (recebe o ID do servidor quando age num), e as
// partes de MEMBRO destes comandos, que não dependem de servidor. O resto: a linha "Use num
// servidor." (main.js). A ajuda, o tutorial e o &privacidade (status e apagar) são da pessoa.
export const NA_DM = new Set(["help", "ping", "sobre", "userinfo", "tutorial", "privacidade", "rolar", "entretenimento"]);
export function funcionaNaDM(cmd, args = []) {
  const id = idDoNome(cmd);
  // o subcomando de dono, com ou sem o resto (`desfazer ‹servidor›`: o resto é o ID, não uma pessoa)
  if (soDoDono(id, args) || soDoDono(id, (args ?? []).slice(0, 1))) return true;
  if (!NA_DM.has(id)) return false;
  const [sub = "", sub2 = ""] = MAPA[id]?.subs ? normalizarArgs(id, (args ?? []).slice(0, 2)).map((s) => String(s ?? "").toLowerCase()) : [];
  return nivelDoComando(id, sub, sub2) === "membro";
}
export function recursoDoComando(cmd) {
  return SO_VOZ.has(cmd) ? "voz" : null;
}
// `cmd` e as partes podem vir como aparecem na tela (`&roll`, `&advertir borrar`):
// o nível é do nome interno (18 out 2026: no inglês, o `&roll` do membro sumia da
// ajuda — o mapa só conhece `rolar` — e no espanhol seria quase tudo).
export function podeVer(visao, cmd, sub = "", sub2 = "") {
  cmd = idDoNome(cmd);
  if (sub && MAPA[cmd]?.subs) [sub = "", sub2 = ""] = normalizarArgs(cmd, [sub, sub2].filter(Boolean)).map((s) => String(s).toLowerCase());
  const r = recursoDoComando(cmd);
  if (r === "voz" && !visao.voz) return false;
  return NIVEIS[visao.nivel] >= NIVEIS[nivelDoComando(cmd, sub, sub2)];
}

// As linhas de uma página de ajuda: fica o que quem vê pode usar. Cabeçalho
// (**...**) sem nada embaixo também sai; linha sem comando fica como está.
const RE_CMD = /`&([a-zçãéí]+)(?:\s+([a-zçãéí]+))?(?:\s+([a-zçãéí]+))?[^`]*`/i;
export function filtrarLinhas(linhas, visao) {
  const marcadas = linhas.map((l) => {
    const m = String(l).match(RE_CMD);
    // (22 out 2026) a linha em espanhol vem "pronta" (entre U+2063 e U+2064): sem tirar as
    // marcas, o "**Voz**" não era reconhecido como cabeçalho e ficava sozinho
    if (!m) return { l, tipo: /^\*\*[^*]+\*\*\s*$/.test(String(l).replace(/[\u2063\u2064]/g, "").trim()) ? "cabecalho" : "texto" };
    return { l, tipo: "comando", ok: podeVer(visao, m[1].toLowerCase(), (m[2] ?? "").toLowerCase(), (m[3] ?? "").toLowerCase()) };
  });
  const saida = [];
  for (let i = 0; i < marcadas.length; i++) {
    const x = marcadas[i];
    if (x.tipo === "comando" && !x.ok) continue;
    if (x.tipo === "cabecalho") {
      // some só se a seção era de comandos e TODOS saíram (seção de texto fica)
      let comandos = 0, visiveis = 0;
      // a seção acaba no próximo cabeçalho OU na linha em branco (22 out 2026: a nota
      // uma nota em itálico ("_… `&help x`_") depois da Voz contava como comando da Voz, e o
      // "**Voz**" ficava sozinho onde a voz não está liberada)
      for (let j = i + 1; j < marcadas.length && marcadas[j].tipo !== "cabecalho" && String(marcadas[j].l).trim() !== ""; j++) {
        if (marcadas[j].tipo === "comando") { comandos++; if (marcadas[j].ok) visiveis++; }
      }
      if (comandos > 0 && visiveis === 0) continue;
    }
    saida.push(x.l);
  }
  return saida.filter((l, i, a) => !(String(l).trim() === "" && String(a[i - 1] ?? "").trim() === ""));
}


// Tutorial: para quem é cada área
export const AREAS_DO_MEMBRO = new Set(["economia", "ids"]);
