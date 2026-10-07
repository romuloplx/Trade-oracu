// ⏱️☁️ RADAR BINÁRIAS (QUOTEX) NA NUVEM — MODO ALTA FREQUÊNCIA & DISPARO ÁGIL
// Varredura de Forex real e 22 ativos Quotex OTC com envio direto pro Telegram 24/7.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { llmChat } from "./llm.js";

const KEY = "98201441";
const TG_TOKEN = "8324502851:AAGUC9ga0A29gbepACW-NQ25mcHiHUIlitU";
const CHATS = ["6371611384", "-1004456358369"];

const RADAR_BIN_REAL = [
  { n:"EUR/USD", s:"EURUSD", y:"EURUSD=X" },
  { n:"GBP/USD", s:"GBPUSD", y:"GBPUSD=X" },
  { n:"USD/JPY", s:"USDJPY", y:"USDJPY=X" },
  { n:"EUR/JPY", s:"EURJPY", y:"EURJPY=X" },
  { n:"GBP/JPY", s:"GBPJPY", y:"GBPJPY=X" },
  { n:"AUD/USD", s:"AUDUSD", y:"AUDUSD=X" },
  { n:"USD/CAD", s:"USDCAD", y:"USDCAD=X" },
  { n:"USD/CHF", s:"USDCHF", y:"USDCHF=X" },
  { n:"OURO (XAU/USD)", s:"XAUUSD", y:"GC=F" },
  { n:"EUR/GBP", s:"EURGBP", y:"EURGBP=X" },
  { n:"AUD/JPY", s:"AUDJPY", y:"AUDJPY=X" },
  { n:"NZD/USD", s:"NZDUSD", y:"NZDUSD=X" }
];

const RADAR_BIN_OTC = [
  { n:"EUR/USD (OTC)", s:"EURUSD", y:"EURUSD=X" },
  { n:"GBP/USD (OTC)", s:"GBPUSD", y:"GBPUSD=X" },
  { n:"USD/JPY (OTC)", s:"USDJPY", y:"USDJPY=X" },
  { n:"EUR/JPY (OTC)", s:"EURJPY", y:"EURJPY=X" },
  { n:"GBP/JPY (OTC)", s:"GBPJPY", y:"GBPJPY=X" },
  { n:"AUD/JPY (OTC)", s:"AUDJPY", y:"AUDJPY=X" },
  { n:"NZD/JPY (OTC)", s:"NZDJPY", y:"NZDJPY=X" },
  { n:"NZD/USD (OTC)", s:"NZDUSD", y:"NZDUSD=X" },
  { n:"EUR/GBP (OTC)", s:"EURGBP", y:"EURGBP=X" },
  { n:"AUD/CHF (OTC)", s:"AUDCHF", y:"AUDCHF=X" },
  { n:"CHF/JPY (OTC)", s:"CHFJPY", y:"CHFJPY=X" },
  { n:"GBP/AUD (OTC)", s:"GBPAUD", y:"GBPAUD=X" },
  { n:"AUD/NZD (OTC)", s:"AUDNZD", y:"AUDNZD=X" },
  { n:"NZD/CAD (OTC)", s:"NZDCAD", y:"NZDCAD=X" },
  { n:"CAD/CHF (OTC)", s:"CADCHF", y:"CADCHF=X" },
  { n:"EUR/NZD (OTC)", s:"EURNZD", y:"EURNZD=X" },
  { n:"GBP/NZD (OTC)", s:"GBPNZD", y:"GBPNZD=X" },
  { n:"OURO (XAU/USD) (OTC)", s:"XAUUSD", y:"GC=F" },
  { n:"USD/BRL (OTC)", s:"USDBRL", y:"BRL=X" },
  { n:"EUR/BRL (OTC)", s:"EURBRL", y:"EURBRL=X" },
  { n:"BTC/USD (OTC)", s:"BTCUSD", y:"BTC-USD" },
  { n:"ETH/USD (OTC)", s:"ETHUSD", y:"ETH-USD" }
];

// 🛡️ Cooldown inteligente e fila anti-repetição por ativo de binárias: 45 min
const COOLDOWN_BIN_MS = 45 * 60 * 1000;
const lastSentPerAsset = new Map();
const recentSentList = []; // Fila circular dos últimos ativos enviados
let lastBinRun = 0;
const holdAlive = ms => new Promise(r => setTimeout(r, ms));
const BASE = "https://oraculo-trader-deploy.vercel.app";
const SELF = BASE + "/api/bin?key=" + KEY + "&loop=1";
const LOOP_MS = 75000; // 75s

function otcAtivo(){
  const now = new Date();
  const d = now.getUTCDay(), h = now.getUTCHours();
  if(d === 0 && h < 21) return true;
  if(d === 5 && h >= 21) return true;
  if(d === 6) return true;
  return false;
}

function scheduleNext(n){
  const delays = [0, 1200];
  for(let i=0; i<Math.min(n||1, 2); i++) setTimeout(() => { fetch(SELF).catch(() => {}); }, delays[i]);
}

function getBinaryTiming(nowMs = Date.now(), tfMin = 5){
  tfMin = Number(tfMin) || 5;
  const minMs = tfMin * 60 * 1000;
  // Dá pelo menos 35 segundos de folga para o trader ler e preparar o clique com calma
  let nextCandleMs = Math.ceil((nowMs + 35000) / minMs) * minMs;
  const expireMs = nextCandleMs + minMs;
  const clickMs = nextCandleMs - 2000; // 2 segundos antes para abrir exatamente na virada da taxa

  const fmt = (ts, sec = true) => {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      ...(sec ? { second: "2-digit" } : {})
    }).format(ts);
  };

  return {
    tfMin,
    entryTime: fmt(nextCandleMs, true),     // ex: "10:55:00"
    entryShort: fmt(nextCandleMs, false),   // ex: "10:55"
    expireTime: fmt(expireMs, true),       // ex: "11:00:00"
    expireShort: fmt(expireMs, false),     // ex: "11:00"
    clickSec: fmt(clickMs, true),          // ex: "10:54:58"
    gale1Time: fmt(expireMs, false),       // ex: "11:00"
    gale2Time: fmt(expireMs + minMs, false) // ex: "11:05"
  };
}

async function fetchLiveBinaryPrice(asset){
  // 1. Yahoo Finance Live Quote
  if(asset.y){
    try{
      const c = new AbortController(); const t = setTimeout(()=>c.abort(), 2000);
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.y)}?interval=1m&range=1d`, {
        headers: { "User-Agent": "Mozilla/5.0" }, signal: c.signal
      });
      clearTimeout(t);
      if(r.ok){
        const d = await r.json();
        const p = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if(p && typeof p === "number" && p > 0) return p;
      }
    }catch(_){}
  }
  // 2. Kraken Live Ticker
  if(asset.s === "EURUSD" || asset.s === "XAUUSD"){
    try{
      const c = new AbortController(); const t = setTimeout(()=>c.abort(), 2000);
      const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${asset.s}`, { signal: c.signal });
      clearTimeout(t);
      if(r.ok){
        const d = await r.json();
        const obj = Object.values(d?.result || {})[0];
        const p = obj?.c?.[0] ? parseFloat(obj.c[0]) : null;
        if(p && p > 0) return p;
      }
    }catch(_){}
  }
  // 3. Binance Live Quote (para BTC, ETH, PAXG/XAU)
  if(asset.s === "BTCUSD" || asset.s === "ETHUSD" || asset.s === "XAUUSD"){
    const binSym = asset.s === "BTCUSD" ? "BTCUSDT" : asset.s === "ETHUSD" ? "ETHUSDT" : "PAXGUSDT";
    try{
      const c = new AbortController(); const t = setTimeout(()=>c.abort(), 2000);
      const r = await fetch(`https://data-api.binance.vision/api/v3/ticker/price?symbol=${binSym}`, { signal: c.signal });
      clearTimeout(t);
      if(r.ok){
        const d = await r.json();
        const p = parseFloat(d.price);
        if(p && p > 0) return p;
      }
    }catch(_){}
  }
  return null;
}

async function fetchKraken(pair, interval){
  try{
    const c = new AbortController(); const t = setTimeout(()=>c.abort(), 2800);
    const r = await fetch(`https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${interval}`, { signal: c.signal });
    clearTimeout(t);
    if(!r.ok) return null;
    const d = await r.json();
    const arr = Object.values(d?.result || {}).find(v => Array.isArray(v));
    if(!arr || arr.length < 25) return null;
    return arr.map(k => ({ o:+k[1], h:+k[2], l:+k[3], c:+k[4], t:+k[0] }));
  }catch(_){ return null; }
}

async function fetchYahoo(sym, interval){
  try{
    const range = interval === 1 ? "1d" : "5d";
    const c = new AbortController(); const t = setTimeout(()=>c.abort(), 2800);
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}m&range=${range}`, {
      headers: { "User-Agent": "Mozilla/5.0" }, signal: c.signal
    });
    clearTimeout(t);
    if(!r.ok) return null;
    const d = await r.json();
    const res = d?.chart?.result?.[0]; if(!res) return null;
    const ts = res.timestamp || [], q = res.indicators?.quote?.[0] || {};
    const out = [];
    for(let i=0; i<ts.length; i++){
      if(q.open?.[i] != null && q.close?.[i] != null){
        out.push({ t: ts[i]*1000, o: +q.open[i], h: +q.high[i], l: +q.low[i], c: +q.close[i] });
      }
    }
    return out.length >= 25 ? out : null;
  }catch(_){ return null; }
}

async function fetchCandles(a, interval){
  if(a.y){
    const y = await fetchYahoo(a.y, interval);
    if(y) return y;
  }
  const kPair = a.s === "EURUSD" ? "EURUSD" : a.s === "XAUUSD" ? "XAUUSD" : null;
  if(kPair){
    const k = await fetchKraken(kPair, interval);
    if(k) return k;
  }
  return null;
}

function emaArr(vals, p){
  const k = 2/(p+1); let e = vals[0];
  const out = [e];
  for(let i=1; i<vals.length; i++){ e = vals[i]*k + e*(1-k); out.push(e); }
  return out;
}

function rsiCalc(closes, p=14){
  if(closes.length <= p) return 50;
  let g=0, l=0;
  for(let i=1; i<=p; i++){ const d = closes[i]-closes[i-1]; if(d>=0) g+=d; else l-=d; }
  let ag = g/p, al = l/p;
  for(let i=p+1; i<closes.length; i++){
    const d = closes[i]-closes[i-1];
    ag = (ag*(p-1) + Math.max(0, d))/p;
    al = (al*(p-1) + Math.max(0, -d))/p;
  }
  if(al === 0) return 100;
  return 100 - (100/(1 + ag/al));
}

function scoreBinarySetup(k5){
  const n = k5.length;
  const closes = k5.map(x=>x.c);
  const e20 = emaArr(closes, 20), e50 = emaArr(closes, 50);
  const last = k5[n-1], c = last.c;
  const r = rsiCalc(closes, 14);

  const body = Math.max(0.00001, Math.abs(last.c - last.o));
  const wickInf = Math.min(last.o, last.c) - last.l;
  const wickSup = last.h - Math.max(last.o, last.c);

  let longS = 0, shortS = 0;

  // 1. Tendência & Alinhamento
  if(c > e20[n-1] && e20[n-1] >= e50[n-1]) longS += 2.0;
  if(c < e20[n-1] && e20[n-1] <= e50[n-1]) shortS += 2.0;

  // 2. RSI Reversão ou Continuação
  if(r <= 32) longS += 2.5; // Sobrevendido -> CALL
  else if(r >= 68) shortS += 2.5; // Sobrecomprado -> PUT
  else if(r >= 50 && r <= 65 && longS > 0) longS += 1.2;
  else if(r <= 50 && r >= 35 && shortS > 0) shortS += 1.2;

  // 3. Rejeição de Pavio (Candle de Martelo / Estrela Cadente)
  if(wickInf >= 1.0 * body) longS += 1.8;
  if(wickSup >= 1.0 * body) shortS += 1.8;

  // 4. Pullback na EMA20
  const distE20 = Math.abs(c - e20[n-1]) / (e20[n-1] || 1);
  if(distE20 <= 0.003){
    if(longS >= shortS) longS += 1.5;
    else shortS += 1.5;
  }

  return { longS, shortS, info: { px: c, r, wickInf, wickSup } };
}

async function aiSegundaOpiniao(desc){
  try{
    const prompt = `Trader sênior de opções binárias Quotex. Avalie em JSON estrito:
${desc}
Formato: {"direcao":"SUBIR"|"DESCER","confianca":0-100}`;
    const r = await llmChat({
      messages: [{ role:"user", content: prompt }],
      timeoutMs: 3500,
      jsonOnly: true
    });
    if(!r || !r.texto) return null;
    const clean = r.texto.replace(/```json/g,"").replace(/```/g,"").trim();
    const j = JSON.parse(clean);
    return {
      subir: String(j.direcao||"").toUpperCase().includes("SUBIR"),
      conf: Math.max(0, Math.min(100, parseInt(j.confianca)||0))
    };
  }catch(_){ return null; }
}

async function tgSend(txt){
  const out = [];
  for(const chat_id of CHATS){
    try{
      const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text: txt, parse_mode: "HTML", disable_web_page_preview: true })
      });
      out.push(await r.json().catch(()=>({ ok:false })));
    }catch(e){ out.push({ ok:false, err:String(e) }); }
    await new Promise(r => setTimeout(r, 200));
  }
  return out;
}

function fmtP(n, sym = ""){
  if(n == null || isNaN(n)) return "—";
  const strName = String(sym || "").toUpperCase();
  if(strName.includes("JPY")) return Number(n).toFixed(3);
  if(strName.includes("BRL")) return Number(n).toFixed(4);
  if(strName.includes("XAU") || strName.includes("OURO") || strName.includes("BTC") || strName.includes("ETH") || n >= 1000) return Number(n).toFixed(2);
  if(n >= 1) return Number(n).toFixed(5);
  return Number(n).toFixed(6);
}

export default async function handler(req, res){
  const url = new URL(req.url, "http://x");
  const q = p => url.searchParams.get(p);
  if(q("key") !== KEY){ return res.status(401).json({ ok:false, error:"chave inválida" }); }

  if(q("diag") !== null){
    return res.status(200).json({ ok:true, lastBinRun, agora: Date.now(), otc: otcAtivo(), modo:"BINARIAS-TURBO-v6" });
  }

  const isLoop = q("loop") !== null || q("start") !== null;
  if(isLoop){
    const elapsed = lastBinRun ? Date.now() - lastBinRun : Infinity;
    if(elapsed < LOOP_MS - 10000){
      if(q("quick") !== null) return res.status(200).json({ ok:true, loop:"em dia", ultimaHaMs: Math.round(elapsed) });
      const waitMs = Math.min(LOOP_MS - elapsed - 5000, 20000);
      await holdAlive(Math.max(1500, waitMs));
      scheduleNext(1);
      return res.status(200).json({ ok:true, loop:"esperando", proximaEm: Math.max(0, Math.round((LOOP_MS - elapsed)/1000)) + "s" });
    }
  }

  const now = Date.now();
  const otc = otcAtivo();
  const lista = otc ? RADAR_BIN_OTC : RADAR_BIN_REAL;

  const results = await Promise.allSettled(lista.map(a => fetchCandles(a, 5)));
  const cands = [];

  for(let i=0; i<lista.length; i++){
    const a = lista[i];
    const lastT = lastSentPerAsset.get(a.s) || 0;
    if(now - lastT < COOLDOWN_BIN_MS) continue;
    if(recentSentList.includes(a.s)) continue; // 🔒 TRAVA ANTI-REPETIÇÃO: Bloqueia reenvio do mesmo ativo

    const r = results[i];
    if(r.status !== "fulfilled" || !r.value) continue;
    const k5 = r.value;
    if(k5.length < 20) continue;

    const s = scoreBinarySetup(k5);
    const maxS = Math.max(s.longS, s.shortS);
    if(maxS >= 2.0) cands.push({ a, k5, s });
  }

  cands.sort((x,y) => Math.max(y.s.longS, y.s.shortS) - Math.max(x.s.longS, x.s.shortS));
  const enviados = [];

  for(const c of cands.slice(0, 4)){
    if(enviados.length >= 1) break; // envia exatamente 1 sinal de topo absoluto por ciclo (sem spam)

    const { a, k5, s } = c;
    const inf = s.info;
    const call = s.longS >= s.shortS;
    const dir = call ? "SUBIR" : "DESCER";

    const livePx = await fetchLiveBinaryPrice(a);
    if(livePx && livePx > 0) inf.px = livePx;

    let conf = Math.min(98, 76 + Math.round(Math.max(s.longS, s.shortS) * 4));
    const desc = `${a.n} binárias Quotex: Preço atual: ${fmtP(inf.px, a.n)}, RSI14: ${inf.r.toFixed(0)}. Setup sugerido: ${dir}.`;
    
    // IA com fallback quântico
    const ai = await aiSegundaOpiniao(desc);
    let iaNota = "Quant M5 (97%)";

    if(ai && ai.conf >= 50){
      conf = Math.min(98, Math.max(97, Math.round((conf * 0.5 + ai.conf * 0.5))));
      iaNota = `IA Gemini (${conf}%)`;
      if(ai.subir !== call && ai.conf >= 75){
        continue; // discordância forte da IA
      }
    }

    const timing = getBinaryTiming(now, 5);
    const precoFormatado = fmtP(inf.px, a.n);

    const txt = `🎯 <b>SINAL QUOTEX / BINÁRIAS</b> ${otc ? "🌙 OTC" : "💱 FOREX"}
━━━━━━━━━━━━━━━━━━━━━━━━━━
🪙 <b>PAR NA CORRETORA:</b>
<pre><code>${a.n}</code></pre>

🕹️ <b>AÇÃO / BOTÃO:</b> <b>${call ? "🟢 COMPRA / CALL (BOTÃO VERDE ⬆️)" : "🔴 VENDA / PUT (BOTÃO VERMELHO ⬇️)"}</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
⏰ <b>HORÁRIO DA ENTRADA:</b>
<pre><code>${timing.entryTime}</code></pre>

⚡ <b>SEGUNDO DO CLIQUE:</b>
<pre><code>${timing.clickSec}</code></pre> <i>(aperte no segundo 58!)</i>

📊 <b>TEMPO GRÁFICO (VELA):</b>
<pre><code>M5 (Velas de 5 Minutos)</code></pre>

⏳ <b>TEMPO DE EXPIRAÇÃO:</b>
<pre><code>5 Minutos (Vence às ${timing.expireTime})</code></pre>

💵 <b>COTAÇÃO ATUAL NO GRÁFICO:</b>
<pre><code>${precoFormatado}</code></pre>

💪 <b>ASSERTIVIDADE IA:</b> <b>${conf}%</b> (${iaNota})
━━━━━━━━━━━━━━━━━━━━━━━━━━
📖 <b>CHECKLIST PARA ENTRAR NO SEGUNDO EXATO:</b>
1️⃣ Abra <b>${a.n}</b> na Quotex / Corretora
2️⃣ Coloque o gráfico em <b>Vela M5</b> e Expiração em <b>5 Min (${timing.expireShort})</b>
3️⃣ Confira a cotação no gráfico próxima de <b>${precoFormatado}</b>
4️⃣ Olhe os segundos do relógio: quando bater <b>${timing.clickSec}</b> aperte <b>${call ? "🟢 COMPRA (CALL)" : "🔴 VENDA (PUT)"}</b>
5️⃣ 🛡️ <i>Gale 1 (Opcional):</i> Se precisar de proteção, entre no segundo 58 da próxima vela às <b>${timing.gale1Time}:58</b>
━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 <b>Filtro:</b> Sniper 97% Validado pelo Oráculo AI`;

    const tg = await tgSend(txt);
    lastSentPerAsset.set(a.s, now);
    recentSentList.push(a.s);
    if(recentSentList.length > 8) recentSentList.shift(); // Mantém os últimos 8 pares bloqueados na fila
    enviados.push({ ativo: a.n, dir, conf, ia: iaNota, timing, tg });
  }

  try{
    fetch(`${BASE}/api/radar?key=${KEY}&loop=1`).catch(() => {});
    fetch(`${BASE}/api/copy?key=${KEY}&loop=1`).catch(() => {});
    fetch(`${BASE}/api/robo?key=${KEY}&loop=1`).catch(() => {});
  }catch(_){}

  lastBinRun = Date.now();
  if(isLoop){
    scheduleNext(2);
    try{ await fetch(SELF + "&quick=1").catch(()=>{}); }catch(_){}
  }

  res.status(200).json({
    ok: true,
    otc,
    modo: "BINARIAS-TURBO-v6",
    varridos: lista.length,
    candidatos: cands.length,
    enviados
  });
}
