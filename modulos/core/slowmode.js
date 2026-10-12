// slowmode.js — a Judy respeita o modo lento do canal em vez de perder a mensagem.
//
// O caso (12 out 2026): `&fuso add França` e logo `&fuso` num canal com modo
// lento — a 2ª resposta voltou {"type":"InSlowmode","retry_after":1} e o
// fallback de texto, tentado na mesma hora, também. O comando "falhava" e a
// pessoa não via nada.
//
// No Stoat (stoatchat, crates/delta/src/routes/channels/message_send.rs) o
// modo lento vale para o bot também, a menos que o cargo dele tenha
// "Ignorar modo lento" (BypassSlowmode, 1 << 39 — a stoat.js 7.3.6 nem conhece
// esse bit). `retry_after` são SEGUNDOS (o TTL da chave no Redis).
//
// Aqui: toda `sendMessage` passa por um embrulho que, ao receber InSlowmode,
// espera o `retry_after` e tenta de novo; e, conhecendo o modo lento do canal
// (GET /channels/:id → `slowmode`), espaça as próximas mensagens dele em fila,
// na ordem, em vez de deixá-las bater e falhar. Espera maior que
// SLOWMODE_ESPERA_MAX_S (padrão 30 s) não acontece: aí o erro sobe e o log diz
// o que fazer (dar "Ignorar modo lento" ao cargo da Judy).

const ESPERA_MAX_MS = () => Number(process.env.SLOWMODE_ESPERA_MAX_S || 30) * 1000;
const TENTATIVAS = 3;
const VALIDADE_MS = 10 * 60_000;   // o que se aprendeu de um canal vale 10 min
const FOLGA_MS = 250;

const canais = new Map();   // canalId → { dur (s), proximo (ms), em (ms) }
const avisados = new Set();
const dormir = (ms) => new Promise((ok) => setTimeout(ok, Math.max(0, ms)));

// Segundos a esperar se o erro for de modo lento; senão null. A SDK rejeita com
// o corpo cru (string JSON) — mas aceita objeto ou Error também.
export function esperaDoSlowmode(e) {
  let obj = e;
  if (typeof e === "string") { try { obj = JSON.parse(e); } catch { obj = null; } }
  else if (e instanceof Error) { try { obj = JSON.parse(e.message); } catch { obj = e.cause ?? e.data ?? null; } }
  if (obj?.type !== "InSlowmode") return null;
  const s = Number(obj.retry_after);
  return Number.isFinite(s) && s >= 0 ? s : 1;
}

function infoDo(canalId) {
  const i = canais.get(canalId);
  if (i && Date.now() - i.em > VALIDADE_MS) { canais.delete(canalId); return null; }
  return i ?? null;
}

// Reserva a próxima vaga do canal: devolve quantos ms esperar.
function reservar(canalId, minimoMs = 0) {
  const i = infoDo(canalId);
  if (!i) return minimoMs;
  const agora = Date.now();
  const vaga = Math.max(agora + minimoMs, i.proximo);
  i.proximo = vaga + i.dur * 1000 + FOLGA_MS;
  return vaga - agora;
}

export function _zerar() { canais.clear(); avisados.clear(); }
export function _estado(canalId) { return infoDo(canalId); }

// `duracaoDo(canalId)` → segundos de modo lento do canal (ou null).
export function embrulharEnvio(original, { duracaoDo = async () => null, log = (m) => console.warn(m) } = {}) {
  if (original.__comSlowmode) return original;
  const envio = async function (data, idem) {
    const canalId = this?.id;
    const antes = canalId ? reservar(canalId) : 0;
    if (antes > 0) await dormir(Math.min(antes, ESPERA_MAX_MS()));
    for (let tentativa = 0; ; tentativa++) {
      try {
        return await original.call(this, data, idem);
      } catch (e) {
        const s = esperaDoSlowmode(e);
        if (s === null || !canalId) throw e;
        if (!infoDo(canalId)) {
          const dur = await Promise.resolve(duracaoDo(canalId)).catch(() => null);
          canais.set(canalId, { dur: Number(dur) > 0 ? Number(dur) : s, proximo: 0, em: Date.now() });
        }
        if (!avisados.has(canalId)) {
          avisados.add(canalId);
          log(`[SLOWMODE] canal ${canalId} tem modo lento (${infoDo(canalId)?.dur ?? s}s) — as mensagens da Judy vão esperar a vez. Para responder na hora, dê ao cargo dela a permissão "Ignorar modo lento" (Bypass Slowmode) nesse canal.`);
        }
        const espera = reservar(canalId, s * 1000 + FOLGA_MS);
        if (tentativa >= TENTATIVAS - 1 || espera > ESPERA_MAX_MS()) throw e;
        await dormir(espera);
      }
    }
  };
  envio.__comSlowmode = true;
  return envio;
}

// Instala no protótipo do canal da stoat.js — vale para todo envio do bot.
export function instalar(ClasseCanal, opcoes) {
  const p = ClasseCanal?.prototype;
  if (!p || typeof p.sendMessage !== "function") return false;
  p.sendMessage = embrulharEnvio(p.sendMessage, opcoes);
  return true;
}
