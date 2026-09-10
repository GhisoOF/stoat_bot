import http from "node:http";
import { resgatarMidias } from "./modulos/core/log.js";

let passou = 0, falhou = 0;
const caso = (n, c, d = "") => { if (c) { passou++; console.log("  ✅ " + n); } else { falhou++; console.log("  ❌ " + n + (d ? " — " + d : "")); } };

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const srv = http.createServer((req, res) => {
  if (req.url === "/attachments/img-ok") { res.writeHead(200, { "content-type": "image/png" }); return res.end(png); }
  if (req.url === "/attachments/purgada") { res.writeHead(404); return res.end(); }
  if (req.url === "/attachments/mentirosa") { res.writeHead(200, { "content-type": "image/png" }); return res.end(Buffer.alloc(11 * 1024 * 1024)); }
  res.writeHead(404).end();
});
await new Promise((r) => srv.listen(18097, "127.0.0.1", r));
process.env.CDN_URL = "http://127.0.0.1:18097";

const subidas = [];
const subir = async ({ base64, mime, nome }) => { subidas.push({ mime, nome, bytes: Buffer.from(base64, "base64").length }); return "novo-" + subidas.length; };

{
  const r = await resgatarMidias([
    { id: "img-ok", metadata: { type: "Image" }, filename: "gato.png", size: png.length },
    { id: "purgada", content_type: "image/jpeg", filename: "sumida.jpg", size: 1000 },
    { id: "txt", content_type: "text/plain", filename: "nota.txt", size: 10 },
  ], { subir });
  caso("imagem viva é resgatada e re-subida", r.ids.length === 1 && r.ids[0] === "novo-1", JSON.stringify(r));
  caso("o re-upload recebeu os bytes e o mime certos", subidas[0]?.mime === "image/png" && subidas[0]?.bytes === png.length);
  caso("CDN purgado vira 'não recuperável' declarado", r.perdidas.length === 1 && /sumida/.test(r.perdidas[0]));
  caso("não-mídia é ignorada em silêncio", !JSON.stringify(r).includes("nota.txt"));
}
{
  const r = await resgatarMidias([{ id: "grande", metadata: { type: "Video" }, filename: "video.mp4", size: 50 * 1024 * 1024 }], { subir });
  caso("grande demais pelos metadados: recusada sem download", r.perdidas.length === 1 && /grande/.test(r.perdidas[0]));
}
{
  const r = await resgatarMidias([{ id: "mentirosa", metadata: { type: "Image" }, filename: "m.png", size: 100 }], { subir });
  caso("tamanho mentido nos metadados: o corpo baixado é medido de novo", r.ids.length === 0 && r.perdidas.length === 1);
}
{
  const r = await resgatarMidias([{ id: "img-ok", metadata: { type: "Image" }, filename: "x.png", size: 10 }], {});
  caso("sem função de upload: não faz nada e não estoura (fail-open)", r.ids.length === 0);
}

srv.close();
console.log(`\n${passou} passou, ${falhou} falhou`);
process.exit(falhou ? 1 : 0);
