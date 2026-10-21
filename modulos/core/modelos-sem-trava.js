// Modelos sem a trava do fabricante (22 out 2026).
//
// Ghieh: "vamos eliminar o NSFW e deixar modelos que tenham bloqueio disso;
// menos dor de cabeça." O bot não tem mais modo +18, e o padrão é sempre um
// modelo oficial. Se o .env apontar para uma versão "uncensored",
// "abliterated" ou parecida, o boot avisa no log — a Judy continua
// funcionando (as recusas do bot e a conferência de toda imagem pela visão
// seguem valendo), mas a primeira linha de defesa, o próprio modelo, some.
import { urlsDoModelo } from "./imagem-modelo.js";

// nomes comuns de versões com a trava removida
export const SEM_TRAVA = /uncensored|abliterat|hauhau|heretic|unfiltered|dolphin|lewd|nsfw|[-_.]uc[-_.]/i;

const CHAVES_LLM = ["MODELO", "MODELO_VISAO", "MODELO_MODERACAO",
  "LLM_MODEL", "LLM_MODEL_VISAO", "LLM_MODEL_MODERACAO", "LLM_MODEL_JUIZ", "LLM_MODEL_DECISAO", "LLM_MODEL_LEVE"];

// [{ chave, valor }] — o que no .env parece sem trava
export function modelosSemTrava(env = process.env) {
  const achados = [];
  for (const chave of CHAVES_LLM) {
    const valor = String(env[chave] ?? "").trim();
    // o mesmo modelo em dois papéis (MODELO e o LLM_MODEL que o boot deriva dele) aparece uma vez só
    if (valor && SEM_TRAVA.test(valor) && !achados.some((a) => a.valor === valor)) achados.push({ chave, valor });
  }
  if (String(env.IMAGEM ?? "1").trim() !== "0" && !String(env.SD_URL ?? "").trim()) {
    for (const [papel, url] of Object.entries(urlsDoModelo(env))) {
      if (url && SEM_TRAVA.test(url)) achados.push({ chave: `imagem (${papel})`, valor: url });
    }
  }
  return achados;
}

export function avisoSemTrava(env = process.env) {
  const achados = modelosSemTrava(env);
  if (!achados.length) return null;
  return "[INICIAR] ⚠️ Modelo(s) sem a trava do fabricante no .env — a Judy não tem modo +18 e o recomendado é a versão oficial:\n"
    + achados.map((a) => `  • ${a.chave} = ${a.valor}`).join("\n")
    + "\n  (ex.: MODELO=unsloth/gemma-4-E2B-it-GGUF:Q4_K_M; ver .env.example)";
}
