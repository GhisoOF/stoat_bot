# Serviço de IA da Judy

Container **separado** do bot. O bot (`stoat_bot`) continua exatamente como está —
ele só manda as mensagens para cá.

## llama.cpp no lugar do Ollama

O serviço fala o formato **OpenAI** (`/v1/chat/completions`) — servido
igualmente pelo `llama-server` do llama.cpp, pelo **llama-swap** e pelo
próprio Ollama. Trocar de backend é trocar a `LLM_URL`; nenhum código muda.

A configuração recomendada está em `docker-compose.example.yml` +
`llama-swap.example.yaml`: o llama-swap fica na frente e sobe um
`llama-server` por modelo conforme o campo `model` do pedido, com `ttl` para
descarregar — o "vários modelos por nome" do Ollama, com o custo do
llama.cpp (GGUF direto do disco, contexto alocado uma vez no boot, imagem
**Vulkan** — na RX 9060 XT/RDNA4, Vulkan funciona onde o ROCm ainda é
loteria). `--jinja` no llama-server é obrigatório para as ferramentas.

Variáveis: `LLM_URL` (ex.: `http://llama:8080`), `LLM_MODEL`,
`LLM_MODEL_VISAO` (multimodal; sem ela a ferramenta de visão nem aparece),
`SD_URL` (geração de imagem, API do A1111/Forge; idem), `CONTINUAR_MAX`
(emendas automáticas de resposta cortada, padrão 2).

## Código local no lugar do GITHUB_TOKEN

`CODIGO_DIR=/repo` + o volume `~/Downloads/github:/repo:ro` no compose fazem
a ferramenta `ler_codigo` ler o repositório do **disco** — o mesmo que o
deploy acabou de descompactar. Sem token para sumir no deploy, sem limite de
requisições, sem rede. O GitHub continua como plano B quando o volume não
está montado (aí valem `GITHUB_REPO`/`GITHUB_TOKEN` como antes).

## Imagens: ver e gerar, sem engolir bytes de ninguém

Toda imagem — recebida (`ver_imagem`) ou produzida (`gerar_imagem`) — é
**reescrita** pelo `sharp` dentro deste container: os pixels são
decodificados e um JPEG novo é emitido. Metadados, payloads em chunks e
arquivos-poliglota morrem na reescrita; o que não decodifica não era imagem
honesta e para aqui, não no cliente de quem vê a mensagem. Downloads: só
`https`, só hosts do CDN do Stoat (`IMAGEM_HOSTS_PERMITIDOS`), teto de bytes
durante o streaming e teto de pixels no decodificador (`limitInputPixels`,
contra bomba de descompressão). Geração: filtro de prompt por combinação
(menores+sexual, pessoa real+nudez, gore, símbolos de ódio) recusa ANTES de
chamar o gerador, e o negative prompt fixo reforça do outro lado; dimensões
e passos têm teto para a GPU não virar refém de um comando.

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
o token só eleva o limite de 60 para 5000 requisições/hora. Bloqueia `.env`,
tokens e arquivos binários.

Ações:

- **`buscar`** `{ termo }` — o ponto de partida. Devolve os arquivos que casam
  com o termo **pelo nome** (`tts` → `tts.js`, `tts-filtro.js`, nome curto
  primeiro) e **pelo conteúdo** (quantas linhas citam o termo, e a primeira
  delas). Sem acento, sem maiúscula. Pelo GitHub (plano B) só o nome é varrido.
- **`ler`** `{ caminho, linha_inicial?, quantidade?, termo? }` — devolve uma
  **página** de linhas numeradas (padrão 300, máximo 600), com `linhas_totais`,
  `intervalo` e, se houver mais, `proxima_linha` para continuar. Com `termo`, a
  página abre 15 linhas antes da primeira ocorrência — e avisa se o termo não
  aparece no arquivo (sinal de arquivo errado). O corte antigo era por bytes,
  sempre do começo: um arquivo de 1400 linhas virava as 300 primeiras e um
  `cortado: true` que o modelo ignorava.
- **`listar`** `{ caminho? }` e **`estatisticas`** — visão geral da árvore.

Depois de qualquer leitura, o serviço injeta uma instrução de três partes:
descrever **só o que está no conteúdo lido**; se o arquivo não responde à
pergunta, **dizer** e buscar outro; função ou arquivo que não apareceu **não
existe**. Foi a resposta a um caso real — perguntada sobre TTS, leu
`modulos/ai/chat.js` e descreveu funções inventadas.

`MAX_VOLTAS_FERRAMENTA` (padrão 6) é o teto de idas e vindas com ferramentas
numa resposta; o fluxo buscar → ler → página seguinte cabe com folga.
`CODIGO_PAGINA_LINHAS` muda o tamanho padrão da página.

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
cp .env.example .env
nano .env                 # GITHUB_TOKEN e OLLAMA_URL
node servidor.js          # teste em primeiro plano
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
sudo rc-service judy-ia restart
```

**Por que num arquivo separado:** o serviço é versionado e
sobrescrito a cada atualização do bot. O `.env` está no `.gitignore` e não vai
no pacote — então ele é o único lugar onde uma configuração sua sobrevive aos
deploys.

Crie o token em *github.com/settings/tokens* (fine-grained), com acesso ao
repositório e permissão **Contents: Read-only**. Prefira sem data de expiração:
token expirado devolve o mesmo 404 enganoso.

Confira que pegou:

```bash
grep GITHUB_TOKEN .env
grep "\[IA\]" /var/log/judy-ia.log
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

## Busca web (SearXNG) — opcional

Está **desligada** por padrão: sem `SEARXNG_URL` no `.env`, o bot nem gasta
inferência decidindo se deveria buscar.

Se quiser ligar, o SearXNG precisa rodar nativamente (a receita antiga era em
container e foi removida junto com o resto do Docker). O detalhe que custa
tempo redescobrir está no `searxng-settings.example.yml` desta pasta:

```yaml
search:
  formats:
    - html
    - json      # ← sem isto, /search?format=json devolve 403 Forbidden
```

Depois é só apontar `SEARXNG_URL=http://localhost:8080` no `.env`.

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
sudo rc-service judy-ia restart
```

Para conferir sem adivinhar:

```bash
grep -q GITHUB_TOKEN ia-servico/.env && echo definido || echo VAZIO
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
[IA]      cat /etc/resolv.conf
[IA]    → se estiver sem 'nameserver', o bind-mount está preso num arquivo antigo.
[IA]      Recrie: sudo rc-service judy-ia restart
[IA] ═══════════════════════════════════════════
```

Verifica quatro coisas: **DNS**, **acesso à internet**, **token do GitHub**
(distinguindo ausente, expirado e sem permissão) e **Ollama**.

Sem reiniciar, dá para consultar a qualquer momento:

```bash
curl localhost:8090/diagnostico
grep "\[IA\]" /var/log/judy-ia.log
```

Nada disso derruba o serviço — são avisos. O bot funciona sem GitHub e sem
busca web; só perde essas capacidades.

### Por que existe

O sintoma "a Judy não consegue ler o repositório" já teve três causas
diferentes: DNS quebrado, token ausente e token expirado. Cada uma exigiu uma
investigação do zero. O diagnóstico troca isso por uma linha no log.

## EAI_AGAIN: quando o DNS para sozinho

Sintoma característico: **funcionava, ninguém mexeu em nada, e parou**. Todo
acesso à rede passa a falhar com `EAI_AGAIN`.

`EAI_AGAIN` não significa "esse nome não existe" — é o resolver dizendo *tente
de novo*. Costuma acontecer quando o `/etc/resolv.conf` é reescrito: o
**Tailscale** e o **systemd-resolved** fazem isso ao reconectar, e há uma
janela de segundos em que nada resolve.

Duas defesas, nesta ordem:

**Retentativa automática** (`ferramentas/rede.js`). Três tentativas com espera
crescente (400ms, 800ms, 1600ms) absorvem a janela sem ninguém perceber.
`ENOTFOUND` fica de fora de propósito — nome que não existe não vai passar a
existir na segunda tentativa.

**DNS de emergência** (`dns-fallback.js`). Se o `/etc/resolv.conf` ficar sem
nenhuma linha `nameserver` — acontece, e aí `getaddrinfo` falha em tudo — o
serviço passa a resolver por **c-ares** com servidores explícitos
(`DNS_FALLBACK`), que não lê esse arquivo. Como o `fetch` do Node usa
`dns.lookup`, tudo volta a funcionar sem nenhuma outra parte do código saber.

A troca só acontece com o resolvedor do sistema realmente quebrado. A **ordem**
importa: numa máquina com Tailscale, ponha o MagicDNS (`100.100.100.100`) na
frente — é o único que resolve os nomes internos `*.ts.net`. Os públicos ficam
atrás, como reserva.

```
[IA] ⚠ DNS do sistema quebrado — usando 100.100.100.100, 1.1.1.1 por dentro
```

Isso é contorno, não conserto: o reparo de verdade é o `/etc/resolv.conf`.

### Se acontecer

```bash
cat /etc/resolv.conf                  # tem linha "nameserver"?
getent hosts api.github.com
curl localhost:8090/dns               # qual caminho está em uso
curl localhost:8090/diagnostico
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
sudo rc-service judy-ia restart
```

Para conferir sem adivinhar:

```bash
grep -q GITHUB_TOKEN ia-servico/.env && echo definido || echo VAZIO
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
[IA]      cat /etc/resolv.conf
[IA]    → se estiver sem 'nameserver', o bind-mount está preso num arquivo antigo.
[IA]      Recrie: sudo rc-service judy-ia restart
[IA] ═══════════════════════════════════════════
```

Verifica quatro coisas: **DNS**, **acesso à internet**, **token do GitHub**
(distinguindo ausente, expirado e sem permissão) e **Ollama**.

Sem reiniciar, dá para consultar a qualquer momento:

```bash
curl localhost:8090/diagnostico
grep "\[IA\]" /var/log/judy-ia.log
```

Nada disso derruba o serviço — são avisos. O bot funciona sem GitHub e sem
busca web; só perde essas capacidades.

### Por que existe

O sintoma "a Judy não consegue ler o repositório" já teve três causas
diferentes: DNS quebrado, token ausente e token expirado. Cada uma exigiu uma
investigação do zero. O diagnóstico troca isso por uma linha no log.

