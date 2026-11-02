// modelo-enderecos.js — a chave e os endereços da IA da moderação, sem dependência nenhuma
// (P4, 2 nov 2026, revisão).
//
// O ia-servico (outro processo) precisa da mesma leitura da chave que o bot. Antes ele a
// importava do modelo.js, que importa o core/env.js — e o env.js, ao carregar, mexe no
// process.env (os padrões do bot) no processo errado. Aqui fica só a leitura, lida na hora
// (o iniciar.js define os nomes no boot; os testes trocam): o modelo.js reexporta, o
// ia-servico importa daqui. Uma fonte só (R10/DRY). Para tirar a IA: vai junto do modelo.js.

// A chave do ia-servico: IA_SERVICO_CHAVE ou IA_CHAVE (o serviço aceita as duas).
export const chaveServicoIA = () => process.env.IA_SERVICO_CHAVE || process.env.IA_CHAVE || "";
export const servicoUrl = () => (process.env.IA_SERVICO_URL || "").replace(/\/$/, "");
export const llmUrl = () => (process.env.LLM_URL || "").replace(/\/$/, "");
