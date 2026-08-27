// ══════════════════════════════════════════════════════════
//  ler-codigo.js — a Judy lê o próprio código direto do GitHub
//
//  Em vez de montar o repositório como volume (o código vive no
//  homelab, não aqui), buscamos direto da API do GitHub. Assim a
//  Judy sempre lê a versão publicada — a mesma que virou imagem.
//
//  Repositório e ramo por env:
//    GITHUB_REPO   (ex.: GhisoOF/stoat_bot)  — obrigatório
//    GITHUB_BRANCH (padrão: main)
//    GITHUB_TOKEN  (opcional; só aumenta o limite de requisições)
//
//  Repositório público não precisa de token. O token, se houver,
//  eleva o limite de 60 para 5000 requisições/hora.
// ══════════════════════════════════════════════════════════

import { buscar, explicarErroDeRede, ehTransitorio } from "./rede.js";
import fs from "node:fs";
import path from "node:path";

// ── O repositório LOCAL vem primeiro ──────────────────────
//
//  O GitHub aqui era uma fonte de dor recorrente: o deploy apaga e recria
//  `ia-servico/`, o `.env` com o GITHUB_TOKEN some junto, e a Judy passa a
//  responder "o repositório não existe" até alguém refazer o token à mão.
//  Tudo isso para ler um código que JÁ ESTÁ na mesma máquina — o deploy
//  acabou de descompactá-lo em `~/Downloads/github`.
//
//  Então: com `CODIGO_DIR` apontando para a cópia local (montada como
//  volume somente-leitura no compose), a leitura é do disco — sem token,
//  sem limite de requisições, sem rede. O GitHub vira o que sempre deveria
//  ter sido: um plano B para quando o volume não estiver montado.
const CODIGO_DIR = process.env.CODIGO_DIR || "";

function raizLocal() {
  if (!CODIGO_DIR) return null;
  try { return fs.statSync(CODIGO_DIR).isDirectory() ? path.resolve(CODIGO_DIR) : null; }
  catch { return null; }
}

// Trava de fuga: o caminho pedido, resolvido, tem de continuar DENTRO da
// raiz. Sem isso, `../..` sairia do repositório e este container viraria um
// leitor de arquivos da máquina.
function caminhoSeguro(raiz, pedido) {
  const alvo = path.resolve(raiz, pedido ?? "");
  return alvo === raiz || alvo.startsWith(raiz + path.sep) ? alvo : null;
}

const IGNORAR_DIRS = new Set(["node_modules", ".git", ".github"]);

function arvoreLocal(raiz) {
  const saida = [];
  const andar = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith(".") && ent.name !== ".env.example") continue;
      const relCaminho = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        if (!IGNORAR_DIRS.has(ent.name)) andar(path.join(dir, ent.name), relCaminho);
      } else if (!proibido(relCaminho)) {
        saida.push({ path: relCaminho, size: fs.statSync(path.join(dir, ent.name)).size });
      }
    }
  };
  andar(raiz, "");
  return saida;
}

const REPO   = process.env.GITHUB_REPO || "";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN  = process.env.GITHUB_TOKEN || "";

// O GitHub responde 404 (não 401/403) para repositório privado sem
// credencial válida — de propósito, para não revelar que ele existe. Isso
// engana: parece "o arquivo não existe" quando é "não tenho permissão".
//
// Os dois casos exigem ações diferentes, então a mensagem separa: sem token
// é problema de configuração do container; com token é escopo, repo ou branch.
function erro404(caminho = "") {
  const onde = caminho ? ` em \`${caminho}\`` : "";
  // `amigavel` diz ao catch que esta mensagem já foi escrita para ser lida
  // por gente — e que portanto NÃO deve ser truncada nem reescrita.
  const marcar = (texto) => Object.assign(new Error(texto), { amigavel: true });
  if (!TOKEN) {
    return marcar(`O GitHub respondeu 404${onde}. O repositório \`${REPO}\` é privado e`
      + ` **não há GITHUB_TOKEN configurado** neste container — sem credencial, o`
      + ` GitHub finge que o repo não existe.`
      + `\n\nO token vem do arquivo \`.env\` do diretório do judy-ia.`
      + ` Ele costuma sumir quando a pasta \`ia-servico\` é apagada e recriada no deploy.`
      + `\n\nRefazer:  \`echo "GITHUB_TOKEN=github_pat_..." > ia-servico/.env\``
      + ` e reiniciar o serviço:  \`rc-service judy-ia restart\`.`);
  }
  return marcar(`O GitHub respondeu 404${onde}, mesmo com GITHUB_TOKEN presente.`
    + ` Isso costuma ser uma destas três coisas:`
    + `\n• o token não tem acesso a \`${REPO}\` (fine-grained precisa listar ESTE repositório e dar leitura em "Contents")`
    + `\n• o token expirou — o GitHub volta a responder 404, não 401`
    + `\n• o caminho ou a branch (\`${BRANCH}\`) não existem`
    + `\n\nConfira com: \`curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/repos/${REPO}\``);
}

const EXT_OK = new Set([".js", ".mjs", ".cjs", ".json", ".md", ".yml", ".yaml", ".txt", ".sh"]);
const PROIBIDOS = [/\.env/i, /token/i, /secret/i, /senha/i, /password/i, /\.db$/i];
const extDe = (p) => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(i).toLowerCase(); };
const proibido = (p) => PROIBIDOS.some((re) => re.test(p));

function cabecalhos() {
  const h = { "Accept": "application/vnd.github+json", "User-Agent": "judy-ia" };
  if (TOKEN) h["Authorization"] = `Bearer ${TOKEN}`;
  return h;
}

async function api(caminho) {
  const url = `https://api.github.com/repos/${REPO}/contents/${caminho}?ref=${BRANCH}`;
  const r = await buscar(url, { headers: cabecalhos(), signal: AbortSignal.timeout(15000) });
  if (r.status === 403) throw new Error("limite de requisições do GitHub atingido (adicione GITHUB_TOKEN).");
  if (r.status === 404) throw erro404(caminho);
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  return r.json();
}

// Árvore recursiva (uma chamada) — boa para listar e estatísticas.
async function arvore() {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const r = await buscar(url, { headers: cabecalhos(), signal: AbortSignal.timeout(15000) });
  // Mesma armadilha do 404 aqui: é por esta chamada que a Judy LISTA o
  // repositório, então sem ela a resposta vira "não encontrei nada".
  if (r.status === 404) throw erro404();
  if (r.status === 403) throw new Error("limite de requisições do GitHub atingido (adicione GITHUB_TOKEN).");
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  const data = await r.json();
  return (data.tree || []).filter((n) => n.type === "blob" && !proibido(n.path));
}

export const definicao = {
  type: "function",
  function: {
    name: "ler_codigo",
    // A descrição diz ao modelo POR ONDE COMEÇAR. Sem isso ele adivinhava
    // nomes de arquivo ("scripts/judy-ia.js", que nunca existiu) e gastava
    // três chamadas para descobrir que estava errado.
    //
    // E agora diz também POR ONDE NÃO COMEÇAR: perguntada sobre TTS, ela leu
    // `modulos/ai/chat.js` (o primeiro nome que lhe ocorreu) e descreveu
    // funções que não existem. A ação `buscar` tira o palpite do caminho:
    // "tts" devolve os arquivos que falam de TTS, e só então ela lê.
    description: "Lê o código-fonte do próprio bot (somente leitura). PERGUNTA SOBRE O PROJETO INTEIRO ('como o código está organizado?', 'a estrutura da raiz', 'quais módulos existem') → chame 'estrutura' SEM caminho: devolve as pastas, os arquivos de cada uma e o que cada um expõe. Nunca use 'buscar' para isso — buscar precisa de um termo, e não existe termo para 'o projeto todo'. Use para responder como o bot funciona, comentar a própria implementação ou conferir detalhes técnicos. FLUXO OBRIGATÓRIO: (1) 'buscar' com o termo da pergunta (ex.: 'tts', 'xp', 'banglobal') — devolve os arquivos cujo nome ou conteúdo casam; (2) 'estrutura' do arquivo escolhido — o MAPA dele (seções, funções, exports, com a linha de cada um), que é o que responde perguntas do tipo como-funciona-X; (3) 'ler' as linhas específicas que você precisa citar. Um arquivo de 1400 linhas NÃO cabe numa leitura: descrever o todo a partir da primeira página é como resumir um livro pela primeira folha — use 'estrutura' para o todo e 'ler' para o detalhe. Arquivos grandes vêm em páginas de linhas: o resultado diz 'proxima_linha' quando há mais — chame 'ler' de novo com 'linha_inicial' para continuar, ou passe 'termo' para abrir direto no trecho que fala do assunto. 'listar' e 'estatisticas' são para visão geral. NUNCA adivinhe nomes de arquivo; NUNCA descreva funções que não apareceram no conteúdo lido.",
    parameters: {
      type: "object",
      required: ["acao"],
      properties: {
        acao: { type: "string", enum: ["buscar", "estrutura", "estatisticas", "listar", "ler"], description: "O que fazer" },
        termo: { type: "string", description: "Em 'buscar': o assunto procurado (uma palavra ou duas, ex.: 'tts', 'reaction role', 'silence'). Em 'ler': opcional — abre o arquivo no primeiro trecho que contém o termo, em vez do começo." },
        caminho: { type: "string", description: "Caminho relativo à raiz do repositório, ex.: 'modulos/ai/chat.js' ou 'modulos/ai'. Deixe VAZIO para a raiz — não use '.' nem '/'. Obrigatório na ação 'ler'. Em 'estrutura': vazio = mapa do REPOSITÓRIO INTEIRO, pasta = mapa daquela pasta, arquivo = mapa daquele arquivo." },
        linha_inicial: { type: "integer", description: "Em 'ler': a linha (a partir de 1) por onde começar. Use o 'proxima_linha' do resultado anterior para continuar um arquivo grande. Padrão: 1." },
        quantidade: { type: "integer", description: "Em 'ler': quantas linhas devolver por página (padrão 300, máximo 600)." },
      },
    },
  },
};

// ── Paginação: um arquivo grande vem em pedaços ──────────
//
//  O corte antigo era por bytes, sempre do começo: um arquivo de 1400 linhas
//  virava as 300 primeiras e um `cortado: true` que o modelo ignorava — e o
//  resto do arquivo simplesmente não existia para ele. Agora a leitura tem
//  janela (`linha_inicial` + `quantidade`), diz quantas linhas há no total e
//  onde a próxima página começa. E com `termo`, a janela abre em cima do
//  trecho que interessa, em vez de no cabeçalho de licença.
const PAGINA_PADRAO = Number(process.env.CODIGO_PAGINA_LINHAS || 300);
const PAGINA_MAX    = 600;

function paginar(txt, { linha_inicial, quantidade, termo } = {}) {
  const linhas = txt.split("\n");
  const total = linhas.length;
  let qtd = Number(quantidade) || PAGINA_PADRAO;
  qtd = Math.max(20, Math.min(PAGINA_MAX, qtd));

  let inicio = Number(linha_inicial) || 1;
  let ancora = null;
  const t = String(termo ?? "").trim();
  if (t && !linha_inicial) {
    // Busca sem distinguir maiúsculas; a janela começa um pouco antes do
    // achado, para o contexto (a função que contém a linha) vir junto.
    const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const i = linhas.findIndex((l) => re.test(l));
    if (i >= 0) { ancora = i + 1; inicio = Math.max(1, i + 1 - 15); }
  }
  inicio = Math.max(1, Math.min(inicio, total));
  const fim = Math.min(total, inicio + qtd - 1);

  // Numerar as linhas: o modelo cita "na linha 412" e o humano acha.
  const largura = String(fim).length;
  const trecho = linhas.slice(inicio - 1, fim)
    .map((l, i) => `${String(inicio + i).padStart(largura)}| ${l}`)
    .join("\n");

  const pct = Math.round(((fim - inicio + 1) / total) * 100);
  const saida = { linhas_totais: total, intervalo: `${inicio}-${fim}`, porcentagem_lida: `${pct}%` };
  // O aviso vem ANTES do conteúdo (depois de 300 linhas de código, ressalva
  // no rodapé já saiu do foco) e diz primeiro o que PODE ser afirmado.
  //
  //  A versão anterior só proibia — "NÃO descreva o que está fora deste
  //  intervalo" — e o efeito foi o oposto do pretendido: em vez de limitar o
  //  escopo da resposta, o modelo concluiu que não podia responder e disse
  //  que "não conseguia descrever o arquivo". Aviso que só nega vira recusa.
  if (fim - inicio + 1 < total) {
    saida.leitura_parcial = `Estas ${fim - inicio + 1} linhas (${inicio}-${fim} de ${total}, ${pct}% do arquivo) são CÓDIGO REAL e você pode descrevê-las à vontade. O que está fora deste intervalo você ainda não viu — para falar do arquivo inteiro, chame acao='estrutura'; para outro trecho, use linha_inicial ou termo.`;
  }
  saida.conteudo = trecho;
  if (ancora) saida.termo_encontrado_na_linha = ancora;
  else if (t) saida.aviso = `o termo "${t}" não aparece neste arquivo — talvez o arquivo errado; use 'buscar'`;
  if (fim < total) {
    saida.proxima_linha = fim + 1;
    saida.continuar = `há mais ${total - fim} linha(s): chame 'ler' com linha_inicial=${fim + 1}`;
  } else {
    saida.fim_do_arquivo = true;
  }
  return saida;
}


// ── O mapa do arquivo, em vez do começo dele ──────────────
//
//  Perguntada "como funciona o TTS no seu código?", ela leu a primeira página
//  de um arquivo de 1436 linhas e descreveu o arquivo inteiro. Tudo que ela
//  acertou estava nas linhas 1-300; tudo que inventou ("graceful shutdown no
//  &tts reiniciar") estava depois da linha 780, que ela nunca viu.
//
//  A causa não é o modelo mentir: é a pergunta ser sobre o TODO e a ferramenta
//  só saber entregar PEDAÇOS. `estrutura` responde no formato da pergunta —
//  os cabeçalhos de seção, as funções e o que o arquivo exporta, com a linha
//  de cada um. Cabe em 60 linhas, cobre 100% do arquivo, e o que ela não
//  souber explicar ela agora sabe ONDE ler.
function estruturaDe(txt) {
  const linhas = txt.split("\n");
  const secoes = [];      // cabeçalhos de comentário (// ── Título ──)
  const simbolos = [];

  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    const n = i + 1;

    // Cabeçalho de seção: `// ── Entrar na call ──` ou `//  Título` em bloco ═
    const sec = l.match(/^\s*(?:\/\/|\*)\s*[─═=-]{2,}\s*(.+?)\s*[─═=-]{2,}\s*$/);
    if (sec && sec[1].length > 2) { secoes.push({ linha: n, titulo: sec[1] }); continue; }

    // Declarações: função, classe, const de arrow/objeto, export
    let m;
    if ((m = l.match(/^\s*(export\s+)?(default\s+)?(async\s+)?function\s*\*?\s*([\w$]+)\s*\(([^)]*)/))) {
      simbolos.push({ linha: n, tipo: "função", nome: m[4], exportado: !!m[1], args: m[5].slice(0, 60) });
    } else if ((m = l.match(/^\s*(export\s+)?class\s+([\w$]+)/))) {
      simbolos.push({ linha: n, tipo: "classe", nome: m[2], exportado: !!m[1] });
    } else if ((m = l.match(/^\s*(export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(async\s*)?(?:\(([^)]*)\)|[\w$]+)\s*=>/))) {
      simbolos.push({ linha: n, tipo: "função", nome: m[2], exportado: !!m[1], args: (m[4] ?? "").slice(0, 60) });
    } else if ((m = l.match(/^\s*export\s+(?:const|let|var)\s+([\w$]+)/))) {
      simbolos.push({ linha: n, tipo: "valor", nome: m[1], exportado: true });
    } else if ((m = l.match(/^\s*export\s*\{([^}]*)\}/))) {
      for (const nome of m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
        simbolos.push({ linha: n, tipo: "reexport", nome, exportado: true });
      }
    }
  }

  const exportados = simbolos.filter((x) => x.exportado).map((x) => x.nome);
  return {
    linhas_totais: linhas.length,
    secoes: secoes.slice(0, 60).map((x) => `${x.linha}: ${x.titulo}`),
    simbolos: simbolos.slice(0, 120).map((x) =>
      `${x.linha}: ${x.exportado ? "export " : ""}${x.tipo} ${x.nome}${x.args !== undefined ? `(${x.args})` : ""}`),
    exporta: exportados,
    como_usar: "Este é o MAPA do arquivo, não o conteúdo. Descreva a arquitetura a partir dele e, para explicar um ponto específico, use 'ler' com linha_inicial na linha indicada acima. NUNCA descreva o que uma função faz por dentro sem ter lido as linhas dela.",
  };
}


// ── O mapa do REPOSITÓRIO (ou de uma pasta) ──────────────
//
//  `estrutura` de um arquivo responde "como funciona o TTS?". Faltava o
//  degrau de cima: "como o código está organizado?". Sem ele, perguntada
//  sobre a raiz do projeto, ela chamou `buscar` com o termo "package.json" —
//  não por burrice, mas porque `buscar` era a única porta de entrada e ela
//  precisava de um termo. Descreveu os package.json que achou.
//
//  `listar` não servia (118 caminhos sem significado nenhum) e
//  `estatisticas` menos ainda (bytes por pasta). O que responde a pergunta é
//  isto: as pastas, os arquivos de cada uma, o tamanho e — o que importa — o
//  que cada arquivo EXPÕE. Daí sai a arquitetura de verdade.
function estruturaDoRepo(raiz, subpasta = "") {
  const arqs = arvoreLocal(raiz).filter((n) => !subpasta || n.path === subpasta || n.path.startsWith(`${subpasta}/`));
  if (!arqs.length) return null;

  const porPasta = new Map();
  const avulsos = [];   // notáveis fora do .js (README, compose, Dockerfile)

  for (const n of arqs) {
    const ext = extDe(n.path);
    const pasta = n.path.includes("/") ? n.path.split("/").slice(0, -1).join("/") : "(raiz)";
    if (ext !== ".js" && ext !== ".mjs") {
      if (/README|package\.json|Dockerfile|docker-compose|\.ya?ml$/i.test(n.path)) avulsos.push(n.path);
      continue;
    }
    let exporta = [], linhas = 0;
    try {
      const txt = fs.readFileSync(path.join(raiz, n.path), "utf8");
      linhas = txt.split("\n").length;
      exporta = estruturaDe(txt).exporta.slice(0, 6);
    } catch { /* ilegível: entra sem detalhe */ }
    if (!porPasta.has(pasta)) porPasta.set(pasta, []);
    porPasta.get(pasta).push({ arquivo: n.path.split("/").pop(), linhas, exporta });
  }

  // Pasta maior primeiro: é quase sempre onde está o miolo do projeto.
  const pastas = [...porPasta.entries()]
    .map(([pasta, arquivos]) => ({
      pasta,
      linhas: arquivos.reduce((t, a) => t + a.linhas, 0),
      arquivos: arquivos
        .sort((a, b) => b.linhas - a.linhas)
        .slice(0, 40)
        .map((a) => `${a.arquivo} (${a.linhas} linhas)${a.exporta.length ? ` — expõe: ${a.exporta.join(", ")}` : ""}`),
    }))
    .sort((a, b) => b.linhas - a.linhas);

  return {
    escopo: subpasta || "(repositório inteiro)",
    arquivos_js: pastas.reduce((t, p) => t + p.arquivos.length, 0),
    linhas_js: pastas.reduce((t, p) => t + p.linhas, 0),
    pastas: pastas.map((p) => ({ pasta: p.pasta, linhas: p.linhas, arquivos: p.arquivos })),
    outros_arquivos: avulsos.slice(0, 25),
    como_usar: "Este é o mapa da ORGANIZAÇÃO: pastas, arquivos e o que cada um expõe. Descreva a arquitetura a partir daqui — o que cada pasta faz, como o projeto se divide. Para o mapa de UM arquivo, chame 'estrutura' com o caminho dele; para o código, 'ler'. NÃO afirme o que uma função faz por dentro: isso não está aqui.",
  };
}

// ── Buscar arquivo por assunto ───────────────────────────
//
//  Dois critérios, nesta ordem: o termo no NOME do arquivo (tts.js, tts-filtro.js)
//  e o termo no CONTEÚDO (quantas linhas o citam). O nome pesa mais porque quem
//  chama o arquivo de "tts" quase sempre é o dono do assunto; o conteúdo pega
//  o resto ("silence" aparece em automod-engine.js, que não tem isso no nome).
const sem_acento = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function buscarLocal(raiz, termo) {
  const t = sem_acento(termo).trim();
  if (!t) return { erro: "informe o 'termo' a buscar (ex.: 'tts')." };
  const palavras = t.split(/\s+/).filter(Boolean);
  const arqs = arvoreLocal(raiz);

  // Nome curto primeiro: entre `tts.js` e `tts-filtro.js`, o dono do assunto
  // é o de nome mais enxuto — a ordem alfabética punha o filtro na frente.
  const por_nome = arqs
    .filter((n) => palavras.every((w) => sem_acento(n.path).includes(w)))
    .map((n) => n.path)
    .sort((a, b) => a.split("/").pop().length - b.split("/").pop().length || a.localeCompare(b));

  const por_conteudo = [];
  for (const n of arqs) {
    if (!EXT_OK.has(extDe(n.path)) || n.size > 400_000) continue;
    let txt;
    try { txt = fs.readFileSync(path.join(raiz, n.path), "utf8"); } catch { continue; }
    const linhas = txt.split("\n");
    let ocorrencias = 0, primeira = 0;
    for (let i = 0; i < linhas.length; i++) {
      const l = sem_acento(linhas[i]);
      if (palavras.every((w) => l.includes(w))) { ocorrencias++; if (!primeira) primeira = i + 1; }
    }
    if (ocorrencias) por_conteudo.push({ caminho: n.path, ocorrencias, primeira_linha: primeira, linhas: linhas.length });
  }
  por_conteudo.sort((a, b) => b.ocorrencias - a.ocorrencias);

  if (!por_nome.length && !por_conteudo.length) {
    return { fonte: "disco local", termo, encontrados: 0,
      dica: "nada casa com esse termo. Tente uma palavra mais curta ou um sinônimo; 'listar' mostra a árvore inteira." };
  }
  const melhor = por_nome[0] ?? por_conteudo[0]?.caminho;

  // ── A busca já entrega o mapa do melhor candidato ─────────
  //
  //  Devolver só a lista criou dois problemas opostos. Primeiro o modelo
  //  respondeu A PARTIR DELA, descrevendo um arquivo que nunca abriu. Aí eu
  //  pus um aviso dizendo "isto é um índice, não o código" — e ele passou a
  //  achar que o ARQUIVO era um índice de metadados e se recusou a responder,
  //  com 600 linhas de código na frente.
  //
  //  A saída não era um aviso melhor: era não devolver um resultado que
  //  precisa de aviso. Agora a busca já vem com o mapa do arquivo mais
  //  provável — conteúdo de verdade, cobrindo o arquivo inteiro. Uma chamada,
  //  nada a proibir, e o passo seguinte é opcional em vez de obrigatório.
  let mapa = null;
  if (melhor) {
    try { mapa = { caminho: melhor, ...estruturaDe(fs.readFileSync(path.join(raiz, melhor), "utf8")) }; }
    catch { mapa = null; }
  }

  return {
    fonte: "disco local", termo,
    pelo_nome: por_nome.slice(0, 10),
    pelo_conteudo: por_conteudo.slice(0, 10),
    estrutura_do_melhor: mapa,
    proximo_passo: mapa
      ? `\`${melhor}\` é o arquivo mais provável, e o MAPA COMPLETO dele está em 'estrutura_do_melhor' acima — dá para descrever a arquitetura já com isso. Para citar um ponto específico, chame 'ler' com o caminho e a linha que o mapa indica. Se este não for o arquivo certo, escolha outro da lista.`
      : `leia \`${melhor}\` com a ação 'ler' (passe termo="${termo}" para abrir no trecho certo). Se não responder à pergunta, leia o seguinte da lista — não complete de memória.`,
  };
}

// ── Normalizar o caminho que o modelo mandou ──────────────
//
//  O modelo escreve a raiz como ".", "./" ou "/" — as três formas naturais.
//  O filtro era `path.startsWith(caminho)`, e nenhum arquivo começa com "."
//  (eles são `main.js`, `modulos/x.js`…), então listar a raiz devolvia lista
//  VAZIA. A Judy olhou para o próprio repositório, viu o nada, e concluiu que
//  não tinha acesso ao código. Um bug de uma linha que parecia falta de
//  permissão — foi por isso que fomos conferir token e volume primeiro.
function normalizarCaminho(caminho) {
  const c = String(caminho ?? "").trim().replace(/\\\\/g, "/");
  if (!c || c === "." || c === "./" || c === "/" || c === "raiz" || c === "root") return "";
  return c.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

// Quando o caminho não existe, dizer O QUE existe vale mais que dizer "não
// achei": o modelo tentou `scripts/judy-ia.js`, que nunca existiu, e ficou
// chutando. Com as opções na mão, ele acerta na segunda.
function sugerir(arqs, pedido) {
  const alvo = pedido.toLowerCase();
  const base = alvo.split("/").pop();
  const perto = arqs
    .map((n) => n.path)
    .filter((p) => p.toLowerCase().includes(base) || base.includes(p.split("/").pop().toLowerCase()))
    .slice(0, 8);
  const pastas = [...new Set(arqs.map((n) => n.path.includes("/") ? n.path.split("/")[0] : "(raiz)"))].slice(0, 12);
  return { parecidos: perto, pastas_no_repositorio: pastas };
}

export async function executar({ acao, caminho, termo, linha_inicial, quantidade }) {
  caminho = normalizarCaminho(caminho);
  const pagina = { linha_inicial, quantidade, termo };
  // ── Plano A: o disco ──
  const raiz = raizLocal();
  if (raiz) {
    try {
      if (acao === "buscar") return buscarLocal(raiz, termo);
      if (acao === "estrutura") {
        // SEM caminho = o repositório inteiro. Antes isto era um erro
        // ("informe o caminho"), e era justamente a pergunta que faltava
        // responder: "como o código está organizado?".
        if (!caminho) return { fonte: "disco local", ...estruturaDoRepo(raiz) };
        if (proibido(caminho)) return { erro: "Arquivo protegido — não posso ler." };
        const alvo = caminhoSeguro(raiz, caminho);
        if (!alvo) return { erro: "Caminho fora do repositório — não posso ler." };
        if (!fs.existsSync(alvo)) return { erro: `\`${caminho}\` não existe.`, ...sugerir(arvoreLocal(raiz), caminho) };
        // Pasta: o mesmo mapa, limitado a ela. Também deixou de ser erro —
        // "a estrutura de modulos/game" é uma pergunta perfeitamente sensata.
        if (fs.statSync(alvo).isDirectory()) {
          const mapa = estruturaDoRepo(raiz, caminho);
          return mapa ? { fonte: "disco local", ...mapa } : { erro: `nada em \`${caminho}\`` };
        }
        return { fonte: "disco local", caminho, ...estruturaDe(fs.readFileSync(alvo, "utf8")) };
      }
      if (acao === "estatisticas" || acao === "listar") {
        const arqs = arvoreLocal(raiz);
        if (acao === "listar") {
          const filtro = caminho ? arqs.filter((n) => n.path === caminho || n.path.startsWith(`${caminho}/`)) : arqs;
          if (!filtro.length) {
            return { fonte: "disco local", erro: `nada em \`${caminho}\``, ...sugerir(arqs, caminho) };
          }
          return { fonte: "disco local", total: filtro.length, arquivos: filtro.map((n) => `${n.path} (${n.size} bytes)`).slice(0, 300) };
        }
        const js = arqs.filter((n) => extDe(n.path) === ".js");
        let bytes = 0; const porPasta = {};
        for (const n of js) {
          bytes += n.size || 0;
          const pasta = n.path.includes("/") ? n.path.split("/").slice(0, -1).join("/") : "(raiz)";
          porPasta[pasta] = (porPasta[pasta] || 0) + (n.size || 0);
        }
        const ranking = Object.entries(porPasta).sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([pp, b]) => `${pp}: ~${Math.round(b / 40)} linhas`).join(", ");
        return { fonte: "disco local", arquivos_js: js.length, arquivos_totais: arqs.length,
          tamanho_js_bytes: bytes, linhas_estimadas: Math.round(bytes / 40), por_pasta: ranking };
      }
      if (acao === "ler") {
        if (!caminho) {
          return { erro: "Para ler é preciso um arquivo; a raiz é uma pasta.", ...sugerir(arvoreLocal(raiz), "") };
        }
        if (proibido(caminho)) return { erro: "Arquivo protegido — não posso ler." };
        const alvo = caminhoSeguro(raiz, caminho);
        if (!alvo) return { erro: "Caminho fora do repositório — não posso ler." };
        // A checagem de PASTA vem antes da de extensão: `modulos` não tem
        // extensão nenhuma, e responder "tipo de arquivo não legível" para
        // uma pasta manda o modelo para o lado errado — ele precisa ouvir
        // "isso é uma pasta, eis o que tem dentro".
        if (fs.existsSync(alvo) && fs.statSync(alvo).isDirectory()) {
          const dentro = arvoreLocal(raiz).filter((n) => n.path.startsWith(`${caminho}/`)).map((n) => n.path).slice(0, 50);
          return { erro: "Isso é uma pasta, não um arquivo.", arquivos_dentro: dentro };
        }
        if (!EXT_OK.has(extDe(caminho))) return { erro: "Tipo de arquivo não legível." };
        if (!fs.existsSync(alvo)) {
          return { erro: `\`${caminho}\` não existe no repositório.`, ...sugerir(arvoreLocal(raiz), caminho) };
        }
        const txt = fs.readFileSync(alvo, "utf8");
        return { fonte: "disco local", caminho, ...paginar(txt, pagina) };
      }
      return { erro: "Ação desconhecida." };
    } catch (e) {
      // Disco falhou de forma inesperada: cai para o GitHub em vez de morrer.
      console.error("[IA][ler-codigo] leitura local falhou:", e?.message ?? e);
    }
  }

  // ── Plano B: o GitHub (o caminho antigo, com o token e as dores dele) ──
  if (!REPO) {
    return { erro: CODIGO_DIR
      ? `CODIGO_DIR aponta para \`${CODIGO_DIR}\`, mas o volume não está montado (nem GITHUB_REPO configurado como reserva). Confira o \`volumes:\` do docker-compose do judy-ia.`
      : "nem CODIGO_DIR (repositório local) nem GITHUB_REPO estão configurados no serviço." };
  }

  try {
    if (acao === "buscar") {
      const t = sem_acento(termo ?? "").trim();
      if (!t) return { erro: "informe o 'termo' a buscar (ex.: 'tts')." };
      const palavras = t.split(/\s+/).filter(Boolean);
      const arqs = await arvore();
      const por_nome = arqs.filter((n) => palavras.every((w) => sem_acento(n.path).includes(w))).map((n) => n.path);
      return { fonte: "github", termo, pelo_nome: por_nome.slice(0, 10),
        nota: "pelo GitHub a busca é só pelo NOME do arquivo (o conteúdo não é varrido). Sem resultado? 'listar' e escolha pela pasta.",
        proximo_passo: por_nome[0] ? `leia \`${por_nome[0]}\` com a ação 'ler'.` : undefined };
    }

    if (acao === "estrutura") {
      if (!caminho) return { erro: "Informe o caminho do arquivo." };
      if (proibido(caminho)) return { erro: "Arquivo protegido — não posso ler." };
      const data = await api(caminho);
      if (Array.isArray(data)) return { erro: "Isso é uma pasta — use a ação 'listar'." };
      return { fonte: "github", caminho, ...estruturaDe(Buffer.from(data.content || "", "base64").toString("utf8")) };
    }

    if (acao === "estatisticas") {
      const arqs = await arvore();
      const js = arqs.filter((n) => extDe(n.path) === ".js");
      // conta linhas amostrando os arquivos .js (baixa cada um é caro; usamos size)
      let bytes = 0; const porPasta = {};
      for (const n of js) {
        bytes += n.size || 0;
        const pasta = n.path.includes("/") ? n.path.split("/").slice(0, -1).join("/") : "(raiz)";
        porPasta[pasta] = (porPasta[pasta] || 0) + (n.size || 0);
      }
      const ranking = Object.entries(porPasta).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([p, b]) => `${p}: ~${Math.round(b / 40)} linhas`).join(", ");
      return {
        arquivos_js: js.length,
        arquivos_totais: arqs.length,
        tamanho_js_bytes: bytes,
        linhas_estimadas: Math.round(bytes / 40),   // ~40 bytes/linha
        por_pasta: ranking,
        nota: "linhas estimadas por tamanho; peça 'ler' um arquivo para a contagem exata dele.",
      };
    }

    if (acao === "listar") {
      const arqs = await arvore();
      const filtro = caminho ? arqs.filter((n) => n.path.startsWith(caminho)) : arqs;
      return { total: filtro.length, arquivos: filtro.map((n) => `${n.path} (${n.size} bytes)`).slice(0, 300) };
    }

    if (acao === "ler") {
      if (!caminho) return { erro: "Informe o caminho do arquivo." };
      if (proibido(caminho)) return { erro: "Arquivo protegido — não posso ler." };
      if (!EXT_OK.has(extDe(caminho))) return { erro: "Tipo de arquivo não legível." };
      const data = await api(caminho);
      if (Array.isArray(data)) return { erro: "Isso é uma pasta — use a ação 'listar'." };
      const txt = Buffer.from(data.content || "", "base64").toString("utf8");
      return { fonte: "github", caminho, ...paginar(txt, pagina) };
    }

    return { erro: "Ação desconhecida." };
  } catch (e) {
    const msg = (e?.message ?? String(e));
    const causa = e?.cause?.code ?? "";
    // "fetch failed" é opaco: pode ser DNS, sem rota, firewall ou timeout.
    // A retentativa já aconteceu lá dentro; se chegou aqui, o problema
    // persiste — então vale devolver o passo a passo, não só o código.
    if (/fetch failed/i.test(msg) || ehTransitorio(e) || /ENOTFOUND|UND_ERR/i.test(causa)) {
      return { erro: explicarErroDeRede(e, "a API do GitHub") };
    }
    // Mensagem já escrita para ser lida: vai inteira. Cortar em 300 caracteres
    // decapitava justamente a parte que diz o que fazer.
    return { erro: e?.amigavel ? msg : msg.slice(0, 300) };
  }
}
