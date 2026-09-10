
export const GENERICOS = [
  // ── COMUM (estoque infinito) ──
  { id: "g_adaga_simples",  nome: "Adaga Simples",  slot: "arma",      raridade: "comum", infinito: true, precoBase: 10, bonus: { forca: 1 } },
  { id: "g_espada_ferro",   nome: "Espada de Ferro", slot: "arma",     raridade: "comum", infinito: true, precoBase: 18, bonus: { forca: 2 } },
  { id: "g_cajado_rachado", nome: "Cajado Rachado", slot: "arma",      raridade: "comum", infinito: true, precoBase: 18, bonus: { inteligencia: 2 } },
  { id: "g_elmo_amassado",  nome: "Elmo Amassado",  slot: "capacete",  raridade: "comum", infinito: true, precoBase: 12, bonus: { resistencia: 1 } },
  { id: "g_tunica_puida",   nome: "Túnica Puída",   slot: "armadura",  raridade: "comum", infinito: true, precoBase: 14, bonus: { resistencia: 1, agilidade: 1 } },
  { id: "g_amuleto_opaco",  nome: "Amuleto Opaco",  slot: "acessorio", raridade: "comum", infinito: true, precoBase: 12, bonus: { sorte: 1 } },

  // ── INCOMUM ──
  { id: "g_espada_temperada", nome: "Espada Temperada", slot: "arma",      raridade: "incomum", precoBase: 60,  bonus: { forca: 4, destreza: 1 } },
  { id: "g_bordao_runico",    nome: "Bordão Rúnico",    slot: "arma",      raridade: "incomum", precoBase: 60,  bonus: { inteligencia: 4, mana: 1 } },
  { id: "g_elmo_bronze",      nome: "Elmo de Bronze",   slot: "capacete",  raridade: "incomum", precoBase: 45,  bonus: { resistencia: 2, vida: 1 } },
  { id: "g_cota_malha",       nome: "Cota de Malha",    slot: "armadura",  raridade: "incomum", precoBase: 55,  bonus: { resistencia: 3 } },
  { id: "g_anel_prata",       nome: "Anel de Prata",    slot: "acessorio", raridade: "incomum", precoBase: 50,  bonus: { sorte: 2 } },

  // ── RARO ──
  { id: "g_lamina_vento",   nome: "Lâmina do Vento",  slot: "arma",      raridade: "raro", precoBase: 220, bonus: { forca: 6, agilidade: 3 } },
  { id: "g_cetro_cristal",  nome: "Cetro de Cristal", slot: "arma",      raridade: "raro", precoBase: 220, bonus: { inteligencia: 6, mana: 3 } },
  { id: "g_elmo_vigia",     nome: "Elmo do Vigia",    slot: "capacete",  raridade: "raro", precoBase: 170, bonus: { resistencia: 4, destreza: 2 } },
  { id: "g_peitoral_runico", nome: "Peitoral Rúnico", slot: "armadura",  raridade: "raro", precoBase: 200, bonus: { resistencia: 5, vida: 2 } },
  { id: "g_talisma_corvo",  nome: "Talismã do Corvo", slot: "acessorio", raridade: "raro", precoBase: 190, bonus: { sorte: 3, carisma: 2 } },

  // ── ÉPICO ──
  { id: "g_montante_flamejante", nome: "Montante Flamejante",   slot: "arma",      raridade: "epico", precoBase: 800, bonus: { forca: 10, destreza: 4 } },
  { id: "g_grimorio_selado",     nome: "Grimório Selado",       slot: "arma",      raridade: "epico", precoBase: 800, bonus: { inteligencia: 10, mana: 5 } },
  { id: "g_coroa_estrategista",  nome: "Coroa do Estrategista", slot: "capacete",  raridade: "epico", precoBase: 700, bonus: { inteligencia: 5, carisma: 4 } },
  { id: "g_armadura_placas",     nome: "Armadura de Placas",    slot: "armadura",  raridade: "epico", precoBase: 780, bonus: { resistencia: 9, vida: 4 } },
  { id: "g_colar_destino",       nome: "Colar do Destino",      slot: "acessorio", raridade: "epico", precoBase: 750, bonus: { sorte: 5, carisma: 3 } },

  // ── LENDÁRIO ──
  { id: "g_lamina_aurora",  nome: "Lâmina Aurora",   slot: "arma",      raridade: "lendario", precoBase: 3000, bonus: { forca: 16, destreza: 8, agilidade: 4 } },
  { id: "g_cajado_vazio",   nome: "Cajado do Vazio", slot: "arma",      raridade: "lendario", precoBase: 3000, bonus: { inteligencia: 16, mana: 8 } },
  { id: "g_elmo_dragao",    nome: "Elmo do Dragão",  slot: "capacete",  raridade: "lendario", precoBase: 2600, bonus: { resistencia: 8, vida: 6, forca: 3 } },
  { id: "g_manto_estelar",  nome: "Manto Estelar",   slot: "armadura",  raridade: "lendario", precoBase: 2900, bonus: { resistencia: 14, vida: 7 } },
  { id: "g_anel_infinito",  nome: "Anel do Infinito", slot: "acessorio", raridade: "lendario", precoBase: 2800, bonus: { sorte: 8, carisma: 6 } },
];

export function semear(db) {
  let n = 0;
  for (const item of GENERICOS) {
    const existente = db.getItem(item.id);
    // não mexe em item que você já editou à mão
    if (existente && existente.origem !== "generico") continue;
    db.upsertItem({ ...item, origem: "generico" });
    n++;
  }
  return n;
}
