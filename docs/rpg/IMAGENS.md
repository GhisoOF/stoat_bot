# Imagens do RPG

As imagens **não vão para o repositório**, porque ele é público (decisão do
plano, §3.4). O arquivo fica no Stoat, e o link fica no banco do bot
(config `__rpg_imagens__`). Ele não é apagado por um deploy nem pelo
`&game admin reset catalogo`.

## Como pôr uma imagem

1. Crie um canal privado no seu servidor, só para a arte do jogo (por exemplo
   `#arte-rpg`). A Judy precisa ver esse canal.
2. Mande a imagem nesse canal e escreva o comando **na mesma mensagem**:
   ```
   &game admin imagem Serana
   ```
   Você pode usar o nome (PT ou EN, sem precisar de acento) ou o id
   (`f_tes_serana`). Quando o nome se repete (o Ebony Warrior é companheiro e
   chefe), o nome pega o companheiro, e o chefe vai pelo id
   (`b_tes_ebony_warrior`).
3. A Judy responde **"🖼️ Imagem salva"** com a imagem como capa. Se ela
   aparecer, está pronta. Se não aparecer, o Stoat recusou a imagem; nesse
   caso, mande o arquivo no próprio Stoat em vez de usar um link de fora.

**Não apague a mensagem com a imagem**: o link aponta para aquele anexo.

### Outros comandos

| comando | o quê |
|---|---|
| `&game admin imagem` | quantas já têm imagem e a lista do que falta, com os ids |
| `&game admin imagem <id ou nome>` | mostra a imagem atual |
| `&game admin imagem <id ou nome> <link>` | usa um link em vez de um anexo |
| `&game admin imagem <id ou nome> remover` | tira a imagem |

Um link de outro site (que não seja o Stoat) **não vira capa**: aparece como
um link escondido. Além disso, o dono desse site vê o IP de quem abre a
mensagem. Por isso, prefira sempre o anexo.

## O que pede imagem

O que tem nome: 6 companheiros, 18 chefes, 7 missões especiais, 12 dungeons e
os itens únicos. O `&game admin imagem` lista todos. Os genéricos (60
companheiros e os itens comuns) usam emoji, mas também aceitam imagem pelo id.

| id | o quê |
|---|---|
| `f_tes_serana`, `f_tes_jzargo`, `f_tes_ebony_warrior` | Serana, J'zargo, Ebony Warrior |
| `f_tg_rize`, `f_brc_tryce`, `f_e_revisora` | Rize, Tryce, a Revisora |
| `b_tes_harkon`, `b_tes_ebony_warrior` | Lorde Harkon, Ebony Warrior (chefe) |
| `b_tg_rize`, `b_tg_dragao` | Rize (chefe) e o Dragão |
| `b_wh40k_horus_cerco`, `b_wh40k_horus_rei` | Horus Lupercal, atos I e II |
| `b_wh40k_senhor_guerra_ork`, `b_brc_tryce` | Senhor da Guerra Ork, Tryce (chefe) |
| `dg_tes_volkihar`, `dg_wh40k_armageddon` | as dungeons das obras |

## Onde aparece

- **Ficha do companheiro** (`&game follower ficha <nome>`): a imagem dele.
- **Ficha do item** (`&game item <nome>`): a do item. O contrato usa a imagem
  do companheiro.
- **Resultado da luta**: contra um chefe ou numa especial, aparece a imagem
  dele ou dela. Num encontro de dungeon, aparece a da dungeon. Se não houver
  nenhuma dessas, aparece a do item único que saiu.

## Tamanho

PNG, JPG ou WebP, de 512 a 1024 px de largura, com poucos MB. O Stoat mostra a
capa larga, então retrato ou quadrado funcionam melhor que paisagem estreita.

## Alternativa: link no JSON

Um objeto de `modulos/game/conteudo/*.json` pode trazer `"imagem": "<link>"`.
Ele serve de padrão, e o que o dono definir pelo bot vale por cima. Só use isso
para imagens que podem ficar públicas.
