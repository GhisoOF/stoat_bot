
// Tira acentos, baixa a caixa e unifica separadores.
function normalizar(txt) {
  return String(txt ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Nome legível a partir do ID IANA: "America/Sao_Paulo" → "Sao Paulo".
export function cidadeDoFuso(zona) {
  const parte = String(zona).split("/").pop() ?? zona;
  return parte.replace(/_/g, " ");
}

const APELIDOS = {
  "sp": "America/Sao_Paulo",
  "sampa": "America/Sao_Paulo",
  "brasilia": "America/Sao_Paulo",
  "brasil": "America/Sao_Paulo",
  "rio": "America/Sao_Paulo",
  "rio de janeiro": "America/Sao_Paulo",
  "nova york": "America/New_York",
  "nova iorque": "America/New_York",
  "ny": "America/New_York",
  "nyc": "America/New_York",
  "eua": "America/New_York",
  "la": "America/Los_Angeles",
  "california": "America/Los_Angeles",
  "espanha": "Europe/Madrid",
  "portugal": "Europe/Lisbon",
  "lisboa": "Europe/Lisbon",
  "japao": "Asia/Tokyo",
  "toquio": "Asia/Tokyo",
  "japan": "Asia/Tokyo",
  "alemanha": "Europe/Berlin",
  "berlim": "Europe/Berlin",
  "franca": "Europe/Paris",
  "inglaterra": "Europe/London",
  "reino unido": "Europe/London",
  "londres": "Europe/London",
  "italia": "Europe/Rome",
  "roma": "Europe/Rome",
  "mexico": "America/Mexico_City",
  "cidade do mexico": "America/Mexico_City",
  "argentina": "America/Argentina/Buenos_Aires",
  "buenos aires": "America/Argentina/Buenos_Aires",
  "chile": "America/Santiago",
  "china": "Asia/Shanghai",
  "pequim": "Asia/Shanghai",
  "xangai": "Asia/Shanghai",
  "india": "Asia/Kolkata",
  "australia": "Australia/Sydney",
  "sidney": "Australia/Sydney",
  "canada": "America/Toronto",
  "utc": "UTC",
  "gmt": "UTC",
  // Estados e capitais do Brasil (1 out 2026: "que horas são em Goiás?" não
  // achava nada e o modelo chutou "dezessete horas"). A maior parte segue o
  // horário de Brasília; o Norte e o Centro-Oeste têm fusos próprios.
  "goias": "America/Sao_Paulo", "goiania": "America/Sao_Paulo",
  "distrito federal": "America/Sao_Paulo", "df": "America/Sao_Paulo",
  "sao paulo": "America/Sao_Paulo", "minas gerais": "America/Sao_Paulo", "minas": "America/Sao_Paulo", "belo horizonte": "America/Sao_Paulo", "bh": "America/Sao_Paulo",
  "espirito santo": "America/Sao_Paulo", "vitoria": "America/Sao_Paulo",
  "parana": "America/Sao_Paulo", "curitiba": "America/Sao_Paulo",
  "santa catarina": "America/Sao_Paulo", "florianopolis": "America/Sao_Paulo",
  "rio grande do sul": "America/Sao_Paulo", "porto alegre": "America/Sao_Paulo",
  "bahia": "America/Bahia", "salvador": "America/Bahia",
  "pernambuco": "America/Recife", "recife": "America/Recife",
  "paraiba": "America/Fortaleza", "joao pessoa": "America/Fortaleza",
  "ceara": "America/Fortaleza", "fortaleza": "America/Fortaleza",
  "rio grande do norte": "America/Fortaleza", "natal": "America/Fortaleza",
  "piaui": "America/Fortaleza", "teresina": "America/Fortaleza",
  "alagoas": "America/Maceio", "maceio": "America/Maceio",
  "sergipe": "America/Maceio", "aracaju": "America/Maceio",
  "maranhao": "America/Fortaleza", "sao luis": "America/Fortaleza",
  "para": "America/Belem", "belem": "America/Belem",
  "amapa": "America/Belem", "macapa": "America/Belem",
  "tocantins": "America/Araguaina", "palmas": "America/Araguaina",
  "amazonas": "America/Manaus", "manaus": "America/Manaus",
  "roraima": "America/Boa_Vista", "boa vista": "America/Boa_Vista",
  "rondonia": "America/Porto_Velho", "porto velho": "America/Porto_Velho",
  "mato grosso": "America/Cuiaba", "cuiaba": "America/Cuiaba",
  "mato grosso do sul": "America/Campo_Grande", "campo grande": "America/Campo_Grande",
  "acre": "America/Rio_Branco", "rio branco": "America/Rio_Branco",
  "fernando de noronha": "America/Noronha", "noronha": "America/Noronha",
  "madri": "Europe/Madrid", "madrid": "Europe/Madrid",
};

let _zonas = null;
function zonas() {
  if (!_zonas) {
    try { _zonas = Intl.supportedValuesOf("timeZone"); }
    catch { _zonas = ["UTC"]; }   // runtime sem ICU completo: ao menos não quebra
  }
  return _zonas;
}

export function buscarFuso(termo) {
  const alvo = normalizar(termo);
  if (!alvo) return { exato: null, candidatos: [] };

  // 1) apelido conhecido
  if (APELIDOS[alvo]) return { exato: APELIDOS[alvo], candidatos: [] };

  const lista = zonas();

  if (/[\/,]/.test(alvo) && !lista.some((z) => normalizar(z) === alvo)) {
    for (const pedaco of alvo.split(/[\/,]/).map((p) => p.trim()).filter(Boolean)) {
      const r = buscarFuso(pedaco);
      if (r.exato) return r;
    }
  }

  // 2) ID IANA digitado por inteiro ("America/Sao_Paulo")
  const idExato = lista.find((z) => normalizar(z) === alvo);
  if (idExato) return { exato: idExato, candidatos: [] };

  // 3) cidade idêntica ("sao paulo" → America/Sao_Paulo)
  const porCidade = lista.filter((z) => normalizar(cidadeDoFuso(z)) === alvo);
  if (porCidade.length === 1) return { exato: porCidade[0], candidatos: [] };
  if (porCidade.length > 1) return { exato: null, candidatos: porCidade };

  const começa = lista.filter((z) => normalizar(cidadeDoFuso(z)).startsWith(alvo));
  if (começa.length === 1) return { exato: começa[0], candidatos: [] };
  if (começa.length > 1) return { exato: null, candidatos: começa.slice(0, 10) };

  // 5) qualquer parte do ID contém o termo
  const contem = lista.filter((z) => normalizar(z).includes(alvo));
  if (contem.length === 1) return { exato: contem[0], candidatos: [] };
  return { exato: null, candidatos: contem.slice(0, 10) };
}

/** Confere se um ID IANA é utilizável neste runtime. */
export function fusoValido(zona) {
  try { new Intl.DateTimeFormat("en", { timeZone: zona }); return true; }
  catch { return false; }
}

/**
 * Hora atual de um fuso, já formatada.
 * @returns {{hora, data, diaSemana, offset, offsetMin}}
 */
export function agoraEm(zona, { lang = "pt", formato24 = true, quando = new Date() } = {}) {
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const hora = new Intl.DateTimeFormat(locale, {
    timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: !formato24,
  }).format(quando);
  const data = new Intl.DateTimeFormat(locale, {
    timeZone: zona, day: "2-digit", month: "2-digit",
  }).format(quando);
  const diaSemana = new Intl.DateTimeFormat(locale, {
    timeZone: zona, weekday: "short",
  }).format(quando).replace(/\.$/, "");

  // Offset em minutos: compara o mesmo instante lido no fuso e em UTC.
  const emZona = new Date(quando.toLocaleString("en-US", { timeZone: zona }));
  const emUtc  = new Date(quando.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMin = Math.round((emZona - emUtc) / 60000);

  const sinal = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const offset = `UTC${sinal}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;

  return { hora, data, diaSemana, offset, offsetMin };
}

/** Diferença legível entre dois fusos ("3h à frente", "mesma hora"). */
export function diferenca(zonaA, zonaB, lang = "pt", quando = new Date()) {
  const a = agoraEm(zonaA, { quando }).offsetMin;
  const b = agoraEm(zonaB, { quando }).offsetMin;
  const d = a - b;
  if (d === 0) return lang === "en" ? "same time" : "mesma hora";
  const h = Math.floor(Math.abs(d) / 60);
  const m = Math.abs(d) % 60;
  const dur = m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
  if (lang === "en") return d > 0 ? `${dur} ahead` : `${dur} behind`;
  return d > 0 ? `${dur} à frente` : `${dur} atrás`;
}
