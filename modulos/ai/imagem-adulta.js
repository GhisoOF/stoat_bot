// Imagem +18 por servidor (15 out 2026, pedido de Ghieh).
//
// A geração de imagem desenhava +18 em qualquer servidor. Agora vem
// BLOQUEADA, e só o dono do bot libera, servidor a servidor
// (`&servidores adulto add <id|aqui>`). Mesmo num servidor liberado, só sai
// em canal marcado como **NSFW** no Stoat — os canais comuns do servidor
// continuam limpos. E em lugar nenhum saem menores em cena sexual nem
// pessoa real (deepfake): isso o gerador recusa sempre, e a imagem pronta
// passa pelo modelo de visão antes de ir para o canal.
//
// O mesmo "liberado aqui" tira do chat a trava do assunto sexual (15 out
// 2026; ver desinteresse.instrucaoAdulta) — com os mesmos dois limites.
//
// A lista fica na configuração GLOBAL (`imagemAdulta`), não na do servidor:
// o admin de um servidor não consegue se liberar sozinho.

import * as store from "../core/config-store.js";

const nsfwDoCanal = new Map();   // canalId → o canal está marcado como NSFW?

export function servidoresLiberados() {
  const g = store.getGlobal();
  return Array.isArray(g.imagemAdulta) ? g.imagemAdulta : [];
}
export function servidorLiberado(serverId) {
  return !!serverId && servidoresLiberados().includes(serverId);
}
export function definirServidores(ids) {
  const g = store.getGlobal();
  g.imagemAdulta = [...new Set(ids.filter(Boolean))];
  store.salvarGlobal();
  return g.imagemAdulta;
}

// O chat anota o canal a cada conversa (a flag `nsfw` vem do Stoat).
export function lembrarCanal(canal) {
  const id = canal?.id ?? canal?._id;
  if (id) nsfwDoCanal.set(id, canal?.nsfw === true);
}
export function canalNsfw(canalId) { return nsfwDoCanal.get(canalId) === true; }

// Liberado AQUI = servidor na lista do dono E canal NSFW.
export function liberadaAqui(serverId, canalId) {
  return servidorLiberado(serverId) && canalNsfw(canalId);
}
