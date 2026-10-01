// O catálogo do RPG em inglês (1 out 2026).
//
// Missões, itens, magias, companheiros, raridades e dificuldades nasceram só
// em português — num servidor em inglês, a ficha vinha em inglês e a missão
// "Descer ao Poço sem Fundo" no meio dela. Em vez de espalhar `nomeEN` por
// 3.400 linhas, o jogo passa cada mensagem por aqui antes de enviar (um ponto
// só: o sendEmbed do &game). Itens e companheiros CURADOS pelo dono do bot
// ficam como ele escreveu.

export const EN = {
  // ── missões ──
  "Entregar Encomendas": "Deliver Parcels",
  "Levar pacotes de um lado a outro do mercado. Ninguém morre carregando caixa.": "Carry parcels from one end of the market to the other. Nobody dies carrying a box.",
  "Organizar o Estoque": "Sort the Stockroom",
  "O ferreiro perdeu a conta dos lingotes. De novo.": "The blacksmith lost count of the ingots. Again.",
  "Ajudar na Taverna": "Help at the Tavern",
  "Servir, limpar, ouvir histórias repetidas. Pagam em moeda e paciência.": "Serve, clean, hear the same stories again. Paid in coin and patience.",
  "Cuidar dos Cavalos": "Tend the Horses",
  "Alimentar, escovar, fingir que não pisou onde não devia.": "Feed, brush, pretend you didn't step where you shouldn't have.",
  "Limpar os Ratos do Porão": "Clear the Cellar Rats",
  "São ratos. Grandes, mas ratos.": "They're rats. Big ones, but rats.",
  "Espantar Goblins da Estrada": "Drive the Goblins off the Road",
  "Cobram pedágio numa ponte que nem é deles.": "They charge a toll on a bridge that isn't even theirs.",
  "Colher Ervas na Mata Rasa": "Gather Herbs in the Shallow Woods",
  "A mata é rasa. O que vive nela, nem tanto.": "The woods are shallow. What lives in them, not so much.",
  "Caçar o Lobo Branco": "Hunt the White Wolf",
  "Já levou três rebanhos. E dois caçadores.": "It has taken three herds already. And two hunters.",
  "Explorar a Cripta Submersa": "Explore the Sunken Crypt",
  "A água subiu, mas o que estava lá dentro não saiu.": "The water rose, but what was inside never left.",
  "Escoltar a Caravana de Sal": "Escort the Salt Caravan",
  "Três dias de estrada. Alguém sempre observa.": "Three days on the road. Someone is always watching.",
  "Descer ao Poço sem Fundo": "Descend the Bottomless Well",
  "Tem fundo. Ninguém voltou para confirmar.": "It has a bottom. Nobody came back to confirm.",
  "Enfrentar o Guardião de Pedra": "Face the Stone Guardian",
  "Não dorme, não come, não negocia.": "It doesn't sleep, doesn't eat, doesn't bargain.",
  "Invadir o Ninho da Serpente": "Raid the Serpent's Nest",
  "O ninho é quente por um motivo.": "The nest is warm for a reason.",
  // ── dificuldade e raridade ──
  "Fácil": "Easy", "Médio": "Medium", "Difícil": "Hard",
  "Comum": "Common", "Incomum": "Uncommon", "Raro": "Rare", "Épico": "Epic", "Lendário": "Legendary",
  // ── itens ──
  "Adaga Simples": "Simple Dagger", "Espada de Ferro": "Iron Sword", "Cajado Rachado": "Cracked Staff",
  "Elmo Amassado": "Dented Helm", "Túnica Puída": "Threadbare Tunic", "Amuleto Opaco": "Dull Amulet",
  "Espada Temperada": "Tempered Sword", "Bordão Rúnico": "Runic Quarterstaff", "Elmo de Bronze": "Bronze Helm",
  "Cota de Malha": "Chainmail", "Anel de Prata": "Silver Ring", "Lâmina do Vento": "Wind Blade",
  "Cetro de Cristal": "Crystal Scepter", "Elmo do Vigia": "Watchman's Helm", "Peitoral Rúnico": "Runic Breastplate",
  "Talismã do Corvo": "Raven Talisman", "Montante Flamejante": "Flaming Greatsword", "Grimório Selado": "Sealed Grimoire",
  "Coroa do Estrategista": "Strategist's Crown", "Armadura de Placas": "Plate Armor", "Colar do Destino": "Necklace of Fate",
  "Lâmina Aurora": "Dawn Blade", "Cajado do Vazio": "Void Staff", "Elmo do Dragão": "Dragon Helm",
  "Manto Estelar": "Starry Mantle", "Anel do Infinito": "Ring of Infinity",
  // ── magias ──
  "Faísca": "Spark", "Flecha Ígnea": "Fire Arrow", "Lança de Gelo": "Ice Lance", "Tempestade": "Storm",
  "Juízo Final": "Final Judgment", "Escudo Menor": "Lesser Shield", "Cura": "Heal", "Barreira Arcana": "Arcane Barrier",
  "Regeneração": "Regeneration", "Intervenção Divina": "Divine Intervention",
  "Golpe Certeiro": "True Strike", "Muralha": "Bulwark", "Lança Arcana": "Arcane Lance", "Bênção": "Blessing",
  // ── companheiros e classes ──
  "Mercenário Novato": "Rookie Mercenary", "Aprendiz de Magia": "Magic Apprentice", "Guarda Bisonho": "Green Guard",
  "Curandeira Errante": "Wandering Healer", "Batedor Silencioso": "Silent Scout", "Escriba Rúnico": "Runic Scribe",
  "Sentinela do Muro": "Wall Sentinel", "Bardo de Estrada": "Road Bard", "Espadachim das Cinzas": "Ash Swordsman",
  "Vidente do Lago": "Lake Seer", "Couraceiro de Ferro": "Iron Cuirassier", "Alquimista Viajante": "Traveling Alchemist",
  "Lâmina Juramentada": "Sworn Blade", "Arquimago Exilado": "Exiled Archmage", "Baluarte Silente": "Silent Bastion",
  "Oráculo de Bronze": "Bronze Oracle", "Ceifador de Auroras": "Reaper of Dawns", "Tecelão do Vazio": "Void Weaver",
  "O Inabalável": "The Unshakable", "Estrela Cadente": "Falling Star",
  "Combatente": "Fighter", "Mago": "Mage", "Suporte": "Support",
  "dano físico": "physical damage", "resistência": "resilience", "dano mágico": "magic damage", "sorte e carisma": "luck and charisma",
  // ── atributos (a ficha usava o rótulo em português mesmo em inglês) ──
  "Força": "Strength", "Destreza": "Dexterity", "Resistência": "Resistance", "Agilidade": "Agility",
  "Vida": "Health", "Inteligência": "Intelligence", "Sorte": "Luck", "Carisma": "Charisma",
  // ── palavras soltas que escapavam ──
  "nada": "nothing", "magia": "spell",
  // ── moedas do mundo ──
  "Ouro": "Gold", "Cristal": "Crystal",
};

// Os mais longos primeiro ("Lança Arcana" antes de "Lança"); só palavra inteira.
const ORDEM = Object.keys(EN).sort((a, b) => b.length - a.length);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${ORDEM.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "gu");

export function traduzirTexto(texto) {
  if (typeof texto !== "string" || !texto) return texto;
  // `código` fica como está (ids, comandos, nomes digitáveis)
  return texto.split(/(`[^`\n]*`)/).map((parte, i) => (i % 2 ? parte : parte.replace(RE, (m) => EN[m] ?? m))).join("");
}

export function traduzirEmbed(e) {
  if (!e || typeof e !== "object") return e;
  return {
    ...e,
    title: traduzirTexto(e.title),
    description: traduzirTexto(e.description),
    ...(Array.isArray(e.fields) ? { fields: e.fields.map((f) => ({ ...f, name: traduzirTexto(f.name), value: traduzirTexto(f.value) })) } : {}),
  };
}

// O caminho de volta: quem joga em inglês digita "Iron Sword" — o jogo procura
// pelo nome em português. Só os argumentos (o subcomando fica como está).
const PT = Object.fromEntries(Object.entries(EN).map(([pt, en]) => [en.toLowerCase(), pt]));
const ORDEM_EN = Object.keys(PT).sort((a, b) => b.length - a.length);
const RE_EN = new RegExp(`(?<![\\p{L}\\p{N}])(?:${ORDEM_EN.map(esc).join("|")})(?![\\p{L}\\p{N}])`, "giu");
export function argsParaPortugues(args) {
  if (!Array.isArray(args) || args.length < 2) return args;
  const resto = args.slice(1).join(" ").replace(RE_EN, (m) => PT[m.toLowerCase()] ?? m);
  return [args[0], ...resto.split(/\s+/).filter(Boolean)];
}
