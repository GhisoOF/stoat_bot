
const JANELA_MIN = Number(process.env.STATS_JANELA_MIN || 15);
const MAX_AMOSTRAS = 5000;

// serverId → array de timestamps
const mensagens = new Map();

const agora = () => Date.now();
const limite = () => agora() - JANELA_MIN * 60_000;

// Chamado a cada mensagem recebida.
export function registrar(serverId) {
  if (!serverId) return;
  let arr = mensagens.get(serverId);
  if (!arr) { arr = []; mensagens.set(serverId, arr); }
  arr.push(agora());
  const corte = limite();
  let i = 0;
  while (i < arr.length && arr[i] < corte) i++;
  if (i) arr.splice(0, i);
  if (arr.length > MAX_AMOSTRAS) arr.splice(0, arr.length - MAX_AMOSTRAS);
}

// Mensagens por minuto na janela observada.
export function porMinuto(serverId) {
  const arr = mensagens.get(serverId);
  if (!arr?.length) return 0;
  const corte = limite();
  const recentes = arr.filter((t) => t >= corte).length;
  return recentes / JANELA_MIN;
}

let inicio = agora();
export function marcarInicio() { inicio = agora(); }
export function tempoDePe() {
  const s = Math.floor((agora() - inicio) / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}min` : `${m}min`;
}

// A lista de servidores do cliente, nos formatos que a lib pode entregar.
export function listarServidores(client) {
  const s = client?.servers;
  if (s?.values) return [...s.values()];
  if (Array.isArray(s)) return s;
  if (s && typeof s === "object") return Object.values(s);
  return [];
}
