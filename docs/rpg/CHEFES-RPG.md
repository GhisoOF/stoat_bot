# Chefes com nome — RPG (v3 · revisão de 8 out)

Chefes tirados das obras. **Chefe luta como missão** — mesmo `resolver`,
mesmas consequências, mesmo co-op, mesma história; muda só os números e o que
ele deixa (`PLANO-RPG-CONTEUDO.md` §7). Personagens que também viram
companheiros têm a ficha no `COMPANHEIROS-RPG.md`.

```sh
node scripts/balanceamento-rpg.mjs chefe "<tier>"    # números do chefe no nível do tier
```

## Índice

| # | chefe | obra | tier | dificuldade · nível | poder | risco | recompensa única (uma vez por pessoa) |
|---|---|---|---|---|---|---|---|
| 1 | Horus — O Cerco de Terra | Warhammer 40,000 | 4-B | 7 · 68 | 796 750 | 612 846 | Escamas da Serpente |
| 2 | Horus — O Rei Sombrio | Warhammer 40,000 | up to High 1-B | 10 · 96 | 6 260 250 | 5 378 592 | Quebra-Mundos |
| 3 | Lorde Harkon | The Elder Scrolls V: Skyrim | High 6-A | 5 · 50 | 181 343 | 129 315 | Contrato da Serana |
| 4 | Ebony Warrior | The Elder Scrolls V: Skyrim | Low 2-C | 9 · 81 | 2 759 525 | 2 294 691 | Contrato do Ebony Warrior + Espada de Ébano do Vampiro |
| 5 | Rize Kamishiro, a Glutona | Tokyo Ghoul | 8-B | 3 · 27 | 21 897 | 16 002 | Contrato da Rize |
| 6 | Dragão (ato II da Rize) | Tokyo Ghoul | 7-A | 4 · 39 | 67 300 | 48 647 | Kakuhou da Rize (bioware, épica) |
| 7 | Tryce — Crew Battle da Bomb Rush Crew | Bomb Rush Cyberfunk | 9-C (avaliação) | 2 · 11 | 4 508 | 3 214 (804 com perigo baixo) | Contrato do Tryce + Boostpack Reserva |

Todos: 35% de vitória e 60% de sobrevivência com 4 jogadores do nível, ~7–11%
sozinho; deixam também o loot de chefe da faixa (item garantido, 25% de um da
seguinte, 20% de companheiro); espera de 24 h (D19). **Revisão de 8 out:** a
party de referência ganhou bioware e cyberware, o bônus de arma única (D27) e
o kit dos companheiros (D23), então o poder ficou ~3,4× e o risco ~5× o da
v3 (as chances continuam as mesmas). Desde 8 out os chefes ficam no fim das
dungeons (`ECONOMIA-E-DUNGEONS.md`); os de obra sem dungeon (Horus, Ebony
Warrior) continuam avulsos. Um êxito paga ~×7,5 de uma missão do
mesmo nível (D6 de 8 out: a recompensa é a força da missão).

## Atos: um personagem, vários chefes

Perfis do VS Battles com várias chaves podem virar **atos** — o mesmo
inimigo em pontos diferentes dos 100 níveis, cada um no nível do próprio tier,
cada ato liberando o seguinte. Vale a regra do "tier mais baixo" (`at least`,
`possibly`) para cada ato; **"up to X com <poder>"** — o teto — vale só para o
ato final. Chaves em que o personagem ainda é aliado na história ficam de
fora.

---

## 1. Horus Lupercal — Warhammer 40,000

### Fonte

| fonte | leitura |
|---|---|
| VS Battles — `Horus_Lupercal` | ✅ o texto completo que você colou (todas as chaves, estatísticas e equipamento) |

### Chaves

| chave | tier | no jogo |
|---|---|---|
| Loyalist | at least 8-B | **fora** — aqui ele ainda é aliado do Imperador |
| Warmaster of Chaos | at least 8-B | **fora** — mesmo tier da Loyalist; ficaram só as duas do Cerco |
| During the Siege of Terra | **4-B**, possibly High 3-A fisicamente, **up to High 1-B** com poderes psíquicos | os dois atos |

### Os dois atos

| ato | o quê | tier | dificuldade · nível | poder | risco | recompensa única |
|---|---|---|---|---|---|---|
| **I — O Cerco de Terra** | Horus no corpo a corpo: Solar System, um golpe da maça cria uma supernova | 4-B | 7 · **68** | **796 750** | **612 846** | Escamas da Serpente |
| **II — O Rei Sombrio** | Horus com o poder dos deuses do Caos: tempo, espaço e alma | up to High 1-B | 10 · **96** | **6 260 250** | **5 378 592** | Quebra-Mundos |

O ato II só abre para quem venceu o ato I. Os dois são chefes normais.

### Itens únicos

Caem uma vez por pessoa; o NPC não compra nem vende; entre jogadores, pode.

| item | ato | vaga | tipo | raridade | números (único: ×1,2) |
|---|---|---|---|---|---|
| **Escamas da Serpente** | I | corpo | armadura de exterminador | celestial | **defesa 522** |
| **Quebra-Mundos** | II | mão · pesado | branca — maça de energia, bater: **For S** | supremo | **dano 3 018**; Força 70 em uma mão / 35 em duas; Destreza 5 |

O Quebra-Mundos, na lore, o Horus usa numa mão só; aqui, quem tiver Força 70
também pode.

### Fichas

```yaml
- id: b_wh40k_horus_cerco
  nome: { pt: "Horus — O Cerco de Terra", en: "Horus — The Siege of Terra" }
  obra: "Warhammer 40,000"
  vsb: "https://vsbattles.fandom.com/wiki/Horus_Lupercal"
  chave: "During the Siege of Terra (físico)"
  tier: "4-B"
  tipo: chefe
  nivel: 68
  poder: 796750
  risco: 612846
  recompensa: { item: g_wh40k_escamas_serpente }   # uma vez por pessoa
  falas:
    inicio: { pt: "Eu vi o fim de todas as coisas. Vim apressá-lo.", en: "I have seen the end of all things. I came to hasten it." }

- id: b_wh40k_horus_rei
  nome: { pt: "Horus — O Rei Sombrio", en: "Horus — The Dark King" }
  chave: "During the Siege of Terra (psíquico)"
  tier: "High 1-B"               # "up to" — só no ato final
  tipo: chefe
  nivel: 96
  poder: 6260250
  risco: 5378592
  requer: b_wh40k_horus_cerco
  recompensa: { item: g_wh40k_quebra_mundos }      # uma vez por pessoa
  falas:
    derrota: { pt: "Os deuses... me soltaram.", en: "The gods... let me go." }

- id: g_wh40k_escamas_serpente
  nome: "Escamas da Serpente"
  slot: armadura
  raridade: celestial
  especial: true
  defesa: 522                    # 8 × 64 × 0,85 × 1,2

- id: g_wh40k_quebra_mundos
  nome: "Quebra-Mundos"
  slot: mao
  porte: pesado
  tipo: branca
  raridade: supremo
  escala: { forca: S }
  traco: 1.2                     # maça de energia: ignora armadura
  especial: true
# calculado: dano 3 018 (com ×1,2 de único) · Força 70 (uma mão) / 35 (duas) · Destreza 5
```

As falas são originais, no espírito do personagem — nada copiado dos livros.
Elas entram na história da missão (abertura e derrota), no lugar dos trechos
sorteados.

---

## 2. Lorde Harkon — The Elder Scrolls V: Skyrim (Dawnguard)

Pai da Serana. VS Battles: **High 6-A** (Multi-Continent; Massively
Hypersonic+; Class 1 por telecinese) → **dificuldade 5, nível 50**: poder
**181 343**, risco **129 315**. Recompensa única: o **Contrato da Serana**. Fica no fim da dungeon
**Castelo Volkihar** (`ECONOMIA-E-DUNGEONS.md` §6.4).

```yaml
- id: b_tes_harkon
  nome: "Lorde Harkon"
  obra: "The Elder Scrolls V: Skyrim — Dawnguard"
  tier: "High 6-A"
  tipo: chefe
  nivel: 50
  poder: 181343
  risco: 129315
  recompensa: { contrato: f_tes_serana }       # uma vez por pessoa
```

## 3. Ebony Warrior — The Elder Scrolls V: Skyrim (Dragonborn)

**Low 2-C** → **dificuldade 9, nível 81**: poder **2 759 525**, risco
**2 294 691**. Recompensa única: o **Contrato do Ebony Warrior** e a **Espada de
Ébano do Vampiro**. Ficha completa no `COMPANHEIROS-RPG.md`.

## 4. Rize Kamishiro — Tokyo Ghoul

**8-B** (at least) → **dificuldade 3, nível 27**: poder **21 897**, risco
**16 002**. Recompensa única: o **Contrato da Rize**. Ficha completa no
`COMPANHEIROS-RPG.md` §4.

**Ato II — Dragão** (decidido): a segunda chave do perfil, **7-A** (at
least) → **dificuldade 4, nível 39**: poder **67 300**, risco **48 647**. Abre
para quem venceu a Rize; entrega o **Kakuhou da Rize** (bioware ofensiva
rubra, épica, única). Como o Horus e o Ebony Warrior, os dois ficam avulsos,
sem dungeon — dá para pôr numa dungeon de Tokyo Ghoul depois, se quiser.

## 5. Tryce — Bomb Rush Cyberfunk

**Sem perfil no VS Battles** — tier **9-C** avaliado pela wiki do jogo
(segura, em grupo, a blindagem do tanque do Faux; pula do telhado da
delegacia no canal) → **dificuldade 2, nível 11**: poder **4 508**, risco
**3 214**. Recompensa única: o **Contrato do Tryce** e o **Boostpack
Reserva** (acessório incomum, único: Agilidade 2, Destreza 1). Ficha completa e
justificativa no `COMPANHEIROS-RPG.md` §5.

A luta é uma **crew battle** pelo Código da Rua, então tem **perigo baixo**
(D26, decidido em 9 out): risco **804**, recompensa × 0,92 — a vitória fica
igual (35% com 4), a sobrevivência sobe para 86% com 4 e 57% sozinho. É o
único chefe com perigo baixo.
Fica avulso, como a Rize — dá para pôr numa dungeon de New Amsterdam depois.
