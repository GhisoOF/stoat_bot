
process.env.BOT_TOKEN = "tok";
process.env.DB_PATH = "/tmp/staff-teste.db";
process.env.CONFIG_PATH = "/tmp/staff-teste-cfg.json";
import fs from "node:fs";
for (const f of ["/tmp/staff-teste.db", "/tmp/staff-teste.db-wal", "/tmp/staff-teste.db-shm",
                 "/tmp/staff-teste-cfg.json", "/tmp/blocklist-cache.bin"]) {
  fs.rmSync(f, { force: true });
}

await import("./main.js");
const c = globalThis.__client;
await c.emitAll("ready");

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(`${cond ? "✅" : "❌"} ${msg}`); };

// ── Cenário: servidor com dois cargos e três membros ──
const CARGO_ADM = "01JADM00000000000000000000";
const CARGO_MOD = "01JMDR00000000000000000000";
const roles = new Map([
  [CARGO_ADM, { name: "Administração" }],
  [CARGO_MOD, { name: "Moderador" }],
]);
const membros = [
  { id: { user: "01JAA000000000000000000000" }, roles: [CARGO_ADM] },
  { id: { user: "01JBB000000000000000000000" }, roles: [CARGO_MOD] },
  { id: { user: "01JCC000000000000000000000" }, roles: [CARGO_MOD] },
  { id: { user: "01JDD000000000000000000000" }, roles: [] },
];
const CANAL_PORTARIA = "01JPRT00000000000000000000";
const portaria = { id: CANAL_PORTARIA, name: "portaria", sendMessage: async (p) => enviadosPortaria.push(p) };
const enviadosPortaria = [];
c.channels.set("C1", { id: "C1", sendMessage: async () => {} });
c.channels.set(CANAL_PORTARIA, portaria);

const server = {
  id: "S1", ownerId: "U1", name: "Queremos acordar tarde!",
  memberCount: 1972, roles, channels: [portaria],
  fetchMember: async () => null,
  fetchMembers: async () => ({ members: membros }),
};
c.servers.set("S1", server);

const env = [];
const mk = (t) => ({
  authorId: "U1", content: t, serverId: "S1", server,
  channel: { id: "C1", sendMessage: async (p) => env.push(p) },
  channelId: "C1", mentionIds: [], createdAt: new Date(),
  author: { username: "Ghieh" }, member: { roles: [] },
});
const say = async (t) => { await c.emitAll("messageCreate", mk(t)); };
const ult = () => JSON.stringify(env[env.length - 1] ?? {});

console.log("\n── &staff ──");
await say("&staff");
ok(ult().includes("Nenhum cargo de staff"), "&staff sem cargos → explica como montar a lista");

await say("&staff add Administração");
ok(ult().includes("adicionado"), "&staff add <nome do cargo>");
ok(ult().includes("acesso aos comandos"), "  → avisa que isso concede acesso à moderação");
await say(`&staff add <%${CARGO_MOD}>`);
ok(ult().includes("adicionado"), "&staff add <@cargo> (menção)");

await say("&staff");
const lista = ult();
ok(lista.includes("Administração") && lista.includes("Moderador"), "&staff lista os dois cargos");
ok(lista.includes("01JBB000000000000000000000") && lista.includes("01JCC000000000000000000000"),
  "  → mostra quem tem cada cargo");
ok(!lista.includes("01JDD000000000000000000000"), "  → não mostra quem não é staff");
ok(lista.indexOf("Administração") < lista.indexOf("Moderador"), "  → ordem = ordem de adição");

// ★ integração: a lista do &staff É a lista do &acesso
env.length = 0; await say("&acesso status");
ok(ult().includes(CARGO_ADM) || ult().includes("Administração") || ult().includes("2"),
  "★ &acesso enxerga os cargos adicionados pelo &staff (mesma lista)");

// título personalizado
await say("&staff titulo Moderador Guardiões do Chat");
ok(ult().includes("Guardiões do Chat"), "&staff titulo define rótulo");
await say("&staff");
ok(ult().includes("Guardiões do Chat") && !ult().includes("**Moderador**"), "  → a lista usa o rótulo");
await say("&staff titulo Moderador limpar");
await say("&staff");
ok(ult().includes("Moderador"), "&staff titulo limpar volta ao nome do cargo");

// remoção mantém a integração
await say("&staff remove Moderador");
ok(ult().includes("removido"), "&staff remove");
env.length = 0; await say("&acesso status");
ok(!ult().includes(CARGO_MOD), "★ remover do &staff também tira o acesso à moderação");

console.log("\n── &boasvindas ──");
await say("&boasvindas");
ok(ult().includes("desligado") || ult().includes("🔴"), "&boasvindas começa desligado");
ok(ult().includes("Prévia"), "  → mostra uma prévia da mensagem");

await say(`&boasvindas canal <#${CANAL_PORTARIA}>`);
ok(ult().includes("configurada"), "&boasvindas canal <#canal> (liga junto)");

await say("&boasvindas texto Olá {usuario}, seja bem-vindo a {servidor}! Já somos {membros}.");
ok(ult().includes("atualizada"), "&boasvindas texto");
await say("&boasvindas titulo 🎉 Chegou gente nova");
ok(ult().includes("Título"), "&boasvindas titulo");
await say("&boasvindas cor roxo");
ok(ult().includes("A855F7"), "&boasvindas cor por nome");
await say("&boasvindas cor naoexiste");
ok(ult().includes("inválida"), "&boasvindas cor inválida → recusa clara");

enviadosPortaria.length = 0;
await say("&boasvindas testar");
const teste = JSON.stringify(enviadosPortaria);
ok(enviadosPortaria.length === 1, "&boasvindas testar publica no canal configurado");
ok(teste.includes("Queremos acordar tarde!"), "  → {servidor} renderizado");
ok(teste.includes("1972"), "  → {membros} renderizado");
ok(teste.includes("<@U1>"), "  → {usuario} vira menção na entrada");
ok(teste.includes("Chegou gente nova"), "  → título personalizado aplicado");

console.log("\n── entrada e saída de verdade ──");
enviadosPortaria.length = 0;
await c.emitAll("serverMemberJoin", { id: { server: "S1", user: "01JZZ000000000000000000000" }, user: { username: "Novato" } });
const boas = JSON.stringify(enviadosPortaria);
ok(enviadosPortaria.length === 1, "★ alguém entrou → embed de boas-vindas publicado");
ok(boas.includes("<@01JZZ000000000000000000000>"), "  → menciona quem entrou");

// desligado não publica
await say("&boasvindas off");
enviadosPortaria.length = 0;
await c.emitAll("serverMemberJoin", { id: { server: "S1", user: "01JYY000000000000000000000" }, user: { username: "Outro" } });
ok(enviadosPortaria.length === 0, "&boasvindas off → nada é publicado");
await say("&boasvindas on");

await say(`&adeus canal <#${CANAL_PORTARIA}>`);
await say("&adeus texto {usuario} deixou {servidor}. Restam {membros}.");
enviadosPortaria.length = 0;
await c.emitAll("serverMemberLeave", { id: { server: "S1", user: "01JXX000000000000000000000" }, user: { username: "QuemSaiu" } });
const adeus = JSON.stringify(enviadosPortaria);
ok(enviadosPortaria.length === 1, "★ alguém saiu → embed de despedida publicado");
ok(adeus.includes("QuemSaiu"), "  → usa o nome de quem saiu");
ok(!adeus.includes("<@01JXX000000000000000000000>"), "  → NÃO menciona (ID cru na tela seria feio)");

// padrao restaura sem perder canal/estado
await say("&boasvindas padrao");
ok(ult().includes("padrão"), "&boasvindas padrao restaura o texto de fábrica");
await say("&boasvindas");
ok(ult().includes(CANAL_PORTARIA) || ult().includes("🟢"), "  → canal e estado preservados");

console.log("\n── inglês ──");
await say("&idioma en");
env.length = 0;
await say("&staff");
ok(ult().includes("Staff") && !ult().includes("Equipe"), "EN: &staff");
await say("&welcome");
ok(ult().includes("Welcome") && ult().includes("Preview"), "EN: &welcome (alias)");
await say("&goodbye");
ok(ult().includes("Farewell") || ult().includes("Preview"), "EN: &goodbye (alias)");
await say("&welcome channel here");
ok(ult().includes("configured"), "EN: &welcome channel here");
await say("&welcome text Hi {usuario}, welcome to {servidor}!");
ok(ult().includes("updated"), "EN: &welcome text");
await say("&staff add Moderador");
ok(ult().includes("added") || ult().includes("Role added"), "EN: &staff add");
await say("&staff title Moderador Chat Guardians");
ok(ult().includes("Chat Guardians"), "EN: &staff title");

// help nas duas línguas
await say("&help staff");
ok(ult().length > 50, "EN: &help staff responde");
await say("&idioma pt");
env.length = 0;
await say("&help staff");
ok(ult().includes("equipe") || ult().includes("Equipe"), "PT: &help staff responde");
await say("&help boasvindas");
ok(ult().includes("{usuario}") || ult().includes("Marcadores"), "PT: &help boasvindas documenta os marcadores");
await say("&config");
ok(ult().includes("Boas-vindas") || ult().includes("Entrada e saída"), "&config PT mostra o novo estado");

console.log("\n── imagem ──");
{
  await say("&idioma pt");
  await say(`&adeus canal <#${CANAL_PORTARIA}>`);
  await say("&adeus imagem https://exemplo.com/capa.png");
  ok(ult().includes("Imagem definida"), "&adeus imagem aceita URL direta");
  enviadosPortaria.length = 0;
  await say("&adeus testar");
  ok(enviadosPortaria[0]?.content === "[\u2800](https://exemplo.com/capa.png)",
    "★ link externo vai no conteúdo, MASCARADO (sem URL crua na tela)");
  ok(enviadosPortaria[0]?.content.includes("https://exemplo.com/capa.png"),
    "  → a URL segue lá, para o Stoat pré-visualizar");
  ok(!enviadosPortaria[0]?.embeds?.[0]?.media,
    "  → e NÃO no campo media, que ignoraria a URL em silêncio");

  // Anexo do próprio Stoat: aí sim vira capa do embed
  await say("&adeus imagem https://autumn.stoat.chat/attachments/01JHKMNPQRSTVWXYZ012345678/capa.png");
  enviadosPortaria.length = 0;
  await say("&adeus testar");
  ok(enviadosPortaria[0]?.embeds?.[0]?.media === "01JHKMNPQRSTVWXYZ012345678",
    "★ anexo do Stoat → ID no campo media (capa de verdade)");

  // link de busca: aceita, mas avisa que costuma falhar
  await say("&adeus imagem https://imgs.search.brave.com/abc/def");
  ok(ult().includes("⚠️") && ult().includes("busca"), "★ link de resultado de busca → alerta");
  // escape: se o Stoat parar de pré-visualizar link mascarado
  await say("&adeus imagem https://exemplo.com/capa.png");
  await say("&adeus imagem visivel");
  enviadosPortaria.length = 0;
  await say("&adeus testar");
  ok(enviadosPortaria[0]?.content === "https://exemplo.com/capa.png",
    "★ `imagem visivel` devolve a URL crua (escape sem deploy)");
  await say("&adeus imagem oculto");

  await say("&adeus imagem limpar");
  enviadosPortaria.length = 0;
  await say("&adeus testar");
  ok(!enviadosPortaria[0]?.embeds?.[0]?.media && !enviadosPortaria[0]?.content,
    "limpar remove a capa e o link do envio");
}

console.log("\n── contagem de membros ──");
{
  const { invalidar } = await import("./modulos/core/membros.js");
  let lista = Array.from({ length: 42 }, (_, i) => ({ id: { user: "01J" + String(i).padStart(23, "0") }, roles: [] }));
  const semContagem = {
    id: "S2", ownerId: "U1", name: "Sem memberCount", roles: new Map(), channels: [portaria],
    fetchMember: async () => null,
    fetchMembers: async () => ({ members: lista }),
    fetchBans: async () => [],
  };
  // memberCount ausente de propósito
  ok(semContagem.memberCount === undefined, "cenário: servidor sem memberCount (como o Stoat entrega)");
  invalidar();
  const { contarMembros } = await import("./modulos/core/membros.js");
  ok(await contarMembros(semContagem) === 42, "★ contarMembros busca a lista quando o campo não existe");
  invalidar("S2");
  lista = lista.slice(0, 40);
  ok(await contarMembros(semContagem) === 40, "★ invalidar() força recontagem (entrada/saída recente)");
  ok(await contarMembros({ id: "S3", memberCount: 7 }) === 7, "campo direto é usado sem buscar nada");
  ok(await contarMembros({ id: "S4" }) === null, "sem campo e sem fetchMembers → null (vira \"?\", nunca 0)");
}

console.log(`\nSTAFF + BOAS-VINDAS: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
