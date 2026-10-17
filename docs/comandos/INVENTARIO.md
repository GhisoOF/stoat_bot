# Inventário de comandos

Gerado por `INVENTARIO=1 node testes.mjs comandos-17out` — **não edite à mão**. É a foto do que existe antes da
reestruturação dos comandos num registro central (fase 0). A suíte `comandos-17out` compara o bot com o
`inventario.json` desta pasta: nome que some ou muda de destino faz o teste falhar.

**48 comandos · 149 nomes · 557 subcomandos em inglês · 334 telas de ajuda · 987 exemplos executados**

## Comandos

| Comando | Nome na tela em inglês | Todos os nomes que levam a ele | Função | Liga/desliga | Exemplos na ajuda |
|---|---|---|---|---|---|
| `acesso` | `access` | `access` | `cmdAcesso` | sim | 40 |
| `adeus` | `goodbye` | `despedida` `farewell` `goodbye` | `adeus (cmd)` | sim | 6 |
| `assistente` | `wizard` | `assistant` `configurar` `configure` `setup` `wizard` | `cmdAssistente` | sim | 12 |
| `automod` | — | — | `cmdAutomod` | sim | 126 |
| `autorole` | — | — | `cmdAutorole` | sim | 14 |
| `ban` | — | — | `cmdBan` | sim | 7 |
| `banglobal` | `globalban` | `globalban` | `cmdBanGlobal` | sim | 50 |
| `boasvindas` | `welcome` | `bemvindo` `boas-vindas` `greeting` `welcome` | `boasvindas (cmd)` | sim | 26 |
| `cargomudo` | `muterole` | `criarcargomudo` `mutedrole` `muterole` | `cmdCargoMudo` | — | 0 |
| `chat` | — | `ia` | `cmdChat` | só IA | 2 |
| `comando` | `command` | `comandos` `command` | `cmdComando` | — | 14 |
| `config` | — | `configuracoes` `configurações` | `cmdConfig` | — | 2 |
| `cor` | `color` | `cargocor` `color` `colour` `cores` | `cmdCor` | sim | 48 |
| `debug` | — | `diagnostico` `diagnóstico` | `cmdDebug` | — | 8 |
| `economia` | `economy` | `eco` `economy` | `cmdEconomia` | sim | 34 |
| `embed` | — | — | `cmdEmbed` | sim | 12 |
| `entrar` | `join` | `call` `join` | `entrar` | — | 2 |
| `entretenimento` | `entertainment` | `ent` `entertainment` `entreterimento` `fun` | `cmdEntretenimento` | sim | 46 |
| `fuso` | `timezone` | `clock` `fusos` `hora` `timezone` `timezones` `tz` | `cmdFuso` | sim | 30 |
| `game` | `game` | `character` `personagem` `rpg` | `cmdGame` | sim | 201 |
| `help` | — | — | `cmdHelp` | — | 156 |
| `idioma` | `language` | `lang` `language` | `cmdIdioma` | — | 10 |
| `iniciativa` | — | `init` `initiative` | `cmdIniciativa` | sim | 6 |
| `kick` | — | — | `cmdKick` | sim | 7 |
| `limpar` | `purge` | `clear` `limpiar` `purge` | `cmdLimpar` | sim | 10 |
| `log` | `log` | `logs` | `cmdLog` | sim | 17 |
| `modia` | — | `moderacaoia` | `cmdModIA` | só IA | 18 |
| `musica` | `music` | `m` `music` `play` `tocar` | `cmdMusica` | sim | 4 |
| `personalidade` | — | `personality` | `cmdPersonalidade` | — | 2 |
| `ping` | — | — | `cmdPing` | sim | 2 |
| `reactionrole` | — | `reactionroles` `rr` | `cmdReactionRole` | sim | 28 |
| `repete` | — | — | `cmdRepete` | sim | 4 |
| `reset` | — | `fabrica` `factoryreset` `redefinir` `resetar` | `cmdReset` | — | 8 |
| `rolar` | — | `dado` `dados` `r` `roll` | `cmdRolar` | sim | 6 |
| `rss` | — | `feed` | `cmdRss` | sim | 20 |
| `sair` | `leave` | `leave` `sairdacall` | `sair` | — | 2 |
| `servidor` | `server` | `server` `serverinfo` `servidorinfo` | `cmdServidor` | sim | 24 |
| `servidores` | `servers` | `servers` | `cmdServidores` | — | 22 |
| `silenciar` | `silence` | `mute` `silence` `silencio` `timeout` | `cmdSilenciar` | sim | 9 |
| `sobre` | `about` | `about` `info` | `cmdSobre` | — | 2 |
| `staff` | `staff` | `equipe` `team` | `cmdStaff` | sim | 16 |
| `ticket` | — | `suporte` `tickets` | `cmdTicket` | sim | 6 |
| `tts` | — | `falar` `speak` `voz` | `cmdTts` | sim | 2 |
| `tutorial` | `tutorial` | `comecar` `guia` `guide` `inicio` `start` | `cmdTutorial` | sim | 52 |
| `userinfo` | — | — | `cmdUserinfo` | sim | 5 |
| `warn` | `warn` | `avisar` | `cmdWarn` | sim | 20 |
| `webhook` | — | `gancho` `webhooks` `wh` | `cmdWebhook` | sim | 20 |
| `xp` | `xp` | `level` `levels` `nivel` | `cmdXp` | sim | 35 |

_Comando_ é o nome interno (o que o `&comando desativar` e o banco guardam).

## Onde cada comando está declarado

O nome, os apelidos, o nome em inglês e as marcas de cada comando (gerenciável, só IA, voz, essencial,
qualquer canal, texto livre) moram **só** no registro, `modulos/comandos/` — um arquivo por família (fase 1).
Os subcomandos também, com o nome em inglês de cada um (fase 2), menos as duas famílias grandes.
O que ainda está espalhado:

| Lugar | O que guarda |
|---|---|
| `modulos/core/aliases.js` → `SUB_LEGADO`, `ANINHADOS`, `SO_EXIBIR` | os subcomandos do `&automod` (e das famílias dele) e do `&game` — os próximos a migrar |
| `modulos/core/aliases.js` → `PLACEHOLDER_EN` | os moldes da ajuda (`‹nome›` → `‹name›`), comuns a todos os comandos |
| `modulos/core/nomes-automod.js` | grupos, partes, modos e temas do automod nos dois idiomas |
| cada handler (`if (sub === … )`) | o parse dos subcomandos, muitas vezes já aceitando os dois idiomas |
| `help-arvore.js`, `geral.js` (`construirSubtopicos`, `construirDetalhes`) | as páginas de ajuda, PT e EN escritas em cópias separadas |
| `help-grupos.js`, `help-parametros.js`, `tutorial.js`, `assistente.js` | índice, parâmetros, tutorial e os comandos que o assistente gera |

## Subcomandos em inglês (entrada)

- `acesso`: all→todos, channel→canal, channels→canais, clear→limpar, except→exceto, only→somente, role→cargo, roles→cargos, staffbypass→staffignora, staffignores→staffignora
- `adeus`: channel→canal, clear→limpar, color→cor, colour→cor, default→padrao, here→aqui, hidden→oculto, hide→oculto, image→imagem, message→texto, show→visivel, test→testar, text→texto, title→titulo, visible→visivel
- `assistente`: cancel→cancelar, channels→canais, complete→completo, fast→rapido, full→completo, protect→protecao, protection→protecao, quick→rapido, stop→cancelar
- `automod`: antinoise→antiruido, ban→banir, confirm→confirmar, delete→apagar, ignore→ignorar, inherit→herdar, mentions→mencoes, messages→mensagens, noise→antiruido, punishment→punicao, repetition→repeticao, sentinel→sentinela, size→tamanho, stack→acumular, threshold→limiar, time→tempo, warn→avisar
- `automod.antilink`: domains→dominios, invites→convites
- `automod.antiruido`: characters→caracteres, ignore→ignorar, letters→letras, repetition→repeticao, size→tamanho, threshold→limiar
- `automod.antispam`: burst→rajada, media→midia, mentions→mencoes, messages→mensagens, minute→minuto, newcomer→novato, newcomers→novato, repeat→repeticao, speed→velocidade, time→tempo, times→vezes
- `automod.assuntos`: ai→ia, alert→alertar, allow→liberar, delete→apagar, drugs→drogas, high→alta, low→baixa, medium→media, politics→politica, punish→punir, religion→religiao, remove→remover, sensitivity→sensibilidade, watch→vigiar
- `automod.avatar`: action→acao, alert→alertar, ban→banir, check→checar, kick→expulsar, mute→silenciar, silence→silenciar, time→tempo, timeout→silenciar
- `automod.odio`: list→lista, remove→remover
- `automod.sentinela`: alert→alerta, alerts→alerta, ban→banir, channel→canal, content→conteudo, dismiss→liberar, hate→odio, high→alta, images→imagens, low→baixa, medium→media, pfp→avatar, sensitivity→sensibilidade, simulate→simular, subjects→assuntos, tenure→antiguidade, test→testar, topics→assuntos
- `autorole`: disable→desativar, remove→remover
- `banglobal`: accept→isentar, all→lista, allow→isentar, autoimport→auto, automatic→auto, ban→banir, banned→lista, bypass→isentar, confirm→confirmar, consensus→consenso, contribution→contribuicao, exempt→isentar, exempted→isentos, forget→esquecer, history→historico, import→importar, instant→imediato, list→lista, people→pessoas, remove→remover, revert→desfazer, review→revisar, scan→varrer, server→servidor, sweep→varrer, undo→desfazer, view→ver, warn→avisar
- `blocklist`: domains→dominios
- `boasvindas`: channel→canal, clear→limpar, color→cor, colour→cor, default→padrao, here→aqui, hidden→oculto, hide→oculto, image→imagem, message→texto, messages→mensagens, show→visivel, test→testar, text→texto, title→titulo, visible→visivel
- `chat`: all→tudo, care→cuidado, comment→comentar, every→todas, forget→esquecer, free→livre, gentle→gentil, here→aqui, map→mapear, mode→modo, perday→pordia, profile→perfil, relevant→relevante
- `comando`: disable→desativar, enable→ativar, manage→gerenciar, off→desativar, on→ativar
- `cor`: clear→limpar, create→criar, default→padrao, generate→gerar, gradient→gradiente, help→ajuda, here→aqui, list→lista, panel→painel, remove→remover, roles→cargos
- `debug`: channels→canais, mute→mudo, permissions→permissoes, raw→cru, read→ler
- `economia`: balance→saldo, buy→comprar, confirm→confirmar, gain→ganho, give→dar, interval→intervalo, mine→minerar, name→nome, pay→pagar, remove→remover, reset→zerar, shop→loja, symbol→simbolo, take→tirar
- `embed`: colors→cores, fields→campos
- `entretenimento`: 8ball→bola8, choose→escolher, fight→briga, fortune→sorte, mock→zoeira, pick→escolher, rate→nota, reverse→inverter
- `fuso`: alias→apelido, check→ver, cities→cidades, clear→limpar, find→buscar, format→formato, label→apelido, list→lista, main→principal, name→apelido, now→ver, reference→principal, search→buscar, time→ver
- `game`: accept→aceitar, add→adicionar, all→tudo, announce→anunciar, bag→mochila, balance→saldo, bank→banco, barter→escambo, boss→chefe, bosses→chefes, buy→comprar, cancel→cancelar, catalog→catalogo, class→classe, coin→moeda, commands→comandos, companion→follower, companions→followers, confirm→confirmar, contract→contrato, contracts→contratos, create→criar, currency→moeda, default→padrao, delete→apagar, dismiss→dispensar, drop→tirar, energy→energia, equip→equipar, erase→apagar, evolve→evoluir, exchange→cambio, fantasy→fantasia, give→dar, grimoire→grimorio, help→ajuda, hire→contratar, image→imagem, info→detalhe, inventory→inventario, items→itens, job→bico, jobs→bicos, join→entrar, learn→aprender, leave→sair, level→nivel, magic→magia, main→padrao, market→mercado, mercenaries→mercenarios, mission→missao, missions→missoes, model→modelo, new→novo, photos→fotos, picture→imagem, points→pontos, preview→prever, profile→perfil, rates→taxas, recruit→recrutar, recruits→recrutas, redo→refazer, remove→remover, rescue→resgatar, rest→descansar, retrieve→pegar, sell→vender, server→servidor, sheet→ficha, shop→loja, simple→simples, simulate→simular, special→especial, specials→especiais, spell→magia, spells→magias, spend→pontos, story→historia, take→levar, test→teste, trade→trocar, unequip→desequipar, use→usar, view→ver, wallet→carteira, wear→vestir, world→mundo
- `help`: character→game, configuration→config, customise→personalizar, customize→personalizar, diagnostics→diagnostico, fun→diversao, general→geral, levels→xp, moderation→moderacao, owner→dono, protect→proteger, protection→proteger, settings→config, start→comecar, tools→ferramentas, troubleshooting→diagnostico
- `idioma`: portuguese→portugues
- `iniciativa`: clear→limpar, list→lista, remove→remover
- `limpar`: all→tudo, everything→tudo
- `log`: channel→canal, commands→comandos, events→eventos, members→membros, messages→mensagens, punishments→punicoes, roles→cargos
- `modia`: channel→canal, clear→limpar, criteria→criterios
- `punicao`: ban→banir, confirm→confirmar, delete→apagar, ladder→escada, mode→modo, role→cargo, stack→acumular, steps→escada, warn→avisar
- `reactionrole`: exclusive→exclusivo, reload→recarregar, repair→reparar, unique→unico
- `rolar`: coin→moeda
- `rss`: category→categoria, channel→canal, now→agora, test→testar
- `scam`: ban→banir, channel→canal, dismiss→liberar, high→alta, low→baixa, medium→media, sensitivity→sensibilidade, simulate→simular, test→testar
- `sentinela`: ban→banir, channel→canal, dismiss→liberar, high→alta, low→baixa, medium→media, sensitivity→sensibilidade, simulate→simular, tenure→antiguidade, test→testar
- `servidor`: about→info, channels→canais, roles→cargos, rules→regras
- `servidores`: channel→canal, empty→vazias, here→aqui, now→agora, report→relatorio, subjects→assuntos, topics→assuntos
- `silenciar`: lift→tirar, off→tirar, remove→tirar, undo→tirar
- `staff`: clear→limpar, label→titulo, list→lista, team→equipe, title→titulo
- `ticket`: categories→categorias, delete→apagar, list→lista, panel→painel, team→equipe
- `tts`: broadcast→transmitir, cap→porminuto, channel→canal, diagnose→diagnostico, diagnostics→diagnostico, dictionary→dicionario, effect→efeito, filter→filtro, health→estado, here→aqui, join→entrar, leave→sair, names→nomes, perminute→porminuto, pitch→tom, read→ler, rescue→resgatar, resgate→resgatar, restart→reiniciar, sieve→filtro, start→entrar, status→estado, stop→sair, test→teste, tone→tom, unlock→destravar, unstick→destravar, voice→voz
- `tutorial`: adventure→aventura, ai→ia, channels→canais, economy→economia, messages→mensagens, moderation→moderacao, news→noticias, permissions→permissoes, roles→cargos, settings→ajustes
- `warn`: clear→limpar, list→lista
- `webhook`: channel→canal, create→criar, events→eventos, list→lista, remove→remover, test→testar
- `whitelist`: —
- `xp`: all→todos, announce→anuncio, announcement→anuncio, channel→canal, configure→configurar, create→criar, createroles→criarcargos, interval→intervalo, maxlevel→nivelmaximo, multiplier→multiplicador, restore→sincronizar, resync→sincronizar, roles→cargos, sync→sincronizar, wipe→zerar

## Exemplos da ajuda que respondem erro (pendências para as próximas fases)

Executados com valores de mentira no lugar dos `‹moldes›`, então parte disto é o valor (um item que não existe),
não a sintaxe. O que a suíte já trava (subcomando desconhecido, exemplo pronto com erro, português na tela em
inglês) não aparece aqui.

- [pt] `&reactionrole add ‹mensagem› ‹emoji› ‹cargo›` → ❌ Uso incorreto
- [pt] `&cor painel aqui` → ⏱️ não respondeu em 3 s
- [pt] `&embed titulo: … | descricao: …` → ❌ Embed vazio
- [pt] `&rss add ‹url›` → ❌ Feed inacessível
- [pt] `&comando desativar|ativar ‹nome›` → ❌ Comando inválido
- [pt] `&game pontos ‹atributo› [quantos]` → ❌ Qual atributo?
- [pt] `&game aprender ‹nome›` → ❌ Magia desconhecida
- [pt] `&game coop abrir ‹missão›` → ❓ Qual?
- [pt] `&game item ‹nome›` → ❌ Item desconhecido
- [pt] `&game desequipar ‹slot|item›` → ❌ Tirar o quê?
- [pt] `&cor ‹cargo› ‹cor|gradiente|preset›` → ❌ Não entendi a cor
- [pt] `&cor criar` → ⏱️ não respondeu em 3 s
- [pt] `&warn <@pessoa|id|nome> [motivo]` → ❌ Quem devo avisar?
- [pt] `&warn` → ❌ Quem devo avisar?
- [pt] `&automod ‹grupo›` → ❌ Não conheço esse
- [pt] `&automod ‹grupo› on|off` → ❌ Não conheço esse
- [pt] `&automod ‹grupo› ‹parte› on|off` → ❌ Não conheço esse
- [pt] `&rss add https://exemplo.com/feed.xml` → ❌ Feed inacessível
- [pt] `&staff titulo <@cargo> ‹texto›` → ❌ Não é um cargo de staff
- [pt] `&economia comprar ‹cargo›` → ❓ Qual cargo?
- [pt] `&entrar` → 🚫 Indisponível aqui
- [pt] `&sair` → 🚫 Indisponível aqui
- [pt] `&tts` → 🚫 Indisponível aqui
- [pt] `&fuso apelido ‹cidade› ‹texto›` → ❌ Cidade não está na lista
- [pt] `&fuso principal ‹cidade›` → ❌ Precisa estar na lista
- [pt] `&boasvindas testar` → ❌ Falta o canal
- [pt] `&chat` → 🚫 Não existe aqui
- [pt] `&reactionrole ‹add|remove|list›` → ❌ Uso incorreto
- [pt] `&reactionrole add ‹mensagem› ‹emoji› ‹idCargo›` → ❌ Uso incorreto
- [pt] `&reactionrole remove ‹mensagem›` → ❌ Uso incorreto
- [pt] `&reactionrole exclusivo ‹mensagem› on|off` → ❌ Uso incorreto
- [pt] `&reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...` → ❌ Uso incorreto
- [pt] `&limpar ‹quantidade› [@usuário] | tudo` → ❌ Não achei essa pessoa
- [pt] `&limpar` → ❌ Uso incorreto
- [pt] `&game admin item ‹nome› [@pessoa]` → ❌ Item desconhecido
- [pt] `&game admin follower ‹nome› [nível] [@pessoa]` → ❌ Follower desconhecido
- [pt] `&game admin pontos ‹n› [@pessoa]` → ❌ Sem personagem
- [pt] `&game admin nivel ‹n› [@pessoa]` → ❌ Sem personagem
- [pt] `&game admin simular ‹contrato|chefe› [n]` → ❌ Missão desconhecida
- [pt] `&game admin moeda ver ‹id›` → ❌ Moeda desconhecida
- [pt] `&game admin moeda set ‹id› ‹campo› ‹valor›` → ❌ Qual moeda?
- [pt] `&game coop abrir ‹contrato›` → ❓ Qual?
- [pt] `&game desequipar ‹vaga ou item›` → ❌ Tirar o quê?
- [pt] `&xp setup multiplicador ‹1–5›` → ❌ Valor inválido
- [pt] `&xp setup nivelmaximo ‹5–1000›` → ❌ Valor inválido
- [pt] `&xp setup xp ‹min› ‹max›` → ❌ Valor inválido
- [pt] `&acesso cargo add <@cargo|id>` → ❌ Cargo inválido
- [pt] `&acesso cargo remove <@cargo|id>` → ❌ Cargo inválido
- [pt] `&banglobal isentar <@pessoa|id>` → ❌ Não achei essa pessoa
- [pt] `&banglobal esquecer` → ❓ Quem?
- [pt] `&ban` → ❌ Uso incorreto
- [pt] `&banglobal esquecer <@usuário|id|nome> [nota]` → ❌ Não achei essa pessoa
- [pt] `&banglobal historico <@usuário|id>` → ❌ Não achei essa pessoa
- [pt] `&cor painel ‹id-do-canal›` → ⏱️ não respondeu em 3 s
- [pt] `&reactionrole exclusivo ‹mensagem› on` → ❌ Uso incorreto
- [pt] `&reactionrole exclusivo ‹mensagem› off` → ❌ Uso incorreto
- [pt] `&log ‹evento› ‹on|off›` → ❌ Canal inválido
- [pt] `&staff add` → ❓ Qual cargo?
- [pt] `&boasvindas on|off` → ❌ Falta o canal
- [pt] `&comando disable ‹nome›` → ❌ Comando inválido
- [pt] `&comando enable ‹nome›` → ❌ Comando inválido
- [pt] `&rss remove ‹id|url›` → ❓ Não encontrado
- [pt] `&rss agora` → ❌ Sem canal
- [pt] `&automod sentinela canal <#canal|aqui|off>` → ❌ Canal não encontrado
- [pt] `&automod sentinela canal <#canal|aqui>` → ❌ Canal não encontrado
- [pt] `&automod sentinela assuntos punicao ‹modo›` → ❌ Modo inválido
- [pt] `&automod ‹módulo› punicao ‹modo|herdar›` → ❌ Não conheço esse
- [pt] `&automod ‹grupo› set ‹parâmetro› ‹valor›` → ❌ Não conheço esse
- [pt] `&reactionrole add ‹link da mensagem› 🎮 Jogos` → ❌ Uso incorreto
- [pt] `&reactionrole exclusivo ‹link da mensagem› on` → ❌ Uso incorreto
- [pt] `&kick` → ❌ Uso incorreto
- [pt] `&automod punicao validade ‹dias|0›` → ❌ Uso
- [pt] `&reactionrole add ‹mensagem› 🎮 ‹id-do-cargo›` → ❌ Uso incorreto
- [pt] `&rss add ‹url-do-feed›` → ❌ Feed inacessível
- [pt] `&rss add https://g1.globo.com/rss/g1/` → ❌ Feed inacessível
- [pt] `&game coop abrir ‹contrato | dungeon X | chefe X›` → ❓ Qual?
- [pt] `&game trocar @pessoa ‹seu item› por ‹item dela›` → ❌ Item desconhecido
- [en] `&reactionrole add ‹message› ‹emoji› ‹role›` → ❌ Wrong usage
- [en] `&color panel here` → ⏱️ não respondeu em 3 s
- [en] `&embed title: … | description: …` → ❌ Empty embed
- [en] `&rss add ‹url›` → ❌ Unreachable feed
- [en] `&command disable|enable ‹name›` → ❌ Invalid command
- [en] `&game points ‹attribute› [amount]` → ❌ Which attribute?
- [en] `&game learn ‹name›` → ❌ Unknown spell
- [en] `&game mission ‹name›` → ❌ Unknown contract
- [en] `&game coop open ‹mission›` → ❓ Which one?
- [en] `&game companion take|drop ‹name›` → ❌ Take who?
- [en] `&game companion sheet ‹name›` → ❌ Not among yours
- [en] `&game item ‹name›` → ❌ Unknown item
- [en] `&game equip ‹item›` → ❌ Unknown item
- [en] `&game unequip ‹slot|item›` → ❌ Unequip what?
- [en] `&game sell ‹item›` → ❌ You don't have that
- [en] `&color ‹role› ‹color|gradient|preset›` → ❌ I didn't understand the color
- [en] `&color create` → ⏱️ não respondeu em 3 s
- [en] `&warn <@user|id|name> [reason]` → ❌ Who should I warn?
- [en] `&warn` → ❌ Who should I warn?
- [en] `&automod ‹group›` → ❌ I don't know that one
- [en] `&automod ‹group› on|off` → ❌ I don't know that one
- [en] `&automod ‹group› ‹part› on|off` → ❌ I don't know that one
- [en] `&rss add https://example.com/feed.xml` → ❌ Unreachable feed
- [en] `&staff title <@role> ‹text›` → ❌ Not a staff role
- [en] `&economy buy ‹role›` → ❓ Which role?
- [en] `&join` → 🚫 Unavailable here
- [en] `&leave` → 🚫 Unavailable here
- [en] `&tts` → 🚫 Unavailable here
- [en] `&timezone label ‹city› ‹text›` → ❌ City isn't on the list
- [en] `&timezone main ‹city›` → ❌ Must be on the list
- [en] `&welcome test` → ❌ No channel yet
- [en] `&chat` → 🚫 Not a command here
- [en] `&reactionrole ‹add|remove|list›` → ❌ Wrong usage
- [en] `&reactionrole add ‹message› ‹emoji› ‹roleId›` → ❌ Wrong usage
- [en] `&reactionrole remove ‹message›` → ❌ Wrong usage
- [en] `&reactionrole exclusive ‹message› on|off` → ❌ Wrong usage
- [en] `&reactionrole add https://stoat.chat/server/.../01ABC... 🎮 01XYZ...` → ❌ Wrong usage
- [en] `&purge ‹amount› [@user] | all` → ❌ Couldn't find that person
- [en] `&purge` → ❌ Wrong usage
- [en] `&game admin give ‹qty› [@person]` → ❌ How much?
- [en] `&game admin item ‹name› [@person]` → ❌ Unknown item
- [en] `&game admin companion ‹name› [level] [@person]` → ❌ Unknown follower
- [en] `&game admin simulate ‹contract|boss› [n]` → ❌ Unknown mission
- [en] `&game admin currency view ‹id›` → ❌ Unknown currency
- [en] `&game admin currency set ‹id› ‹field› ‹value›` → ❌ Which currency?
- [en] `&game market sell ‹item› ‹price›` → ❌ You don't have that
- [en] `&game market buy <#>` → ❌ Offer unavailable
- [en] `&game market cancel <#>` → ❌ Can't cancel
- [en] `&game trade [@person] ‹your item› for ‹their item›` → ❌ Unknown item
- [en] `&game trade accept <#>` → ❌ Proposal unavailable
- [en] `&game sell` → ❌ Sell what?
- [en] `&game spell ‹name›` → ❌ Unknown spell
- [en] `&game learn ‹name› [with ‹currency›]` → ❌ Unknown spell
- [en] `&game contract ‹name›` → ❌ Unknown contract
- [en] `&game job ‹name›` → ❌ Unknown contract
- [en] `&game coop open ‹contract›` → ❓ Which one?
- [en] `&game companion take ‹name›` → ❌ Take who?
- [en] `&game companion drop ‹name›` → ❌ Remove who?
- [en] `&game companion dismiss ‹name›` → ❌ Dismiss who?
- [en] `&game companion photos ‹name›` → ❌ Who?
- [en] `&game hire ‹name›` → ❌ I don't know that
- [en] `&game use ‹contract›` → ❌ Unknown item
- [en] `&game dungeon ‹name›` → ❌ Unknown dungeon
- [en] `&game dungeon ‹name› boss` → ❌ Unknown dungeon
- [en] `&game equip ‹item› [hand1|hand2]` → ❌ Unknown item
- [en] `&game use ‹contract|scroll›` → ❌ Unknown item
- [en] `&game unequip ‹slot or item›` → ❌ Unequip what?
- [en] `&game points ‹attribute› [how many]` → ❌ Which attribute?
- [en] `&xp setup multiplier ‹1–5›` → ❌ Invalid value
- [en] `&xp setup maxlevel ‹5–1000›` → ❌ Invalid value
- [en] `&xp setup xp ‹min› ‹max›` → ❌ Invalid value
- [en] `&access role add <@role|id>` → ❌ Invalid role
- [en] `&access role remove <@role|id>` → ❌ Invalid role
- [en] `&globalban exempt <@user|id>` → ❌ Couldn't find that person
- [en] `&globalban forget` → ❓ Who?
- [en] `&ban` → ❌ Wrong usage
- [en] `&globalban forget <@user|id|name> [note]` → ❌ Couldn't find that person
- [en] `&globalban history <@user|id>` → ❌ Couldn't find that person
- [en] `&color panel ‹channel-id›` → ⏱️ não respondeu em 3 s
- [en] `&reactionrole exclusive ‹message› on` → ❌ Wrong usage
- [en] `&reactionrole exclusive ‹message› off` → ❌ Wrong usage
- [en] `&log ‹event› ‹on|off›` → ❌ Invalid channel
- [en] `&staff add` → ❓ Which role?
- [en] `&welcome on|off` → ❌ No channel yet
- [en] `&command disable ‹name›` → ❌ Invalid command
- [en] `&command enable ‹name›` → ❌ Invalid command
- [en] `&rss remove ‹id|url›` → ❓ Not found
- [en] `&rss now` → ❌ No channel
- [en] `&automod sentinel channel <#channel|here|off>` → ❌ Channel not found
- [en] `&automod sentinel channel <#channel|here>` → ❌ Channel not found
- [en] `&automod sentinel topics punishment ‹mode›` → ❌ Invalid mode
- [en] `&automod ‹module› punishment ‹mode|inherit›` → ❌ I don't know that one
- [en] `&automod ‹group› set ‹parameter› ‹value›` → ❌ I don't know that one
- [en] `&reactionrole add ‹message link› 🎮 Games` → ❌ Wrong usage
- [en] `&reactionrole exclusive ‹message link› on` → ❌ Wrong usage
- [en] `&kick` → ❌ Wrong usage
- [en] `&automod punishment expiry ‹days|0›` → ❌ Usage
- [en] `&reactionrole add ‹message› 🎮 ‹role-id›` → ❌ Wrong usage
- [en] `&rss add ‹feed-url›` → ❌ Unreachable feed
- [en] `&rss add https://g1.globo.com/rss/g1/` → ❌ Unreachable feed
- [en] `&game coop open ‹contract | dungeon X | chefe X›` → ❓ Which one?
- [en] `&game trade @user ‹your item› for ‹their item›` → ❌ Unknown item
