// Sem imports de propósito: o config-store usa isto na carga, e um ciclo de
// módulos (config-store → pertence → comandos-admin → config-store) deixaria
// a função indefinida nessa hora.

// O molde de servidor novo não pode carregar ID nenhum de um servidor real.
export function limparMolde(molde) {
  const andar = (o) => {
    if (!o || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o)) {
      if (/(Id)$/.test(k) && (typeof v === "string" || v === null)) o[k] = null;
      else if (/(Ids|^canais|^lista|^isentos|^cargosStaff|^inviteWhitelist|^dominiosPermitidos)$/.test(k) && Array.isArray(v)) o[k] = [];
      else if (v && typeof v === "object" && !Array.isArray(v)) andar(v);
    }
  };
  andar(molde);
  return molde;
}
