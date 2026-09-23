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

## 6c. Anti-duplicata e comandos em árvore (3ª rodada)

### O spam que passou (bot "Stork", 23 set)

A mesma mensagem longa, repetida 5+ vezes, num ritmo calmo. Passou porque as
três defesas olhavam para lugares diferentes: **anti-spam** mede velocidade
(5 msg / 4 s), **anti-repeticao** olha *dentro* de uma mensagem (o mesmo
caractere seguido) e vem desligado, e o **sentinela** julga o *conteúdo* — que
era inofensivo. **Ninguém comparava uma mensagem com a anterior.** (O automod
não ignora bots; isso foi verificado, não era a causa.)

**`antiDuplicata`** (novo, ligado por padrão): guarda uma "digital" das
mensagens recentes de cada autor e conta as repetições. Na 3ª vez em 2 minutos,
apaga e pune. A digital normaliza acento, caixa, pontuação, espaço e emoji, então
esses disfarces não passam. Mensagens com menos de 12 caracteres úteis são
ignoradas (`ok`, `kkkk`), e repetir duas vezes continua aceitável.

No **sentinela**, a repetição virou sinal (peso 2), somado junto com o ritmo.
Calibrado para **não condenar sozinho**: texto limpo repetido 4× continua com
nota baixa. Quem pune é a regra determinística; o sinal só soma com o resto.

`teste-duplicata.mjs` (15 asserções) usa o texto real do Stork.

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
# 1. No PC (a regra do projeto: git só aqui)
cd ~/Downloads/github
unzip -o ~/Downloads/stoat_bot-refatorado.zip -d /tmp/refat && cp -a /tmp/refat/. .
cp .env.example .env   # SE ainda não existir: o env_file agora exige o arquivo

# 2. Conferir antes de commitar
node scripts/verificar-build.js
node teste-refatoracao.mjs && node teste-ia.mjs && node teste-verificador.mjs

git add -A && git commit -m "seguranca: fecha 42 alertas do Dependabot; kiss: cliente unico da API do Stoat" && git push

# 3. No MiniPC
cd /home/void/judy-repo && git pull && docker compose up -d --build

# 4. Conferir que a configuração agora CHEGA (era o bug do compose)
docker exec stoat-bot printenv | grep -E 'SD_MODELO_TIPO|SPOTIFY|STOAT_API|CDN_URL|LLAMA_CTX'
```

**Teste ao vivo, na ordem de risco** (do mais provável de quebrar para o menos):

1. **`&tts entrar` numa call e `&musica`** — é o único ponto com risco real: o
   `axios` saltou de 0.26 para 0.34 e o `join_call` passa por ele. Se falhar,
   o culpado mais provável é esse salto: tire `"axios"` dos `overrides`,
   rebuild, e você recupera a voz perdendo 23 alertas.
2. **`&chat` com imagem anexada e "desenha ..."** — cobre o `sharp` 0.35.4.
3. **`&cor <cargo> gradiente ...`, `&reactionrole`, `&ban`/`&desbanir`** —
   cobrem os caminhos migrados para o `chamarApi`.
4. **`&embed` com um anexo do Stoat** — a capa tem de aparecer como imagem, sem
   o aviso de "site de terceiros".

Para voltar atrás em qualquer ponto: `git revert` do commit. Os lockfiles estão
no pacote, então o build é reproduzível.
