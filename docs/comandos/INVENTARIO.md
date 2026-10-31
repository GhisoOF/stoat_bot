# Inventário de comandos

Gerado por `INVENTARIO=1 node testes.mjs comandos-17out` — **não edite à mão**. É a foto do que existe antes da
reestruturação dos comandos num registro central (fase 0). A suíte `comandos-17out` compara o bot com o
`inventario.json` desta pasta: nome que some ou muda de destino faz o teste falhar.

**42 comandos · 165 nomes · 923 subcomandos em inglês · 294 telas de ajuda · 721 exemplos executados**

## Comandos

| Comando | Nome na tela em inglês | Nome na tela em espanhol | Todos os nomes que levam a ele | Função | Liga/desliga | Exemplos na ajuda |
|---|---|---|---|---|---|---|
| `adeus` | `goodbye` | `despedida` | `despedida` `farewell` `goodbye` | `adeus (cmd)` | sim | 6 |
| `assistente` | `setup` | `asistente` | `asistente` `assistant` `configurar` `configure` `setup` `wizard` | `cmdAssistente` | sim | 18 |
| `automod` | — | `automod` | — | `cmdAutomod` | sim | 110 |
| `autorole` | — | `autorol` | `autorol` | `cmdAutorole` | sim | 10 |
| `ban` | — | `ban` | — | `cmdBan` | sim | 6 |
| `banglobal` | `globalban` | `banglobal` | `globalban` | `cmdBanGlobal` | sim | 60 |
| `boasvindas` | `welcome` | `bienvenida` | `bemvindo` `bienvenida` `boas-vindas` `greeting` `welcome` | `boasvindas (cmd)` | sim | 22 |
| `config` | `config` | `config` | `ajustes` `configuracion` `configuración` `configuracoes` `configurações` `settings` | `cmdConfig` | — | 60 |
| `cor` | `color` | `color` | `cargocor` `color` `colour` `cores` | `cmdCor` | sim | 32 |
| `debug` | — | `debug` | `diagnostico` `diagnóstico` | `cmdDebug` | — | 8 |
| `economia` | `economy` | `economia` | `eco` `economy` | `cmdEconomia` | sim | 20 |
| `embed` | — | `embed` | `repeat` `repete` `repetir` | `cmdEmbed` | sim | 6 |
| `entrar` | `join` | `entrar` | `call` `join` | `entrar` | — | 2 |
| `entretenimento` | `entertainment` | `entretenimiento` | `ent` `entertainment` `entretenimiento` `entreterimento` `fun` | `cmdEntretenimento` | sim | 50 |
| `fuso` | `timezone` | `huso` | `clock` `fusos` `hora` `huso` `timezone` `timezones` `tz` | `cmdFuso` | sim | 10 |
| `game` | `game` | `juego` | `character` `juego` `personagem` `rpg` | `cmdGame` | sim | 52 |
| `help` | `help` | `ayuda` | `ajuda` `ayuda` | `cmdHelp` | — | 140 |
| `kick` | — | `expulsar` | `expulsar` | `cmdKick` | sim | 6 |
| `limpar` | `purge` | `limpiar` | `clear` `limpiar` `purge` | `cmdLimpar` | sim | 8 |
| `musica` | `music` | `musica` | `m` `music` `play` `tocar` | `cmdMusica` | sim | 2 |
| `personalidade` | — | `personalidad` | `personalidad` `personality` | `cmdPersonalidade` | — | 2 |
| `ping` | — | `ping` | — | `cmdPing` | sim | 2 |
| `privacidade` | `privacy` | `privacidad` | `privacidad` `privacy` | `cmdPrivacidade` | — | 32 |
| `reactionrole` | — | `reactionrole` | `reactionroles` `rr` | `cmdReactionRole` | sim | 16 |
| `reset` | — | `reset` | `fabrica` `factoryreset` `redefinir` `resetar` | `cmdReset` | — | 8 |
| `rolar` | `roll` | `dados` | `dado` `dados` `r` `roll` | `cmdRolar` | sim | 16 |
| `rss` | — | `rss` | `feed` | `cmdRss` | sim | 18 |
| `sair` | `leave` | `salir` | `leave` `sairdacall` `salir` | `sair` | — | 2 |
| `servidor` | `server` | `servidor` | `server` `serverinfo` `servidorinfo` | `cmdServidor` | sim | 18 |
| `servidores` | `servers` | `servidores` | `servers` | `cmdServidores` | — | 26 |
| `silenciar` | `timeout` | `silenciar` | `cargomudo` `criarcargomudo` `mute` `mutedrole` `muterole` `rolsilencio` `silence` `silencio` `timeout` | `cmdTimeout` | sim | 8 |
| `sobre` | `info` | `info` | `about` `acerca` `info` `soporte` `suporte` `support` | `cmdInfo` | — | 2 |
| `staff` | `staff` | `staff` | `equipe` `team` | `cmdStaff` | sim | 14 |
| `ticket` | — | `ticket` | `tickets` | `cmdTicket` | sim | 10 |
| `tts` | — | `tts` | `falar` `speak` `voz` | `cmdTts` | sim | 2 |
| `tutorial` | `tutorial` | `tutorial` | `comecar` `guia` `guide` `inicio` `start` | `cmdTutorial` | sim | 26 |
| `unban` | — | `desbanear` | `desbanear` `desbanir` `pardon` | `cmdUnban` | sim | 6 |
| `untimeout` | — | `untimeout` | `dessilenciar` `unmute` `unsilence` | `cmdUntimeout` | sim | 8 |
| `userinfo` | — | `userinfo` | — | `cmdUserinfo` | sim | 6 |
| `warn` | `warn` | `advertir` | `advertir` `avisar` | `cmdWarn` | sim | 14 |
| `webhook` | — | `webhook` | `gancho` `webhooks` `wh` | `cmdWebhook` | sim | 10 |
| `xp` | `xp` | `xp` | `level` `levels` `nivel` | `cmdXp` | sim | 12 |

_Comando_ é o nome interno (o que o `&comando desativar` e o banco guardam).

## Onde cada comando está declarado

O nome, os apelidos, o nome em inglês e as marcas de cada comando (gerenciável, só IA, voz, essencial,
qualquer canal, texto livre) moram **só** no registro, `modulos/comandos/` — um arquivo por família (fase 1).
Os subcomandos também, com o nome em inglês de cada um, de todas as famílias (fase 2).
O que ainda está espalhado:

| Lugar | O que guarda |
|---|---|
| `modulos/core/nomes-automod.js` | as mesmas palavras do `&automod` que o registro tem, para os painéis — um teste garante que não se afastam |
| `modulos/core/aliases.js` → `PLACEHOLDER_EN` | os moldes da ajuda (`‹nome›` → `‹name›`), comuns a todos os comandos |
| cada handler (`if (sub === … )`) | o parse dos subcomandos, muitas vezes já aceitando os dois idiomas |
| `modulos/moderacao/help-grupos.js` | os grupos do índice (nome, emoji, título) — o que entra em cada um vem do `ajuda.grupo` |
| `tutorial.js`, `assistente.js` | o mini guia (conceitos) e os comandos que o assistente gera |

## Subcomandos em inglês (entrada)

- `adeus`: borrar→limpar, channel→canal, clear→limpar, color→cor, colour→cor, default→padrao, estado→status, here→aqui, hidden→oculto, hide→oculto, image→imagem, imagen→imagem, message→texto, predeterminado→padrao, probar→testar, show→visivel, test→testar, text→texto, title→titulo, visible→visivel
- `assistente`: ai→ia, build→servidor, canales→canais, cancel→cancelar, channels→canais, chat→ia, complete→completo, fast→rapido, full→completo, image→imagem, imagen→imagem, images→imagem, proteccion→protecao, protect→protecao, protection→protecao, quick→rapido, server→servidor, stop→cancelar
- `automod`: advertencia→aviso, advertir→avisar, antinoise→antiruido, ban→banir, banear→banir, borrar→apagar, castigo→punicao, centinela→sentinela, confirm→confirmar, delete→apagar, filter→filtro, filters→filtro, heredar→herdar, ignore→ignorar, inherit→herdar, menciones→mencoes, mensajes→mensagens, mentions→mencoes, messages→mensagens, noise→antiruido, punishment→punicao, repeticion→repeticao, repetition→repeticao, sentinel→sentinela, size→tamanho, stack→acumular, tamaño→tamanho, termos→filtro, threshold→limiar, tiempo→tempo, time→tempo, umbral→limiar, warn→avisar, words→filtro
- `automod.antilink`: domains→dominios, invitaciones→convites, invites→convites
- `automod.antiruido`: characters→caracteres, ignore→ignorar, letters→letras, repeticion→repeticao, repetition→repeticao, size→tamanho, tamaño→tamanho, threshold→limiar, umbral→limiar
- `automod.antispam`: burst→rajada, media→midia, menciones→mencoes, mensajes→mensagens, mentions→mencoes, messages→mensagens, minute→minuto, multimedia→midia, newcomer→novato, newcomers→novato, rafaga→rajada, repeat→repeticao, repeticion→repeticao, speed→velocidade, tiempo→tempo, time→tempo, times→vezes, veces→vezes, velocidad→velocidade
- `automod.assuntos`: ai→ia, alert→alertar, allow→liberar, baja→baixa, borrar→apagar, castigar→punir, delete→apagar, drugs→drogas, high→alta, low→baixa, medium→media, permitir→liberar, politics→politica, punish→punir, quitar→remover, religion→religiao, remove→remover, sensibilidad→sensibilidade, sensitivity→sensibilidade, vigilar→vigiar, watch→vigiar
- `automod.avatar`: accion→acao, action→acao, alert→alertar, ban→banir, banear→banir, check→checar, kick→expulsar, mute→silenciar, revisar→checar, silence→silenciar, tiempo→tempo, time→tempo, timeout→silenciar
- `automod.filtro`: list→lista, quitar→remover, remove→remover, tirar→remover, ver→lista
- `automod.odio`: list→lista, quitar→remover, remove→remover
- `automod.punicao`: advertencia→aviso, escalera→escada, ladder→escada, mode→modo, steps→escada, validez→validade
- `automod.sentinela`: alert→alerta, alertas→alerta, alerts→alerta, antiguedad→antiguidade, baja→baixa, ban→banir, banear→banir, channel→canal, contenido→conteudo, content→conteudo, dismiss→liberar, hate→odio, high→alta, imagenes→imagens, images→imagens, low→baixa, medium→media, pfp→avatar, probar→testar, sensibilidad→sensibilidade, sensitivity→sensibilidade, simular→testar, simulate→testar, subjects→assuntos, temas→assuntos, tenure→antiguidade, test→testar, topics→assuntos
- `autorole`: definir→set, desactivar→desativar, disable→desativar, quitar→remover, remove→remover
- `banglobal`: accept→isentar, aceitar→isentar, adicionar→add, alert→avisar, alertar→avisar, all→lista, allow→isentar, aqui→servidor, autoimport→auto, automatic→auto, automatico→auto, ban→imediato, banidos→lista, banir→imediato, banned→lista, barrer→varrer, bypass→isentar, cautela→consenso, cautious→consenso, cego→imediato, checar→revisar, colocar→add, conferir→revisar, confirm→confirmar, consensus→consenso, contribucion→contribuicao, contribution→contribuicao, daqui→servidor, deshacer→desfazer, excecoes→ignorados, exempt→isentar, exempted→isentos, exentos→isentos, eximir→isentar, foradalista→ignorados, forget→esquecer, here→servidor, historial→historico, history→historico, ignorar→off, ignore→off, ignored→ignorados, immediate→imediato, import→importar, incluir→add, inmediato→imediato, instant→imediato, isento→isentos, list→lista, olvidar→esquecer, people→pessoas, permitir→isentar, personas→pessoas, porque→historico, quitar→remover, recordar→lembrar, reincluir→lembrar, remember→lembrar, remove→remover, revert→desfazer, reverter→desfazer, review→revisar, scan→varrer, server→servidor, sim→confirmar, sweep→varrer, tirar→remover, todos→lista, undo→desfazer, unforget→lembrar, varredura→varrer, ver→historico, view→historico, warn→avisar, yes→confirmar
- `blocklist`: domains→dominios
- `boasvindas`: borrar→limpar, channel→canal, clear→limpar, color→cor, colour→cor, default→padrao, estado→status, here→aqui, hidden→oculto, hide→oculto, image→imagem, imagen→imagem, mensajes→mensagens, message→texto, messages→mensagens, predeterminado→padrao, probar→testar, show→visivel, test→testar, text→texto, title→titulo, visible→visivel
- `config`: acceso→acesso, access→acesso, ai→ia, command→comando, commands→comando, lang→idioma, language→idioma
- `config.acesso`: all→todos, canales→canais, channel→canal, channels→canais, clear→limpar, estado→status, except→exceto, excepto→exceto, free→livre, libre→livre, limpiar→limpar, only→somente, rol→cargo, role→cargo, roles→cargos, solo→somente, staffbypass→staffignora, staffignores→staffignora
- `config.comando`: activar→ativar, desactivar→desativar, disable→desativar, enable→ativar, gestionar→gerenciar, lista→list, manage→gerenciar
- `config.ia`: all→todas, aquí→aqui, comment→comentar, estado→status, every→todas, free→livre, here→aqui, image→imagem, imagen→imagem, images→imagem, libre→livre, mode→modo, perday→pordia, pordía→pordia, relevant→relevante
- `config.idioma`: estado→status, ingles→english, portuguese→portugues
- `config.log`: actualizaciones→atualizacoes, aqui→here, channel→canal, commands→comandos, events→eventos, informe→relatorio, members→membros, mensajes→mensagens, messages→mensagens, miembros→membros, punishments→punicoes, report→relatorio, roles→cargos, sanciones→punicoes, updates→atualizacoes
- `cor`: ayuda→ajuda, cargos→lista, clear→limpar, crear→criar, create→criar, default→padrao, degradado→gradiente, generar→gerar, generate→gerar, gradient→gradiente, help→ajuda, here→aqui, limpiar→limpar, list→lista, panel→painel, predeterminado→padrao, quitar→remover, remove→remover, roles→lista
- `debug`: canales→canais, channels→canais, crudo→cru, leer→ler, mute→mudo, permisos→permissoes, permissions→permissoes, raw→cru, read→ler
- `economia`: balance→saldo, buy→comprar, confirm→confirmar, eliminar→remover, gain→ganho, ganancia→ganho, give→dar, interval→intervalo, minar→minerar, mine→minerar, name→nome, nombre→nome, pay→pagar, quitar→tirar, reiniciar→zerar, remove→remover, reset→zerar, shop→loja, symbol→simbolo, take→tirar, tienda→loja
- `embed`: colores→cores, colors→cores, fields→campos
- `entretenimento`: 8ball→bola8, burla→zoeira, buscaminas→campominado, choose→escolher, elegir→escolher, fight→briga, fortune→sorte, invertir→inverter, minesweeper→campominado, mock→zoeira, pelea→briga, pick→escolher, rate→nota, reverse→inverter, suerte→sorte, tateti→velha, tictactoe→velha
- `fuso`: alias→apelido, apodo→apelido, check→ver, cities→cidades, ciudades→cidades, clear→limpar, find→buscar, format→formato, label→apelido, limpiar→limpar, list→lista, main→principal, name→apelido, now→ver, reference→principal, search→buscar, time→ver
- `game`: accept→aceitar, aceptar→aceitar, add→adicionar, agregar→adicionar, all→tudo, allies→aliado, ally→aliado, announce→anunciar, ayuda→ajuda, bag→mochila, balance→saldo, bank→banco, barter→escambo, borrar→apagar, boss→chefe, bosses→chefes, buy→comprar, cancel→cancelar, cartera→carteira, catalog→catalogo, clase→classe, class→classe, coin→moeda, commands→comandos, companion→follower, companions→followers, con→com, confirm→confirmar, contract→contrato, contracts→contratos, crear→criar, create→criar, currency→moeda, decline→recusar, default→padrao, delete→apagar, despedir→dispensar, detalle→detalhe, dismiss→dispensar, drop→tirar, duel→duelo, encargo→bico, encargos→bicos, energy→energia, equip→equipar, erase→apagar, especiales→especiais, evolucionar→evoluir, evolve→evoluir, exchange→cambio, fantasy→fantasia, give→dar, grimoire→grimorio, hechizo→magia, hechizos→magias, help→ajuda, hire→contratar, image→imagem, imagen→imagem, info→detalhe, intercambiar→trocar, inventory→inventario, items→itens, jefe→chefe, jefes→chefes, job→bico, jobs→bicos, join→entrar, learn→aprender, leave→sair, level→nivel, llevar→levar, magic→magia, main→padrao, mano1→mao1, mano2→mao2, market→mercado, mercenaries→mercenarios, mision→missao, misiones→missoes, mission→missao, missions→missoes, model→modelo, moneda→moeda, new→novo, nuevo→novo, objetos→itens, photos→fotos, picture→imagem, points→pontos, predeterminado→padrao, preview→prever, profile→perfil, prueba→teste, puntos→pontos, pvp→duelo, quitar→remover, rates→taxas, rechazar→recusar, reclutar→recrutar, reclutas→recrutas, recoger→pegar, recruit→recrutar, recruits→recrutas, redo→refazer, rehacer→refazer, remove→remover, rescatar→resgatar, rescue→resgatar, rest→descansar, retrieve→pegar, sacar→tirar, salir→sair, seguidor→follower, seguidores→followers, sell→vender, server→servidor, sheet→ficha, shop→loja, simple→simples, simulate→simular, special→especial, specials→especiais, spell→magia, spells→magias, spend→pontos, story→historia, take→levar, tasas→taxas, test→teste, tienda→loja, todo→tudo, trade→trocar, trueque→escambo, unequip→desequipar, use→usar, view→ver, wallet→carteira, wear→vestir, world→mundo
- `limpar`: all→tudo, confirm→confirmar, everything→tudo, todo→tudo
- `musica`: cola→fila, no→nao, pista→faixa, reanudar→retomar
- `personalidade`: default→padrao, predeterminado→padrao, reset→resetar, restablecer→resetar, set→definir, show→ver, view→ver
- `privacidade`: all→tudo, back→voltar, borrar→apagar, care→cuidado, channel→canal, confirm→confirmar, delete→apagar, estado→status, forget→esquecer, gentle→cuidado, hilo→fio, join→voltar, leave→sair, map→mapear, memory→memoria, olvidar→esquecer, optin→voltar, optout→sair, profile→perfil, rejoin→voltar, salir→sair, thread→fio, todo→tudo, volver→voltar
- `punicao`: advertencia→aviso, advertir→avisar, ban→banir, banear→banir, borrar→apagar, confirm→confirmar, delete→apagar, escalera→escada, ladder→escada, mode→modo, rol→cargo, role→cargo, stack→acumular, steps→escada, validez→validade, warn→avisar
- `reactionrole`: adicionar→add, exclusive→exclusivo, lista→list, orden→ordem, order→ordem, quitar→remove, recargar→recarregar, reload→recarregar, remover→remove, reordenar→ordem, repair→recarregar, reparar→recarregar, unico→exclusivo, unique→exclusivo
- `reset`: confirm→confirmar, deshacer→desfazer, restore→desfazer, revert→desfazer, undo→desfazer, yes→confirmar
- `rolar`: borrar→limpar, clear→limpar, coin→moeda, iniciativa→init, initiative→init, list→lista, moneda→moeda, quitar→remover, remove→remover
- `rss`: ahora→agora, category→categoria, channel→canal, now→agora, probar→testar, test→testar, time→horario, urgent→urgente
- `scam`: baja→baixa, ban→banir, banear→banir, channel→canal, dismiss→liberar, high→alta, low→baixa, medium→media, probar→testar, sensibilidad→sensibilidade, sensitivity→sensibilidade, simular→testar, simulate→testar, test→testar
- `sentinela`: antiguedad→antiguidade, baja→baixa, ban→banir, banear→banir, channel→canal, dismiss→liberar, high→alta, low→baixa, medium→media, probar→testar, sensibilidad→sensibilidade, sensitivity→sensibilidade, simular→testar, simulate→testar, tenure→antiguidade, test→testar
- `servidor`: about→info, canales→canais, channels→canais, reglas→regras, roles→cargos, rules→regras
- `servidores`: ahora→agora, announce→aviso, channel→canal, empty→vazias, here→aqui, informe→relatorio, notice→aviso, now→agora, palabras→palavras, pseudonym→pseudonimo, report→relatorio, seudonimo→pseudonimo, subjects→assuntos, temas→assuntos, topics→assuntos, unknown→palavras, vacias→vazias, words→palavras
- `silenciar`: lift→tirar, off→tirar, quitar→tirar, remove→tirar, undo→tirar
- `staff`: clear→limpar, equipo→equipe, label→titulo, limpiar→limpar, list→lista, team→equipe, title→titulo
- `ticket`: borrar→apagar, categories→categorias, cerrar→fechar, delete→apagar, equipo→equipe, list→lista, panel→painel, team→equipe
- `tts`: broadcast→transmitir, cap→porminuto, channel→canal, destrabar→destravar, diagnose→diagnostico, diagnostics→diagnostico, diccionario→dicionario, dictionary→dicionario, efecto→efeito, effect→efeito, filter→filtro, health→estado, here→aqui, join→entrar, leave→sair, leer→ler, names→nomes, nombres→nomes, perminute→porminuto, pitch→tom, predeterminado→padrao, prueba→teste, read→ler, rescatar→resgatar, rescue→resgatar, resgate→resgatar, restart→reiniciar, salir→sair, sieve→filtro, start→entrar, status→estado, stop→sair, test→teste, tone→tom, tono→tom, unlock→destravar, unstick→destravar, voice→voz
- `tutorial`: adventure→aventura, ai→ia, canales→canais, channels→canais, economy→economia, mensajes→mensagens, messages→mensagens, moderacion→moderacao, moderation→moderacao, news→noticias, permisos→permissoes, permissions→permissoes, proteccion→protecao, protect→protecao, protection→protecao, roles→cargos, settings→ajustes, wiki→rpg
- `warn`: borrar→limpar, clear→limpar, list→lista
- `webhook`: channel→canal, crear→criar, create→criar, eliminar→remover, events→eventos, list→lista, probar→testar, remove→remover, test→testar
- `whitelist`: —
- `xp`: all→todos, announce→anuncio, announcement→anuncio, back→voltar, channel→canal, configure→configurar, crear→criar, crearroles→criarcargos, create→criar, createroles→criarcargos, interval→intervalo, join→entrar, leave→sair, maxlevel→nivelmaximo, multiplier→multiplicador, opt-out→sair, optout→sair, reiniciar→zerar, restore→sincronizar, resync→sincronizar, rol→cargo, role→cargo, roles→cargos, salir→sair, sync→sincronizar, volver→voltar, wipe→zerar

## Exemplos da ajuda que respondem erro (pendências para as próximas fases)

Executados com valores de mentira no lugar dos `‹moldes›`, então parte disto é o valor (um item que não existe),
não a sintaxe. O que a suíte já trava (subcomando desconhecido, exemplo pronto com erro, português na tela em
inglês) não aparece aqui.

- [pt] `&cor painel aqui` → ⏱️ não respondeu em 3 s
- [pt] `&game chefe [@amigos]` → ❌
- [pt] `&game duelo <@pessoa> [ouro]` → ❌
- [pt] `&staff titulo <@cargo> ‹texto›` → ❌ Não é um cargo de staff
- [pt] `&boasvindas testar` → ❌ Falta o canal
- [pt] `&automod sentinela canal <#canal>` → ❌ Canal não encontrado
- [pt] `&automod sentinela canal <#canal|aqui|off>` → ❌ Canal não encontrado
- [pt] `&automod sentinela canal <#canal|aqui>` → ❌ Canal não encontrado
- [pt] `&cor criar` → ⏱️ não respondeu em 3 s
- [pt] `&game missao` → ❌
- [pt] `&game chefe` → ❌
- [pt] `&game duelo @‹pessoa› 100` → ❌
- [pt] `&boasvindas on|off` → ❌ Falta o canal
- [pt] `&config acesso livre ‹comando› on|off` → ❌ Comando desconhecido
- [pt] `&config comando desativar ‹nome›` → ❌ Comando inválido
- [pt] `&config comando ativar ‹nome›` → ❌ Comando inválido
- [pt] `&game duelo` → ❌
- [en] `&color panel here` → ⏱️ não respondeu em 3 s
- [en] `&game mission [@friends]` → ❌
- [en] `&game boss [@friends]` → ❌
- [en] `&game duel <@person> [gold]` → ❌
- [en] `&staff title <@role> ‹text›` → ❌ Not a staff role
- [en] `&welcome test` → ❌ No channel yet
- [en] `&automod sentinel channel <#channel>` → ❌ Channel not found
- [en] `&automod sentinel channel <#channel|here|off>` → ❌ Channel not found
- [en] `&automod sentinel channel <#channel|here>` → ❌ Channel not found
- [en] `&color create` → ⏱️ não respondeu em 3 s
- [en] `&game mission` → ❌
- [en] `&game boss` → ❌
- [en] `&game duel @‹person› 100` → ❌
- [en] `&welcome on|off` → ❌ No channel yet
- [en] `&config access free ‹command› on|off` → ❌ Unknown command
- [en] `&config command disable ‹name›` → ❌ Invalid command
- [en] `&config command enable ‹name›` → ❌ Invalid command
- [en] `&game duel` → ❌
