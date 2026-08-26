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

const EXT_OK = new Set([".js", ".json", ".md", ".yml", ".yaml", ".txt"]);
const PROIBIDOS = [/\.env/i, /token/i, /secret/i, /senha/i, /password/i, /\.db$/i];
const MAX_BYTES = 60_000;
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
    description: "Lê o código-fonte do próprio bot (somente leitura). Use para responder como o bot funciona, comentar a própria implementação ou conferir detalhes técnicos. SEMPRE comece por 'estatisticas' (visão geral: quantos arquivos, quais pastas) ou 'listar' sem caminho (árvore completa) — só depois use 'ler' com um caminho que você VIU na listagem. Nunca adivinhe nomes de arquivo.",
    parameters: {
      type: "object",
      required: ["acao"],
      properties: {
        acao: { type: "string", enum: ["estatisticas", "listar", "ler"], description: "O que fazer" },
        caminho: { type: "string", description: "Caminho relativo à raiz do repositório, ex.: 'modulos/ai/chat.js' ou 'modulos/ai'. Deixe VAZIO para a raiz — não use '.' nem '/'. Obrigatório na ação 'ler'." },
      },
    },
  },
};

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

export async function executar({ acao, caminho }) {
  caminho = normalizarCaminho(caminho);
  // ── Plano A: o disco ──
  const raiz = raizLocal();
  if (raiz) {
    try {
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
        let txt = fs.readFileSync(alvo, "utf8");
        let cortado = false;
        if (txt.length > MAX_BYTES) { txt = txt.slice(0, MAX_BYTES); cortado = true; }
        return { fonte: "disco local", caminho, linhas: txt.split("\n").length, cortado, conteudo: txt };
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
      let txt = Buffer.from(data.content || "", "base64").toString("utf8");
      let cortado = false;
      if (txt.length > MAX_BYTES) { txt = txt.slice(0, MAX_BYTES); cortado = true; }
      return { caminho, linhas: txt.split("\n").length, cortado, conteudo: txt };
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
