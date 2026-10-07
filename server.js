import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".css": "text/css; charset=utf-8"
};

const server = http.createServer(async (req, res) => {
  // CORS universal
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, X-MBX-APIKEY, x-mbx-apikey");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  const host = req.headers.host || `localhost:${PORT}`;
  const fullUrl = `http://${host}${req.url}`;
  const url = new URL(req.url, `http://${host}`);
  const pathname = url.pathname;

  // Roteamento de API Serverless / Edge
  if (pathname.startsWith("/api/")) {
    const apiName = pathname.replace("/api/", "").split("?")[0].replace(/\.js$/, "");
    const apiFile = path.join(__dirname, "api", `${apiName}.js`);

    if (fs.existsSync(apiFile)) {
      try {
        let rawBody = "";
        for await (const chunk of req) rawBody += chunk;
        let parsedBody = {};
        if (rawBody) {
          try { parsedBody = JSON.parse(rawBody); } catch (_) { parsedBody = rawBody; }
        }

        const module = await import(`${apiFile}?t=${Date.now()}`);
        const handler = module.default || module;

        // Se for um handler Edge (espera Request e retorna Response)
        if (handler.length === 1 || module.config?.runtime === "edge") {
          const reqHeaders = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v) reqHeaders.set(k, Array.isArray(v) ? v.join(", ") : v);
          }

          const webReq = new Request(fullUrl, {
            method: req.method,
            headers: reqHeaders,
            body: ["GET", "HEAD"].includes(req.method) ? undefined : rawBody
          });

          const webRes = await handler(webReq);
          if (webRes instanceof Response) {
            const resHeaders = {};
            webRes.headers.forEach((v, k) => { resHeaders[k] = v; });
            res.writeHead(webRes.status, resHeaders);
            const text = await webRes.text();
            res.end(text);
            return;
          }
        }

        // Handler padrão Node.js (req, res)
        req.body = parsedBody;
        req.query = Object.fromEntries(url.searchParams);

        const vercelRes = {
          statusCode: 200,
          status(code) { this.statusCode = code; return this; },
          setHeader(k, v) { res.setHeader(k, v); return this; },
          json(data) {
            res.writeHead(this.statusCode, { "Content-Type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(data));
          },
          send(data) {
            res.writeHead(this.statusCode);
            res.end(data);
          },
          end(data) {
            res.writeHead(this.statusCode);
            res.end(data);
          }
        };

        await handler(req, vercelRes);
        return;
      } catch (err) {
        console.error(`Erro na API /api/${apiName}:`, err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Erro interno" }));
        return;
      }
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API não encontrada" }));
      return;
    }
  }

  // Arquivos estáticos
  let filePath = path.join(__dirname, pathname === "/" ? "index.html" : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": mimeType });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor Oráculo Trader ativo em http://0.0.0.0:${PORT}`);
});
