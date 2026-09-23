// Dependência do revoice.js que a Judy nunca executa (caminho Legacy V1 e
// gerador de documentação). Vazia de propósito: tira do lockfile pacotes com
// vulnerabilidade sem correção publicada. Se algo passar a exigir um deles,
// o require quebra na hora — é melhor que carregar código morto vulnerável.
module.exports = {};
