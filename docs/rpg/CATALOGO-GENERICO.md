# Catálogo genérico do RPG — 10 faixas, níveis 1–100

Conteúdo de exemplo para cada faixa — o molde para os personagens, itens, missões e chefes das obras. Não é só medieval: cada faixa mistura fantasia, contemporâneo e ficção científica. Números de `scripts/balanceamento-rpg.mjs` com as decisões do plano (D1–D28); se uma mudar, os números mudam. **Revisão de 8 out:** a party de referência passou a usar bioware e cyberware (3 + 3 vagas), o bônus de arma única (D27) e o kit dos companheiros (D23), então o poder de todas as missões e chefes ficou ~3,4× e o risco ~5× o da v3; a sinergia ficou sem teto; os escudos dobraram de defesa; as magias passaram a pedir Inteligência em vez de nível (D10). Os implantes (exemplos por dificuldade) e o evolucionador automático estão no `IMPLANTES-E-EVOLUCIONADOR.md`.

**Legenda:** ✅ já existe no jogo · 🆕 novo. For, Des, Res, Agi, Vida, Mana, Int, Sor, Car.

## Visão geral

| dificuldade | nome | tiers VSB | níveis | raridade | companheiro | item (orçamento) | magias do grimório | chefe |
|---|---|---|---|---|---|---|---|---|
| 1 | Humano | 10-C – 10-A | 1–10 | Comum | ×1 | 2 | Faísca / Escudo Menor | O Rei dos Ratos |
| 2 | Sobre-humano | 9-C – 9-A | 11–20 | Incomum | ×1,25 | 5 | Flecha Ígnea / Cura | Lobo Ancestral da Neve |
| 3 | Urbano | 8-C – 8-A | 21–30 | Raro | ×1,6 | 9 | Lança de Gelo / Barreira Arcana | O Chefe do Sindicato Ciborgue |
| 4 | Nuclear | Low 7-C – High 7-A | 31–40 | Épico | ×2,1 | 15 | Tempestade / Regeneração | Hidra do Reator |
| 5 | Tectônico | 6-C – High 6-A | 41–50 | Lendário | ×2,8 | 25 | Juízo Final / Intervenção Divina | Dragão da Montanha Partida |
| 6 | Planetário | 5-C – High 5-A | 51–60 | Mítico | ×3,8 | 40 | Chuva de Cometas / Égide Planetária | Titã do Núcleo |
| 7 | Estelar | Low 4-C – 4-A | 61–70 | Celestial | ×5,1 | 64 | Supernova / Véu da Nebulosa | Serafim da Estrela Negra |
| 8 | Cósmico | 3-C – High 3-A | 71–80 | Divino | ×6,9 | 102 | Colapso Galáctico / Eternidade | O Devorador de Galáxias |
| 9 | Multiversal | Low 2-C – 2-A | 81–90 | Primordial | ×9,3 | 164 | Ruptura entre Mundos / Âncora da Realidade | O Rei de Todos os Mundos |
| 10 | Hiperversal | Low 1-C – 0 | 91–100+ | Supremo | ×12,6 | 262 | Verbo Primeiro / Fim das Narrativas | Aquele que Lê o Mundo |

## Regras comuns

- **Dificuldade da missão = a faixa (1–10).** O nível da missão é o ajuste fino. Toda missão é justa no próprio nível: 40% de êxito e 70% de sobrevivência para a party de referência. Espera de 45 min.
- **Recompensa pela força da missão (D6):** a missão paga o mesmo para todos — quem foi no co-op e quem teve sorte. XP = o poder dela. O custo de um nível acompanha a força daquele nível, então um êxito numa missão do seu nível vale **80% de um nível** e numa duas vezes mais forte, 160%. **Falhar não paga nada.**
- **Moeda (D8):** toda vitória paga Ouro e Cristal. **Contrato** (missão da guilda) paga do **banco**; **dungeon** paga do **tesouro dela**, que se renova sem fim — a única fonte de moeda nova. Quanto mais cheio quem paga, mais paga. Detalhes: `ECONOMIA-E-DUNGEONS.md`.
- **Loot:** relativo à raridade da faixa (b): b−1 25% · b 38% · b+1 de 6% (começo da faixa) a 15% (fim) · b+2 de 1% a 3% nos três últimos níveis. Acima de supremo some.
- **Companheiros:** `ganho da classe × nível × raridade × kit`, sobem com o dono (D2). **Não usam equipamento (D23):** o kit da classe no ganho por nível (combatente ×4,37, tank ×7,77, mago ×11,32, suporte ×9,44), calibrado para que, na média, o jogador faça ~34% da party e cada companheiro ~33%. Mercenário até raro; épico e lendário na dungeon; de mítico para cima na missão da faixa e no chefe.
- **Armas (D20):** dano próprio e escala por atributo, como em Dark Souls — `dano × (1 + Σ letra × curva)`; letras E 0,15 · D 0,35 · C 0,6 · B 0,9 · A 1,25 · S 1,6. Bater escala com **Força**, mirar com **Destreza**, místico com **Inteligência**; híbridas misturam. Requisito de Força em **uma mão** e em **duas mãos** (metade); abaixo do requisito a arma rende 40%. As duas mãos são igualmente eficazes; segurar uma arma com as duas faz a Força contar ×1,5 na escala. **Arma única (D27):** quem usa uma arma só — numa mão, nas duas, ou com escudo (escudo não conta como arma) — ganha +80% no dano dela; os danos das tabelas são antes desse bônus. Detalhes: plano §4.
- **Sinergia (D22):** a party ganha dano por misturar corpo a corpo, à distância e mágico — num jogador só (armas híbridas e implantes ajudam) ou espalhado pelos companheiros. **Sem teto:** os três tipos iguais dão +25% com 3 fontes de dano e mais com mais fontes (`× (1 + ln(fontes/3))` — +61% num co-op de 4 todo misturado). As missões são calibradas sem esse bônus. Detalhes: plano §4.5.
- **Bioware e cyberware (D23, D25):** 3 vagas de cada, só no jogador — **itens normais**, como armadura e acessório (loja, loot, mercado, `&game equipar`). Cyberware tem valor fixo e pede Resistência; bioware escala com o atributo da cor, ressoa com outras da mesma cor e pede Vida. Papéis: ofensivo (fonte de dano sem ocupar mão), defensivo (defesa), reforço (% no ataque de um tipo ou na defesa) e atributo (o "Implante Melhorador de Inteligência", o "CRISPR de Vitamina C"). A party de referência usa seis da raridade da faixa. Oito exemplos por dificuldade: `IMPLANTES-E-EVOLUCIONADOR.md`.
- **Folga pela força (D26):** quem tem mais força do que a missão pede ganha folga — com 3× a força para a qual ela foi feita, êxito e sobrevivência garantidos. Nunca pelo nível. Missões de colher, entregar e investigar têm **perigo baixo** (risco × 0,25).
- **Evolucionador automático (D24):** o jogador escolhe uma classe e o `&game evoluir` gasta os pontos e equipa o melhor da mochila por ele.
- **Armadura, capacete e escudo** dão **defesa**, não atributo; **acessórios** continuam dando atributo (cabeça 0,7 · corpo 0,85 · **escudo 1,0, e +10% na defesa de quem usa** (D27) · acessório 0,55 do orçamento). Preço ×3,75 por raridade a partir do lendário (D12).
- **Ao cair:** perde a fração de moeda de hoje — num contrato ela vai para o banco; numa dungeon, para o tesouro dela. **Só na dungeon** cada companheiro tem **20%** de ser capturado (resgate na própria dungeon); num contrato ele só se fere. **Companheiro como loot:** 7% por êxito, da raridade da faixa ou uma abaixo.
- **Chefe:** é uma missão como as outras — mesma luta, mesmas consequências ao cair, co-op igual —, só com números de chefe: último nível da faixa, 35% de vitória e 60% de sobrevivência com 4 jogadores do nível (~8% sozinho), fica no fim da dungeon da dificuldade; recompensa ~×7,5 de uma missão do mesmo nível (a força dele — cerca de 6 níveis por vitória). Espera de 24 h por pessoa (D19). Garantido: 1 item da raridade da faixa; 25% de um da seguinte; 20% de companheiro da faixa.

---

## Dificuldade 1 — Humano (10-C – 10-A) · níveis 1–10 · Comum (×1)

### Companheiros

| | nome | classe | soma no nível 1 | soma no nível 10 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| ✅ | Mercenário Novato `f_mercenario_novato` | ⚔️ combatente | 31 | 307 | Golpe Certeiro 2/0,35 | mercenário (120 Ouro) ou missão |
| ✅ | Aprendiz de Magia `f_aprendiz_magia` | 🔮 mago | 92 | 906 | Lança Arcana 3/0,45 | mercenário (120 Ouro) ou missão |
| ✅ | Guarda Bisonho `f_guarda_bisonho` | 🛡️ tank | 55 | 545 | Muralha 2/0,4 | mercenário (120 Ouro) ou missão |
| ✅ | Curandeira Errante `f_curandeira_errante` | ✨ suporte | 66 | 661 | Bênção 2/0,3 | mercenário (120 Ouro) ou missão |
| 🆕 | Segurança de Boate `f_seguranca` | ⚔️ combatente | 31 | 307 | Golpe Certeiro 2/0,35 | mercenário (120 Ouro) ou missão |
| 🆕 | Estudante de Ocultismo `f_estudante_ocultismo` | 🔮 mago | 92 | 906 | Lança Arcana 3/0,45 | mercenário (120 Ouro) ou missão |
| 🆕 | Bombeiro Voluntário `f_bombeiro` | 🛡️ tank | 55 | 545 | Muralha 2/0,4 | mercenário (120 Ouro) ou missão |
| 🆕 | Paramédica de Plantão `f_paramedica` | ✨ suporte | 66 | 661 | Bênção 2/0,3 | mercenário (120 Ouro) ou missão |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| ✅ | Adaga Simples `g_adaga_simples` _(hoje: For 1)_ | mão · leve | branca | dano 8 | For D · Des B | For 2 / 1 · Des 3 | 10 |
| ✅ | Espada de Ferro `g_espada_ferro` _(hoje: For 2)_ | mão · pesado | branca | dano 16 | For B · Des D | For 7 / 4 · Des 1 | 18 |
| 🆕 | Revólver Enferrujado | mão · leve | de fogo | dano 8 | Des B · For E | For 1 / 1 · Des 3 | 15 |
| 🆕 | Espingarda de Caça | mão · pesado | de fogo | dano 16 | Des A · For E | For 4 / 2 · Des 4 | 15 |
| 🆕 | Varinha de Galho | mão · leve | mágica | dano 8 | Int B · Des E | For 1 / 1 · Int 3 | 15 |
| ✅ | Cajado Rachado `g_cajado_rachado` _(hoje: Int 2)_ | mão · pesado | mágica | dano 16 | Int A | For 3 / 2 · Int 4 | 18 |
| 🆕 | Escudo de Tábuas | mão (escudo) | — | defesa 16 | — | — | 15 |
| 🆕 | Caderno de Feitiços | mão · leve (foco) | mágica | dano 8 | Int B · Des E | For 1 / 1 · Int 3 | 15 |
| ✅ | Elmo Amassado `g_elmo_amassado` _(hoje: Res 1)_ | cabeça | — | defesa 11 | — | — | 12 |
| ✅ | Túnica Puída `g_tunica_puida` _(hoje: Res 1, Agi 1)_ | corpo | — | defesa 14 | — | — | 14 |
| ✅ | Amuleto Opaco `g_amuleto_opaco` | acessório | — | Sor 1 | — | — | 12 |
| 🆕 | Cordão de Couro | acessório | — | Vida 1, Res 1, Mana 1 | — | — | 15 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| ✅ | Faísca | ataque | 1 | 1 | 0,15 | 150 |
| ✅ | Escudo Menor | suporte | 1 | 1 | 0,18 | 180 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| ✅ | Limpar os Ratos do Porão `d_ratos` (hoje: nível 2, fácil, 2/1,5) | 3 | 131 | 76 | Comum 63% · Incomum 8% |
| ✅ | Espantar Goblins da Estrada `d_goblins` (hoje: nível 3, fácil, 6/4) | 5 | 223 | 132 | Comum 63% · Incomum 10% |
| ✅ | Colher Ervas na Mata Rasa `d_ervas` (hoje: nível 4, fácil, 12/9) · **perigo baixo** | 7 | 292 | 44 | Comum 63% · Incomum 12% |
| 🆕 | Recuperar o Sino Roubado `d_sino` | 9 | 363 | 225 | Comum 63% · Incomum 14% · Raro 2% |

### Dungeon — Esgotos da Cidade Velha 🆕

Mundo aberto da dificuldade 1 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — ratos gigantes, ladrões de beco, cães de guarda. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — O Rei dos Ratos `b_rei_ratos` 🆕

Nível 10 · poder **1.790** · risco **1.467** · vitória/sobrevivência: sozinho 13%/28% · 2 22%/43% · 3 29%/53% · 4 35%/60%. Garantido: item Comum; 25% de item Incomum; 20% de companheiro Comum.

---

## Dificuldade 2 — Sobre-humano (9-C – 9-A) · níveis 11–20 · Incomum (×1,25)

### Companheiros

| | nome | classe | soma no nível 11 | soma no nível 20 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| ✅ | Batedor Silencioso `f_batedor_silencioso` | ⚔️ combatente | 421 | 766 | Golpe Certeiro 2/0,44 | mercenário (400 Ouro) ou missão |
| ✅ | Escriba Rúnico `f_escriba_runico` | 🔮 mago | 1246 | 2265 | Lança Arcana 3/0,56 | mercenário (400 Ouro) ou missão |
| ✅ | Sentinela do Muro `f_sentinela_muro` | 🛡️ tank | 750 | 1361 | Muralha 2/0,5 | mercenário (400 Ouro) ou missão |
| ✅ | Bardo de Estrada `f_bardo_estrada` | ✨ suporte | 910 | 1652 | Bênção 2/0,38 | mercenário (400 Ouro) ou missão |
| 🆕 | Lutadora de Jaula `f_lutadora` | ⚔️ combatente | 421 | 766 | Golpe Certeiro 2/0,44 | mercenário (400 Ouro) ou missão |
| 🆕 | Médium de Esquina `f_medium` | 🔮 mago | 1246 | 2265 | Lança Arcana 3/0,56 | mercenário (400 Ouro) ou missão |
| 🆕 | Policial de Choque `f_policial_choque` | 🛡️ tank | 750 | 1361 | Muralha 2/0,5 | mercenário (400 Ouro) ou missão |
| 🆕 | Apostador Profissional `f_apostador` | ✨ suporte | 910 | 1652 | Bênção 2/0,38 | mercenário (400 Ouro) ou missão |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Sabre de Cavalaria | mão · médio | branca | dano 24 | For C · Des C | For 8 / 4 · Des 4 | 50 |
| ✅ | Espada Temperada `g_espada_temperada` _(hoje: For 4, Des 1)_ | mão · pesado | branca | dano 40 | For B · Des D | For 14 / 7 · Des 2 | 60 |
| 🆕 | Pistola de Serviço | mão · leve | de fogo | dano 20 | Des B · For E | For 2 / 1 · Des 6 | 50 |
| 🆕 | Carabina de Ferrolho | mão · pesado | de fogo | dano 40 | Des A · For E | For 7 / 4 · Des 8 | 55 |
| 🆕 | Varinha Rúnica | mão · leve | mágica | dano 20 | Int B · Des E | For 2 / 1 · Int 6 | 50 |
| ✅ | Bordão Rúnico `g_bordao_runico` _(hoje: Int 4, Mana 1)_ | mão · pesado | mágica | dano 40 | Int A | For 6 / 3 · Int 8 | 60 |
| 🆕 | Escudo de Choque | mão (escudo) | — | defesa 40 | — | — | 50 |
| 🆕 | Orbe de Quartzo | mão · leve (foco) | mágica | dano 20 | Int B · Des E | For 2 / 1 · Int 6 | 50 |
| ✅ | Elmo de Bronze `g_elmo_bronze` _(hoje: Res 2, Vida 1)_ | cabeça | — | defesa 28 | — | — | 45 |
| ✅ | Cota de Malha `g_cota_malha` _(hoje: Res 3)_ | corpo | — | defesa 34 | — | — | 55 |
| ✅ | Anel de Prata `g_anel_prata` | acessório | — | Sor 2 | — | — | 50 |
| 🆕 | Bracelete de Ferro | acessório | — | Vida 1, Res 1, Mana 1 | — | — | 50 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| ✅ | Flecha Ígnea | ataque | 6 | 2 | 0,28 | 500 |
| ✅ | Cura | suporte | 6 | 2 | 0,3 | 550 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| ✅ | Caçar o Lobo Branco `d_lobo` (hoje: nível 6, médio, 45/35) | 11 | 833 | 457 | Comum 25% · Incomum 38% · Raro 6% |
| 🆕 | Conter o Assalto ao Banco `d_assalto` | 13 | 965 | 536 | Comum 25% · Incomum 38% · Raro 8% |
| ✅ | Explorar a Cripta Submersa `d_cripta` (hoje: nível 8, médio, 70/55) | 15 | 1.098 | 619 | Comum 25% · Incomum 38% · Raro 10% |
| ✅ | Escoltar a Caravana de Sal `d_caravana` (hoje: nível 10, médio, 110/85) | 19 | 1.375 | 793 | Comum 25% · Incomum 38% · Raro 14% · Épico 2% |

### Dungeon — Floresta da Neve Eterna 🆕

Mundo aberto da dificuldade 2 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — lobos, bandidos da estrada, cultistas. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — Lobo Ancestral da Neve `b_lobo_ancestral` 🆕

Nível 20 · poder **7.781** · risco **5.870** · vitória/sobrevivência: sozinho 11%/25% · 2 21%/41% · 3 28%/52% · 4 35%/60%. Garantido: item Incomum; 25% de item Raro; 20% de companheiro Incomum.

---

## Dificuldade 3 — Urbano (8-C – 8-A) · níveis 21–30 · Raro (×1,6)

### Companheiros

| | nome | classe | soma no nível 21 | soma no nível 30 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| ✅ | Espadachim das Cinzas `f_espadachim_cinzas` | ⚔️ combatente | 1029 | 1470 | Golpe Certeiro 2/0,56 | mercenário (1.400 Ouro) ou missão |
| ✅ | Vidente do Lago `f_vidente_lago` | 🔮 mago | 3044 | 4348 | Lança Arcana 3/0,72 | mercenário (1.400 Ouro) ou missão |
| ✅ | Couraceiro de Ferro `f_couraceiro` | 🛡️ tank | 1828 | 2612 | Muralha 2/0,64 | mercenário (1.400 Ouro) ou missão |
| ✅ | Alquimista Viajante `f_alquimista` | ✨ suporte | 2219 | 3171 | Bênção 2/0,48 | mercenário (1.400 Ouro) ou missão |
| 🆕 | Ronin Cibernético `f_ronin` | ⚔️ combatente | 1029 | 1470 | Golpe Certeiro 2/0,56 | mercenário (1.400 Ouro) ou missão |
| 🆕 | Técnica de Drones `f_tecnica_drones` | 🔮 mago | 3044 | 4348 | Lança Arcana 3/0,72 | mercenário (1.400 Ouro) ou missão |
| 🆕 | Soldado de Exoesqueleto `f_exoesqueleto` | 🛡️ tank | 1828 | 2612 | Muralha 2/0,64 | mercenário (1.400 Ouro) ou missão |
| 🆕 | Negociadora de Reféns `f_negociadora` | ✨ suporte | 2219 | 3171 | Bênção 2/0,48 | mercenário (1.400 Ouro) ou missão |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Katana de Aço Dobrado | mão · médio | branca | dano 43 | For C · Des C | For 12 / 6 · Des 6 | 190 |
| ✅ | Lâmina do Vento `g_lamina_vento` _(hoje: For 6, Agi 3)_ | mão · pesado | branca | dano 72 | For B · Des D | For 21 / 11 · Des 3 | 220 |
| 🆕 | Pistola Magnum | mão · leve | de fogo | dano 36 | Des B · For E | For 3 / 2 · Des 9 | 185 |
| 🆕 | Fuzil de Assalto | mão · pesado | de fogo | dano 72 | Des A · For E | For 11 / 6 · Des 12 | 200 |
| 🆕 | Luva de Conjuração | mão · leve | mágica | dano 36 | Int B · Des E | For 3 / 2 · Int 9 | 185 |
| ✅ | Cetro de Cristal `g_cetro_cristal` _(hoje: Int 6, Mana 3)_ | mão · pesado | mágica | dano 72 | Int A | For 9 / 5 · Int 12 | 220 |
| 🆕 | Escudo Balístico | mão (escudo) | — | defesa 72 | — | — | 185 |
| 🆕 | Tomo de Bolso | mão · leve (foco) | mágica | dano 36 | Int B · Des E | For 3 / 2 · Int 9 | 185 |
| ✅ | Elmo do Vigia `g_elmo_vigia` _(hoje: Res 4, Des 2)_ | cabeça | — | defesa 50 | — | — | 170 |
| ✅ | Peitoral Rúnico `g_peitoral_runico` _(hoje: Res 5, Vida 2)_ | corpo | — | defesa 61 | — | — | 200 |
| ✅ | Talismã do Corvo `g_talisma_corvo` | acessório | — | Sor 3, Car 2 | — | — | 190 |
| 🆕 | Amuleto do Urso | acessório | — | Vida 2, Res 1, Mana 1 | — | — | 185 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| ✅ | Lança de Gelo | ataque | 11 | 3 | 0,42 | 1.400 |
| ✅ | Barreira Arcana | suporte | 11 | 3 | 0,45 | 1.500 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| 🆕 | Desativar a Bomba do Metrô `d_bomba` | 22 | 2.844 | 1.581 | Incomum 25% · Raro 38% · Épico 7% |
| 🆕 | Resgatar o Mineiro Soterrado `d_mineiro` | 24 | 3.104 | 1.738 | Incomum 25% · Raro 38% · Épico 9% |
| ✅ | Descer ao Poço sem Fundo `d_poco` (hoje: nível 14, difícil, 260/210) | 27 | 3.516 | 1.991 | Incomum 25% · Raro 38% · Épico 12% |
| 🆕 | Invadir o Laboratório Clandestino `d_laboratorio` | 30 | 3.916 | 2.244 | Incomum 25% · Raro 38% · Épico 15% · Lendário 3% |

### Dungeon — Distrito do Sindicato 🆕

Mundo aberto da dificuldade 3 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — capangas ciborgues, drones, atiradores. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — O Chefe do Sindicato Ciborgue `b_sindicato` 🆕

Nível 30 · poder **24.383** · risco **18.036** · vitória/sobrevivência: sozinho 10%/22% · 2 20%/40% · 3 28%/52% · 4 35%/60%. Garantido: item Raro; 25% de item Épico; 20% de companheiro Raro.

---

## Dificuldade 4 — Nuclear (Low 7-C – High 7-A) · níveis 31–40 · Épico (×2,1)

### Companheiros

| | nome | classe | soma no nível 31 | soma no nível 40 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| ✅ | Lâmina Juramentada `f_lamina_juramentada` | ⚔️ combatente | 1991 | 2570 | Golpe Certeiro 2/0,74 | dungeon |
| ✅ | Arquimago Exilado `f_arquimago_exilado` | 🔮 mago | 5897 | 7609 | Lança Arcana 3/0,95 | dungeon |
| ✅ | Baluarte Silente `f_baluarte` | 🛡️ tank | 3541 | 4570 | Muralha 2/0,84 | dungeon |
| ✅ | Oráculo de Bronze `f_oraculo` | ✨ suporte | 4302 | 5551 | Bênção 2/0,63 | dungeon |
| 🆕 | Supersoldado Clonado `f_supersoldado` | ⚔️ combatente | 1991 | 2570 | Golpe Certeiro 2/0,74 | dungeon |
| 🆕 | Físico Nuclear Renegado `f_fisico` | 🔮 mago | 5897 | 7609 | Lança Arcana 3/0,95 | dungeon |
| 🆕 | Piloto de Mecha Pesado `f_piloto_mecha` | 🛡️ tank | 3541 | 4570 | Muralha 2/0,84 | dungeon |
| 🆕 | Androide Diplomata `f_androide` | ✨ suporte | 4302 | 5551 | Bênção 2/0,63 | dungeon |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Lâmina Vibratória | mão · médio | branca | dano 72 | For C · Des C | For 16 / 8 · Des 8 | 715 |
| ✅ | Montante Flamejante `g_montante_flamejante` _(hoje: For 10, Des 4)_ | mão · pesado | branca | dano 120 | For B · Des D | For 28 / 14 · Des 4 | 800 |
| 🆕 | Pistola de Plasma | mão · leve | de fogo | dano 60 | Des B · For E | For 4 / 2 · Des 12 | 705 |
| 🆕 | Canhão Gauss | mão · pesado | de fogo | dano 120 | Des A · For E | For 14 / 7 · Des 16 | 760 |
| 🆕 | Selo de Fissão | mão · leve | mágica | dano 60 | Int B · Des E | For 4 / 2 · Int 12 | 705 |
| ✅ | Grimório Selado `g_grimorio_selado` _(hoje: Int 10, Mana 5)_ | mão · pesado | mágica | dano 120 | Int A | For 12 / 6 · Int 16 | 800 |
| 🆕 | Gerador de Escudo Pessoal | mão (escudo) | — | defesa 120 | — | — | 705 |
| 🆕 | Núcleo de Urânio Encantado | mão · leve (foco) | mágica | dano 60 | Int B · Des E | For 4 / 2 · Int 12 | 705 |
| ✅ | Coroa do Estrategista `g_coroa_estrategista` _(hoje: Int 5, Car 4)_ | cabeça | — | defesa 84 | — | — | 700 |
| ✅ | Armadura de Placas `g_armadura_placas` _(hoje: Res 9, Vida 4)_ | corpo | — | defesa 102 | — | — | 780 |
| ✅ | Colar do Destino `g_colar_destino` | acessório | — | Sor 5, Car 3 | — | — | 750 |
| 🆕 | Pingente de Âmbar | acessório | — | Vida 4, Res 2, Mana 2 | — | — | 710 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| ✅ | Tempestade | ataque | 16 | 5 | 0,62 | 4.200 |
| ✅ | Regeneração | suporte | 16 | 5 | 0,65 | 4.500 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| 🆕 | Atravessar o Pântano Fervente `d_pantano` | 31 | 7.569 | 4.168 | Raro 25% · Épico 38% · Lendário 6% |
| 🆕 | Derrubar o Mecha Desgovernado `d_mecha` | 33 | 8.088 | 4.483 | Raro 25% · Épico 38% · Lendário 8% |
| ✅ | Enfrentar o Guardião de Pedra `d_guardiao` (hoje: nível 18, difícil, 520/420) | 35 | 8.624 | 4.810 | Raro 25% · Épico 38% · Lendário 10% |
| 🆕 | Fechar o Reator em Colapso `d_reator` | 39 | 9.714 | 5.488 | Raro 25% · Épico 38% · Lendário 14% · Mítico 2% |

### Dungeon — Zona do Reator 🆕

Mundo aberto da dificuldade 4 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — mutantes, robôs de contenção, enxames radioativos. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — Hidra do Reator `b_hidra` 🆕

Nível 40 · poder **69.009** · risco **50.093** · vitória/sobrevivência: sozinho 9%/21% · 2 19%/39% · 3 28%/52% · 4 35%/60%. Garantido: item Épico; 25% de item Lendário; 20% de companheiro Épico.

---

## Dificuldade 5 — Tectônico (6-C – High 6-A) · níveis 41–50 · Lendário (×2,8)

### Companheiros

| | nome | classe | soma no nível 41 | soma no nível 50 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| ✅ | Ceifador de Auroras `f_ceifador` | ⚔️ combatente | 3513 | 4284 | Golpe Certeiro 2/0,98 | dungeon |
| ✅ | Tecelão do Vazio `f_tecelao` | 🔮 mago | 10398 | 12680 | Lança Arcana 3/1,26 | dungeon |
| ✅ | O Inabalável `f_inabalavel` | 🛡️ tank | 6245 | 7615 | Muralha 2/1,12 | dungeon |
| ✅ | Estrela Cadente `f_estrela` | ✨ suporte | 7585 | 9251 | Bênção 2/0,84 | dungeon |
| 🆕 | Caçador de Kaiju `f_cacador_kaiju` | ⚔️ combatente | 3513 | 4284 | Golpe Certeiro 2/0,98 | dungeon |
| 🆕 | Xamã das Placas `f_xama_placas` | 🔮 mago | 10398 | 12680 | Lança Arcana 3/1,26 | dungeon |
| 🆕 | Titã de Concreto Armado `f_tita_concreto` | 🛡️ tank | 6245 | 7615 | Muralha 2/1,12 | dungeon |
| 🆕 | Oráculo Sismógrafo `f_sismografo` | ✨ suporte | 7585 | 9251 | Bênção 2/0,84 | dungeon |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Machado Sísmico | mão · médio | branca | dano 120 | For C · Des C | For 20 / 10 · Des 10 | 2.680 |
| ✅ | Lâmina Aurora `g_lamina_aurora` _(hoje: For 16, Des 8, Agi 4)_ | mão · pesado | branca | dano 200 | For B · Des D | For 35 / 18 · Des 5 | 3.000 |
| 🆕 | Pistola de Pulso Sísmico | mão · leve | de fogo | dano 100 | Des B · For E | For 5 / 3 · Des 15 | 2.635 |
| 🆕 | Lança-Magma | mão · pesado | de fogo | dano 200 | Des A · For E | For 18 / 9 · Des 20 | 2.850 |
| 🆕 | Varinha da Placa Continental | mão · leve | mágica | dano 100 | Int B · Des E | For 5 / 3 · Int 15 | 2.635 |
| ✅ | Cajado do Vazio `g_cajado_vazio` _(hoje: Int 16, Mana 8)_ | mão · pesado | mágica | dano 200 | Int A | For 14 / 7 · Int 20 | 3.000 |
| 🆕 | Escudo de Crosta | mão (escudo) | — | defesa 200 | — | — | 2.635 |
| 🆕 | Prisma Tectônico | mão · leve (foco) | mágica | dano 100 | Int B · Des E | For 5 / 3 · Int 15 | 2.635 |
| ✅ | Elmo do Dragão `g_elmo_dragao` _(hoje: Res 8, Vida 6, For 3)_ | cabeça | — | defesa 140 | — | — | 2.600 |
| ✅ | Manto Estelar `g_manto_estelar` _(hoje: Res 14, Vida 7)_ | corpo | — | defesa 170 | — | — | 2.900 |
| ✅ | Anel do Infinito `g_anel_infinito` | acessório | — | Sor 8, Car 6 | — | — | 2.800 |
| 🆕 | Coração de Ferro-Estelar | acessório | — | Vida 7, Res 3, Mana 3 | — | — | 2.660 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| ✅ | Juízo Final | ataque | 21 | 8 | 0,85 | 14.000 |
| ✅ | Intervenção Divina | suporte | 21 | 8 | 0,88 | 15.000 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| 🆕 | Selar a Fenda do Vale `d_fenda` | 41 | 19.414 | 10.615 | Épico 25% · Lendário 38% · Mítico 6% |
| ✅ | Invadir o Ninho da Serpente `d_serpente` (hoje: nível 22, difícil, 950/780) | 43 | 20.473 | 11.263 | Épico 25% · Lendário 38% · Mítico 8% |
| 🆕 | Conter a Avalanche Viva `d_avalanche` | 46 | 22.058 | 12.234 | Épico 25% · Lendário 38% · Mítico 11% |
| 🆕 | Afundar o Kaiju na Baía `d_kaiju` | 49 | 23.782 | 13.289 | Épico 25% · Lendário 38% · Mítico 14% · Celestial 2% |

### Dungeon — Montanha Partida 🆕

Mundo aberto da dificuldade 5 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — serpes, golens de lava, cultistas do dragão. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — Dragão da Montanha Partida `b_dragao` 🆕

Nível 50 · poder **181.343** · risco **129.315** · vitória/sobrevivência: sozinho 8%/20% · 2 18%/39% · 3 27%/51% · 4 35%/60%. Garantido: item Lendário; 25% de item Mítico; 20% de companheiro Lendário.

---

## Dificuldade 6 — Planetário (5-C – High 5-A) · níveis 51–60 · Mítico (×3,8)

### Companheiros

| | nome | classe | soma no nível 51 | soma no nível 60 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| 🆕 | Rachador de Continentes `f_rachador` | ⚔️ combatente | 5930 | 6975 | Golpe Certeiro 2/1,33 | missão da faixa ou Titã do Núcleo |
| 🆕 | Geomante do Núcleo `f_geomante` | 🔮 mago | 17552 | 20649 | Lança Arcana 3/1,71 | missão da faixa ou Titã do Núcleo |
| 🆕 | Colosso de Basalto `f_colosso` | 🛡️ tank | 10541 | 12403 | Muralha 2/1,52 | missão da faixa ou Titã do Núcleo |
| 🆕 | Pastora das Marés `f_pastora` | ✨ suporte | 12806 | 15067 | Bênção 2/1,14 | missão da faixa ou Titã do Núcleo |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Gládio de Núcleo Fundido | mão · médio | branca | dano 192 | For C · Des C | For 24 / 12 · Des 12 | 10.060 |
| 🆕 | Martelo da Placa Tectônica | mão · pesado | branca | dano 320 | For B · Des D | For 42 / 21 · Des 6 | 10.700 |
| 🆕 | Pistola de Gravidade | mão · leve | de fogo | dano 160 | Des B · For E | For 6 / 3 · Des 18 | 9.900 |
| 🆕 | Canhão Orbital Portátil | mão · pesado | de fogo | dano 320 | Des A · For E | For 21 / 11 · Des 24 | 10.700 |
| 🆕 | Varinha de Magma | mão · leve | mágica | dano 160 | Int B · Des E | For 6 / 3 · Int 18 | 9.900 |
| 🆕 | Cetro do Núcleo Fundido | mão · pesado | mágica | dano 320 | Int A | For 17 / 9 · Int 24 | 10.700 |
| 🆕 | Escudo de Magnetosfera | mão (escudo) | — | defesa 320 | — | — | 9.900 |
| 🆕 | Orbe Atmosférico | mão · leve (foco) | mágica | dano 160 | Int B · Des E | For 6 / 3 · Int 18 | 9.900 |
| 🆕 | Elmo de Obsidiana | cabeça | — | defesa 224 | — | — | 10.220 |
| 🆕 | Couraça de Basalto | corpo | — | defesa 272 | — | — | 10.460 |
| 🆕 | Anel das Marés | acessório | — | Sor 13, Car 9 | — | — | 9.980 |
| 🆕 | Amuleto do Manto Terrestre | acessório | — | Vida 11, Res 6, Mana 6 | — | — | 9.980 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| 🆕 | Chuva de Cometas | ataque | 26 | 12 | 1,1 | 53.000 |
| 🆕 | Égide Planetária | suporte | 26 | 12 | 1,13 | 56.000 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| 🆕 | Fechar um Vulcão Desperto `d_vulcao` | 52 | 44.641 | 24.277 | Lendário 25% · Mítico 38% · Celestial 7% |
| 🆕 | Afundar a Ilha Errante `d_ilha` | 55 | 47.804 | 28.402 | Lendário 25% · Mítico 38% · Celestial 10% |
| 🆕 | Derrubar a Arca de Guerra Orbital `d_arca` | 57 | 53.901 | 29.775 | Lendário 25% · Mítico 38% · Celestial 12% |
| 🆕 | Domar o Terremoto Encarnado `d_terremoto` | 59 | 56.192 | 31.182 | Lendário 25% · Mítico 38% · Celestial 14% · Divino 2% |

### Dungeon — Núcleo do Mundo 🆕

Mundo aberto da dificuldade 6 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — elementais de magma, máquinas escavadoras, titãs menores. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — Titã do Núcleo `b_tita` 🆕

Nível 60 · poder **450.062** · risco **317.327** · vitória/sobrevivência: sozinho 8%/19% · 2 18%/38% · 3 27%/51% · 4 35%/60%. Garantido: item Mítico; 25% de item Celestial; 20% de companheiro Mítico.

---

## Dificuldade 7 — Estelar (Low 4-C – 4-A) · níveis 61–70 · Celestial (×5,1)

### Companheiros

| | nome | classe | soma no nível 61 | soma no nível 70 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| 🆕 | Cavaleiro da Coroa Solar `f_cavaleiro_solar` | ⚔️ combatente | 9519 | 10921 | Golpe Certeiro 2/1,78 | missão da faixa ou Serafim da Estrela Negra |
| 🆕 | Astrólogo de Supernovas `f_astrologo` | 🔮 mago | 28174 | 32330 | Lança Arcana 3/2,3 | missão da faixa ou Serafim da Estrela Negra |
| 🆕 | Sentinela de Órbita `f_sentinela_orbita` | 🛡️ tank | 16922 | 19419 | Muralha 2/2,04 | missão da faixa ou Serafim da Estrela Negra |
| 🆕 | Cantora das Constelações `f_cantora` | ✨ suporte | 20559 | 23590 | Bênção 2/1,53 | missão da faixa ou Serafim da Estrela Negra |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Adaga de Plasma Solar | mão · médio | branca | dano 307 | For C · Des C | For 28 / 14 · Des 14 | 37.600 |
| 🆕 | Espada da Coroa Solar | mão · pesado | branca | dano 512 | For B · Des D | For 49 / 25 · Des 7 | 40.000 |
| 🆕 | Pistola de Fusão | mão · leve | de fogo | dano 256 | Des B · For E | For 7 / 4 · Des 21 | 37.000 |
| 🆕 | Rifle de Raio Estelar | mão · pesado | de fogo | dano 512 | Des A · For E | For 25 / 13 · Des 28 | 40.000 |
| 🆕 | Varinha de Luz Fóssil | mão · leve | mágica | dano 256 | Int B · Des E | For 7 / 4 · Int 21 | 37.000 |
| 🆕 | Astrolábio Vivo | mão · pesado | mágica | dano 512 | Int A | For 20 / 10 · Int 28 | 40.000 |
| 🆕 | Égide de Vento Solar | mão (escudo) | — | defesa 512 | — | — | 37.000 |
| 🆕 | Fragmento de Anã Branca | mão · leve (foco) | mágica | dano 256 | Int B · Des E | For 7 / 4 · Int 21 | 37.000 |
| 🆕 | Elmo de Órbita | cabeça | — | defesa 358 | — | — | 38.200 |
| 🆕 | Armadura de Fotosfera | corpo | — | defesa 435 | — | — | 39.100 |
| 🆕 | Broche da Constelação | acessório | — | Sor 20, Car 15 | — | — | 37.300 |
| 🆕 | Talismã da Gravidade | acessório | — | Vida 18, Res 9, Mana 9 | — | — | 37.300 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| 🆕 | Supernova | ataque | 31 | 17 | 1,38 | 197.000 |
| 🆕 | Véu da Nebulosa | suporte | 31 | 17 | 1,42 | 211.000 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| 🆕 | Recolher Destroços de Lua `d_destrocos` | 62 | 77.261 | 54.711 | Mítico 25% · Celestial 38% · Divino 7% |
| 🆕 | Abordar o Cruzador Estelar `d_cruzador` | 64 | 93.260 | 50.605 | Mítico 25% · Celestial 38% · Divino 9% |
| 🆕 | Desviar o Cometa Faminto `d_cometa` | 67 | 98.790 | 59.354 | Mítico 25% · Celestial 38% · Divino 12% |
| 🆕 | Reacender o Sol Moribundo `d_sol` | 69 | 102.442 | 63.374 | Mítico 25% · Celestial 38% · Divino 14% · Primordial 2% |

### Dungeon — Coroa da Estrela Negra 🆕

Mundo aberto da dificuldade 7 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — anjos caídos, naves-sentinela, plasma vivo. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — Serafim da Estrela Negra `b_serafim` 🆕

Nível 70 · poder **826.001** · risco **658.022** · vitória/sobrevivência: sozinho 8%/19% · 2 18%/38% · 3 27%/51% · 4 35%/60%. Garantido: item Celestial; 25% de item Divino; 20% de companheiro Celestial.

---

## Dificuldade 8 — Cósmico (3-C – High 3-A) · níveis 71–80 · Divino (×6,9)

### Companheiros

| | nome | classe | soma no nível 71 | soma no nível 80 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| 🆕 | Ceifador de Galáxias `f_ceifador_galaxias` | ⚔️ combatente | 14988 | 16886 | Golpe Certeiro 2/2,42 | missão da faixa ou O Devorador de Galáxias |
| 🆕 | Arquiteto do Vácuo `f_arquiteto` | 🔮 mago | 44366 | 49990 | Lança Arcana 3/3,11 | missão da faixa ou O Devorador de Galáxias |
| 🆕 | Muralha do Horizonte `f_muralha` | 🛡️ tank | 26648 | 30024 | Muralha 2/2,76 | missão da faixa ou O Devorador de Galáxias |
| 🆕 | Tecelã de Nebulosas `f_teceloa` | ✨ suporte | 32372 | 36477 | Bênção 2/2,07 | missão da faixa ou O Devorador de Galáxias |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Faca de Horizonte | mão · médio | branca | dano 490 | For C · Des C | For 32 / 16 · Des 16 | 141.000 |
| 🆕 | Foice do Horizonte de Eventos | mão · pesado | branca | dano 816 | For B · Des D | For 56 / 28 · Des 8 | 150.000 |
| 🆕 | Pistola de Antimatéria | mão · leve | de fogo | dano 408 | Des B · For E | For 8 / 4 · Des 24 | 138.750 |
| 🆕 | Canhão de Quasar | mão · pesado | de fogo | dano 816 | Des A · For E | For 28 / 14 · Des 32 | 150.000 |
| 🆕 | Varinha de Matéria Escura | mão · leve | mágica | dano 408 | Int B · Des E | For 8 / 4 · Int 24 | 138.750 |
| 🆕 | Grimório do Vácuo | mão · pesado | mágica | dano 816 | Int A | For 23 / 12 · Int 32 | 150.000 |
| 🆕 | Escudo de Lente Gravitacional | mão (escudo) | — | defesa 816 | — | — | 138.750 |
| 🆕 | Semente de Galáxia | mão · leve (foco) | mágica | dano 408 | Int B · Des E | For 8 / 4 · Int 24 | 138.750 |
| 🆕 | Coroa da Nebulosa | cabeça | — | defesa 571 | — | — | 143.250 |
| 🆕 | Manto de Matéria Escura | corpo | — | defesa 694 | — | — | 146.625 |
| 🆕 | Dado dos Deuses | acessório | — | Sor 32, Car 24 | — | — | 139.875 |
| 🆕 | Coração de Pulsar | acessório | — | Vida 28, Res 14, Mana 14 | — | — | 139.875 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| 🆕 | Colapso Galáctico | ataque | 36 | 23 | 1,68 | 738.000 |
| 🆕 | Eternidade | suporte | 36 | 23 | 1,73 | 791.000 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| 🆕 | Mapear o Vazio entre Galáxias `d_vazio` | 72 | 163.951 | 105.313 | Celestial 25% · Divino 38% · Primordial 7% |
| 🆕 | Fechar o Buraco de Minhoca `d_minhoca` | 75 | 172.715 | 117.948 | Celestial 25% · Divino 38% · Primordial 10% |
| 🆕 | Sabotar a Frota do Enxame `d_enxame` | 77 | 178.490 | 126.596 | Celestial 25% · Divino 38% · Primordial 12% |
| 🆕 | Atravessar o Disco de Acreção `d_acrecao` | 79 | 184.354 | 134.609 | Celestial 25% · Divino 38% · Primordial 14% · Supremo 2% |

### Dungeon — Rastro do Devorador 🆕

Mundo aberto da dificuldade 8 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — arautos, enxames estelares, bocas do vazio. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — O Devorador de Galáxias `b_devorador` 🆕

Nível 80 · poder **1.495.819** · risco **1.428.375** · vitória/sobrevivência: sozinho 8%/18% · 2 18%/38% · 3 27%/51% · 4 35%/60%. Garantido: item Divino; 25% de item Primordial; 20% de companheiro Divino.

---

## Dificuldade 9 — Multiversal (Low 2-C – 2-A) · níveis 81–90 · Primordial (×9,3)

### Companheiros

| | nome | classe | soma no nível 81 | soma no nível 90 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| 🆕 | Espadachim dos Mundos Partidos `f_espadachim_mundos` | ⚔️ combatente | 23045 | 25605 | Golpe Certeiro 2/3,26 | missão da faixa ou O Rei de Todos os Mundos |
| 🆕 | Escriba dos Ramos do Tempo `f_escriba_ramos` | 🔮 mago | 68220 | 75801 | Lança Arcana 3/4,19 | missão da faixa ou O Rei de Todos os Mundos |
| 🆕 | Guardião do Limiar `f_guardiao_limiar` | 🛡️ tank | 40972 | 45524 | Muralha 2/3,72 | missão da faixa ou O Rei de Todos os Mundos |
| 🆕 | Oráculo das Mil Versões `f_oraculo_versoes` | ✨ suporte | 49777 | 55310 | Bênção 2/2,79 | missão da faixa ou O Rei de Todos os Mundos |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Estilete entre Mundos | mão · médio | branca | dano 787 | For C · Des C | For 36 / 18 · Des 18 | 529.220 |
| 🆕 | Lâmina do Ramo Partido | mão · pesado | branca | dano 1.312 | For B · Des D | For 63 / 32 · Des 9 | 563.000 |
| 🆕 | Revólver de Mil Balas Possíveis | mão · leve | de fogo | dano 656 | Des B · For E | For 9 / 5 · Des 27 | 520.775 |
| 🆕 | Rifle de Linha do Tempo | mão · pesado | de fogo | dano 1.312 | Des A · For E | For 32 / 16 · Des 36 | 563.000 |
| 🆕 | Varinha de Duas Realidades | mão · leve | mágica | dano 656 | Int B · Des E | For 9 / 5 · Int 27 | 520.775 |
| 🆕 | Cajado das Linhas do Tempo | mão · pesado | mágica | dano 1.312 | Int A | For 26 / 13 · Int 36 | 563.000 |
| 🆕 | Escudo do Futuro Recusado | mão (escudo) | — | defesa 1.312 | — | — | 520.775 |
| 🆕 | Bússola de Ramos | mão · leve (foco) | mágica | dano 656 | Int B · Des E | For 9 / 5 · Int 27 | 520.775 |
| 🆕 | Elmo do Limiar | cabeça | — | defesa 918 | — | — | 537.665 |
| 🆕 | Armadura do Paradoxo | corpo | — | defesa 1.115 | — | — | 550.335 |
| 🆕 | Moeda de Duas Faces | acessório | — | Sor 51, Car 39 | — | — | 525.000 |
| 🆕 | Âncora Portátil | acessório | — | Vida 45, Res 23, Mana 23 | — | — | 525.000 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| 🆕 | Ruptura entre Mundos | ataque | 41 | 30 | 2 | 2.769.000 |
| 🆕 | Âncora da Realidade | suporte | 41 | 30 | 2,06 | 2.966.000 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| 🆕 | Remendar uma Linha do Tempo `d_remendo` | 82 | 341.817 | 221.531 | Divino 25% · Primordial 38% · Supremo 7% |
| 🆕 | Expulsar o Duplo de Outro Mundo `d_duplo` | 84 | 352.389 | 225.629 | Divino 25% · Primordial 38% · Supremo 9% |
| 🆕 | Fugir de um Universo que Desaba `d_desaba` | 87 | 368.832 | 252.639 | Divino 25% · Primordial 38% · Supremo 12% |
| 🆕 | Impedir a Colisão de Universos `d_colisao` | 89 | 379.701 | 266.583 | Divino 25% · Primordial 38% · Supremo 14% |

### Dungeon — Encruzilhada dos Mundos 🆕

Mundo aberto da dificuldade 9 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — duplos, cavaleiros de outra linha do tempo, paradoxos. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — O Rei de Todos os Mundos `b_rei_mundos` 🆕

Nível 90 · poder **3.150.135** · risco **2.864.523** · vitória/sobrevivência: sozinho 8%/18% · 2 18%/38% · 3 27%/51% · 4 35%/60%. Garantido: item Primordial; 25% de item Supremo; 20% de companheiro Primordial.

---

## Dificuldade 10 — Hiperversal (Low 1-C – 0) · níveis 91–100+ · Supremo (×12,6)

### Companheiros

| | nome | classe | soma no nível 91 | soma no nível 100 | magia (custo/poder) | como se obtém |
|---|---|---|---|---|---|---|
| 🆕 | O Último Golpe `f_ultimo_golpe` | ⚔️ combatente | 35076 | 38544 | Golpe Certeiro 2/4,41 | missão da faixa ou Aquele que Lê o Mundo |
| 🆕 | Autor Sem Nome `f_autor` | 🔮 mago | 103838 | 114106 | Lança Arcana 3/5,67 | missão da faixa ou Aquele que Lê o Mundo |
| 🆕 | O Que Não Cede `f_que_nao_cede` | 🛡️ tank | 62364 | 68533 | Muralha 2/5,04 | missão da faixa ou Aquele que Lê o Mundo |
| 🆕 | Eco do Primeiro Verbo `f_eco` | ✨ suporte | 75768 | 83261 | Bênção 2/3,78 | missão da faixa ou Aquele que Lê o Mundo |

### Itens

| | nome | vaga · porte | tipo | dano / defesa / bônus | escala | requisito (1 mão / 2 mãos) | preço |
|---|---|---|---|---|---|---|---|
| 🆕 | Ponto Final | mão · médio | branca | dano 1.258 | For C · Des C | For 40 / 20 · Des 20 | 1.983.400 |
| 🆕 | A Primeira Espada | mão · pesado | branca | dano 2.096 | For B · Des D | For 70 / 35 · Des 10 | 2.110.000 |
| 🆕 | Arma de Uma Frase Só | mão · leve | de fogo | dano 1.048 | Des B · For E | For 10 / 5 · Des 30 | 1.951.750 |
| 🆕 | Canhão do Argumento Definitivo | mão · pesado | de fogo | dano 2.096 | Des A · For E | For 35 / 18 · Des 40 | 2.110.000 |
| 🆕 | Borracha da Realidade | mão · leve | mágica | dano 1.048 | Int B · Des E | For 10 / 5 · Int 30 | 1.951.750 |
| 🆕 | Pena do Autor | mão · pesado | mágica | dano 2.096 | Int A | For 28 / 14 · Int 40 | 2.110.000 |
| 🆕 | Margem da Página | mão (escudo) | — | defesa 2.096 | — | — | 1.951.750 |
| 🆕 | Sumário de Tudo | mão · leve (foco) | mágica | dano 1.048 | Int B · Des E | For 10 / 5 · Int 30 | 1.951.750 |
| 🆕 | Coroa Sem Reino | cabeça | — | defesa 1.467 | — | — | 2.015.050 |
| 🆕 | Veste do Que Antecede | corpo | — | defesa 1.782 | — | — | 2.062.525 |
| 🆕 | Sorte Escrita | acessório | — | Sor 82, Car 62 | — | — | 1.967.575 |
| 🆕 | Selo do Fim | acessório | — | Vida 72, Res 36, Mana 36 | — | — | 1.967.575 |

### Magias do grimório

| | nome | tipo | Int mín. | custo | poder | preço |
|---|---|---|---|---|---|---|
| 🆕 | Verbo Primeiro | ataque | 46 | 38 | 2,35 | 10.382.000 |
| 🆕 | Fim das Narrativas | suporte | 46 | 38 | 2,42 | 11.124.000 |

### Contratos (missões da guilda — pagos pelo banco)

| | nome | nível | poder | risco | loot |
|---|---|---|---|---|---|
| 🆕 | Reescrever um Parágrafo da Realidade `d_paragrafo` | 92 | 710.403 | 449.048 | Primordial 25% · Supremo 38% |
| 🆕 | Atravessar a Margem da História `d_margem` | 94 | 730.039 | 473.162 | Primordial 25% · Supremo 38% |
| 🆕 | Discutir com o Narrador `d_narrador` | 97 | 760.921 | 514.959 | Primordial 25% · Supremo 38% |
| 🆕 | Sobreviver ao Último Capítulo `d_capitulo` | 99 | 781.314 | 539.717 | Primordial 25% · Supremo 38% |

### Dungeon — A Última Página 🆕

Mundo aberto da dificuldade 10 (`ECONOMIA-E-DUNGEONS.md`): encontros sorteados no seu nível — personagens apagados, rascunhos, a própria narrativa. Paga do **tesouro da dungeon**, que se renova; loot: os itens desta dificuldade. O chefe fica no fim:

### Chefe — Aquele que Lê o Mundo `b_leitor` 🆕

Nível 100 · poder **6.600.094** · risco **5.938.785** · vitória/sobrevivência: sozinho 7%/18% · 2 18%/37% · 3 27%/51% · 4 35%/60%. Garantido: item Supremo; 25% de um segundo item Supremo; 20% de companheiro Supremo.

---

## Missões especiais — exemplos

Sete exemplos genéricos (um item, um implante, uma magia ou um companheiro únicos por missão, de O Relógio Parado no nível 15 a A Página em Branco no 95) estão no `ESPECIAIS-E-HISTORIAS.md` §1.4.
