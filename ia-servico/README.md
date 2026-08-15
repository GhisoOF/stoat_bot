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

## Token do GitHub

O repositório é privado, então a leitura de código **exige** um token. Sem ele a
API responde **404** (não 401) — o que engana: parece "não existe" e é "sem
permissão".

O token vive num arquivo `.env` **ao lado deste compose**, nunca dentro dele:

```bash
cd ia-servico
cp .env.example .env
nano .env          # cole o token em GITHUB_TOKEN=
docker compose up -d --force-recreate
```

**Por que num arquivo separado:** o `docker-compose.yml` é versionado e
sobrescrito a cada atualização do bot. O `.env` está no `.gitignore` e não vai
no pacote — então ele é o único lugar onde uma configuração sua sobrevive aos
deploys.

Crie o token em *github.com/settings/tokens* (fine-grained), com acesso ao
repositório e permissão **Contents: Read-only**. Prefira sem data de expiração:
token expirado devolve o mesmo 404 enganoso.

Confira que pegou:

```bash
docker exec judy-ia sh -c 'echo ${GITHUB_TOKEN:+ok}'
docker logs judy-ia | grep "\[IA\]"
```

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

## EAI_AGAIN: o DNS que para sozinho

Sintoma característico: **funcionava, ninguém mexeu em nada, e parou**. Todo
acesso à rede passa a falhar com `EAI_AGAIN`, enquanto o host resolve nomes
normalmente.

A causa é um detalhe de como o bind-mount funciona. Este compose já montou
`/etc/resolv.conf` do host dentro do container, e isso parece razoável — mas
esse arquivo costuma ser um symlink para algo que o **systemd-resolved** e o
**Tailscale** reescrevem ao reconectar. E eles não editam o arquivo: criam um
novo e renomeiam por cima. O bind-mount prende o **inode antigo**, que depois
disso não existe mais. O container fica olhando para um arquivo órfão e para de
resolver nomes — sem nenhum evento que explique.

Por isso o mount foi removido. Com `network_mode: host` ele é dispensável: o
Docker entrega o `resolv.conf` do host ao container **e o mantém atualizado**
quando o arquivo do host muda. Deixar o Docker cuidar disso é o que faz o DNS
sobreviver a reinícios do resolved e do Tailscale.

Além disso, as chamadas de rede passaram a **repetir automaticamente** falhas
transitórias (`ferramentas/rede.js`). `EAI_AGAIN` não significa "não existe":
é o resolver dizendo *tente de novo*. Três tentativas com espera crescente
(400ms, 800ms, 1600ms) absorvem a janela de alguns segundos em que o DNS está
sendo reescrito, sem que ninguém perceba. `ENOTFOUND` fica de fora de
propósito — nome que não existe não vai passar a existir na segunda tentativa.

O que sobra chega com diagnóstico em vez de `fetch failed`:

```
Não consegui alcançar a API do GitHub: o DNS não respondeu (EAI_AGAIN) mesmo
depois de algumas tentativas. Isso é rede do container, não credencial. Quase
sempre é o /etc/resolv.conf preso num arquivo antigo — recrie o container:
`docker compose up -d --force-recreate judy-ia`.
```

### A rede de segurança

Consertar o `resolv.conf` depende de mexer no host e recriar o container — e
até lá a Judy fica muda. Por isso o serviço agora **se vira sozinho**.

No boot ele testa se o resolvedor do sistema responde. Se não responde, troca o
`dns.lookup` do processo por um que usa **c-ares** com servidores públicos
(`DNS_FALLBACK`, padrão `1.1.1.1,8.8.8.8`). O c-ares aceita servidores
explícitos e **não lê o `/etc/resolv.conf`**, então funciona mesmo com o arquivo
vazio. Como o `fetch` do Node passa pelo `dns.lookup`, tudo volta a funcionar
sem que nenhuma outra parte do código precise saber.

A troca só acontece quando o sistema está realmente quebrado. Com DNS
funcionando nada muda — inclusive nomes locais e do Tailscale, que os
servidores públicos não conheceriam. `localhost` e IPs literais nunca passam
pela rede.

O log deixa claro que está funcionando *apesar* de um problema:

```
[IA] ⚠ DNS do sistema quebrado — usando 1.1.1.1, 8.8.8.8 por dentro
```

E há uma rota curta para conferir só isso:

```bash
curl localhost:8090/dns
```

Isso é contorno, não conserto: nomes internos continuam sem resolver. O reparo
de verdade é o `resolv.conf` do host.

### Se acontecer de novo

```bash
docker exec judy-ia cat /etc/resolv.conf     # tem linha "nameserver"?
docker exec judy-ia getent hosts api.github.com
curl localhost:8090/diagnostico
```

**Recriar, não reiniciar** — `restart` mantém o namespace de rede e os mounts
antigos:

```bash
docker compose up -d --force-recreate judy-ia
```
