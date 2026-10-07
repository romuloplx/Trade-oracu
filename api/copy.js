// 🕵️☁️ RADAR COPY TRADE NA NUVEM — 24/7 AUTO-SUSTENTÁVEL
// Registro das carteiras + timestamp da última varredura ficam na DESCRIÇÃO do
// grupo do Telegram (bot é admin):
//   "☁️ ORÁCULO NUVEM · carteiras: addr1,addr2
//    🕐 ts=<epoch ms>"
// Modos (todos exigem ?key=98201441):
//   &start=1 -> varre agora e inicia o loop contínuo (chamado pelo app/cron)
//   &loop=1  -> varredura do loop (se re-dispara sozinho a cada ~2,5 min)
//   &list=1  -> lista carteiras      &set=a,b,c -> substitui a lista
//   &add=x / &remove=x               sem params -> varre uma vez (sem loop)

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const KEY = "98201441";
const TG_TOKEN = "8324502851:AAGUC9ga0A29gbepACW-NQ25mcHiHUIlitU";
const GROUP = "-1004456358369";
const CHATS = ["6371611384", GROUP];
const PREFIX = "☁️ ORÁCULO NUVEM · carteiras: ";
// 🛡 Carteiras padrão do dono — nunca se perdem mesmo se a descrição do grupo for apagada/editada
const WALLETS_PADRAO = [
  "2T5NgDDidkvhJQg8AHDi74uCFwgp25pYFMRZXBaCUNBH",
  "Bmi9zf27MNN5pjCtyv2Y15TDQoYgcbcmPTxvEoQ6UwWs",
  "5bQGG7C9CPSxA5ruX2fYYGq4RAoUBFixtiCpU45CPc9a"
];
const BASE = "https://oraculo-trader-deploy.vercel.app";
const SELF = BASE + "/api/copy?key=" + KEY + "&loop=1";
const MAX_W = 10;
const LOOP_MS = 150000;      // ritmo do loop: 2,5 min
const WINDOW_S = 480;        // janela de transações reportadas (cobre o intervalo com folga)

const RPCS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.rpc.extrnode.com",
  "https://rpc.ankr.com/solana"
];
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const seenSigs = new Set(); // memória da instância: nunca reavisa a mesma tx

async function tg(method, params){
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  return r.json();
}
function parseDesc(d){
  if(!d) return [...WALLETS_PADRAO];
  const i = d.indexOf(PREFIX);
  let w = [];
  if(i >= 0){
    const seg = d.slice(i + PREFIX.length).split("\n")[0];
    w = seg.split(",").map(s=>s.trim()).filter(s=>B58.test(s));
  }
  // 🛡 MERGE PERMANENTE: as carteiras padrão do dono SEMPRE entram,
  //    mesmo que a descrição do grupo tenha sido editada/apagada por alguém.
  const set = new Set([...WALLETS_PADRAO, ...w]);
  return [...set].slice(0, MAX_W);
}
function parseTs(d){ const m = /ts=(\d+)/.exec(d || ""); return m ? +m[1] : 0; }
async function getChatInfo(){
  const d = await tg("getChat", { chat_id: GROUP });
  if(!d.ok) throw new Error("falha ao ler o registro");
  return { wallets: parseDesc(d.result.description || ""), lastTs: parseTs(d.result.description || "") };
}
async function getWallets(){ return (await getChatInfo()).wallets; }
function descFor(list){
  const d = new Date();
  const hh = String(d.getUTCHours()).padStart(2,"0"), mm = String(d.getUTCMinutes()).padStart(2,"0");
  return PREFIX + list.join(",") + "\n🕐 última varredura: " + d.getUTCDate() + "/" + (d.getUTCMonth()+1) + " " + hh + ":" + mm + " UTC · ts=" + Date.now();
}
async function setWallets(list){
  list = [...new Set(list.filter(w=>B58.test(w)))].slice(0, MAX_W);
  await tg("setChatDescription", { chat_id: GROUP, description: descFor(list) });
  return list;
}
// ☁️ auto-sustentação: dispara a próxima varredura sozinho e segura a instância
// viva alguns segundos pra garantir que o pedido saia antes do congelamento
// n batimentos redundantes e escalonados (entrega de cada um é probabilística na Vercel;
// o anti-duplicata por timestamp colapsa os que chegarem juntos — sem bifurcação)
function scheduleNext(n){
  // disparo imediato + redundante (a instância segue viva segurando a resposta)
  const delays = [0, 1200];
  for(let i=0;i<Math.min(n||1, 2);i++){
    setTimeout(() => { fetch(SELF).catch(() => {}); }, delays[i]);
  }
}
const holdAlive = ms => new Promise(r => setTimeout(r, ms));

async function rpc(method, params){
  for(const url of RPCS){
    try{
      const c = new AbortController(); const t = setTimeout(()=>c.abort(), 8000);
      const r = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: c.signal
      });
      clearTimeout(t);
      if(r.status === 429) continue;
      const j = await r.json();
      if(j && !j.error) return j.result;
    }catch(_){}
  }
  return null;
}

async function dexInfo(mint){
  try{
    const c = new AbortController(); const t = setTimeout(()=>c.abort(), 4000);
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: c.signal });
    clearTimeout(t);
    const j = await r.json();
    const p = j && j.pairs && j.pairs[0];
    if(p) return { sym: (p.baseToken && p.baseToken.symbol) || "—", price: p.priceUsd || null, mcap: p.marketCap || (p.fdv || null) };
  }catch(_){}
  return null;
}
const fmtUsd = n => {
  if(n == null || !isFinite(+n)) return "—";
  n = +n;
  if(n >= 1e9) return "$"+(n/1e9).toFixed(2)+"B";
  if(n >= 1e6) return "$"+(n/1e6).toFixed(2)+"M";
  if(n >= 1e3) return "$"+(n/1e3).toFixed(1)+"K";
  if(n >= 1) return "$"+n.toFixed(2);
  return "$"+n.toPrecision(3);
};

async function tgSend(text){
  const out = [];
  for(const id of CHATS){
    try{ const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: id, text, disable_web_page_preview: true })
    }); const j = await r.json(); out.push({ id, ok: !!j.ok }); }
    catch(e){ out.push({ id, ok:false }); }
  }
  return out;
}

async function scanWallet(w){
  const sigs = await rpc("getSignaturesForAddress", [w, { limit: 12 }]);
  if(!Array.isArray(sigs)) return { wallet: w, err: "sem resposta RPC" };
  const nowS = Math.floor(Date.now()/1000);
  const fresh = sigs.filter(s => s.blockTime && s.blockTime >= nowS - WINDOW_S);
  let buys = 0, sells = 0, skipped = 0;
  for(const s of fresh){
    if(seenSigs.has(s.signature)){ skipped++; continue; }
    seenSigs.add(s.signature);
    const tx = await rpc("getTransaction", [s.signature, { maxSupportedTransactionVersion: 0, encoding: "jsonParsed" }]);
    if(!tx || !tx.meta) continue;
    const pre  = (tx.meta.preTokenBalances||[]).filter(b=>b.owner===w);
    const post = (tx.meta.postTokenBalances||[]).filter(b=>b.owner===w);
    const amt = b => (+((b.uiTokenAmount||{}).amount) || 0) / Math.pow(10, ((b.uiTokenAmount||{}).decimals) || 0);
    const mPre = {}, mPost = {};
    pre.forEach(b=>{ mPre[b.mint] = (mPre[b.mint]||0) + amt(b); });
    post.forEach(b=>{ mPost[b.mint] = (mPost[b.mint]||0) + amt(b); });
    const keys = [...new Set([...Object.keys(mPre), ...Object.keys(mPost)])];
    const acct = tx.transaction.message.accountKeys.map(k=>typeof k==="string"?k:k.pubkey).indexOf(w);
    const solPre = acct >= 0 ? (tx.meta.preBalances[acct]||0)/1e9 : 0;
    const solPost = acct >= 0 ? (tx.meta.postBalances[acct]||0)/1e9 : 0;
    for(const mint of keys){
      const a = mPre[mint]||0, b = mPost[mint]||0;
      let kind = null;
      if(b > a) kind = "buy"; else if(a > b) kind = "sell";
      if(!kind) continue;
      if(kind === "buy") buys++; else sells++;
      const info = await dexInfo(mint);
      const solSpent = Math.max(0, solPre - solPost);
      const txt =
`🕵️☁️ NUVEM · COPY TRADE ${kind === "buy" ? "🟢 CARTEIRA COMPROU" : "🔴 CARTEIRA VENDEU"} — ${info && info.sym || "—"}
💰 ${kind === "buy" ? solSpent.toFixed(2)+" SOL" : "—"}${info && info.price ? " · preço $" + info.price : ""}${info && info.mcap ? " · mcap " + fmtUsd(info.mcap) : ""}
👛 carteira: ${w.slice(0,4)}…${w.slice(-4)}
📋 CA: ${mint}
🚀 https://pump.fun/${mint}
📈 https://dexscreener.com/solana/${mint}`;
      await tgSend(txt);
    }
  }
  if(seenSigs.size > 2000) seenSigs.clear();
  return { wallet: w, novas: fresh.length, buys, sells, skipped };
}

async function runScan(){
  const info = await getChatInfo();
  const wallets = info.wallets;
  if(!wallets.length) return { ok:true, carteiras: 0, msg: "nenhuma carteira registrada na nuvem ainda", loop:"pausado (sem carteiras)" };
  const results = [];
  for(const w of wallets){
    try{ results.push(await scanWallet(w)); }
    catch(e){ results.push({ wallet: w, err: String(e && e.message || e) }); }
  }
  // carimba a hora da varredura no registro (visível no grupo)
  try{ await tg("setChatDescription", { chat_id: GROUP, description: descFor(wallets) }); }catch(_){}
  return { ok:true, hora: new Date().toISOString(), carteiras: wallets.length, resultado: results };
}

export default async function handler(req, res){
  const url = new URL(req.url, "http://x");
  const q = p => url.searchParams.get(p);
  if(q("key") !== KEY){ res.status(401).json({ ok:false, error:"chave inválida" }); return; }

  try{
    if(q("diag") !== null){
      const info = await getChatInfo();
      return res.status(200).json({ ok:true, self: SELF, carteiras: info.wallets.length, lastTs: info.lastTs, agora: Date.now() });
    }
    if(q("list") !== null){
      const w = await getWallets();
      return res.status(200).json({ ok:true, carteiras: w });
    }
    if(q("set") !== null){
      const list = q("set").split(",").map(s=>s.trim()).filter(Boolean);
      const w = await setWallets(list);
      return res.status(200).json({ ok:true, carteiras: w });
    }
    if(q("add")){
      const w = await getWallets();
      const nw = await setWallets([...w, q("add").trim()]);
      return res.status(200).json({ ok:true, carteiras: nw });
    }
    if(q("remove")){
      const w = await getWallets().then(ws=>ws.filter(x=>x !== q("remove").trim()));
      const nw = await setWallets(w);
      return res.status(200).json({ ok:true, carteiras: nw });
    }

    // ---- LOOP CONTÍNUO 24/7 (padrão ESPERA: menos saltos = mais estável) ----
    if(q("loop") !== null || q("start") !== null){
      const info = await getChatInfo();
      if(!info.wallets.length) return res.status(200).json({ ok:true, loop:"pausado", msg:"nenhuma carteira registrada na nuvem" });
      const LOOP = 160000; // ritmo: ~2,5 min
      const elapsed = info.lastTs ? Date.now() - info.lastTs : Infinity;
      if(elapsed < LOOP - 20000){
        if(q("quick") !== null) return res.status(200).json({ ok:true, loop:"em dia" }); // pulso externo: resposta imediata
        const waitMs = Math.min(LOOP - elapsed - 15000, 40000) + Math.floor(Math.random()*8000);
        await holdAlive(Math.max(4000, waitMs));
        scheduleNext(1);
        await holdAlive(2500);
        return res.status(200).json({ ok:true, loop:"esperando", proximaEm: Math.max(0, Math.round((LOOP-elapsed)/1000))+"s" });
      }
    const out = await runScan();
    out.loop = "ativo";
    try{
      fetch(`${BASE}/api/radar?key=${KEY}&loop=1`).catch(()=>{});
      fetch(`${BASE}/api/bin?key=${KEY}&loop=1`).catch(()=>{});
      fetch(`${BASE}/api/robo?key=${KEY}&loop=1`).catch(()=>{});
    }catch(_){}
    scheduleNext(2);
      try{ await fetch(SELF + "&quick=1").catch(()=>{}); }catch(_){}
      await holdAlive(18000);
      return res.status(200).json(out);
    }

    // sem params: varredura única (modo cron externo)
    const out = await runScan();
    return res.status(200).json(out);
  }catch(e){
    // erro visível no registro + tenta manter o loop vivo
    try{
      const info = await getChatInfo();
      await tg("setChatDescription", { chat_id: GROUP, description: descFor(info.wallets) + " ⚠️ " + String(e && e.message || e).slice(0,60) });
    }catch(_){}
    try{ scheduleNext(2); await fetch(SELF + "&quick=1").catch(()=>{}); await holdAlive(12000); }catch(_){}
    return res.status(500).json({ ok:false, error: String(e && e.message || e) });
  }
}
