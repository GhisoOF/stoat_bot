# Guia — moedas do RPG

Desde 1 out 2026 o RPG é **um mundo só**: o mesmo personagem, mercado,
dungeon e ranking em todos os servidores onde a Judy está. E o mercado do jogo tem
**duas moedas, fixas**:

| Moeda | Tipo | O que significa |
|---|---|---|
| 🪙 Ouro (`ouro`) | ♾️ infinita | O dinheiro do dia a dia. As missões geram quanto for preciso; o suprimento (200 000) é só a referência do P. |
| 💎 Cristal (`cristal`) | 🔒 finita | Existem 5 000, para sempre. Cai 40× menos nas missões (só do nível 5 para cima) e rende 40× menos — então 1 Cristal vale ~40 Ouro no câmbio do banco. Quando o banco esgota, só circula entre jogadores. |

## O que o dono do bot pode ajustar

`&game admin moeda set <id> <campo> <valor>` (vários de uma vez: `campo=valor`):

- `nome`, `simbolo` — como a moeda aparece;
- `dificuldade` — o quanto ela é rara nas missões **e** quanto rende por vez;
- `nivelMin` — só cai em missões desse nível para cima;
- `mercado` — o que o banco tem agora; `suprimentoBase` — o total de referência.

O **tipo** (finita ou infinita) não muda, e não dá para criar nem apagar
moedas: é isso que define o mundo.

## As contas

- **P** = quanto da moeda está com os jogadores, comparado ao que o banco tem.
  P alto (jogadores ricos) → itens baratos, mas cair custa caro; P baixo → o
  contrário. Ninguém precisa ajustar nada.
- **Câmbio do banco** segue a razão das reservas (`mercado`) das duas moedas,
  com 3% de taxa. Com 200 000 Ouro e 5 000 Cristal, 1 Cristal ≈ 39 Ouro.
- **Finita** paga do estoque do banco: se o banco não tem, não paga. O que os
  jogadores gastam volta ao banco.
- **Moedas inteiras** (4 out 2026): ninguém tem "0,18 Ouro". O banco entrega o
  máximo de unidades inteiras e cobra só o que elas custam; preço em outra moeda
  arredonda para cima; o que o jogador recebe arredonda para baixo.
  `&game cambio tudo ouro para cristal` (ou sem a quantidade) troca o saldo todo.
- **Pote da dungeon**: o Ouro perdido nas quedas vai para o pote; quem vence uma
  missão de dungeon leva 25% do prêmio (Fácil), 60% (Médio) ou tudo (Difícil).
- **Folga de nível**: cada nível acima da missão fecha 1/6 do que falta para
  100% — com 6 níveis de folga, a missão é garantida.

## Recomeçar

`&game admin reset mundo confirmar` apaga o progresso de todos, em todos os
servidores, e recria as duas moedas com o banco cheio. Os itens e companheiros
curados (`&game admin reset catalogo`) são outra coisa.
