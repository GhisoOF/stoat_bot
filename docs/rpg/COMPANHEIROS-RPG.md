# Companheiros com nome — RPG (v3, níveis 1–100 · revisão de 8 out)

Um personagem por seção: fontes, escalonamento, estrelas, números e ficha. A
régua está no `PLANO-RPG-CONTEUDO.md` (§2 e §3); os genéricos de cada faixa,
no `CATALOGO-GENERICO.md`; os chefes com nome, no `CHEFES-RPG.md`. Números de:

```sh
node scripts/balanceamento-rpg.mjs ficha "<tier>" "<atributo=★,...>" [níveis] [classe]
```

Nas tabelas, **dano / sobrev.** é quanto o personagem muda a party de
referência quando entra no lugar do combatente genérico da faixa; a coluna
do lado mostra o mesmo para o genérico da classe dele, para comparar.

## Índice

| # | personagem | obra | tier | dificuldade | nível | raridade | classe | como se obtém | estado |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Serana | Skyrim — Dawnguard | 6-A (pelo pai) | 5 Tectônico | 49 | lendária | mago | contrato do chefe Lorde Harkon (nível 50) | decidido |
| 2 | J'zargo | Skyrim | High 8-C | 3 Urbano | 24 | rara | mago | contrato da missão especial "O Experimento" (nível 24) | decidido |
| 3 | Ebony Warrior | Skyrim — Dragonborn | Low 2-C | 9 Multiversal | 81 | primordial | combatente | contrato do chefe Ebony Warrior (nível 81) | decidido |
| 4 | Rize Kamishiro | Tokyo Ghoul | 8-B (Dragão: 7-A) | 3 Urbano | 27 | rara | combatente | contrato do chefe Rize (nível 27) | decidido |
| 5 | Tryce | Bomb Rush Cyberfunk | 9-C (avaliação minha — sem perfil) | 2 Sobre-humano | 11 | incomum | suporte | contrato do chefe Tryce, crew battle (nível 11) | decidido |

**O que mudou na v3:** com 10 níveis por faixa (1–100), os níveis dobraram
(J'zargo 12 → 24; Serana 24 → 49; Ebony Warrior 41 → 81). **Revisão de 6 out:**
os três seguem a mesma regra — contrato, uma vez por pessoa; o duelo e o
bônus de duelo saíram, e o Ebony Warrior virou um chefe normal.

## Regras que valem para todos

- **Orçamento** = genérico da classe (mago 8, as outras 7, contando o piso de
  Vida) × raridade × **kit da classe** × destaque. O kit (D23, 8 out) é o
  equipamento que ele não usa mais, embutido no ganho por nível, calibrado
  para que, na média, o jogador faça ~34% da party e cada companheiro ~33%:
  combatente ×4,37, tank ×7,77, mago ×11,32, suporte ×9,44.
- **Peso = estrelas²**; o piso de Vida sai antes, então estrela de Vida conta.
- **Magia própria:** custo da magia da classe; poder da classe × raridade ×
  destaque. Muda o nome e o tipo.
- **Sinergia** (plano §4.5, sem teto desde 8 out): as tabelas não contam o
  bônus por misturar tipos de dano. Numa party toda corpo a corpo, a Serana
  (mágica) acrescenta **+12%** e o J'zargo, **+13%**; o Ebony Warrior é corpo a
  corpo e não muda nada.
- **Bioware e cyberware** (plano §4.8): só o jogador usa. A party de
  referência das tabelas já tem os seis implantes do jogador (revisão de 8 out),
  e, desde a D27, o montante dela tem o bônus de arma única.
- **Destreza** agora conta por membro e vira escala das armas de mira;
  **Carisma e Sorte** de companheiro ainda rendem pouco (plano §1.5).
- **Companheiros sobem com o dono** (D2-b): entram no nível de quem os recebe.
- **Sem equipamento (D23, 8 out):** companheiro não recebe arma, armadura nem
  item nenhum — ele já é um kit completo. O que o equipamento daria está no
  ganho por nível (o kit da classe, acima).
- **Imagens** fora do repo público; o catálogo guarda a URL.
- **Todo personagem com nome** sai como **contrato**, uma vez por pessoa, de
  uma missão especial ou de um chefe — item negociável entre jogadores até ser
  usado; o NPC não compra nem vende (`ESPECIAIS-E-HISTORIAS.md` §1).
- **Fontes que não abriram** ficam registradas na seção do personagem.

---

## 1. Serana — The Elder Scrolls V: Skyrim (Dawnguard)

### Fontes

| fonte | leitura |
|---|---|
| UESP — `Skyrim:Serana` | ✅ inteira, pelo espelho `app.uesp.net` (o `en.uesp.net` bloqueia acesso automático) |
| VS Battles — `Lord Harkon` | ⚠️ só o resumo da busca (tier e estatísticas principais); Powers and Abilities, Intelligence, Weaknesses e Notable Attacks **não foram lidos** |
| Elder Scrolls Fandom — `Serana#Combat` | ❌ recusou o acesso; o UESP cobre o combate |
| gameplayask.blog | ❌ bloqueou o acesso; não lido |
| VS Battles — Serana | não existe perfil |

### Escalonamento

**Harkon (VS Battles):** High 6-A — Attack Potency e Durability
Multi-Continent; combate Massively Hypersonic+; Lifting Strength Class 1 por
telecinese; fôlego presumivelmente inesgotável. Há pedidos no fórum para Low
2-C, mas o perfil está em High 6-A.

**Serana:** abaixo do pai (os golpes dela não atravessam o escudo de sangue
dele; quem o vence é o Dovahkiin com o Arco de Auriel), abaixo da mãe (ela
mesma diz), e na mesma luta que o Dovahkiin contra Durnehviir, Vyrthur e
Harkon. **Decidido (8 out): 6-A** → dificuldade 5, lendária, nível 49,
destaque ×1,17.

### Estrelas

| atributo | ★ | por quê |
|---|---|---|
| Inteligência | 3 | luta principalmente com magia: Drenar Vida, gelo, raio |
| Vida | 3 | a maior vida entre os seguidores do jogo; o dreno cura a ela |
| Mana | 2 | necromancia + gelo + raio + dreno |
| Agilidade | 2 | Sneak é perícia principal; velocidade compatível com o tier |
| Carisma | 2 | reergue cadáveres (invocações contam em Carisma) |
| Força | 1 | Adaga Élfica, perks de uma mão |
| Destreza | 1 | Bladesman, Hack and Slash, Fighting Stance |
| Resistência | 1 | armadura leve; resistência a magia e imunidades ficam como traço |
| Sorte | 0 | nada no kit dela |

Classe: **mago**. `ficha "6-A" "inteligencia=3,vida=3,mana=2,agilidade=2,carisma=2,forca=1,destreza=1,resistencia=1" 41,49,50`
— 295,8 pontos/nível.

| nível | For | Des | Res | Agi | Vida | Mana | Int | Sor | Car | soma | mago lendário | dano / sobrev. (ela) | (mago genérico) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 41 | 289 | 289 | 289 | 1 155 | 5 198 | 1 155 | 2 599 | 0 | 1 155 | 12 129 | 10 398 | +52% / +46% | +63% / −5% |
| 49 | 345 | 345 | 345 | 1 381 | 6 212 | 1 381 | 3 106 | 0 | 1 381 | 14 496 | 12 425 | +53% / +47% | +66% / −5% |
| 50 | 352 | 352 | 352 | 1 409 | 6 340 | 1 409 | 3 170 | 0 | 1 409 | 14 793 | 12 680 | +53% / +47% | +66% / −5% |

Um pouco menos de dano que um mago lendário e muito mais sobrevivência: a "maga que não
cai".

### Magia, obtenção e traços

- **Magia própria:** **Dreno Vampírico** (ataque, custo 3, poder 1,47) —
  decidido.
- **Obtenção (decidido):** o **Contrato da Serana**, uma vez por pessoa, do chefe de dungeon **Lorde Harkon** — High 6-A →
  dificuldade 5, nível 50, poder **181 343**, risco **129 315** (35% de vitória
  com 4 jogadores, ~8% sozinho). Ficha no `CHEFES-RPG.md`.
- **Traços** `[ideia]`: imune a gelo, veneno e doença; fraca a fogo; no jogo
  é essencial — aqui, "nunca é capturada na dungeon".

### Imagens

A 3 (retrato quadrado) como miniatura; a 2 e a 5 para corpo inteiro. A 1
parece de mod e a 4 é foto da tela com a interface — fora.

### Ficha

```yaml
- id: f_tes_serana
  nome: "Serana"
  obra: "The Elder Scrolls V: Skyrim — Dawnguard"
  vsb: "https://vsbattles.fandom.com/wiki/Lord_Harkon"   # escalonada pelo pai
  chave: "vampira (antes da cura)"
  tier: "6-A"
  estrelas: { inteligencia: 3, vida: 3, mana: 2, agilidade: 2, carisma: 2, forca: 1, destreza: 1, resistencia: 1 }
  magia: { nome: "Dreno Vampírico", tipo: ataque }
  obtencao: chefe:b_tes_harkon
  descricao:
    pt: "Dormiu séculos num sarcófago. Acordou de mau humor e com um Pergaminho Ancião nas costas."
    en: "Slept for centuries in a sarcophagus. Woke up cranky, with an Elder Scroll on her back."
  imagem: "<url da imagem 3>"
# calculado: dificuldade 5 · lendária (×2,8) · nível 49 · destaque 1,17 · 295,8 pontos/nível · mago
```

---

## 2. J'zargo — The Elder Scrolls V: Skyrim

### Fontes

| fonte | leitura |
|---|---|
| VS Battles — `J'zargo` | ⚠️ recusou o acesso; lido pelos **seus prints**. Neles não aparece Notable Attacks/Techniques |
| UESP — `Skyrim:J'zargo` | ⚠️ bloqueou o acesso; lido pelos **seus prints** |
| Elder Scrolls Fandom — `J'zargo (Skyrim)` | ✅ lida inteira |

### Perfil e escalonamento

**VS Battles:** at least **High 8-C** — Attack Potency e Durability Large
Building, algumas magias ignoram durabilidade; Subsonic em combate, Massively
Hypersonic+ no ataque de choque; Lifting e Striking Unknown; magicka
reforçada pelo manto; alcance de uma dezena de metros; Gifted; fraqueza: os
pergaminhos ferem quem usa.

High 8-C → **dificuldade 3, rara, nível 24, destaque ×1,07**.

### Estrelas

| atributo | ★ | por quê |
|---|---|---|
| Inteligência | 3 | Destruição 100; magia dupla até a magicka acabar |
| Mana | 2 | 13 magias (9 em combate); 325–450 de magicka |
| Vida | 2 | 458–717, regenera rápido — "um dos seguidores mais duráveis" |
| Resistência | 2 | Armadura Pesada 100 e Steadfast Ward; cai rápido contra magos |
| Destreza | 2 | choque Massively Hypersonic+; Uma Mão 100; arco |
| Agilidade | 2 | compatível com o tier; recua enquanto conjura |
| Força | 1 | Striking Unknown; luta de punho sem magicka |
| Carisma | 1 | Heal Other, Ilusão 100 e o "charme" que ele se atribui |
| Sorte | 0 | — |

Classe: **mago**. `ficha "High 8-C" "inteligencia=3,mana=2,vida=2,resistencia=2,destreza=2,agilidade=2,forca=1,carisma=1" 21,24,30`
— 154,6 pontos/nível.

| nível | For | Des | Res | Agi | Vida | Mana | Int | Sor | Car | soma | mago raro | dano / sobrev. (ele) | (mago genérico) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 21 | 80 | 321 | 321 | 321 | 1 082 | 321 | 721 | 0 | 80 | 3 247 | 3 044 | +34% / +57% | +60% / −5% |
| 24 | 92 | 366 | 366 | 366 | 1 235 | 366 | 825 | 0 | 92 | 3 708 | 3 478 | +35% / +59% | +62% / −5% |
| 30 | 115 | 458 | 458 | 458 | 1 545 | 458 | 1 031 | 0 | 115 | 4 638 | 4 348 | +36% / +61% | +65% / −5% |

**Mago de armadura:** dano um pouco abaixo do mago raro, sobrevivência bem
acima. Bate com a wiki (durável, dano limitado por preferir choques fracos).

### Magia, obtenção e traços

- **Magia própria (decidido):** **Faíscas Duplas** (ataque, custo 3, poder
  0,77) — ele luta com choque nas duas mãos. O Manto de Chamas ficou de fora:
  é uma armadura de fogo que fere quem chega perto, não um ataque.
- **Obtenção (decidido):** a **missão especial "O Experimento de J'zargo"**
  — dificuldade 3, nível 24, poder **4 828**, risco **2 703** (30% / 60% no
  próprio nível); o **Contrato de J'zargo** cai no primeiro êxito de cada
  jogador.
- **Traços** `[ideia]`: o pergaminho explode e fere a própria party.

### Imagens

A 1 (corpo inteiro) como principal; a 2 é o melhor retrato, mas precisa
recortar o "E Talk J'zargo"; a 3 (fogo) como ação; a 4 tem resolução baixa.

### Ficha

```yaml
- id: f_tes_jzargo
  nome: "J'zargo"
  obra: "The Elder Scrolls V: Skyrim"
  vsb: "https://vsbattles.fandom.com/wiki/J%27zargo"
  chave: "aprendiz do Colégio de Winterhold"
  tier: "High 8-C"
  estrelas: { inteligencia: 3, mana: 2, vida: 2, resistencia: 2, destreza: 2, agilidade: 2, forca: 1, carisma: 1 }
  magia: { nome: "Faíscas Duplas", tipo: ataque }
  obtencao: especial:e_tes_experimento_jzargo   # cai como contrato
  descricao:
    pt: "J'zargo será Arquimago. J'zargo só precisa que alguém teste os pergaminhos antes."
    en: "J'zargo will be Arch-Mage. J'zargo only needs someone to test the scrolls first."
  imagem: "<url da imagem 1>"
# calculado: dificuldade 3 · rara (×1,6) · nível 24 · destaque 1,07 · 154,6 pontos/nível · mago
```

---

## 3. Ebony Warrior — The Elder Scrolls V: Skyrim (Dragonborn)

**Pedido:** chefe **e** companheiro, e à altura de "o mais forte de Skyrim".

### Fontes

| fonte | leitura |
|---|---|
| UESP — `Skyrim:Ebony_Warrior` | ⚠️ pelos **seus prints** (infobox, perks, equipamento, combate, notas, bugs) |
| Elder Scrolls Fandom — `The_Ebony_Warrior` (a missão) | ⚠️ pelos **seus prints** |
| VS Battles — `The Ebony Warrior` | ⚠️ pelos **seus prints**: perfil completo |

Nada importante faltou.

### O que as fontes dizem

- **Jogo:** nível 80; só aparece quando o Dragonborn chega ao 80, vai atrás
  dele numa capital e o desafia na Última Vigília. Quer morrer em combate
  digno. Vida 2 071. Árvores de Uma Mão, Arquearia, Bloqueio e Armadura
  Pesada quase inteiras (Reflect Blows devolve dano). Grita Força Implacável
  e Desarmar; conjura Atronach da Tempestade, Comandar Daedra, Manto de Gelo,
  Pele de Ferro, Fechar Feridas. Imune a paralisia, Bend Will, Wabbajack;
  quase imune a magia. Ébano encantado completo; espada que absorve vida.
- **VS Battles:** **Low 2-C** — Attack Potency, Striking Strength e
  Durability Universe level+ (escalado pelo Dovahkiin do fim do jogo);
  velocidade Immeasurable; Stamina Superhuman; alcance de centenas de metros
  com Thu'um e magia; Gifted; **sem fraquezas notáveis**.

### Escalonamento

Low 2-C → **dificuldade 9 Multiversal, primordial (×9,3), nível 81,
destaque ×1,00**. É o personagem de Skyrim mais alto da régua — quatro faixas
acima da Serana.

### Como chefe

Um chefe normal (`PLANO-RPG-CONTEUDO.md` §7): a mesma luta das missões,
**poder 2 759 525 · risco 2 294 691** — 35% de vitória e 60% de sobrevivência com 4
jogadores do nível 81, ~8% sozinho. Deixa o loot de chefe da faixa e, uma vez
por pessoa, o **Contrato do Ebony Warrior** e a **Espada de Ébano do
Vampiro**. Ficha no `CHEFES-RPG.md`.

### Como companheiro

Na mesma régua da Serana e do J'zargo — sem bônus — ele tem o orçamento do
combatente primordial genérico, e as estrelas decidem como ele gasta:

| estrelas | dano / sobrev. no 81 | |
|---|---|---|
| For 3, Des 3, Res 2, Vida 2, Agi 1, Mana 1 (as da v2) | −31% / +12% | muita estrela em Destreza, que sem arma de mira rende pouco |
| **For 3, Vida 2, Res 2, Des 1, Agi 1, Mana 1** | **−17% / +17%** | **decidido** (8 out): guerreiro de armadura, como no jogo |
| For 3, Vida 2, Res 1, Des 1 (o formato do combatente) | 0% / −1% | igual ao genérico, só muda o nome e a magia |

Companheiro não usa arma (D23), então a Destreza 3 da primeira linha não
teria onde render — por isso ficou a segunda.

| atributo | ★ | por quê |
|---|---|---|
| Força | 3 | Weapon Mastery; árvore de Uma Mão quase inteira; Universe+ |
| Vida | 2 | 2 071 de vida, armadura de regeneração, perks de recuperação, cura |
| Resistência | 2 | Armadura Pesada completa, Bloqueio, imunidades |
| Destreza | 1 | Arquearia — rende pouco nas fórmulas de hoje |
| Agilidade | 1 | corre mais que os outros NPCs, sem foco em esquiva |
| Mana | 1 | gritos, Atronach, Manto de Gelo, Pele de Ferro, cura |
| Int, Sor, Car | 0 | — |

Classe: **combatente**. `ficha "Low 2-C" "forca=3,vida=2,resistencia=2,destreza=1,agilidade=1,mana=1" 81,90,100`
— 284,5 pontos/nível.

| nível | For | Des | Res | Agi | Vida | Mana | Int | Sor | Car | soma | combatente primordial | dano / sobrev. (ele) | (combatente genérico) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 81 | 7 407 | 823 | 3 292 | 823 | 9 876 | 823 | 0 | 0 | 1 | 23 045 | 23 045 | −17% / +17% | 0% / 0% |
| 90 | 8 230 | 914 | 3 658 | 914 | 10 973 | 914 | 0 | 0 | 1 | 25 604 | 25 605 | −17% / +17% | 0% / 0% |
| 100 | 9 144 | 1 016 | 4 064 | 1 016 | 12 192 | 1 016 | 0 | 0 | 1 | 28 449 | 28 449 | −39% / +12% | −28% / −1% |

No 100 a comparação já é com a party supremo (faixa 10): um combatente
primordial, genérico ou não, fica abaixo dela — por isso o −28% do genérico.

**Magia própria:** Força Implacável — ataque, custo 2, poder 3,26 (Golpe
Certeiro × 9,3) — decidido.

**Traços** `[ideia]`: imune a paralisia e controle mental → nunca é
capturado na dungeon.

### Item único — Espada de Ébano do Vampiro

Primordial, espada de porte **médio** (no jogo, de uma mão), branca, escala
**For C · Des C**; dano de item único (×1,2): **944**. Requisito: Força 36 em
uma mão / 18 em duas, Destreza 18. Cai uma vez por pessoa, do chefe; rende
igual em qualquer das mãos.

### Imagens

Você vai mandar no update.

### Fichas

```yaml
- id: f_tes_ebony_warrior
  nome: "Ebony Warrior"            # decidido: o nome fica em inglês nas duas línguas
  obra: "The Elder Scrolls V: Skyrim — Dragonborn"
  vsb: "https://vsbattles.fandom.com/wiki/The_Ebony_Warrior"
  chave: "única"
  tier: "Low 2-C"
  estrelas: { forca: 3, vida: 2, resistencia: 2, destreza: 1, agilidade: 1, mana: 1 }
  magia: { nome: "Força Implacável", tipo: ataque }
  obtencao: chefe:b_tes_ebony_warrior   # contrato, uma vez por pessoa
  descricao:
    pt: "Fez tudo o que havia para fazer. Faltava perder para alguém que valesse a pena."
    en: "He did everything there was to do. All that was left was losing to someone worth it."
  imagem: "<a enviar>"
# calculado: dificuldade 9 · primordial (×9,3) · nível 81 · destaque 1,00 · 284,5 pontos/nível · combatente

- id: b_tes_ebony_warrior
  nome: "Ebony Warrior"
  tipo: chefe
  tier: "Low 2-C"
  nivel: 81
  poder: 2759525
  risco: 2294691
  recompensa: { contrato: f_tes_ebony_warrior, item: g_tes_espada_ebano_vampiro }   # uma vez por pessoa
  falas:
    inicio: { pt: "Chegou a hora.", en: "The time has come." }
    derrota: { pt: "Enfim... Sovngarde pode esperar mais um pouco.", en: "At last... Sovngarde can wait a little longer." }

- id: g_tes_espada_ebano_vampiro
  nome: "Espada de Ébano do Vampiro"
  slot: mao
  porte: medio
  tipo: branca
  raridade: primordial
  escala: { forca: C, destreza: C }
  especial: true                    # único: dano ×1,2
# calculado: dano 944 · Força 36 (uma mão) / 18 (duas) · Destreza 18
```

---

## 4. Rize Kamishiro — Tokyo Ghoul

**Pedido:** chefe **e** companheiro, ao estilo do Ebony Warrior — vence o
chefe e recebe o contrato, uma vez por pessoa.

### Fontes

| fonte | leitura |
|---|---|
| VS Battles — `Rize_Kamishiro` | ⚠️ pelo **seu PDF**: tier, chaves, estatísticas e fraquezas. A lista de **Powers and Abilities veio fechada** no PDF (só aparece "Ghoul Physiology: Rinkaku type") — o resto das habilidades veio das outras duas wikis |
| Tokyo Ghoul Wiki — `Rize_Kamishiro` | ✅ pelo **seu PDF**: história, personalidade, poderes (kagune rinkaku, regeneração, forma Dragão) |
| Villains Wiki — `Rize_Kamishiro` | ✅ pelo **seu PDF**: poderes (kagune, regeneração, força e velocidade) e crimes |

### O que as fontes dizem

- **Obra:** ghoul do clã Washuu, a "Glutona" (Binge Eater) que dominava
  distritos de Tóquio pelo medo. Morre no Incidente das Vigas de Aço; o
  kakuhou dela é transplantado em Ken Kaneki. Depois vira o hospedeiro do
  **Dragão**, que espalha a ghoulificação por Tóquio, até Kaneki matá-la.
- **Kagune rinkaku** com regeneração anormal até entre os rinkaku; até seis
  tentáculos (quatro, pela Villains Wiki) que derrubam vários oponentes de
  uma vez. Força "imensa mesmo para os ghouls mais fortes"; rápida e difícil
  de acertar. Classificação S.
- **VS Battles**, duas chaves:
  - **Rize Kamishiro:** **at least 8-B**, likely higher — City Block level+
    (superior aos ghouls comuns; até Jason e o Anteiku cediam território a
    ela); Hypersonic+ (mais rápida que Jason); Lifting Class M; durabilidade
    City Block level+; Stamina sobre-humana; alcance de dezenas de metros com
    a kagune. Fraqueza: as do tipo rinkaku.
  - **Dragão:** **at least 7-A**, likely far higher — Town level+, likely Large
    Town level+ (fere o Kaneki pós-Dragão); ataque a 20% da luz; Lifting Class
    G, up to Class T; tentáculos com durabilidade Mountain level+; alcance de
    quilômetros.

### Escalonamento

Pela regra do "tier mais baixo escrito" (plano §2):

| chave | tier | no jogo |
|---|---|---|
| **Rize Kamishiro** | at least 8-B | **dificuldade 3 Urbano, rara (×1,6), nível 27, destaque ×1,13** — o chefe e o companheiro |
| **Dragão** | at least 7-A | dificuldade 4 Nuclear, épica, nível 39, destaque ×1,17 — **ato II** do chefe (abaixo) |

O companheiro é a chave **Rize Kamishiro**: o Dragão é ela presa no núcleo de
uma massa de kagune, não alguém que se possa recrutar.

### Como chefe

Um chefe normal (`PLANO-RPG-CONTEUDO.md` §7): a mesma luta das missões,
**poder 21 897 · risco 16 002** — 35% de vitória e 60% de sobrevivência com 4
jogadores do nível 27, ~10% sozinho. Deixa o loot de chefe da faixa e, uma
vez por pessoa, o **Contrato da Rize**. Ficha no `CHEFES-RPG.md`.

### Como companheiro

Na mesma régua dos outros — orçamento do combatente raro × kit × destaque —,
com as estrelas decidindo como ela gasta. **Decidido (9 out): a Rize
"Glutona", de dano** — as estrelas ficam no formato do combatente, trocando a
Resistência pela Agilidade (a velocidade é dela; a dureza, não):

| atributo | ★ | por quê |
|---|---|---|
| Força | 3 | City Block level+, "força imensa mesmo para os ghouls mais fortes"; a kagune é arma do próprio corpo (dano físico → Força) |
| Vida | 2 | regeneração anormal até entre os rinkaku; Stamina sobre-humana |
| Agilidade | 1 | Hypersonic+, mais rápida que Jason; "evita ataques com facilidade" |
| Destreza | 1 | dezenas de metros de alcance com a kagune — e a precisão que faz o dano entrar |
| Res, Mana, Int, Sor, Car | 0 | o que a salva é a regeneração, não a dureza; um poder só (a kagune) |

Classe: **combatente**.
`ficha "8-B" "forca=3,vida=2,agilidade=1,destreza=1" 21,27,30 combatente`
— 55,5 pontos/nível.

| nível | For | Des | Res | Agi | Vida | Mana | Int | Sor | Car | soma | combatente raro | dano / sobrev. (ela) | (combatente genérico) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 21 | 523 | 58 | 0 | 58 | 526 | 0 | 0 | 0 | 1 | 1 166 | 1 029 | +13% / −1% | 0% / 0% |
| 27 | 672 | 75 | 0 | 75 | 677 | 0 | 0 | 0 | 1 | 1 500 | 1 323 | +14% / −1% | 0% / 0% |
| 30 | 747 | 83 | 0 | 83 | 752 | 0 | 0 | 0 | 1 | 1 666 | 1 470 | +14% / −1% | 0% / 0% |

**A Glutona:** **+14% de dano** que um combatente raro, com a mesma
sobrevivência. Testei outras: com Resistência no lugar da Agilidade dá o
mesmo; com as duas, +9% / +8%; sem Destreza, −4% (ela erra mais). A versão
anterior (Vida 3, Agilidade 3, Resistência 2…) dava −29% de dano e +24% de
sobrevivência.

**Magia própria:** **Seis Garras** — ataque, custo 2, poder 0,63 (Golpe
Certeiro × 1,6 × destaque): os tentáculos rinkaku de uma vez.

**Traços** `[ideia]`: regeneração rinkaku — a fraqueza dos rinkaku é a mesma
coisa ao contrário: forte e instável.

**Sinergia:** corpo a corpo, como o Ebony Warrior — não muda a sinergia de uma
party corpo a corpo.

### Item único — Kakuhou da Rize

O órgão de Rc dela, o mesmo que foi transplantado no Kaneki. **Bioware
ofensiva rubra** (plano §4.8): uma fonte de dano corpo a corpo sem ocupar mão,
que escala com a Força e ressoa com outras biowares rubras. Item único
(×1,2), uma vez por pessoa.

Cai no **ato II** (Dragão, nível 39): **épico**, dano **50 a 96** conforme a
Força, pede **Vida 20**.

### Ato II — Dragão (decidido, 9 out)

A segunda chave do perfil vira um ato, como os do Horus (plano §2, regra 2):
**at least 7-A → dificuldade 4, nível 39, poder 67 300 · risco 48 647**. Abre
para quem venceu a Rize. A Rize (ato I) entrega o **contrato**; o Dragão (ato
II) entrega o **Kakuhou da Rize**, épico.

### Imagens

Você vai mandar no update.

### Fichas

```yaml
- id: f_tg_rize
  nome: "Rize Kamishiro"
  obra: "Tokyo Ghoul"
  vsb: "https://vsbattles.fandom.com/wiki/Rize_Kamishiro"
  chave: "Rize Kamishiro"
  tier: "8-B"
  estrelas: { forca: 3, vida: 2, agilidade: 1, destreza: 1 }
  classe: combatente
  magia: { nome: "Seis Garras", tipo: ataque }
  obtencao: chefe:b_tg_rize          # contrato, uma vez por pessoa
  descricao:
    pt: "Lia os mesmos livros que você. Só queria saber qual era o seu gosto."
    en: "She read the same books you did. She only wanted to know how you'd taste."
  imagem: "<a enviar>"
# calculado: dificuldade 3 · rara (×1,6) · nível 27 · destaque 1,13 · 55,5 pontos/nível · combatente

- id: b_tg_rize
  nome: "Rize Kamishiro, a Glutona"
  tipo: chefe
  tier: "8-B"
  nivel: 27
  poder: 21897
  risco: 16002
  recompensa: { contrato: f_tg_rize }          # uma vez por pessoa
  falas:
    inicio: { pt: "Você parece delicioso.", en: "You look delicious." }
    derrota: { pt: "Que pena... eu estava com tanta fome.", en: "What a shame... I was so hungry." }

- id: b_tg_dragao               # ato II
  nome: "Dragão"
  tipo: chefe
  chave: "Dragon"
  tier: "7-A"                    # "at least"
  nivel: 39
  poder: 67300
  risco: 48647
  requer: b_tg_rize
  recompensa: { item: g_tg_kakuhou_rize }      # uma vez por pessoa

- id: g_tg_kakuhou_rize
  nome: "Kakuhou da Rize"
  slot: implante
  familia: bio
  papel: ofensivo
  cor: rubro
  raridade: epico
  especial: true                 # único: ×1,2
# calculado (épica): dano 50–96 conforme a Força · Vida 20
```

As falas são originais, no espírito da personagem — nada copiado do mangá.

---

## 5. Tryce — Bomb Rush Cyberfunk

**Pedido:** chefe **e** companheiro, como a Rize e o Ebony Warrior — vence o
chefe e recebe o contrato, uma vez por pessoa. **Não há página de
powerscaling** (nem no VS Battles nem em outra wiki), então o tier abaixo é
uma **avaliação minha** a partir da página da wiki do jogo.

### Fontes

| fonte | leitura |
|---|---|
| VS Battles | ❌ **não existe perfil** do Tryce, nem de outro personagem do jogo (procurei pelo Red e pelo Faux para escalonar por eles: nada) |
| Bomb Rush Cyberfunk Wiki — `Tryce` | ✅ pelo **seu PDF** (wiki.gg, edição de 2 jun 2026): ficha (crew, gênero, dublador), toda a história, roupas, curiosidades |

**O que a página não traz:** estatísticas, habilidades, idade, altura, nem
nada da jogabilidade dele (o campo "Movestyle" diz só "Default"). Os feitos
abaixo são todos de cena da história.

### O que a wiki diz

- **Quem é:** fundador e líder da **Bomb Rush Crew (BRC)**; começou a crew
  inspirado no Felix, com um objetivo só: ir **All City**. Personagem
  principal, dublado por Wola Badiru (YAPICO).
- **Fuga da delegacia:** sai da própria cela, **abre a fechadura** da cela do
  Faux, atravessa o prédio com ele, **dá ao Faux um boostpack reserva** e
  patins, tenta abrir a porta do telhado e **pula do telhado no canal** — e
  ainda **resgata o corpo** do Faux, decapitado no ar pelo DJ Cyber.
- **Rede de contatos:** consegue a cabeça cibernética do Red por um amigo (o
  Flesh Prince) e depois faz o Prince confessar só com **um olhar duro**.
- **Liderança:** conhece e cobra o **Código da Rua**; conduz as crew battles
  contra Franks, Eclipse, Devil Theory e FUTURISM; segura o Red quando ele
  quer ir sozinho ("somos uma crew"); avisa o grupo para não subestimar a
  FUTURISM; no fim, cobra da Rietveld imunidade para a crew e anuncia que a
  BRC é All City.
- **Combate:** quase nenhum feito próprio — quem luta é o Red. O único é em
  grupo: junto com Bel, Vinyl e DJ Cyber, **segura aberta a blindagem** em
  volta da cabeça do Faux (no tanque) para o Felix dar o golpe final. Diz que
  "teria vencido o Faux sozinho" — bravata, não feito. **Contra:** é
  **contido pelos membros da FUTURISM** junto com a Bel.

### Escalonamento (avaliação minha)

Sem perfil, usei o feito físico mais alto da página — segurar aberta, em
quatro, a blindagem de um tanque-robô — mais o pulo do telhado num canal sem
se ferir: acima de um atleta, mas nada que destrua um prédio. Isso é **9-C
(Street level)**, o primeiro degrau da faixa 2.

| tier | no jogo | |
|---|---|---|
| **9-C** | **dificuldade 2 Sobre-humano, incomum (×1,25), nível 11, destaque ×1,00** | **usado** — o chefe e o companheiro |
| 10-A (alternativa) | dificuldade 1 Humano, nível 10, destaque ×1,20 | se preferir contar só o que ele faz sozinho (o pulo e a fechadura) |

Na prática dá quase no mesmo (nível 10 ou 11). Com isso o Tryce vira o
**primeiro contrato com nome que um jogador novo alcança** — antes, o mais
baixo era o J'zargo, no 24.

### Como chefe

Um chefe normal (`PLANO-RPG-CONTEUDO.md` §7) no nível 11: **poder 4 508 ·
risco 3 214** — 35% de vitória e 60% de sobrevivência com 4 jogadores, 11%
sozinho. Deixa o loot de chefe da faixa e, uma vez por pessoa, o **Contrato do
Tryce** e o **Boostpack Reserva**. Ficha no `CHEFES-RPG.md`.

**A luta é uma crew battle**, pelo Código da Rua: ganha quem tiver mais REP,
ninguém morre. **Decidido (9 out): perigo baixo** (D26) — risco × 0,25 →
**804**; recompensa × 0,92. A vitória continua a mesma (35% com 4); a
sobrevivência sobe para **86% com 4 jogadores** (57% sozinho, 74% com 2, 81%
com 3).

### Como companheiro

Orçamento do suporte incomum × kit × destaque, com as estrelas decidindo
como ele gasta. É um **líder**, não um lutador, então a classe é **suporte**:

| atributo | ★ | por quê |
|---|---|---|
| Carisma | 3 | fundou e lidera a crew; cobra o Código da Rua; faz o Flesh Prince confessar com um olhar; segura o Red na crew |
| Agilidade | 2 | boostpack e patins; atravessa a delegacia e pula do telhado no canal |
| Destreza | 1 | abre a fechadura da cela do Faux; ensina os pontos de grafite ao Red |
| Sorte | 1 | "alguém está cuidando da gente" — o caos na delegacia abre a fuga, e ele sai inteiro do canal |
| For, Vida, Res, Mana, Int | 0 | nenhum feito de força própria (o único é em grupo); nada de magia |

Classe: **suporte**.
`ficha "9-C" "carisma=3,agilidade=2,destreza=1,sorte=1" 11,15,20 suporte`
— 82,6 pontos/nível.

| nível | For | Des | Res | Agi | Vida | Mana | Int | Sor | Car | soma | suporte incomum | dano / sobrev. (ele) | (suporte genérico) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 11 | 0 | 43 | 0 | 173 | 260 | 0 | 0 | 43 | 389 | 908 | 910 | −40% / +37% | −48% / +42% |
| 15 | 0 | 59 | 0 | 236 | 354 | 0 | 0 | 59 | 531 | 1 239 | 1 239 | −43% / +36% | −51% / +43% |
| 20 | 0 | 79 | 0 | 315 | 472 | 0 | 0 | 79 | 708 | 1 653 | 1 652 | −46% / +36% | −55% / +42% |

(Como nas outras tabelas, a comparação é com o combatente genérico; todo
suporte fica negativo no dano e positivo na sobrevivência.) Contra o
**suporte genérico**, o Tryce troca um pouco de sobrevivência (−5 pontos) por
dano (+8 pontos) — a Agilidade e a Destreza no lugar de parte da Sorte.
Testei outras: Sorte 2 no lugar da Agilidade 2 dá −40% / +41% (quase o
genérico); Vida 1 no lugar da Sorte, −40% / +33%; Destreza 2, −44% / +34%.

**Magia própria:** **Somos uma Crew** — suporte, custo 2, poder 0,38 (a magia
de suporte da classe × 1,25): a party age junto.

**Sinergia:** sem Força nem Inteligência ele não acrescenta fonte de dano, então
não mexe na sinergia — o papel dele é segurar a party de pé.

### Item único — Boostpack Reserva (decidido, 9 out)

O boostpack que ele deu ao Faux na fuga da delegacia. **Acessório incomum,
único** (×1,2): o acessório incomum rende 2,75 pontos (5 × 0,55); o único,
**3,3** → **Agilidade 2, Destreza 1** (dois terços em Agilidade, um em
Destreza). A Agilidade entra na sobrevivência (`somaEfetiva`); a Destreza, na
precisão. O genérico incomum dá Sorte 2 / Carisma 1 ou Vida 1 / Res 1 / Mana
1 — o Boostpack é o primeiro acessório de mobilidade. Cai uma vez por pessoa,
do chefe, junto com o contrato; negociável entre jogadores, como os outros
únicos.

### Imagens

Você vai mandar no update.

### Fichas

```yaml
- id: f_brc_tryce
  nome: "Tryce"
  obra: "Bomb Rush Cyberfunk"
  wiki: "https://bombrushcyberfunk.wiki.gg/wiki/Tryce"
  vsb: null                         # sem perfil; tier avaliado pela wiki do jogo
  tier: "9-C"                       # avaliação: segura a blindagem do tanque em grupo
  estrelas: { carisma: 3, agilidade: 2, destreza: 1, sorte: 1 }
  classe: suporte
  magia: { nome: "Somos uma Crew", tipo: suporte }
  obtencao: chefe:b_brc_tryce       # contrato, uma vez por pessoa
  descricao:
    pt: "Fundou a crew com uma meta só: All City. Ainda está decidindo se você cabe nela."
    en: "He founded the crew with one goal: All City. He's still deciding if you make the cut."
  imagem: "<a enviar>"
# calculado: dificuldade 2 · incomum (×1,25) · nível 11 · destaque 1,00 · 82,6 pontos/nível · suporte

- id: b_brc_tryce
  nome: "Tryce — Crew Battle da Bomb Rush Crew"
  tipo: chefe
  tier: "9-C"
  nivel: 11
  poder: 4508
  risco: 3214                       # 804 com o perigo baixo
  perigo: baixo                     # decidido (9 out): crew battle, ninguém morre
  recompensa: { contrato: f_brc_tryce, item: g_brc_boostpack_reserva }   # uma vez por pessoa
  falas:
    inicio: { pt: "Código da Rua: quem perder sai do bairro.", en: "Code of the Street: whoever loses leaves the block." }
    derrota: { pt: "Tá, tá... vocês têm REP. Bem-vindos à crew.", en: "Alright, alright... you've got REP. Welcome to the crew." }

- id: g_brc_boostpack_reserva
  nome: "Boostpack Reserva"
  slot: acessorio
  raridade: incomum
  bonus: { agilidade: 0.67, destreza: 0.33 }
  especial: true                    # único: ×1,2
# calculado (incomum): 3,3 pontos → Agilidade 2 · Destreza 1
```

As falas são originais, no espírito do personagem — nada copiado do jogo.

---

## Para os personagens 1-A que vêm por aí

1-A cai na **dificuldade 10, nível 98, destaque ×1,15**, raridade supremo
(×12,6), e sai como contrato de um chefe ou de uma missão especial, como os
outros. Como chefe no 98: poder **6 429 539**, risco **5 564 107**. Com o formato
da classe combatente, um 1-A rende **+22% de dano** na party do 98 — o
destaque do topo da faixa. Tier 0 fica no 100 (×1,20).

```sh
node scripts/balanceamento-rpg.mjs ficha "1-A" "<estrelas>" 98,100
node scripts/balanceamento-rpg.mjs chefe "1-A"
```
