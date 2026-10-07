/* proxy RPC Solana — evita rate-limit/bloqueio do RPC público no navegador */
const RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.rpc.extrnode.com",
  "https://rpc.ankr.com/solana"
];
export default async function handler(req, res){
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  const body = req.body || {};
  if (!body.method) return res.status(400).json({ error: "method required" });
  for (const url of RPCS){
    try{
      const up = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: body.method, params: body.params || [] })
      });
      if (up.status === 429) continue;
      const data = await up.json();
      return res.status(200).json(data);
    }catch(e){ /* tenta o próximo RPC */ }
  }
  return res.status(502).json({ error: { message: "todos os RPCs falharam" } });
}
