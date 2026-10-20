# Refatoração KISS + correções de segurança

O que mudou nesta rodada, por que, e como cada coisa foi verificada.
Base: `stoat_bot-main.zip` (idêntico ao commit `c4ee5c0`, 19 set 2026).

## Escopo — leia antes

São ~33 mil linhas de JavaScript rodando em produção. **Não** refatorei o
código todo: refatoração ampla sem teste de integração (as 8 suítes que
dependem do `fake-stoat.js` não rodam) troca bug conhecido por bug
desconhecido. O que está aqui é **o que dá para provar**:

- toda correção de segurança com correção publicada;
- os bugs concretos já identificados, cada um com teste que trava a regressão;
- a duplicação **real** (mesmo bloco copiado em 6 e em 3 lugares), não
  reorganização por gosto.

O que **não** foi feito, e por quê, está no fim (§7).

---

## 1. Resumo

| | Antes | Depois |
|---|---|---|
| Alertas do Dependabot | **46** | **4** (só os sem correção publicada) |
| `npm audit` do `ia-servico` | 1 high | **0** |
| Cópias de `const API = (process.env.STOAT_API…)` | 10 | 2 (uma por pacote npm) |
| Helper `bater` duplicado em `voz.js` | 3 cópias | 1 |
| Variáveis do `.env` que chegam ao container | 28 de 165 | **todas** |
| Linhas de `.js` | 33.425 | 33.414 |
| Arquivos/docs legados (Ollama, OpenRC) | 481 linhas de README + 2 arquivos | reescritos/removidos |

O saldo de linhas é quase zero porque troquei código duplicado por comentário
explicando a armadilha. Isso é de propósito: em KISS o que importa é **quantos
lugares você precisa mudar** para mudar uma coisa, não a contagem de linhas.

**Testes:** 13 suítes verdes (735 asserções), build íntegro, mais a suíte nova.
As 8 suítes que falham já falhavam **antes** de eu tocar em nada — conferi
rodando as mesmas suítes no zip original (§6).

---

## 2. Segurança — dependências

### 2.1 `voz-servico`: 40 dos 44 alertas

Todos os alertas vinham de dentro do `revoice.js`, que está na **última versão
publicada** (`0.2.1696`): não há para onde atualizar. A saída é `overrides`, que
força a versão corrigida das dependências transitivas:

```json
"overrides": {
  "axios": "^0.34.0", "undici": "^6.28.1", "uuid": "^11.1.1",
  "js-yaml": "^4.3.2", "pug": "^3.0.4"
}
```

| Pacote | Antes | Depois | Alertas fechados |
|---|---|---|---|
| `axios` | 0.26.1 | 0.34.0 | 23 (10 High) |
| `undici` | 5.29.0 | 6.28.1 | 12 (3 High) |
| `pug` / `pug-code-gen` | 2.0.4 / 2.0.3 | 3.0.4 | 3 |
| `uuid` | 9.0.1 | 11.1.1 | 1 |
| `js-yaml` | 4.3.1 | 4.3.2 | 1 (High) |

⚠️ **Nunca rode `npm audit fix --force` aqui:** ele sugere `revoice.js@0.1.7536`,
que é **anterior** à instalada. Seria um downgrade, não um conserto.

### 2.2 `ia-servico`: 2 alertas

`sharp` `^0.33.5` → **`^0.35.4`** (o `^` não alcançava `0.35.x` sozinho).
`npm audit`: **0 vulnerabilidades**. Testei o pipeline exato do projeto
(`limitInputPixels`, `rotate`, `resize` com `fit: inside`, `flatten`,
`jpeg({ mozjpeg: true })`) em Node 22 x64: funciona. `sharp@0.35.4` exige
Node ≥ 20.9, e a imagem é `node:22-slim`.

### 2.3 Os 4 que sobram

`taffydb` (#2), `ip` (#5), `vue-template-compiler` (#6), `elliptic` (#9): a
**última versão publicada de cada um ainda está na faixa afetada**. Não há o que
instalar. Os três primeiros vêm de ferramentas de documentação
(`better-docs`) que o `revoice.js` lista como dependência de execução — vale
abrir issue lá pedindo para movê-las para `devDependencies`.

---

## 3. Segurança e correção — código

### 3.1 A espera do `429` nunca acontecia

A SDK (`stoat-api` 0.8.9-4) rejeita com `throw data`, onde `data` é o **texto
cru** do corpo: uma **string**, não um `Error` nem um objeto. Então:

```js
const espera = Number(e?.retry_after ?? e?.data?.retry_after ?? …);  // sempre 0
```

`espera` era sempre `0`, o `continue` nunca rodava, e a reação perdida virava
"motivo" com o JSON cru dentro. Agora passa por `normalizarErro`, que já
existia em `modulos/core/erros.js` e entende string, objeto e `Error`.

> Foi isto que deixou o bug passar: a fixture lançava um **objeto**
> (`teste-reactionroles.mjs:146`), formato que a lib nunca produz. **Teste que
> mente sobre o formato do erro não protege nada.** A suíte nova lança string.

### 3.2 Anexo do CDN atual não era reconhecido

`extrairAnexoStoat` só aceitava hosts terminados em `.stoat.chat`, `.stoat.gg`
ou `.revolt.chat`. O CDN **atual** é `cdn.stoatusercontent.com`: um anexo do
próprio Stoat não virava capa de embed (`media`) **e** ainda levava o aviso 🔒
"a imagem fica num site de terceiros", que era falso. Corrigido no regex e em
`noStoat`. O bloqueio de SSRF (rede interna, portas fora de 80/443) continua
intacto e coberto por teste.

### 3.3 A chave do `ia-servico` não protegia nada

O cliente mandava o header lendo `IA_SERVICO_CHAVE`; o servidor conferia
`IA_CHAVE`. Nomes diferentes: configurar só uma dava `401` ou **proteção
nenhuma**. O servidor agora aceita as duas, `IA_SERVICO_CHAVE` primeiro.

### 3.4 Permissões: código morto que escondia erro de nome

O fallback de `membroTemPermissao` comparava máscaras `number` (`1 << 7`) com
`getPermissions()`, que na stoat.js 7 devolve **`bigint`** e exige alvo: nunca
dava `true`. Pior: um nome fora do enum (o erro clássico `"ManageRoles"` no
plural) faz a lib lançar `Cannot mix BigInt and other types`, que o `catch`
engolia virando **`false` silencioso** — permissão negada sem ninguém saber.

Agora são 6 linhas: valida o nome **em voz alta** (com `console.error`) e usa
`hasPermission`. A tabela `PERM` foi removida (estava no `ctx` e nenhum módulo
usava). Conferi que os 6 nomes usados no projeto existem no enum.

### 3.5 O filtro de log nunca funcionou

`Skipping key … during hydration!` chega a 70% do log. O filtro interceptava
`console.log`, mas a stoat.js 7.3.6 emite por **`console.debug`**
(`lib/hydration/index.js:33`). Agora filtra os dois canais.

### 3.6 Visão desligada em silêncio

`ver_imagem` só é registrada se `LLM_MODEL_VISAO` existir, e **ninguém definia
essa variável** no modo `online` nem com `LLM_URL` externo — o README prometia
visão "de fábrica com um modelo multimodal" e a ferramenta não aparecia.
`env.js` agora mapeia `MODELO_VISAO` → `LLM_MODEL_VISAO`, como já fazia com
`MODELO` → `LLM_MODEL`.

### 3.7 `docker-compose.yml`: a causa nº 1 de "configurei e não fez nada"

O `.dockerignore` exclui o `.env` da imagem e o compose listava as variáveis
**uma a uma**: das 165 que o código lê, **28 chegavam**. Ajustar
`SD_MODELO_TIPO` (que o próprio README manda usar), `SPOTIFY_ID`, `STOAT_API`
ou `CDN_URL` não tinha efeito nenhum, **sem aviso**. Já queimou sessões inteiras
com `LLAMA_CTX` e `LLAMA_FLAGS`.

A lista virou uma linha:

```yaml
env_file:
  - .env
environment:            # só o que precisa de padrão diferente no container
  - TZ=${TZ:-America/Sao_Paulo}
  - SEARXNG_URL=${SEARXNG_URL:-http://searxng:8080}
  …
```

Sobraram 8 entradas, as que têm padrão **específico do container** (e que
continuam sobrescrevíveis pelo `.env`, porque o `${...}` lê o mesmo arquivo).

Dois detalhes que importam:

- Mantive as 8 como `${VAR:-padrão}`, nunca `${VAR:-}` vazio: entrada de
  `environment:` **vence** o `env_file`, e uma string vazia apagaria o valor
  que o usuário definiu.
- Isso também mata a armadilha do `??`: `DNS_FALLBACK` é lido com
  `?? "1.1.1.1,8.8.8.8"`, e um `${DNS_FALLBACK:-}` vazio **desligaria o
  fallback de DNS** sem avisar. Com `env_file`, variável não definida
  simplesmente não existe, e o padrão do código vale.
- ⚠️ **O `.env` passa a ser obrigatório** (`cp .env.example .env`), o que o
  README já manda fazer. Sem o arquivo, o `docker compose up` reclama.

### 3.8 Grupo `render` no bloco comentado

O bloco de GPU comentado ainda listava `- render`. Quem descomentasse como
estava reproduziria o `unable to find group render` (a imagem é Debian e não
tem esse grupo) — erro que já custou uma sessão. Agora o comentário avisa.

---

## 4. KISS — duplicação eliminada

Refatorei **onde o mesmo bloco estava copiado**, que é o caso em que a
simplificação se paga: hoje, mudar o endereço da API, o header ou o tratamento
de erro exigia caçar as cópias, e uma sempre ficava para trás.

### 4.1 `modulos/core/stoat-api.js` (novo, 50 linhas)

Seis arquivos repetiam a linha do endereço e montavam o `fetch` à mão, cada um
com um timeout diferente (ou **nenhum**). Agora:

```js
const r = await chamarApi("/users/@me", { metodo: "PATCH", corpo: { … } });
if (!r.ok) …   // r: { ok, status, ms, texto, json, ehHtml, erro }
```

`chamarApi` **nunca lança**: devolve sempre o mesmo formato, com `json` já
convertido e `ehHtml` sinalizando quando quem respondeu foi um proxy/CDN — a
pista de rede que o diagnóstico de voz precisava. Migrados: `main.js`
(`definirStatus`), `cor-cargo.js`, `ban-global.js` (3 chamadas),
`reaction-roles.js`, `tts.js`.

Saldo: `cor-cargo` −7, `ban-global` −15, `main.js` −11 linhas, **e todas as
chamadas passaram a ter timeout** (antes o `PATCH` de status e o `DELETE` de
ban não tinham nenhum: uma API que não responde travava o comando inteiro).

### 4.2 `voz-servico/voz.js`: 3 helpers `bater` → 1

O mesmo bloco de `fetch` aparecia três vezes, com assinaturas **diferentes**
(`(metodo, rota, corpo)` em dois, `(rota, metodo, payload)` no terceiro — um
convite a trocar os argumentos), e o endereço era relido em cinco lugares.
Agora é uma função no topo do arquivo. **−40 linhas** (663 → 623), com o mesmo
comportamento: `meuIdDeBot` deixou de receber o helper como parâmetro, e
`abrirSalaSePreciso` e `diagnosticar` usam o helper único.

> Deixei o `voz-servico` com o **seu próprio** helper, sem importar de
> `modulos/core/`: é um pacote npm separado, com `package.json` próprio, e
> costurar os dois criaria um acoplamento pior do que a duplicação que resolve.
> Por isso "2 cópias" e não 1 — é uma fronteira, não um descuido.

---

## 5. Suíte nova: `teste-refatoracao.mjs` (22 asserções)

Cada correção acima ficou travada por teste:

| Área | Testa |
|---|---|
| Erros da API | string JSON (o formato **real** da SDK) vira objeto; `type` preservado; erro tipado nunca vira "undefined"; objeto continua funcionando |
| Rate limit | uma reação que leva `429` **espera e tenta de novo** (conta as tentativas) |
| Mídia | os 3 hosts de CDN viram capa; host de fora continua link com aviso; SSRF segue bloqueado |
| `stoat-api.js` | resposta boa, erro tipado, HTML de proxy e host morto — com um servidor HTTP local, sem depender de internet |
| Permissões | são `bigint`; os nomes usados existem; os plurais não existem (por isso a checagem) |
| Visão | `MODELO_VISAO` liga `LLM_MODEL_VISAO` |

---

## 6. Como validei

```
13 suítes: abreviacoes 30 · automod-caps 36 · blocklist 22 · dados-tickets 36
           ia 380 · log-midia 7 · midia 31 · musica 20 · reactionroles 18
           scorecard 38 · verificador 54 · webhooks 28 · refatoracao 22
scripts/verificar-build.js: ✓ build íntegro, 69 módulos, rotas consistentes
npm audit: voz-servico 9 (só os 4 sem correção + seus pais) · ia-servico 0
```

**As 8 suítes que falham falhavam antes.** Rodei cada uma no zip original com
as mesmas dependências: erro **idêntico**. Duas causas, ambas conhecidas:
`globalThis.__client`/`emitAll` (o shim `fake-stoat.js` perdido) e o banco não
inicializado no `teste-gating-ia.mjs`.

**O que não pude testar:** nada rodou em call real nem em produção.

---

## 6b. Remoção do legado (2ª rodada)

Removi o que sobrou da arquitetura antiga — Ollama como backend, `ia-servico`
em container separado, serviços OpenRC `judy-ia`/`judy-voz` — **sem tocar em
nenhuma ponte de compatibilidade**.

### Removido

| Onde | O quê |
|---|---|
| `ia-servico/servidor.js` | apelido `const ollama = llm` e as 3 chamadas `ollama(...)`; campo `ollama:` do `/saude`, que duplicava `llm` e **ninguém lia** |
| `ia-servico/ferramentas/{ler-codigo,rede,ver-imagem}.js` | conselhos `rc-service judy-ia restart` e "instale o sharp no judy-ia" — o serviço não existe mais; agora apontam para o `.env` e o `--force-recreate` |
| `scripts/config-final.yaml` | config da era do Ollama; nada referenciava |
| `ia-servico/llama-swap.example.yaml` | trazia o LFM (reprovado) e `--reasoning-budget 0` (rejeitado por causar erro de aritmética) |
| `scripts/judy-diag.sh` | a função `diagnostico()` checava a cadeia morta (Ollama nativo → judy-ia container → judy-voz OpenRC) e mandava `rc-service ollama start`. Reescrita para o container único; `logs`, `erros` e `reiniciar` passaram a usar `docker logs`/`docker restart`, já que `/var/log/judy-*.log` não existe mais |
| `ia-servico/README.md` | 481 → 108 linhas. Descrevia container separado + Ollama + OpenRC, e tinha 3 seções **duplicadas**. Reescrito, preservando as lições que continuam valendo (tool calling, chamada como texto, contexto que estoura, `EAI_AGAIN`, GitHub que responde 404) |
| `scripts/openrc/judy-voz.confd`, `scripts/medir-modelos.sh` | sobras da personalização: usuário `ghiso`, caminho `/home/ghiso/...` e o IP `100.74.70.106` da Tailscale, que escaparam da universalização |

O `scripts/openrc/judy-voz` **ficou**: voz nativa ainda é um caminho válido
(`VOZ_ATIVA=0` + `VOZ_SERVICO_URL`), não é código morto. E o trecho do
`deploy-stoat.sh` que **para** o `judy-ia` antigo também fica: é justamente o
código que migra quem ainda está na arquitetura velha.

### Preservado de propósito (e agora com teste)

| Ponte | Por quê |
|---|---|
| Migrações do `db.js` | `game_xp`/`game_cargos` → `xp_*`, e os `ALTER TABLE` de `punicoes`, `bans_globais`, `reaction_roles`, `rss_feeds`, `ia_*`, `rpg_*` |
| Mapeamento do `env.js` | `.env` antigo continua valendo; **nome interno vence o amigável** |
| Hosts antigos na allowlist | `autumn.stoat.chat` e `autumn.revolt.chat` aparecem em mensagens antigas |
| Aviso do `&chat especial` | comando aposentado que responde explicando, em vez de sumir |

### `teste-compatibilidade.mjs` (26 asserções) — a garantia

Monta um banco **no schema antigo de verdade** (tabelas `game_*`, `punicoes`
sem `silencioAte`, `bans_globais` sem `userNome`/`ehBot`, `reaction_roles` sem
`exclusivo`/`channelId`/`ordem`, `rss_feeds` sem `categoria`), abre com o
código de hoje e confere:

- as 2 linhas de XP e o cargo por nível **migraram com os valores intactos**,
  e as tabelas `game_*` sumiram (migração, não cópia);
- todas as colunas novas foram acrescentadas, e os dados antigos continuam
  legíveis, com os campos novos caindo no **padrão** (não em nulo);
- o código **escreve** nesse banco, gravando nas colunas novas;
- o painel de reaction role antigo e um novo **convivem**;
- abrir duas vezes não duplica nada (migração idempotente);
- tabelas novas (`tickets`, `ganchos`) nascem no banco antigo;
- `SUPER_ADMINS`, `CHAT_SERVIDORES` e `LLM_URL` de instalação antiga **não são
  sobrescritos** pelos nomes amigáveis;
- anexos dos 3 hosts de CDN continuam virando capa de embed.

> Este teste não roda `npm install`: usa só `node:sqlite`. Dá para rodá-lo numa
> cópia do banco de produção antes de subir.

### Cuidado ao aplicar

O `/saude` do `ia-servico` **não devolve mais o campo `ollama`**. Nada no bot o
lia, e os dois sobem juntos no mesmo container — mas se você tiver algum script
próprio consultando `.ollama.alcancavel`, troque por `.llm.alcancavel`.

---

## 6c. Comandos em árvore (3ª rodada)

### Comandos em árvore

Levantamento: 90 rotas, mas **47 comandos distintos** — 43 já eram alias. O
problema não era quantidade, era **hierarquia**: a família do automod estava
espalhada em 5 comandos de topo.

| Antes | Agora (canônico) | Atalho que continua valendo |
|---|---|---|
| `&blocklist` | `&automod blocklist` | `&blocklist` |
| `&whitelist` | `&automod whitelist` | `&whitelist` |
| `&sentinela …` | `&automod sentinela …` | `&sentinela` |
| `&punicao` | `&automod punicao` | `&punicao` |
| `&warnings` | `&warn lista` | `&warnings` |
| `&clearwarnings` | `&warn limpar` | `&clearwarnings` |
| `&tts entrar` / `&tts sair` | `&entrar` / `&sair` | `&tts entrar` |

`&automod sentinela on|off` continua ligando/desligando o módulo; com qualquer
outro argumento, abre o painel do sentinela.

### `&help` desce a árvore inteira

Antes ele resolvia **dois níveis** fixos. Agora percorre quantas camadas
existirem: `&help automod` → `&help automod sentinela` → `&help automod
sentinela antiguidade`. Cada camada mostra o texto **e** lista o que há dentro,
e um passo inexistente responde com o que existe ali, em vez de só negar.

Os nós **não foram duplicados**: `automod.punicao` é o mesmo objeto que
`punicao`. Um texto, um lugar — `&help punicao` e `&help automod punicao`
mostram o mesmo, e mudar um muda os dois.

### Documentação atualizada na mesma rodada

`&config` (lista o `antiduplicata` com o limite e a janela reais), `&info`
(uso e descrição na forma de árvore), `&tutorial` (passo 3: aprofundar) e o
`README.md` (nota sobre a árvore + tabela de comandos).

`teste-arvore-comandos.mjs` (17 asserções) trava a família, a profundidade, a
ausência de nó duplicado, os alias antigos, e checa que **todo nó explica o que
a coisa é**, não só a sintaxe.

---

## 6d. As 4 vulnerabilidades restantes (4ª rodada)

### As 4 vulnerabilidades sem correção publicada

`ip`, `elliptic`, `taffydb` e `vue-template-compiler` vinham de código que a
Judy **nunca executa**: o `index.js` do revoice.js carrega o caminho "Legacy V1"
(`msc-node` → `werift`) só para exportá-lo como `Legacy`, e lista o gerador de
documentação (`better-docs`) como dependência de execução.

- `voz.js` importa direto o caminho do LiveKit (`revoice.js/src/Revoice.js` e
  `src/Media.js`), que não depende de nada do legado — verificado lendo os
  `require` de cada arquivo.
- `msc-node`, `better-docs` e `taffydb` apontam para `voz-servico/vazio/`, um
  pacote vazio. O voz-servico caiu de **360 para 129 pacotes**; `npm audit`: 0.
- Armadilha 1: o `file:` de override é resolvido a partir do pacote que
  **depende** dele. `file:./vazio` gerava links quebrados para
  `node_modules/revoice.js/vazio`. O certo é `file:../../vazio`.
- Armadilha 2: o Dockerfile copiava só o `package.json` antes do `npm install`.
  Sem a pasta `vazio` ali, o install falharia — e como a linha tolera falha, a
  imagem subiria **sem voz, sem aviso**. Agora o `vazio` é copiado antes.

`teste-dependencias.mjs` trava os cinco pontos (sem rede, sem npm install).

### Sem avisos de redirecionamento

`&tts entrar`/`&tts sair` simplesmente não são mais comando (não há mais o
"Agora é `&entrar`"), e as notas de ajuda que citavam comandos removidos saíram.

---

## 6e. O legado que sobrou (5ª rodada)

### O legado que as varreduras não viam

Não era só texto. Havia legado **funcional**:

| Onde | O que era |
|---|---|
| `main.js` e `aliases.js` | `&scam`, `&antiscam`, `&sentry`, `&guard`, `&sentinel`, `&punishment`, `&punição` apontando para rotas removidas |
| `COMANDOS_GERENCIAVEIS` | o `&comando` oferecia ligar/desligar `blocklist`, `warnings` etc. |
| "você quis dizer" do `&automod punicao` | sugeria `&sentinela test`, `&warnings`, `&clearwarnings` |
| `detalhesPT`/`detalhesEN` | páginas de ajuda próprias dos 6 comandos removidos |
| `&help entrar` | "Não encontrado" — o comando canônico da voz não tinha página |
| títulos da árvore | `&help automod sentinela antiguidade` intitulado `&sentinela antiguidade` |
| `&help warn` | listava `titulo` e `texto` como subtópicos |
| textos de `tts`, `musica`, `help-parametros` | `&tts entrar`, `&sentinela`, `&punicao` escritos à mão |

**A causa de não terem sido pegos antes:** a verificação varria o código-fonte
com regex por `${P}comando`, e o texto aparece de formas demais (`&` fixo,
string longa, nome vindo de um nó). `teste-help-render.mjs` agora **renderiza
todas as páginas de ajuda** pelo `cmdHelp` real, nos dois idiomas e em qualquer
profundidade, e procura comando morto no texto final. Achou 26 problemas;
agora são **211 páginas, zero problemas**.

### Duas árvores de ajuda, fundidas rasas

A ajuda vem de `construirSubtopicos` (geral.js) e de `arvoreSubtopicos`
(help-arvore.js), fundidas em tempo de execução. A fusão era **rasa**, e
`automod.punicao` existe nas duas com pedaços diferentes (a punição global e a
por filtro): uma sobrescrevia a outra, e `&help automod punicao escada` não
existia. Agora `mesclarNos` funde em profundidade (juntando os textos) e
`ligarFamilias` põe cada filho dentro da família **depois** da fusão.

### Erros meus nesta rodada, corrigidos

- Ao remover as páginas dos comandos mortos, removi junto 4 blocos de
  **subtópicos** com o mesmo nome (`punicao.modo`, `sentinela.sensitivity`).
  Restaurados a partir do pacote anterior; conferido que as chaves voltaram
  idênticas.
- Passei uma função `async` para o verificador síncrono de um teste: ele ficaria
  verde mesmo falhando. Corrigido, e provado que falha quando deve.
- Dois testes antigos (`teste-automod-caps`, `teste-arvore-comandos`) cobravam
  o comportamento legado — a sugestão `&sentinela simulate` e `punicao` solto no
  topo da árvore. Atualizados para as regras de agora.

---

## 6f. O banco podia sair do volume (6ª rodada)

Consequência de uma mudança minha da 1ª rodada, pega quando o Ghieh perguntou
se o deploy apagaria o banco.

- O Dockerfile define `DB_PATH=/data/stoat.db` (dentro do volume `stoat_data`).
- A 1ª rodada trocou a lista de variáveis do compose por `env_file: .env`, e
  **`env_file` vence o `ENV` do Dockerfile**.
- O `.env.example` trazia `DB_PATH=./dados/stoat.db` **descomentado**. Um `.env`
  feito a partir dele faria o bot abrir `/app/dados/stoat.db`: um banco novo e
  vazio, fora do volume, que ainda some a cada rebuild.

**Nada seria apagado** — o banco verdadeiro continua intacto em `/data` —, mas o
bot rodaria sem ele. Correção: `DB_PATH` e `CONFIG_PATH` fixos no `environment`
do compose, **sem `${...}`**. Pela ordem de precedência documentada do Compose,
valor fixo em `environment` vence `env_file`, que vence o `ENV` da imagem; e
valor **interpolado** de um `.env` vence os dois — por isso não pode haver `${}`
ali. As duas linhas do `.env.example` foram comentadas, com a explicação de que
só servem fora do Docker.

`teste-compatibilidade.mjs` (agora 31) trava as duas coisas, e foi provado que
ele falha com o compose antigo.

## 6g. Comandos num registro central — fase 0: o inventário (17 out 2026)

O plano (decidido com o Ghieh): cada comando passa a ser declarado **uma vez só**,
numa pasta `comandos/` com um arquivo JS por família (nome nos idiomas, apelidos,
subcomandos, sintaxe, textos curtos, permissão), e o resto — rota, tradução do que
se digita, linha de sintaxe da ajuda, lista de gerenciáveis, "você quis dizer",
comandos do assistente — passa a ser **gerado** a partir dele. Hoje um comando mora
em até nove lugares (tabela em `docs/comandos/INVENTARIO.md`), e a tela em inglês é
traduzida **depois de pronta**, por regex sobre o texto: o que foge do padrão vaza
em português. Fases:

0. **inventário + trava** (esta rodada) · 1. motor e registro, sem mudar
   comportamento (o `main.js` monta `rotas`/`CANONICO` do registro, com as tabelas
   antigas de reserva) · 2. migrar uma família por vez (pequenas primeiro; `automod`
   e `game` por último) · 3. ajuda, tutorial e assistente gerados do registro,
   citação de comando por referência (`{cmd:automod.sentinela.assuntos}`) no lugar
   do `${P}…` escrito à mão · 4. espanhol · 5. apagar as tabelas antigas.

_Como ficou (conferido depois, 6k):_ as fases 1 e 2 tiraram as tabelas antigas na
hora, **sem** reserva — a garantia foi o inventário e a comparação byte a byte. A
fase 5 não sobra.

O que a fase 0 entrega:

- **`docs/comandos/inventario.json`** — a foto da tabela de comandos: os 149 nomes,
  cada um com o comando interno e a função de destino, e os 557 subcomandos em
  inglês → nome interno. **`INVENTARIO.md`** — a mesma coisa legível, mais a lista
  dos exemplos da ajuda que ainda respondem erro (pendências das próximas fases).
  Os dois são gerados: `INVENTARIO=1 node testes.mjs comandos-17out`.
- **Suíte `comandos-17out`** — falha se um nome some ou muda de destino, se um
  subcomando em inglês muda, e se aparece nome novo fora do inventário. Também
  **executa** cada exemplo que a ajuda e o tutorial mostram (334 telas, ~990
  exemplos, PT e EN, um servidor novo para cada) e falha com "subcomando
  desconhecido", com exemplo pronto para copiar que responde erro, e com palavra
  de comando em português na tela em inglês.
  Por que executar: o `help-comandos` procurava a palavra no código-fonte e deu
  `anticaps set limiar` como certo porque `set` existe em algum lugar.
- **Provas:** a versão anterior (`53849fa`) passa na checagem dos 149 nomes contra
  o inventário novo — nenhum nome perdido. E a suíte falha nela em 10 de 14 itens
  (os legados desta rodada). Para rodar nela, enxertei os dois exports novos
  (`tabelaDeComandos` e `arvoreDaAjuda`) — sem eles a suíte nem carrega; com um exemplo quebrado de propósito na ajuda, a
  checagem de "subcomando desconhecido" falha.
- `main.js` exporta `tabelaDeComandos()`; `geral.js` exporta `arvoreDaAjuda()` —
  as páginas que só existiam em `construirSubtopicos` (12 delas) não eram
  percorridas por teste nenhum.
- 11 apelidos estavam no `CANONICO` do `main.js` **e** no `COMANDO_EXTRA` do
  `aliases.js`; ficaram só no segundo (o inventário prova que nada mudou).

A trava tem um limite conhecido: valores de mentira no lugar dos `‹moldes›` (um item
"teste" que não existe) dão erro que não é de sintaxe — esses ficam listados no
`INVENTARIO.md`, não reprovam.

## 6h. Fase 1: o registro e o motor (17 out 2026)

`modulos/comandos/` — 46 arquivos, um por família (o `voz.js` tem `&tts`, `&entrar` e
`&sair`), e o `index.js`, que é o motor. Cada entrada declara o `id` (o nome interno
que o banco guarda), o handler, o nome em inglês, os apelidos e as marcas. O formato
está comentado no topo do `index.js`. Saíram de onde estavam:

| Antes | Agora |
|---|---|
| `main.js`: `rotas` (90 nomes em 109 linhas), `CANONICO`, o laço que adivinhava o canônico pela função, os laços que copiavam apelidos | `montarTabela()` |
| `main.js`: `COMANDOS_GERENCIAVEIS`, `COMANDOS_SO_IA`, e as listas locais `ESSENCIAIS`, `COMANDOS_DE_VOZ`, `SEMPRE_LIBERADOS`, `TEXTO_LIVRE` | marcas `gerenciavel`, `soIA`, `essencial`, `voz`, `qualquerCanal`, `textoLivre` |
| `aliases.js`: `COMANDO_EN`, `COMANDO_EXTRA` | derivados do registro (o aliases.js os reexporta) |
| `main.js`: 20 imports que só serviam às rotas | saíram |

**O ciclo de imports.** O `aliases.js` lê o registro, e o registro importa os
handlers, que importam o `aliases.js`. O ESM resolve isso desde que ninguém leia as
tabelas no carregamento. Por isso o handler era declarado como `funcao: () =>
modulo.cmdX` e só resolvido no `montarTabela()`, quando tudo já carregou (na fase 2
virou caminho + nome, e o ciclo sumiu — 6i). Conferi o
boot real (`node main.js` até o login) e o carregamento começando por cada um dos
lados do ciclo.

**O que mudou de propósito.** Seis nomes deixaram de ser comandos à parte e viraram
apelidos: `info` e `about` (de `&sobre`), `personality`, `servers`, `comandos` e
`criarcargomudo`. Todos levam à mesma função de antes. Nenhum era gerenciável.
O `comandos` estava na lista de essenciais por conta própria; agora é apelido do
`comando`, que é essencial, então continua sem poder ser desligado. O liga/desliga
não muda. O que muda é bom: os
subcomandos em inglês passam a valer neles (`&servers report` não era traduzido) e
`&personality` ganha a isenção de texto livre que `&personalidade` já tinha. O
`inventario.json` registra exatamente essas 6 linhas.

**O "você quis dizer".** No empate de distância, ganhava quem vinha primeiro na
tabela, e a ordem agora vem do registro. A regra virou fixa: o nome do comando antes
do apelido, depois a ordem alfabética. Testei 53.178 erros de digitação dos 149
nomes (uma letra a menos, a mais ou trocada; das 53.327 variações, as que já são um
nome ficam de fora). 131 (0,25%) recebem outra sugestão, todas à mesma distância (`rr` → `r`,
`servers` → `server`). Com o registro em ordem invertida, a sugestão é a mesma.

**Travas novas.**
- O boot para se um nome estiver em dois comandos.
- O `verificar-build.js` confere que cada `funcao` aponta para um import do arquivo e
  para um export que existe, e que todo arquivo da pasta está no `index.js`. Provei
  com um handler renomeado e com um arquivo órfão.
- A `comandos-17out` confere que o `main.js` e o `aliases.js` não voltam a declarar
  comandos à mão, e que as seis listas antigas saem iguais das marcas.
- `assistente`, `arvore-comandos` e `help-comandos` liam a tabela como **texto** do
  `main.js`. Agora leem o registro.

## 6i. Fase 2: os subcomandos vão para o registro (17 out 2026)

34 famílias levaram os subcomandos para o próprio arquivo do registro, com o nome em
inglês de cada um:

```js
subcomandos: { lista: "list", limpar: ["clear", "wipe"] },   // interno → inglês (o 1º é o da tela)
aninhados: ["setup"],                                          // mais um nível traduzido
naTela: { aqui: "here" },                                      // só a tela: o handler aceita as duas
```

As famílias são: servidor, entretenimento, help, silenciar, assistente, tutorial, xp,
acesso, banglobal, warn, ticket, webhook, economia, servidores, rolar, iniciativa,
limpar, cor, reactionrole, rss, staff, boasvindas, adeus, tts, fuso, log, chat, modia,
debug, embed, comando, autorole, idioma e musica.

No `aliases.js` (de 591 para 441 linhas) ficaram, em `SUB_LEGADO`, só as duas
famílias grandes: o `&automod` (com punicao, sentinela, blocklist, whitelist e as
partes) e o `&game`. As tabelas que o resto do bot usa (`SUB`, `ANINHADOS`, a tela em
inglês) são montadas juntando o registro com o legado.

A tabela `tutorial` estava **declarada duas vezes** no objeto antigo. Valia a segunda,
e a primeira era código morto. Foi para o registro a que valia.

**O handler não é mais importado pelo registro.** A entrada diz
`modulo: "../moderacao/warn.js", funcao: "cmdWarn"`, e o `montarTabela()` (agora
`async`, com `await` no `main.js`) importa no boot. Com isso o registro virou só dados,
e o `aliases.js` pode lê-lo no carregamento sem ciclo de imports. O
`verificar-build.js` confere caminho e export de cada entrada.

**Provas.** Gerei as três tabelas montadas antes da mudança e depois (entrada inglês →
interno, tela interno → inglês, níveis aninhados) e comparei: **idênticas byte a
byte**. O `inventario.json` passou a guardar também a tela e os aninhados, e a
`comandos-17out` reprova qualquer diferença. Ela também reprova família que esteja
no registro e nas tabelas antigas ao mesmo tempo.

**O que NÃO fiz nesta fase:** limpar dos handlers os `if (sub === "painel" ||
sub === "panel")`. A tradução de entrada só alcança a 1ª palavra depois do comando;
a 2ª e a 3ª, só quando a 1ª é um subcomando `aninhado` (no `&automod`, até 4 palavras
pelo caminho das famílias). E o assistente chama os handlers por dentro
(`rotas[nome]`), sem passar por ela. Tirar o inglês do handler hoje quebraria esses
caminhos em silêncio. (O lote não: cada linha passa pelo `tratarMensagem` inteiro.) Isso fica para a fase 3,
quando o registro declarar a sintaxe e o motor garantir argumentos já normalizados.

## 6j. Fase 2, fim: o &automod e o &game (17 out 2026)

As duas famílias grandes foram para o registro, e o `aliases.js` (agora com 334 linhas)
não tem mais nenhuma tabela própria de subcomandos. `SUB`, `ANINHADOS` e a tela em
inglês são montados só a partir de `modulos/comandos/`.

- `game.js`: os 95 subcomandos (101 palavras em inglês), os 11 aninhados e o que só muda na tela (`abrir` →
  `open`, `mao1` → `hand1`…).
- `automod.js`: o vocabulário do próprio `&automod`, mais dois campos novos no
  formato:
  - `familias`: os níveis dentro dele (`antispam`, `antiruido`, `antilink`, `sentinela`,
    `odio`, `assuntos`, `avatar`, `punicao`), que viram as tabelas `automod.<x>`;
  - `partes`: as que também têm tabela própria (`punicao`, `sentinela`, `blocklist`,
    `whitelist`, `scam`), com o vocabulário e, nas duas primeiras, o nome em inglês
    (`punishment`, `sentinel`). Valem no 2º termo de `&help <parte> …`
    (`&help punishment ladder`) e, dentro do `&automod`, somadas à da família de mesmo
    nome. **Estava errado aqui** (6k): eu tinha escrito que valiam em `&help punicao`
    e `&help blocklist add` sem testar. `&help punicao` sozinho respondia "Não
    encontrado" até o `fc4ac9b`; `&help blocklist add` responde "subtópico
    desconhecido" — a blocklist não tem página `add`.

**Provas:**
- As três tabelas montadas saíram idênticas byte a byte, e o `inventario.json` não
  mudou uma linha.
- Rodei as 334 telas de ajuda e os 987 exemplos na versão anterior e nesta e comparei
  os textos inteiros. As telas saíram **todas iguais**. Das respostas, 38 diferem, e
  todas por sorteio ou relógio: dados, códigos de confirmação, tokens de webhook,
  uptime, memória e contagem de linhas. A suíte ganhou `DUMP_TELAS=arquivo` para
  repetir essa comparação quando quiser.

**Duas fontes para as palavras do automod.** O `nomes-automod.js` continua com os
nomes em inglês que os painéis mostram (`nomeTema`, `nomeModo`…). O `EN_PARA_PT`, que
servia à entrada, saiu. Um teste novo confere que cada par de lá existe no registro, e
provei que ele falha quando um par diverge. Juntar as duas fontes fica para a fase 3.

## 6k. Conferência: o que eu tinha escrito sem conferir (17 out 2026)

O Ghieh pegou `&help punishment` respondendo "Não encontrado" depois de eu ter
escrito que funcionava. Refiz a conta de cada número e de cada frase de 6g–6j contra
o código, o histórico e o bot de mentira. O que estava errado já está corrigido no
próprio texto acima:

| Onde | Estava | É |
|---|---|---|
| 6g, plano | fase 1 "com as tabelas antigas de reserva" | saíram sem reserva; a fase 5 não sobra |
| 6g, provas | a suíte roda na `53849fa` | só com os dois exports da fase 0 enxertados |
| 6h | `rotas` (90 linhas) | 90 nomes em 109 linhas |
| 6h | nenhum dos 6 era essencial | o `comandos` era; continua, como apelido do `comando` |
| 6h | 53.327 erros de digitação testados | 53.178 (das 53.327 variações, as que já são nome ficam de fora) |
| 6i | a tradução vale nas 3 primeiras posições; o lote não passa por ela | a 1ª sempre, a 2ª e a 3ª só depois de um `aninhado` (4 no `&automod`); o lote passa, só o assistente não |
| 6j | 101 subcomandos do `&game` | 95 subcomandos, 101 palavras em inglês |
| 6j | as partes valem em `&help punicao` e `&help blocklist add` | o primeiro só desde o `fc4ac9b`; o segundo nunca existiu |

Também estavam errados três comentários no código: o das `partes` no
`modulos/comandos/automod.js` (o mesmo `&help blocklist add`), o do `subcomandosDe`
no `aliases.js` ("isso a fase 2 traz") e o do `automod-comandos.js`, que dizia que
`&blocklist` sozinho ainda funcionava (responde "comando desconhecido").

Conferido e certo: 149 nomes, 557 subcomandos, 10 de 14 falhas na `53849fa`, 20 imports
tirados do `main.js`, `aliases.js` com 591 → 441 → 334 linhas, 34 famílias na fase 2,
334 telas iguais e 38 respostas diferentes só por sorteio ou relógio, 131 sugestões à
mesma distância, as 9 linhas da tabela "onde cada comando mora".

**Português na tela em inglês que a trava não via.** A `comandos-17out` só olhava
dentro de `` `…` `` e com uma lista curta de palavras. Varrendo a tela inteira:

| Tela em inglês | Mostrava | Agora |
|---|---|---|
| parâmetros de `&access`, `&globalban`, `&rss`, `&welcome`, `&log`, `&webhook`, `&reactionrole` | `todos \| somente \| exceto`, `[servidor]`, `aqui`, `limpar`, `visivel \| oculto`, `confirmar`, `todos`, `ordem` | `all \| only \| except`, `[server]`, `here`… — cada palavra executada antes no bot de mentira, para ver que o handler aceita |
| `&log` | `**mensagens** — deleted and edited messages` | `**messages**` (novo `subExibido()` no `aliases.js`, lendo o registro) |
| `&automod sentinel topics` | `**IA:** 🟢 confirms` | `**AI:**` |
| `&reactionrole order` sem mensagem | `` `&reactionrole ordem ‹message› confirmar` `` | `order … confirm` |
| `&rss add` com feed fora do ar | `**Error:** bloqueado: o domínio não resolve` | `blocked: the domain doesn't resolve` (`erroEmIngles()` no `seguranca.js`); e os 4 motivos do `&rss now` |

**`confirm` que não confirmava.** A tela em inglês ensina `&game delete confirm`
(a tradução da tela troca `confirmar`), mas o handler só aceitava `confirmar` — e o
`confirm` não é traduzido na entrada naquela posição. Resultado: pedia a confirmação
de novo, para sempre. Igual em `&game rest confirm`, `&game admin reset … confirm` e
`&xp reset confirm` (este ainda escrevia `confirmar` na tela em inglês). Os quatro
aceitam as duas palavras agora. Achei pelo laço: a resposta sugerindo exatamente o
comando que acabou de ser digitado. O `&game rest confirm` corrigi pelo código (o
mesmo `if`); não montei companheiros cansados para executá-lo.

Efeito na própria trava: o personagem do RPG é da pessoa, não do servidor. Com o
`confirm` funcionando, o exemplo `&game delete confirm` (e o `&game admin reset …
confirm`) passou a apagar o personagem no meio da execução, e todos os exemplos do
`&game` depois dele respondiam "sem personagem" — sem erro, então sem teste de
verdade. Em português isso já acontecia desde sempre (lá o `confirmar` funcionava).
O executor agora recria o personagem depois desses exemplos; o `INVENTARIO.md`
mostra 27 linhas novas de exemplos do `&game` em português que estavam escondidos (e saíram 2 que respondiam "Sem personagem").

E a ajuda do `&xp reset` prometia `[@pessoa] confirmar` — "zera o XP de alguém (ou de
todos)". Não existe reset de uma pessoa: o handler só zera o servidor inteiro. A
linha agora diz isso.

Seis testes novos na `comandos-17out` (seção 5); os seis falham no `fc4ac9b`. O de
laço (nenhum exemplo de confirmação da ajuda responde pedindo ele mesmo) pega o
`&game delete confirm` e o `&game admin reset … confirm` num dump feito com o
`game.js` de antes desta correção. O
`ordem → order` entrou como `naTela` do `&reactionrole` (o handler já aceitava
`order`), e o `inventario.json` ganhou essa linha.

**Falso alarme, conferido:** o dump mostrava a resposta em inglês do `&color panel
here` terminando em português. Era a mensagem atrasada do `&cor painel` em
português de antes (o mesmo ID de canal), caída na janela do exemplo seguinte —
sozinho, o painel responde todo em inglês. A comparação por dump pode enganar assim.

**Achado e NÃO corrigido (decisão do Ghieh):** `&help xp` abre a página do grupo
"Diversão", não a do comando — o nome do grupo vence o do comando (a regra feita para
`&help comecar`). A seção de parâmetros do `&xp` nunca aparece (corrigi o texto dela
mesmo assim). Já era assim na `53849fa`.

## 6l. Um teste de regressão para cada correção (17 out 2026)

Antes da fase 3, que vai mexer em toda a ajuda e na tradução das telas, cada
correção desde a fase 0 precisava de um teste que reprovasse sem ela. Em vez de
listar os erros de memória, **desfiz cada correção, uma por vez, e rodei a suíte
inteira** (97 suítes, cada mutação com `/tmp` e rede próprios, 4 de cada vez).

- **O que foi desfeito:** os 103 trechos de código (sem contar os que só mexem em
  comentário) dos commits `47cad9f` (fase 0, 62), `90dc1c1` (ping e "você quis dizer",
  10), `fc4ac9b` (`&help punishment`, 2) e da conferência (29). 7 já não se aplicavam
  porque o conteúdo foi para o registro; no lugar deles, 10 mutações no próprio
  registro (tirar o `music` do `&musica`, os `naTela` de 6 comandos, o vocabulário
  do sentinela, o `subcomandosDe`, um apelido em dois comandos).
- **Resultado da primeira passada:** 40 das 106 mutações não derrubavam nenhum teste
  (ou só o retrato do inventário, que se regrava de propósito — não protege na fase 3).

Os testes novos (20 na `comandos-17out`, 49 no total):

- **Duas checagens gerais, pelo registro** (seção 3). Toda tela, nos dois idiomas:
  cada `&cmd a b c` entre crases é conferido palavra por palavra contra as tabelas
  do comando. Em inglês, nenhum nome interno que tenha nome em inglês; em português,
  nenhuma palavra em inglês que vire outra coisa na entrada. Substituem a lista de
  palavras escrita à mão, que não via `&musica` nem `sentinela sensitivity`.
- **17 testes pontuais** (seção 6), um por erro que só aparece executando o
  caminho: `&game rest confirm`, `&reactionrole order <msg>`, `&rss now` com o canal
  sumido, `&music loop track`, `&game equip … hand2`, `&game admin give`, `&game
  respec points`, `&game companion photos`, o "subcomando desconhecido" do `&access` e
  do `&modia`, o uso do `&automod sentinela banir|liberar|testar|simular`, o painel do
  sentinela, os três avisos do sentinela à staff, o `&globalban forget` sozinho, as
  páginas `&help automod sentinela sensibilidade|testar|canal`, a sintaxe na ajuda do
  sentinela, os parâmetros em português e o `&music` nas telas em inglês. Mais um
  para o próprio bot de mentira: o primeiro gerador de IDs dava 1.684 IDs diferentes
  em 50.000.

**Segunda passada:** das 40, 33 agora derrubam um teste. As 7 restantes não mudam
nada que se veja, conferido comparando as 334 telas e 987 respostas com e sem elas:

| Mutação | Por que não aparece |
|---|---|
| `conf-007` (`Available events` do `&log`) | a tradução da tela já trocava as palavras entre crases |
| `f0-008` (ajuda do `&music`), `f0-029` (dica do `simulate`), `f0-042` (`por` → `for` no `&game`), `f0-058` (tutorial do sentinela) | idem: o texto em inglês tinha a palavra em português, e a tradução da tela a trocava |
| `naTela` do `&musica` | o texto em inglês do `&music` já é escrito em inglês |
| `f0-040` | só a cor do embed |

As cinco primeiras dependem da tradução da tela. Se a fase 3 tirar essa tradução, as
duas checagens gerais passam a pegá-las.

Para rodar só uma parte do teste dos avisos do sentinela, o `automod-engine.js` exporta
mais duas funções "só para testes", como o `_aplicarPunicao` que já existia. O
mapeamento do `&music loop` virou a função `modoDoLoop()` para poder ser testado sem
o serviço de voz.

**Erros novos que apareceram escrevendo os testes, corrigidos (cada teste reprova
sem a correção):**
- painel e teste do sentinela em inglês: `**Sensitivity:** media` e `current mode:
  **avisar**` → `medium`, `warn`;
- `&help comando gerenciar` em português ensinava `&comando disable|enable` →
  `desativar|ativar`;
- `&automod sentinela testar` em português ensinava o nome antigo
  `&automod antiscam on` → `sentinela on`.

Também traduzi o `Sensitivity:` da mensagem de liga/desliga dentro do `cmdScam`, mas
esse trecho não é alcançável por comando: o `&automod sentinel on` é respondido antes,
pelo liga/desliga da família.

## 6m. Fase 3a: a ajuda e as citações saem do registro (17 out 2026)

A fase 3 é uma família por pacote. Esta traz o mecanismo e as duas primeiras:
`&autorole` e `&limpar`.

**Citação por referência.** Em vez de escrever `${P}limpar tudo` à mão, o texto pede
o comando ao registro:

```js
citar("limpar.tudo", "en", P)                  // no código → "&purge all"
"`{&limpar.tudo}` — esvazia o canal INTEIRO"   // nos textos do registro (só dados)
```

O nome em cada idioma vem do registro, também dentro das famílias
(`automod.sentinela.assuntos` → `&automod sentinel topics`). Referência que não
existe é **erro**: `citar` lança na hora, e o `verificar-build.js` confere todas as
do código e do registro (62 hoje), então uma referência quebrada derruba o build da
imagem. Antes, um `${P}…` errado só aparecia torto na tela.

**A página de ajuda no registro.** O comando migrado declara `ajuda: { perm, uso,
desc, ex, parametros }` nos dois idiomas, no próprio arquivo de `modulos/comandos/`.
O `construirDetalhes` (geral.js) e o `parametros` (help-parametros.js) juntam o que
vem de `modulos/core/ajuda-registro.js`, e as cópias à mão dos dois comandos saíram.

**O handler só conhece o nome interno.** No `&limpar`, o `confirmar` era só da
tela, então o handler aceitava `confirm` e `confirmar`, `all`, `everything` e
`tudo`. Agora o `confirm` é traduzido na entrada, como os outros, e o handler
testa só `tudo` e `confirmar`. Conferi antes quem chama os dois handlers por dentro
sem passar pela tradução: só o assistente, com `["autorole", "set", …]`, que já é o
nome interno.

**Todas as citações dos dois** foram para `citar` (46, em 6 arquivos: os dois
handlers, o tutorial, o índice da ajuda, o `&debug` e o diagnóstico de permissões).

**Provas:**
- As 334 telas e as 987 respostas antes e depois: as telas são todas iguais. Das
  respostas, a única diferença que não é de relógio ou memória é de propósito: o
  "uso incorreto" do `&purge` em inglês não tinha a linha do `&purge all`, que o
  português tinha. Agora tem.
- 6 testes novos (seção 7 da `comandos-17out`, 54 no total):
  - o `citar` nos dois idiomas e nas famílias;
  - o `citar` falhando com referência errada;
  - a página `&help` e os parâmetros de cada comando migrado vindos do registro, e
    nenhuma cópia sobrando no geral.js ou no help-parametros.js;
  - nenhum comando migrado citado à mão em lugar nenhum do código;
  - o `&purge all` → `&purge confirm <código>` de ponta a ponta em inglês;
  - o handler sem palavra em inglês no parse.

  A lista de migrados sai do próprio registro (quem tem `ajuda`), então cada família
  nova entra nesses testes sozinha.
- Mutações, cada uma derruba pelo menos um teste: uma citação à mão de volta no
  tutorial, uma cópia velha da página no geral.js, o `confirmar` fora do registro,
  uma citação à mão no índice da ajuda. O `verificar-build.js` com um
  `citar("autorole.sett")` aborta o build.

O inventário ganhou uma linha (`limpar`: `confirm` → `confirmar`).

## 6n. Fase 3b: nove comandos pequenos (17 out 2026)

`&ping`, `&repete`, `&userinfo`, `&sobre`, `&kick`, `&ban`, `&silenciar`, `&rolar` e
`&iniciativa` passaram a ter a página de ajuda no registro, e todas as citações deles
viraram `citar` (81, em 10 arquivos). Com o `&autorole` e o `&limpar`, são 11
comandos migrados.

**A migração das páginas agora é por script** (fora do repositório): ele monta a
página atual de cada comando com um prefixo marcado, troca cada citação pela
referência (`§P§silenciar tirar` → `{&silenciar.tirar}`), escreve a `ajuda` no
arquivo do registro e tira as cópias do geral.js e do help-parametros.js. Nos
textos em inglês que tinham palavra em português e dependiam da tradução da tela
(`|lista|remover|limpar` no `&iniciativa`, `tirar @user` no `&silenciar`), escrevi o
inglês direto.

**O handler só conhece o nome interno**, como no `&limpar`: o `&silenciar` não
aceita mais `remove`, `undo` e `off` por conta própria, e o `&iniciativa` não aceita
mais `remove` e `clear` — todos chegam traduzidos pelo registro. Ficaram os apelidos
que não são tradução (`rm`, `fim`, `end`). Nenhum dos dois handlers é chamado por
dentro sem passar pela tradução.

**Erros achados no caminho, corrigidos com teste:**
- `**Permission:** [object Object]` no `&help rolar` e `&help iniciativa`: a
  permissão `{ pt: "todo mundo", en: "everyone" }` ia inteira para a tela. Os testes
  da 3a não olhavam a permissão; agora olham, e um teste novo reprova qualquer tela
  com `[object Object]`.
- `&roll coin` em inglês respondia `🪙 **coroa**`. Agora `heads`/`tails`.
- O aviso da moderação por IA ao dono, em português, ensinava `&silence` e `&ban`
  com o nome em inglês. Agora `&silenciar`. Esse aviso não é executado pelos testes
  (precisa da IA); o que o protege é o teste de citação à mão e o `verificar-build.js`.
- No `&help rolar` em inglês, `` `coin` (coin) `` virou `` `coin` ``.

**Provas:**
- Comparação das 334 telas e 987 respostas, com os IDs e as contagens de servidor
  normalizados (mudam com a ordem dos exemplos): o que muda é só o `coin` e as
  permissões, de propósito; o resto é relógio e sorteio.
- 2 testes novos (56 no total), e as checagens da 3a passaram a valer para os 9
  sozinhas.
- Cinco mutações, cada uma derruba pelo menos um teste: a permissão sem o idioma, a
  moeda em português, o `remove` fora do registro do `&silenciar`, o `clear` fora do
  do `&iniciativa`, um `${P}kick` à mão no índice da ajuda.

**Decidido depois (18 out, Ghieh):** `&rolar`, `&iniciativa` e `&repete` não tinham
nome em inglês, e a tela em inglês os mostrava assim. Agora são `&roll`,
`&initiative` e `&repeat` (este também ganhou o apelido `repeat`, que não existia).
Só a tela em inglês muda — 17 citações nas telas do teste; nenhuma tela em português
mudou. O inventário passou a ter 150 nomes. Um teste confere as três páginas
`&help` em inglês, o `&repeat` sozinho e que o `&help rolar` em português continua.

## 6o. Fase 3c: mais dez (18 out 2026)

O Ghieh escolheu terminar a fase 3 antes do espanhol (a etapa 4 do plano): o
espanhol precisa de uma terceira versão de ~2.000 pares de texto PT/EN, e fica mais
barato com a ajuda já toda no registro.

Página no registro: `&warn`, `&log`, `&idioma`, `&comando`, `&embed`, `&adeus`,
`&reset`, `&config` e `&webhook` (20 comandos migrados ao todo). Citações por
referência: esses nove e o `&personalidade` (que não tem página `&help`; ficou só a
citação), 224, em 21 arquivos.

**O que o script ganhou:**
- o idioma de cada linha pela função em volta (`detalhesPT`, `arvoreEN`…), e não só
  pelas palavras;
- nos parâmetros, `nome: "canal"` vira `{ pt: "canal", en: "channel" }` quando a
  palavra é subcomando;
- apelido citado de propósito ("também responde por `&lang`") não vira mais o nome do
  comando — o script avisa e eu escrevo à mão. **Era um erro meu nesta rodada:** a
  página do `&idioma` saía "também responde por `&idioma` e `&idioma`". Corrigido e
  com teste.

**Nos textos em inglês, o inglês escrito direto** (antes dependiam da tradução da
tela): `punishments`/`members`/… no `&log`, `stack` no `&warn`, `list`/`remove` no
`&webhook`, `{user}`/`{name}`… no `&adeus`, e o `&log canal aqui` que o `&debug`
ensinava em inglês.

**Handlers só com o nome interno:** o `&warn` não aceita mais `list` e `clear` por
conta própria, o `&log` não aceita `channel`, o `&webhook` não aceita `list`,
`remove` e `test` — chegam traduzidos. O assistente chama `["log", "canal", …]`,
que já é o nome interno.

**Mudou na tela, de propósito:**
- `&help embed`: o uso tinha crases dentro de crases e saía quebrado
  (`` `&embed → then`field: value`, one per line` ``);
- `&help idioma` em inglês dizia "also answers to `&language` and `&language`";
- `&help warn` em inglês: `` `stack` (accumulate) `` virou `` `stack` ``.

O resto das 334 telas é igual; nas 987 respostas, só relógio, sorteio e IDs.

**Provas:** 1 teste novo (57 no total: as páginas, os apelidos citados, `&log channel
here`, `&warn list` e `&webhook test` em inglês). Mutações: tirar o `list` do `&warn`,
o `channel` do `&log` ou o `test` do `&webhook` do registro derruba a suíte (as
citações por referência quebram, e o teste novo reprova); a página do `&idioma` com o
erro de volta também.

## 6p. Etapa 4a: o espanhol (18 out 2026)

`&idioma es` (também `español`, `espanol`, `espanhol`, `spanish`, `castellano`).
O que já sai em espanhol: **os nomes dos comandos e dos subcomandos** em toda tela,
e **as 20 páginas de ajuda que moram no registro**, escritas em espanhol. O resto das
respostas sai em inglês — os ~2.000 pares de texto ficam para as próximas etapas.

**Registro:** `es: { nome, subcomandos }` nos 48 comandos (`&ayuda`, `&limpiar`,
`&advertir`, `&expulsar`, `&dados`, `&acerca`, `&bienvenida`, `&despedida`…). O nome
em espanhol vale ao digitar em qualquer servidor, como um apelido: 15 rotas novas. A
tabela de entrada ganhou 34 palavras (`borrar`, `quitar`, `crear`, `sanciones`…) —
nenhuma muda o destino de uma que já existia (conferido contra o inventário, e um
teste garante que a tela e a entrada concordam).

**Tela:** em espanhol, o `exibir` faz a tela em inglês e depois o `paraEspanhol`
troca nomes de comando, subcomandos e moldes (`‹cantidad›`, `[@usuario]`). A página
do registro em espanhol **sai pronta**: uma marca invisível (`JA_TRADUZIDO`) faz o
`exibir` só tirá-la — a tradução da tela tratava o espanhol como inglês (`aqui` →
`here`, `{usuario}` → `{user}`, `[motivo]` → `[reason]`, `acumular` → `stack`).
Rótulos da página (`Uso`, `Permiso`, `Ejemplo`, `Parámetros de`, `Subtemas`) e o
rodapé das páginas (`reacciona ◀ ▶ para pasar`) também.

**i18n:** `idiomaDe` aceita `es`; `lingua`/`textoDoIdioma` dão `en` para o texto;
`idiomaDaTela` (novo) para os rótulos que já existem nos três. Treze lugares liam
`config.language === "en"` direto (reset, assuntos, avatar, imagem, economia, tickets,
rss, paginas, main) — no espanhol cairiam no **português**. Passaram ao
`textoDoIdioma`, e um teste impede voltar.

**Palavras que o próprio handler conhece:** `&embed` (`descripcion`, `pie`,
`imagen`), as cores (`rojo`, `morado`, `negro`…), os marcadores (`{nombre}`,
`{miembros}`), `&dados ventaja|desventaja`, `&iniciativa agregar|siguiente`,
`&despedida imagen borrar`.

**Achados no caminho (valem para pt e en também):**
- `&comando list`: a ajuda prometia e caía no "uso errado". Agora lista.
- "Comando desativado" e "não existe aqui" mostravam o nome interno (`&repete` no
  inglês). Agora, o da tela.
- O nível de quem vê a ajuda era procurado pelo nome **escrito na tela**: no inglês,
  `&about` sumia para o membro (o mapa só conhece `sobre`) e `&staff title`,
  `&xp roles`… apareciam para ele (as palavras em inglês das partes de staff). Agora
  o nome vai para o interno antes (`idDoNome` + `normalizarArgs`). Conferido com a
  ajuda inteira vista por um membro, pt e en, antes e depois: 8 telas mudam, todas por
  isso.
- `&help tutorial` em inglês: "Also answers to `&tutorial` and `&tutorial`".
- `&help comando` em português: o uso era `[disable|enable <nome>]`.
- Em espanhol, `&help fun` virava `&ayuda entretenimiento` (o apelido `fun`): o grupo
  vence o apelido, como na entrada. Os grupos ganharam `diversion` e `empezar`.

**Mudou na tela pt/en, de propósito:** `pt|en` → `pt|en|es` (uso do `&idioma`,
grupos, tutorial, status); o aviso do primeiro comando oferece o espanhol; o
`&help idioma` descreve o espanhol. E o `&log aqui` em português agora passa pelo
caminho do `&log here` (o efeito é o mesmo; a confirmação diz "neste canal" em vez da
menção). O resto das 334 telas e das 985 respostas é igual (só relógio, sorteio, IDs e
contagem de linhas).

**Pendente, anotado:** `&help config` abre o grupo Personalizar — `config` também é
nome de grupo da ajuda, e o grupo vence. A página do `&config` não é alcançável, em
idioma nenhum, desde antes desta etapa. Não mexi: é escolher qual dos dois o `config`
abre. *(Resolvido em 6q.)*

**Provas:** 16 testes novos (seção 8 da comandos-17out, 73 no total), e o inventário
guarda também a tela em espanhol. 40 mutações, cada uma derruba ao menos um teste. A
`traducao-en-13out` aprendeu que `aqui → here` é espanhol, não "o português de
here" — o vocabulário que ela procura ficou idêntico (253 palavras). 97/97, build e
boot até o login.

## 6q. `&help config` abre o &config (20 out 2026)

Decisão do Ghieh: o `config` abre **todas as configurações do servidor**, ou seja, a
página do `&config`. O `config`, o `settings`, o `configuration` e o `configuração`
saíram da tabela de nomes antigos de grupo (`ALIAS_GRUPO`, help-grupos.js), onde
apontavam para o grupo Personalizar e venciam a página do comando. `configuracao`,
`configuração`, `configuracion` e `configuración` passaram a ser palavras da ajuda
que levam ao `config` (antes, as duas primeiras iam para o grupo). O grupo continua
em `&help personalizar` / `customize`.

Na tela pt/en, só o `&help config` mudou (das 334 telas e 985 respostas, o resto é
sorteio, dado e contagem de linhas). **Prova:** 1 teste novo (74 na comandos-17out),
pt/en/es com três palavras cada; derrubado pelas três mutações (o `config` de volta
ao grupo; sem `configuracao`; sem `configuración`). O teste antigo da `help-tutorial`
que fixava "`config` leva ao grupo Personalizar" passou a conferir a decisão nova (e
cai com o `config` de volta ao grupo).

**Mesmo padrão, não mexi (é escolha):** `&help xp` (e `nivel`, `level`, `levels`)
abre o grupo Diversão, e `&help game` (e `personagem`, `character`) o grupo RPG — as
páginas do `&xp` e do `&game` não abrem pelo `&help`.

## 6r. Privacidade P1: a memória da IA com consentimento (20 out 2026)

As regras do Stoat (Community Guidelines, "Keeping It Fair") já proíbem juntar dado
pessoal sem consentimento — inclusive "o scraping automatizado de mensagens, listas de
membros e perfis de usuário" sem permissão de quem é dono do dado. As respostas do
Trust & Safety ao dev do bronx (10 out 2026, de segunda mão) apontam para opt-in,
30 dias para dado pessoal e política de privacidade obrigatória. A Judy observava
**toda** mensagem dos servidores com chat e guardava fatos de todo mundo para sempre;
qualquer um mapeava e lia o perfil de outra pessoa.

**O que mudou (decisões do Ghieh):**
- **A memória antiga foi apagada**, uma vez, na abertura do banco (`ia_fatos_pessoa`,
  `ia_fatos_servidor`, `ia_perfil`, `ia_memoria`, `ia_historico`). A marca fica na
  tabela nova `migracoes`: não roda de novo.
- **Consentimento global** (`ia_consentimento`): a Judy, "como uma usuária", pergunta
  na primeira conversa, depois de responder, se pode lembrar da pessoa. Um "sim" ou
  "não" comum no mesmo canal, em até 30 min, com ou sem mencioná-la, é a resposta (pt,
  en e es). Sem resposta, pergunta de novo só depois de uma semana. Vale em todos os
  servidores. "Não" apaga o que houver.
- **Sem consentimento, nada:** o extrator de fatos não recebe a mensagem, a conversa
  não grava o "perguntou sobre…", e o que estiver no banco não chega ao modelo.
- **`&chat mapear` e `&chat perfil` só da própria pessoa.**
- **Histórico de conversa: 24 h**, para todos (poda na abertura e de hora em hora).
  Quem quiser, `&privacidade fio global`: a conversa continua de um servidor e canal
  para outro (lê as últimas 24 h, em vez dos 30 min do canal).
- **`&privacidade`** (novo, essencial, vale em qualquer canal, membro vê): o que a Judy
  guarda sobre você, `memoria on|off` (off apaga, em todos os servidores; a marca de
  gentileza fica — é escolha à parte) e `fio global|canal`. No registro, com a página
  de ajuda em pt/en/es desde o início.

**Testes:** suíte nova `privacidade-20out` (13 testes, com o LLM de mentira) — a
memória passiva só de quem aceitou, a pergunta e a resposta, o "sim" de outra pessoa /
outro canal / fora do prazo, o perfil só seu, a poda de 24 h, o fio global e a
migração única. 18 mutações, cada uma derruba ao menos um teste. Três testes antigos
foram ajustados ao comportamento novo (o fio com `global`; nos testes de conversa, a
pessoa "já respondeu" à pergunta, que senão vira a última saída). Nas telas pt/en,
só as páginas novas do `&privacidade` e a contagem de comandos (45 → 46).

## 6s. Privacidade P2: retenção e política (20 out 2026)

- **`&privacidade apagar`** (en `delete`, es `borrar`): mostra quanto há de cada grupo
  (memória da IA, XP, saldo, personagem do RPG) e dá um código; `apagar confirmar
  <código>` em até 2 min apaga, em todos os servidores (`core/retencao.js`). Ficam os
  registros de moderação — avisos, punições e a lista global de bans —, e a escolha
  ("não lembrar") fica, para a Judy não perguntar de novo.
- **Servidor de onde a Judy saiu:** `serverLeave`/`serverDelete` marcam a saída
  (tabela `servidores_saida`); `serverCreate` desmarca. Na subida, servidor com config
  onde ela não está entra na contagem (saiu com ela desligada). A cada 6 h, os que saíram
  há mais de 30 dias (`DIAS_APOS_SAIDA`) perdem **tudo** o que tem `serverId` — config,
  XP, punições, tickets, ganchos, feeds, IA, economia… — e as notícias vistas dos feeds
  apagados.
- **Log do container com pseudônimos:** todo ULID que o bot escreve no log vira
  `~` + 10 hex (HMAC com o segredo de `/data/log-segredo.key`); o conteúdo fica. É
  estável — dá para seguir um atacante —, e o dono calcula o de um ID com
  `&servidores pseudonimo <id>`. `LOG_ANONIMO=0` desliga. O `docker-compose.yml` ganhou
  teto de log (10 MB × 5 arquivos, `LOG_MAX_TAMANHO`/`LOG_MAX_ARQUIVOS`).
- **Backups com 30 dias:** o `atualizar-minipc.sh` apaga os mais velhos que
  `DIAS_BACKUP` (o recém-feito fica; o `restaurar` não poda). **O script mora fora do
  repositório (`~/atualizar-minipc.sh`): recopie.**
- **`PRIVACIDADE.md`** em pt/en/es: o que a Judy guarda, por quanto tempo, o que lê sem
  guardar, para onde vai, e os comandos. O `&privacidade` e o `&sobre` levam a ela
  (`POLITICA_PRIVACIDADE_URL` para quem roda a sua).

**Testes:** +7 na `privacidade-20out` (20 no total) — o código do apagar (errado,
vencido, certo), o que fica e o que sai, a saída e a volta, os 30 dias, a subida, o
pseudônimo estável e o console embrulhado, o teto do log e dos backups, a política e os
links. 19 mutações, cada uma derruba ao menos um teste. Nas telas pt/en: o link da
política no `&sobre` e as telas do `&privacidade`.

## 6t. Privacidade P3: XP com aviso e módulos desligados por padrão (20 out 2026)

**XP, opção B (decisão do Ghieh — "sem isso não funciona bem"):** o XP continua sendo
ligado pelo admin, mas ao ligar (`&xp on`, só na passagem de desligado para ligado) a
Judy publica um aviso aos membros — no canal e no canal de anúncio de nível, se houver:
o que é contado (só a contagem, não o texto), `&xp sair` para ficar de fora e
`&privacidade`. `&xp sair` (en `leave`, es `salir`) apaga o XP da pessoa naquele
servidor e ele para de contar (tabela `xp_fora`); `&xp entrar` volta, do zero. Vale com
o XP ligado ou não. O `&privacidade` mostra a situação do XP. A política foi atualizada.

**Servidor novo com todos os módulos desligados:** `desligarModulos()` (config-store)
desliga, além do automod, XP, moderação por IA, lista global de bans, chat livre,
comentário espontâneo, boas-vindas, despedida e voz — mesmo que o molde antigo salvo
no banco (`__default__`) diga outra coisa. Os comandos continuam ligados (decisão do
Ghieh: "só módulos"). O `&reset` usa a mesma função.

**Testes:** +3 na `privacidade-20out` (23 no total). 10 mutações: 9 derrubam um teste; a
do `&reset` (`desligarAutomod` no lugar de `desligarModulos`) é equivalente hoje — a
fábrica vem do padrão do código, onde esses módulos já estão desligados.

**Não fiz:** avisar os servidores que **já** tinham o XP ligado antes deste pacote (os
membros deles não viram o aviso). `&xp sair` vale para eles também.

## 6u. Privacidade P4: o relatório de ataques, por adesão e anônimo (20 out 2026)

Antes, o relatório horário do dono juntava eventos de **todos** os servidores (com o
nome deles; a imagem suspeita vinha com a menção de quem mandou) e o ritmo de conversa
de todos; e o dono podia pôr a conversa de um servidor alheio nos "assuntos". Decisão do
Ghieh: o servidor escolhe.

- **`&log relatorio on|off`** (en `report`, es `informe`; começa desligado, inclusive nos
  servidores que já existiam): o servidor manda ao dono da Judy os **ataques** —
  punições, raids e imagens suspeitas —, **anônimos**: o servidor vira
  `Servidor ~xxxxxxxxxx` (o mesmo pseudônimo do log), o título perde menções, IDs e o
  "— quem em onde", e nada da conversa vai (nem amostra). O `&log` mostra o estado.
- **Os servidores do próprio dono** (`RELATORIO_SERVIDOR`, ou de que um SUPER_ADMIN é
  dono): completos, como antes.
- **Os outros:** nada — nem o evento é gravado, nem as mensagens são contadas. O que foi
  gravado antes da regra passa por ela na hora de montar o relatório.
- **Assuntos só dos servidores do dono:** `&servidores relatorio assuntos add` recusa o
  servidor alheio (e o desconhecido), e uma lista antiga com um alheio não vale mais.
- A regra mora no `relatorio.js` (`modoDe`, `filtrarEvento`); o `main.js` a liga no boot.
  `desligarModulos` zera a adesão em servidor novo e no `&reset`.

**Testes:** +4 na `relatorio` (29), +1 na `privacidade-20out` (24); 4 testes antigos
ajustados à regra nova (o servidor alheio listado não ganha assunto; aderido aparece
com código, não com o nome). 13 mutações, cada uma derruba ao menos um teste — a do
padrão `relatorioDono: true` só caiu depois de um teste com servidor **antigo** (config
salva sem o campo), que foi acrescentado.

## 6v. P5: as novidades da Judy no canal de log (20 out 2026)

Pedido do Ghieh: um anúncio de atualização do bot a cada commit novo, no log. Fonte
escolhida: **as novidades do pacote** (não a mensagem do commit, que é para quem programa).

- **`modulos/ferramentas/novidades.js`:** a lista `NOVIDADES`, a mais nova primeiro, cada
  entrada com `id` (fixo — é a marca), `data` e o texto em pt/en/es. Comando no texto vai
  como `{&comando.sub}` e sai com o nome no idioma do servidor (`citarNoTexto`).
- **Na subida** (`main.js`, no `ready`): a Judy compara a marca global
  `novidadesAnunciadas` com o topo da lista e manda o que é novo, num embed, ao canal de
  log dos servidores que ligaram **`&log atualizacoes on`** (en `updates`, es
  `actualizaciones`; começa **desligado**), no idioma do servidor. A marca é gravada
  **antes** do envio (um reinício no meio não repete). O canal tem de ser do próprio
  servidor. A primeira subida com a lista só grava a marca (ninguém tinha como ter ligado
  a opção, e o que já existia não é novidade). Marca desconhecida (entrada removida): nada.
- **Regra daqui em diante:** cada pacote acrescenta **uma entrada no topo** de `NOVIDADES`,
  nos três idiomas, escrita para quem usa o bot. Pacote sem entrada nova = nenhum anúncio.

**Testes:** +3 na `privacidade-20out` (27): a lista (ids únicos, ordem, três idiomas, os
comandos com o nome certo em cada idioma, e a marca gravada pela subida do `main.js`); o
`anunciar` (1ª vez só marca; depois só os servidores que ligaram, no idioma deles, nunca
num canal de outro servidor, sem repetir); o `&log atualizacoes` (desligado por padrão).
8 mutações, cada uma derruba um teste — a do `citarNoTexto` (o `{&…}` cru na tela) só caiu
depois de o teste da lista conferir os nomes, que foi acrescentado.

## 6w. P6: cores sólidas e mais gradientes no painel (20 out 2026)

Pedido do Ghieh: "Sólidas + mais gradientes" no `&cor painel`.

- **10 sólidas** (`SOLIDAS`: vermelho, laranja, amarelo, verde, azul, roxo, rosa, marrom,
  preto, branco), com o mesmo tom do `&cor <cargo> vermelho` (core/cores.js) e um emoji
  cada (🔴🟠🟡🟢🔵🟣💗🟤⚫⚪). O cargo nasce com o nome da cor no idioma do servidor.
- **8 gradientes novos:** aurora, galáxia, sakura, menta, pêssego, lava, crepúsculo e
  algodão-doce (en galaxy, mint, peach, twilight, cotton-candy) — 20 no total, todos
  conferidos contra a regra de cor do Stoat.
- **Duas mensagens:** o Stoat aceita até **20 reações por mensagem**
  (`message_reactions = 20`, `Revolt.toml` do stoatchat), e o painel passou de 20 cores.
  As sólidas saem numa mensagem e os gradientes em outra (`MAX_REACOES`; um grupo maior
  que 20 seria fatiado). Uma mensagem só, quando só um grupo entra.
- **Exclusivo nas duas:** coluna nova `grupo` em `reaction_roles`
  (`setReactionRoleGrupo`, `regrasDoGrupo`). No modo exclusivo, escolher numa mensagem
  tira o cargo de cor das outras do grupo — e a reação antiga sai **da mensagem onde ela
  está** (antes, só se olhava a mensagem reagida). Mensagem sem grupo: igual a antes. O
  `addReactionRole` herda o grupo, como já herdava o modo e o canal.
- **Escolha:** `&cor painel aqui solidas` / `gradientes` (en `solid`/`gradients`, es
  `sólidos`/`degradados`) publica um grupo; os nomes das cores valem misturados
  (`&cor painel aqui verde fogo`). Cor desconhecida é recusada antes de criar qualquer
  cargo, listando as sólidas e os gradientes.
- **Cargo que já existe com o nome da cor e TEM permissões fica de fora** (e não é
  pintado): com as sólidas, um "Verde" de time ou um "Azul" de staff viraria cargo que
  qualquer um pega reagindo. Vale também para os gradientes. Sem permissões, é
  reaproveitado como antes.

**Testes:** suíte nova `cores-20out` (13): o painel completo (10 + 20, o limite de
reações, os tons, o grupo), o exclusivo entre as duas mensagens nos dois sentidos, o
cargo que não é de cor, a mensagem antiga sem grupo, os grupos e os nomes em pt/en, a
recusa e o cargo com permissões. Na suíte velha, todas falham. 16 mutações, cada uma
derruba ao menos um teste. Um teste de código-fonte da `global-16out` foi ajustado ao
nome novo da função que dá o nome ao cargo.

**Não fiz:** tradução dos nomes das cores para o espanhol na tela (a tela em espanhol
mostra os nomes em inglês, como o resto do `&cor` até a etapa 4b).

## 6x. P7: campo minado, jogo da velha e `&acesso livre` (20 out 2026)

Pedido do Ghieh: jogos no `&entretenimento`, que os membros possam usar fora dos canais
designados se o admin liberar.

- **`modulos/ferramentas/jogos.js`** (novo), chamado pelo `&entretenimento`:
  - **`campominado [facil|medio|dificil]`** (en `minesweeper`, es `buscaminas`): 6×6/5,
    8×8/10 (padrão) e 10×10/18 minas. Vai como **texto** — o spoiler do Stoat (`!!…!!`) é
    do texto da mensagem — com cada casa num spoiler, menos uma: a mais segura (vazia, se
    houver), para começar sem chute. O 10×10 fica bem abaixo dos 2000 caracteres.
  - **`velha [@pessoa]`** (en `tictactoe`, es `tateti`): tabuleiro num embed, a Judy reage
    com 1️⃣–9️⃣ e a jogada é a reação de quem é da vez (casa ocupada, pessoa de fora ou fora
    da vez: ignorado). Sem ninguém (ou marcando a Judy), contra a Judy, que fecha a linha
    dela, bloqueia a sua, pega o meio, depois um canto — dá para ganhar dela com duas
    ameaças. A partida vive na memória e acaba depois de 10 min parada (ou num reinício).
    O `main.js` passa a reação ao `jogos.aoReagir` logo depois das páginas.
- **`&acesso livre <comando> on|off`** (en `free`, es `libre`): o comando vale em qualquer
  canal mesmo com `&acesso canal somente|exceto` — `&acesso livre entretenimento on`
  solta os jogos. Aceita o nome em qualquer idioma; precisa de ManagePermissions, como o
  resto do `&acesso`; o `&acesso` mostra a lista. No modo `todos`, avisa que ainda não faz
  diferença. A checagem fica no mesmo ponto do `main.js` que já liberava os comandos de
  voz dentro da call. Comando desativado (`&comando desativar`) continua desativado.

**Testes:** suíte nova `jogos-20out` (15): o campo (minas, números, casa aberta, tamanho),
a mensagem em texto, os níveis e os nomes; a jogada da Judy; a partida contra alguém (vez,
casa ocupada, empate, vitória, nada depois do fim), contra a Judy, marcar a Judy, contra si
mesmo; os nomes em inglês e espanhol e a dica do `&campominado` solto; e o `&acesso livre`
(recusa antes, libera só o comando pedido, `off`, nome em inglês, desconhecido, sem
permissão, aviso no modo `todos`). No código de antes, 10 falham; os 5 que passam são as
regras puras do jogo (que só existem no módulo novo) e as travas que já valiam (a
restrição de canal, a permissão). 18 mutações, cada uma derruba ao menos um teste.

---

## 6y. P1–P7 num pacote só: revisão independente e regressão (20 out 2026)

Pedido do Ghieh: juntar P1–P7 num commit, pegar todos os erros que apareceram e
travar cada um com teste. Um revisor que não escreveu o código leu o diff inteiro
(`git diff` da f555413e) atrás de bug que os testes não pegavam. O que ele e a varredura
acharam, já corrigido:

| Erro | Pacote | Correção |
|---|---|---|
| `&privacidade apagar` apagava a proposta de troca que **outro** jogador fez à pessoa — e com ela o item em custódia do outro — e o companheiro que ela tinha **trocado** (já de outro dono) | P2 | só o que é dela sai; a proposta de outro é cancelada e o item (ou as moedas) volta ao autor; o companheiro trocado fica, sem ela em `donoOriginal`; o histórico do mercado fica sem ela |
| quem desligava a memória com uma mensagem esperando o debounce (8 s) ganhava fato novo depois do apagar; e o texto ia ao modelo | P1 | `memoria-agente.processar` confere o consentimento antes de chamar o modelo e de novo antes de gravar |
| o **tom** da conversa (`MODULAÇÃO`) lia os fatos de personalidade de quem não aceitou | P1 | só com consentimento |
| relatório anônimo: servidor que aderiu e de onde a Judy saiu nesta hora aparecia com o **ID real** | P4 | sem nome na lista, só o do dono sai com ID; os outros, com o pseudônimo |
| relatório anônimo: ia o "· N msg de M pessoa(s)" — a política promete só os ataques | P4 | servidor anônimo não tem a conversa contada |
| a limpeza de 30 dias deixava a cópia do `&reset` (`__reset__:<id>`) | P2 | sai com o servidor |
| a limpeza de 30 dias apagava um servidor marcado como "saiu" **sem ver se a Judy ainda está nele** (uma subida com a lista incompleta marcava um servidor ativo) | P2 | o servidor presente nunca é apagado — a marca sai |
| tela em inglês/espanhol: `&access free entretenimento on` (o nome do comando em português) | P7 | o nome no idioma da tela |
| `&servidores` recusava só em português ("Comando restrito") | antes do P1 | nos três idiomas |
| **o build do Docker abortava**: o `verificar-build.js` (o `RUN` do Dockerfile) lê toda marca de citação do código, e um *comentário* do `novidades.js` trazia uma de exemplo, inventada. Os pacotes P5, P6 e P7 não teriam subido no MiniPC — a conferência deles rodou a suíte e a subida do bot, mas não o verificador | P5 | o comentário descreve a marca sem escrevê-la; a suíte de regressão roda o verificador |

**Testes:** suíte nova `regressao-p1p7` (17), mais 1 na `relatorio` (30) e 3 na
`privacidade-20out` (30); 1 teste antigo da `relatorio` mudou com a regra (o servidor
anônimo não tem mais a conversa contada):
- o banco de antes do P1 (o esquema de hoje sem as tabelas e a coluna novas, com uma
  linha em **cada** tabela — tabela nova entra sozinha): a subida só zera as 5 tabelas da
  memória da IA, uma vez; nenhuma outra linha some;
- a limpeza de servidor que saiu: só o servidor que saiu, nunca o presente; tabela sem
  `serverId` intacta; a cópia do `&reset` sai;
- config salva antes do P1 (sem `relatorioDono`, `atualizacoes`, `livres`): nada novo
  liga, as telas abrem, o `&acesso livre` funciona;
- o exclusivo das cores com o evento de reação sem o canal (o bug antigo que o P6
  corrigiu: no código de antes, a reação antiga ficava — conferido);
- as telas novas sem português em inglês e com os nomes em espanhol;
- jogo que não começa com marca de erro; novidade que não cita comando à mão;
- os achados da revisão, um teste cada;
- o verificador do build do Docker.
25 mutações (16 que desfazem o que a suíte nova trava, 9 que desfazem as correções da
revisão): todas derrubam um teste. Duas só caíram depois de um teste a mais: o anúncio com a config crua (pelo
store o campo vem do padrão) e "nem o texto vai ao modelo" (a 2ª checagem sozinha
impedia a gravação, mas não o envio).

## 7. O que NÃO fiz, e por quê

| Item | Por quê |
|---|---|
| Quebrar `game.js` (3.438 linhas), `chat.js` (2.692) e `help-arvore.js` (2.401) | É a refatoração com melhor retorno em legibilidade, mas são justamente as áreas **sem teste de integração**. Fazer isso agora é apostar. Ordem sugerida: reconstruir o shim → quebrar os arquivos |
| Reconstruir o `fake-stoat.js` | Vale uma sessão só para isso. É o que destrava 8 suítes e torna seguro o item acima. **Quando reconstruir: os erros da API têm de ser lançados como string**, senão o shim repete a mentira que escondeu o bug do `retry_after` |
| Limitador central de rate limit | Só `reaction-roles` respeita o `429`. `sendMessage`, `member.edit` e a sincronização de cargos por nível não. O `chamarApi` é o lugar natural para isso, mas mexeria no caminho de todo comando |
| `force_disconnect` no `join_call` | Resolveria o `AlreadyConnected` de forma limpa, no lugar da cascata mover → forçar saída → resgate. Só dá para confirmar num canal travado de verdade |
| `temperature: 0.6` fixa no corpo da requisição | Provavelmente sobrepõe o `--temp 1.0` do Gemma. Precisa de medição antes de mexer |
| Verificar `X-Hub-Signature-256` nos webhooks | O segredo hoje é a própria URL (token de 128 bits). É uma decisão de design, não um bug |
| Atualizar `llama-swap.example.yaml` | Está desatualizado (LFM, `--reasoning-budget 0` que foi rejeitado), mas é exemplo, não código que roda |

---

## 8. Como aplicar

```bash
# 1. No PC (git só aqui)
cd /home/ghiso/Desktop/GhisoOF/Judy/Stoat_Bot
unzip -o ~/Downloads/stoat_bot-refatorado.zip -d /tmp/refat && cp -a /tmp/refat/pkg/. .
[ -f .env ] || cp .env.example .env      # o compose usa env_file

# 2. Conferir (só o último precisa de npm install)
node scripts/verificar-build.js
# (1 out 2026: as suítes viraram um arquivo só, testes.mjs — o nome de cada uma é o antigo sem "teste-")
node testes.mjs compatibilidade arvore-comandos help-render dependencias ia verificador refatoracao

git add -A && git commit -m "refatoracao: kiss, seguranca e remocao de legado" && git push

# 3. No MiniPC — backup ANTES (o banco usa WAL: são 3 arquivos)
ssh void@gmktec.tailaeddbe.ts.net
cd /home/void/judy-repo
docker compose stop stoat-bot
B=~/backup-judy-$(date +%F-%H%M); mkdir -p "$B"
for f in stoat.db stoat.db-wal stoat.db-shm automod-config.json; do
  docker cp "stoat-bot:/data/$f" "$B/" 2>/dev/null; done
git pull
docker compose config | grep -E "DB_PATH|CONFIG_PATH"   # tem de mostrar /data/...
docker compose up -d --build
docker logs stoat-bot 2>&1 | grep "Banco aberto" | tail -1
```

**Teste ao vivo, na ordem de risco:**

1. `&entrar` numa call e `&musica` — o `axios` saltou de 0.26 para 0.34 e a voz
   passou a importar só o caminho do LiveKit. Se quebrar, tire os `overrides`
   do `voz-servico/package.json` e rebuild.
2. `&help automod sentinela antiguidade` e um caminho errado de propósito.
3. `&blocklist`, `&warnings`, `&tts entrar` não respondem mais nada.
4. `&chat` com imagem anexada — cobre o `sharp` 0.35.4.
5. `&cor`, `&reactionrole`, `&ban` — os caminhos migrados para o `chamarApi`.

Para voltar atrás: `git revert` do commit.
