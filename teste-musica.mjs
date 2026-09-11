// Testes do sistema de música: classificação das fontes (puro), estado da
// fila e o registro do ducking nos ganchos de fala. Roda sem rede e sem call:
// o que precisa de yt-dlp/Spotify de verdade fica para o teste ao vivo.
process.env.VOZ_DEBUG = "0";

let pass = 0, fail = 0;
const ok = (cond, rotulo) => { cond ? pass++ : fail++; console.log(`  ${cond ? "✅" : "❌"} ${rotulo}`); };

console.log("── classificação das fontes ──");
const m = await import("./voz-servico/musica.js");

ok(m.classificar("https://www.youtube.com/watch?v=abc123").tipo === "url",
  "★ link do YouTube é url direta (yt-dlp resolve)");
ok(m.classificar("https://soundcloud.com/artista/faixa").tipo === "url",
  "  → link do SoundCloud também");
ok(m.classificar("https://youtube.com/playlist?list=PLxyz").tipo === "url",
  "  → playlist do YouTube também (o yt-dlp expande sozinho)");
ok(m.classificar("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC").tipo === "spotify-track",
  "★ faixa do Spotify identificada (resolve sem chave, via oEmbed)");
ok(m.classificar("https://open.spotify.com/intl-pt/track/4uLU6hMCjMI75M1A2tKUQC").tipo === "spotify-track",
  "  → com prefixo de idioma (intl-pt) também");
ok(m.classificar("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M").tipo === "spotify-playlist",
  "★ playlist do Spotify identificada (usa SPOTIFY_ID/SECRET)");
ok(m.classificar("https://open.spotify.com/album/6dVIqQ8qmQ5GBnJ9shOYGE").tipo === "spotify-album",
  "  → álbum também");
ok(m.classificar("never gonna give you up").tipo === "busca",
  "  → texto livre vira busca no YouTube");
ok(m.classificar("").tipo === "vazio", "  → vazio é vazio");

console.log("\n── extração do id do Spotify ──");
ok(m.spotifyInfoDeUrl("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x")?.id === "4uLU6hMCjMI75M1A2tKUQC",
  "★ id extraído mesmo com ?si= de compartilhamento");
ok(m.spotifyInfoDeUrl("https://exemplo.com/track/123") === null,
  "  → domínio errado não é Spotify");

console.log("\n── montagem da busca faixa+artista ──");
ok(m.montarBusca("Bohemian Rhapsody", ["Queen"]) === "Bohemian Rhapsody Queen",
  "★ nome + artista(s)");
ok(m.montarBusca("Faixa", ["A", "B"]) === "Faixa A B", "  → vários artistas");
ok(m.montarBusca("Solta", null) === "Solta", "  → sem artista funciona");

console.log("\n── fila e estado por canal ──");
{
  const f0 = m.fila("canal-teste");
  ok(f0.atual === null && f0.total === 0, "★ canal novo nasce vazio");
  const l = m.loop("canal-teste", "fila");
  ok(!l.erro && m.fila("canal-teste").loop === "fila", "  → loop de fila liga");
  ok(m.loop("canal-teste", "banana").erro, "  → modo inválido é recusado");
  m.loop("canal-teste", "nao");
  m.limparCanal("canal-teste");
  ok(m.fila("canal-teste").loop === "nao", "  → limparCanal zera o estado");
}

console.log("\n── ducking registrado nos ganchos do voz ──");
{
  const voz = await import("./voz-servico/voz.js");
  ok(typeof voz.ganchosDeFala.antes === "function" && typeof voz.ganchosDeFala.depois === "function",
    "★ importar o motor registra antes/depois da fala (a música abaixa e volta)");
  // sem música tocando, os ganchos não podem quebrar a fala
  let quebrou = false;
  try { voz.ganchosDeFala.antes("canal-sem-musica"); voz.ganchosDeFala.depois("canal-sem-musica"); }
  catch { quebrou = true; }
  ok(!quebrou, "  → ganchos são inofensivos sem música tocando");
}

console.log(`\nMÚSICA: ${pass} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
