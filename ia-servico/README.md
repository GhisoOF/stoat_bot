# Serviço de IA da Judy

Container **separado** do bot. O bot (`stoat_bot`) continua exatamente como está —
ele só passa a mandar as mensagens para cá em vez de falar direto com o Ollama.

```
┌──────────────┐      HTTP       ┌──────────────┐      HTTP      ┌──────────┐
│  stoat_bot   │ ──────────────► │   judy-ia    │ ─────────────► │  Ollama  │
│ (Stoat/chat) │  POST /chat     │  ferramentas │  /api/chat     │  (GPU)   │
└──────────────┘                 └──────────────┘                └──────────┘
                                        │
                                        ├── ler_codigo   (do GitHub, somente leitura)
                                        ├── calcular     (sandbox isolado)
                                        ├── buscar_web   (SearXNG)
                                        └── buscar_rss   (feeds)
```

## Por que separado

- O bot é estável e não precisa mais mexer nele para adicionar capacidade de IA.
- Este container é portátil: para mover de máquina, leve a imagem e ajuste `OLLAMA_URL`.
- Se a IA cair, o bot continua moderando normalmente.

## Rotas

| Rota | O que faz |
|---|---|
| `GET /saude` | Diz se o Ollama está alcançável, quais modelos existem e quais ferramentas estão ativas |
| `GET /ferramentas` | Lista os schemas das ferramentas |
| `POST /chat` | `{ messages, modelo?, ferramentas? }` → `{ resposta, usos }` |

O `messages` é o array no formato do Ollama (o bot já monta com personalidade,
memória e histórico). Este serviço acrescenta as ferramentas e o laço de execução.

## Ferramentas

**`ler_codigo`** — lê o código-fonte do próprio bot direto do **GitHub**
(o repositório vive no homelab, não na máquina do judy-ia). Configure
`GITHUB_REPO` (ex.: `GhisoOF/stoat_bot`) e opcionalmente `GITHUB_BRANCH` e
`GITHUB_TOKEN`. **Repositório privado exige token** (fine-grained, com permissão
Contents: Read-only no repo). Repositório público funciona sem token — nesse caso
o token só eleva o limite de 60 para 5000 requisições/hora. Ações: `estatisticas`, `listar`, `ler`.
Bloqueia `.env`, tokens e arquivos binários.

**`calcular`** — executa JavaScript para fazer contas de verdade. Roda em processo
separado com o **modelo de permissões do Node** (`--permission`), que bloqueia
sistema de arquivos, `child_process` e workers — inclusive por `import()` dinâmico.
Sem rede, sem variáveis de ambiente, timeout de 5s e memória limitada.

**`buscar_web`** — busca na internet via SearXNG (`SEARXNG_URL`) quando a Judy
precisa de informação atual. Devolve os resultados; ela escreve a resposta. Exige
o formato JSON habilitado no SearXNG.

**`buscar_rss`** — busca os itens dos feeds e devolve crus; quem escreve o resumo
é a própria Judy, na voz dela. Com `RSS_FEEDS` configurado, funciona sem passar URL.

Para adicionar uma ferramenta: crie o arquivo em `ferramentas/` exportando
`definicao` e `executar(args)`, e registre em `ferramentas/index.js`.

## Modelo: precisa suportar tool calling

Nem todo modelo funciona. **Gemma não suporta ferramentas**; use Qwen, Llama 3.1+
ou Mistral. Confira a lista de modelos com a categoria *Tools* no site do Ollama.

Se as ferramentas parecerem ignoradas, o modelo provavelmente não as suporta —
troque com `OLLAMA_MODEL`.

## Subir

```bash
# ajuste o volume do código e a URL do Ollama no docker-compose.yml
docker compose up -d
curl http://localhost:8090/saude
```

A saída de `/saude` diz na hora se o Ollama está acessível e quais modelos existem.


---

## Diagnóstico

O serviço se autodiagnostica no boot e grita no log quando algo está errado:

```
[IA] ✓ DNS resolvendo
[IA] ✓ GitHub alcançável (HTTP 200)
[IA] ✓ GitHub autenticado (GhisoOF/stoat_bot)
[IA] ✓ Ollama respondendo (5 modelo(s))
[IA] ✓ diagnóstico de boot: tudo certo
```

Quando há problema, ele aparece em bloco destacado com a correção sugerida:

```
[IA] ═══════════════════════════════════════════
[IA] ⚠️  PROBLEMAS DETECTADOS NO BOOT
[IA] DNS NÃO resolve (EAI_AGAIN). O container não consegue traduzir nomes.
[IA]    → confira /etc/resolv.conf DENTRO do container:
[IA]      docker exec judy-ia cat /etc/resolv.conf
[IA]    → se estiver sem 'nameserver', o bind-mount está preso num arquivo antigo.
[IA]      Recrie: docker compose up -d --force-recreate
[IA] ═══════════════════════════════════════════
```

Verifica quatro coisas: **DNS**, **acesso à internet**, **token do GitHub**
(distinguindo ausente, expirado e sem permissão) e **Ollama**.

Sem reiniciar, dá para consultar a qualquer momento:

```bash
curl localhost:8090/diagnostico
docker logs judy-ia | grep "\[IA\]"
```

Nada disso derruba o serviço — são avisos. O bot funciona sem GitHub e sem
busca web; só perde essas capacidades.

### Por que existe

O sintoma "a Judy não consegue ler o repositório" já teve três causas
diferentes: DNS quebrado, token ausente e token expirado. Cada uma exigiu uma
investigação do zero. O diagnóstico troca isso por uma linha no log.
