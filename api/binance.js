// 🤖 Proxy assinado da Binance (Futures USDT-M e SPOT) — usado pelos Robôs do Oráculo.
// A chave nunca fica salva no servidor: é assinada via HMAC-SHA256 e transmitida via SSL seguro.
const crypto = require("crypto");

const BASES_FUTURES_PROD = [
  "https://fapi.binance.com",
  "https://fapi.binance.me",
  "https://fapi.binance.info",
  "https://fapi.binance.net",
  "https://www.binance.com"
];
const BASE_FUTURES_TEST = "https://testnet.binancefuture.com";

const BASES_SPOT_PROD = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
  "https://api.binance.me",
  "https://api.binance.info"
];
const BASE_SPOT_TEST = "https://testnet.binance.vision";

const PUBLICOS = new Set([
  "/fapi/v1/time", "/fapi/v1/exchangeInfo", "/fapi/v1/klines",
  "/fapi/v1/ticker/price", "/fapi/v1/premiumIndex", "/fapi/v1/openInterest",
  "/api/v3/time", "/api/v3/exchangeInfo", "/api/v3/klines",
  "/api/v3/ticker/price", "/api/v3/ticker/24hr", "/api/v3/depth"
]);

const PERMITIDOS = new Set([
  ...PUBLICOS,
  // Futures
  "/fapi/v2/account", "/fapi/v2/balance", "/fapi/v1/positionRisk",
  "/fapi/v1/openOrders", "/fapi/v1/userTrades", "/fapi/v1/income",
  "/fapi/v1/order", "/fapi/v1/allOpenOrders", "/fapi/v1/leverage",
  "/fapi/v1/marginType", "/fapi/v1/positionSide/dual",
  // Spot
  "/api/v3/account", "/api/v3/order", "/api/v3/openOrders",
  "/api/v3/allOrders", "/api/v3/myTrades", "/api/v3/order/test"
]);

function assinar(secret, params) {
  const qs = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", secret).update(qs).digest("hex");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, erro: "use POST" });

  let b = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch (_) { b = {}; } }
  b = b || {};

  const key = String(b.key || "").trim();
  const secret = String(b.secret || "").trim();
  const metodo = String(b.metodo || "GET").toUpperCase();
  const caminho = String(b.caminho || "").trim();
  const params = Object.assign({}, b.params || {});
  const testnet = !!b.testnet;

  if (!PERMITIDOS.has(caminho)) return res.status(400).json({ ok: false, erro: "endpoint não permitido: " + caminho });
  if (!["GET", "POST", "DELETE"].includes(metodo)) return res.status(400).json({ ok: false, erro: "método inválido" });

  const assinado = !PUBLICOS.has(caminho);
  const p = Object.assign({}, params);
  const headers = { "Content-Type": "application/json" };
  if (assinado) {
    if (!key || !secret) return res.status(400).json({ ok: false, erro: "Informe a API key e o secret da Binance." });
    p.timestamp = Date.now();
    p.recvWindow = 10000;
    p.signature = assinar(secret, p);
    headers["X-MBX-APIKEY"] = key;
  }

  const isSpot = caminho.startsWith("/api/v3/");
  const basesParaTentar = isSpot 
    ? (testnet ? [BASE_SPOT_TEST, ...BASES_SPOT_PROD] : BASES_SPOT_PROD)
    : (testnet ? [BASE_FUTURES_TEST] : BASES_FUTURES_PROD);

  let ultimoErro = null;

  for (const base of basesParaTentar) {
    const urlBase = base + caminho;
    const url = urlBase + "?" + new URLSearchParams(p).toString();

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(url, { method: metodo, headers, signal: ctrl.signal });
      clearTimeout(t);
      const txt = await r.text();
      let data; try { data = JSON.parse(txt); } catch (_) { data = { raw: txt.slice(0, 300) }; }

      // Se a margem já está ISOLATED no futures, trata como sucesso
      if (caminho === "/fapi/v1/marginType" && (data?.code === -4046 || /No need to change margin type/i.test(data?.msg || txt))) {
        return res.status(200).json({ ok: true, status: 200, data: { code: 200, msg: "success" }, base });
      }

      if (!r.ok) {
        const msg = (data && (data.msg || data.error)) || ("HTTP " + r.status);
        if (r.status === 451 || /restricted location|Eligibility/i.test(msg)) {
          ultimoErro = msg;
          continue;
        }
        return res.status(200).json({ ok: false, status: r.status, erro: msg, codigo: data && data.code, base });
      }
      return res.status(200).json({ ok: true, status: r.status, data, base });
    } catch (e) {
      ultimoErro = String((e && e.message) || e);
    }
  }

  return res.status(200).json({ ok: false, erro: ultimoErro || "falha de rede ao conectar à Binance", base: basesParaTentar[0] });
}
