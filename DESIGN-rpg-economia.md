# RPG + Economia — Especificação

> Especificação do sistema de RPG e economia do bot. Descreve **o que será
> construído**. Números marcados como *inicial* vão para configuração e se
> ajustam jogando.
>
> Combate é resolvido por cálculo probabilístico, de uma vez, sem turnos.

---

## 1. Visão geral

- Cada jogador tem um **personagem** com 9 atributos e monta uma **party**
  (ele + followers NPCs, ou com outro jogador).
- A party vai em **missões**, que dão XP, itens e moeda.
- As **moedas** são configuráveis pelo dono e circulam num mercado que se
  auto-regula pela concentração da moeda (`P`).
- **Escopo: por servidor.** Personagem, inventário, moedas, mercado e dungeon são
  próprios de cada servidor — nada é compartilhado.
- **Onde se joga:** nos canais onde os comandos do bot já são permitidos
  (`&acesso canal`). Não há configuração de canal separada para o RPG.

---

## 2. Atributos (9)

| Atributo | Efeito |
|---|---|
| **Força** | dano físico (×1,00) |
| **Destreza** | precisão — multiplica o dano |
| **Resistência** | reduz o dano que passa (percentual) |
| **Agilidade** | chance de evitar o golpe inteiro |
| **Vida** | quanto dano aguenta acumulado |
| **Mana** | quantas magias dá para usar por missão |
| **Inteligência** | dano mágico (×0,70) · +XP · +pontos por nível |
| **Sorte** | +dinheiro · +drop · sobrevivência (×0,60) · +XP · +pontos por nível |
| **Carisma** | buffa a party · melhora a recompra do NPC · reduz custo de entrada e preço de mercenário |

**Distribuição:** híbrida — a base sobe automaticamente por nível, e o jogador
distribui **pontos livres** (a build).

**Notas de balanceamento que a implementação precisa respeitar:**
- Inteligência e Sorte rendem **menos por ponto em combate** (×0,70 e ×0,60)
  porque também dão progressão. Sem essa compensação, elas seriam estritamente
  superiores a Força e Vida, e ninguém escolheria as outras.
- Vida, Resistência e Agilidade têm papéis **multiplicativos** entre si, não
  aditivos. Isso faz espalhar (10/10/10) render mais que empilhar (30/0/0) sem
  precisar de regra proibindo nada.
- Mana nunca satura: mais mana = mais magias por missão.

---

## 3. Progressão

### XP por nível
```
xpParaNivel(n) = 100 × 1,5^(n−1)
```

| Nível | XP para subir | Acumulado |
|---|---|---|
| 2 | 100 | 100 |
| 10 | 2.563 | 7.489 |
| 20 | 147.789 | 443.168 |
| 30 | 8,5 mi | 25,5 mi |

### XP das missões — acompanha a curva
```
xpDaMissao = xpBase × 1,5^(nívelDaMissão − 1) × (1 + 0,02 × √(INT + SORTE))
```
A recompensa cresce no mesmo ritmo da exigência. Assim a razão
"quanto falta ÷ quanto ganho" fica constante e subir de nível leva
aproximadamente o mesmo tempo a vida inteira.

> **Obrigatório:** se a recompensa não escalar, a curva de 1,5× vira um teto — o
> jogo trava por volta do nível 12–15.

### Pontos por nível
```
pontosPorNivel = 1 + 0,25 × √(INT + SORTE)
```

| INT+SORTE | Pontos/nível | Bônus de XP |
|---|---|---|
| 4 | 1,5 | +4% |
| 16 | 2,0 | +8% |
| 64 | 3,0 | +16% |
| 144 | 4,0 | +24% |

### Princípio: incentivo, nunca limite
Onde algo puder disparar, a resposta é **retorno decrescente** (raiz quadrada),
não teto. O jogador nunca lê "você atingiu o máximo".

> **Única exceção:** o `rMax < 1` da recompra do NPC (§7.3). Não é limite de
> poder — é o que impede dinheiro infinito. Se cair, a economia colapsa.

---

## 4. Followers e party

- **Party: até 4 slots.** Solo: você + até 2 followers. Co-op: 2 jogadores +
  1 follower cada.
- **4 classes:** Mago (dano mágico), Tank (resistência), Combatente (dano
  físico), Suporte (Sorte/Carisma + alguma magia).
- Atributos sobem **automaticamente** conforme a classe.
- Cada follower traz **uma magia** da sua classe.
- São **equipáveis**, com os mesmos slots do jogador.
- NPCs também têm Carisma e contribuem para o buff da party.

### Recrutamento
- **Mercenários:** todos sempre disponíveis, custam moeda.
- **Dungeon:** aparecem como drop, sem custo.
- Dispensado volta para a lista de mercenários.

### Energia
- Levar followers gasta **energia** deles. Ir sozinho não gasta (mas é fraco).
- Regenera por **tempo** (*inicial:* 1 ponto/hora, teto 5), por timestamp.
- **Descanso pago** em moeda como atalho.

### Divisão de loot
Levar followers **reduz o loot do jogador** — a parte deles vai para o
**mercado**, não para o NPC.

> Isso evita ter que criar inventário, equipar e vender por NPC, e de quebra
> alimenta o mercado.

### Álbum de fotos
Cada follower tem várias fotos, navegáveis por reação (◀️ ▶️) na ficha.

- As imagens entram por **URL**; o bot guarda o link, não o arquivo.
- Importação em lote a partir de uma lista: `nome do follower | url`
  (uma linha por foto), ou uma linha com URLs separadas por vírgula.
- Comandos: `&follower fotos <nome>` · `&follower foto add|remove` ·
  `&follower importar`
- Imagens que falharem ao carregar são marcadas, para troca sem caçar uma a uma.

---

## 5. Magias

- **Ataque:** aumenta a probabilidade de **êxito** da missão.
- **Suporte:** aumenta a probabilidade de **sobrevivência** da party.
- Custam **Mana** — o total de Mana define quantas cabem numa missão.
- O jogador **aprende** magias fazendo missões ou comprando itens.
- Followers já trazem a magia da classe.

---

## 6. Missões

Todas têm **nome próprio** ("Escoltar a Caravana de Sal"), nunca "missão
difícil genérica".

### Tipo 1 — Missões do mercado (sem risco)
- **Nenhum risco de morte.** Para quem tem medo de perder o que carrega.
- Pagamento e XP **pequenos e fixos** (não escalam com o nível).
- Gastam cooldown, então não dá para farmar sem limite.

> São a rede de segurança do começo. Como o valor é fixo e a curva de XP é
> exponencial, deixam de compensar sozinhas — sem precisar de trava artificial.

### Tipo 2 — Missões de dungeon (com risco)
3 dificuldades (**fácil / médio / difícil**), cada uma definindo loot
(qualidade + quantidade), risco de morte e moeda esperada.

### Resolução
```
Poder = (Força×1,00 + Inteligência×0,70) da party
        × precisão(Destreza)
        + magias de ATAQUE (limitadas por Mana)
        + bônus de Carisma

Resiliência = aguento(Vida) ÷ (1 − redução(Resistência))
              × (1 + evasão(Agilidade))
              + magias de SUPORTE
              + Sorte×0,60
```
Duas rolagens → três desfechos:
- **Êxito + sobrevive** → missão cumprida, loot cheio.
- **Falha + sobrevive** → não cumpriu, loot parcial ou nenhum.
- **Falha na sobrevivência** → a party cai (ver §8).

Membros caem individualmente; a missão segue enquanto houver alguém de pé.

### Limitadores
- **Cooldown** nas 2 primeiras missões (anti-spam).
- **Energia** dos followers.
- **Custo de entrada:** fáceis de graça; difíceis custam, escalando com o valor
  da moeda — em escala bem menor que a perda por morte.

### Co-op
- Um jogador abre a missão para party (`&missao ir <nome> --party`), outro entra
  (`&missao entrar`). Se ninguém entrar num prazo, vira solo.
- **Dificuldade escala** com o tamanho da party — co-op é estilo, não atalho.
- **Loot individual:** cada um rola o seu, ninguém divide nem disputa drop.
- **Morte individual:** cada um sofre a própria perda; quem caiu não recebe loot.
- **Custo de entrada, cooldown e energia** contam para cada participante.

---

## 7. Itens, equipamento e economia

### 7.1 Equipamento
- Slots: **Armadura, Capacete, Arma, Acessório 1, 2, 3**.
- Itens dão bônus de atributo, com raridade (comum → lendário).

### 7.2 Fontes e escassez
- **Mercado:** estoque **finito** para itens raros — a escassez é o que move o
  preço. Os **genéricos fracos têm estoque infinito**.
- **Missões:** o drop sai de uma tabela por raridade. Itens raros continuam
  raros — missão não cria item infinito.

### 7.3 Preços

**P (concentração da moeda):**
```
P = moeda em mãos dos players ÷ (players + mercado)
```
A dungeon **não entra** no cálculo. Cada moeda tem seu próprio P, em tempo real.
O P usado nas fórmulas é **suavizado** (média das últimas horas), para uma compra
grande não sacudir o mercado sozinha.

**Perda ao morrer** (cresce devagar no começo, dispara no fim):
```
perda(P) = piso + a·ln(1 + b·P) + c·(e^(d·P) − 1)
```

**Preço de venda do NPC:**
```
item finito:    preço = (quantidadeBase ÷ qtdNoMercado) × mult(P)
item infinito:  preço = precoBase × mult(P)
mult(P)        = MIN + (MAX − MIN) × (1 − perda(P))
```
Itens infinitos não usam escassez (o denominador iria a zero). Eles funcionam
como **piso de preço** do jogo: como sempre dá para comprar o básico, ninguém
consegue cobrar um absurdo por equivalente no mercado dos players.

**Recompra do NPC** (influenciada por Carisma):
```
recompra = preçoVenda × fator(carisma)
fator    = rMin + (rMax − rMin) × carismaNormalizado
```
*Inicial:* `rMin = 0,35` · `rMax = 0,70`.

> **`rMax` precisa ser estritamente menor que 1.** Com item de estoque infinito,
> recomprar por ≥ o preço de venda vira máquina de dinheiro infinito: compra por
> X, vende por X, repete. Com 0,70, cada ciclo perde 30% e o loop nunca lucra.

### 7.4 Efeito de auto-regulação
- **P alto** (players ricos): itens baratos + morrer arriscadíssimo → pressão
  para gastar, devolvendo moeda ao mercado.
- **P baixo** (mercado cheio): itens caros + morrer barato → incentiva arriscar.

### 7.5 Moedas
O dono/admin cria moedas com: nome/símbolo, finita ou infinita, suprimento base,
dificuldade de obtenção em missão, quantidade base no mercado e na dungeon.

### 7.6 Câmbio do sistema
Taxa derivada do P e do suprimento, com **spread de 2–5%** que vai para o
mercado. O spread impede o loop A→B→A lucrando com a oscilação.

---

## 8. Morte e dungeon

### Jogador — dois níveis, sem morte definitiva
1. **Volta de mãos vazias** — perde o loot da missão, mantém a carteira.
2. **Volta ferido no bolso** — perde também uma fração do que carregava,
   calculada por `perda(P)`. Esse valor vai para a dungeon.

Em nenhum caso perde nível, atributos ou equipamento.

### Followers — capturados, não mortos
Ao cair, o follower fica **na dungeon** até ser resgatado.

```
chanceResgate = chanceBase          (qualquer jogador)
chanceResgate = chanceBase × bDono  (o dono original)
```
*Inicial:* `chanceBase = 25%` · `bDono = 3` (dono ≈ 75%).

- **Janela exclusiva:** nas primeiras horas (*inicial:* 6h) só o dono pode tentar.
- **Quem resgata fica com o follower.**
- O dono é **avisado** quando seu follower cai.
- Party cheia: o resgatador escolhe trocar alguém ou deixar o follower lá.
- Followers capturados **não somem com o tempo**.

### Dungeon como reservatório
O que os jogadores perdem ao cair vai para a dungeon — a moeda é realocada, não
destruída.

```
fracao(R) = fMin + (fMax − fMin) × √(R ÷ Rref)
prêmio    = R × fracao(R)
```
*Inicial:* `fMin = 5%` · `fMax = 20%`. `R` = quanto há na dungeon;
`Rref` = referência de pote cheio.

A raiz faz a fatia crescer rápido no começo e desacelerar depois: o pote nunca é
esvaziado de uma vez, nem fica travado numa fração ínfima.

> O resgate de followers é o que garante movimento na dungeon mesmo com o pote
> baixo — senão a moeda ficaria presa lá indefinidamente.

---

## 9. Mercado entre jogadores

Três formas de negociar, **todas com custódia**: o bot retém o que está em jogo
até a operação fechar ou ser cancelada. Sem isso, qualquer uma vira golpe.

### Marketplace — venda direta
```
&mercado vender <item> <preço> [moeda]
&mercado                       → lista as ofertas
&mercado comprar <n>
&mercado cancelar <n>
```
O item sai do inventário ao anunciar; moeda e item trocam de mão na compra.

### Balcão de câmbio
Oferta de moeda por moeda, com a **taxa que o jogador quiser**. A taxa do sistema
aparece ao lado como referência, para ninguém aceitar um câmbio ruim sem notar.

### Escambo — item por item
```
&trocar @pessoa <meu item> por <item dela>
```
Os dois confirmam; os dois itens ficam retidos durante a negociação.

### Taxa
```
taxa = taxaBase × (1 + k × √(volumeRecente ÷ volumeRef))
```
*Inicial:* `taxaBase = 0,5%`. Sobe com o volume recente, como custo de
congestionamento, e o arrecadado vai para o mercado.

> Nenhuma dessas operações cria ou destrói moeda — são transferências entre
> jogadores. O `P` não muda, então não há risco de inflação.

---

## 10. Conteúdo

### Genéricos e curados
O jogo nasce com um conjunto **genérico** de itens e followers, para rodar antes
de a curadoria terminar. Cada item/follower tem origem `generico` ou `curado`.

- Os genéricos cobrem todas as raridades e classes, para o balanceamento poder
  ser testado de verdade.
- `&admin item importar` / `&admin follower importar` acrescentam os curados a
  qualquer momento, sem parar o jogo.
- Os mais fracos são de **estoque infinito**, para todos conseguirem se equipar.
  Os raros continuam finitos.

**Conteúdo nunca é apagado, só descontinuado.** Descontinuar = para de aparecer
em drop e no mercado, mas quem já tem continua tendo. Apagar removeria o item da
mochila das pessoas.

**Exemplos de genéricos:**
- Itens: `Adaga Simples`, `Espada de Ferro`, `Cajado Rachado`, `Elmo Amassado`,
  `Poção Menor`, `Amuleto Opaco`.
- Followers: `Mercenário Novato`, `Aprendiz de Magia`, `Batedor Silencioso`,
  `Curandeira Errante`.

### Formatos para a curadoria
- **Followers:** `nome | classe | raridade | fonte | magia`
- **Fotos:** `nome do follower | url`
- **Itens:** `nome | slot | raridade | +atributos | fonte`
- **Moedas:** `nome | símbolo | finita? | suprimento base | dificuldade`

Listas parciais já bastam para modelar o banco e as fórmulas.

---

## 11. Restrições técnicas

- **Timers só por timestamp no banco.** O bot reinicia (watchdog), então
  cooldown, energia e tempo de recuperação guardam "quando começou" e comparam
  com agora — nunca `setTimeout` em memória.
- **Sem eventos de voz** na plataforma.
- **Balanceamento configurável:** todos os multiplicadores e taxas ficam em
  config, ajustáveis sem reescrever código.
- **Servidor pequeno:** com poucos jogadores, um sozinho move o P. Por isso o
  `mult(P)` tem MIN/MAX e o P é suavizado.

---

## 12. Faseamento

| Fase | Conteúdo |
|---|---|
| **A — Personagem** | criar, ficha, 9 atributos, XP/nível, pontos livres |
| **C — Itens** | slots, equipar, bônus, conjunto genérico |
| **B — Missões** | resolução automática, 3 desfechos, loot, cooldown |
| **D — Followers** | recrutar, classes, magias, energia, álbum, co-op |
| **E — Economia** | moedas, funções P, câmbio, dungeon, resgate |
| **F — Mercado** | marketplace, balcão P2P, escambo |

**Ordem de trabalho: A → C → B → D → E → F.**
Itens antes de missões (loot precisa de item para entregar); mercado por último
(precisa de itens e moedas prontos).
