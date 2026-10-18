// A ajuda que mora no registro de comandos (fase 3, 17 out 2026).
//
// Um comando migrado declara a página dele no próprio arquivo de
// `modulos/comandos/` (`ajuda: { perm, uso, desc, ex, parametros }`), nos dois
// idiomas, e cita comandos por referência (`{&autorole.set}`). Daqui saem a
// página `&help <comando>` e a seção de parâmetros — no lugar do que o
// `geral.js` (detalhesPT/EN) e o `help-parametros.js` escreviam à mão.

import { REGISTRO } from "../comandos/index.js";
import { citarNoTexto } from "./aliases.js";

// `{ pt, en, es }` → o do idioma; texto solto vale para todos. Sem `es`, o
// espanhol usa o inglês (etapa 4: o texto é traduzido aos poucos).
const doIdioma = (v, lang) => (v && typeof v === "object" ? (v[lang] ?? (lang === "es" ? v.en : undefined) ?? v.pt) : v);
const texto = (v, lang, P) => (v == null ? v : citarNoTexto(doIdioma(v, lang), lang, P));

// Os comandos cuja página de ajuda vem do registro
export const COMANDOS_COM_AJUDA = REGISTRO.filter((c) => c.ajuda).map((c) => c.id);

// id → { uso, perm, desc, ex }, no formato de construirDetalhes (geral.js)
export function detalhesDoRegistro(P = "&", lang = "pt") {
  return Object.fromEntries(REGISTRO.filter((c) => c.ajuda).map((c) => {
    const a = c.ajuda;
    const d = { uso: texto(a.uso, lang, P), desc: texto(a.desc, lang, P) };
    if (a.perm !== undefined) d.perm = doIdioma(a.perm, lang);   // "ManageRole", null ou { pt: "todo mundo", en: "everyone" }
    if (a.ex) d.ex = texto(a.ex, lang, P);
    return [c.id, d];
  }));
}

// id → [{ nome, valor?, desc }], no formato de parametros (help-parametros.js)
export function parametrosDoRegistro(P = "&", lang = "pt") {
  return Object.fromEntries(REGISTRO.filter((c) => c.ajuda?.parametros?.length).map((c) => [c.id,
    c.ajuda.parametros.map((p) => {
      const o = { nome: texto(p.nome, lang, P) };
      if (p.valor) o.valor = texto(p.valor, lang, P);
      o.desc = texto(p.desc, lang, P);
      return o;
    })]));
}
