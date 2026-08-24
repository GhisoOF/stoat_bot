// ══════════════════════════════════════════════════════════
//  teste-reactionroles.mjs — o painel de cargos por reação
//
//  O bug que originou estes testes: no modo exclusivo, alguém trocava de
//  cor e o emoji ANTERIOR sumia da mensagem inteira. Não era o cargo — era
//  a reação do bot, que é o que segura o emoji visível quando ninguém está
//  marcado. Sumindo ela, a contagem chegava a zero e a opção deixava de
//  existir para todo mundo.
//
//  A causa é uma assinatura enganosa da lib:
//
//      async unreact(emoji, deleteAll = false)
//
//  Passando um userId no segundo parâmetro — que é o que qualquer um
//  escreveria — a string vira `deleteAll: true` e o backend apaga a reação
//  de TODOS. O código pedia "tire a reação desta pessoa" e o servidor ouvia
//  "apague esta reação da mensagem".
//
//  Por isso o primeiro teste aqui não olha o resultado: olha a CHAMADA.
//  Um teste de efeito passaria com o bug presente, já que a reação da
//  pessoa realmente sai — junto com as outras.
// ══════════════════════════════════════════════════════════
process.env.DB_PATH = "/tmp/rr-teste.db";
process.env.CONFIG_PATH = "/tmp/rr-teste-cfg.json";
import fs from "node:fs";
for (const f of [process.env.DB_PATH, process.env.CONFIG_PATH]) { try { fs.unlinkSync(f); } catch {} }

const db = await import("./modulos/core/db.js");
db.abrirBanco(process.env.DB_PATH);
const rr = await import("./modulos/ferramentas/reaction-roles.js");

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

const SERVER = "01SERVERRR0000000000000AAA";
const MSG    = "01MSGRRR000000000000000AAA";
const CANAL  = "01CANALRRR0000000000000AAA";
const BOT    = "01BOTRRR000000000000000AAA";
const PESSOA = "01PESSOARRR000000000000AAA";
const CORES  = [["💙", "01ROLEAZUL0000000000000AAA"], ["🧡", "01ROLELARANJA000000000AAA"], ["💜", "01ROLEROXO0000000000000AAA"]];

// ── Dublês ────────────────────────────────────────────────
// A mensagem guarda quem reagiu com o quê, como o cliente faz, para que
// "sumir da mensagem" seja algo observável no teste.
function criarMensagem(reacoes = {}) {
  const mapa = new Map(Object.entries(reacoes).map(([e, us]) => [e, new Set(us)]));
  return {
    id: MSG, channelId: CANAL, reactions: mapa,
    reagidos: [],
    async react(emojiCodificado) {
      const e = decodeURIComponent(emojiCodificado);
      this.reagidos.push(e);
      if (!mapa.has(e)) mapa.set(e, new Set());
      mapa.get(e).add(BOT);
    },
    async clearReactions() { mapa.clear(); },
    // A assinatura real da lib: o 2º parâmetro é `deleteAll`, NÃO um usuário.
    async unreact(emojiCodificado, deleteAll = false) {
      const e = decodeURIComponent(emojiCodificado);
      if (deleteAll) mapa.delete(e);            // apaga de todo mundo
      else mapa.get(e)?.delete(BOT);            // só a do próprio bot
      return true;
    },
  };
}

function criarClient(msg, { cargos = [] } = {}) {
  const chamadas = [];
  const membro = {
    roles: [...cargos],
    async edit({ roles }) { this.roles = [...roles]; },
  };
  return {
    chamadas, membro,
    user: { id: BOT },
    api: {
      async delete(rota, params) {
        chamadas.push({ rota, params });
        // Reproduz o backend: `user_id` tira de um; `remove_all` tira de todos.
        const e = decodeURIComponent(rota.split("/reactions/")[1] ?? "");
        if (params?.remove_all) msg.reactions.delete(e);
        else if (params?.user_id) {
          msg.reactions.get(e)?.delete(params.user_id);
          if (msg.reactions.get(e)?.size === 0) msg.reactions.delete(e);
        }
        return {};
      },
    },
    servers: { fetch: async () => ({ id: SERVER, fetchMember: async () => membro }) },
    channels: { get: () => null, fetch: async () => null },
  };
}

const ctxDe = (client) => ({ client, config: {}, configDoServidor: () => ({}) });

// ── Cenário: painel de cores, modo exclusivo ──────────────
for (const [emoji, role] of CORES) db.addReactionRole(SERVER, MSG, emoji, role, CANAL);
db.setReactionRoleExclusivo(MSG, true);

// ══ 1. Trocar de cor não pode apagar o emoji antigo ══
console.log("── trocar de cor no modo exclusivo ──");
{
  // Estado inicial: o bot semeou os três; a pessoa está no 💙.
  const msg = criarMensagem({ "💙": [BOT, PESSOA], "🧡": [BOT], "💜": [BOT] });
  const client = criarClient(msg, { cargos: [CORES[0][1]] });
  await rr.aoReagir(msg, PESSOA, "🧡", ctxDe(client));

  const removeAll = client.chamadas.filter((c) => c.params?.remove_all);
  ok(removeAll.length === 0,
    "★ nenhuma chamada pede `remove_all` — era ela que apagava o emoji de todo mundo");
  ok(client.chamadas.some((c) => c.params?.user_id === PESSOA && c.rota.includes(encodeURIComponent("💙"))),
    "  → a remoção é dirigida à pessoa (`user_id`), como a rota do Stoat aceita");
  ok(msg.reactions.has("💙"), "★ o 💙 CONTINUA na mensagem depois da troca");
  ok(msg.reactions.get("💙").has(BOT) && !msg.reactions.get("💙").has(PESSOA),
    "  → sem a marca da pessoa, mas com a do bot, que mantém a opção clicável");
  ok(client.membro.roles.includes(CORES[1][1]) && !client.membro.roles.includes(CORES[0][1]),
    "  → e o cargo foi trocado, que é o efeito pretendido");
}

// ══ 2. A última pessoa a desmarcar não pode levar o emoji junto ══
//
//  Se, por qualquer motivo, o bot não estiver reagido (regras antigas, ou
//  reação perdida antes desta correção), quem desmarca zera a contagem e a
//  opção some. Repor a semente devolve o botão para o próximo.
console.log("\n── quando a última pessoa desmarca ──");
{
  const msg = criarMensagem({ "💜": [PESSOA] });     // sem a semente do bot
  const client = criarClient(msg, { cargos: [CORES[2][1]] });
  msg.reactions.get("💜").delete(PESSOA);
  msg.reactions.delete("💜");                        // o cliente já removeu
  await rr.aoDesreagir(msg, PESSOA, "💜", ctxDe(client));
  ok(client.membro.roles.length === 0, "o cargo é retirado");
  ok(msg.reactions.has("💜"), "★ e o emoji volta para a mensagem, em vez de desaparecer");
  ok(msg.reagidos.includes("💜"), "  → porque o bot reage de novo");
}

// ══ 3. A ordem é do jeito que foi configurada ══
console.log("\n── a ordem das opções ──");
{
  const ordem = db.listReactionRoles(MSG).map((r) => r.emoji);
  ok(JSON.stringify(ordem) === JSON.stringify(CORES.map((c) => c[0])),
    `★ a lista sai na ordem em que foi configurada (${ordem.join(" ")})`);

  // Reeditar o cargo de um emoji existente não pode jogá-lo para o fim: a
  // mensagem não muda de ordem, então a configuração também não deve.
  db.addReactionRole(SERVER, MSG, "💙", "01ROLEAZUL2000000000000AAA", CANAL);
  const depois = db.listReactionRoles(MSG).map((r) => r.emoji);
  ok(depois[0] === "💙", "★ reeditar uma regra existente NÃO a manda para o fim da fila");

  // Um emoji novo entra no fim, que é onde ele aparece na mensagem.
  db.addReactionRole(SERVER, MSG, "💚", "01ROLEVERDE0000000000AAAAA", CANAL);
  ok(db.listReactionRoles(MSG).map((r) => r.emoji).at(-1) === "💚", "e um emoji novo entra no fim");
}

// ══ 4. Repor só o que falta, sem tocar no resto ══
console.log("\n── repor o que sumiu ──");
{
  // O 🧡 sumiu; o 💚 foi acrescentado ali em cima e ainda não tem reação.
  const msg = criarMensagem({ "💙": [BOT, PESSOA], "💜": [BOT] });
  const client = criarClient(msg);
  const r = await rr.reporReacoesQueFaltam(msg, client);
  ok(r.repostos.join(" ") === "🧡 💚", "★ repõe só os emojis que faltavam, na ordem configurada");
  ok(msg.reactions.get("💙").has(PESSOA), "  → sem mexer em quem já estava marcado");
}

console.log(`\nREACTION ROLES: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
