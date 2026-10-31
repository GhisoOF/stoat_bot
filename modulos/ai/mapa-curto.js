// mapa-curto.js — um Map com prazo e teto (31 out 2026, P1, R9/R11).
//
// Os caches de texto da IA (o fio de cada canal, a última resposta, as respostas
// recentes, o aviso de "você pediu silêncio") viviam na RAM sem prazo nem teto: o
// que alguém escreveu ficava ali até o bot reiniciar (a PRIVACIDADE.md promete "os
// últimos minutos"), e cada canal novo era uma entrada a mais para sempre.
// Aqui: cada chave vale `ttlMs` desde a última escrita; passando de `max` chaves, a
// mais antiga sai. A leitura de uma chave vencida a apaga.

export class MapaCurto extends Map {
  constructor({ ttlMs = 30 * 60_000, max = 1000, agora = Date.now } = {}) {
    super();
    this.ttlMs = ttlMs;
    this.max = max;
    this.agora = agora;
    this.escrito = new Map();   // chave → quando foi escrita
  }
  set(k, v) {
    super.delete(k);            // reescrever leva a chave para o fim (a mais nova)
    super.set(k, v);
    this.escrito?.set(k, this.agora());
    while (super.size > this.max) this.delete(super.keys().next().value);
    return this;
  }
  vencida(k) {
    const t = this.escrito.get(k);
    return t === undefined || this.agora() - t > this.ttlMs;
  }
  get(k) {
    if (!super.has(k)) return undefined;
    if (this.vencida(k)) { this.delete(k); return undefined; }
    return super.get(k);
  }
  has(k) { return this.get(k) !== undefined; }
  delete(k) { this.escrito.delete(k); return super.delete(k); }
  clear() { this.escrito.clear(); super.clear(); }
  // tira as vencidas (quem itera o mapa inteiro chama antes)
  podar() {
    for (const k of [...super.keys()]) if (this.vencida(k)) this.delete(k);
    return this;
  }
}
