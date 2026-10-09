# Missões especiais e algoritmo de história — RPG

**Aplicado no jogo na branch `rpg-v4`** (9 out 2026) — veja `docs/rpg/README.md` para o que entrou e o que ficou pendente. Complementa o `PLANO-RPG-CONTEUDO.md`
(§6.6 e §6.7 apontam para cá). O algoritmo está em
`modulos/game/historia.js` e os trechos em `modulos/game/conteudo/historias.json`.

---

## 1. Missões especiais

### 1.1 O que são

Um tipo de missão à parte, `especial`, listado separado (`&game especiais`),
com uma **recompensa única**: um item, um companheiro ou uma magia que não
existem em nenhum outro lugar do jogo.

- **Cai uma vez por pessoa.** O primeiro êxito de cada jogador garante a
  recompensa; depois disso a missão continua jogável, mas paga só o normal
  (XP, Ouro e loot da faixa). O registro é por jogador, no mundo todo — o RPG
  é global. **Decidido (D16):** depois do êxito, continua repetível, sem a recompensa única.
- **Fora do mercado comum.** O NPC nunca vende (não aparece em `&game
  comprar`) e nunca compra (`&game vender` recusa: "isso o mercador não compra
  — só outro jogador"). Entre jogadores, pode tudo: `&game mercado vender`,
  `&game mercado comprar` e `&game trocar`, pelo preço que eles combinarem.
- **Co-op:** cada membro do grupo que ainda não recebeu a recompensa recebe a
  dele.

### 1.2 Como companheiro e magia viram coisa negociável

Hoje só **itens** passam de um jogador para outro: companheiro não se troca,
e magia aprendida fica com quem aprendeu. Para não criar um sistema de troca
novo, a recompensa única cai sempre como **item**:

| recompensa | cai como | vira o quê | comando |
|---|---|---|---|
| item único | o próprio item | — | equipa normalmente |
| companheiro único | **Contrato de \<nome\>** | o companheiro, no nível do dono | `&game follower contratar <contrato>` |
| magia única | **Pergaminho de \<magia\>** | a magia no grimório | `&game aprender <pergaminho>` |

Enquanto não for usado, o contrato ou pergaminho é um item como qualquer outro
— vai para o mercado entre jogadores, entra em troca. Depois de usado, fica com
quem usou. **Decidido (D17):** um jogador tem no máximo um de cada companheiro
único — não dá para usar um segundo contrato igual comprado de outro.

### 1.3 Números

| | regra |
|---|---|
| dificuldade | a faixa do nível, como qualquer missão |
| poder e risco | **30% de êxito e 60% de sobrevivência** para a party do nível (a normal é 40/70) |
| recompensa normal | a de qualquer missão (D6 de 8 out: a força dela, igual para todos) — o poder maior dá ×1,56 |
| quem paga | é um **contrato especial**: a moeda sai do banco, como nos contratos (`ECONOMIA-E-DUNGEONS.md`) |
| espera | **2 h** até o primeiro êxito; depois, 45 min como as outras |
| item único | raridade da faixa, **×1,2** no que ele dá: dano (arma), defesa (armadura), bônus (acessório) ou efeito (bioware/cyberware) |
| companheiro único | genérico da classe ×1,2, ou ficha com nome (`COMPANHEIROS-RPG.md`) |
| magia única | o poder da magia da faixa com **custo −25%** (arredonda para cima) |

| nível | dificuldade | poder | risco |
|---|---|---|---|
| 15 | 2 | 1 708 | 962 |
| 24 | 3 | 4 828 | 2 703 |
| 37 | 4 | 14 252 | 8 004 |
| 45 | 5 | 33 531 | 18 545 |
| 55 | 6 | 74 362 | 44 181 |
| 76 | 8 | 272 753 | 186 712 |
| 95 | 10 | 1 152 277 | 759 643 |

_Revisão de 8 out: a party de referência ganhou bioware e cyberware, o bônus
de arma única (D27) e o kit dos companheiros (D23); o poder ficou ~3,4× e o
risco ~5× o da v3; as chances são as mesmas. A folga pela força (D26)
também vale aqui, com a base 30/60._

### 1.4 Exemplos genéricos

| missão | nível · dif. | recompensa única | números |
|---|---|---|---|
| **O Relógio Parado** — uma relojoaria fechada desde 1987, e o dono nunca saiu | 15 · 2 | item: **Relógio do Avô** (acessório, incomum) | Sor 2, Agi 1 |
| **O Experimento de J'zargo** | 24 · 3 | companheiro: **Contrato de J'zargo** | ficha no `COMPANHEIROS-RPG.md` |
| **A Última Transmissão** — uma rádio pirata que ainda toca, sem ninguém na cabine | 37 · 4 | magia: **Pergaminho de Eco de Rádio** (suporte) | custo 4, poder 0,65 (a Regeneração custa 5) |
| **A Clínica do Beco** — um médico de implantes que só atende de madrugada, num porão sem placa | 45 · 5 | item: **Coração de Segunda Mão** (cyberware, circulatório, lendário) | reforço de defesa +9,6% (8% × 1,2); Resistência 25 |
| **O Elevador que Desce Demais** | 55 · 6 | item: **Revólver do Ascensorista** (de fogo, leve, mítico) | dano 192; escala Des B · For E; Força 6 / 3, Destreza 18 |
| **O Arquivo das Estrelas Mortas** | 76 · 8 | magia: **Pergaminho de Última Luz** (ataque) | custo 18, poder 1,68 (o Colapso Galáctico custa 23) |
| **A Página em Branco** | 95 · 10 | companheiro: **Contrato da Revisora** (suporte, supremo) | genérico suporte ×1,2: soma ~10 000 no 95; Bênção 4,54 |

### 1.5 Com os personagens das obras

Toda recompensa que "só sai uma vez" passa a usar o mesmo registro e o mesmo
formato de contrato/pergaminho:

- **J'zargo** — a missão "O Experimento" vira especial (o próprio jogo dá ele
  uma vez, depois do teste dos pergaminhos).
- **Serana** — o chefe Lorde Harkon entrega o Contrato da Serana uma vez por
  pessoa.
- **Ebony Warrior** — igual aos dois: o chefe entrega o Contrato do Ebony
  Warrior (e a Espada de Ébano do Vampiro) uma vez por pessoa. Decidido (D18).
- **Horus** — cada um dos dois atos entrega o seu item único uma vez por
  pessoa (Escamas da Serpente; Quebra-Mundos).
- **Rize Kamishiro** — o chefe entrega o Contrato da Rize uma vez por pessoa;
  o ato II (Dragão) entrega o Kakuhou da Rize.
- **Tryce** — o chefe (uma crew battle, nível 11, perigo baixo) entrega o
  Contrato do Tryce e o Boostpack Reserva uma vez por pessoa.

### 1.6 Ficha

```yaml
- id: e_<obra>_<nome>             # e_ = especial
  tipo: especial
  nome: { pt: "", en: "" }
  descricao: { pt: "", en: "" }   # uma linha, seca
  nivel: 37                       # → dificuldade 4
  requer: e_<outra>               # opcional: corrente de especiais
  recompensa:
    tipo: magia                   # item | companheiro | magia
    id: m_eco_radio
  historia:                       # ganchos para o algoritmo (§2.5)
    generos: [moderno]
    local:   [{ pt: "cabine da rádio", art: "a", en: "the radio booth" }]
    inimigo: [{ pt: "voz no ar", art: "a", en: "the voice on air" }]
    falas:                        # opcional: trechos fixos que entram no lugar dos sorteados
      abertura: { pt: "", en: "" }
      primeira_vez: { pt: "", en: "" }
```

### 1.7 Implementação

- Tabela `rpg_especiais_feitas (userId, missaoId, em)` — global.
- Itens com `especial = 1`: `&game comprar` não lista; `&game vender` recusa;
  `mercado` e `trocar` aceitam.
- Itens de tipo `contrato` e `pergaminho`, com `consome` apontando para o
  companheiro ou a magia.
- Suítes no `testes.mjs`: a recompensa não cai duas vezes; o NPC recusa; o
  mercado entre jogadores aceita; o contrato vira companheiro e some da
  mochila; o pergaminho vira magia; o co-op dá a cada um uma vez.

---

## 2. Algoritmo de história

### 2.1 O que muda — e o que não muda

**As missões continuam exatamente como são.** O resultado (êxito, queda,
XP, Ouro, loot, captura, resgate) é sorteado igual, pelas mesmas fórmulas. A
história vem **depois** e só lê o que aconteceu: ela conta, não decide.

No embed do resultado, ela entra no lugar da frase fixa de hoje ("Você venceu
e voltou inteiro." / "Não deu certo…" / "Você caiu…"), logo abaixo do nome e
da descrição da missão. Os números (XP, Ouro, loot) continuam embaixo, iguais.

A única mudança fora do módulo novo: o `resolver` passa a **devolver as
rolagens** que ele já faz (`rolagens: { exito, sobrev }`). Isso não muda
nenhum resultado — só permite contar se foi folgado ou por um fio.

### 2.2 As cinco batidas

| batida | o quê | de onde vem |
|---|---|---|
| 1. abertura | chegada ao lugar | ganchos da missão + gênero |
| 2. obstáculo | o inimigo aparece | ganchos da missão |
| 3. momento | quem fez a diferença | quem mais pesou no resultado |
| 4. virada | como terminou | desfecho + margem |
| 5. fecho | o que ficou | loot, companheiro novo, captura, resgate, nível, recompensa especial |

3 a 6 frases, ~300–450 caracteres — cabe numa tela de celular.

### 2.3 Margem — folgado ou por um fio

Das rolagens que o resolver já faz:

```
êxito:  folga = (chance − rolagem) ÷ chance
        > 0,66 folgado · > 0,25 limpo · senão apertado
falha:  distância = (rolagem − chance) ÷ (1 − chance)
        < 0,15 quase · senão longe
queda:  caiu
```

### 2.4 Quem brilhou

Sorteio ponderado pela contribuição real: o peso de cada membro é a parte
dele no poder (Força + 0,7 × Inteligência) ou na resiliência; cada magia
ativa entra com peso pelo poder dela. Quem mais pesou aparece mais, mas não
sempre — senão a história fica igual toda vez. No co-op, os outros jogadores
também concorrem.

### 2.5 Ganchos e gêneros

Cada missão pode trazer, no campo `historia`:

- **gêneros** — `medieval`, `moderno`, `scifi`, `cosmico` (e os que vierem).
  Trechos do gênero da missão pesam o dobro dos genéricos.
- **local** e **inimigo** — listas de ganchos bilíngues com artigo:
  `{ pt: "trilha dos lenhadores", art: "a", en: "the woodcutters' trail" }`.

Sem ganchos, a história usa genéricos da dificuldade ("o lugar", "a coisa lá
dentro"). Ganchos para as missões de hoje:

| missão | gênero | local | inimigo |
|---|---|---|---|
| Limpar os Ratos do Porão | medieval | o porão da taverna | os ratos; o rato que manda nos outros |
| Espantar Goblins da Estrada | medieval | a estrada do moinho | o bando de goblins |
| Colher Ervas na Mata Rasa | medieval | a mata rasa | as urtigas; o javali que mora lá |
| Caçar o Lobo Branco | medieval | a mata congelada; a trilha dos lenhadores | o Lobo Branco; a alcateia faminta |
| Explorar a Cripta Submersa | medieval | a cripta alagada | os afogados que não ficaram deitados |
| Escoltar a Caravana de Sal | medieval | a rota do deserto de sal | os saqueadores |
| Descer ao Poço sem Fundo | medieval | o fundo do poço; o terceiro patamar | a coisa que mora lá embaixo |
| Enfrentar o Guardião de Pedra | medieval | o salão do guardião | o Guardião de Pedra |
| Invadir o Ninho da Serpente | medieval | o ninho; a câmara dos ovos | a Serpente; as crias |

As missões do mercado (sem inimigo) usam um conjunto próprio e curto ("o
cliente", "o estoque", "o cavalo que não queria sair").

### 2.6 Vagas e português

Os trechos são escritos com vagas: `{jogador}`, `{heroi}`, `{magia}`,
`{item}`, `{comp}`, `{nomes}`, `{local}`, `{inimigo}`. Em português, as
vagas já fazem a contração com o artigo do gancho — `{de_local}` vira "da
trilha", `{em_local}` "no túnel", `{a_local}` "à plataforma" — e
`{n:ficou|ficaram}` concorda com quantos nomes entraram. Toda frase começa
com maiúscula, mesmo que comece por uma vaga. Em inglês, o gancho pode trazer a
própria preposição (`en_em: "on the bridge"`).

Nomes de itens e companheiros passam pelo `traducao.js`, como no resto do
jogo.

### 2.7 Sorteio, repetição e reexibição

- **RNG com semente** (mulberry32), separado do RNG do resultado. Semente =
  hash de jogador + missão + horário. A mesma semente gera a mesma história —
  dá para reexibir a última em `&game historia` guardando só a semente.
- **Anti-repetição:** os últimos ~12 trechos de cada jogador ficam de fora do
  sorteio enquanto houver alternativa.
- **Trechos fixos:** chefes e especiais podem trazer falas próprias
  (abertura, primeira vez, derrota), que entram no lugar das sorteadas; o
  meio continua por RNG.
- **Tom:** o das descrições de hoje — seco, curto, com um pouco de humor
  ("Tem fundo. Ninguém voltou para confirmar.").
- **Sem LLM:** tudo local e instantâneo, sem depender do Ollama.

### 2.8 Exemplos (do protótipo)

**Sucesso folgado, missão medieval de hoje, com loot**
> As tochas da trilha dos lenhadores tremiam como se soubessem de algo. O Lobo Branco bloqueava a única saída — e parecia gostar disso. Ghieh foi na frente, porque alguém tinha de ir. O Lobo Branco entendeu cedo demais que tinha escolhido o dia errado. Espada de Ferro estava lá, como se esperasse alguém.

_EN, mesma semente:_ The torches of the woodcutters' trail flickered as if they knew something. The White Wolf blocked the only way out — and seemed to enjoy it. Ghieh went first, because someone had to. The White Wolf realized too early it had picked the wrong day. Espada de Ferro was there, as if waiting for someone.

**Sucesso por um fio, missão moderna, sobe de nível**
> O sinal do celular morreu na entrada da plataforma 4. Ninguém achou estranho a tempo. O relógio da bomba já estava esperando. Policial de Choque ficou na frente e recebeu o que vinha. Foi por um fio. Um fio bem fino. Ghieh voltou diferente. Melhor, provavelmente.

**Falha por pouco, ficção científica**
> Os sensores diziam que não havia nada na ponte de comando. Os sensores estavam errados. A tripulação automática bloqueava a única saída — e parecia gostar disso. Ghieh foi na frente, porque alguém tinha de ir. Quase. A palavra que mais se ouve na volta para casa.

**Caiu, companheiro capturado**
> Chegar ao terceiro patamar era a parte fácil. Foi o que disseram. A coisa que mora lá embaixo bloqueava a única saída — e parecia gostar disso. Couraceiro de Ferro segurou a linha por tempo demais para alguém normal. A última coisa que Ghieh lembra é de achar que estava indo bem. Na saída, faltava gente: Couraceiro de Ferro e Guarda Bisonho ficaram para trás.

**Co-op, missão especial pela primeira vez**
> A relojoaria fechada desde 1987. Silêncio demais para o gosto de Ghieh. O dono que nunca saiu de lá já estava esperando. Foi Ana quem deu o golpe que importou; o resto do grupo vai dizer outra coisa. Ninguém saiu bonito, mas todo mundo saiu. E ali estava o motivo da viagem: Relógio do Avô. Só existe um desses para cada um.

**Especial repetida (a recompensa já saiu antes)**
> O sinal do celular morreu na entrada da relojoaria fechada desde 1987. Ninguém achou estranho a tempo. O dono que nunca saiu de lá bloqueava a única saída — e parecia gostar disso. Ghieh foi na frente, porque alguém tinha de ir. Deu trabalho, mas deu certo. O lugar onde Relógio do Avô esteve continuava vazio. Ghieh sabia; veio mesmo assim.

### 2.9 Escrevendo trechos novos

- Uma frase por trecho, no máximo duas; pt e en sempre juntos, com o mesmo `id`.
- Trecho de **momento** precisa servir para êxito e para fracasso (quem
  brilhou não decide o desfecho).
- Trecho de **virada** é o único que diz como terminou.
- O protótipo tem ~40 trechos. Para não repetir em quem joga todo dia, a meta
  é **~150 na primeira versão**: ~20 aberturas (5 por gênero), ~15
  obstáculos, ~40 momentos (por classe, por tipo de magia, co-op), ~40
  viradas (por margem), ~35 fechos.

### 2.10 Implementação

- Módulo `modulos/game/historia.js` (o protótipo é a base) e trechos em
  `modulos/game/conteudo/historias.json`, para editar sem mexer em código.
- `resolver` devolve `rolagens`; o embed troca a frase fixa pela história.
- Suítes: mesma semente → mesmo texto; a história nunca contradiz o desfecho
  (virada sempre da chave certa); concordância e contrações; anti-repetição;
  pt e en têm os mesmos ids; nenhuma vaga fica sem preencher.
