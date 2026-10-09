# Comandos do RPG (v4)

Todos começam com `&game`. Em inglês valem os mesmos comandos e os nomes em
inglês dos itens e personagens ("buy Iron Sword" acha a "Espada de Ferro").
`<…>` é obrigatório e `[…]` é opcional.

## Personagem

| comando | o quê |
|---|---|
| `&game criar [nome]` | cria o personagem, com o kit inicial (uma vez por pessoa) |
| `&game` | a sua ficha: nível, barra de progresso, atributos, força, equipamento e chance no próprio nível |
| `&game ficha @pessoa` | a ficha de outra pessoa |
| `&game pontos <atributo> [quantos]` | gasta pontos livres (`for`, `des`, `res`, `agi`, `vida`, `mana`, `int`, `sor`, `car`) |
| `&game resetar pontos confirmar` | respec: devolve os pontos gastos, pagando |
| `&game classe [nome]` | lista as 8 classes ou escolhe uma (Guerreiro, Duelista, Atirador, Mago, Guardião, Templário, Andarilho, Bardo) |
| `&game evoluir` | gasta os pontos e equipa o melhor da mochila, conforme a classe |
| `&game evoluir prever` | mostra o que faria, sem gravar |
| `&game evoluir pontos` / `equipar` | faz só uma das duas coisas |
| `&game evoluir auto on` / `off` | evolui sozinho a cada nível novo e quando entra item |
| `&game evoluir refazer` | o mesmo que `resetar pontos` |
| `&game top` | ranking do mundo (nível e progresso) |
| `&game apagar confirmar` | apaga o personagem; as esperas e as recompensas únicas continuam |

## Equipamento e itens

| comando | o quê |
|---|---|
| `&game itens` | a mochila |
| `&game equipar <item> [mao1\|mao2]` | equipa. Uma arma sozinha vai nas duas mãos; o escudo vai na mão 2; o implante de cyberware substitui o da mesma região do corpo |
| `&game usar <contrato>` | o contrato vira o companheiro (um de cada por jogador) |
| `&game usar <pergaminho>` | o pergaminho vira magia no grimório |
| `&game desequipar <vaga>` | `mao1`, `mao2`, `cabeca`, `corpo`, `acessorio1-3`, `bio1-3`, `ciber1-3` |
| `&game catalogo [raridade\|vaga\|obra]` | o catálogo inteiro, por raridade, vaga ou obra |
| `&game item <nome>` | ficha do item: dano ou defesa, requisitos, preço e imagem |
| `&game comprar [raridade\|item]` | compra do NPC (os únicos ✦ não são vendidos) |
| `&game vender <item>` | vende ao NPC (os únicos não são aceitos) |
| `&game magias` · `&game magia <nome>` | o grimório (as magias pedem Inteligência) |
| `&game aprender <nome> [com <moeda>]` | compra uma magia |

## Missões e lutas

| comando | o quê |
|---|---|
| `&game contratos [1-10]` | o quadro da guilda (pago pelo banco), com a chance de cada um; o número escolhe a dificuldade |
| `&game contrato <nome>` | faz um contrato (45 min de espera depois) |
| `&game bico` / `&game bico <nome>` | serviço sem risco: paga 10%, sem Cristal, com 30 min de espera |
| `&game especiais` · `&game especial <nome>` | missão especial com recompensa única no primeiro êxito (2 h entre tentativas até lá) |
| `&game dungeons` | as dungeons, com o estado do tesouro e os companheiros capturados |
| `&game dungeon <nome>` | um encontro no seu nível, pago pelo tesouro dela |
| `&game dungeon <nome> chefe` | o chefe da dungeon |
| `&game chefes` · `&game chefe <nome>` | chefes com nome: 24 h por pessoa e recompensa única; 🔒 = vença o ato anterior antes |
| `&game historia` | a história da sua última luta |

### Co-op (até 4 pessoas)

| comando | o quê |
|---|---|
| `&game coop abrir <contrato>` | abre um grupo no canal |
| `&game coop abrir dungeon <nome>` / `chefe <nome>` / `especial <nome>` | o mesmo, para dungeon, chefe ou especial |
| `&game coop entrar` · `&game coop sair` | entra ou sai do grupo |
| `&game coop partir` | o líder parte agora (com 4, parte sozinho; expira em 10 min) |
| `&game coop cancelar` | o líder cancela |

## Companheiros

| comando | o quê |
|---|---|
| `&game followers` | os seus companheiros, na party (até 2) e fora dela |
| `&game follower ficha <nome>` | atributos (sobem com o seu nível), magia, ataque e defesa, com imagem |
| `&game follower levar <nome>` / `tirar <nome>` | põe na party ou tira dela |
| `&game follower dispensar <nome>` | dispensa |
| `&game follower foto <nome>` | a imagem do companheiro |
| `&game recrutas` | quem existe (💰 contratável · 🗝️ loot · ✦ único) |
| `&game contratar <nome>` | contrata um mercenário genérico (os com nome vêm de contrato) |
| `&game descansar` | a energia dos companheiros (volta 1 por hora) |

## Moedas e comércio

| comando | o quê |
|---|---|
| `&game carteira` | os saldos e o estado do mercado |
| `&game cambio <qtd\|tudo> <moeda> para <moeda>` | troca com o banco |
| `&game cambio <qtd> <moeda> por <qtd> <moeda>` | oferta para outro jogador |
| `&game cambio taxas` | as taxas do banco agora |
| `&game mercado` | o bazar entre jogadores |
| `&game mercado vender <item> <preço>` · `comprar <#>` · `cancelar <#>` | anuncia, compra ou retira |
| `&game trocar @pessoa <seu item> por <item dela>` · `trocar aceitar <#>` | escambo |

## Dono do bot (`&game admin …`)

| comando | o quê |
|---|---|
| `admin teste` | roda o jogo inteiro num personagem descartável (sem mexer no banco nem nos tesouros) |
| `admin imagem` | quantas imagens existem e a lista do que falta, com os ids |
| `admin imagem <id ou nome>` + imagem anexada | liga a imagem (veja `IMAGENS.md`) |
| `admin imagem <id ou nome> <link>` · `… remover` | por link, ou tira |
| `admin simular <contrato\|chefe> [n]` | roda n vezes sem efeito e mostra as taxas |
| `admin eco` | os números das moedas: banco, P e os tesouros das dungeons |
| `admin dungeon <qtd> [dungeon]` | põe Ouro no tesouro de uma dungeon |
| `admin dar <qtd> [@pessoa]` | credita moeda |
| `admin item <nome> [@pessoa]` | dá um item (ex.: `admin item c_f_tes_serana`) |
| `admin follower <nome> [nível] [@pessoa]` | dá um companheiro |
| `admin nivel <n> [@pessoa]` · `admin pontos <n> [@pessoa]` | força o nível ou dá pontos |
| `admin energia [@pessoa]` · `admin cooldown [@pessoa]` | enche a energia ou zera as esperas (inclusive a de 24 h do chefe) |
| `admin missao <contrato>` | zera a sua espera e faz o contrato na hora |
| `admin moeda` · `admin moeda ver <id>` · `admin moeda set <id> <campo> <valor>` | as duas moedas do mundo |
| `admin reset <mundo\|catalogo\|tudo> confirmar` | recomeça do zero (**não tem volta**) |

## Para testar em campo (ordem sugerida)

```
&game admin teste
&game                     ← a ficha migrada (nível 2n − 1)
&game contratos
&game classe guerreiro
&game evoluir prever
&game evoluir
&game contrato <um da lista>
&game historia
&game dungeons
&game dungeon <nome>
&game chefes
&game admin simular <contrato> 200
&game admin imagem
```

Para testar um chefe com nome sem esperar o nível: `&game admin nivel 50`,
depois `&game chefe Harkon`, depois `&game admin nivel <o seu de volta>`.
