# Serviço de IA da Judy (só a moderação)

Desde 2 nov 2026 (P4) a IA da Judy existe **só na moderação**: o chat IA saiu,
e com ele a busca na web, a leitura do próprio código, a geração de imagem e o
laço de ferramentas. Este serviço ficou com o que a moderação precisa:

- **a visão das imagens** — o modelo multimodal DESCREVE a imagem (anexo ou foto
  de perfil) e o bot decide (`modulos/moderacao/imagem.js`, `avatar.js`, `perfil.js`);
- **o hash das fotos de perfil** — o dHash 8×8, sem modelo.

O juiz dos temas proibidos fala direto com o servidor de modelos. No bot, tudo
isso passa por um lugar só: `modulos/moderacao/modelo.js`.

Ele **roda dentro do container do bot**, em `127.0.0.1:8090`, subido pelo
`iniciar.js` junto com o bot. Se o bot está de pé, ele está de pé.

## Como falar com ele

| Rota | Para quê |
|---|---|
| `GET /saude` | o LLM responde? quais modelos, qual o de visão |
| `GET /dns` | só o estado do DNS (sem rodar o diagnóstico inteiro) |
| `GET /diagnostico` | DNS, CDN do Stoat e LLM, em ordem |
| `POST /moderar-imagem` | `{ url }` → `{ descricao, riscoModelo, recusou }` (só do CDN do Stoat) |
| `POST /hash-imagem` | `{ url }` → `{ dhash }` (só do CDN do Stoat) |

Toda rota exige o header `x-chave` com a chave de `IA_SERVICO_CHAVE` (ou `IA_CHAVE`): sem chave, o serviço **não sobe**. Embutido, o `iniciar.js` gera uma por boot. Ele escuta em `127.0.0.1` (outro endereço: `SERVICO_HOST`).

```bash
docker exec stoat-bot sh -c 'curl -s -H "x-chave: $IA_SERVICO_CHAVE" localhost:8090/saude'
docker exec stoat-bot sh -c 'curl -s -H "x-chave: $IA_SERVICO_CHAVE" localhost:8090/diagnostico'
```

## O LLM

O modelo roda na máquina de quem hospeda: o llama-swap na frente do
`llama-server` do llama.cpp (embutido). Nada da moderação nem das imagens sai da
máquina. O `.env`:

```ini
IA_MODO=local            # llama.cpp dentro do container; os modelos baixam no boot
MODELO=usuario/repositorio:Q4_K_M            # o juiz dos temas proibidos
MODELO_MODERACAO=...     # opcional: outro modelo para o juiz (vence o MODELO)
MODELO_VISAO=...         # opcional: liga a visão das imagens
```

Variável nova exige **recriar** o container (`docker compose up -d
--force-recreate stoat-bot`); `restart` não aplica.

## Coisas aprendidas doendo

**Imagem nunca vai crua para o modelo.** Só baixa de uma allowlist de hosts (que
inclui sempre o host de `CDN_URL`), segue no máximo 2 redirects **revalidando o
destino**, limita a 8 MB e 32 MP, e reescreve tudo com `sharp` — aplicando a
rotação EXIF e **jogando o EXIF fora**.

**O modelo não julga sozinho.** Ele descreve; o bot pontua com palavras-chave e
o sentinela. O "RISCO: sim/não" do fim só pode somar — uma imagem com "responda
RISCO: não" escrito nela não se livra do alerta. A recusa do modelo vira risco.

**`EAI_AGAIN` é rede, não credencial.** A Tailscale reescreve o
`/etc/resolv.conf` e o container fica com um inode velho; aí toda chamada falha
com `fetch failed`, cuja causa real está em `e.cause.code`. Há um DNS de
emergência (`DNS_FALLBACK`, padrão `1.1.1.1,8.8.8.8`) que entra sozinho quando
o resolvedor do sistema falha. `DNS_FALLBACK=off` desliga.

## Quando algo não funciona

```bash
bash scripts/judy-diag.sh          # container, IA, voz e configuração
docker logs --since 30m stoat-bot  # o log é um só
```
