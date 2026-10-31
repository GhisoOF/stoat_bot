// github-api.js — o cliente único da API do GitHub (31 out 2026, P2).
//
// Eram dois: o do bot (github.js — a Judy lê o histórico dela) e o do ia-servico
// (ler-codigo.js — a ferramenta que lê o código no GitHub), cada um com os seus
// cabeçalhos, o seu teto de tempo e a sua tradução de erro. Aqui: a URL da API, os
// cabeçalhos (o GITHUB_TOKEN só quando existe), o teto de tempo e de tamanho, e o
// erro por status. Quem chama decide o que dizer de um 404.
import { buscarSeguro, lerTexto } from "../core/seguranca.js";

export const API_GITHUB = "https://api.github.com";

export function cabecalhosGithub(token = process.env.GITHUB_TOKEN) {
  const h = { accept: "application/vnd.github+json", "user-agent": "JudyBot (stoat)", "x-github-api-version": "2022-11-28" };
  if (token) h.authorization = `Bearer ${token}`;
  return h;
}

// GET <API>/<caminho> → o JSON. Erro: `.status` e, no 404/422, `.naoAchou`.
// `buscar(url, opcoes)`: quem faz o pedido (padrão: buscarSeguro — só internet pública).
export async function pedirGithub(caminho, { buscar = (u, o) => buscarSeguro(u, o), timeoutMs = Number(process.env.GITHUB_TIMEOUT_MS || 8000), limite = 3 * 1024 * 1024 } = {}) {
  const url = `${API_GITHUB}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
  const r = await buscar(url, { headers: cabecalhosGithub(), signal: AbortSignal.timeout(timeoutMs) });
  const falha = (msg, extra = {}) => Object.assign(new Error(msg), { status: r.status }, extra);
  if (r.status === 404 || r.status === 422) throw falha("não existe nesse repositório", { naoAchou: true });
  if (r.status === 401) throw falha("GITHUB_TOKEN inválido ou vencido (repositório público funciona sem ele)");
  if (r.status === 403 || r.status === 429) throw falha("limite da API do GitHub atingido (GITHUB_TOKEN aumenta o limite)");
  if (!r.ok) throw falha(`GitHub respondeu HTTP ${r.status}`);
  return JSON.parse(await lerTexto(r, limite));   // com teto: resposta da internet
}
