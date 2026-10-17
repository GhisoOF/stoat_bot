import LEXICO_EXTRA from "./lexico-extra.js";

const LEX_SCAM = [
  /\bfree\s*(nitro|robux|vbucks|gift|steam|skins?)\b/i,
  /\b(nitro|robux|vbucks|skins?)\s*(gr[áa]tis|free)\b/i,
  /\bgift\s*cards?\b/i,
  /\b(lucro|retorno|renda|ganho)s?\s+(garantid\w+|extra|f[áa]cil|di[áa]ri\w+)/i,
  /\bdobr\w+\s+(o\s+|seu\s+)?dinheiro/i,
  /\bganh\w+\s+(dinheiro|muito|r\$|\$|\d)/i,
  /\b(investimento|invista|trader|trading|sinais?\s+de\s+trade)\b/i,
  /\bdouble\s+your\s+(money|crypto|bitcoin|btc)\b/i,
  /\b(renda\s+extra|dinheiro\s+r[áa]pido|money\s+fast|quick\s+cash)\b/i,
  // 15 out 2026 — o golpe do "monetize suas contas de IA" passou com nota 3:
  // "generate profit", "earning over $2,000 per month", "can be monetized"
  /\b(earn|earning|earned|make|making|generate|generating|ganh\w+|fatur\w+|ger(ar|ando|e)|lucr\w+)\s+(over\s+|up\s+to\s+|more\s+than\s+|at\s+least\s+|mais\s+de\s+|at[ée]\s+|uns\s+)?(\$|€|£|r\$|\d|money|profit|income|cash|lucro|renda|dinheiro)/i,
  /(\$|€|£|r\$|usd|\b\d+\s*k)\s?[\d.,]*\s*(\+\s*)?(per|a|an|every|\/|por|ao|na|todo)\s*(month|week|day|mo|wk|hour|m[êe]s|semana|dia|hora)\b/i,
  /\bmonetiz\w+|\bmonetiza[çc][ãa]o\b|\bmonetizar\b/i,
  /\b(passive\s+income|renda\s+passiva|side\s+income|financial\s+freedom|liberdade\s+financeira)\b/i,
  /\b(i'?m|i\s+am|eu)\s+(already\s+|j[áa]\s+)?(earning|making|ganho|ganhando|faturo|faturando|lucro|lucrando)\b/i,
  // 17 out 2026 (bateria): golpe em espanhol não tinha vocabulário nenhum, e o
  // "dobra seu pix" / "double your crypto" escapava da forma escrita acima
  /\bdobr\w+\s+(o\s+|a\s+|seu\s+|sua\s+|teu\s+|tua\s+|tudo\s+)?(pix|grana|dinheiro|investimento|valor|saldo|cripto)\b/i,
  /\b(double|triple)s?\s+(up\s+)?(your|ur|my|the)?\s*(money|crypto|coins|cash|investment|btc|bitcoin|balance|robux)\b/i,
  /\b(duplic|triplic)\w*\s+(tu\s+|la\s+|el\s+|tus\s+)?(dinero|pasta|inversi[óo]n|bizum|cripto|saldo|euros)\b/i,
  /\b(guaranteed|garantid\w+|garantizad\w+)\s+(profit|returns?|income|money|gains?|win|lucro|retorno|renda|ganancias?|ingresos?|beneficios?|rentabilidad)\b/i,
  /\b(profit|returns?|income|gains?|ganancias?|ingresos?|beneficios?|rentabilidad|inversi[óo]n)\s+(is\s+|are\s+)?(guaranteed|garantizad\w+)\b/i,
  /\b(easy\s+money|dinero\s+f[áa]cil|pasta\s+f[áa]cil|ganar\s+dinero|gana\s+dinero|ganar\s+pasta)\b/i,
  /\b(invest|invierte|invertir|inviertes|investe|invista|aplica)\s+(here|now|in\s+this|aqu[íi]|ya|ahora|agora|nisso|aqui)(?![a-z0-9_])/i,   // \b não funciona depois de "í"
  /\b(no\s+risk|risk[\s-]free|sin\s+riesgo|sem\s+risco)\b/i,
  /\b(regalo|tarjetas?\s+regalo)\s+(gratis|de\s+\d+)\b/i,
  // o brinde com o "grátis" mais longe: "o nitro é grátis", "robux de graça", "nitro is free"
  /\b(nitro|robux|vbucks|skins?|gift\s*cards?)\b[^.!?\n]{0,15}\b(gr[áa]tis|free|de\s+gra[çc]a|regalad\w+)/i,
  /\b(te\s+doy|te\s+dou|i'?ll\s+give\s+you)\s+(el\s+|o\s+)?(doble|dobro|double|triple|triplo)\b/i,
  // 2ª rodada da bateria (17 out 2026): o brinde oferecido em espanhol
  /\b(te|os|les)\s+(regalo|regalamos|doy|damos|mando|mandamos|paso|pasamos)\s+(\S+\s+){0,3}(nitro|robux|vbucks|skins?|euros|pasta|dinero|tarjetas?\s+regalo)\b/i,
  /\b(premio|regalo|sorteo)\s+(de\s+)?(\S+\s+){0,2}(nitro|robux|vbucks|skins?|tarjeta\s+regalo)\b/i,
  /\b(ganar|gana|ganas|ganar[áa]s|ganamos)\s+(miles\s+de\s+|un\s+mont[óo]n\s+de\s+|\d+[\d.,]*\s*)(euros|€|pasta|dinero|pavos)\b/i,
  /\b(te|os)\s+garantiz\w+/i,
  // 3ª rodada da bateria (17 out 2026): a moeda de jogo prometida em
  // quantidade ("ganhar mil robux", "500 robux", "robux milhão") e o dinheiro
  // que "dobra em uma semana" / "duplica en 10 minutos" / "doubles by tomorrow"
  /\b(robux|v-?bucks|nitro|gems)\s+(milh[ãa]o|infinit\w+|ilimitad\w+|unlimited|f[áa]cil|easy|na\s+hora|al\s+instante|for\s+life|pra\s+vida\s+(toda|inteira)|de\s+por\s+vida|para\s+siempre)\b/i,
  /\b(ganh\w+|ganar|gana|ganas|get|win|claim|recibe|reciba|receba|receber|regal\w+|dando|giving|give\s+away|giveaway|te\s+dan|te\s+d[ãa]o)\s+(\S+\s+){0,2}(robux|v-?bucks|nitro|gems)\b/i,
  /\b(dobr\w+|duplic\w+|doubl\w+|tripl\w+|\d+x)\s+(\S+\s+){0,3}(em|en|in|by|within|at[ée]|hasta|overnight|da\s+noite\s+pro\s+dia)\s+(\S+\s+){0,2}(minut\w+|hora\w*|hours?|hrs?|\d+\s*h|d[íi]as?|days?|semana\w*|weeks?|tomorrow|amanh[ãa]|ma[ñn]ana|friday|sexta|viernes|fin\s+de\s+semana|fim\s+de\s+semana|weekend)\b/i,
  /\b(\d+x|10x|100x)\s+(by|in|em|en|at[ée])\b/i,
  /\b(easy|quick|fast)\s+(cash|money|profit|bucks)\b|\bguaranteed\s+(\S+\s+){0,2}(return|profit|payout)s?\b/i,
  /\b(get|receive|claim|receber|recibir|ganhar|ganar)\s+(that\s+|your\s+|the\s+|tu\s+|o\s+|el\s+|seu\s+|sua\s+)?(big\s+|grande\s+)?(reward|prize|premio|pr[êe]mio|recompensa|payout)\b/i,
];

// CTA / contato fora da plataforma / pagamento / phishing
const LEX_CTA = [
  /\b(whats\s*app|telegram|t\.me\/|wa\.me\/)\b/i,
  /\bcham\w+\s+(no|na)\s+(whats|zap|telegram|dm|pv|inbox|priv)/i,
  /\b(me\s+)?(chama|chame|cham|chamar)\s+(na\s+)?(dm|pv|inbox|priv)/i,
  /\b(dm|inbox|pm)\s+me\b/i,
  /\bpix\b/i,
  /\b(deposit\w*|transfir\w*|envie?\s*(r\$|\$|\d))/i,
  /\bverifi\w+\s+(sua\s+)?conta\b/i,
  /\bsua\s+conta\s+(foi|ser[áa]|est[áa])\b/i,
  /\bconta\s+(suspens|bloquead|banid)/i,
  /\b(clique|click)\s+(aqui|here|para|to)\b/i,
  /\b(login|senha|password|verify\s+your\s+account)\b/i,
  // inglês (13 out 2026): o golpe do "nitro grátis" em servidor em inglês
  /\b(claim|redeem)\s+(your|it|now|here|the|this)\b/i,
  // 15 out 2026: o convite para o privado, em inglês e português
  /\b(send|drop|shoot)\s+me\s+(a\s+)?(dm|pm|message|msg|text)\b/i,
  /\b(message|text|contact|reach|hit\s+up)\s+me\b/i,
  /\b(if|whoever)\s+(you\s+are|you'?re|is|are)\s+interest(ed)?\b/i,
  /\b(se\s+(tiver|tem|estiver)\s+interess\w+|quem\s+(tiver\s+)?interess\w+|interessad[oa]s?\s+(me\s+)?(chama|chamem|mand\w+))/i,
  // 17 out 2026 (bateria): espanhol e o "link na bio"
  /\b(haz\s+clic|hacer\s+clic|haced\s+clic|hac[ée]is\s+clic|pincha|pinchad|pulsa)\s+(aqu[íi]|en\s+el\s+enlace|el\s+enlace)(?![a-z0-9_])/i,
  /\b(escr[íi]beme|h[áa]blame|mand[áa]me\s+un\s+mensaje)\b|\bpor\s+(md|privado|dm)\b/i,
  /\b(click|hit|tap|open)\s+(on\s+)?(this|the|my)\s+link\b/i,
  /\blink\s+(in|na|en\s+la)\s+(bio|descri[çc][ãa]o)\b/i,
  // 3ª rodada (17 out 2026): "clicar nesse link", "só clica e ganha", "si haces clic"
  /\b(clica|clicar|clicka|clicke|clique)\s+(aqui|n?esse\s+link|n?este\s+link|no\s+link|e\s+(ganha|pega|resgata))\b/i,
  /\b(si\s+)?(haces|hagas|hac[ée]is)\s+clic\b|\bsi\s+clicas\b/i,
];

// Pedido de dados de pagamento/conta da vítima — "me manda sua conta pra
// receber", "send your bank info", "dame tus datos" (17 out 2026, bateria).
// Sozinho é um sinal de contato; junto de brinde ou promessa de dinheiro,
// é o golpe inteiro (conj_golpe_dados).
const LEX_PEDIDO_DADOS = [
  /\b(send|give|share|drop|need|dm)\s+(me\s+)?(your|ur)\s+(bank|banking|card|credit\s+card|paypal|wallet|email|password|login|account|seed\s+phrase|cashapp|venmo)\b/i,
  /\b(me\s+)?(manda|mande|passa|passe|envia|envie|d[áa])\s+(a\s+|o\s+|sua\s+|seu\s+|tua\s+|teu\s+)?(conta|pix|chave\s+pix|senha|cart[ãa]o|cpf|e-?mail|dados)\b/i,
  /\b(dame|p[áa]same|env[íi]ame|m[áa]ndame|danos|pasadme)\s+(tu\s+|tus\s+|la\s+|el\s+|los\s+)?(cuenta|datos|contrase[ñn]a|tarjeta|bizum|correo|clave|iban)\b/i,
  // "tem que mandar sua conta", "tienes que dar tu email", "you just need to enter your card"
  /\b(tem\s+que|tens\s+que|precisa|s[óo]\s+precisa)\s+(mandar|passar|dar|colocar|informar|enviar)\s+(a\s+|o\s+|sua\s+|seu\s+)?(conta|pix|senha|e-?mail|dados|cart[ãa]o|cpf)\b/i,
  /\b(tienes\s+que|ten[ée]is\s+que|solo\s+tienes\s+que|necesito|hay\s+que)\s+(dar|meter|poner|pasar|mandar|enviar)\s+(tu\s+|tus\s+|el\s+|la\s+|la\s+tuya)?\s*(cuenta|e-?mail|correo|datos|clave|tarjeta|bizum|contrase[ñn]a)\b/i,
  /\b(si\s+me\s+pasas|me\s+das\s+el\s+bizum|p[áa]same\s+un\s+bizum)\b/i,
  // "si (me|le|nos) das tu email", "dale tu tarjeta", "si das tu cuenta del banco"
  /\b(si\s+)?(me\s+|le\s+|nos\s+)?(das|dais|dan|dale|dadle|d[ée]jame)\s+(tu|tus|vuestra|vuestro|la|el)\s+(cuenta|e-?mail|correo|datos|clave|tarjeta|bizum|contrase[ñn]a|paypal|iban|n[úu]mero)\b/i,
  /\b(if\s+you|just)\s+(give|send|drop|share|enter)\s+(me\s+|us\s+)?(your|ur)\s+(e-?mail|bank|card|password|paypal|account|wallet|details|info|login)\b/i,
  /\b(se\s+(voc[êe]|vc|tu)?\s*)(me\s+)?(passar|mandar|der|enviar|informar)\s+(a\s+|o\s+|sua\s+|seu\s+|teu\s+|tua\s+)?(conta|pix|chave|senha|e-?mail|dados|cart[ãa]o|cpf)\b/i,
  /\b(you\s+(have|need)\s+to|just\s+need\s+to|gotta|you\s+must)\s+(enter|give|send|drop|put\s+in|share)\s+(your|ur)\s+(e-?mail|bank|card|password|paypal|account|wallet|details|info)\b/i,
  /\b(confirma|confirmar|pon|poner|introduce|introducir|enter|confirm)\s+(tu\s+|la\s+|your\s+)?(cuenta|clave|contrase[ñn]a|tarjeta|direcci[óo]n\s+de\s+banco|datos\s+bancarios|email|password|bank\s+details?)\b/i,
];

// Urgência
const LEX_URGENCIA = [
  /\b(vagas\s+limitadas|[úu]ltim\w+\s+(vagas|chance)|por\s+tempo\s+limitado|promo[çc][ãa]o\s+rel[âa]mpago)\b/i,
  /\b(limited\s+time|act\s+now|hurry|s[óo]\s+hoje|agora\s+mesmo|corre)\b/i,
  /\b(before\s+it'?s\s+gone|first\s+\d+\s+(people|users|members)|expires?\s+(soon|today|in))\b/i,
];

// Marcadores de DISCUSSÃO/ALERTA/NEGAÇÃO — empurram a nota PARA BAIXO
const LEX_NEGACAO = [
  /\b(golpe|scam|fraude|phishing|f[áa]ke|estelionato|picaretagem)\b/i,
  /\b(cuidado|cuidem|denunci\w+|report\w*|alerta|aviso|be\s+careful|warning|suspeit\w+)\b/i,
  /\b(n[ãa]o\s+ca[íi]a|n[ãa]o\s+caiam|fui\s+v[íi]tima|quase\s+ca[íi]|tentaram\s+me|me\s+enganaram)\b/i,
  /\b(n[ãa]o\s+(comprem|cliquem|acessem|enviem)|evitem?|fujam?)\b/i,
  // 17 out 2026: quem AVISA em espanhol/inglês também não pode ser punido
  /\b(estafa|estafas|timo|trampa|engaño|enga[ñn]ar|fraudulent\w*|scammers?|beware|watch\s+out|ojo\s+con|no\s+(piqu[ée]is|caig[áa]is|hag[áa]is\s+clic)|don'?t\s+(click|fall\s+for|send))\b/i,
];

// +18 (pornografia)
const LEX_ADULTO = [
  /\bporn/i, /\b(xvideos|xnxx|hentai|onlyfans)\b/i,
  /\bnudes?\b/i, /\bnsfw\b/i, /\bpacks?\s+de\s+nudes?\b/i,
  /\b(conte[úu]do\s+adulto|\+18|18\+|putaria|novinha|camgirl)\b/i,
  /\b(free\s+porn|leaked?\s+nudes?|vazad[ao]s?)\b/i,
];

// Gore
const LEX_GORE = [
  /\b(gore|snuff|decapita\w+|esfaquea\w+|imagens\s+fortes|conte[úu]do\s+chocante)\b/i,
  /\bv[íi]deo\s+de\s+morte\b/i,
];

const LEX_GRAVE = [
  /\ball\s+ages\b/i,
  /\b(little|young|under-?age|pre-?teens?)\s+(girls?|boys?|kids?|ones?|teens?)\b/i,
  /\b(underage|jailbait|lolit[ao]|loli|shota|preteen|cunny|toddlercon|lolicon|shotacon)\b/i,
  /\b(cp|c[\W_]?p|childp)\b/i,
  /\b(brother|bro)\s*(and|&|\/|\+)\s*sister\b/i,
  /\b(mom|mother)\s*(and|&|\/|\+)\s*son\b/i,
  /\b(dad|father)\s*(and|&|\/|\+)\s*(daughter|son)\b/i,
  /\bincest\b/i,
  /\b(rape|estupro|abuso\s+(infantil|de\s+menor)|pedofil|pedô|pedo)\b/i,
  /\bfamily\s+(fun|content|vids?|videos?|collection)\b/i,
];

// A conta/identidade tem de ser a da vítima
const LEX_CONTA_ALHEIA = [
  /\b(usar|utilizar|usando|use|using|through|via)\s+(a\s+|o\s+|sua\s+|seu\s+|your\s+|the\s+)*\b(conta|account|perfil|profile|cadastro|identidade|identity)\b/i,
  /\b(sua|seu|your)\s+(conta|account|perfil|profile)\s+(do|de|no|na|of|on)?\s*(linkedin|upwork|fiverr|freelancer|paypal|wise|payoneer|binance|revolut|banc\w+|bank)/i,
  /\b(linkedin|upwork|fiverr|freelancer|payoneer|binance)\s+(account|conta|profile|perfil)\b/i,
  /\b(empresta\w*|alug\w+|ced[ae]r?|ceder)\s+(a\s+|o\s+|sua\s+|seu\s+)?(conta|perfil|cart[ãa]o|documento|cpf)/i,
  /\b(em|no)\s+(seu|teu)\s+nome\b/i, /\bin\s+your\s+name\b/i,
  /\byour\s+(identity|documents?|id|credentials?)\b/i,
  // 15 out 2026: "the AI accounts you aren't currently utilizing", "your AI accounts"
  /\b(accounts?|contas?)\s+(that\s+)?(you\s+aren'?t|you\s+are\s+not|you\s+don'?t|que\s+(voc[êe]|vc)\s+n[ãa]o)\s+(currently\s+|est[áa]\s+)?(using|utilizing|use|usa|usando)\b/i,
  /\b(your|sua?s?|seus?)\s+(ai|ia|chatgpt|openai|gpt|claude|gemini|midjourney|unused|inactive|old|antigas?|paradas?)\s+(accounts?|contas?)\b/i,
  /\b(seus?|suas?)\s+(documentos?|dados\s+banc\w+)\b/i,
];

// Divisão de lucro/receita
const LEX_DIVISAO_LUCRO = [
  /\b(divid\w+|split|share|sharing|reparti\w+|rachar)\s+(os\s+|o\s+|a\s+|the\s+|resulting\s+)*\b(lucro|ganho|receita|revenue|profit|earnings|income|comiss[ãa]o)/i,
  /\b(lucro|ganho|receita|revenue|profit|earnings|income)s?\b[^.\n]{0,40}\b(divid|split|shar|50\s*%|meio\s+a\s+meio)/i,
  /\b(50\/50|60\/40|70\/30|80\/20|40\/60|30\/70)\b/,
  /\b\d{1,3}\s*%\s*(do|dos|da|de|of|the)?\s*(lucro|ganho|receita|revenue|profit|earnings)/i,
  /\b(lucro|receita|revenue|profit|earnings)[^.\n]{0,30}\b\d{1,3}\s*%/i,
  /\b(te\s+dou|te\s+passo|fic\w+\s+com|voc[êe]\s+ganha|you\s+(get|keep|receive))\s*\d{1,3}\s*%/i,
  /\b\d{1,3}\s*%\s*(pra|para|for)\s+(voc[êe]|you|ti|si)(?![a-z])/i,
];

// Mula: o dinheiro passa pela conta da vítima
const LEX_MULA = [
  /\b(depositad\w+|deposited|transferid\w+|transferred|enviad\w+|sent|pago|paid|cai|cair[áa]?|entra|vai)\b[^.\n]{0,30}\b(na|no|para|pra|em|into|to)\s+(a\s+|sua|seu|your)\s*(conta|account)/i,
  /\b(recebe?r?|receive)\b[^.\n]{0,30}\b(pagamentos?|payments?|transfer\w+|dep[óo]sitos?)\b[^.\n]{0,25}\b(na\s+sua|em\s+sua|your)\s*(conta|account)/i,
  /\b(voc[êe]|you)\s+(vai|ir[áa]|will)?\s*(handle|gerenc\w+|administr\w+|cuidar?\w*|receb\w+|manage)\b[^.\n]{0,25}\b(o\s+)?(dinheiro|money|pagamento|payment|funds?)/i,
  /\b(money|dinheiro)\s*(management|handling|gest[ãa]o)\b/i,
  /\b(receb\w+\s+e\s+(repass|transfer|envi)\w+|receive\s+and\s+(forward|send|transfer|wire))/i,
  /\b(retir\w+|saque|withdraw)\b[^.\n]{0,25}\b(e\s+)?(envi|repass|transfer|send)/i,
  /\b(conta|account)\b[^.\n]{0,20}\b(pra|para|to)\s+(receber|recebimento|receive|collect)\b/i,
];

// Recrutamento sem barreira de entrada
const LEX_RECRUTAMENTO = [
  /\b(no|sem|nenhum\w*)\s+(technical\s+|prior\s+|pr[ée]via\s+)*(skills?|experience|experi[êe]ncia|conhecimento)\b[^.\n]{0,25}\b(required|needed|necess[áa]ri\w+|exigid\w+)?/i,
  /\b(looking\s+for|procur\w+|busc\w+|preciso\s+de|need)\b[^.\n]{0,25}\b(collaborator|partner|parceir\w+|colaborador\w*|s[óo]ci\w+|representante|agent|freelancer)/i,
  /\b(vaga|oportunidade|opportunity)\s+(de\s+)?(emprego|trabalho|home\s*office|remote|remoto)/i,
  /\b(trabalh\w+|work|renda)\s+(de\s+|em\s+|from\s+)?(casa|home|remoto|remote|meio\s+per[íi]odo|part[\s-]?time)\b/i,
  /\b(collaboration|colabora[çc][ãa]o)\s+(method|m[ée]todo|proposta)\b/i,
  // 15 out 2026: "If you collaborate with me, I can help you generate profit"
  /\b(collaborate|partner|team\s+up|work)\s+with\s+me\b/i,
  /\b(colabor\w+|trabalh\w+|parceria)\s+comigo\b/i,
  /\b(i\s+can|i'?ll|i\s+will|posso|vou)\s+(help|teach|show|te\s+ajudar|te\s+ensinar|ajudar\s+voc[êe]|ensinar\s+voc[êe])\b[^.\n]{0,25}\b(earn|make|generate|profit|income|money|ganhar|lucrar|faturar|dinheiro|renda)/i,
  /\b(online\s+freelancer|worked\s+as\s+an?\s+(online\s+)?freelancer|anos\s+de\s+experi[êe]ncia\s+(como|em)\s+freela)/i,
];

const LEX_PRETEXTO_CONTA = [
  /\b(the\s+)?reason\s+for\s+using\s+your\b/i,
  /\b(motivo|raz[ãa]o)\s+(de|para|por)\s+(usar|utilizar)\s+(a\s+)?sua\b/i,
  /\b(minha|my)\s+(conta|account|card|cart[ãa]o)\b[^.\n]{0,30}\b(bloquead|restrit|banid|suspens|limited|restricted|blocked|suspended|banned)/i,
  /\b(n[ãa]o\s+posso\s+usar\s+(a\s+)?minha|can'?t\s+use\s+my\s+own)\b/i,
  /\b(sal[áa]ri\w+|salaries|salary|pagamentos?|rates?)\b[^.\n]{0,40}\b(sua\s+regi[ãa]o|seu\s+pa[íi]s|your\s+region|your\s+country|higher\s+than)/i,
  /\b(in|na|no|em)\s+(your|sua|seu)\s+(region|regi[ãa]o|country|pa[íi]s)\b/i,
];

// Oferta de material (vende/troca/arquivos/provas)
const LEX_OFERTA = [
  /\b(selling|for\s+sale|buy|trade|trading|vendo|à?\s*venda)\b/i,
  /\b(files?|packs?|vids?|videos?|collection|folder|mega|proofs?|legit)\b/i,
  /\bhigh\s+quality\b/i, /\ball\s+kinds\b/i,
];

// Links por tipo (avaliados em ordem de prioridade)
const LINK_FILEHOST   = /\b(mega(\.nz)?|anonfiles|gofile|pixeldrain|mediafire|\w+\.pages\.dev|\w+\.(tk|ml|ga|cf|gq))\b/i;
// domínio que IMITA o Discord/Steam/Stoat ou anuncia "nitro/gift" num TLD barato
// (discord-gift.xyz, dlscord.app, steamcommunlty.com) — pesa como o de arquivo
const LINK_IMITACAO   = /\b(?:(?:disc[o0]rd|dlscord|d1scord|discrod|stoat)[\w-]*\.(?!com\b|gg\b|chat\b|app\b)[a-z]{2,}|steamcommun[l1]ty\.\w+|steamcomunity\.\w+|stearncommunity\.\w+|[\w-]*(?:nitro|gift)[\w-]*\.(?:xyz|ru|top|click|link|site|online|shop|live|gift|icu|cyou))\b/i;
const LINK_ENCURTADOR = /\b(bit\.ly|tinyurl|cutt\.ly|is\.gd|rb\.gy|t\.me|wa\.me|encurta|grabify|iplogger)\b/i;
const LINK_CONVITE    = /(?<![\w.@/-])(?:https?:\/\/)?(?:www\.)?(?:stt\.?gg|(?:app\.)?stoat\.chat\/invite)\/[A-Za-z0-9]+/i;
const LINK_SIMPLES    = /\bhttps?:\/\/|\bwww\./i;

// Afirmação/imperativo (verbo de oferta/ação) — sobe a nota
const AFIRMACAO = /\b(vendo|selling|sell|compre|buy|acesse|access|baixe|download|assine|subscribe|clique|click|entre|join)\b/i;
const PERGUNTA  = /\?/;

// ─── Ódio e ameaça violenta ─────────────────────────────────────────────────
//
// O raid de 27/09 passou INTEIRO pelo sentinela: injúria racial, ofensa a
// ciganos, "tem q voltar pra senzala", suástica em massa, "estuprar e matar",
// ataque a membros marcados pelo nome. A categoria simplesmente não existia —
// só o anti-duplicata disparou, pelas suásticas repetidas.
//
// Mesmo princípio do resto do arquivo: a palavra solta pesa pouco; o que
// condena é a CONJUNÇÃO. "a população negra", "os ciganos têm uma cultura
// rica", "o caso de estupro saiu no jornal" não podem virar punição — um
// grupo junto de um insulto, um "bando de <grupo>", "estuprar e matar", sim.

// Grupos alvo de ódio (a palavra sozinha é neutra).
let GRUPO = String.raw`(negr[oa]s?|negrinh[oa]s?|negr[aã]o|pret[oa]s?|pretinh[oa]s?|macac[oa]s?|cigan[oa]s?|ciganinh[oa]s?|calon|calom|judeus?|judias?|nordestin[oa]s?|para[ií]bas?|baian[oa]s?|ind[ií]gen[ao]s?|[ií]ndi[oa]s?|viad[oa]s?|viadinh[oa]s?|bichas?|bichinhas?|sap[aã]t[aã]o|sapat[oõ]es|travecos?|trans|gays?|l[ée]sbicas?)`;
// Palavras que só existem como ofensa (não precisam de contexto).
const LEX_INJURIA = [/\bnegr[oó]ides?\b/i, /\bviadinh[oa]s?\b/i, /\btravecos?\b/i, /\bciganinh[oa]s?\b/i];
// Insulto ou desprezo que, colado a um grupo, vira ódio.
let INSULTO = String.raw`(de\s+merda|filh[oa]s?\s+da\s+puta|imund[oa]s?|suj[oa]s?|nojent[oa]s?|lixos?|podres?|inferior(es)?|vsf|vai\s+se\s+fuder|vai\s+tomar\s+no\s+cu|tem\s+(que|q)\s+morrer|devia[m]?\s+morrer)`;
const odioConj = () => [
  new RegExp(String.raw`\b${GRUPO}\b[^.!?\n]{0,20}\b${INSULTO}`, "i"),   // "ciganos de merda"
  new RegExp(String.raw`\b${INSULTO}\b[^.!?\n]{0,20}\b${GRUPO}\b`, "i"),  // "vsf negros"
  new RegExp(String.raw`\bbando\s+de\s+${GRUPO}\b`, "i"),                 // desumaniza o grupo inteiro
];
const LEX_ODIO_CONJ = [
  ...odioConj(),
  /\bvolt(ar|a|em)\s+(pra|para\s+a)\s+senzala\b/i,
  /\bra[çc]a\s+(inferior|imunda|podre|de\s+merda)\b/i,
];
// Símbolos de ódio. 卍 também é símbolo budista; o peso vem da REPETIÇÃO.
const RE_SIMBOLO_ODIO = /[卐卍]|\bsieg\s*heil\b|\bheil\s*hitler\b|\b14\s*\/?\s*88\b|\bwhite\s+power\b/gi;
// Ameaça violenta: dois verbos de violência juntos, ou ameaça dirigida.
let VIOLENTO = String.raw`(estuprar|estrupar|matar|esfaquear|espancar|degolar|queimar|enforcar)`;
const ameacaConj = () => [
  new RegExp(String.raw`\b${VIOLENTO}\s+(e|pra|para|depois)\s+${VIOLENTO}\b`, "i"),   // "estuprar e matar"
  new RegExp(String.raw`\bvou\s+(te\s+)?${VIOLENTO}\s+(voc[êe]|vc|tu|sua\s+fam[ií]lia|seus?\s+filh)`, "i"),
];
const LEX_AMEACA = [
  ...ameacaConj(),
  new RegExp(String.raw`\bsei\s+onde\s+(voc[êe]|vc|tu)\s+mora\b`, "i"),
];

// ─── Dano a pessoas: desafios, humilhação, doxxing, extorsão ────────────────
//
// Existem comunidades que recrutam em servidores abertos para "desafios" que
// terminam em alguém se machucando, sendo humilhado ou exposto. Quem recruta
// raramente escreve uma frase que condene sozinha: o que denuncia é o PADRÃO.
//
// Por isso esta categoria funciona em duas camadas:
//   • numa mensagem só, bloqueia apenas o inequívoco — mandar alguém se
//     cortar, ameaçar vazar dados ou fotos;
//   • o resto (falar de desafio "no extremo", de humilhar, divulgar outra
//     comunidade) SOMA por pessoa ao longo das horas, e quem junta sinais
//     de categorias diferentes vira alerta para a staff (ver confianca.js).
//
// Cuidado que isto NÃO pode ter: tratar como agressor quem está pedindo ajuda.
// Falar de se machucar, sozinho, nunca pune e nunca alerta como recrutamento.

const LEX_AUTOLESAO = [
  /\b(se|me|te)\s+cort(ar|ando|ou|a|e|em)\b/i,
  /\bcort(ar|ando|ou)\s+(os\s+|o\s+|seus?\s+|meus?\s+)?(pulsos?|bra[çc]os?|pernas?)\b/i,
  /\bauto[\s-]?(mutila\w*|les[ãa]o|agress[ãa]o)\b/i,
  /\b(self[\s-]?harm|cut\s+(yourself|urself))\b/i,
];
const LEX_DESAFIO = [/\bdesafi(o|os|ar|a|e|ou)\b/i, /\bchallenges?\b/i];
const LEX_EXTREMO = [/\b(no|ao|at[ée]\s+o)\s+extremo\b/i, /\bat[ée]\s+o\s+limite\b/i];
const LEX_HUMILHACAO = [
  /\bpass(ar|ando|ou|a|e)\s+vergonha\b/i,
  /\bcomer\s+(merda|b[oó]sta|coc[ôo])\b/i,
  /\bhumilh(ar|ando|ou|a|e|a[çc][ãa]o)\b/i,
];
// "manda ela ..." / "obriga ele ..." — alguém dando ordem sobre OUTRA pessoa
const LEX_ORDEM_OUTRO = [
  /\b(manda|mande|mandar|obrig\w+|fa[çc]a|faz|bota|p[õo]e)\b[^.!?\n]{0,25}\b(ela|ele|eles|elas|voc[êe]|vc|algu[ée]m)\b/i,
];
const LEX_DADOS_PESSOAIS = [
  /\b(endere[çc]o|cpf|rg|telefone|celular|onde\s+mora|placa\s+do\s+carro)\b[^.!?\n]{0,25}\b(dele|dela|deles|delas|daquel\w+)\b/i,
];
const LEX_DOX = [/\bdox+(ing|ar|ei|ado|ada|aram)?\b/i];
const LEX_VAZAR = [
  /\b(vazar|vazo|vaza|vazei|expor|exponho|espalhar|espalho)\s+(tudo|as?\s+fotos?|suas?\s+fotos?|os\s+dados|seus?\s+dados|os\s+nudes?|seus?\s+nudes?|pra\s+todo\s+mundo|no\s+grupo|na\s+internet)\b/i,
];
const LEX_COERCAO = [
  /\bse\s+(voc[êe]\s+|vc\s+|tu\s+)?n[ãa]o\s+(fizer|mandar|pagar|obedecer|fazer)\b/i,
  /\bou\s+(eu\s+)?(vazo|exponho|espalho|posto|conto\s+pra)\b/i,
];
// Desprezo por gente vulnerável: não pesa na nota, só no padrão acumulado.
const LEX_DESPREZO = [/\bdoentes?\s+menta(l|is)\b/i, /\bretardad[oa]s?\b/i];

// ─── Vocabulário extra (lexico-extra.js) ────────────────────────────────────
// Texto vira frase literal, palavra inteira, sem diferenciar maiúsculas;
// RegExp vale como está. Grupos/insultos/violentos entram nas alternâncias das
// conjunções de ódio e ameaça (sozinhos continuam sem pesar).
const escapar = (x) => String(x).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
const comoRegex = (x) => x instanceof RegExp ? x
  : new RegExp(String.raw`(?<![\p{L}\p{N}])${escapar(x)}(?![\p{L}\p{N}])`, "iu");
const LISTAS_EXTRA = {
  golpe: LEX_SCAM, contato: LEX_CTA, pedidoDados: LEX_PEDIDO_DADOS, alerta: LEX_NEGACAO,
  gore: LEX_GORE, dadosPessoais: LEX_DADOS_PESSOAIS, vazar: LEX_VAZAR, coercao: LEX_COERCAO,
};
const alternancia = (base, extras) => {
  const novos = (extras ?? []).filter((x) => typeof x === "string" && x.trim()).map(escapar);
  return novos.length ? base.replace(/\)$/, `|${novos.join("|")})`) : base;
};
// Devolve quantos termos entraram. Chamada no carregamento com lexico-extra.js;
// os testes chamam com termos inventados.
export function aplicarLexicoExtra(extra = {}) {
  let n = 0;
  for (const [nome, lista] of Object.entries(LISTAS_EXTRA)) {
    for (const x of extra[nome] ?? []) {
      if (!(x instanceof RegExp) && !String(x ?? "").trim()) continue;
      lista.push(comoRegex(x)); n++;
    }
  }
  const g = (extra.grupos ?? []).length, i = (extra.insultos ?? []).length, v = (extra.violentos ?? []).length;
  if (g || i) {
    GRUPO = alternancia(GRUPO, extra.grupos); INSULTO = alternancia(INSULTO, extra.insultos);
    LEX_ODIO_CONJ.splice(0, 3, ...odioConj());
  }
  if (v) {
    VIOLENTO = alternancia(VIOLENTO, extra.violentos);
    LEX_AMEACA.splice(0, 2, ...ameacaConj());
  }
  return n + g + i + v;
}
aplicarLexicoExtra(LEXICO_EXTRA);

// Quanto cada sinal soma no PADRÃO de uma pessoa (confianca.js acumula).
// Autolesão sozinha pesa, mas não conta como "lado de quem agride".
export const PESO_DANO = {
  autolesao: 1, desafio: 0.5, humilhacao: 1, dados_pessoais: 1.5, dox: 2,
  vazar: 1.5, coercao: 1.5, desprezo: 0.5, link_convite: 1,
  injuria: 1.5, odio: 2, simbolo_odio: 1, ameaca: 2,
  conj_desafio_extremo: 1.5, conj_desafio_humilhacao: 1.5,
};
const LADO_AGRESSOR = new Set(["desafio", "humilhacao", "dados_pessoais", "dox",
  "vazar", "coercao", "desprezo", "link_convite", "injuria", "odio", "simbolo_odio", "ameaca"]);

export function danoDe(features) {
  let soma = 0;
  const categorias = [];
  for (const [k, peso] of Object.entries(PESO_DANO)) {
    if (!features[k]) continue;
    soma += peso * features[k];
    categorias.push(k);
  }
  return { soma, categorias, agressor: categorias.some((c) => LADO_AGRESSOR.has(c)) };
}

export const PESOS = {
  vies:            0,
  grave:           1.5,
  adulto:          1.5,
  gore:            2.5,
  scam:            1.5,
  oferta:          2,
  cta:             2,
  urgencia:        0.5,   // 12 out 2026: sinais de CONTEXTO pesam menos (mais suave)
  link_filehost:   2.5,
  link_encurtador: 2,
  link_convite:    1,
  link_simples:    0.5,
  mass_ping:       2.5,
  afirmacao:       0.5,
  pergunta:       -3,
  negacao:        -4,
  taxa_alta:       1,
  duplicata:       2,     // a MESMA mensagem, de novo (bot de propaganda)
  // dano a pessoas — sozinhos quase não pesam; o que condena são as conjunções
  autolesao:       1,
  desafio:         0.5,
  humilhacao:      1,
  dados_pessoais:  1.5,
  dox:             2,
  vazar:           1.5,
  coercao:         1.5,
  conj_desafio_autolesao:  6,   // mandar alguém se machucar
  conj_doxxing:            5,   // dados de uma pessoa + expor/ameaçar
  conj_extorsao:           5,   // "se não fizer" + vazar
  conj_desafio_extremo:    3.5,
  conj_desafio_humilhacao: 3,
  // link cujo texto visível esconde para onde vai: [texto](url)
  link_mascarado:  2,
  link_ofuscado:   1.5,
  // ódio e ameaça: a injúria sozinha pesa; a conjunção condena
  injuria:         3.5,   // sozinha não pune membro antigo (limiar 6); pune conta nova
  odio:            6,     // grupo + insulto, "bando de <grupo>", senzala…
  simbolo_odio:    2.5,   // por ocorrência, até 3 — uma parede de 卐 condena
  ameaca:          6,     // "estuprar e matar", "sei onde você mora"
  conj_topico_link: 2,          // golpe/+18/gore + link encurtado, de arquivo ou mascarado
  conj_grave_oferta:   6,  // grave + oferta = anúncio de material → topo
  conj_grave_contexto: 5,  // grave + link/cta/venda = contexto suspeito → alerta
  conj_topico_cta:     2,  // tópico proibido + contato = divulgação

  recrutamento:    1,
  conta_alheia:    1.5,
  divisao_lucro:   1.5,
  mula:            1.5,
  pretexto_conta:  1.5,
  conj_emprego_conta: 3,  // recrutamento/lucro + a conta tem de ser a SUA
  conj_mula_conta:    3,  // a conta é sua E o dinheiro passa por ela
  conj_pretexto_ganho: 3,  // "não posso usar a minha" + divisão/dinheiro
  conj_mula_ganho:     3,  // o dinheiro passa por você E é dividido
  conj_recrutamento_lucro: 3,  // "trabalhe comigo" + "dividimos o lucro" (15 out 2026)
  conj_ganho_recrutamento: 2,  // promessa de dinheiro + "trabalhe comigo"/"te ajudo a ganhar"
  pedido_dados:    1.5,   // "manda sua conta", "send your bank info" (17 out 2026)
  conj_golpe_dados: 3,    // brinde/promessa de dinheiro + pedido dos dados da vítima
};

const contar = (txt, lista, cap = 99) => {
  let n = 0;
  for (const re of lista) if (re.test(txt)) n++;
  return Math.min(n, cap);
};
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ─── Normalização: desfazer disfarces antes de pontuar ──────────────────────
//
// O sentinela olhava o texto CRU. Bastava escrever "g4nh3 d1nh31r0", separar
// as letras, enfiar um caractere invisível ou trocar um "a" latino por um "а"
// cirílico (idêntico na tela) para a nota cair de 8 para 0. A simulação em
// scripts/simular-automod.mjs mostrava 10 disfarces diferentes passando.
//
// Aqui o texto é trazido de volta para a forma que um humano LÊ. A detecção
// continua sendo a mesma de sempre; só deixou de ser enganável pela grafia.

const HOMOGLIFOS = {
  // cirílico → latino (as letras que são idênticas na tela)
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
  "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "һ": "h", "ӏ": "l", "ԛ": "q", "ԝ": "w",
  "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
  "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "І": "I", "Ј": "J", "Ѕ": "S",
  // grego → latino
  "α": "a", "ο": "o", "ρ": "p", "ν": "v", "τ": "t", "ι": "i", "κ": "k", "υ": "u",
  "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M",
  "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
  // latinos "estendidos" usados como disfarce
  "ɡ": "g", "ı": "i", "ʟ": "l", "ɴ": "n", "ʀ": "r", "ꜱ": "s",
};
const RE_HOMOGLIFO = new RegExp(`[${Object.keys(HOMOGLIFOS).join("")}]`, "g");
const LEET = { "4": "a", "@": "a", "3": "e", "1": "i", "!": "i", "0": "o", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g" };

export function normalizarParaAnalise(texto) {
  let t = String(texto ?? "");

  // letras "fancy" (𝐠𝐚𝐧𝐡𝐞, ｇａｎｈｅ) → normais
  t = t.normalize("NFKC");
  // invisíveis: espaço de largura zero, joiner, hífen suave, marca de direção
  t = t.replace(/[\u00AD\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "");
  // alfabetos que se passam por latino
  t = t.replace(RE_HOMOGLIFO, (c) => HOMOGLIFOS[c]);

  // link disfarçado: bit[.]ly · bit(.)ly · bit (ponto) ly · bit . ly / x
  t = t.replace(/\s*[\[\(\{]\s*(?:\.|dot|ponto)\s*[\]\)\}]\s*/gi, ".");
  t = t.replace(/([\p{L}\p{N}])\s+\.\s+([\p{L}\p{N}])/gu, "$1.$2");
  t = t.replace(/(\.[a-z]{2,})\s*\/\s*(\S)/gi, "$1/$2");

  // letras separadas por pontuação: g.a.n.h.e · p-a-c-k · w_h_a_t_s
  t = t.replace(/(?<![\p{L}\p{N}])\p{L}(?:[.\-_*·•]\p{L})+(?![\p{L}\p{N}])/gu,
    (m) => m.replace(/[.\-_*·•]/g, ""));
  // letras separadas por UM espaço (4+, para não juntar "e o a"): g a n h e
  t = t.replace(/(?<![\p{L}\p{N}])\p{L}(?: \p{L}){3,}(?![\p{L}\p{N}])/gu,
    (m) => m.replace(/ /g, ""));

  // leetspeak — só em palavra que MISTURA letras e números ("g4nh3", "n0").
  // Número puro (50, 2024), dinheiro ("R$50") e link ficam como estão. Este
  // texto só serve para pontuar e nunca é exibido, então "5g" virar "sg" não
  // estraga nada — e "n0" virar "no" é o que faz "chama n0 whats" ser pego.
  t = t.replace(/\S+/g, (tok) => {
    if (/[/:]/.test(tok)) return tok;
    if (/^(r\$|\$|€|£)/i.test(tok)) return tok;
    // quantidade com unidade: "100k", "24h", "10x", "5min" — é número, não leet
    if (/^\d+([.,]\d+)?(k|m|x|h|hrs?|min|mins|d|s)$/i.test(tok)) return tok;
    if (!/\p{L}/u.test(tok) || !/[0-9@$!]/.test(tok)) return tok;
    return tok.replace(/[4@31059$78!]/g, (c) => LEET[c] ?? c);
  });

  return t;
}

// Letras esticadas ("griiiátis", "cliiiique") não casam com nenhum padrão. A
// bateria de 17 out 2026 mostrou o disfarce passando em 99% dos casos. Juntar
// toda repetição numa letra só estraga palavra com letra dobrada de verdade
// ("free", "carro"), por isso analisarConteudo avalia as duas versões do texto
// e fica com a de nota maior.
const RE_ESTICADA = /(\p{L})\1{2,}/gu;

function extrairFeatures(texto, opts = {}) {
  const cru = texto ?? "";
  let t = normalizarParaAnalise(cru);
  if (opts.colapsar) t = t.replace(RE_ESTICADA, "$1");
  const f = {};

  // Link ofuscado: bit[.]ly, bit (ponto) ly, bit . ly — ninguém escreve
  // assim sem querer esconder o link de um filtro.
  if (/[\[\(\{]\s*(\.|dot|ponto)\s*[\]\)\}]/i.test(cru)
      || /[\p{L}\p{N}]\s+\.\s+(com|ly|gg|io|me|net|org|br|link|xyz|site|app)\b/iu.test(cru)) {
    f.link_ofuscado = 1;
  }
  // Link mascarado: o texto que aparece não mostra o domínio de destino.
  for (const m of cru.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi)) {
    const host = (m[2].match(/^https?:\/\/([^/]+)/i)?.[1] ?? "").toLowerCase();
    if (host && !m[1].toLowerCase().includes(host.replace(/^www\./, ""))) { f.link_mascarado = 1; break; }
  }

  f.grave   = contar(t, LEX_GRAVE, 2);
  f.adulto  = contar(t, LEX_ADULTO, 3);
  f.gore    = contar(t, LEX_GORE, 3);
  f.scam    = contar(t, LEX_SCAM, 3);
  f.oferta  = contar(t, LEX_OFERTA, 3);
  f.cta     = contar(t, LEX_CTA, 3);
  f.urgencia = contar(t, LEX_URGENCIA, 2);
  f.recrutamento   = contar(t, LEX_RECRUTAMENTO, 2);
  f.conta_alheia   = contar(t, LEX_CONTA_ALHEIA, 2);
  f.divisao_lucro  = contar(t, LEX_DIVISAO_LUCRO, 2);
  f.mula           = contar(t, LEX_MULA, 2);
  f.pretexto_conta = contar(t, LEX_PRETEXTO_CONTA, 2);
  f.pedido_dados   = contar(t, LEX_PEDIDO_DADOS, 1);

  f.autolesao      = contar(t, LEX_AUTOLESAO, 2);
  f.desafio        = contar(t, LEX_DESAFIO, 1);
  f.humilhacao     = contar(t, LEX_HUMILHACAO, 2);
  f.dados_pessoais = contar(t, LEX_DADOS_PESSOAIS, 1);
  f.dox            = contar(t, LEX_DOX, 1);
  f.vazar          = contar(t, LEX_VAZAR, 1);
  f.coercao        = contar(t, LEX_COERCAO, 1);
  f.desprezo       = contar(t, LEX_DESPREZO, 1);
  f.injuria        = contar(t, LEX_INJURIA, 1);
  f.odio           = contar(t, LEX_ODIO_CONJ, 1);
  f.simbolo_odio   = Math.min(3, (t.match(RE_SIMBOLO_ODIO) ?? []).length);
  f.ameaca         = contar(t, LEX_AMEACA, 1);

  // Tipo de link (apenas o de maior prioridade conta)
  if (LINK_FILEHOST.test(t) || LINK_IMITACAO.test(t)) f.link_filehost = 1;
  else if (LINK_ENCURTADOR.test(t)) f.link_encurtador = 1;
  else if (LINK_CONVITE.test(t))    f.link_convite = 1;
  else if (LINK_SIMPLES.test(t))    f.link_simples = 1;

  // Menção em massa + link = divulgação
  if (/@everyone|@here|@online/i.test(t) && LINK_SIMPLES.test(t)) f.mass_ping = 1;

  // Ato de fala
  const negacao = contar(t, LEX_NEGACAO) > 0;
  if (negacao) f.negacao = 1;
  if (PERGUNTA.test(t)) f.pergunta = 1;
  if (AFIRMACAO.test(t) || f.oferta > 0 || f.cta > 0) f.afirmacao = 1;

  // Taxa (mensagens/seg) — passada de fora
  if ((opts.rate ?? 1) >= 3) f.taxa_alta = 1;
  // Quantas vezes esta mesma mensagem já veio. Repetir texto idêntico é um
  // comportamento de máquina: sozinho não condena, mas soma com o resto.
  if ((opts.repetidas ?? 1) >= 2) f.duplicata = Math.min(3, opts.repetidas - 1);
  // ...e "sozinho não condena" agora é verdade (9 out 2026): só soma quando
  // há algum sinal de CONTEÚDO. Antes "Miguel miguel" 4× dava nota 6 e saía
  // como "conteúdo proibido" para quem tinha pouco XP. Repetir texto inocente
  // é com o anti-duplicata (que tem folga e o primeiro toque).
  if (f.duplicata) {
    const NEUTROS = new Set(["duplicata", "afirmacao", "cta", "taxa_alta", "pergunta", "negacao"]);
    const temConteudo = Object.entries(f).some(([k, v]) => v > 0 && !NEUTROS.has(k) && (PESOS[k] ?? 0) > 0);
    // Sem conteúdo suspeito, texto curto não soma nada; parede de texto
    // repetida (comportamento de bot — o caso do Stork) continua somando.
    if (!temConteudo && String(texto ?? "").length < 80) f.duplicata = 0;
  }

  // Conjunções (o "E" que o somatório linear sozinho não captura)
  const temContexto = (f.oferta > 0 || f.cta > 0 || f.link_filehost || f.link_encurtador || f.link_convite || f.link_simples || f.afirmacao > 0);
  if (f.grave > 0 && f.oferta > 0) f.conj_grave_oferta = 1;
  else if (f.grave > 0 && temContexto) f.conj_grave_contexto = 1;
  if ((f.adulto > 0 || f.gore > 0 || f.scam > 0) && (f.cta > 0 || f.oferta > 0)) f.conj_topico_cta = 1;

  if (f.conta_alheia > 0 && (f.recrutamento > 0 || f.divisao_lucro > 0)) f.conj_emprego_conta = 1;
  if (f.conta_alheia > 0 && (f.mula > 0 || f.pretexto_conta > 0)) f.conj_mula_conta = 1;
  if (f.pretexto_conta > 0 && (f.divisao_lucro > 0 || f.mula > 0)) f.conj_pretexto_ganho = 1;
  if (f.mula > 0 && f.divisao_lucro > 0) f.conj_mula_ganho = 1;
  // "procuro parceiro, a gente divide 50/50" é parceria honesta: só condena
  // com o lucro dito com todas as letras (×2) ou com promessa de dinheiro
  if (f.recrutamento > 0 && (f.divisao_lucro >= 2 || (f.divisao_lucro > 0 && f.scam > 0))) f.conj_recrutamento_lucro = 1;
  if (f.recrutamento > 0 && f.scam > 0) f.conj_ganho_recrutamento = 1;
  if (f.pedido_dados > 0 && f.scam > 0) f.conj_golpe_dados = 1;

  // Dano a pessoas: o "E" que transforma conversa em ameaça
  const ordemSobreOutro = contar(t, LEX_ORDEM_OUTRO, 1) > 0;
  if (f.autolesao > 0 && (f.desafio > 0 || ordemSobreOutro)) f.conj_desafio_autolesao = 1;
  if ((f.dados_pessoais > 0 || f.dox > 0) && (f.vazar > 0 || f.coercao > 0)) f.conj_doxxing = 1;
  if (f.coercao > 0 && f.vazar > 0) f.conj_extorsao = 1;
  if (f.desafio > 0 && contar(t, LEX_EXTREMO, 1) > 0) f.conj_desafio_extremo = 1;
  if (f.desafio > 0 && f.humilhacao > 0) f.conj_desafio_humilhacao = 1;
  if ((f.scam > 0 || f.adulto > 0 || f.gore > 0)
      && (f.link_encurtador || f.link_filehost || f.link_mascarado || f.link_ofuscado)) f.conj_topico_link = 1;

  // Isca em forma de pergunta ("quer nitro grátis? clica aqui") não é dúvida:
  // com tema de golpe/+18/gore E algo que chama para agir (contato, oferta,
  // link, imperativo) e sem tom de alerta, a interrogação não desconta. Na
  // bateria de 17 out 2026 o "?" era o sinal mais comum nos golpes que passaram.
  const isca = (f.scam > 0 || f.adulto > 0 || f.gore > 0)
    && (f.cta > 0 || f.oferta > 0 || f.afirmacao > 0 || f.pedido_dados > 0 || f.link_encurtador || f.link_filehost || f.link_convite || f.link_simples || f.link_mascarado || f.link_ofuscado)
    && !f.negacao;
  if (isca) f.pergunta = 0;
  // A interrogação suaviza golpe ("isso é golpe?"), mas não suaviza ódio:
  // "vc é um ciganinho né?" continua sendo uma injúria.
  if (f.injuria || f.odio || f.simbolo_odio || f.ameaca) f.pergunta = 0;
  return f;
}

export function pontuar(features, pesos = PESOS) {
  let s = pesos.vies ?? 0;
  for (const [k, v] of Object.entries(features)) s += (pesos[k] ?? 0) * v;
  return clamp(s, 0, 10);
}

export function analisarConteudo(texto, opts = {}) {
  let f = extrairFeatures(texto, opts);
  let nota = pontuar(f);
  RE_ESTICADA.lastIndex = 0;
  if (RE_ESTICADA.test(normalizarParaAnalise(texto ?? ""))) {
    const f2 = extrairFeatures(texto, { ...opts, colapsar: true });
    const nota2 = pontuar(f2);
    if (nota2 > nota) { f = f2; nota = nota2; }
  }
  const grave = (f.conj_grave_oferta > 0) || (f.conj_grave_contexto > 0);
  const sinais = Object.entries(f)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}${v > 1 ? "×" + v : ""}`);
  return { nota, grave, sinais, features: f, dano: danoDe(f) };
}
