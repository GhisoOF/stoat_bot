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

## Ollama só aceita conexão local (OpenRC)

Sintoma: `ollama list` funciona na máquina do Ollama, mas o bot diz
**"IA indisponível — o servidor está desligado ou inacessível"**.

O `ollama list` fala com o servidor por `127.0.0.1`, então ele funcionar prova
que o daemon está no ar — e que o problema é o **endereço em que ele escuta**.
Por padrão o Ollama aceita só conexões locais; de outra máquina, nada entra.

Confirme de onde vem a falha:

```bash
# na máquina do Ollama
curl -s localhost:11434/api/tags | head -c 100      # responde?

# no Umbrel (ou de onde o bot roda)
curl -s --max-time 5 http://100.74.70.106:11434/api/tags | head -c 100
```

Responder no primeiro e não no segundo confirma o diagnóstico. Em **OpenRC**
(Gentoo), o ajuste fica em `/etc/conf.d/ollama`:

```sh
export OLLAMA_HOST="0.0.0.0:11434"
```

E então:

```bash
sudo rc-service ollama restart
sudo rc-update add ollama default     # se ainda não sobe no boot
```

Se preferir não expor na rede local, use o IP do Tailscale em vez de
`0.0.0.0` — assim só quem está na sua tailnet alcança:

```sh
export OLLAMA_HOST="100.74.70.106:11434"
```

## O token que some no deploy

Sintoma: tudo funciona, a rede está boa, e a leitura do repositório responde
**404**. Não é "o arquivo não existe" — em repositório **privado** o GitHub
responde 404 em vez de 401/403 de propósito, para não revelar que o repo
existe. Ou seja: 404 aqui quase sempre significa **sem credencial**.

E a credencial some sozinha. O procedimento de deploy apaga a pasta antes de
descompactar a versão nova:

```bash
rm -rf modulos scripts ia-servico ia-stack   # ← leva o ia-servico/.env junto
unzip -o stoat_bot-*.zip
```

O `.env` está no `.gitignore` (então não vai para o repositório, o que é
correto), mas justamente por isso ele também não volta no `unzip`. O container
sobe normalmente, sem erro nenhum, e só o acesso ao código quebra.

**Guarde uma cópia fora da pasta:**

```bash
cp ia-servico/.env ~/judy-github.env      # uma vez
```

E restaure ao fim de cada deploy:

```bash
cp ~/judy-github.env ia-servico/.env
docker compose -f ia-servico/docker-compose.yml up -d --build --force-recreate judy-ia
```

Para conferir sem adivinhar:

```bash
docker exec judy-ia sh -c 'echo ${GITHUB_TOKEN:+definido}${GITHUB_TOKEN:-VAZIO}'
curl -s localhost:8090/diagnostico
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
funcionando nada muda. `localhost` e IPs literais nunca passam pela rede.

A **ordem** dos servidores importa. Nesta máquina o host usa o MagicDNS do
Tailscale (`100.100.100.100`), então ele vem primeiro: como o container usa a
rede do host, esse endereço é alcançável, e é o único que resolve os nomes
internos `*.ts.net`. Os públicos ficam atrás, para o caso de o Tailscale estar
fora do ar. Numa máquina sem Tailscale, deixe só os públicos.

O log deixa claro que está funcionando *apesar* de um problema:

```
[IA] ⚠ DNS do sistema quebrado — usando 1.1.1.1, 8.8.8.8 por dentro
```

E há uma rota curta para conferir só isso:

```bash
curl localhost:8090/dns
```

Isso é contorno, não conserto. O reparo de verdade é o container voltar a ver o
`resolv.conf` do host — mas com o MagicDNS na frente da lista, nem os nomes
internos se perdem enquanto isso.

### O caso real que originou isto

O host estava com o arquivo do Tailscale:

```
# resolv.conf(5) file generated by tailscale
# DO NOT EDIT THIS FILE BY HAND -- CHANGES WILL BE OVERWRITTEN
nameserver 100.100.100.100
```

E o container, com um `dhcpcd` anterior à chegada do Tailscale — só cabeçalhos,
sem `nameserver` nenhum. O próprio arquivo avisa que é sobrescrito; o
bind-mount ficou preso na versão de antes. Meses depois, sem ninguém tocar em
nada, o DNS do container simplesmente não existia mais.

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
