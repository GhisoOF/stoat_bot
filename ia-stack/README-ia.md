# Stack de IA local para o Cobaia (Ollama + SearXNG)

Adiciona ao bot um comando `&chat` (e resposta por menção) com um **LLM pequeno
rodando 100% local** e **busca na internet via SearXNG self-hosted** — sem
nenhuma chave ou API externa.

> ⚠️ **Expectativa de desempenho no Aocwei A7 (Celeron N5095, 8 GB):** inferência
> em CPU é lenta. Com o Qwen3 0.6B, espere respostas em **15–40 segundos** e
> qualidade de **assistente básico** (bom para perguntas diretas e resumos;
> fraco em raciocínio complexo). Não é um ChatGPT local — é um assistente
> modesto, porém privado.

## O que sobe

Três containers (no `docker-compose.yml` desta pasta):

- **ollama** (`:11434`) — roda o modelo. Limitado a 2 dos 4 núcleos e 3 GB de RAM.
- **searxng** (`:8080`) — metabusca privada; devolve JSON para o bot.
- **redis** — cache efêmero do SearXNG.

## Passo a passo

### 1. Gere o segredo do SearXNG

Edite `searxng/settings.yml` e troque `secret_key` por um valor aleatório:

```bash
openssl rand -hex 32
```

### 2. Suba a stack

```bash
cd ia-stack
docker compose up -d
```

### 3. Baixe o modelo (uma vez)

O container do Ollama sobe vazio. Baixe o Qwen3 0.6B:

```bash
docker exec -it ollama ollama pull qwen3:0.6b
```

Para testar direto:

```bash
docker exec -it ollama ollama run qwen3:0.6b "diga olá em uma frase"
```

### 4. Verifique o SearXNG (JSON)

```bash
curl "http://localhost:8080/search?q=teste&format=json" | head
```

Se vier **403**, o `formats: [html, json]` não foi aplicado — confirme que o
`settings.yml` está montado e reinicie: `docker compose restart searxng`.

### 5. Conecte o bot

O Cobaia fala com os dois serviços por variáveis de ambiente. Como o bot roda
com `network_mode: host`, use `localhost`:

```
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=qwen3:0.6b
SEARXNG_URL=http://localhost:8080
CHAT_NUM_CTX=2048
```

Adicione-as ao ambiente do container do bot (no Portainer, em *Env*), e faça o
redeploy. Pronto: `&chat sua pergunta` ou mencione o bot.

## Uso

```
&chat me explique o que é RAID 5
&chat quem ganhou a última corrida de F1?      (isto dispara uma busca)
@Cobaia qual a capital da Austrália?
```

O bot decide sozinho se precisa buscar (fatos atuais, notícias, preços…) ou se
responde direto (conversa, conhecimento geral).

## Tratamento antes da IA (pré-filtro)

Antes de gastar o modelo, o bot faz uma triagem simples por regras (sem IA):
mensagens vazias, só pontuação/emoji, um caractere repetido (`aaa`, `???`) ou uma
palavra solta sem contexto são respondidas com um "🤔 Não entendi" e **não** chegam
à IA. Isso economiza CPU e evita respostas sem propósito.

O bot também informa ao modelo, a cada conversa, **a data de hoje** (para não
inventar datas) e **o nome de quem está falando** (para reconhecer o interlocutor).

## Limitações embutidas

Por segurança e para proteger o hardware, o `&chat` já vem com dois limites:

- **1 mensagem por vez** — enquanto uma conversa está sendo processada, outras
  são recusadas com um aviso (evita sobrecarregar a CPU/RAM do A7 com pedidos
  simultâneos). É global, vale para o comando e para as menções.
- **Restrito a um servidor** — por padrão só funciona no servidor
  `01KH9SJYWVD7XAHJ28TP0YP4Q0`. Em qualquer outro, o comando responde
  "indisponível" e as menções são ignoradas.

Para mudar os servidores permitidos, use a variável de ambiente do bot:

```
CHAT_SERVIDORES=01KH9SJYWVD7XAHJ28TP0YP4Q0          # só este (padrão)
CHAT_SERVIDORES=id1,id2,id3                         # vários
CHAT_SERVIDORES=*                                   # todos
```

## Ajustes de desempenho

Tudo já vem conservador para o A7. Se quiser mexer:

| O quê | Onde | Efeito |
|---|---|---|
| Núcleos do Ollama | `cpus: "2.0"` no compose | mais núcleos = mais rápido, menos sobra p/ o sistema |
| Descarregar da RAM | `OLLAMA_KEEP_ALIVE=5m` | menor = libera RAM antes, mas recarrega (lento) na próxima |
| Contexto | `CHAT_NUM_CTX=2048` | maior = lembra mais, gasta mais RAM/tempo |
| Modelo | `OLLAMA_MODEL` | ver abaixo |
| Servidores permitidos | `CHAT_SERVIDORES` | quais servidores podem usar o chat |

## Subir de modelo (quando quiser mais qualidade)

**Se o Ollama roda numa GPU com bastante VRAM** (ex.: 16 GB), vale muito usar um
modelo maior que o 0.6B. Guia rápido por VRAM (quantização Q4_K_M):

| VRAM | Modelo recomendado | Comando |
|---|---|---|
| ~4 GB | `qwen3:1.7b` | `ollama pull qwen3:1.7b` |
| 8 GB | `llama3.2:8b` | `ollama pull llama3.2:8b` |
| **16 GB** | **`qwen3:14b`** (melhor equilíbrio) | `ollama pull qwen3:14b` |
| 16 GB | `gemma3:27b` (topo, mais lento) | `ollama pull gemma3:27b` |

### Trocar de modelo pelo próprio bot (sem redeploy)

Você pode listar e trocar o modelo direto no chat, sem mexer no compose:

```
&chat modelo                 # lista os modelos instalados no Ollama (marca o ativo)
&chat modelo 2               # troca pelo número da lista
&chat modelo qwen3           # troca por nome (parcial funciona)
```

A lista é lida do Ollama na hora, então qualquer modelo que você baixar
(`ollama pull ...`) aparece automaticamente — sem reiniciar o bot. A troca
exige **ManagePermissions** e é lembrada mesmo após reiniciar o bot.

Depois de baixar, troque `OLLAMA_MODEL` para o nome exato e redeploy do bot.
Nada de código muda. Modelos "pensantes" (Qwen3, DeepSeek-R1) emitem blocos de
raciocínio — o bot já os remove automaticamente.

> Com mais VRAM, o contexto (`CHAT_NUM_CTX`, padrão **16384**) e o teto de
> resposta (`CHAT_MAX_TOKENS`, padrão **4096**) permitem respostas longas —
> como gerar código com interface. Respostas muito grandes são fragmentadas
> automaticamente em várias mensagens, preservando os blocos de código.
> O tempo-limite (`CHAT_TIMEOUT`) é de 5 min por padrão, pois código longo
> demora mais para gerar.

### (legado) subir de modelo em máquinas pequenas

O 0.6B é o ponto de partida seguro. Para tentar mais qualidade (ainda cabe nos
~3 GB livres do A7):

```bash
docker exec -it ollama ollama pull qwen3:1.7b
```

Depois troque `OLLAMA_MODEL=qwen3:1.7b` e redeploy do bot. Se a máquina começar
a usar swap ou travar, volte para o 0.6B. **Não** tente modelos 7B nesta máquina.

## Curadoria de notícias por RSS

O bot também pode virar um **curador de notícias**: você cadastra feeds RSS e, a
cada hora, ele busca as notícias novas, **resume tudo com o LLM local** e posta
num canal — com as fontes no final. Usa o mesmo Ollama do `&chat`.

```
&rss add https://exemplo.com/feed.xml   # cadastra um feed
&rss canal aqui                          # define onde os resumos saem
&rss list                                # lista os feeds (com IDs)
&rss remove <id>                         # remove um feed
&rss agora                               # força um ciclo agora (teste)
&rss                                     # status
```

Ao adicionar um feed, o conteúdo atual é marcado como "visto" — você só recebe as
**próximas** notícias. A cada ciclo, o bot junta as novidades num resumo único e
lista as fontes (título · feed · horário · link).

**Limites e restrições:**
- Só funciona no servidor permitido (mesma allowlist do `&chat`).
- Teto de itens por ciclo (`RSS_MAX_ITENS`, padrão 15) para não afogar o A7.
- Intervalo configurável (`RSS_INTERVALO_MS`, padrão 3600000 = 1 h).

| Variável | Padrão | Descrição |
|---|---|---|
| `RSS_MAX_ITENS` | 15 | máximo de notícias resumidas por ciclo |
| `RSS_INTERVALO_MS` | 3600000 | intervalo entre ciclos (ms) |

> ⚠️ Muitos feeds com muitas notícias = muito tempo de LLM em CPU. Comece com
> poucos feeds e observe o tempo do `&rss agora` antes de cadastrar dezenas.

## Servidor de IA em outra máquina (sob demanda)

Se você roda o Ollama numa máquina mais forte (ligada só quando quer usar),
aponte o bot para o **IP Tailscale** dessa máquina:

```
OLLAMA_URL=http://100.x.y.z:11434     # IP Tailscale da máquina do Ollama
OLLAMA_MODEL=qwen3:0.6b               # ou o modelo que você baixou nela
SEARXNG_URL=http://100.x.y.z:8080     # se o SearXNG também estiver lá
```

Descubra o IP com `tailscale ip -4` na máquina do Ollama. Requisitos:

- O Ollama precisa aceitar conexões da rede. **Em Docker ele já escuta em
  `0.0.0.0`** por padrão — só confirme que a porta está publicada
  (`-p 11434:11434`) e que o Tailscale roda **no host**.
- Teste do A7: `curl http://100.x.y.z:11434/api/tags` deve listar os modelos.

**Comportamento quando a máquina está desligada:** o bot detecta na hora e avisa
"💤 IA indisponível — ligue a máquina", em vez de travar. Use `&chat status`
para checar se o servidor de IA está no ar. O curador de RSS pula o ciclo sem
perder notícias — quando você liga a máquina, o próximo ciclo (ou `&rss agora`)
recupera o que ficou pendente.

## Solução de problemas

- **"O serviço de IA não respondeu"** — o container `ollama` está no ar? O modelo
  foi baixado (`ollama pull`)? Veja `docker logs ollama`.
- **Respostas muito lentas** — normal em CPU. Reduza `CHAT_NUM_CTX`, ou aceite a
  latência. O primeiro uso após ociosidade recarrega o modelo (mais lento).
- **Busca não funciona** — teste o `curl` do passo 4. 403 = JSON não habilitado.
- **A máquina fica lenta pra tudo** — o modelo é grande demais para a RAM livre.
  Volte para o 0.6B e mantenha `cpus: "2.0"`.
