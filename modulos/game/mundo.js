// (P2, 31 out 2026) O "mundo" do RPG agora é a era atual (era.js): `MUNDO` continua
// exportado daqui para quem já lia (o &info no moderacao/geral.js). O mundo de
// antes (serverId "mundo") é a era v4 — fica no banco, só leitura, até a purga.
export { ERA as MUNDO } from "./era.js";
