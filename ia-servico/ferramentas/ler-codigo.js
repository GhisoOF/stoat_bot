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

const REPO   = process.env.GITHUB_REPO || "";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN  = process.env.GITHUB_TOKEN || "";

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
  const r = await fetch(url, { headers: cabecalhos(), signal: AbortSignal.timeout(15000) });
  if (r.status === 403) throw new Error("limite de requisições do GitHub atingido (adicione GITHUB_TOKEN).");
  if (r.status === 404) throw new Error("repositório ou caminho não encontrado — se o repo for privado, é preciso um GITHUB_TOKEN com acesso a ele.");
  if (!r.ok) throw new Error(`GitHub HTTP ${r.status}`);
  return r.json();
}

// Árvore recursiva (uma chamada) — boa para listar e estatísticas.
async function arvore() {
  const url = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
  const r = await fetch(url, { headers: cabecalhos(), signal: AbortSignal.timeout(15000) });
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
    // Distinguir isso do erro de token poupa muito tempo de diagnóstico.
    if (/fetch failed/i.test(msg) || /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|UND_ERR/i.test(causa)) {
      return { erro: `Não consegui alcançar a API do GitHub (${causa || "rede"}). Isso é problema de REDE do serviço de IA, não do token: confira se o container tem internet e DNS (teste: docker exec judy-ia node -e "fetch('https://api.github.com').then(r=>console.log(r.status))").` };
    }
    if (/aborted|timeout/i.test(msg)) {
      return { erro: "A API do GitHub demorou demais para responder (timeout de 15s). Tente de novo." };
    }
    return { erro: msg.slice(0, 300) };
  }
}
