// Imagens do RPG v4 — personagens com nome, chefes, missões especiais,
// dungeons e itens únicos. O arquivo NÃO vai para o repositório (é público):
// o dono manda a imagem num canal do Stoat e liga ela ao id com
//   &game admin imagem <id ou nome>        (com a imagem anexada)
//   &game admin imagem <id ou nome> <link>
// O link fica no banco (config "__rpg_imagens__"); um "imagem" no JSON do
// conteúdo serve de padrão. A imagem sai como capa do embed (campo media) —
// o Stoat só aceita anexo dele ali; link de fora vira um link escondido.

import * as db from "../core/db.js";
import { IMAGENS_DO_CONTEUDO, COMPANHEIROS, CHEFES, ESPECIAIS, DUNGEONS, ITENS } from "./conteudo.js";

const CHAVE = "__rpg_imagens__";
const mapa = () => { const m = db.lerConfig(CHAVE); return m && typeof m === "object" ? m : {}; };
const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// A imagem anexada à mensagem do comando → o link dela no CDN do Stoat
const CDN = (process.env.CDN_URL || "https://cdn.stoatusercontent.com").replace(/\/$/, "");
export function anexoDe(message) {
  const a = (message?.attachments ?? []).find((x) => /^image\//.test(String(x?.metadata?.type ?? x?.contentType ?? x?.content_type ?? "")) || x?.metadata?.type === "Image");
  const id = a?.id ?? a?._id;
  return id ? `${CDN}/attachments/${id}` : null;
}

// A primeira que existir, na ordem pedida: imagemDe(chefe.id, dungeon.id)
export function imagemDe(...ids) {
  const m = mapa();
  for (const id of ids) {
    if (!id) continue;
    const u = m[id] ?? IMAGENS_DO_CONTEUDO.get(id);
    if (u) return u;
  }
  return null;
}

export function definirImagem(id, url) {
  const m = mapa();
  if (url) m[id] = url; else delete m[id];
  db.gravarConfig(CHAVE, m);
}

// O que pede imagem: o que tem nome. Genéricos (os 60 companheiros, os 286
// itens) usam emoji — dá para pôr imagem neles também, pelo id.
export function alvosDeImagem() {
  const L = [];
  for (const c of COMPANHEIROS.values()) if (c.dados?.unico) L.push({ id: c.id, tipo: "companheiro", nome: c.nome, nomeEN: c.dados.nomeEN });
  for (const c of CHEFES.values()) L.push({ id: c.id, tipo: "chefe", nome: c.nome, nomeEN: c.nomeEN });
  for (const e of ESPECIAIS) L.push({ id: e.id, tipo: "especial", nome: e.nome, nomeEN: e.nomeEN });
  for (const d of DUNGEONS.values()) L.push({ id: d.id, tipo: "dungeon", nome: d.nome, nomeEN: d.nomeEN });
  for (const i of ITENS.values()) if (i.especial && !["contrato", "pergaminho"].includes(i.slot)) L.push({ id: i.id, tipo: "item", nome: i.nome, nomeEN: i.nomeEN });
  return L;
}

// Por id exato, ou pelo nome (sem acento, PT ou EN; exato antes de "contém").
export function acharAlvo(texto) {
  const t = semAcento(texto);
  if (!t) return null;
  const todos = [...alvosDeImagem(),
    ...[...COMPANHEIROS.values()].filter((c) => !c.dados?.unico).map((c) => ({ id: c.id, tipo: "companheiro", nome: c.nome, nomeEN: c.dados?.nomeEN })),
    ...[...ITENS.values()].filter((i) => !i.especial).map((i) => ({ id: i.id, tipo: "item", nome: i.nome, nomeEN: i.nomeEN }))];
  return todos.find((a) => a.id.toLowerCase() === t)
    ?? todos.find((a) => semAcento(a.nome) === t || semAcento(a.nomeEN) === t)
    ?? alvosDeImagem().find((a) => semAcento(a.nome).includes(t) || semAcento(a.nomeEN).includes(t))
    ?? null;
}
