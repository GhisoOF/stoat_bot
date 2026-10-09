# RPG v4 — documentação

O plano do rebalanceamento e do conteúdo do RPG (decisões D1–D28) e o que foi
aplicado no jogo, na branch `rpg-v4` (9 out 2026).

| arquivo | o quê |
|---|---|
| [`PLANO-RPG-CONTEUDO.md`](PLANO-RPG-CONTEUDO.md) | regras, escala, equipamento, curvas, migração e as decisões D1–D28 |
| [`CATALOGO-GENERICO.md`](CATALOGO-GENERICO.md) | o conteúdo genérico das 10 dificuldades |
| [`COMPANHEIROS-RPG.md`](COMPANHEIROS-RPG.md) | companheiros com nome (Serana, J'zargo, Ebony Warrior, Rize, Tryce) |
| [`CHEFES-RPG.md`](CHEFES-RPG.md) | chefes com nome (Horus em dois atos, Harkon, Ebony Warrior, Rize e o Dragão, Tryce) |
| [`ESPECIAIS-E-HISTORIAS.md`](ESPECIAIS-E-HISTORIAS.md) | missões especiais e o algoritmo de história |
| [`ARMAS-WARHAMMER-40K.md`](ARMAS-WARHAMMER-40K.md) | as 68 armas de Warhammer 40,000 |
| [`IMPLANTES-E-EVOLUCIONADOR.md`](IMPLANTES-E-EVOLUCIONADOR.md) | bioware, cyberware e o evolucionador automático |
| [`ECONOMIA-E-DUNGEONS.md`](ECONOMIA-E-DUNGEONS.md) | quem paga (banco × tesouro da dungeon) e as dungeons temáticas |
| [`COMANDOS.md`](COMANDOS.md) | todos os comandos do jogo (jogador e dono) e a ordem para testar em campo |
| [`IMAGENS.md`](IMAGENS.md) | como pôr as imagens dos personagens, chefes e dungeons (fora do repositório) |

Os números saem de `scripts/balanceamento-rpg.mjs`, que importa as fórmulas do
jogo (`modulos/game/regras.js`) — o script e o bot usam a mesma conta.

```sh
node scripts/balanceamento-rpg.mjs tudo
node scripts/balanceamento-rpg.mjs ficha "<tier>" "<atributo=★,...>" [níveis] [classe]
```

## Onde está no código

| arquivo | o quê |
|---|---|
| `modulos/game/regras.js` | todas as fórmulas (faixas, raridades, armas, implantes, party, missões, folga, moeda) |
| `modulos/game/conteudo/*.json` | o catálogo: genéricos, implantes, obras (Warhammer 40K, Skyrim, Tokyo Ghoul, Bomb Rush Cyberfunk), especiais, trechos de história |
| `modulos/game/conteudo.js` | monta itens, companheiros, magias, contratos, especiais, chefes e dungeons a partir dos JSON |
| `modulos/game/combate.js` | a party de verdade (banco → membros da luta) |
| `modulos/game/aventura.js` | contratos, bicos, especiais, dungeons, chefes, co-op e o texto do resultado |
| `modulos/game/tesouro.js` | banco e tesouro das dungeons |
| `modulos/game/historia.js` | a história de cada luta |
| `modulos/game/evolucionador.js` | `&game classe` / `&game evoluir` |
| `modulos/game/migracao.js` | a migração D13 (roda uma vez, na subida) |
| `modulos/game/imagens.js` | as imagens (link no banco, não no repositório) |

Testes: `node testes.mjs rpg-v4` (e as suítes antigas do jogo, atualizadas).

Deploy: `scripts/deploy-stoat.sh` (no PC: confere se o zip foi feito sobre o
`main` de agora e envia) e `scripts/atualizar-minipc.sh` (no MiniPC: backup do
banco com o container parado, `git pull`, build e o log da subida, inclusive
a linha da migração).

## Comandos novos

`&game contratos` · `&game bico` · `&game especiais` · `&game chefes` ·
`&game dungeons` / `&game dungeon <nome> [chefe]` · `&game historia` ·
`&game classe <classe>` · `&game evoluir [prever|pontos|equipar|auto on|auto off|refazer]` ·
`&game usar <contrato|pergaminho|item>` · `&game catalogo [raridade|slot|obra]` ·
`&game admin imagem [id] [link]` (dono do bot — veja `IMAGENS.md`).

## Escolhas feitas na integração (fora do plano)

- **Kit inicial.** As missões são calibradas para a party de referência
  (arma, cabeça, corpo, acessórios e dois companheiros). Um personagem novo sem
  nada tinha ~5% numa missão do nível 1. Agora ele começa com Espada de Ferro,
  Elmo Amassado, Túnica Puída, Amuleto Opaco, 2 Cordões de Couro e dois
  companheiros (Mercenário Novato e Guarda Bisonho) — ~36% / 65% no próprio
  nível. Fácil de mudar em `KIT_INICIAL` (`modulos/game/game.js`).
- **Bico** paga 10% do progresso de um êxito no próprio nível e 10% do alvo de
  Ouro, sem Cristal, com 30 min de espera (metade do que um contrato rende por
  hora — com 10 min, rendia mais que o contrato).
- **No máximo 2 níveis por vitória** — senão um nível 1 carregado no co-op por
  um chefe do nível 60 pulava para o 51.
- **O kit inicial é um por pessoa**; apagar o personagem não zera as esperas
  (chefe 24 h, especial) nem as recompensas únicas.
- **A migração** roda numa transação só (com a marca); se falhar, o `&game`
  fica fechado ("em manutenção") em vez de jogar o v4 em cima dos dados antigos.
- **`&game admin teste`** luta de verdade, mas não recebe do banco nem dos
  tesouros e não resgata companheiro de ninguém.
- **Buff de Carisma** vem só do jogador (como no script que calibrou as curvas).
- **`bonusXp`** saiu: o XP é a força da missão, igual para todos (D6).

## Pendente

- **Senhor da Guerra Ork** (Armageddon, nível 50): `[DECIDIR]` em
  `ECONOMIA-E-DUNGEONS.md`. Está com os números de um chefe genérico do nível
  50 e sem recompensa única.
- As armas Ork ainda não entraram.
- As imagens: o código está pronto (`IMAGENS.md`); falta o dono enviar cada uma.
- `&game admin moeda set … dificuldade|nivelMin`: no v4 o pagamento segue o
  nível e o estoque; esses campos só aparecem na ficha da moeda.
