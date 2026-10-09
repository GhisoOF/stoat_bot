# Guia — moedas do RPG

Desde 1 out 2026 o RPG é **um mundo só**: o mesmo personagem, mercado,
dungeon e ranking em todos os servidores onde a Judy está. E o mercado do jogo tem
**duas moedas, fixas**:

| Moeda | Tipo | O que significa |
|---|---|---|
| 🪙 Ouro (`ouro`) | ♾️ infinita | O dinheiro do dia a dia. Só o tesouro das dungeons cria Ouro novo; o suprimento (200 000) é só a referência do P. |
| 💎 Cristal (`cristal`) | 🔒 finita | Começa com 5 000 no banco; só o tesouro das dungeons cria Cristal novo, devagar. Cada êxito paga ¼ do valor em Cristal (1 Cristal ≈ 40 Ouro), arredondado pela sorte. Quando o banco esgota, só circula entre jogadores. |

## O que o dono do bot pode ajustar

`&game admin moeda set <id> <campo> <valor>` (vários de uma vez: `campo=valor`):

- `nome`, `simbolo` — como a moeda aparece;
- `dificuldade`, `nivelMin` — eram o ritmo de cada moeda nas missões; no RPG v4
  o pagamento segue o nível da missão e o estoque (banco ou tesouro), e esses
  dois campos só aparecem na ficha;
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
- **Quem paga (RPG v4, 9 out 2026)**: o **contrato** da guilda paga do banco
  (não cria moeda); a **dungeon** paga do tesouro dela, que se renova no ritmo
  de quem joga lá (3 pagamentos por dia por jogador ativo, até 1,5× a
  capacidade) — a única fonte de moeda nova. Banco ou tesouro cheio paga mais,
  vazio paga menos: `alvo × 2x/(1+x)`. Metade do que se gasta no NPC volta ao
  banco; quem cai num contrato deixa a perda no banco, numa dungeon, no tesouro
  dela. O pote antigo foi dividido entre as dungeons genéricas.
- **Folga pela força**: a chance sobe com a força da party, nunca pelo nível —
  com 3× a força para a qual a missão foi feita, ela é garantida.
- Regras completas: [`docs/rpg/`](docs/rpg/README.md).

## Recomeçar

`&game admin reset mundo confirmar` apaga o progresso de todos, em todos os
servidores, e recria as duas moedas com o banco cheio. Os itens e companheiros
curados (`&game admin reset catalogo`) são outra coisa.
