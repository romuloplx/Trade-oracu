// ☁️ PROXY TELEGRAM — resolve CORS do navegador e mantém a conexão do baú firme.
// POST /api/tg?key=98201441  { method:"getUpdates"|"deleteWebhook"|"getMe"|"sendMessage", ...params }
// sendMessage sem key: só para os chats oficiais do dono (whitelist).
const TOKEN = "8324502851:AAGUC9ga0A29gbepACW-NQ25mcHiHUIlitU";
const KEY = "98201441";
const CHATS_OFICIAIS = [6371611384, -1004456358369];

async function callTG(method, params){
  const r = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {})
  });
  return await r.json().catch(() => ({ ok:false, description:"resposta invalida" }));
}

export default async function handler(req, res){
  const url = new URL(req.url, "http://x");
  if(req.method === "OPTIONS"){
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }
  try{
    // Vercel Node runtime já entrega req.body parseado (igual llm.js)
    let body = req.body || {};
    if(typeof body === "string"){ try{ body = JSON.parse(body); }catch(_){ body = {}; } }
    const method = String(body.method || url.searchParams.get("method") || "getMe");
    const okKey = url.searchParams.get("key") === KEY;

    // métodos de leitura/controle exigem a key do baú
    if(method !== "sendMessage" && !okKey){
      return res.status(401).json({ ok:false, error:"precisa da senha do bau para getUpdates" });
    }
    // sendMessage sem key: restringe aos chats oficiais do dono
    if(method === "sendMessage" && !okKey){
      const cid = Number(body.chat_id);
      if(!CHATS_OFICIAIS.includes(cid)){
        return res.status(403).json({ ok:false, error:"chat nao autorizado" });
      }
    }

    const out = await callTG(method, body);

    // getUpdates aqui NÃO consome a fila (sem offset) — o app pode consultar à vontade
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(out);
  }catch(e){
    return res.status(500).json({ ok:false, error:String(e && e.message || e) });
  }
}
