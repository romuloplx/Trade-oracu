/* proxy de cotações Yahoo Finance (pares forex XXX=X) — evita CORS no navegador */
export default async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  const s = String(req.query.s || "");
  const i = String(req.query.i || "5m");
  const r = String(req.query.r || "5d");
  if (!/^[A-Z0-9=\-\.^]{1,20}$/i.test(s) || !/^(1m|5m|15m|1h)$/.test(i)){
    return res.status(400).json({ error: "bad params" });
  }
  try{
    const up = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=${i}&range=${r}`, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const data = await up.json();
    return res.status(200).json(data);
  }catch(e){
    return res.status(502).json({ error: "upstream fail" });
  }
}
