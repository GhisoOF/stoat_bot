# Plano do RPG — rebalanceamento e conteúdo (v4.1: dificuldade 1–10, níveis 1–100)

Documento de planejamento. **Aplicado no jogo na branch `rpg-v4`** (9 out 2026) — veja `docs/rpg/README.md` para o que entrou e o que ficou pendente. Base:
`GhisoOF/stoat_bot`, commit `69d6aa1` (4 out 2026), conferido de novo contra o
`1156a1a` (5 out — folga de nível, pote da dungeon e moedas inteiras, §1.10),
fórmulas de `modulos/game/`, e as decisões das sessões de agosto (§0).

| arquivo | o quê |
|---|---|
| `PLANO-RPG-CONTEUDO.md` | este: regras, achados, escala, equipamento, curvas, economia, migração, decisões |
| `CATALOGO-GENERICO.md` | o conteúdo genérico das 10 dificuldades — o molde para o resto |
| `COMPANHEIROS-RPG.md` | personagens com nome que viram companheiros (Serana, J'zargo, Ebony Warrior, Rize Kamishiro, Tryce) |
| `CHEFES-RPG.md` | chefes com nome (Horus Lupercal em dois atos, Lorde Harkon, Ebony Warrior, Rize Kamishiro e o Dragão, Tryce) |
| `ESPECIAIS-E-HISTORIAS.md` | missões especiais (recompensa única) e o algoritmo de história |
| `ARMAS-WARHAMMER-40K.md` | 68 armas de Warhammer 40,000 no sistema de dano e escala |
| `IMPLANTES-E-EVOLUCIONADOR.md` | bioware e cyberware (regras, 80 exemplos genéricos) e o evolucionador automático |
| `ECONOMIA-E-DUNGEONS.md` | contrato (pago pelo banco) e dungeon (paga pelo tesouro dela, que se renova); dungeons temáticas |
| `balanceamento-rpg.mjs` | o script que gera todos os números (vai em `scripts/`) |
| `modulos/game/historia.js` | o algoritmo de história (os trechos em `modulos/game/conteudo/historias.json`) |

```sh
node scripts/balanceamento-rpg.mjs <modo>
# faixas · tiers · curva · tempo · escolha · missoes · chefes · itens · magias ·
# companheiros · economia · precisao · hoje · atalho · builds · sinergia ·
# implantes · evolucionador · maos · folga · fatias · calibrar-kit · economia2 · tudo
# ficha "<tier>" "<atributo=★,...>" [níveis] [classe] · chefe "<tier>"
```

**O que mudou da v2:**
- **10 níveis por faixa**, do 1 ao 100 (e sem teto depois).
- **Dificuldade da missão = 1 a 10**, a mesma escala das faixas; o
  fácil/médio/difícil saiu.
- **Recompensa pelo nível do jogador × dificuldade relativa** (D6 nova):
  com faixas longas, a regra antiga deixava a missão 5 níveis acima pagar 7×
  mais XP pelo mesmo risco.
- **XP vira progresso dentro do nível** (D11): o custo do nível 100 tem 20
  dígitos.
- **Ouro ×1,141 por nível** (D12), no ritmo dos preços.
- **Duas mãos** e armas branca, de fogo e mágica, de uma ou duas mãos (D14).
- **Conteúdo multigênero**: fantasia, contemporâneo e ficção científica.
- **Migração de nível** para quem já joga (D13).
- **Chefes em atos**, a partir das chaves do VS Battles (Horus).
- **Missões especiais** com recompensa única, e **algoritmo de história**
  contando cada missão por RNG (§6.6, §6.7).
- **Combate v4** (6 out): armas com **dano próprio e escala** por atributo,
  requisitos de Força em uma e em duas mãos e de Destreza/Inteligência, no
  esquema de Dark Souls 2; armadura dá **defesa**; ataque e defesa calculados
  por membro da party (§4).
- **Sinergia** (6 out): a party ganha dano por misturar corpo a corpo, à
  distância e mágico — num jogador só ou espalhado pelos companheiros (§4.5).
  **Sem teto desde 8 out.**
- **Chefe luta como missão** (revisão de 6 out): saíram o duelo pessoal, o
  chefe do mundo e o bônus de duelo; o Ebony Warrior sai como contrato, igual
  à Serana e ao J'zargo; o Horus ficou com dois atos.
- **8 out:** **bioware** (mutágenos do Witcher 3, do primitivo ao cósmico) e
  **cyberware** (Cyberpunk, Fallout, Star Wars), **3 vagas de cada** no
  jogador (§4.8); a party de referência passou a usá-los, então **todos os
  números de missão e chefe foram refeitos** (~+30% no poder, ~+20% no
  risco; as chances são as mesmas). **Evolucionador automático** com classe de
  jogador (§4.9). Pente fino contra o commit novo do repositório (§1.10).
- **8 out, fim da noite — todas as decisões fechadas:** falhar não paga nada
  (um êxito no seu nível passa a valer 80% de um nível, e o ritmo continua
  ~3,1 tentativas por nível); o kit dos companheiros foi recalibrado para que,
  na média, o jogador faça ~34% da party e cada companheiro ~33%; **D8**
  virou duas formas de jogar — **contrato** (pago pelo banco) e **dungeon**
  temática (paga pelo tesouro dela, que se renova sem fim), com Ouro e Cristal
  em toda vitória (`ECONOMIA-E-DUNGEONS.md`); D20 mantido.
- **8 out, noite — D6, D10, D19, D23 e o resto das decisões:** a missão paga
  a força dela, igual para todos (o custo do nível passa a acompanhar a
  força); magias pedem Inteligência em vez de nível; espera de chefe por
  pessoa; **companheiro não usa equipamento** — o kit da classe entra no
  ganho por nível (calibrado depois para 34% jogador / 33% / 33%).
  Serana, J'zargo e Ebony Warrior fechados.
- **8 out, decisões D25–D27:** implantes são **itens normais**, como
  armadura e acessório — compra, loot, mercado, equipar —, e ganharam o papel
  **atributo** (o "Implante Melhorador de Inteligência", o "CRISPR de Vitamina
  C"); a **folga é pela força total**, nunca pelo nível; o **escudo ficou mais
  forte** e **quem usa uma arma só ganha +80% no dano dela**. A party de
  referência (montante nas duas mãos) ganhou esse bônus, então o poder das
  missões e chefes subiu de novo (~+28%; o risco não mudou).

---

## 0. O que já está decidido

**Princípios**
- **O tempo por nível é constante** (~3,1 missões do próprio nível por
  nível, do 1 ao 100). Até 8 out isso era feito com a curva 1,5× (`100 ×
  1,5^(n−2)`) e a recompensa pelo nível de quem joga; com a D6 de 8 out (a
  missão paga a força dela, igual para todos), **o custo do nível passa a
  acompanhar a força daquele nível** — o mesmo efeito, sem depender do nível
  do jogador (§1.3).
- **Incentivo em vez de limite:** retorno decrescente (raiz, log), nunca teto
  duro. Única exceção: o `rMax < 1` da recompra do NPC.
- Multiplicadores e taxas ajustáveis.

**Atributos (ago/2026):** Inteligência e Sorte rendem menos no combate (dano
mágico ×0,70, Sorte ×0,60). Vida, Resistência e Agilidade se multiplicam —
espalhar rende mais que empilhar. Mana decide quantas magias cabem.

**Builds (ago/2026):** o build muda ~7% do tempo; equipamento e party valem
~2×. Os três problemas apontados lá estão resolvidos no §1.

**Desta série:** o jogo não fica preso ao medieval; **chefe luta como
missão**, sem sistema próprio; personagem com nome que vira companheiro sai
como **contrato, uma vez por pessoa** (Serana, J'zargo, Ebony Warrior, Rize, Tryce); a
**sinergia não tem teto**; a **classe do jogador é só um perfil** para o
evolucionador, sem bônus.

---

## 1. Achados (pente fino)

### 1.1 Sobreviver fica trivial com companheiros — `D1`

A resiliência é um produto (`3 · fVida · fResis · fAgil`) e cresce ~n³·⁶. Party
de referência de hoje:

| nível | missão | êxito (party) | sobrev. (party) | êxito (solo) | sobrev. (solo) |
|---|---|---|---|---|---|
| 2 | Limpar os Ratos do Porão | 69% | 87% | 60% | 85% |
| 3 | Espantar Goblins da Estrada | 57% | 84% | 47% | 75% |
| 4 | Colher Ervas na Mata Rasa | 40% | 71% | 31% | 58% |
| 6 | Caçar o Lobo Branco | 38% | 69% | 20% | 41% |
| 8 | Explorar a Cripta Submersa | 27% | 75% | 17% | 37% |
| 10 | Escoltar a Caravana de Sal | 36% | 87% | 22% | 38% |
| 14 | Descer ao Poço sem Fundo | 25% | 84% | 16% | 24% |
| 18 | Enfrentar o Guardião de Pedra | 30% | 91% | 13% | 23% |
| 22 | Invadir o Ninho da Serpente | 23% | 97% | 11% | 26% |

Proposta **(B) — soma efetiva:** `E = 36 · (∛(fVida · fResis · fAgil) − 1)`,
`resiliência = (3 + 0,6·E + 0,6·Sorte) × (1 + suporte)`. Espalhado igual, E é
a soma; empilhado, fica abaixo (6/6/6 → 18; 18/0/0 → 12,9). Mantém a
multiplicação de agosto e cresce como o poder.

### 1.2 Companheiros nunca sobem de nível — `D2` ✅

O nível gravado no recrutamento nunca muda. **Decidido (b):** sobem com o
dono, sem teto; a raridade separa pelo multiplicador.

### 1.3 Recompensa — `D6` ✅ (8 out: pela força da missão, igual para todos)

Hoje o XP é `xpBase × 1,5^(nível da missão − 1)`, sem trava. Dois problemas:

- **Atalho:** um personagem de nível 1 que cai numa missão alta, ou é
  carregado num co-op, pula dezenas de níveis.
- **Faixas longas:** dentro de uma faixa a dificuldade sobe devagar (o poder
  só salta na troca de raridade), mas o XP sobe 1,5× por nível. Uma missão
  5 níveis acima tem quase o mesmo risco e paga **7× mais**.

A v3 resolvia os dois pagando pelo nível de quem joga. **Você decidiu (8 out)
que não:** quem foi no co-op ou teve a sorte de cumprir uma missão difícil
deve receber o mesmo que os outros. Então a recompensa é **da missão**, e o
que se ajusta é o custo do nível:

```
XP da missão     = o poder dela (em "pontos de força"), igual para todos
Ouro da missão   = 60 × 1,141^(nível da missão − 1)   (D12)
custo do nível n = o poder de uma missão do nível n ÷ 0,80
falhar           = nada — falha é falha (8 out); cair ainda custa moeda e companheiros
```

No seu nível, **um êxito vale 80% de um nível** (D11). Missão duas vezes mais
forte paga 160%; metade, 40%. Com 40% de êxito, são ~3,1 tentativas por nível
e ~310 até o 100 (§1.9). O XP segue o **poder** da missão, não o nível dela —
por isso o problema das faixas longas some: dentro da faixa, 5 níveis acima
pagam só ×1,13. Jogador no 45 (com a folga pela força, D26):

| diferença | êxito | sobrev. | níveis por tentativa — regra de hoje | — D6 da v3 (pelo seu nível) | — **D6 de 8 out** | XP da missão | Ouro da missão |
|---|---|---|---|---|---|---|---|
| −10 | 91% | 96% | 0,01 | 0,15 | 0,29 | ×0,40 | ×0,27 |
| −5 | 83% | 92% | 0,05 | 0,16 | 0,31 | ×0,46 | ×0,52 |
| −3 | 44% | 73% | 0,07 | 0,21 | 0,33 | ×0,92 | ×0,67 |
| 0 | 40% | 70% | 0,21 | 0,21 | 0,32 | ×1,00 | ×1,00 |
| +3 | 38% | 68% | 0,70 | 0,22 | 0,33 | ×1,07 | ×1,49 |
| +5 | 37% | 67% | 1,54 | 0,23 | 0,34 | ×1,13 | ×1,93 |
| +6 | 26% | 53% | 1,80 | 0,26 | 0,39 | ×1,87 | ×2,21 |
| +10 | 23% | 49% | 8,37 | 0,26 | 0,41 | ×2,22 | ×3,74 |
| +16 | 16% | 35% | 71,33 | 0,25 | 0,45 | ×3,52 | ×8,25 |

_(As duas colunas antigas — regra de hoje e D6 da v3 — ainda contam o
consolo da falha, que saiu.)_

Missão acima rende mais por tentativa (até ~+40% uma faixa acima) — o prêmio
de arriscar, pago em quedas: perde moeda e, na dungeon, companheiros. Tem
limite natural: quanto mais forte a missão, menor a chance, e o ganho por
tentativa para de crescer. **O Ouro** segue o nível da missão (D12), então
dentro da faixa uma missão 5 níveis acima paga ~2× o Ouro com quase o mesmo
risco; é o único ponto em que subir alguns níveis compensa claramente.

E o atalho — que agora vale de propósito, para quem é carregado:

| caso | nível depois (hoje) | (D6 da v3) | **(D6 de 8 out)** |
|---|---|---|---|
| nível 1 cai sozinho numa missão 50 | 38 | 1 | 1 |
| nível 1 carregado num co-op que cumpre a missão 20 | 16 | 2 | **8** |
| nível 1 carregado num co-op que cumpre a missão 50 | 46 | 3 | **23** |
| nível 1 carregado num co-op que cumpre a missão 100 | 96 | 3 | **57** |

Quem é carregado sobe bem, mas menos que hoje: o custo dos níveis seguintes
cresce com a força deles. Um chefe paga ×7,5 de uma missão do mesmo nível
(~6 níveis por vitória), com 24 h de espera por pessoa (D19).

### 1.4 Co-op bem calibrado

4 jogadores têm ~9× o poder de 1; a escala do grupo (×2,98) devolve a ~3×.
Contra um chefe de 35% com 4: ~8% sozinho, 18%, 27%, 35% (§7.1).

### 1.5 Destreza, Carisma e Sorte quase não rendem em companheiros — `D7` ✅ (b)

Precisão = `0,70 + 0,30·d/(d+10)` sobre a Destreza **somada** da party (90%
com 20 pontos); Carisma de companheiro soma 0,3 fixo (o buff usa só o do
líder); Sorte soma 0,6 fixo. (a) aceitar como sabor; (b) precisão pela
**média** da party e Carisma de companheiro somando ao buff. **Com o combate
v4 (§4), a Destreza fica resolvida:** a precisão passa a ser de cada membro,
e a Destreza vira requisito e escala das armas de mira (do jogador — desde a
D23, companheiro não usa arma, e a Destreza dele vale só na precisão). Sobram
Carisma e Sorte: **decidido (b)**, o Carisma do companheiro soma ao buff.

### 1.6 O Cristal acaba numa missão — `D8` ✅ (8 out: contrato e dungeon)

**Em palavras simples:** o Cristal é a moeda que existe em quantidade fixa no
mundo — o banco tem, por exemplo, 5 000, e o que os jogadores ganham sai dali.
Hoje o prêmio em Cristal cresce com o nível da missão (como o Ouro), e a
partir do nível ~30 **uma única missão já pede mais Cristal do que o banco
inteiro tem** — o primeiro que cumprir leva tudo e os outros ficam sem.

**Decidido (8 out), maior que a proposta:** passam a existir **duas formas de
jogar**. O **contrato** (missão da guilda) paga do **banco**; a **dungeon**
(mundo aberto, temática) paga do **tesouro dela**, que se renova sem fim — é
a única fonte de moeda nova, no ritmo de quem joga. Toda vitória paga Ouro
**e** Cristal (1/4 do valor em Cristal — muito mais que hoje), na proporção do
que quem paga tem guardado: cheio paga mais, vazio paga menos, e nunca zera.
O NPC consome metade do que se gasta nele (o ralo). Tudo no
`ECONOMIA-E-DUNGEONS.md`.

### 1.7 O Ouro ×1,35 por nível estoura — `D12` ✅

Com 100 níveis, a missão do nível 100 pagaria ~5 × 10¹⁴ Ouro, e o saldo
acumulado passa do inteiro seguro do JavaScript. Os preços sobem ×3,75 por
raridade, ou seja ×1,141 por nível. **Decidido: o Ouro sobe ×1,141 por
nível da missão** (com a D6 de 8 out, é o nível da missão que conta, não o
de quem joga) — uma missão paga ~13 armas pesadas da própria faixa em
qualquer ponto do jogo (§8).

### 1.8 O XP do nível 100 não cabe num inteiro — `D11` ✅

O custo do nível passa do inteiro seguro do JavaScript no **82** e do inteiro
do SQLite no **99**; o XP de uma missão passa no 83. Não trava o jogo, mas
arredonda e mostra números de 20 dígitos. **Decidido: guardar o progresso
dentro do nível (0 a 1)**; um êxito no próprio nível vale sempre **80% de
um nível** (sem consolo para a falha, desde 8 out) e a tela mostra "+80% de
nível". Com a D6 de 8 out, o XP de uma missão é o poder dela (no máximo
alguns milhões, longe do limite), e o que sobra ao subir converte pelo custo
do nível seguinte.

### 1.9 O nível 100 é alcançável

~**3,1 missões do próprio nível por nível**, em qualquer nível (o custo do
nível acompanha a força, D6). **~310 missões até o 100**: a 10 por dia, um mês; a 5 por
dia, dois. A energia dos companheiros (1 por hora) é o limite de ritmo.

### 1.10 O que o commit `1156a1a` (5 out) muda neste plano — `D26` ✅

O repositório andou depois do `69d6aa1`. Três mudanças tocam o RPG:

- **Folga de nível:** cada nível que você tem acima da missão fecha 1/6 do
  que falta para 100% (êxito e sobrevivência); com 6 níveis de folga, é
  garantida. Com 10 níveis por faixa, descer 3–4 níveis rendia 37–47% mais
  nível por tentativa que jogar no próprio nível.

  **Decidido (D26, 8 out): a folga é pela força total, nunca pelo nível.**
  Toda missão é feita para uma força — o poder e o risco dela dão a
  chance-base (40% de êxito / 70% de sobrevivência; especial 30/60; chefe
  35/60) para quem tem exatamente essa força. Com `q` = **a sua força ÷ a força
  para a qual a missão foi feita** (os mesmos números que o `resolver` compara,
  já com a escala do co-op):

  ```
  q ≤ 1   → nada muda
  q > 1   → fecha (q − 1) ÷ 2 do que falta para 100%
  q ≥ 3   → garantido
  ```

  Êxito (poder) e sobrevivência (resiliência), cada um o seu. Jogador no 45
  descendo de nível — nenhuma missão abaixo rende mais que a do próprio nível,
  então a D6 continua segurando o ritmo:

  | missão | r | êxito / sobrev. sem folga | níveis por tentativa | com a folga pela força | níveis por tentativa |
  |---|---|---|---|---|---|
  | nível 45 (dif. 5) | 1,00 | 40% / 70% | 0,214 | 40% / 70% | 0,214 |
  | nível 42 (dif. 5) | 0,94 | 41% / 71% | 0,206 | 43% / 72% | 0,212 |
  | nível 40 (dif. 4) | 0,45 | 60% / 83% | 0,127 | 84% / 93% | 0,160 |
  | nível 35 (dif. 4) | 0,41 | 62% / 85% | 0,117 | 90% / 95% | 0,151 |
  | nível 30 (dif. 3) | 0,18 | 79% / 92% | 0,062 | 100% / 100% | 0,073 |
  | nível 15 (dif. 2) | 0,06 | 92% / 97% | 0,021 | 100% / 100% | 0,022 |

  "Recolher planta" — uma missão de nível 1 — para a party de referência de
  cada nível:

  | party no nível | êxito / sobrev. sem folga | com a folga pela força |
  |---|---|---|
  | 1 | 40% / 70% | 41% / 70% |
  | 3 | 72% / 76% | 100% / 80% |
  | 5 | 80% / 83% | 100% / 91% |
  | 7 | 83% / 85% | 100% / 96% |
  | 10 | 86% / 87% | **100% / 100%** |

  **Perigo da missão** (proposta, junto da D26): a folga resolve quem está
  muito acima, mas uma missão de colher ervas no próprio nível ainda mataria
  30% das vezes. Cada missão ganha um campo `perigo`: **baixo** (risco × 0,25 —
  colher, entregar, investigar; recompensa × 0,92, que é o que compensa não
  cair), **normal**, ou **alto** (risco × 1,5; recompensa × 1,03). O "Colher
  Ervas na Mata Rasa" (nível 7) com perigo baixo fica com 100% de sobrevivência
  já no nível 7; com perigo normal, um jogador de nível 10 ainda teria 77%.
- **Pote da dungeon:** o Ouro perdido nas quedas vai para um pote; quem vence
  leva 25% (fácil), 60% (médio) ou tudo (difícil). **Substituído (D8, 8 out):**
  quem cai numa dungeon deixa a moeda no tesouro dela, e ela volta pelos
  pagamentos normais (`ECONOMIA-E-DUNGEONS.md` §4).
- **Moedas inteiras:** saldos, prêmios e preços sempre inteiros. Já combina
  com D8 (o Cristal proposto arredonda e nunca paga menos de 1) e com D12.

O `resolver` ganhou o parâmetro `nivel` (para a folga); com a D26 ele deixa
de ser usado — a folga sai do poder e do risco que o `resolver` já tem. O
algoritmo de história (§6.7) continua só precisando que ele devolva as
rolagens. **A recompensa (D6) continua pelo nível:** se fosse pela força,
quem melhora o equipamento passaria a ganhar menos pela mesma missão.

---

## 2. A escala: 10 dificuldades × 10 níveis

Uma faixa por tier principal do VS Battles (o 1 e o 0 juntos). A
**dificuldade** é o número da faixa — vale para missões, itens, companheiros,
magias e chefes.

| dificuldade | nome | tiers VSB | níveis | raridade | companheiro | item (orç.) | preço (arma pesada) | magia ataque (custo/poder) |
|---|---|---|---|---|---|---|---|---|
| 1 | Humano | 10-C – 10-A | 1–10 | comum | ×1 | 2 | 15 | 1 / 0,15 |
| 2 | Sobre-humano | 9-C – 9-A | 11–20 | incomum | ×1,25 | 5 | 55 | 2 / 0,28 |
| 3 | Urbano | 8-C – 8-A | 21–30 | raro | ×1,6 | 9 | 200 | 3 / 0,42 |
| 4 | Nuclear | Low 7-C – High 7-A | 31–40 | épico | ×2,1 | 15 | 760 | 5 / 0,62 |
| 5 | Tectônico | 6-C – High 6-A | 41–50 | lendário | ×2,8 | 25 | 2 850 | 8 / 0,85 |
| 6 | Planetário | 5-C – High 5-A | 51–60 | **mítico** | ×3,8 | 40 | 10 700 | 12 / 1,10 |
| 7 | Estelar | Low 4-C – 4-A | 61–70 | **celestial** | ×5,1 | 64 | 40 000 | 17 / 1,38 |
| 8 | Cósmico | 3-C – High 3-A | 71–80 | **divino** | ×6,9 | 102 | 150 000 | 23 / 1,68 |
| 9 | Multiversal | Low 2-C – 2-A | 81–90 | **primordial** | ×9,3 | 164 | 563 000 | 30 / 2,00 |
| 10 | Hiperversal | Low 1-C – 0 | 91–100+ | **supremo** | ×12,6 | 262 | 2 110 000 | 38 / 2,35 |

As cinco primeiras raridades são as de hoje. As novas continuam as
sequências: companheiro ×1,35, item ×1,6, preço ×3,75 (= 1,141¹⁰).

**Dentro da faixa:** a posição do sub-tier dá o nível (`início + 9 ×
posição`) e o **destaque** `1 + 0,2 × posição`. Exemplos: 8-B → 27; 6-A → 49;
Low 2-C → 81; High 1-B → 96; 1-A → 98; 0 → 100. Tabela no Apêndice A.

**Acima do 100:** a dificuldade 10 não tem fim; missões e chefes seguem a
party simulada, que continua crescendo pelo nível.

**Lendo um perfil do VS Battles:**
1. **Companheiro:** uma chave por entrada (a do arco em que é recrutado).
2. **Chefe:** várias chaves viram **atos** — o mesmo inimigo em vários pontos
   dos 100 níveis (`CHEFES-RPG.md`).
3. "At least", "likely", "possibly", "higher" → o tier **mais baixo** escrito.
4. **"Up to X com <poder>"** (o teto) vale só para o **ato final** de um chefe.
5. "Unknown"/"Varies" → o tier de quem ele empata ou perde no próprio verso;
   sem perfil → escalar por quem é próximo na obra.
6. Tier 11 fica de fora.

**Como se obtém:**

| dificuldades | genéricos | com nome |
|---|---|---|
| 1–3 | mercenário (120 / 400 / 1 400 Ouro) ou missão | missão especial ou mercenário |
| 4–10 | missão (épico e lendário só em dungeon) ou chefe | chefe ou missão especial |

Com nome, sempre como **contrato**, uma vez por pessoa (§6.6).

---

## 3. Personagens e companheiros

### 3.1 Genéricos

`ganho da classe × nível × raridade × kit` (combatente 3 For / 2 Vida / 1 Des
/ 1 Res; tank 3 Res / 3 Vida / 1 Agi; mago 3 Int / 2 Mana / 1 Des; suporte 2
Sor / 2 Car / 1 Mana / 1 Vida), piso de Vida `2 × nível × raridade × kit`,
Carisma ≥ 1, magia da classe × raridade.

60 no catálogo: 20 de hoje e 40 novos — oito por dificuldade de 1 a 5 (os
de hoje mais quatro fora do medieval), quatro de 6 a 10.

**Companheiro não usa equipamento (D23 ✅, 8 out):** ele já é um kit completo.
O que o equipamento daria entra no ganho por nível — o **kit da classe** —,
calibrado para que, **na média das composições**, o jogador faça **~34%** da
party e cada companheiro **~33%** (pedido de 8 out: ajustar os parâmetros, sem
forçar nenhum cenário). `node scripts/balanceamento-rpg.mjs calibrar-kit`:

| classe | kit (× ganho por nível) | por quê |
|---|---|---|
| combatente | **×4,37** | Força entra inteira no ataque; Vida e Resistência dão defesa |
| tank | **×7,77** | quase só defesa |
| mago | **×11,32** | o ataque dele é 0,7 × Inteligência, e a defesa é pouca |
| suporte | **×9,44** | rende por Sorte e Carisma, que entram fracos nas contas |

A fatia de cada membro é metade do ataque que ele põe na party (o ataque dele mais
0,3 × Carisma) e metade da defesa (a defesa dele mais 0,6 × Sorte); as magias
multiplicam a party inteira e ficam fora da conta. Jogador da party de
referência + dois companheiros (jogador / companheiro 1 / companheiro 2):

| dupla | 15 | 45 | 75 | 95 |
|---|---|---|---|---|
| combatente + combatente | 34 / 33 / 33 | 33 / 34 / 34 | 36 / 32 / 32 | 40 / 30 / 30 |
| combatente + tank | 28 / 35 / 37 | 22 / 37 / 41 | 21 / 36 / 43 | 21 / 36 / 43 |
| combatente + mago | 34 / 31 / 36 | 35 / 32 / 33 | 40 / 30 / 31 | 44 / 27 / 29 |
| combatente + suporte | 30 / 34 / 36 | 27 / 36 / 37 | 28 / 36 / 36 | 31 / 35 / 35 |
| tank + tank | 55 / 23 / 23 | 53 / 23 / 23 | 53 / 24 / 24 | 53 / 24 / 24 |
| tank + mago | 22 / 38 / 40 | 17 / 43 / 40 | 15 / 44 / 40 | 16 / 44 / 40 |
| tank + suporte | 38 / 31 / 31 | 36 / 35 / 29 | 37 / 37 / 26 | 39 / 38 / 24 |
| mago + mago | 36 / 32 / 32 | 42 / 29 / 29 | 48 / 26 / 26 | 51 / 24 / 24 |
| mago + suporte | 27 / 38 / 36 | 25 / 38 / 38 | 26 / 37 / 37 | 28 / 37 / 35 |
| suporte + suporte | 34 / 33 / 33 | 32 / 34 / 34 | 34 / 33 / 33 | 37 / 31 / 31 |

**Média: jogador 34% · combatente 33% · tank 33% · mago 33% · suporte 33%.**
Cada composição tem o seu jeito (dois tanks deixam o ataque com o jogador;
tank + mago o deixam com 17%), mas na média fica o que você pediu. Na party
de referência (combatente + tank), o jogador pesa ~22–28%.

### 3.2 Com nome

```
orçamento por nível = genérico da classe × raridade × kit da classe × destaque
   (contando o piso de Vida: mago 8, combatente/tank/suporte 7)
piso de Vida        = 2 × raridade × kit por nível, separado antes
resto               = orçamento − piso, dividido pelos pesos
peso do atributo    = estrelas²
magia própria       = magia da classe × raridade × destaque
```

- **Estrelas²:** um personagem desenhado com o formato da classe (3, 2, 1,
  1) rende exatamente igual ao genérico; com peso linear, quem é bom em
  várias coisas perdia até 40% de dano.
- **Classe** = grupo com mais estrelas; a ficha pode fixar. Decide o tipo da
  magia.

### 3.3 Estrelas — do perfil do VS Battles

| atributo | de onde vem |
|---|---|
| Força | Striking/Lifting Strength; Attack Potency quando o dano é físico (lâmina, punho ou bala) |
| Inteligência | Attack Potency quando o dano é energia, magia ou poder psíquico |
| Destreza | Range + perícia (armas, artes marciais, pontaria) |
| Agilidade | Speed — 3★ acima do esperado para o tier, 2★ compatível, 1★ abaixo |
| Resistência | Durability |
| Vida | Stamina + Regeneration |
| Mana | quantas Powers and Abilities ele usa em combate |
| Sorte | Luck/Probability Manipulation, Precognition |
| Carisma | liderança, invocações, suporte a aliados |

### 3.4 Ficha

```yaml
- id: f_<obra>_<nome>
  nome: ""
  obra: ""
  vsb: "<link>"
  chave: "Base"
  tier: "8-B"
  estrelas: { forca: 3, destreza: 3, agilidade: 2, resistencia: 1, vida: 1 }
  classe: combatente          # opcional
  magia: { nome: "", tipo: ataque }
  obtencao: mercenario        # mercenario | especial:<id> | dungeon | chefe:<id>
  unico: false
  descricao: { pt: "", en: "" }
  imagem: "<url>"             # fora do repo público
```

---

## 4. Equipamento e combate — dano, escala e defesa (`D14`, `D20`)

Inspirado em Dark Souls (o 2 para requisitos e mãos). A arma tem dano
próprio e cresce com os atributos; a armadura tem defesa própria; os
atributos continuam valendo por conta própria.

### 4.1 Vagas e mãos

**Cabeça, corpo, mão principal, mão secundária e três acessórios** (hoje: arma,
capacete, armadura e três acessórios). Só o jogador — companheiro não usa
equipamento (D23). O
**jogador** tem ainda **3 vagas de bioware e 3 de cyberware** (§4.8).

- **Toda arma vai em uma mão ou nas duas.** Não existe "arma de duas mãos"
  fixa: um montante pode ir numa mão só, se houver Força para isso.
- **Requisito de Força em uma mão e em duas mãos**; o de duas mãos é a
  **metade** (no Dark Souls 2, segurar com as duas mãos dobra a Força
  efetiva para o requisito).
- **Segurar com as duas mãos** faz a Força contar **×1,5 na escala** (como no
  Dark Souls 1/3 e no Elden Ring — no DS2 o ganho é só no requisito).
- **Arma única (D27, 8 out):** quem usa **uma arma só** — numa mão com a
  outra livre, nas duas mãos, ou numa mão com escudo (**escudo não conta como
  arma**) — ganha **+80% no dano dela**. É o que faz uma arma pesada valer
  tanto quanto duas.
- **As duas mãos são igualmente eficazes:** uma arma na mão secundária rende
  o mesmo que na principal. **Não existe power stance** — nem o requisito
  ×1,5 que o DS2 cobra para usar duas armas juntas; basta cumprir o requisito
  de uma mão de cada uma.
- Na mão secundária também cabe **escudo** ou **foco** (arma mágica leve — o
  foco é arma, então tira o bônus de arma única). **Escudo mais forte (D27):**
  defesa **8 × orçamento** (antes 4 — agora perto da armadura) e **+10% na
  defesa** de quem o usa.
- **Qualquer combinação vale**, inclusive arma pesada numa mão com outra arma
  na outra (decidido). Party inteira no nível 45, contra o montante nas duas
  mãos:

| como segura | 15 | 45 | 75 | 95 |
|---|---|---|---|---|
| montante nas duas mãos (referência) | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% |
| montante numa mão, a outra livre | −3% / 0% | −2% / 0% | −2% / 0% | −2% / 0% |
| montante numa mão + escudo | −3% / **+7%** | −2% / **+5%** | −2% / **+5%** | −2% / **+5%** |
| espada numa mão + escudo | −12% / +7% | −10% / +5% | −11% / +5% | −11% / +5% |
| duas pesadas, uma em cada mão | −1% / 0% | −1% / 0% | 0% / 0% | 0% / 0% |
| martelo + espada | −6% / 0% | −5% / 0% | −5% / 0% | −5% / 0% |

_(poder / resiliência da party)_

Antes da D27, duas pesadas rendiam +25% sobre o montante nas duas mãos e o
escudo nunca valia a pena. Agora: **uma arma pesada (nas duas mãos) = duas
pesadas**; **arma + escudo** troca ~2% de poder por ~5% de resiliência — a
escolha de quem quer sobreviver. O que ficou para trás são **duas armas
leves ou médias** (−5% a −12% na party), que só compensam quando misturam
tipos e ganham sinergia — aceito como está (D28). (Os percentuais são da
party de referência inteira — combatente + tank —, em que o jogador pesa
~25%; para o jogador sozinho, a diferença é ~4× maior.)

### 4.2 Dano da arma

```
ataque da arma = dano base × (1 + Σ letra × curva(atributo))
dano base      = 8 × orçamento(raridade) × porte × traço
curva(x)       = x ÷ (x + 2 × requisito)      ← retorno decrescente, sem teto
letras         E 0,15 · D 0,35 · C 0,6 · B 0,9 · A 1,25 · S 1,6
```

| porte | dano base | requisito de Força (1 mão / 2 mãos) | exemplos |
|---|---|---|---|
| leve | 0,5 | 2 × dif. / 1 × dif. | adaga, pistola, varinha, garra |
| médio | 0,6 | 4 × dif. / 2 × dif. | espada, escopeta, maça de energia |
| pesado | 1,0 | 7 × dif. / 3,5 × dif. | montante, martelo, rifle, cajado |
| colossal | 1,15 | 12 × dif. / 6 × dif. | eviscerador, canhão, lascannon |

**Escala, pela regra que você deu:**
- **Bater** (maças, martelos, punhos, machados): **Força** (B a S).
- **Mirar** (armas de fogo, arcos): **Destreza** (B a S), Força E.
- **Místico** (cajados, armas psíquicas): **Inteligência** (B a S).
- **Híbridas:** espada = Força + Destreza (C/C); arma de força = Força D +
  Int S; garra com cano = Força + Destreza; lança-chamas pesado = Força
  (não precisa mirar).

**Requisitos de Destreza e Inteligência** vêm do tipo: armas de mira pedem
Destreza (3–6 × dif.); místicas pedem Inteligência (3–4 × dif.). Armas de fogo
leves pedem pouca Força (metade do porte). **Abaixo de qualquer requisito, a
arma rende 40%** — o "X vermelho" do Dark Souls.

**Traço** (×0,6 a ×1,3) é o ajuste da lore: arma de energia que ignora
armadura vale um pouco mais; pistola de teia, bem menos.

### 4.3 Ataque e defesa por membro

Cada membro da party (jogador e companheiros) calcula o próprio ataque e a
própria defesa, e a party soma. Antes somava os atributos de todos e
calculava uma vez.

```
ataque do membro = Σ_tipo parte_tipo × (1 + reforço_tipo + reforço_todos)
                   × precisão(Destreza do membro) × (1 + nível/100)
   partes        = armas, Força (corpo a corpo), 0,7 × Inteligência (mágico)
                   e implantes ofensivos, cada um no seu tipo (§4.5)
defesa do membro = (Σ defesa de cabeça, corpo, escudo e implantes + 0,6 × soma efetiva)
                   × (1 + nível/100) × (1 + reforço de defesa)
poder da party   = (Σ ataque dos membros + 0,3 × Carisma) × (1 + magias de ataque)
resil. da party  = (3 + Σ defesa dos membros + 0,6 × Sorte) × (1 + magias de suporte)
defesa do item   = 8 × orçamento × peso   (corpo 0,85 · cabeça 0,7 · escudo 1,0)
arma única       = a parte da arma × 1,8 quando é a única arma do membro (escudo não conta)
escudo           = + 10% no reforço de defesa do membro
```

Sem implantes, os reforços são zero e a soma das partes é o mesmo
`Σ armas + Força + 0,7 × Int` de antes. Assim entram, como você pediu,
**dano, Força, Destreza, Inteligência e nível** no ataque, e **defesa, os atributos (soma efetiva de Vida,
Resistência e Agilidade) e nível** na defesa. **Armadura e arma não dão mais
atributo** — dão dano e defesa. Os **acessórios** continuam dando atributo.

Companheiros não usam equipamento (D23): o ataque deles é Força + 0,7 × Int,
e a defesa, a soma efetiva — com o kit da classe no ganho por nível (§3.1).

### 4.4 Builds — o que o balanceamento mostra

Só o jogador muda (atributos, arma e as biowares da cor do atributo
principal; os cyberwares são os da referência); companheiros iguais. Poder do
jogador sozinho e a diferença na party inteira:

| build | 15: jogador · party | 45: jogador · party | 75: jogador · party | 95: jogador · party |
|---|---|---|---|---|
| Força + montante (2 mãos) | 219 · +1% | 1 543 · +1% | 7 745 · +1% | 22 474 · 0% |
| Força + martelo (2 mãos) | 220 · +1% | 1 561 · +1% | 7 865 · +1% | 22 853 · +1% |
| Destreza + rifle (2 mãos) | 215 · 0% | 1 520 · 0% | 7 789 · +1% | 22 814 · +1% |
| Inteligência + cajado (2 mãos) | 202 · −2% | 1 452 · −1% | 7 370 · −1% | 21 502 · −1% |
| For/Des + espada e pistola | 149 · −12% | 1 034 · −10% | 5 089 · −10% | 14 605 · −11% |
| Força + duas espadas | 161 · −10% | 1 121 · −9% | 5 501 · −9% | 15 805 · −9% |
| Inteligência + rifle (fora da build) | 176 · −7% | 1 200 · −7% | 5 832 · −7% | 16 591 · −8% |

Força, Destreza e Inteligência com a arma certa ficam a ±2% uma da outra na
party (o jogador sozinho: ±5%). Arma fora da build rende ~7% a menos na party
(~25% no jogador). Abaixo do requisito, 60% a menos naquela arma. Duas armas
médias/leves ficaram ~10% atrás de uma pesada (sem contar a sinergia — D28).
O peso de cada parte do **poder** na party de referência:

| nível | arma do jogador | atributos do jogador | implantes do jogador | companheiros |
|---|---|---|---|---|
| 15 | 14% | 5% | 11% | 71% |
| 45 | 11% | 3% | 10% | 76% |
| 75 | 11% | 1% | 11% | 77% |
| 95 | 11% | 1% | 11% | 77% |

Na party de referência (combatente + tank), o combatente faz quase todo o
ataque e o tank quase toda a defesa; na média das composições, o jogador fica
com ~34% (§3.1).

### 4.5 Sinergia — corpo a corpo, à distância e mágico (`D22`)

A party ganha bônus de dano por misturar os três tipos — seja um jogador que
cobre os três sozinho, seja cada um focado num tipo e os companheiros
cobrindo os outros.

- **O tipo vem de onde o dano vem.** A base da arma vai para o tipo dela
  (branca → corpo a corpo; de fogo → à distância; mágica → mágico); cada parte
  da escala vai para o tipo do atributo: **Força → corpo a corpo**,
  **Inteligência → mágico**, **Destreza → à distância numa arma de fogo** (e
  corpo a corpo numa branca). Nos atributos: Força → corpo a corpo, 0,7 × Int
  → mágico. Assim as **híbridas cobrem dois tipos sozinhas**: a Arma de Força
  (Força D, Int S) é metade corpo a corpo, metade mágica.
- **Companheiros:** o tipo vem da classe (combatente → corpo a corpo, mago →
  mágico); eles não usam arma (D23).
- **Implantes ofensivos** (§4.8) são fontes de dano do tipo deles; os de
  reforço multiplicam a parte do tipo deles.
- **Magias do grimório** multiplicam tudo e não contam como tipo — senão toda
  party teria "mágico" de graça.

```
partes      = fração do dano da party em cada tipo (somam 1)
diversidade = (1 − Σ parte²) ÷ (2/3)       ← 0 com um tipo só, 1 com os três iguais
fontes      = pares (membro, tipo) em que o tipo dá ≥ 10% do dano daquele membro
bônus       = 25% × diversidade² × (1 + ln(fontes ÷ 3))      ← o ln só entra acima de 3 fontes
```

**Sem teto (8 out).** A diversidade sozinha satura — os três tipos iguais são
o máximo dela —, então o que continua crescendo são as **fontes**: mais gente
e mais coisas causando dano de tipos diferentes. Até 3 fontes é o de antes
(dois tipos meio a meio, +14%; os três iguais, +25%); acima, sobe com retorno
decrescente e sem limite. Nível 45 (as linhas 2 a 6 sem implantes, para
comparar com a versão anterior):

| composição | corpo a corpo / à distância / mágico | diversidade | fontes | bônus |
|---|---|---|---|---|
| montante + combatente + tank (referência) | 100% / 0% / 0% | 0,01 | 2 | +0% |
| rifle + combatente + tank | 76% / 23% / 1% | 0,55 | 2 | +8% |
| montante + combatente + mago | 42% / 0% / 58% | 0,73 | 3 | +13% |
| rifle + combatente + mago (cada um focado) | 32% / 10% / 58% | 0,83 | 3 | +17% |
| espada + varinha, sozinho | 56% / 0% / 44% | 0,74 | 2 | +14% |
| arma de força + pistola, sozinho (os 3 tipos) | 39% / 30% / 31% | 0,99 | 3 | +25% |
| montante + implantes de outros tipos + combatente + tank | 94% / 3% / 3% | 0,17 | 2 | +1% |
| arma de força + pistola + implantes mistos + combatente + mago | 36% / 4% / 61% | 0,75 | 5 | +22% |
| co-op de 2: um de montante, um de rifle, cada um com combatente + mago | 39% / 6% / 55% | 0,82 | 7 | +31% |
| co-op de 4, todos com arma de força + pistola + implantes mistos, combatente + mago | 36% / 4% / 61% | 0,75 | 20 | **+41%** |

**As missões continuam calibradas sem o bônus** — a party de referência é
toda corpo a corpo. A sinergia é vantagem por cima, nunca punição: com +25%
de poder, a chance de uma missão do próprio nível vai de 40% para ~45%; com
+41%, para ~48%. Com o kit (D23), os companheiros pesam muito: a mistura que
mais rende é escolher **companheiros de tipos diferentes** (combatente +
mago), não só implantes.

### 4.6 Tabela por raridade

| raridade | dano (médio / pesado) | Força 1 mão do pesado | defesa (corpo / cabeça / escudo) |
|---|---|---|---|
| comum | 10 / 16 | 7 | 14 / 11 / 16 |
| incomum | 24 / 40 | 14 | 34 / 28 / 40 |
| raro | 43 / 72 | 21 | 61 / 50 / 72 |
| épico | 72 / 120 | 28 | 102 / 84 / 120 |
| lendário | 120 / 200 | 35 | 170 / 140 / 200 |
| mítico | 192 / 320 | 42 | 272 / 224 / 320 |
| celestial | 307 / 512 | 49 | 435 / 358 / 512 |
| divino | 490 / 816 | 56 | 694 / 571 / 816 |
| primordial | 787 / 1 312 | 63 | 1 115 / 918 / 1 312 |
| supremo | 1 258 / 2 096 | 70 | 1 782 / 1 467 / 2 096 |

Preço: o de hoje por raridade (×3,75 depois do lendário) × (0,85 + 0,15 × peso).
O escudo dá ainda +10% na defesa de quem o usa (D27); o dano é antes do bônus
de arma única.

### 4.7 As armas e armaduras de hoje

As 11 armas atuais ganham porte pelo tamanho (adaga leve; espadas e cajados
pesados) e passam a dar **dano e escala**; capacetes e armaduras passam a dar
**defesa**. O bônus de atributo que elas davam sai (o catálogo mostra o de
hoje ao lado). Os acessórios ficam como estão. Catálogo: 94 itens novos.

### 4.8 Bioware e cyberware (`D23`)

**3 vagas de cada, só no jogador.** **São itens normais (D25)**, como armadura
e acessório: caem no loot, estão na loja da raridade, vão para o mercado entre
jogadores e se equipam com `&game equipar`. Regras completas, tabela por
raridade e 80 exemplos genéricos (oito por dificuldade, do primitivo ao
cósmico) no `IMPLANTES-E-EVOLUCIONADOR.md`. O resumo:

| | 🦾 cyberware | 🧬 bioware |
|---|---|---|
| inspiração | Cyberpunk, Fallout, Star Wars | mutágenos do Witcher 3; enxertos, sangue de criatura, gene-seed, simbiontes — **até o primitivo é bioware** |
| valor | fixo | 0,7 do fixo, mas escala (B) com o atributo da cor (🔴 Força, 🟡 Destreza, 🔵 Inteligência, 🟢 Vida) |
| requisito | Resistência ≥ 5 × dif. | Vida ≥ 5 × dif. |
| regra própria | uma peça por região do corpo | **ressonância**: +25% por outra da mesma cor |

Quatro papéis nos dois: **ofensivo** (fonte de dano própria de um tipo, sem
ocupar mão: 4 × orçamento — conta na sinergia e não tira o bônus de arma
única), **defensivo** (defesa 4 × orçamento, metade de um escudo), **reforço**
(+4% + 0,8% × dif. num tipo de ataque, em todo o ataque ou na defesa — o
mutágeno do Witcher) e **atributo** (1 × orçamento em pontos, como um
acessório forte: o "Implante Melhorador de Inteligência" dá Inteligência; o
"CRISPR de Vitamina C", Vida e Resistência).

**A party de referência usa seis** (lâmina no braço, esqueleto, reflexos;
garra e mutágeno rubros, sangue verde): **+11% de poder e +5% de
resiliência** no nível 45. Por isso todas as missões e chefes foram
recalculados (§6.3, §7.1 e os outros arquivos). Sem nenhum implante, o jogador
fica com ~37% / 69% numa missão do próprio nível.

### 4.9 Evolucionador automático (`D24`)

O jogador escolhe uma **classe** — novidade: hoje só companheiro tem classe —
e `&game evoluir` gasta os pontos livres e equipa o melhor da mochila por ele
(`&game evoluir auto on` faz sozinho a cada nível). A classe é **só perfil**:
não dá bônus. Oito: ⚔️ Guerreiro (os pontos do jogador da party de referência),
🤺 Duelista, 🎯 Atirador, 🔮 Mago, 🛡️ Guardião, ✝️ Templário, 🌀 Andarilho e 🎻
Bardo.

- **Pontos:** primeiro o que falta para os requisitos do estilo da classe e
  dos implantes; depois, cada ponto no atributo mais atrasado em relação às
  proporções da classe.
- **Equipamento:** testa as combinações reais (mãos, cabeça, corpo,
  acessórios, cyberware e bioware) com as fórmulas do combate e fica com a
  maior nota = êxito^peso × sobrevivência^(1 − peso) numa missão do seu nível,
  com os companheiros da party e a sinergia. A classe filtra só as armas.
  Nunca vende nem descarta.
- **Resultado:** toda classe fica entre **40% e 47% de êxito** numa missão do
  próprio nível (a referência tem 40%): o evolucionador mistura tipos com os
  implantes e ganha sinergia. Com a D27, as classes passaram a escolher armas
  diferentes — martelo, montante, rifle e cajado nas duas mãos; arma e escudo
  para Guardião, Templário e Bardo; rifle e cajado, um em cada mão, para o
  Andarilho.

Comandos, tabela das classes, algoritmo, resultados e exemplo de tela no
`IMPLANTES-E-EVOLUCIONADOR.md` §3.

---

## 5. Magias

10 hoje (comum → lendário) + 10 novas (mítico → supremo), uma de ataque e uma
de suporte por raridade. Custo 1, 2, 3, 5, 8 → 12, 17, 23, 30, 38; poder
+0,25 a +0,35 por degrau; preço ×3,75.

**Sem nível mínimo — atributo mínimo (D10 ✅, 8 out):** toda magia pede
**Inteligência ≥ 5 × dificuldade − 4** — 1, 6, 11, 16, 21, 26, 31, 36, 41, 46.
É o atributo-base de quem está no começo da faixa, então quem não investe em
Inteligência recebe cada magia na mesma hora que antes; quem investe, bem
antes (um mago com metade dos pontos em Inteligência alcança as lendárias
por volta do nível 15 e as míticas por volta do 18 — o preço delas, 14 000 e
53 000 Ouro, é o que segura). A Mana continua decidindo quantas cabem, e o preço,
quando dá para comprar. Quem já tem uma magia sem o atributo não perde: ela
fica no grimório e volta a funcionar quando o atributo chegar.

_(Testei Carisma para as de suporte: os acessórios de sorte dão Carisma e a
party de referência pegava a magia suprema de suporte no nível 61 — por isso
ficou Inteligência para as duas.)_

---

## 6. Missões

### 6.1 Dificuldade 1–10

A dificuldade da missão é a faixa do nível dela. Dentro da faixa, o nível é o
ajuste fino. **Toda missão é justa no próprio nível:** poder e risco para a
party de referência daquele nível ter **40% de êxito e 70% de
sobrevivência**. Espera de 45 min.

**Duas formas (D8, 8 out):** a mesma missão pode ser um **contrato** (o
quadro da guilda: as missões com nome do catálogo, pagas pelo banco) ou um
**encontro de dungeon** (sorteado da lista de uma dungeon temática, pago pelo
tesouro dela). A luta e o XP são iguais; mudam quem paga a moeda, o loot (tema
só na dungeon) e a captura de companheiros (só na dungeon) —
`ECONOMIA-E-DUNGEONS.md`.

**Party de referência:** jogador com 50% Força / 20% Resistência / 15% Vida /
resto Mana, com **montante (branca pesada, For B · Des D) nas duas mãos** (com
o bônus de arma única, D27),
cabeça e corpo da raridade da faixa, um acessório de sorte e dois de vigor,
**seis implantes da raridade da faixa** (§4.8, desde 8 out); combatente +
tank da raridade da faixa **no nível do dono** (D2), com o kit da classe
(D23); magias que a Inteligência do jogador libera (D10), até onde a Mana
paga; ataque e defesa por membro (§4.3).

| nível | faixa | poder | resiliência |
|---|---|---|---|
| 1 | 1 | 29 | 129 |
| 5 | 1 | 202 | 419 |
| 10 | 1 | 359 | 783 |
| 20 | 2 | 1.303 | 2.644 |
| 30 | 3 | 3.550 | 7.121 |
| 40 | 4 | 9.031 | 17.934 |
| 50 | 5 | 22.029 | 43.212 |
| 60 | 6 | 51.906 | 101.072 |
| 70 | 7 | 94.430 | 204.901 |
| 80 | 8 | 169.649 | 434.408 |
| 90 | 9 | 348.876 | 858.915 |
| 100 | 10 | 717.012 | 1.756.167 |

### 6.2 Recompensa

`D6` + `D11` (8 out): a missão paga **a força dela, igual para todos** — XP =
o poder da missão; Ouro e Cristal pelo nível da missão, na proporção do que
quem paga tem (D8, D12). O custo do nível acompanha a força, então no seu
nível um êxito vale **80% de um nível**; numa missão duas vezes mais forte,
160% (tabela do §1.3). **Falhar não paga nada**; cair ainda custa moeda e, na
dungeon, companheiros.

### 6.3 Tabela

| nível | dificuldade | poder | risco | loot |
|---|---|---|---|---|
| 1 | 1 | 32 | 41 | comum 63% · incomum 6% |
| 5 | 1 | 223 | 132 | comum 63% · incomum 10% |
| 10 | 1 | 396 | 247 | comum 63% · incomum 15% · raro 3% |
| 11 | 2 | 833 | 457 | comum 25% · incomum 38% · raro 6% |
| 15 | 2 | 1.098 | 619 | comum 25% · incomum 38% · raro 10% |
| 20 | 2 | 1.437 | 833 | comum 25% · incomum 38% · raro 15% · épico 3% |
| 21 | 3 | 2.735 | 1.507 | incomum 25% · raro 38% · épico 6% |
| 25 | 3 | 3.247 | 1.824 | incomum 25% · raro 38% · épico 10% |
| 30 | 3 | 3.916 | 2.244 | incomum 25% · raro 38% · épico 15% · lendário 3% |
| 31 | 4 | 7.569 | 4.168 | raro 25% · épico 38% · lendário 6% |
| 35 | 4 | 8.624 | 4.810 | raro 25% · épico 38% · lendário 10% |
| 40 | 4 | 9.960 | 5.651 | raro 25% · épico 38% · lendário 15% · mítico 3% |
| 41 | 5 | 19.414 | 10.615 | épico 25% · lendário 38% · mítico 6% |
| 45 | 5 | 21.555 | 11.922 | épico 25% · lendário 38% · mítico 10% |
| 50 | 5 | 24.297 | 13.617 | épico 25% · lendário 38% · mítico 15% · celestial 3% |
| 51 | 6 | 40.304 | 24.978 | lendário 25% · mítico 38% · celestial 6% |
| 55 | 6 | 47.804 | 28.402 | lendário 25% · mítico 38% · celestial 10% |
| 60 | 6 | 57.250 | 31.850 | lendário 25% · mítico 38% · celestial 15% · divino 3% |
| 61 | 7 | 75.897 | 52.282 | mítico 25% · celestial 38% · divino 6% |
| 65 | 7 | 95.179 | 53.191 | mítico 25% · celestial 38% · divino 10% |
| 70 | 7 | 104.150 | 64.570 | mítico 25% · celestial 38% · divino 15% · primordial 3% |
| 71 | 8 | 161.394 | 101.165 | celestial 25% · divino 38% · primordial 6% |
| 75 | 8 | 172.715 | 117.948 | celestial 25% · divino 38% · primordial 10% |
| 80 | 8 | 187.113 | 136.893 | celestial 25% · divino 38% · primordial 15% · supremo 3% |
| 81 | 9 | 337.077 | 217.944 | divino 25% · primordial 38% · supremo 6% |
| 85 | 9 | 358.039 | 235.777 | divino 25% · primordial 38% · supremo 10% |
| 90 | 9 | 384.790 | 270.666 | divino 25% · primordial 38% · supremo 15% |
| 91 | 10 | 701.297 | 436.017 | primordial 25% · supremo 38% |
| 95 | 10 | 740.749 | 488.342 | primordial 25% · supremo 38% |
| 100 | 10 | 790.822 | 553.414 | primordial 25% · supremo 38% |

### 6.4 Loot, captura e companheiro

Relativo à raridade da faixa (b): b−1 25% · b 38% · **b+1 de 6% a 15%**
(sobe 1% por nível dentro da faixa) · **b+2 de 1% a 3%** nos três últimos
níveis. Abaixo de comum vira comum; acima de supremo some.

**Ao cair**, a perda de moeda segue como hoje (num contrato vai para o banco;
numa dungeon, para o tesouro dela). **Só na dungeon** cada companheiro tem
**20%** de ser capturado (hoje dependia de fácil/médio/difícil, 0/20/50%; fica
o valor do médio); num contrato ele só se fere. **Companheiro como loot:** 7% por êxito, da raridade da faixa
ou uma abaixo (o valor do médio de hoje).

### 6.5 Ficha

```yaml
- id: d_<obra>_<nome>
  nome: ""
  obra: ""
  nivel: 34                    # a dificuldade sai do nível (34 → 4)
  inimigo_tier: "7-B"          # conferência: deve cair na mesma faixa
  loot_assinatura: g_<obra>_<item>
  descricao: { pt: "", en: "" }
```

---

### 6.6 Missões especiais

Tipo à parte, com **item, companheiro ou magia únicos**. A recompensa cai **uma
vez por pessoa** (o primeiro êxito garante); o NPC nunca vende nem compra,
mas entre jogadores vale tudo (mercado e troca). Companheiro e magia caem como
**contrato** e **pergaminho** — itens negociáveis até serem usados. 30% de
êxito e 60% de sobrevivência no próprio nível; espera de 2 h até o primeiro
êxito. Detalhes, números e exemplos: `ESPECIAIS-E-HISTORIAS.md` §1.

### 6.7 Algoritmo de história

Toda missão, depois de resolvida, é contada em 3–6 frases sorteadas por RNG
com semente: abertura, obstáculo, quem fez a diferença, como terminou (pela
margem real das rolagens) e o que ficou. **Não muda nenhum resultado** — só
lê o desfecho. Substitui a frase fixa do embed. Detalhes, exemplos e
algoritmo: `ESPECIAIS-E-HISTORIAS.md` §2 e `modulos/game/historia.js`.

---

## 7. Chefes

### 7.1 Chefe é uma missão

**A luta de chefe é a mesma das missões**, sem sistema próprio: o mesmo
`resolver`, o mesmo teste de poder e de risco, as mesmas consequências ao
cair (moeda, captura de 20%), o mesmo co-op, a mesma recompensa (D6: a força
dele, igual para todos) e a mesma história (§6.7). **Ele fica no fim de uma
dungeon** (D8) e paga do tesouro dela. O que muda são só os
**números** e o que ele **deixa**:

- **Números:** último nível da faixa, ou o nível do tier para chefe com
  nome; **35% de vitória e 60% de sobrevivência com 4 jogadores** do nível
  (~8% sozinho). Como o chefe é ~7,5× mais forte que uma missão do mesmo
  nível, um êxito paga ~×7,5 — cerca de 6 níveis para quem está no nível dele.
- **Deixa:** 1 item da raridade da faixa garantido, 25% de um da seguinte,
  20% de companheiro da faixa; e, se for chefe com nome, a recompensa única
  dele (item ou contrato), uma vez por pessoa.
- **Espera: 24 h por pessoa** (`D19` ✅). Cada um tem a sua: quem já lutou
  hoje não segura o grupo — o co-op junta quem estiver livre.

| faixa | nível | poder | risco | sozinho | 2 | 3 | 4 | missão do mesmo nível |
|---|---|---|---|---|---|---|---|---|
| 1 | 10 | 1.790 | 1.467 | 13%/28% | 22%/43% | 29%/53% | 35%/60% | 396 |
| 2 | 20 | 7.781 | 5.870 | 11%/25% | 21%/41% | 28%/52% | 35%/60% | 1.437 |
| 3 | 30 | 24.383 | 18.036 | 10%/22% | 20%/40% | 28%/52% | 35%/60% | 3.916 |
| 4 | 40 | 69.009 | 50.093 | 9%/21% | 19%/39% | 28%/52% | 35%/60% | 9.960 |
| 5 | 50 | 181.343 | 129.315 | 8%/20% | 18%/39% | 27%/51% | 35%/60% | 24.297 |
| 6 | 60 | 450.062 | 317.327 | 8%/19% | 18%/38% | 27%/51% | 35%/60% | 57.250 |
| 7 | 70 | 826.001 | 658.022 | 8%/19% | 18%/38% | 27%/51% | 35%/60% | 104.150 |
| 8 | 80 | 1.495.819 | 1.428.375 | 8%/18% | 18%/38% | 27%/51% | 35%/60% | 187.113 |
| 9 | 90 | 3.150.135 | 2.864.523 | 8%/18% | 18%/38% | 27%/51% | 35%/60% | 384.790 |
| 10 | 100 | 6.600.094 | 5.938.785 | 7%/18% | 18%/37% | 27%/51% | 35%/60% | 790.822 |

### 7.2 Atos (linha de chefes)

Um personagem com várias chaves pode virar vários chefes, cada um no nível
do próprio tier; cada ato libera o seguinte. Exemplo: Horus Lupercal — 4-B no
68 e High 1-B no 96 (`CHEFES-RPG.md`).

### 7.3 Ficha

```yaml
- id: b_<obra>_<nome>
  nome: ""
  tipo: chefe
  chave: ""
  tier: "6-A"
  nivel: 49
  requer: b_<obra>_<ato anterior>   # opcional, para atos
  recompensa: { item: g_<obra>_<item>, contrato: f_<obra>_<nome> }   # uma vez por pessoa
  falas: { inicio: { pt: "", en: "" }, derrota: { pt: "", en: "" } }   # entram na história
```

---

## 8. Economia

**Desde 8 out, tudo no `ECONOMIA-E-DUNGEONS.md`** (D8): contrato pago pelo
banco, dungeon paga pelo tesouro dela (que se renova — a única moeda nova),
Ouro e Cristal em toda vitória na proporção do que quem paga tem, o NPC
consumindo metade do que se gasta nele, e a simulação de 90 dias.

O que fica daqui:

| nível | faixa | Ouro hoje (×1,35) | alvo de Ouro (×1,141, D12) | arma 2 mãos da faixa | armas por vitória | alvo de Cristal (1/4 do valor) |
|---|---|---|---|---|---|---|
| 5 | 1 | 2.0e+2 | 102 | 15 | 7 | 0,6 |
| 10 | 1 | 8.9e+2 | 197 | 15 | 13 | 1,2 |
| 20 | 2 | 1.8e+4 | 735 | 55 | 13 | 4,6 |
| 30 | 3 | 3.6e+5 | 2.751 | 200 | 14 | 17 |
| 50 | 5 | 1.5e+8 | 38.472 | 2.850 | 13 | 240 |
| 70 | 7 | 5.9e+10 | 538.097 | 40.000 | 13 | 3.363 |
| 100 | 10 | 4.8e+14 | 28.146.866 | 2.110.000 | 13 | 175.918 |

- **Ouro** (D12): o alvo é `60 × 1,141^(nível da missão − 1)`, e quem paga
  multiplica pelo quanto tem guardado (×0 a ×2). Quem migrar (D13) passa a
  ganhar menos por missão no mesmo ponto — o nível 22 de hoje (nível 43 novo)
  ia de ~32 700 para ~15 300 por missão média —, mas os preços da faixa dele
  não mudam.

---

## 9. O que muda para quem já joga

Quando for aplicado (não agora):

- **Nível** (`D13`): **nível novo = 2 × antigo − 1** — mantém cada jogador na
  mesma faixa (o 22 de hoje vira 43, faixa 5). O progresso dentro do nível
  continua; os pontos dos níveis novos entram como pontos livres.
- **Missões de hoje:** mesmos nomes, nível convertido do mesmo jeito (o Ninho
  da Serpente 22 → 43), poder e risco novos; fácil/médio/difícil vira a
  dificuldade da faixa.
- **Companheiros** passam a subir com o dono (D2) e **deixam de usar item**
  (D23): o que estiver com eles volta para a mochila do dono, e o comando de
  dar item a companheiro sai. Em troca, ganham o kit da classe no ganho por
  nível.
- **Armas e armaduras de hoje** passam a dar dano e defesa em vez de atributo
  (§4.7); a vaga "arma" vira "mão principal" e entra a "mão secundária"
  (D14, D20).
- **XP** vira progresso (D11) e a missão paga a força dela, igual para
  todos (D6); o custo do nível passa a acompanhar a força.
- **Resiliência** (D1), **Ouro e Cristal** pelo banco ou pela dungeon
  (D8, D12), **magias por Inteligência** em vez de nível (D10) — quem já tem uma
  magia sem a Inteligência pedida não perde; ela volta a funcionar quando o
  atributo chegar.
- O resultado de toda missão passa a vir **contado** pelo algoritmo de
  história; nenhum número muda.
- Entram as **vagas de implante** (3 bio + 3 cyber) vazias; os implantes
  passam a cair no loot e na loja (D23, D25). Quem não equipar nenhum fica
  ~3 pontos de chance abaixo da referência.
- A **classe** começa vazia; `&game evoluir` pergunta na primeira vez (D24).
- A **folga de nível** do commit `1156a1a` vira **folga pela força** (D26), e
  cada missão ganha o campo `perigo` (as de colher, entregar e investigar
  ficam com perigo baixo).
- **Contratos e dungeons** (D8): as missões de hoje viram contratos da
  guilda, pagos pelo banco; entram as dungeons temáticas, pagas pelo tesouro
  delas. O pote da dungeon de hoje é dividido entre os tesouros das dungeons.
  O Ouro deixa de nascer em qualquer missão e passa a nascer só nas dungeons.
- **Escudos** passam a dar o dobro de defesa e +10% na defesa de quem usa;
  quem usa uma arma só ganha +80% no dano dela (D27).
- Entra a lista de **missões especiais**; J'zargo, Serana e Ebony Warrior
  saem como contrato, uma vez por pessoa.
- Itens e companheiros de hoje ficam; nada é apagado.

---

## 10. Ordem de implementação

| fase | o quê | depende de |
|---|---|---|
| G0 | decisões — todas fechadas em 8 out | — |
| G1 | D11 (progresso), D6 (recompensa pela força da missão), D1, D2 com o kit (D23), D10, D12, D26 (folga pela força e perigo) — e a migração D13 | G0 |
| G2 | 10 raridades; combate v4, duas mãos, arma única, escudo e sinergia (D14, D20, D22, D27); catálogo genérico; armas de Warhammer 40k; conteúdo em `modulos/game/conteudo/<obra>.json` | G1 |
| G2b | **bioware e cyberware** (D23): vagas, itens `implante`, efeitos no combate; a party de referência e as tabelas já contam com eles | G2 |
| G2c | **evolucionador automático** e classe do jogador (D24): `modulos/game/evolucionador.js`, `&game classe`, `&game evoluir` | G2b |
| G3 | missões das 10 dificuldades; as 9 de hoje convertidas; **algoritmo de história** (o `resolver` passa a devolver as rolagens) | G2 |
| G3b | **missões especiais**: registro "uma vez por pessoa", itens `especial`, contratos e pergaminhos | G3 |
| G3c | **contratos e dungeons** (D8): banco que paga contratos, tesouro de dungeon que se renova, dungeons genéricas e as das obras (Armageddon, Volkihar), loot de tema | G3 |
| G4 | chefes (missão com números de chefe) e atos | G3 |
| G5 | personagens e chefes das obras, uma obra por vez | G2 |

Em cada fase: suíte no `testes.mjs` (provando que falha sem a mudança),
`&help`/`&tutorial`/wiki do jogo em PT+EN, `traducao.js` com os nomes novos.

---

## 11. Decisões

| | decisão | estado |
|---|---|---|
| D1 | resiliência pela soma efetiva (B) | ✅ |
| D2 | companheiros sobem com o dono, sem teto | ✅ |
| D3 | 10 dificuldades × 10 níveis, raridades novas, tabela de obtenção | ✅ |
| D4 | missões de hoje: nível convertido e números novos | ✅ |
| D5 | ~~chefe do mundo~~ — saiu: chefe luta como missão | — |
| D6 | **a missão paga a força dela, igual para todos** (XP = poder; o custo do nível acompanha a força); êxito no seu nível = 80% de um nível; **falha não paga nada** (§1.3) | ✅ 8 out |
| D7 | Destreza/Carisma/Sorte de companheiro: precisão por membro, Carisma soma ao buff (b) | ✅ |
| D8 | **contrato** pago pelo banco e **dungeon** paga pelo tesouro dela, que se renova sem fim; Ouro e Cristal em toda vitória, na proporção do que quem paga tem; mais Cristal; o NPC consome metade do que se gasta nele (`ECONOMIA-E-DUNGEONS.md`) | ✅ 8 out |
| D9 | ~~bônus de duelo~~ — saiu junto com o duelo | — |
| D10 | magias sem nível mínimo: **Inteligência ≥ 5 × dif − 4** (§5) | ✅ 8 out |
| D11 | XP guardado como progresso dentro do nível | ✅ |
| D12 | Ouro ×1,141 por nível — o nível da missão | ✅ |
| D13 | migração: nível novo = 2 × antigo − 1 | ✅ |
| D14 | duas mãos: toda arma em uma ou nas duas; requisito de Força de duas mãos = metade; sem power stance | ✅ |
| D15 | Horus: dois atos (4-B no 68, High 1-B no 96), chefes normais | ✅ |
| D16 | missão especial continua repetível depois do êxito, sem a recompensa única | ✅ |
| D17 | um de cada companheiro único por jogador | ✅ |
| D18 | Ebony Warrior: contrato, uma vez por pessoa | ✅ |
| D19 | espera do chefe: 24 h por pessoa | ✅ 8 out |
| D20 | combate v4 — armas com dano próprio e escala, armadura com defesa, ataque e defesa calculados por membro (§4) | ✅ 8 out |
| D21 | armas de Warhammer 40k no loot e na loja normais, marcadas com a obra | ✅ |
| D22 | sinergia sem teto: `25% × diversidade² × (1 + ln(fontes/3))` | ✅ |
| D23 | bioware e cyberware: 3 + 3 vagas só no jogador; **companheiro não usa equipamento nenhum** — o kit da classe entra no ganho por nível, calibrado para 34% jogador / 33% / 33% na média (combatente ×4,37, tank ×7,77, mago ×11,32, suporte ×9,44) | ✅ 8 out |
| D24 | evolucionador automático com 8 classes (só perfil) | ✅ |
| D25 | implantes são itens normais, com o papel atributo | ✅ |
| D26 | folga pela força total, nunca pelo nível; campo `perigo` por missão (o pote da dungeon saiu com a D8) | ✅ |
| D27 | escudo 8 × orçamento e +10% de defesa; +80% para quem usa uma arma só | ✅ |
| D28 | duas armas leves ou médias ficam atrás de uma pesada — aceito | ✅ |
| — | imagens: só a URL no catálogo, arquivo fora do repo público | ✅ |

---

## Apêndice A — tier → dificuldade → nível

| tier | dif. | nível | destaque | | tier | dif. | nível | destaque |
|---|---|---|---|---|---|---|---|---|
| 10-C | 1 | 1 | ×1,00 | | 5-B | 6 | 56 | ×1,10 |
| 10-B | 1 | 6 | ×1,10 | | 5-A | 6 | 58 | ×1,15 |
| 10-A | 1 | 10 | ×1,20 | | High 5-A | 6 | 60 | ×1,20 |
| 9-C | 2 | 11 | ×1,00 | | Low 4-C | 7 | 61 | ×1,00 |
| 9-B | 2 | 16 | ×1,10 | | 4-C | 7 | 63 | ×1,05 |
| 9-A | 2 | 20 | ×1,20 | | High 4-C | 7 | 66 | ×1,10 |
| 8-C | 3 | 21 | ×1,00 | | 4-B | 7 | 68 | ×1,15 |
| High 8-C | 3 | 24 | ×1,07 | | 4-A | 7 | 70 | ×1,20 |
| 8-B | 3 | 27 | ×1,13 | | 3-C | 8 | 71 | ×1,00 |
| 8-A | 3 | 30 | ×1,20 | | 3-B | 8 | 74 | ×1,07 |
| Low 7-C | 4 | 31 | ×1,00 | | 3-A | 8 | 77 | ×1,13 |
| 7-C | 4 | 33 | ×1,03 | | High 3-A | 8 | 80 | ×1,20 |
| High 7-C | 4 | 34 | ×1,07 | | Low 2-C | 9 | 81 | ×1,00 |
| Low 7-B | 4 | 36 | ×1,10 | | 2-C | 9 | 84 | ×1,07 |
| 7-B | 4 | 37 | ×1,13 | | 2-B | 9 | 87 | ×1,13 |
| 7-A | 4 | 39 | ×1,17 | | 2-A | 9 | 90 | ×1,20 |
| High 7-A | 4 | 40 | ×1,20 | | Low 1-C | 10 | 91 | ×1,00 |
| 6-C | 5 | 41 | ×1,00 | | 1-C | 10 | 92 | ×1,02 |
| High 6-C | 5 | 43 | ×1,03 | | High 1-C | 10 | 93 | ×1,05 |
| Low 6-B | 5 | 44 | ×1,07 | | 1-B | 10 | 94 | ×1,07 |
| 6-B | 5 | 46 | ×1,10 | | High 1-B | 10 | 96 | ×1,10 |
| High 6-B | 5 | 47 | ×1,13 | | Low 1-A | 10 | 97 | ×1,13 |
| 6-A | 5 | 49 | ×1,17 | | 1-A | 10 | 98 | ×1,15 |
| High 6-A | 5 | 50 | ×1,20 | | High 1-A | 10 | 99 | ×1,18 |
| 5-C | 6 | 51 | ×1,00 | | 0 | 10 | 100 | ×1,20 |
| Low 5-B | 6 | 53 | ×1,05 | | | | | |
