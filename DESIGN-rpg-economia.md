# Design — Sistema de RPG + Economia (Cobaia)

> Documento consolidado. Decisões já tomadas estão em **Decidido**; o que falta
> está em **Pendente**. Combate é 100% automático (por cálculo).

---

## 1. Visão geral

- **RPG**: cada jogador tem um personagem com 9 atributos, monta uma party
  (ele + até 2 followers NPCs), e envia a party em missões. Missões dão XP,
  itens e moeda.
- **Economia**: moedas configuráveis (inspiradas em cripto), obtidas em missões
  e trocadas num mercado auto-regulado por concentração (P).
- **Combate**: resolvido de uma vez, por cálculo probabilístico. Sem turnos.

---

## 2. Atributos do personagem (9) — DECIDIDO

| Atributo | Efeito |
|---|---|
| Força | dano físico |
| Destreza | precisão (reduz chance de errar) |
| Resistência | defesa física e mágica |
| Agilidade | evasão |
| Vida | HP |
| Mana | mana (limita magias) |
| Inteligência | dano mágico |
| Sorte | +dinheiro, +drop, +sobrevivência |
| Carisma | aumenta os atributos dos companheiros de party |

- **Distribuição**: híbrida — base sobe automática por nível + **pontos livres**
  que o jogador distribui (build).
- **Cálculo de missão usa a party inteira** (player + followers), não só o player.
- **NPCs também têm Carisma** e contribuem para o buff coletivo da party.

---

## 3. Followers — DECIDIDO (curadoria do Ghieh)

- Party = player + até **2 followers NPCs**. (Não é multiplayer entre humanos —
  **PENDENTE confirmar** que é isso mesmo.)
- Followers vêm de uma **lista curada por você**: foto, nome, classe.
- Equipáveis com os mesmos slots do player.
- Status sobem **automaticamente** conforme a classe.
- 4 classes: **Mago** (dano mágico), **Tank** (resistência), **Combatente**
  (dano físico), **Suporte** (Sorte/Carisma + um pouco de magia).
- Cada follower traz uma magia conforme a classe.
- **Recrutamento**: mercenários (comprados) ou drop de dungeon. Dispensado → vira
  mercenário disponível.

---

## 4. Magias — DECIDIDO

- **Ataque**: aumenta a probabilidade de **êxito** da missão.
- **Suporte**: aumenta a probabilidade de **sobrevivência** da party.
- Custo em **Mana**.
- **Player aprende magias** fazendo missões ou comprando itens (não vem pronto).
- Followers já trazem a magia da classe.

---

## 5. Missões — DECIDIDO (com pendências pontuais)

3 dificuldades (**fácil / médio / difícil**), cada uma define loot (qualidade+
quantidade), risco base de morte e moeda esperada.

### Resolução (cálculo automático)
```
PoderDaEquipe = dano físico+mágico de toda a party, ajustado por Destreza
                (precisão) e magias de ATAQUE + bônus de Carisma
Resiliência   = Vida + Resistência + Agilidade (evasão) da party
                + magias de SUPORTE + bônus de Sorte
```
Duas rolagens → 3 desfechos:
- Êxito + sobrevive → **missão cumprida, todos vivos** (loot cheio).
- Falha + sobrevive → **não cumpriu, todos vivos** (loot parcial/nenhum).
- Falha na sobrevivência → **party morre** (só "perde de vez" quando TODA a party
  morre; membros caem individualmente mas a missão segue enquanto houver alguém).

### Limitador — DECIDIDO
- **Cooldown** nas 2 primeiras missões (anti-spam imediato).
- **Energia dos NPCs**: levar followers gasta energia deles. Isso permite **ir
  sozinho** (sem custo de energia, mas fraco e arriscado) vs **ir com party**
  (forte, mas gasta energia dos NPCs).
- **PENDENTE**: como a energia dos NPCs regenera (tempo? descanso pago? itens?).

### Custo de entrada — DECIDIDO
- Missões **fáceis são de graça** (para iniciantes).
- Missões **difíceis têm custo de entrada** que **escala com o valor da moeda**,
  mas em **escala bem menor** que a perda por morte.

---

## 6. Equipamento — DECIDIDO

- Slots: **Armadura, Capacete, Arma, Acessório 1, 2, 3**.
- Itens dão bônus de atributo, com **raridade** (comum → lendário).
- **Itens de lista curada** (por você). Fonte: mercado (finito) e missões (ilimitado).

---

## 7. Economia — o mecanismo acoplado (DECIDIDO)

### Variável central: P (concentração da moeda)
**P = moeda em mãos dos players ÷ total (players + mercado).** A dungeon NÃO entra.
Cada moeda tem seu próprio P, em tempo real.

### Função 1 — Perda ao morrer (log → exp, nunca toca o eixo X)
```
perda(P) = piso + a·ln(1 + b·P) + c·(e^(d·P) − 1)
```
- `ln` domina perto de P=0 (sobe suave), `e` domina perto de P=1 (dispara).
- `piso` garante que sempre se perde algo (nunca zero).
- Player perde = (quanto carrega) × perda(P). Esse valor **vai para a dungeon**.

### Função 2 — Preço dos itens (inverso da perda)
```
preço(item) = (quantidadeBase / qtdItemNoMercado) × mult(P)
mult(P)     = MIN + (MAX − MIN)·(1 − perda(P))
```
- Escassez do item no mercado encarece.
- `mult(P)` é **inverso** à perda: P alto → itens baratos; P baixo → itens caros.

### Efeito (auto-regulação)
- **Players ricos (P alto):** itens baratos + morrer arriscadíssimo → pressão p/
  gastar, devolvendo moeda ao mercado.
- **Mercado cheio (P baixo):** itens caros + morrer barato → incentiva arriscar.
- **Não força vender a moeda finita** — só ajusta incentivos.

### Dungeon como reservatório — DECIDIDO
- O que o player carregava ao morrer **vai para a dungeon** (não some).
- A dungeon **devolve de forma parcial** para quem a vence (não tudo de uma vez).
- Acumula de vários mortos até alguém vencer.
- Efeito: moeda finita **não deflaciona** — é realocada, não destruída.
- **PENDENTE**: qual a fração devolvida, e o que acontece com o restante (fica
  na dungeon para a próxima vitória? volta ao mercado aos poucos?).

### Moedas configuráveis (admin) — DECIDIDO
Dono/admin cria moedas com: nome/símbolo, finita/infinita, suprimento base (se
finita), dificuldade de obtenção em missão, quantidade base no mercado/dungeon.

### Câmbio entre moedas — DECIDIDO
- **Câmbio direto** entre moedas (troca uma pela outra).
- A taxa sai do valor implícito de cada moeda (derivado do P e do suprimento).
- **PENDENTE**: confirmar se o câmbio também tem um custo/spread (para não virar
  loop de arbitragem grátis).

---

## 8. Reestruturação — DECIDIDO

Nova organização em 4 áreas (+ core):
```
modulos/
├── core/          (db, config, log)
├── ai/            (chat, rss)
├── ferramentas/   (NOVO: nível-XP de chat, reaction-roles, autorole)
├── moderacao/     (automod, kick/ban… sem reaction-roles/nível)
└── game/          (RPG + economia)
```
- O **XP-por-mensagem** atual (`game/game.js`) vira `ferramentas/nivel.js`.
- **reaction-roles** migra de `moderacao/` para `ferramentas/`.
- **PENDENTE**: "autorole" (cargo automático a quem entra no servidor) — é recurso
  **novo** a construir, ou você quis dizer o reaction-roles existente?
- **PENDENTE**: RSS fica em `ai/` (depende da IA) ou força para `ferramentas/`?

---

## 9. Restrições técnicas que moldam o design

- **Timers só por timestamp no banco.** O bot reinicia (watchdog), então cooldown,
  energia e "tempo de reviver" guardam "quando começou" no banco e comparam com
  agora — nunca `setTimeout` em memória.
- **Sem eventos de voz** (já sabido).
- **Balanceamento configurável**: todos os multiplicadores/taxas ficam em config
  para ajuste sem reescrever código.
- **Servidor pequeno**: com poucos players, um sozinho move o P todo. **PENDENTE**:
  âncoras de preço mín/máx para o mercado não quebrar?

---

## 10. Pendências abertas (resumo)

1. Party é só player + NPCs (não multiplayer entre humanos)?
2. Energia dos NPCs regenera como?
3. Fração que a dungeon devolve, e destino do restante?
4. Câmbio tem spread/custo (anti-arbitragem)?
5. Âncoras de preço para servidor pequeno?
6. "Autorole" é recurso novo ou é o reaction-roles?
7. RSS fica em `ai/` ou vai para `ferramentas/`?
8. Player morre "de vez" ou só os followers? (revive como?)

---

## 11. Faseamento

- **Fase 0 — Reestruturação** (nível-XP e reaction-roles → `ferramentas/`).
- **Fase A — Personagem**: criar, ficha, 9 atributos, XP/nível de RPG, pontos livres.
- **Fase B — Missões**: resolução automática, 3 desfechos, loot simples, cooldown.
- **Fase C — Itens e inventário**: slots, equipar, bônus.
- **Fase D — Followers e party**: recrutar, classes, magias, energia dos NPCs.
- **Fase E — Economia**: moedas, funções P (perda/preço), câmbio, dungeon-reservatório.

---

## 12. Curadoria (fica com você)

Formatos úteis:
- **Followers**: `nome | classe | raridade | fonte (mercenário/dungeon) | magia`
- **Itens**: `nome | slot | raridade | +atributos | fonte (mercado/missão)`
- **Moedas**: `nome | símbolo | finita? | suprimento base | dificuldade de ganho`

Mesmo listas parciais já permitem modelar o banco e as fórmulas.
