// ══════════════════════════════════════════════════════════
//  memoria-agente.js — agente de memória de longo prazo
//
//  Observa o chat e extrai FATOS para a Judy lembrar depois:
//   • sobre PESSOAS (gostos, quem é, contexto)
//   • sobre o SERVIDOR (piadas internas, eventos, combinados)
//
//  Roda em BACKGROUND (não trava a mensagem) e usa o modelo
//  PEQUENO (decisão) — barato e rápido. Um DEBOUNCE por usuário
//  agrupa rajadas de mensagens numa extração só, para não fritar
//  a GPU quando alguém manda várias linhas seguidas.
//
//  Os fatos vão para ia_fatos_pessoa / ia_fatos_servidor, com
//  nível de confiança: fato repetido sobe, fato isolado fica baixo.
// ══════════════════════════════════════════════════════════

import * as db from "../core/db.js";

const DEBOUNCE_MS   = Number(process.env.MEMORIA_DEBOUNCE_MS || 8000);
const MIN_CHARS     = Number(process.env.MEMORIA_MIN_CHARS || 12);   // ignora "kkk", "oi"
const MAX_LOTE      = Number(process.env.MEMORIA_MAX_LOTE || 10);    // msgs por extração
const LIGADO        = process.env.MEMORIA_AGENTE !== "off";

const log = (...a) => { if (process.env.CHAT_DEBUG) console.log("[MEMÓRIA]", ...a); };

// Buffer por (servidor+usuário): acumula mensagens até o debounce disparar.
const buffers = new Map();   // chave → { msgs:[], timer, nome, canal }
const chave = (serverId, userId) => `${serverId}:${userId}`;

// Injeção de dependência: o bot passa como chamar o LLM (reusa o pipeline dele).
let chamarLLM = null;
export function configurar({ chamarModelo }) { chamarLLM = chamarModelo; }

// ── Prioridade: a conversa vem primeiro ─────────────────────
//
// A GPU atende uma coisa de cada vez. Quando a extração de memória disparava
// no meio de uma resposta, as duas competiam e a resposta — que tem alguém
// esperando na tela — passava de 20s para minutos, até estourar o timeout.
//
// A memória não tem pressa: um fato extraído agora ou daqui a um minuto dá no
// mesmo. Então ela cede a vez, sempre.
let ocupadoRespondendo = 0;
const adiados = new Set();

export function marcarRespondendo() { ocupadoRespondendo++; }
export function marcarLivre() {
  ocupadoRespondendo = Math.max(0, ocupadoRespondendo - 1);
  if (ocupadoRespondendo === 0 && adiados.size) {
    // Volta ao trabalho pendente, mas com folga: emendar na resposta que
    // acabou de sair pegaria a GPU ainda quente com a próxima mensagem.
    const pendentes = [...adiados];
    adiados.clear();
    log(`retomando ${pendentes.length} extração(ões) adiada(s)`);
    setTimeout(() => {
      for (const k of pendentes) processar(k).catch((e) => log("erro:", e.message));
    }, 3000);
  }
}
export function estaOcupado() { return ocupadoRespondendo > 0; }

// Chamado pelo bot a cada mensagem "normal" (não-comando) do chat.
export function observar({ serverId, userId, nome, texto, ehBot }) {
  if (!LIGADO || ehBot || !chamarLLM) return;
  if (!serverId || !userId) return;
  const t = String(texto || "").trim();
  if (t.length < MIN_CHARS) return;   // muito curto p/ conter fato

  const k = chave(serverId, userId);
  let buf = buffers.get(k);
  if (!buf) { buf = { msgs: [], timer: null, nome, serverId, userId }; buffers.set(k, buf); }
  buf.nome = nome || buf.nome;
  buf.msgs.push(t);
  if (buf.msgs.length > MAX_LOTE) buf.msgs.shift();

  // reinicia o debounce: só extrai quando a pessoa "parar" de escrever
  if (buf.timer) clearTimeout(buf.timer);
  buf.timer = setTimeout(() => {
    // Se há resposta sendo gerada, a extração espera a vez em vez de brigar
    // pela GPU. Ela é retomada assim que a conversa termina.
    if (ocupadoRespondendo > 0) {
      adiados.add(k);
      log(`extração adiada (conversa em andamento): ${k}`);
      return;
    }
    processar(k).catch((e) => log("erro:", e.message));
  }, DEBOUNCE_MS);
}

// ══════════════════════════════════════════════════════════
//  O extrator — e a lição dos placeholders
//
//  A versão anterior dava exemplos assim: "trabalha com X", "mora em Y",
//  "estuda Z". Um modelo pequeno não os leu como PLACEHOLDERS: copiou-os
//  literalmente para a saída. O resultado apareceu no `&chat perfil` de
//  alguém como "mora em Y" e "trabalha com X" — o meu prompt vazando para
//  o banco, apresentado à pessoa como fato sobre ela.
//
//  Pior: fatos falsos são INJETADOS no prompt da conversa. A Judy passou a
//  afirmar com confiança que a pessoa morava em São Paulo, e a inventar uma
//  piada interna do servidor para justificar. Uma memória errada não fica
//  quieta: ela vira alucinação confiante.
//
//  Por isso agora cada fato precisa de EVIDÊNCIA — a citação da mensagem
//  que o sustenta. Se o modelo não consegue apontar onde leu aquilo, o fato
//  não entra. É o mesmo princípio de "não invente" aplicado à memória.
// ══════════════════════════════════════════════════════════
const PROMPT_EXTRACAO = `Você extrai fatos duráveis de mensagens de chat para a memória de um bot.
Leia as mensagens de UM usuário e devolva SÓ um JSON:
{"personalidade": [{"fato":"...","evidencia":"..."}], "gosto": [...], "info": [...], "servidor": [...]}

Cada item tem DOIS campos:
- "fato": frase curta em 3ª pessoa, em português.
- "evidencia": um TRECHO LITERAL de uma das mensagens acima que prova o fato.

CATEGORIAS (sobre quem escreveu):
- "personalidade": como a pessoa é ou se comunica.
- "gosto": preferências e interesses concretos.
- "info": fatos concretos e verificáveis da vida dela (onde mora, o que faz, o que tem).
- "servidor": fatos da comunidade (piadas internas, eventos, apelidos). NÃO sobre a pessoa.

REGRAS ABSOLUTAS:
- NUNCA invente. Se a mensagem não disser, não existe. Preferir lista vazia a preencher.
- A "evidencia" tem de ser texto que aparece LITERALMENTE nas mensagens. Sem evidência, não inclua o item.
- Nada de placeholders, letras soltas ou termos genéricos ("X", "Y", "profissional", "bot", "ativo").
- Não registre o nome da pessoa nem o que ELA perguntou — só o que ela afirmou sobre si.
- Ignore saudações, reações, piadas do momento e o humor do dia.
- Máximo 2 itens por categoria. Nada além do JSON.`;

// Exportada para ser testável de verdade: é uma função pura, e o teste
// anterior que a exercitava "pelo caminho público" passava vazio sem
// executar nada — falso verde é pior que teste nenhum.
const LIXO_MEMORIA = /^(x|y|z|profissional|bot|ativo|ativa|curto|curta|geral|pessoa|usuário|usuario|nada|humano)$/i;
export function filtrarFato(item, { msgs = [], nome = "", aoDescartar = () => {} } = {}) {
  const fato = (typeof item === "string" ? item : item?.fato ?? "").trim();
  if (!fato || fato.length < 6) return null;                        // "bot", "ativo"
  if (LIXO_MEMORIA.test(fato.replace(/^(é|e|tem|gosta de)\s+/i, "").trim())) return null;
  // Placeholder do próprio prompt, copiado literalmente pelo modelo.
  if (/\b(com|em|de)\s+[xyz]\b/i.test(fato)) return null;
  // O nome da pessoa não é um fato sobre ela.
  if (nome && fato.toLowerCase().trim() === String(nome).toLowerCase().trim()) return null;

  // ── Ordem dada AO BOT não é fato sobre a pessoa ───────
  //
  //  Alguém escreveu "responde no máximo em 8s" — uma instrução para a Judy.
  //  Virou o fato "MiguelRobes responde no máximo em 8 segundos", que apareceu
  //  no `&chat perfil` dele. O agente confundiu o alvo: quem responderia em 8s
  //  era a bot.
  //
  //  A marca é o imperativo na segunda pessoa ("responde", "fala", "seja",
  //  "não use") — pedido, não descrição de alguém.
  if (/^(responde|responda|fala|fale|diga|escreva|escreve|faça|faz|use|usa|seja|sê|para de|pare de|não\s+\w+|me\s+\w+|traduz|traduza|resume|resuma|explique|explica|liste|lista|mostre|mostra|calcule|calcula|pesquise|pesquisa|ignore|ignora|esqueça|esquece)\b/i.test(fato)) {
    aoDescartar(`"${fato}" parece uma ordem dada à Judy, não um fato sobre ${nome || "a pessoa"}`);
    return null;
  }
  // "O usuário quer que você…" — o alvo também é a bot.
  if (/\b(quer|queria|pediu|mandou|pede|prefere)\s+que\s+(voc[êe]|a\s+judy|o\s+bot)/i.test(fato)) {
    aoDescartar(`"${fato}" descreve um pedido à Judy, não um traço da pessoa`);
    return null;
  }

  const evid = String(item?.evidencia ?? "").trim().toLowerCase();
  if (evid.length < 4) return null;                                  // sem evidência, não entra
  // Pedir evidência não basta: o modelo inventa a evidência junto. Então
  // conferimos que o trecho citado aparece MESMO nas mensagens lidas.
  const texto = msgs.join("\n").toLowerCase();
  if (!texto.includes(evid.slice(0, 40))) {
    aoDescartar(`descartado (evidência inventada): "${fato}" ← "${evid.slice(0, 50)}"`);
    return null;
  }
  return fato;
}

async function processar(k) {
  const buf = buffers.get(k);
  if (!buf || !buf.msgs.length) return;
  buffers.delete(k);

  const { serverId, userId, nome, msgs } = buf;
  const conteudo = `Usuário: ${nome || userId}\nMensagens:\n${msgs.map((m) => `- ${m}`).join("\n")}`;

  let raw;
  try {
    raw = await chamarLLM([
      { role: "system", content: PROMPT_EXTRACAO },
      { role: "user", content: conteudo },
    ]);
  } catch (e) { log("LLM falhou:", e.message); return; }

  let obj;
  try {
    const limpo = String(raw).replace(/```json|```/g, "").trim();
    obj = JSON.parse(limpo);
  } catch { log("JSON inválido do extrator; ignorando"); return; }

  // ── A peneira ──
  //
  //  O prompt pede evidência, mas pedir não basta: um modelo pequeno
  //  inventa a evidência junto. Então CONFERIMOS que o trecho citado
  //  realmente aparece nas mensagens. É a diferença entre confiar e
  //  verificar, e é barata: uma busca em texto.
  const aceitar = (item) => filtrarFato(item, { msgs, nome, aoDescartar: (m) => log(m) });

  const cats = { personalidade: "personalidade", gosto: "gosto", info: "info" };
  let total = 0;
  for (const [chave, categoria] of Object.entries(cats)) {
    const lista = Array.isArray(obj?.[chave]) ? obj[chave] : [];
    for (const item of lista.slice(0, 2)) {
      const fato = aceitar(item);
      if (fato) { db.addFatoPessoa(serverId, userId, fato, 0.5, categoria); total++; }
    }
  }
  const servidor = (Array.isArray(obj?.servidor) ? obj.servidor : []).slice(0, 2)
    .map(aceitar).filter(Boolean);
  for (const f of servidor) db.addFatoServidor(serverId, f);
  if (total || servidor.length) {
    log(`extraiu p/ ${nome}: ${total} pessoais, ${servidor.length} de servidor`);
  }
}

// Monta o bloco de memória para injetar no prompt da Judy ao conversar.
export function contextoMemoria(serverId, userId) {
  if (!serverId) return "";
  const pessoa = db.getFatosPessoa(serverId, userId, { limite: 14, minConf: 0.4 });
  const servidor = db.getFatosServidor(serverId, { limite: 12, minConf: 0.45 });
  const perfil = db.getPerfil?.(serverId, userId);
  if (!pessoa.length && !servidor.length && !perfil) return "";

  const dataCurta = (iso) => { try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return ""; } };
  const linhas = [];

  // ── O cartão de perfil é da PESSOA, não da Judy ───────
  //
  //  A bio entrava aqui rotulada só como "Perfil desta pessoa", e o modelo
  //  a lia como fatos soltos. A bio do dono contém `Server: https://stt.gg/…`
  //  e `Meu Bot: Cobaia#7705` — e a Judy passou a afirmar que aquele era o
  //  SEU endereço e a chamar o dono de "Cobaia". Ela não confundiu por
  //  burrice: ninguém tinha dito de quem era aquilo.
  //
  //  Agora o bloco diz, na própria borda, que é texto escrito PELA pessoa
  //  sobre ela mesma — e que links e nomes ali dentro não são da Judy.
  if (perfil) {
    const p = [];
    if (perfil.bio) p.push(`bio: ${perfil.bio}`);
    if (perfil.grupos) p.push(`grupos: ${perfil.grupos}`);
    if (perfil.jogos) p.push(`jogos: ${perfil.jogos}`);
    if (p.length) {
      linhas.push("Cartão de perfil DESTA PESSOA (texto que ELA escreveu sobre si mesma —");
      linhas.push("links, servidores e bots citados aqui são DELA, nunca seus):");
      for (const x of p) linhas.push(`- ${x}`);
    }
  }

  // Fatos agrupados por categoria, com a data em que você percebeu
  if (pessoa.length) {
    const porCat = { personalidade: [], gosto: [], info: [], geral: [] };
    for (const f of pessoa) (porCat[f.categoria] || porCat.geral).push(f);
    const rotulo = { personalidade: "Personalidade", gosto: "Gostos", info: "Informações", geral: "Outros" };
    linhas.push("O que você já observou:");
    for (const cat of ["personalidade", "gosto", "info", "geral"]) {
      for (const f of porCat[cat]) {
        const d = dataCurta(f.momento);
        linhas.push(`- [${rotulo[cat]}${d ? `, desde ${d}` : ""}] ${f.fato}`);
      }
    }
  }

  if (servidor.length) {
    linhas.push("Sobre este servidor:");
    for (const f of servidor) linhas.push(`- ${f.fato}`);
  }

  // Sinal de acessibilidade (opt-in): orienta o tom, sem rótulos médicos.
  if (perfil?.cuidado) {
    linhas.push("IMPORTANTE: trate esta pessoa com gentileza e paciência extra, de forma clara e acolhedora. Sem ironia ácida com ela.");
  }

  // O enquadramento importa tanto quanto o conteúdo. Apresentado como
  // verdade, um fato errado vira afirmação confiante ("então você também é
  // de São Paulo!"). Apresentado como impressão, vira pergunta.
  linhas.push(
    "(Isto são IMPRESSÕES suas de conversas passadas, não verdades verificadas.",
    "Use com naturalidade e NUNCA recite. Se for usar um fato destes, trate-o como algo",
    "que você acha que sabe — e se a pessoa contradisser, acredite nela, não na sua memória.",
    "Nunca afirme como certo algo que só está aqui.)",
  );
  return linhas.join("\n");
}

// Para o &chat esquecer: apaga os fatos daquela pessoa.
// ── Descartar o que ainda NÃO virou banco ────────────────
//
//  `&chat esquecer tudo` apagava o banco e nada mais. Os buffers de
//  observação — mensagens já lidas, esperando o debounce para virar fato —
//  continuavam de pé e viravam fato DEPOIS da limpeza. Quem mandou esquecer
//  via a memória repovoar sozinha com o que acabara de apagar.
export function descartarPendentes(serverId = null) {
  let n = 0;
  for (const [chave, buf] of [...buffers.entries()]) {
    if (serverId && !String(chave).startsWith(`${serverId}:`)) continue;
    try { clearTimeout(buf.timer); } catch {}
    buffers.delete(chave);
    n++;
  }
  adiados.clear();
  return n;
}

export function esquecerPessoa(serverId, userId) {
  return db.limparFatosPessoa(serverId, userId);
}
