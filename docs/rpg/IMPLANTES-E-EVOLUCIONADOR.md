# Bioware, cyberware e o evolucionador automático — RPG

Planejamento (8 out 2026). **Aplicado no jogo na branch `rpg-v4`** (9 out 2026) — veja `docs/rpg/README.md` para o que entrou e o que ficou pendente. As
regras de combate são as do `PLANO-RPG-CONTEUDO.md` §4; aqui ficam os
implantes (§1), o catálogo genérico deles (§2) e o evolucionador automático
(§3). Números de:

```sh
node scripts/balanceamento-rpg.mjs implantes       # tabela por raridade e quanto cada um rende
node scripts/balanceamento-rpg.mjs evolucionador   # as 8 classes no próprio nível
node scripts/balanceamento-rpg.mjs sinergia        # sinergia sem teto, com implantes
```

---

## 1. Bioware e cyberware (`D23`)

### 1.1 Vagas

**3 de bioware e 3 de cyberware**, só no jogador, além de cabeça, corpo, as
duas mãos e os três acessórios. Companheiros não usam implante nem
equipamento nenhum — eles já são um kit completo (D23 no plano).

### 1.2 Os dois tipos

| | 🦾 cyberware | 🧬 bioware |
|---|---|---|
| de onde vem | Cyberpunk (implantes por região do corpo: sistema operacional, braços, esqueleto, pele, sistema nervoso, olhos, circulatório, córtex, pernas), Fallout (implantes do Auto-Doc), Star Wars (braço e corpo cibernéticos) | The Witcher 3 (mutágenos vermelho/azul/verde, decocções, mutações), e todo o resto que é corpo mudado por dentro: enxertos, sangue de criatura, gene-seed, simbiontes |
| primitivo | prótese — gancho de pirata, perna de pau, placa de metal | **também é bioware**: mutágeno de lobo, sangue de troll, enxerto de curandeiro |
| valor | **fixo**: rende igual em qualquer build | **0,7 do fixo**, mas **escala (B)** com o atributo da cor e **ressoa** |
| requisito | **Resistência ≥ 5 × dificuldade** ("o corpo aguenta") | **Vida ≥ 5 × dificuldade** ("tolerância" — a toxicidade do Witcher) |
| abaixo do requisito | rende 40% (igual às armas) | rende 40% |
| limite | **uma peça por região** do corpo | nenhum além das 3 vagas |
| bom para | quem tem atributo baixo, build mista, iniciante | quem é especialista num atributo |

**Cores da bioware** (os três mutágenos do Witcher e um quarto para a mira):

| cor | escala com | ofensiva vira dano | reforço aumenta |
|---|---|---|---|
| 🔴 rubro | Força | corpo a corpo | ataque corpo a corpo (o vermelho do Witcher: poder de ataque) |
| 🟡 âmbar | Destreza | à distância | ataque à distância |
| 🔵 cerúleo | Inteligência | mágico | ataque mágico (o azul: intensidade dos sinais) |
| 🟢 verde | Vida | — (defensiva) | defesa (o verde: vitalidade) |

**Ressonância:** cada outra bioware da **mesma cor** soma **+25%** a esta
(duas iguais: ×1,25 cada; três: ×1,5 cada). No Witcher, cada habilidade da
mesma cor ao lado do mutágeno soma +100% ao bônus dele; aqui são três vagas,
então o passo é menor. É o contrapeso da sinergia: a bioware recompensa
**focar uma cor**, a sinergia recompensa **misturar tipos de dano**.

### 1.3 Papéis

Os dois tipos têm os mesmos quatro papéis. `orç` = orçamento da raridade (2,
5, 9 … 262), `dif` = dificuldade (1–10).

| papel | cyberware | bioware | o que faz |
|---|---|---|---|
| **ofensivo** | dano **4 × orç** | dano 4 × orç × 0,7 × (1 + 0,9 × curva) × ressonância | uma **fonte de dano própria, sem ocupar mão** — uma lâmina no braço, um lança-mísseis, um deck que ataca a mente, uma garra enxertada. Tem tipo (corpo a corpo, à distância, mágico), **conta na sinergia** e **não tira o bônus de arma única** (não é arma de mão) |
| **defensivo** | defesa **4 × orç** (metade de um escudo) | defesa 4 × orç × 0,7 × (1 + 0,9 × curva) × ressonância | soma na defesa do membro, como cabeça e corpo |
| **reforço** | **+(4% + 0,8% × dif)** num alvo: um tipo de ataque, todo o ataque, ou a defesa | o mesmo × 0,7 × (1 + 0,9 × curva) × ressonância | multiplica o ataque daquele tipo (ou a defesa) do jogador — o mutágeno do Witcher |
| **atributo** | **1 × orç** em pontos, num atributo (ou dividido em dois) | o mesmo × 0,7 × (1 + 0,9 × curva) × ressonância, nos atributos da cor | soma atributo, como um acessório mais forte — o **"Implante Melhorador de Inteligência"** (Inteligência), o **"CRISPR de Vitamina C"** (Vida e Resistência) |

`curva = atributo ÷ (atributo + 2 × requisito)` — a mesma das armas: retorno
decrescente, sem teto duro. Os requisitos dos implantes olham os atributos
**sem** os implantes de atributo (senão um implante poderia pagar o
requisito de outro).

No cálculo (plano §4.3), o ataque do membro passa a ser a **soma das partes
por tipo** (corpo a corpo, à distância, mágico) — armas, Força, 0,7 × Int e os
implantes ofensivos —, cada parte vezes o seu reforço:

```
ataque do membro = Σ_tipo parte_tipo × (1 + reforço_tipo + reforço_todos)
                   × precisão(Destreza) × (1 + nível/100)
defesa do membro = (Σ defesa dos itens + defesa dos implantes + 0,6 × soma efetiva)
                   × (1 + nível/100) × (1 + reforço de defesa)
```

### 1.4 Por raridade

| raridade | requisito (Res. cyber / Vida bio) | cyber ofensivo (dano) / defensivo (defesa) | cyber reforço | cyber atributo (pontos) | bio ofensivo/defensivo | bio atributo | preço |
|---|---|---|---|---|---|---|---|
| comum | 5 | 8 | +4,8% | 2 | 6–11 | 1–3 | 15 |
| incomum | 10 | 20 | +5,6% | 5 | 14–27 | 4–7 | 50 |
| raro | 15 | 36 | +6,4% | 9 | 25–48 | 6–12 | 185 |
| épico | 20 | 60 | +7,2% | 15 | 42–80 | 11–20 | 710 |
| lendário | 25 | 100 | +8,0% | 25 | 70–133 | 18–33 | 2 660 |
| mítico | 30 | 160 | +8,8% | 40 | 112–213 | 28–53 | 9 980 |
| celestial | 35 | 256 | +9,6% | 64 | 179–340 | 45–85 | 37 300 |
| divino | 40 | 408 | +10,4% | 102 | 286–543 | 71–136 | 139 875 |
| primordial | 45 | 656 | +11,2% | 164 | 459–872 | 115–218 | 525 000 |
| supremo | 50 | 1 048 | +12,0% | 262 | 734–1 394 | 183–348 | 1 967 575 |

Na bioware, o primeiro valor é sem atributo nenhum e o segundo, o limite com
muito atributo; a ressonância vai por cima. O reforço sobe devagar de
propósito: um percentual que crescesse junto com o orçamento (×1,6 por
raridade) dobraria de peso a cada duas faixas. Preço = o de um acessório da
raridade.

### 1.5 Quanto valem

Party de referência no nível 45 (plano §6.1), tirando um implante de cada vez:

| implante da referência | poder | resiliência |
|---|---|---|
| lâmina no braço (cyber, ofensivo, corpo a corpo) | +3% | — |
| esqueleto reforçado (cyber, defensivo) | — | +2% |
| reflexos (cyber, reforço de defesa) | — | +1% |
| garra rubra (bio, ofensiva — ressoa com o mutágeno) | +5% | — |
| mutágeno rubro (bio, reforço corpo a corpo) | +4% | — |
| sangue verde (bio, defensiva) | — | +2% |
| **os seis** | **+11%** | **+5%** |
| _trocando os reflexos por um implante de Força (cyber, atributo)_ | +1% | −1% |
| _trocando o mutágeno rubro por uma bioware rubra de atributo_ | −2% | — |

_(Na party de referência — combatente + tank —, os companheiros fazem a maior
parte da defesa; numa party de outra composição, os implantes defensivos
rendem mais.)_

O de atributo rende como os outros quando o atributo está perto do requisito
das armas e mais fraco no fim do jogo, quando o atributo pesa pouco na party
(1–3%) — é o mesmo comportamento de um acessório.

Peso de cada parte no poder da party de referência:

| nível | arma do jogador | atributos do jogador | implantes do jogador | companheiros |
|---|---|---|---|---|
| 15 | 14% | 5% | 11% | 71% |
| 45 | 11% | 3% | 10% | 76% |
| 75 | 11% | 1% | 11% | 77% |
| 95 | 11% | 1% | 11% | 77% |

Os seis implantes juntos pesam o mesmo que a arma. Essa é a party de
referência (combatente + tank), em que o jogador fica com ~22–28% da party;
**na média das composições, o jogador faz ~34% e cada companheiro ~33%**
(D23 — plano §3.1).

### 1.6 Calibração — são itens normais (`D25`)

Implante é **item normal**, tratado como armadura e acessório: cai no loot,
está na loja da raridade, vai para o mercado entre jogadores e se equipa com
`&game equipar` — a pessoa compra um "Implante Melhorador de Inteligência" ou
um "CRISPR de Vitamina C" e equipa. Por isso, como a armadura e os acessórios,
**ele entra na party de referência**: seis implantes da raridade da faixa (os
da tabela acima, todos corpo a corpo, como o resto dela). As chances continuam
40% / 70% para quem tem o equipamento da faixa.

**Sem nenhum implante**, um jogador fica com ~37% de êxito e ~69% de
sobrevivência numa missão do próprio nível — o mesmo efeito de jogar sem os
acessórios. O evolucionador (§3) equipa os implantes por quem não quer pensar
nisso.

### 1.7 Sinergia

Implante ofensivo **é uma fonte de dano** e conta na sinergia (plano §4.5) pelo
tipo dele. É o jeito mais barato de misturar tipos sem trocar de arma — e sem
perder o bônus de arma única: um guerreiro de montante com um lança-mísseis no
braço e uma bioware cerúlea já cobre os três. O reforço multiplica a parte do
tipo dele, então também mexe nas proporções.

### 1.8 Obtenção e troca

- **Loot, loja e mercado normais**, como acessório: vaga nova `implante`, da
  raridade da faixa.
- **Únicos** de missão especial e de chefe valem como qualquer item único:
  ×1,2 no efeito, uma vez por pessoa (exemplo: o Coração de Segunda Mão,
  `ESPECIAIS-E-HISTORIAS.md` §1.4).
- **Trocar é grátis**, como equipar um item. `[ideia]` cobrar a "cirurgia"
  em Ouro (o médico de implantes do Cyberpunk) — fica de fora por enquanto,
  porque o evolucionador troca implantes sozinho.

### 1.9 Banco de dados

- `db.SLOTS` ganha `mao2`, `bio1`, `bio2`, `bio3`, `ciber1`, `ciber2`, `ciber3`.
- Item com `slot: implante` e os campos `familia` (`bio`/`ciber`), `papel`
  (`ofensivo`/`defensivo`/`reforco`/`atributo`), `regiao` (cyber), `cor`
  (bio), `alvo` (reforço de cyber: `melee`, `ranged`, `magia`, `ataque` ou
  `defesa`) e `atributos` (atributo de cyber).
- `slotParaEquipar` escolhe a primeira vaga livre da família; se as três
  estão cheias, troca a mais fraca — e, no cyber, a da mesma região.

### 1.10 Ficha

```yaml
- id: i_<obra>_<nome>
  nome: ""
  slot: implante
  familia: ciber            # ciber | bio
  papel: atributo           # ofensivo | defensivo | reforco | atributo
  regiao: cortex            # só ciber: bracos, sistema, esqueleto, pele, nervoso, olhos, cortex, circulatorio, pernas, musculos, maos, imunologico
  cor: rubro                # só bio: rubro, ambar, ceruleo, verde
  tipo: melee               # ofensivo de ciber: melee, ranged, magia (na bio, a cor decide)
  alvo: ranged              # reforço de ciber: melee, ranged, magia, ataque, defesa
  atributos: [inteligencia] # atributo de ciber: um ou dois (na bio, a cor decide)
  raridade: raro
  especial: false           # true = único (×1,2), uma vez por pessoa
  descricao: { pt: "", en: "" }
```

---

## 2. Catálogo genérico — oito por dificuldade

Um de cada papel em cada tipo: cyberware ofensivo, defensivo, de reforço e de
atributo; bioware ofensiva, defensiva, mutágeno (reforço) e de atributo. Do
primitivo ao cósmico, misturando fantasia, contemporâneo e ficção científica
como o resto do catálogo. Os dois que você citou estão aqui: o **CRISPR de
Vitamina C** (dificuldade 2) e o **Implante Melhorador de Inteligência**
(dificuldade 3). Nos números da bioware, o primeiro valor é sem atributo
nenhum e o segundo, o limite com muito atributo; a ressonância (+25% por outra
da mesma cor) vai por cima.


### Dificuldade 1 — Humano · Comum · requisito Resistência 5 (cyber) / Vida 5 (bio) · 15 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Gancho de Ferro** `i_c_lamina_1` | 🦾 cyberware · ofensivo | braços | dano 8 (corpo a corpo) | _prótese de pirata — o cyberware mais antigo que existe_ |
| 🆕 | **Placa de Costela** `i_c_esqueleto_1` | 🦾 cyberware · defensivo | esqueleto | defesa 8 | _placa de metal de cirurgia de guerra_ |
| 🆕 | **Lente de Relojoeiro** `i_c_optico_1` | 🦾 cyberware · reforço | olhos | +4,8% no ataque à distância | _monóculo parafusado no osso_ |
| 🆕 | **Garras de Urso Enxertadas** `i_b_rubro_of_1` | 🧬 bioware · ofensivo | 🔴 rubro (Força) | dano 6–11 (corpo a corpo) | _enxerto de curandeiro de aldeia_ |
| 🆕 | **Sangue de Troll Diluído** `i_b_verde_def_1` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 6–11 | _fecha cortes pequenos sozinho_ |
| 🆕 | **Mutágeno de Lobo** `i_b_rubro_mut_1` | 🧬 bioware · reforço | 🔴 rubro (Força) | +3,4–6,4% no ataque corpo a corpo | _tirado de um lobo grande demais_ |
| 🆕 | **Tala de Ferro** `i_c_for_1` | 🦾 cyberware · atributo | músculos | +2 Força | _ferro preso ao braço; carrega mais do que devia_ |
| 🆕 | **Sangue de Boi** `i_b_rubro_atr_1` | 🧬 bioware · atributo | 🔴 rubro (Força) | +1–3 Força | _bebido quente, antes do sol nascer_ |

### Dificuldade 2 — Sobre-humano · Incomum · requisito Resistência 10 (cyber) / Vida 10 (bio) · 50 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Braço de Pistão** `i_c_lamina_2` | 🦾 cyberware · ofensivo | braços | dano 20 (corpo a corpo) | _prótese industrial de fábrica_ |
| 🆕 | **Pele Subdérmica de Kevlar** `i_c_pele_2` | 🦾 cyberware · defensivo | pele | defesa 20 | _colete costurado por baixo da pele_ |
| 🆕 | **Estimulador de Reflexos** `i_c_reflexos_2` | 🦾 cyberware · reforço | nervoso | +5,6% de defesa | _esquiva antes de pensar_ |
| 🆕 | **Glândula de Espinhos** `i_b_ambar_of_2` | 🧬 bioware · ofensivo | 🟡 âmbar (Destreza) | dano 14–27 (à distância) | _cospe espinhos a vinte passos_ |
| 🆕 | **Couro de Basilisco** `i_b_verde_def_2` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 14–27 | _pele que endurece onde apanha_ |
| 🆕 | **Decocção de Bruxa do Pântano** `i_b_ceruleo_mut_2` | 🧬 bioware · reforço | 🔵 cerúleo (Inteligência) | +3,9–7,4% no ataque mágico | _o feitiço sai mais forte e a boca, amarga_ |
| 🆕 | **Estabilizador de Mão** `i_c_des_2` | 🦾 cyberware · atributo | mãos | +5 Destreza | _a mão não treme nem no frio_ |
| 🆕 | **CRISPR de Vitamina C** `i_b_verde_atr_2` | 🧬 bioware · atributo | 🟢 verde (Vida) | +2–3 Vida, +2–3 Resistência | _edição genética de farmácia: o corpo passa a fazer a própria vitamina C_ |

### Dificuldade 3 — Urbano · Raro · requisito Resistência 15 (cyber) / Vida 15 (bio) · 185 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Lâminas de Antebraço** `i_c_lamina_3` | 🦾 cyberware · ofensivo | braços | dano 36 (corpo a corpo) | _saem do pulso, voltam limpas_ |
| 🆕 | **Ossos de Titânio** `i_c_esqueleto_3` | 🦾 cyberware · defensivo | esqueleto | defesa 36 | _aguentam um carro em cima_ |
| 🆕 | **Óptica de Mira Balística** `i_c_optico_3` | 🦾 cyberware · reforço | olhos | +6,4% no ataque à distância | _mostra o vento e a queda da bala_ |
| 🆕 | **Glândula de Salamandra** `i_b_ceruleo_of_3` | 🧬 bioware · ofensivo | 🔵 cerúleo (Inteligência) | dano 25–48 (mágico) | _o fogo vem de dentro_ |
| 🆕 | **Regenerador de Medula** `i_b_verde_def_3` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 25–48 | _sangue novo a cada minuto_ |
| 🆕 | **Mutágeno de Lobisomem** `i_b_rubro_mut_3` | 🧬 bioware · reforço | 🔴 rubro (Força) | +4,5–8,5% no ataque corpo a corpo | _força de lua cheia, sem a lua_ |
| 🆕 | **Implante Melhorador de Inteligência** `i_c_int_3` | 🦾 cyberware · atributo | córtex | +9 Inteligência | _chip atrás da orelha; pensa mais rápido, sonha em código_ |
| 🆕 | **Colírio de Coruja** `i_b_ambar_atr_3` | 🧬 bioware · atributo | 🟡 âmbar (Destreza) | +6–12 Destreza | _enxerga no escuro e erra menos_ |

### Dificuldade 4 — Nuclear · Épico · requisito Resistência 20 (cyber) / Vida 20 (bio) · 710 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Lança-Mísseis de Pulso** `i_c_lancador_4` | 🦾 cyberware · ofensivo | braços | dano 60 (à distância) | _o antebraço abre e dispara_ |
| 🆕 | **Blindagem Dérmica Reativa** `i_c_pele_4` | 🦾 cyberware · defensivo | pele | defesa 60 | _a pele explode para fora antes do impacto_ |
| 🆕 | **Acelerador Neural** `i_c_sandevistan_4` | 🦾 cyberware · reforço | sistema | +7,2% no ataque todo o ataque | _o mundo fica em câmera lenta_ |
| 🆕 | **Glândula de Ácido** `i_b_ambar_of_4` | 🧬 bioware · ofensivo | 🟡 âmbar (Destreza) | dano 42–80 (à distância) | _jato corrosivo de longe_ |
| 🆕 | **Segundo Coração** `i_b_verde_def_4` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 42–80 | _se um para, o outro segura_ |
| 🆕 | **Mutágeno Radiativo** `i_b_ceruleo_mut_4` | 🧬 bioware · reforço | 🔵 cerúleo (Inteligência) | +5,0–9,6% no ataque mágico | _o brilho verde ajuda a conjurar_ |
| 🆕 | **Filtro Imunológico Antirradiação** `i_c_vida_4` | 🦾 cyberware · atributo | imunológico | +8 Vida, +8 Resistência | _rim de chumbo e fígado de titânio_ |
| 🆕 | **Gene da Memória Perfeita** `i_b_ceruleo_atr_4` | 🧬 bioware · atributo | 🔵 cerúleo (Inteligência) | +11–20 Inteligência | _não esquece nada — nem o que queria_ |

### Dificuldade 5 — Tectônico · Lendário · requisito Resistência 25 (cyber) / Vida 25 (bio) · 2.660 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Cyberdeck Militar** `i_c_deck_5` | 🦾 cyberware · ofensivo | sistema | dano 100 (mágico) | _ataca a mente e as máquinas — dano mágico_ |
| 🆕 | **Esqueleto de Liga Densa** `i_c_esqueleto_5` | 🦾 cyberware · defensivo | esqueleto | defesa 100 | _pesa o dobro e não quebra_ |
| 🆕 | **Bomba Circulatória** `i_c_coracao_5` | 🦾 cyberware · reforço | circulatório | +8,0% de defesa | _sangue sintético sob pressão_ |
| 🆕 | **Garra de Dragão Enxertada** `i_b_rubro_of_5` | 🧬 bioware · ofensivo | 🔴 rubro (Força) | dano 70–133 (corpo a corpo) | _escamas até o cotovelo_ |
| 🆕 | **Escamas Dracônicas** `i_b_verde_def_5` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 70–133 | _pele de quem dorme sobre ouro_ |
| 🆕 | **Mutágeno de Dragão** `i_b_rubro_mut_5` | 🧬 bioware · reforço | 🔴 rubro (Força) | +5,6–10,6% no ataque corpo a corpo | _o golpe pesa como uma cauda_ |
| 🆕 | **Miômeros de Fibra Sintética** `i_c_for_5` | 🦾 cyberware · atributo | músculos | +25 Força | _músculo de laboratório, cabo de aço por dentro_ |
| 🆕 | **Sangue de Hidra** `i_b_verde_atr_5` | 🧬 bioware · atributo | 🟢 verde (Vida) | +9–17 Vida, +9–17 Resistência | _corta uma veia, nascem duas_ |

### Dificuldade 6 — Planetário · Mítico · requisito Resistência 30 (cyber) / Vida 30 (bio) · 9.980 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Canhão de Plasma de Pulso** `i_c_lancador_6` | 🦾 cyberware · ofensivo | braços | dano 160 (à distância) | _o braço inteiro é a arma_ |
| 🆕 | **Malha de Nanofibra** `i_c_pele_6` | 🦾 cyberware · defensivo | pele | defesa 160 | _costura sozinha o que rasga_ |
| 🆕 | **Córtex Quântico** `i_c_cortex_6` | 🦾 cyberware · reforço | córtex | +8,8% no ataque mágico | _calcula o feitiço antes de dizer_ |
| 🆕 | **Simbionte Psiônico** `i_b_ceruleo_of_6` | 🧬 bioware · ofensivo | 🔵 cerúleo (Inteligência) | dano 112–213 (mágico) | _outra mente, morando junto, ajudando_ |
| 🆕 | **Carapaça de Titã** `i_b_verde_def_6` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 112–213 | _crosta de rocha viva_ |
| 🆕 | **Mutágeno do Falcão Solar** `i_b_ambar_mut_6` | 🧬 bioware · reforço | 🟡 âmbar (Destreza) | +6,2–11,7% no ataque à distância | _olho que acerta a um planeta de distância_ |
| 🆕 | **Mãos de Relojoeiro Quântico** `i_c_des_6` | 🦾 cyberware · atributo | mãos | +40 Destreza | _acertam o parafuso em dois lugares ao mesmo tempo_ |
| 🆕 | **Gene do Gigante** `i_b_rubro_atr_6` | 🧬 bioware · atributo | 🔴 rubro (Força) | +28–53 Força | _três metros por dentro_ |

### Dificuldade 7 — Estelar · Celestial · requisito Resistência 35 (cyber) / Vida 35 (bio) · 37.300 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Monofilamento Estelar** `i_c_lamina_7` | 🦾 cyberware · ofensivo | braços | dano 256 (corpo a corpo) | _fio de um átomo de espessura_ |
| 🆕 | **Exoesqueleto de Matéria Degenerada** `i_c_esqueleto_7` | 🦾 cyberware · defensivo | esqueleto | defesa 256 | _um centímetro pesa uma montanha_ |
| 🆕 | **Pernas de Propulsão Iônica** `i_c_pernas_7` | 🦾 cyberware · reforço | pernas | +9,6% no ataque corpo a corpo | _chega no golpe antes do som_ |
| 🆕 | **Glândula de Vento Solar** `i_b_ambar_of_7` | 🧬 bioware · ofensivo | 🟡 âmbar (Destreza) | dano 179–340 (à distância) | _sopra partículas como balas_ |
| 🆕 | **Plasma Vital de Estrela** `i_b_verde_def_7` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 179–340 | _o sangue brilha e cicatriza_ |
| 🆕 | **Mutágeno de Serafim** `i_b_ceruleo_mut_7` | 🧬 bioware · reforço | 🔵 cerúleo (Inteligência) | +6,7–12,8% no ataque mágico | _seis asas por dentro_ |
| 🆕 | **Coprocessador Estelar** `i_c_int_7` | 🦾 cyberware · atributo | córtex | +64 Inteligência | _pensa na velocidade da luz_ |
| 🆕 | **Retina de Pulsar** `i_b_ambar_atr_7` | 🧬 bioware · atributo | 🟡 âmbar (Destreza) | +45–85 Destreza | _pisca mil vezes por segundo e vê tudo_ |

### Dificuldade 8 — Cósmico · Divino · requisito Resistência 40 (cyber) / Vida 40 (bio) · 139.875 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Deck de Reescrita de Constantes** `i_c_deck_8` | 🦾 cyberware · ofensivo | sistema | dano 408 (mágico) | _muda a gravidade só onde o inimigo está_ |
| 🆕 | **Pele de Horizonte de Eventos** `i_c_pele_8` | 🦾 cyberware · defensivo | pele | defesa 408 | _o golpe entra e não sai_ |
| 🆕 | **Olhos de Lente Gravitacional** `i_c_optico_8` | 🦾 cyberware · reforço | olhos | +10,4% no ataque à distância | _mira pela curva do espaço_ |
| 🆕 | **Enxerto de Devorador** `i_b_rubro_of_8` | 🧬 bioware · ofensivo | 🔴 rubro (Força) | dano 286–543 (corpo a corpo) | _boca nas mãos, com fome_ |
| 🆕 | **Medula de Nebulosa** `i_b_verde_def_8` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 286–543 | _o corpo se refaz de poeira_ |
| 🆕 | **Mutágeno Primevo** `i_b_rubro_mut_8` | 🧬 bioware · reforço | 🔴 rubro (Força) | +7,3–13,8% no ataque corpo a corpo | _força de antes das estrelas_ |
| 🆕 | **Sistema Imune de Nanorrobôs** `i_c_vida_8` | 🦾 cyberware · atributo | imunológico | +51 Vida, +51 Resistência | _um exército no sangue_ |
| 🆕 | **Neurônios de Nebulosa** `i_b_ceruleo_atr_8` | 🧬 bioware · atributo | 🔵 cerúleo (Inteligência) | +71–136 Inteligência | _ideias do tamanho de galáxias_ |

### Dificuldade 9 — Multiversal · Primordial · requisito Resistência 45 (cyber) / Vida 45 (bio) · 525.000 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Canhão de Ramo Temporal** `i_c_lancador_9` | 🦾 cyberware · ofensivo | braços | dano 656 (à distância) | _atira onde o alvo vai estar em outro mundo_ |
| 🆕 | **Esqueleto de Probabilidade Fixa** `i_c_esqueleto_9` | 🦾 cyberware · defensivo | esqueleto | defesa 656 | _nas versões em que quebra, ele não está_ |
| 🆕 | **Sincronizador de Linhas do Tempo** `i_c_reflexos_9` | 🦾 cyberware · reforço | nervoso | +11,2% de defesa | _desvia do golpe de todas as versões_ |
| 🆕 | **Simbionte de Mil Versões** `i_b_ceruleo_of_9` | 🧬 bioware · ofensivo | 🔵 cerúleo (Inteligência) | dano 459–872 (mágico) | _conjura com a mão de outro eu_ |
| 🆕 | **Sangue de Paradoxo** `i_b_verde_def_9` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 459–872 | _a ferida acontece e desacontece_ |
| 🆕 | **Mutágeno do Eu de Outro Mundo** `i_b_ambar_mut_9` | 🧬 bioware · reforço | 🟡 âmbar (Destreza) | +7,8–14,9% no ataque à distância | _a pontaria do melhor de você_ |
| 🆕 | **Músculo de Corda Cósmica** `i_c_for_9` | 🦾 cyberware · atributo | músculos | +164 Força | _fio que segura universos_ |
| 🆕 | **DNA de Mil Versões** `i_b_verde_atr_9` | 🧬 bioware · atributo | 🟢 verde (Vida) | +57–109 Vida, +57–109 Resistência | _o corpo pega o melhor de cada eu_ |

### Dificuldade 10 — Hiperversal · Supremo · requisito Resistência 50 (cyber) / Vida 50 (bio) · 1.967.575 Ouro

| | nome | tipo · papel | onde | efeito | |
|---|---|---|---|---|---|
| 🆕 | **Dedo do Autor** `i_c_lamina_10` | 🦾 cyberware · ofensivo | braços | dano 1.048 (corpo a corpo) | _risca a frase em que o inimigo existe_ |
| 🆕 | **Encadernação Óssea** `i_c_esqueleto_10` | 🦾 cyberware · defensivo | esqueleto | defesa 1.048 | _capa dura por dentro_ |
| 🆕 | **Córtex de Narrador** `i_c_cortex_10` | 🦾 cyberware · reforço | córtex | +12,0% no ataque mágico | _sabe o próximo parágrafo_ |
| 🆕 | **Verbo Enxertado** `i_b_ceruleo_of_10` | 🧬 bioware · ofensivo | 🔵 cerúleo (Inteligência) | dano 734–1.394 (mágico) | _uma palavra que faz o que diz_ |
| 🆕 | **Tinta Viva** `i_b_verde_def_10` | 🧬 bioware · defensivo | 🟢 verde (Vida) | defesa 734–1.394 | _o que apagam, ela reescreve_ |
| 🆕 | **Mutágeno da Primeira Palavra** `i_b_rubro_mut_10` | 🧬 bioware · reforço | 🔴 rubro (Força) | +8,4–16,0% no ataque corpo a corpo | _o golpe que veio antes do mundo_ |
| 🆕 | **Mão que Escreve** `i_c_des_10` | 🦾 cyberware · atributo | mãos | +262 Destreza | _tudo o que toca fica do jeito que ela quer_ |
| 🆕 | **Fôlego do Primeiro Herói** `i_b_rubro_atr_10` | 🧬 bioware · atributo | 🔴 rubro (Força) | +183–348 Força | _a força de quem veio antes de todas as histórias_ |


---

## 3. Evolucionador automático (`D24`)

Para quem não sabe ou não tem paciência: o jogador escolhe **o que quer ser**
e o bot sobe o personagem e equipa a mochila por ele. O jogo de hoje não tem
classe de jogador — só os companheiros têm (combatente, tank, mago,
suporte) — então ela entra nova, **só como perfil**: não dá bônus nenhum, e
quem distribui e equipa à mão não perde nada.

### 3.1 Comandos

| comando | o que faz |
|---|---|
| `&game classe` | lista as classes, com o que cada uma prioriza |
| `&game classe <nome>` | escolhe (grátis; troca quando quiser) |
| `&game evoluir` | gasta os pontos livres **e** equipa o melhor da mochila; mostra o antes e o depois e a chance numa missão do seu nível |
| `&game evoluir prever` | mostra o que faria, sem mudar nada |
| `&game evoluir pontos` · `&game evoluir equipar` | só uma das duas partes |
| `&game evoluir auto on` / `off` | faz sozinho a cada nível novo e quando um item entra na mochila (loot, compra, troca) |
| `&game evoluir refazer` | o "resetar pontos" pago que já existe + evoluir; pede confirmação e mostra o preço |

Sem classe escolhida, `&game evoluir` pergunta qual — não escolhe por ninguém.

### 3.2 Classes

| classe | pontos (proporção) | armas que o evolucionador usa | escudo | êxito × sobrevivência |
|---|---|---|---|---|
| ⚔️ **Guerreiro** | For 50 · Res 20 · Vida 15 · Mana 15 — **os pontos do jogador da party de referência** | brancas | sim | 60 / 40 |
| 🤺 **Duelista** | For 30 · Des 30 · Res 15 · Vida 15 · Agi 10 | brancas e de fogo leves | não | 60 / 40 |
| 🎯 **Atirador** | Des 50 · Res 15 · Vida 15 · Agi 10 · Mana 10 | de fogo e brancas leves | não | 60 / 40 |
| 🔮 **Mago** | Int 50 · Mana 20 · Vida 15 · Res 15 | mágicas (cajado, varinha, foco) | não | 60 / 40 |
| 🛡️ **Guardião** | Res 35 · Vida 30 · For 20 · Agi 15 | brancas | sim | 35 / 65 |
| ✝️ **Templário** | For 30 · Int 30 · Res 15 · Vida 15 · Mana 10 | brancas e mágicas (arma de força) | sim | 60 / 40 |
| 🌀 **Andarilho** | For 20 · Des 20 · Int 25 · Vida 15 · Res 10 · Mana 10 | todas | sim | 60 / 40 |
| 🎻 **Bardo** | Car 25 · Sor 25 · Mana 20 · Int 10 · Vida 10 · Res 10 | leves de qualquer tipo | sim | 40 / 60 |

A classe filtra **armas**; cabeça, corpo, acessórios e implantes são livres.
À mão, o jogador continua usando o que quiser.

### 3.3 Como gasta os pontos

1. **Requisitos primeiro:** o que falta para usar as armas do estilo da
   classe na raridade da sua faixa (Força de uma ou duas mãos, Destreza,
   Inteligência) e para os implantes (Resistência e Vida ≥ 5 × dificuldade).
2. **Depois, pelas proporções:** cada ponto vai para o atributo mais atrasado
   em relação à proporção da classe (sobre todos os pontos ganhos até agora).
   Assim, quem trocou de classe vai convergindo para a nova sem precisar de
   respec — ou usa `&game evoluir refazer`.
3. **Só pontos inteiros** (o jogo guarda a fração; `pontosPorNivel` depende de
   Int + Sorte e continua igual).

### 3.4 Como escolhe o equipamento

Para cada combinação, calcula com as fórmulas reais do combate (plano §4) a
**nota** = êxito^peso × sobrevivência^(1 − peso) numa missão do **seu nível**,
com os **companheiros que estão na sua party** e a **sinergia**. Fica com a
maior.

- **Mãos:** toda arma permitida nas duas mãos; todo par de armas de uma mão;
  toda arma com escudo ou foco (se a classe usa escudo). Abaixo do requisito
  a arma entra com os 40% — às vezes ainda vale.
- **Cabeça e corpo:** a maior defesa.
- **Acessórios, cyberware e bioware:** 3 de cada, entre as combinações
  possíveis (no cyber, uma peça por região).
- **Por partes, duas voltas:** mãos → implantes → acessórios → mãos de
  novo. Com uma mochila de ~60 itens são alguns milhares de contas — instantâneo.
- **Desempate:** fica o que já está equipado (nada de trocar à toa); depois,
  o mais barato.
- **Nunca vende nem descarta.** O que sai volta para a mochila. Fica de fora
  o que está anunciado no mercado. (Companheiro não usa item — D23.)

### 3.5 Resultado — cada classe no próprio nível

Mochila com um item de cada molde da raridade da faixa (8 armas, escudo, foco,
cabeça, corpo, acessórios e os 19 implantes), companheiros combatente + tank.
Entre parênteses, a sinergia que a party ganhou:

| classe | 15: êxito/sobrev. | 45 | 75 | 95 | o que equipou no 45 |
|---|---|---|---|---|---|
| ⚔️ Guerreiro | 43%/69% (+5%) | 42%/69% | 43%/69% | 43%/69% | **martelo nas duas mãos** · lâmina, deck, pernas · bio rubra ofensiva, mutágeno e atributo rubros (ressoam) |
| 🤺 Duelista | 44%/69% (+5%) | 43%/69% (+3%) | 43%/69% | 43%/69% | **montante nas duas mãos** · lança-mísseis, deck, pernas · bio rubra, âmbar e cerúlea ofensivas |
| 🎯 Atirador | 47%/69% (+20%) | 45%/69% (+16%) | 45%/69% (+13%) | 46%/69% (+17%) | **rifle nas duas mãos** · lança-mísseis, deck, óptico · bio rubra, âmbar e cerúlea ofensivas |
| 🔮 Mago | 46%/69% (+19%) | 44%/69% (+15%) | 45%/69% (+13%) | 46%/69% (+14%) | **cajado nas duas mãos** · lança-mísseis, deck, implante de Força · bio rubra, âmbar e cerúlea ofensivas |
| 🛡️ Guardião | 42%/70% (+5%) | 41%/70% (+3%) | 41%/70% | 42%/70% | **montante + escudo** · lança-mísseis, deck, implante de Destreza · bio rubra, âmbar e cerúlea ofensivas |
| ✝️ Templário | 45%/70% (+19%) | 45%/70% (+15%) | 45%/70% (+13%) | 45%/70% (+13%) | **cajado + escudo** · lança-mísseis, deck, córtex · bio rubra, âmbar e cerúlea ofensivas |
| 🌀 Andarilho | 47%/69% (+22%) | 46%/69% (+18%) | 46%/69% (+17%) | 46%/69% (+18%) | **rifle + cajado**, um em cada mão · lança-mísseis, deck, implante de Destreza · bio rubra, âmbar e cerúlea ofensivas |
| 🎻 Bardo | 41%/70% (+14%) | 40%/70% (+10%) | 40%/70% (+10%) | 40%/70% (+10%) | **varinha + escudo** · lança-mísseis, deck, córtex · bio rubra, âmbar e cerúlea ofensivas |
| _party de referência, sem sinergia_ | 40%/70% | 40%/70% | 40%/70% | 40%/70% | montante nas duas mãos · os seis implantes da §1.5 |

### 3.6 O que a simulação mostrou

- **Toda classe fica entre 40% e 47% de êxito**, contra 40% da referência.
  O que sobra acima é a sinergia: com implantes ofensivos de tipos
  diferentes, qualquer jogador cobre os três tipos sem largar a arma da
  classe — é o "um player único com os 3 é favorecido" que você pediu. As
  missões continuam calibradas sem a sinergia (D25: implante é item normal;
  a sinergia fica por cima). Na party de referência (combatente + tank) o
  jogador pesa ~25%, então a distância entre as classes é pequena.
- **As classes usam armas diferentes:** uma arma nas duas mãos para quem só
  ataca (Guerreiro, Duelista, Atirador, Mago), arma e escudo para quem quer
  sobreviver (Guardião, Templário, Bardo), e o Andarilho mistura rifle e
  cajado para ganhar sinergia.
- **Implante ofensivo de outro tipo ainda é o mais escolhido**, porque dá
  dano **e** sinergia — e, por não ser arma de mão, não tira o bônus de arma
  única. O Guerreiro é a exceção: fica todo no rubro (garra, mutágeno e
  atributo ressoam entre si). Os de atributo aparecem como acessório forte.
- **Duas armas leves ou médias ficaram para trás** (plano §4.1): o
  evolucionador nunca as escolhe. Aceito como está (D28).

### 3.7 Exemplo de tela

_Números ilustrativos._

```
⚙️ Evoluir — Guerreiro · nível 45

📈 Pontos (18 livres)
   Força 64 → 74 · Resistência 42 → 46 · Vida 38 → 41 · Mana 38 → 41

⚔️ Equipamento
   Mão principal: Montante de Aço Negro → Martelo da Fenda (arma única +80%)
   Mão secundária: (nas duas mãos)
   Cyberware: + Lâminas de Antebraço · + Cyberdeck Militar
   Bioware: Mutágeno de Dragão → Garra de Dragão Enxertada
   _O que saiu voltou para a mochila._

🎯 Missão do seu nível: êxito 37% → 42% · sobrevivência 69% → 69%

_&game evoluir auto on para fazer isso sozinho a cada nível._
```

### 3.8 Banco e código

- `rpg_personagem` ganha `classe TEXT` (nula até escolher) e
  `evoluirAuto INTEGER DEFAULT 0`; `COLUNAS_OK` inclui as duas.
- `modulos/game/evolucionador.js` (novo): `CLASSES_JOGADOR`, `distribuir`,
  `melhorEquipamento` e `evoluir` — as mesmas funções do script de
  balanceamento, que viram a fonte única; o script passa a importá-las.
- Gatilhos do automático: ao subir de nível (onde hoje os pontos entram) e
  ao entrar item na mochila.
- Testes: o Guerreiro do evolucionador distribui os pontos como o jogador da
  party de referência; nunca equipa item anunciado no mercado; `prever` não
  grava nada; sem classe, não faz nada.
