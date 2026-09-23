# Serviço de IA da Judy

Tudo que a Judy faz com modelo de linguagem passa por aqui: conversa, busca na
web, leitura do próprio código, visão e geração de imagem.

Ele **roda dentro do container do bot**, em `127.0.0.1:8090`, subido pelo
`iniciar.js` junto com o bot. Não é um container separado nem um serviço do
sistema: se o bot está de pé, ele está de pé.

> Versões antigas rodavam como container próprio ou como serviço OpenRC
> (`rc-service judy-ia`), falando com um Ollama nativo. Nada disso existe mais.
> Um `.env` de antes continua valendo: os nomes internos têm prioridade sobre
> os amigáveis (veja `modulos/core/env.js`).

## Como falar com ele

| Rota | Para quê |
|---|---|
| `GET /saude` | o LLM responde? quais modelos, qual o padrão, quais ferramentas |
| `GET /dns` | só o estado do DNS (sem rodar o diagnóstico inteiro) |
| `GET /diagnostico` | rede, GitHub, token e LLM, em ordem |
| `GET /ferramentas` | os schemas das ferramentas |
| `POST /ferramenta` | executa uma direto: `{ nome, args }` |
| `POST /chat` | a conversa, com tool calling: `{ messages, modelo, idioma }` |

Se `IA_SERVICO_CHAVE` estiver definida, toda rota exige o header `x-chave`.

```bash
docker exec stoat-bot curl -s localhost:8090/saude
docker exec stoat-bot curl -s localhost:8090/diagnostico
```

## O LLM

Serve qualquer servidor com a API de chat da OpenAI: o `llama-server` do
llama.cpp (o padrão, embutido), o llama-swap na frente dele, ou uma plataforma
online. O que muda é o `.env`:

```ini
IA_MODO=local      # llama.cpp dentro do container; MODELO baixa no boot
MODELO=usuario/repositorio:Q4_K_M
MODELO_VISAO=...   # opcional: liga a ferramenta ver_imagem

IA_MODO=online     # plataforma externa
TOKEN_IA=...       # vira Authorization: Bearer
```

O `.env` inteiro chega ao container (o compose usa `env_file`). Para conferir o
que **de fato** chegou, que é o que vale:

```bash
docker exec stoat-bot printenv | grep -E 'IA_MODO|MODELO|LLM_URL'
```

Variável nova exige **recriar** o container (`docker compose up -d
--force-recreate stoat-bot`); `restart` não aplica.

## Ferramentas

`calcular`, `buscar_web` (SearXNG), `buscar_rss`, `ler_codigo`, `ver_imagem` e
`gerar_imagem`. Nenhum `executar` lança: erro vira `{ erro }` e volta para o
modelo, que explica em vez de travar.

Quais aparecem depende do ambiente: `ver_imagem` exige `MODELO_VISAO`;
`gerar_imagem` exige `IMAGEM≠0` e um backend (o sd.cpp embutido ou `SD_URL`);
`FERRAMENTAS_OFF=calcular,buscar_rss` desliga por nome.

## Coisas aprendidas doendo

**O modelo precisa suportar tool calling.** Sem isso ele inventa a resposta em
vez de usar a ferramenta, e parece que o serviço está quebrado.

**Chamada de ferramenta que chega como texto.** Alguns templates não convertem
a chamada em `tool_calls` e o modelo escreve o JSON no meio da resposta. O
servidor varre blocos ```` ```json ```` e objetos por chaves balanceadas
(regex não fecha objeto aninhado), só executa nomes que existem e deduplica.

**Um `system` só, no começo.** As mensagens são normalizadas antes de sair:
vários `system`, ou um no meio, quebram o template de vários modelos.

**Contexto estoura em silêncio.** Um arquivo grande mais o prompt passavam de
8192 tokens e o corte de emergência descartava justamente o que tinha sido
lido — a IA dizia que "não recebeu o arquivo". Hoje o `ler_codigo` tem teto de
400 linhas por chamada e o servidor não relê arquivo já injetado. Com modelo
que aguente, use `LLAMA_CTX=32768`.

**Imagem nunca vai crua para o modelo.** O `ver_imagem` só baixa de uma
allowlist de hosts (que inclui sempre o host de `CDN_URL`), segue no máximo 2
redirects **revalidando o destino**, limita a 8 MB e 32 MP, e reescreve tudo
com `sharp` — aplicando a rotação EXIF e **jogando o EXIF fora**.

**`EAI_AGAIN` é rede, não credencial.** A Tailscale reescreve o
`/etc/resolv.conf` e o container fica com um inode velho; aí toda chamada falha
com `fetch failed`, cuja causa real está em `e.cause.code`. Há um DNS de
emergência (`DNS_FALLBACK`, padrão `1.1.1.1,8.8.8.8`) que entra sozinho quando
o resolvedor do sistema falha. `DNS_FALLBACK=off` desliga.

**GitHub expirado responde `404`, não `401`.** O `ler_codigo` lê o código local
por padrão (`CODIGO_DIR`, que aponta para `/app`), sem rede nem token. Só usa a
API quando `GITHUB_REPO` está definido — e aí, num repo privado sem token, o
GitHub finge que o repositório não existe.

## Quando algo não funciona

```bash
bash scripts/judy-diag.sh          # container, IA, voz e configuração
docker logs --since 30m stoat-bot  # o log é um só
```
