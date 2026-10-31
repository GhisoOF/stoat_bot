// saida.js — as respostas curtas dos comandos, uma fonte só (P2, 31 out 2026).
//
// R1/R2: o comando mostra o resultado ou o erro, e nada mais. O erro de uso é UMA
// linha + `&help <comando>`; a explicação mora só na ajuda do registro. Sem handler:
// só monta e envia o embed pelo `ctx.sendEmbed` (que traduz e confere o canal).
// Usado pela moderação (punir.js reexporta) e pelas ferramentas.

import { tr, idiomaDe } from "./i18n.js";
import { citar, nomeExibido } from "./aliases.js";

// A dica que fecha todo erro de uso: "`&help warn`", no idioma da tela.
export function dicaDeAjuda(ctx, cmd) {
  const l = idiomaDe(ctx), P = ctx?.PREFIXO ?? "&";
  return `\`${citar("help", l, P)} ${nomeExibido(cmd, l)}\``;
}
export const ajudaDe = dicaDeAjuda;

// Erro de uso numa linha: "❌ frase · `&help cmd`" (R1).
export function erroDeUso(ctx, canal, cmd, pt, en, es, emoji = "❌") {
  const d = dicaDeAjuda(ctx, cmd);
  return ctx.sendEmbed(canal, { description: tr(ctx, `${emoji} ${pt} · ${d}`, `${emoji} ${en} · ${d}`, `${emoji} ${es ?? en} · ${d}`), colour: ctx.COR?.erro });
}

// Falta de permissão de quem pede, numa linha.
export function semPermissao(ctx, canal, perm) {
  return ctx.sendEmbed(canal, { description: tr(ctx,
    `🚫 Permissão insuficiente: **${perm}**.`, `🚫 Missing permission: **${perm}**.`, `🚫 Permiso insuficiente: **${perm}**.`), colour: ctx.COR?.erro });
}

// Resultado: só a descrição (sem título), na cor dada (nome da cor em ctx.COR).
export function responder(ctx, canal, pt, en, es, cor = "sucesso") {
  return ctx.sendEmbed(canal, { description: tr(ctx, pt, en, es ?? en), colour: ctx.COR?.[cor] ?? cor });
}

// Erro sem a dica da ajuda (falha que não é de uso: não achou, cheio, rede…).
export function erro(ctx, canal, pt, en, es) {
  return ctx.sendEmbed(canal, { description: tr(ctx, `❌ ${pt}`, `❌ ${en}`, `❌ ${es ?? en}`), colour: ctx.COR?.erro });
}
