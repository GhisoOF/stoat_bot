# Guia — moedas do RPG

Configuração para seis moedas inspiradas em BRL, USD, EUR, prata (XAG), ouro
(XAU) e Bitcoin.

---

## 1. O problema da escala

A razão de valor no mundo real é extrema demais para copiar direto:

| Moeda | Valor real (BRL = 1) |
|---|---|
| BRL | 1× |
| USD | 6× |
| EUR | 6× |
| XAG (prata) | 167× |
| XAU (ouro) | 14.444× |
| BTC | 527.778× |

Se o `dificuldade` do BTC fosse 527.778, ele **nunca** apareceria (chance de
0,0002%) e renderia sempre 1 unidade — o piso da fórmula. A moeda existiria só
no papel.

A saída é **comprimir a escala** mantendo a ordem: cada degrau continua
claramente acima do anterior, mas todos permanecem alcançáveis.

---

## 2. Configuração recomendada

| Moeda | `dificuldade` | `nivelMin` | `finita` | referência | Papel |
|---|---|---|---|---|---|
| 🇧🇷 BRL | 1 | 1 | ♾️ não | 200.000 | moeda do dia a dia |
| 💵 USD | 5 | 1 | ♾️ não | 40.000 | moeda forte comum |
| 💶 EUR | 6 | 3 | ♾️ não | 30.000 | levemente acima do dólar |
| 🥈 XAG | 45 | 5 | ♾️ não | 9.000 | metal: geração lenta |
| 🥇 XAU | 200 | 12 | ♾️ não | 2.000 | metal: geração muito lenta |
| ₿ BTC | 400 | 18 | 🔒 **sim** | **210** | única com teto real |

### Por que quase todas são infinitas

**Fiat não acaba:** banco central imprime. **Metal também não, na prática:**
ninguém sabe quanto ouro ainda há no subsolo — o que existe é uma taxa de
extração, não um estoque conhecido que se esgota.

Então o que separa o Real do Ouro no jogo **não é estoque, é velocidade de
geração** — o campo `dificuldade`. Ouro tem dificuldade 200 contra 1 do Real:
aparece 200× menos e rende 200× menos por vez.

**O Bitcoin é a única exceção** e continua finito, porque o teto de 21 milhões é
real. Quando o suprimento acaba, ele só volta a circular se alguém gastar.

> Em moeda infinita, o campo `mercado` deixa de ser estoque e vira **volume de
> referência**: é contra ele que o `P` mede a concentração. Não use valores
> muito baixos — o P travaria perto de 100% e os preços ficariam no extremo.

### Por que esses valores

**`dificuldade`** controla duas coisas ao mesmo tempo: com que frequência a moeda
aparece e quantas unidades saem. Com a tabela acima, numa missão difícil de nível
22 sai algo como:

| Moeda | Unidades por missão |
|---|---|
| BRL | ~98.000 |
| USD | ~19.600 |
| EUR | ~16.400 |
| XAG | ~4.900 |
| XAU | ~1.090 |
| BTC | ~246 |

**`nivelMin`** escalona o acesso. Ninguém encontra ouro ou BTC no começo — eles
só entram no jogo conforme o servidor amadurece.

**`suprimentoBase` do BTC = 210** é o detalhe mais importante da configuração.
O pagamento é limitado pelo que o mercado tem: se o mercado só possui 210 BTC e
a missão pagaria 246, o jogador recebe o que houver e o restante **acaba**. Isso
reproduz o teto de 21 milhões do Bitcoin numa escala jogável — o BTC vira
genuinamente escasso, e só volta a circular quando alguém o gasta de volta ao
mercado.

### Frequência resultante

| Nível da missão | Distribuição |
|---|---|
| 3 | BRL 74% · USD 14% · EUR 12% |
| 8 | BRL 71% · USD 14% · EUR 12% · XAG 4% |
| 14 | BRL 70% · USD 14% · EUR 12% · XAG 3% · XAU 0,8% |
| 22 | BRL 70% · USD 14% · EUR 12% · XAG 3,5% · XAU 0,8% · **BTC 0,2%** |

BTC aparece em 1 de cada 500 missões de nível alto. É o tipo de drop que vira
assunto no servidor quando acontece.

---

## 3. O atalho

Tudo o que está descrito acima já vem pronto num conjunto:

```
&game admin moeda modelo mundo
```

Um comando cria as seis moedas com estes mesmos valores. As seções abaixo
continuam valendo se você quiser ajustar algo ou entender as escolhas.

---

## 3.1 Comandos (copiar e colar)

```
&game admin moeda criar brl Real 🇧🇷
&game admin moeda set brl suprimentoBase 200000
&game admin moeda set brl mercado 200000
&game admin moeda padrao brl

&game admin moeda criar usd Dólar 💵
&game admin moeda set usd dificuldade 5
&game admin moeda set usd suprimentoBase 40000
&game admin moeda set usd mercado 40000

&game admin moeda criar eur Euro 💶
&game admin moeda set eur dificuldade 6
&game admin moeda set eur nivelMin 3
&game admin moeda set eur suprimentoBase 30000
&game admin moeda set eur mercado 30000

&game admin moeda criar xag Prata 🥈
&game admin moeda set xag dificuldade 20
&game admin moeda set xag nivelMin 5
&game admin moeda set xag suprimentoBase 8000
&game admin moeda set xag mercado 8000

&game admin moeda criar xau Ouro 🥇
&game admin moeda set xau dificuldade 90
&game admin moeda set xau nivelMin 12
&game admin moeda set xau suprimentoBase 1200
&game admin moeda set xau mercado 1200

&game admin moeda criar btc Bitcoin ₿
&game admin moeda set btc dificuldade 400
&game admin moeda set btc nivelMin 18
&game admin moeda set btc suprimentoBase 210
&game admin moeda set btc mercado 210
```

Depois confira com:

```
&game admin moeda
```

> ⚠️ O servidor já tem a moeda **Ouro** (`ouro`) criada automaticamente. Ela
> colide de nome com o XAU. Antes de rodar o guia, decida: ou remove
> (`&game admin moeda remover ouro confirmar` — apaga os saldos), ou renomeia
> (`&game admin moeda set ouro nome Moeda Antiga`) e usa outro id para o XAU.

---

## 4. O que observar depois

**O câmbio entre elas funciona sozinho.** A taxa deriva do P de cada moeda, então
uma moeda escassa vale mais em relação às outras — sem tabela fixa. Os jogadores
também podem abrir ofertas no balcão com a taxa que quiserem
(`&game cambio 100 brl por 1 usd`).

**O BTC vai secar rápido.** Com suprimento 210 e missões pagando ~246, os
primeiros achados esgotam o mercado. Isso é intencional, mas vale acompanhar: se
ninguém mais vir BTC durante semanas, aumente o `suprimentoBase` ou reduza o
`dificuldade`.

**A moeda padrão é a que o mercado usa** para preços de itens e mercenários.
Deixar o BRL como padrão faz os preços aparecerem em números grandes (milhares),
o que é temático — mas se preferir números redondos, use o USD como padrão.

**Nada disso é definitivo.** Todos os campos são ajustáveis por comando a
qualquer momento, sem tocar em código e sem zerar nada.

---

## 5. Variação mais realista (opcional)

Se quiser que as proporções fiquem mais próximas da realidade, aceitando que as
moedas de topo sejam bem mais raras:

```
&game admin moeda set xag dificuldade 40
&game admin moeda set xau dificuldade 300
&game admin moeda set btc dificuldade 1500
&game admin moeda set btc nivelMin 22
```

Com isso o BTC cai para ~0,05% das missões (1 em 2.000) e rende ~65 unidades.
Mais fiel, porém mais frustrante — a maioria dos jogadores nunca veria um.
