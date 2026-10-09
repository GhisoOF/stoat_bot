# Economia e dungeons — RPG

Planejamento (8 out 2026). **Aplicado no jogo na branch `rpg-v4`** (9 out 2026) — veja `docs/rpg/README.md` para o que entrou e o que ficou pendente. Fecha a
`D8` do plano e cria as duas formas de jogar — **contrato** e **dungeon**. A
luta, a recompensa em XP (D6) e a folga (D26) são as do
`PLANO-RPG-CONTEUDO.md`; aqui fica de onde sai a moeda e como as dungeons
são montadas. Números de:

```sh
node scripts/balanceamento-rpg.mjs economia2   # simulação de 90 dias do banco e das dungeons
```

---

## 1. Duas formas de jogar

| | 📜 **Contrato** (missão da guilda) | 🕳️ **Dungeon** (mundo aberto) |
|---|---|---|
| o que é | o quadro da guilda: as missões com nome do catálogo ("Conter o Assalto ao Banco") | uma área temática, com faixas de nível, inimigos e itens próprios ("Guerra de Armageddon: Humanidade × Orks") |
| a luta | a de sempre: o mesmo `resolver`, 40% / 70% no próprio nível, folga pela força, co-op | a mesma; o encontro é sorteado da lista da dungeon, no seu nível (dentro da faixa dela) |
| XP | a força da missão, igual para todos (D6) | igual |
| **quem paga a moeda** | **o banco** — é a guilda que paga | **o tesouro da própria dungeon** |
| cria moeda nova? | **não**: o banco só repassa o que entrou nele | **sim**: o tesouro se renova sozinho — é a **única** fonte de moeda nova do jogo |
| ao cair | perde moeda (vai **para o banco**); companheiros só se ferem | perde moeda (vai **para o tesouro da dungeon**); cada companheiro tem 20% de ser capturado e o resgate é na dungeon |
| loot | itens genéricos da faixa | **itens do tema** da dungeon (70%) e genéricos (30%) |
| chefe | — | no fim da dungeon (com nome, quando ela é de uma obra) |
| espera | 45 min | 45 min; chefe, 24 h por pessoa (D19) |

Os "bicos" de hoje (Entregar Encomendas, Organizar o Estoque…) viram
**contratos sem risco**, pagos pelo banco como os outros. As missões
especiais (`ESPECIAIS-E-HISTORIAS.md`) são contratos especiais.
`[proposta]` A diferença de risco (captura só na dungeon) e de loot (tema só
na dungeon) é minha — é o que faz as duas formas valerem a pena.

---

## 2. Quanto paga — Ouro e Cristal

Toda vitória paga **Ouro e Cristal**, em contrato e em dungeon:

```
alvo de Ouro     = 60 × 1,141^(nível da missão − 1)          (D12)
alvo de Cristal  = alvo de Ouro × 1/4 ÷ 40                   ← 1/4 do valor em Cristal, ao câmbio de referência
pago             = alvo × f(x)        x = estoque de quem paga ÷ (alvo × K)
f(x)             = 2x ÷ (1 + x)       ← 0 com o estoque vazio · 1 com K pagamentos guardados · tende a 2
nunca paga mais que o estoque
```

| estoque de quem paga | paga |
|---|---|
| vazio | nada |
| ¼ de K pagamentos | ×0,40 |
| ½ de K | ×0,67 |
| **K pagamentos** | **×1,00** |
| 2 K | ×1,33 |
| 4 K | ×1,60 |

É o "conforme a % que o banco e a dungeon têm": **banco cheio paga mais,
banco vazio paga menos** — e nunca chega a zero de vez, porque cada pagamento
é uma fração do que sobrou.

- **K do banco = 400** pagamentos do nível do contrato.
- **K da dungeon = 50 × (1 + jogadores ativos nela ÷ 10)** — a dungeon cheia de
  gente guarda mais.
- **Cristal pequeno arredonda pela sorte:** 0,38 Cristal vira 1 Cristal com 38%
  de chance (as moedas são inteiras desde 4 out).

| nível | alvo de Ouro | alvo de Cristal | Cristal hoje |
|---|---|---|---|
| 1 | 60 | 0,38 | — (só do nível 5 para cima) |
| 10 | 197 | 1,2 | ~1 a cada 40 missões |
| 20 | 735 | 4,6 | ~1 a cada 40 missões, e acaba |
| 30 | 2 751 | 17 | o banco esvazia numa missão |
| 50 | 38 472 | 240 | — |
| 70 | 538 097 | 3 363 | — |
| 100 | 28 146 866 | 175 918 | — |

**Muito mais Cristal:** hoje ele cai em ~1 de cada 40 missões e, a partir do
nível ~30, uma missão pede mais do que o banco inteiro tem. Agora cai em
**toda vitória**, sempre ~1/4 do valor do Ouro, e a dungeon cria Cristal novo
sem parar.

---

## 3. O banco (a guilda)

- **Paga** os contratos. Não cria moeda.
- **Recebe:**
  - **metade do que se gasta no NPC** (loja, magias, mercenários, respec); a
    outra metade o NPC **consome** — sai do jogo. É o **ralo** que equilibra a
    moeda nova das dungeons;
  - o que se perde ao cair num contrato;
  - o que já recebe hoje (câmbio, taxa do mercado entre jogadores).
- **Começa** como hoje: 200 000 Ouro e 5 000 Cristal.
- **O Ouro deixa de nascer em qualquer missão:** passa a nascer só na
  dungeon. Continua sem teto — o tesouro das dungeons não acaba —, mas agora
  tem origem e ralo.
- **Câmbio** segue a razão das reservas do banco, como hoje (3% de taxa).

---

## 4. O tesouro da dungeon — gera sem fim, no ritmo de quem joga

- Cada dungeon tem o seu tesouro de Ouro e de Cristal.
- **Renova sozinho, de hora em hora:** cada jogador que jogou nela nas últimas
  24 h traz **3 pagamentos do nível dele por dia**. Quem joga ~5 vezes por dia
  numa dungeon vence ~2; então, com a dungeon na média, o tesouro se mantém —
  e só esvazia quando alguém joga muito mais que os outros ali, o que espalha
  os jogadores pelas dungeons.
- **Capacidade:** 1,5 × K pagamentos do nível médio de quem está lá. Passando
  disso, não renova mais (mas as quedas continuam entrando).
- **Quem cai deixa moeda lá** — e ela volta para os vencedores pelo
  pagamento normal. Isso substitui o **pote da dungeon** de hoje (a regra de
  60% / 100% da D26 sai).
- **Inflação equilibrada:** a moeda nova é proporcional à atividade (não ao
  tempo), e o NPC consome metade do que se gasta nele.

---

## 5. Equilíbrio — simulação de 90 dias

Suposições: 40 jogadores no começo e 2 novos por dia; cada um faz 5
contratos e 5 dungeons por dia no próprio nível (40% de êxito, 70% de
sobrevivência, cair perde 10% do que carrega); gastam no NPC 80% do Ouro e 30%
do Cristal que têm, por dia; ninguém passa do 100. Uma dungeon genérica por
faixa.

| dia | jogadores | nível mediano | contrato paga (× alvo) | dungeon paga (× alvo) | banco: Ouro | banco: Cristal | Ouro em circulação | Cristal em circulação | câmbio do banco |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 42 | 4 | ×1,75 | ×0,51 | 194 685 | 4 927 | 197 291 | 5 008 | 39,5 |
| 3 | 46 | 9 | ×1,51 | ×0,65 | 182 826 | 4 714 | 188 818 | 4 993 | 38,8 |
| 7 | 54 | 22 | ×0,77 | ×0,82 | 149 072 | 3 665 | 171 424 | 4 875 | 40,7 |
| 14 | 68 | 43 | ×0,65 | ×0,86 | 948 758 | 4 385 | 1 266 014 | 14 637 | 216,4 |
| 30 | 100 | 81 | ×1,04 | ×1,07 | 1,04 bilhão | 3,9 mi | 1,38 bilhão | 14,1 mi | 268,4 |
| 45 | 130 | 100 | ×1,36 | ×1,15 | 9,9 bilhões | 50,6 mi | 11,8 bilhões | 130 mi | 194,9 |
| 60 | 160 | 100 | ×1,36 | ×1,14 | 12,9 bilhões | 72,0 mi | 15,8 bilhões | 194 mi | 179,3 |
| 90 | 220 | 100 | ×1,28 | ×1,15 | 12,8 bilhões | 76,9 mi | 17,5 bilhões | 276 mi | 166,9 |

O que a tabela mostra:

- **Nada esvazia.** O contrato oscila entre ×0,65 e ×1,75 do alvo — paga
  mais quando a guilda está cheia e menos quando os jogadores sobem rápido e o
  banco ainda não acompanhou —, e a dungeon fica perto de ×1,1 depois da
  primeira semana (no primeiro dia ela começa vazia e paga metade).
- **A moeda cresce com o nível dos jogadores**, não com o tempo: depois que
  todos chegam ao 100 (dia ~45), o Ouro em circulação quase para de crescer —
  o ralo do NPC segura.
- **O Cristal se valoriza:** o câmbio vai de 40 para ~170–270 Ouro por
  Cristal, porque os jogadores guardam mais Cristal do que gastam (30% na
  simulação). É o mercado funcionando: se ficar caro demais, a fração de 1/4
  pode subir.
- Os números dependem das suposições de gasto; o que importa é que **f(x)
  corrige sozinho** — banco ou tesouro baixo pagam menos até encher.

---

## 6. Dungeons temáticas

### 6.1 Como uma dungeon é feita

```yaml
- id: dg_<obra>_<nome>
  nome: ""
  obra: ""                      # vazio = genérica
  tema: ""                      # o conflito: "Humanidade × Orks"
  niveis: [11, 50]              # faixas que ela cobre; o encontro é no nível do jogador, dentro disso
  areas:                        # uma por faixa (ou parte dela) — entram na história
    - { faixa: 2, nome: "", inimigos: ["", "", ""] }
  loot_tema: [g_<obra>_<item>, …]   # 70% do loot; a raridade segue a regra de sempre (§6.4 do plano)
  chefe: b_<obra>_<nome>        # no fim; 24 h por pessoa
  perigo: normal                # D26
  descricao: { pt: "", en: "" }
```

- **O encontro** é uma missão gerada na hora: o inimigo sorteado da área da
  faixa, com o poder e o risco de uma missão do seu nível (dentro dos níveis
  da dungeon). Quem está acima da dungeon luta no nível máximo dela (e a folga
  pela força faz o resto); quem está abaixo, no mínimo.
- **O algoritmo de história** usa o tema, a área e o inimigo sorteado.

### 6.2 Uma genérica por dificuldade

Usam os itens genéricos da dificuldade como loot do tema; o chefe é o do
catálogo.

| dif. | dungeon | inimigos | chefe |
|---|---|---|---|
| 1 | **Esgotos da Cidade Velha** | ratos gigantes, ladrões de beco, cães de guarda | O Rei dos Ratos |
| 2 | **Floresta da Neve Eterna** | lobos, bandidos da estrada, cultistas | Lobo Ancestral da Neve |
| 3 | **Distrito do Sindicato** | capangas ciborgues, drones, atiradores | O Chefe do Sindicato Ciborgue |
| 4 | **Zona do Reator** | mutantes, robôs de contenção, enxames radioativos | Hidra do Reator |
| 5 | **Montanha Partida** | serpes, golens de lava, cultistas do dragão | Dragão da Montanha Partida |
| 6 | **Núcleo do Mundo** | elementais de magma, máquinas escavadoras, titãs menores | Titã do Núcleo |
| 7 | **Coroa da Estrela Negra** | anjos caídos, naves-sentinela, plasma vivo | Serafim da Estrela Negra |
| 8 | **Rastro do Devorador** | arautos, enxames estelares, bocas do vazio | O Devorador de Galáxias |
| 9 | **Encruzilhada dos Mundos** | duplos, cavaleiros de outra linha do tempo, paradoxos | O Rei de Todos os Mundos |
| 10 | **A Última Página** | personagens apagados, rascunhos, a própria narrativa | Aquele que Lê o Mundo |

### 6.3 Warhammer 40k — **Guerra de Armageddon: Humanidade × Orks**

A dungeon que você descreveu: o jogador luta pelo Imperium contra a invasão
Ork do planeta Armageddon. Cobre as **dificuldades 1 a 5** (níveis 1–50), que
é onde estão as 68 armas do `ARMAS-WARHAMMER-40K.md` (2 / 10 / 18 / 25 / 13).

| dif. | área | inimigos (Orks) |
|---|---|---|
| 1 | Colmeia Hades, os subníveis | Gretchin, Snotlings, um Ork Boy perdido |
| 2 | Colmeia Hades, a muralha | bandos de Ork Boyz (Choppa e Slugga), Shoota Boyz, um Nob |
| 3 | Ermos de Cinza | Kommandos, Burna Boyz, Deff Koptas, Warbikers |
| 4 | Helsreach, o porto | Meganobz, Deff Dreads, Killa Kans, Lootas |
| 5 | Linha de Tartarus | Gorkanauts, Stompas, a guarda do Senhor da Guerra |

- **Loot do tema (70%):** as armas do Imperium da dificuldade (bolters,
  espadas-serra, armas de plasma, martelos-trovão…), o Escudo de Tempestade e
  o Halo de Ferro — e, quando entrarem, **as armas Orks** (Choppa, Slugga,
  Shoota, Big Shoota, Burna, Rokkit Launcha, Power Klaw…), que os jogadores
  pegam dos Orks caídos. Para fazer as armas Orks com o mesmo cuidado das do
  Imperium, me mande as páginas como fez com as outras.
- **Chefe:** o **Senhor da Guerra Ork** da invasão, no fim da área 5 (nível
  50). `[DECIDIR]` se é um Warboss genérico (números do chefe da dificuldade 5)
  ou um com nome e ficha pelo VS Battles — nesse caso, me mande o perfil.
- **D21:** as armas de 40k continuam na loja normal; como loot, passam a cair
  **nesta dungeon** (70% do loot dela) em vez de no loot geral.
- Os nomes das áreas são de Armageddon na lore (as colmeias Hades, Helsreach e
  Tartarus, os Ermos de Cinza); confira se quiser outros.

### 6.4 Skyrim — **Castelo Volkihar**

Dificuldade 5 (níveis 41–50): vampiros, servos e gárgulas; chefe **Lorde
Harkon** (já pronto no `CHEFES-RPG.md`, nível 50), que entrega o Contrato da
Serana. Loot: genérico da dificuldade 5 até existirem itens de Skyrim.

Horus e o Ebony Warrior continuam chefes avulsos, sem dungeon.

---

## 7. Banco de dados e comandos

- **`rpg_dungeons`** (novo): `id`, `tesouroOuro`, `tesouroCristal`,
  `renovadoEm`, `ativos24h`. A coluna `dungeon` de `rpg_moedas` (o pote de hoje)
  é dividida entre as dungeons na migração.
- **Conteúdo** em `modulos/game/conteudo/<obra>.json`: as dungeons, as áreas,
  os inimigos e o loot do tema.
- **Comandos:**
  - `&game contratos` — o quadro da guilda; `&game contrato <nome>` — aceita.
  - `&game dungeons` — as dungeons do seu nível, com o tesouro de cada uma
    ("cheio", "na média", "quase vazio"); `&game dungeon <nome>` — explora (um
    encontro); `&game dungeon <nome> chefe` — o chefe.
- **Resgate de companheiro capturado:** na dungeon onde ele caiu.
