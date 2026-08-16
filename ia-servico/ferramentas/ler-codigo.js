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
      + `\n\nO token vem do arquivo \`.env\` ao lado do docker-compose.yml do judy-ia.`
      + ` Ele costuma sumir quando o diretório \`ia-servico\` é apagado e recriado no deploy.`
      + `\n\nRefazer:  \`echo "GITHUB_TOKEN=github_pat_..." > ia-servico/.env\``
      + ` e subir de novo com \`docker compose up -d --force-recreate judy-ia\`.`);
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
    description: "Lê o código-fonte do próprio bot direto do repositório no GitHub (somente leitura). Use para responder como o bot funciona, contar curiosidades sobre a própria implementação ou conferir detalhes técnicos. Ações: 'estatisticas' (totais de linhas/arquivos), 'listar' (árvore de arquivos), 'ler' (conteúdo de um arquivo).",
    parameters: {
      type: "object",
      required: ["acao"],
      properties: {
        acao: { type: "string", enum: ["estatisticas", "listar", "ler"], description: "O que fazer" },
        caminho: { type: "string", description: "Caminho do arquivo, ex.: 'modulos/ai/chat.js'. Obrigatório na ação 'ler'." },
      },
    },
  },
};

export async function executar({ acao, caminho }) {
  if (!REPO) return { erro: "GITHUB_REPO não configurado no serviço." };

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
