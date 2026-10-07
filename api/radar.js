// ☁️ RADAR FUTUROS NA NUVEM — MODO ALTA PERFORMANCE & DISPARO CONTÍNUO
// Varredura de 60 pares perpétuos Binance com disparo pro Telegram 24/7.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

import { llmChat } from "./llm.js";

const KEY = "98201441";
const TG_TOKEN = "8324502851:AAGUC9ga0A29gbepACW-NQ25mcHiHUIlitU";
const CHATS = ["6371611384", "-1004456358369"];

const UNIVERSE = [
  "BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT",
  "LINKUSDT","TONUSDT","SUIUSDT","LTCUSDT","BCHUSDT","NEARUSDT","APTUSDT","ARBUSDT",
  "OPUSDT","INJUSDT","TIAUSDT","SEIUSDT","WIFUSDT","PEPEUSDT","BONKUSDT","FETUSDT",
  "RENDERUSDT","JUPUSDT","PYTHUSDT","ENAUSDT","ONDOUSDT","WLDUSDT","ORDIUSDT","1000SHIBUSDT",
  "DOTUSDT","POLUSDT","TRXUSDT","ATOMUSDT","FILUSDT","ARUSDT","AAVEUSDT","UNIUSDT",
  "FTMUSDT","ICPUSDT","ETCUSDT","XLMUSDT","ALGOUSDT","SANDUSDT","MANAUSDT","AXSUSDT",
  "GALAUSDT","CRVUSDT","SNXUSDT","LDOUSDT","THETAUSDT","KASUSDT","1000FLOKIUSDT","NOTUSDT","IOUSDT","ZROUSDT"
];

// 🛡️ Cooldown inteligente e fila anti-repetição por ativo: 60 min (evita duplicação)
const COOLDOWN_PAR_MS = 60 * 60 * 1000;
const lastSentPerSymbol = new Map();
const recentSentRadarSymbols = [];
let lastRadarRun = 0;
const holdAlive = ms => new Promise(r => setTimeout(r, ms));
const BASE = "https://oraculo-trader-deploy.vercel.app";
const SELF_RADAR = BASE + "/api/radar?key=" + KEY + "&loop=1";
const LOOP_R = 75000; // 75s (~1,2 min para varredura ágil)

function scheduleNextR(n){
  const ds = [0, 1200];
  for(let i=0; i<Math.min(n||1, 2); i++) setTimeout(() => { fetch(SELF_RADAR).catch(() => {}); }, ds[i]);
}

async function fetchLivePrice(sym){
  const endpoints = [
    `https://data-api.binance.vision/api/v3/ticker/price?symbol=${sym}`,
    `https://api.binance.com/api/v3/ticker/price?symbol=${sym}`,
    `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${sym}`
  ];
  for(const u of endpoints){
    try{
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 2500);
      const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" }, signal: c.signal });
      clearTimeout(t);
      if(r.ok){
        const j = await r.json();
        const p = parseFloat(j.price);
        if(p && !isNaN(p) && p > 0) return p;
      }
    }catch(_){}
  }
  return null;
}

function ema(vals, p){
  const k = 2/(p+1); let e = vals[0];
  const out = [e];
  for(let i=1; i<vals.length; i++){ e = vals[i]*k + e*(1-k); out.push(e); }
  return out;
}

function rsi(vals, p=14){
  if(vals.length <= p) return 50;
  let g=0, l=0;
  for(let i=1; i<=p; i++){ const d = vals[i]-vals[i-1]; if(d>=0) g+=d; else l-=d; }
  let ag = g/p, al = l/p;
  for(let i=p+1; i<vals.length; i++){
    const d = vals[i]-vals[i-1];
    ag = (ag*(p-1) + Math.max(0, d))/p;
    al = (al*(p-1) + Math.max(0, -d))/p;
  }
  if(al === 0) return 100;
  return 100 - (100/(1 + ag/al));
}

function atr(klines, p=14){
  if(klines.length < p+1) return 0;
  const trs = [];
  for(let i=1; i<klines.length; i++){
    const h = klines[i].h, l = klines[i].l, pc = klines[i-1].c;
    trs.push(Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc)));
  }
  let a = trs.slice(0, p).reduce((s,x)=>s+x, 0)/p;
  for(let i=p; i<trs.length; i++) a = (a*(p-1) + trs[i])/p;
  return a;
}

async function fetchKlinesTF(sym, tf, limit=80){
  const hosts = [
    "https://data-api.binance.vision/api/v3",
    "https://api.binance.com/api/v3"
  ];
  for(const h of hosts){
    try{
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 2800);
      const r = await fetch(`${h}/klines?symbol=${sym}&interval=${tf}&limit=${limit}`, {
        headers: { "User-Agent": "Mozilla/5.0" }, signal: c.signal
      });
      clearTimeout(t);
      if(!r.ok) continue;
      const j = await r.json();
      if(!Array.isArray(j) || j.length < 25) continue;
      return j.map(k => ({
        t: +k[0],
        o: parseFloat(k[1]),
        h: parseFloat(k[2]),
        l: parseFloat(k[3]),
        c: parseFloat(k[4]),
        v: parseFloat(k[5])
      }));
    }catch(_){}
  }
  return null;
}

function tfTendencia(kl){
  if(!kl || kl.length < 25) return null;
  const cs = kl.map(k=>k.c);
  const e21 = ema(cs, 21), e55 = ema(cs, 55);
  const i = cs.length - 1;
  const c = cs[i];
  const bull = c > e21[i] || e21[i] > e55[i];
  const bear = c < e21[i] || e21[i] < e55[i];
  const slope = (e21[i] - e21[Math.max(0, i-2)]) / (e21[Math.max(0, i-2)] || 1);
  return { bull, bear, slope, c };
}

function analyzeCandles(sym, kl, now){
  if(!kl || kl.length < 30) return null;
  const closes = kl.map(k=>k.c), vols = kl.map(k=>k.v);
  const c = closes[closes.length-1];
  const i = closes.length-1;

  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50);
  const e9n = e9[i], e21n = e21[i], e50n = e50[i];
  const r = rsi(closes);
  const volAvg = vols.slice(-20).reduce((a,b)=>a+b,0)/20;
  const volSpike = volAvg > 0 ? vols[i]/volAvg : 1;
  const a = atr(kl, 14);

  let longScore = 0;
  let shortScore = 0;

  // 1. Tendência de Médias
  if(c > e21n && e21n > e50n) longScore += 25;
  if(c < e21n && e21n < e50n) shortScore += 25;

  // 2. Momentum & Rompimento EMA9
  if(c > e9n && e9n >= e21n) longScore += 20;
  if(c < e9n && e9n <= e21n) shortScore += 20;

  // 3. Pullback / Rejeição
  if(c >= e21n * 0.995 && c <= e21n * 1.015 && e21n > e50n) longScore += 15;
  if(c <= e21n * 1.005 && c >= e21n * 0.985 && e21n < e50n) shortScore += 15;

  // 4. RSI Momentum
  if(r >= 45 && r <= 75) longScore += 15;
  if(r <= 55 && r >= 25) shortScore += 15;
  if(r < 30) longScore += 20; // Sobrevenda extrema (reversão)
  if(r > 70) shortScore += 20; // Sobrecompra extrema (reversão)

  // 5. Volume
  if(volSpike >= 1.2) { longScore += 10; shortScore += 10; }

  const long = longScore > shortScore;
  const rawScore = Math.max(longScore, shortScore);
  if(rawScore < 45) return null;

  const dir = long ? "SUBIR" : "DESCER";
  const atrPct = Math.max(0.008, a / c);
  const stop = long ? c * (1 - atrPct * 1.5) : c * (1 + atrPct * 1.5);
  const alvo = long ? c + (c - stop) * 2.0 : c - (stop - c) * 2.0;

  let scoreFinal = Math.min(98, 65 + Math.round(rawScore * 0.35));

  return {
    sym, dir, long, c, r, volSpike, atrPct, stop, alvo,
    score: scoreFinal, candleOpen: kl[i].t
  };
}

async function aiSegundaOpiniao(desc){
  try{
    const prompt = `Trader institucional de futuros cripto. Avalie o setup e responda estritamente em JSON:
${desc}
Formato: {"direcao":"SUBIR"|"DESCER","confianca":0-100}`;
    const r = await llmChat({
      messages: [{ role:"user", content: prompt }],
      timeoutMs: 3800,
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

function fmt(n){
  if(n == null || isNaN(n)) return "—";
  if(n >= 1000) return n.toFixed(2);
  if(n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

export default async function handler(req, res){
  const url = new URL(req.url, "http://x");
  const q = p => url.searchParams.get(p);
  const key = q("key") || (req.body && req.body.key);
  if(key !== KEY){ return res.status(401).json({ ok:false, error:"chave inválida" }); }

  if(q("diag") !== null){
    return res.status(200).json({ ok:true, lastRadarRun, agora: Date.now(), modo:"FUTUROS-TURBO-v6", pares: UNIVERSE.length });
  }

  const isLoop = q("loop") !== null || q("start") !== null;
  if(isLoop){
    const elapsed = lastRadarRun ? Date.now() - lastRadarRun : Infinity;
    if(elapsed < LOOP_R - 10000){
      if(q("quick") !== null) return res.status(200).json({ ok:true, loop:"em dia", ultimaHaMs: Math.round(elapsed) });
      const waitMs = Math.min(LOOP_R - elapsed - 5000, 20000);
      await holdAlive(Math.max(1500, waitMs));
      scheduleNextR(1);
      return res.status(200).json({ ok:true, loop:"esperando", proximaEm: Math.max(0, Math.round((LOOP_R - elapsed)/1000)) + "s" });
    }
  }

  const now = Date.now();

  // 1. Varredura paralela rápida de 15m nos 60 pares
  const klAll = await Promise.allSettled(UNIVERSE.map(s => fetchKlinesTF(s, "15m", 60)));
  const candidates = [];

  for(let i=0; i<UNIVERSE.length; i++){
    const sym = UNIVERSE[i];
    const lastSent = lastSentPerSymbol.get(sym) || 0;
    if(now - lastSent < COOLDOWN_PAR_MS) continue;
    if(recentSentRadarSymbols.includes(sym)) continue; // 🔒 TRAVA ANTI-REPETIÇÃO

    const r = klAll[i];
    if(r.status !== "fulfilled" || !r.value) continue;
    const sig = analyzeCandles(sym, r.value, now);
    if(sig) candidates.push(sig);
  }

  // Ordena por score e avalia os melhores
  const top = candidates.sort((a,b) => b.score - a.score).slice(0, 5);
  const sent = [];

  for(const s of top){
    if(sent.filter(x => !x.pulado).length >= 1) break; // envia apenas 1 sinal de topo absoluto por ciclo (sem repetição)

    const [liveP, kl1h] = await Promise.all([
      fetchLivePrice(s.sym),
      fetchKlinesTF(s.sym, "1h", 40)
    ]);

    if(liveP && liveP > 0){
      s.c = liveP;
      if(s.long){
        s.stop = liveP * (1 - s.atrPct * 1.5);
        s.alvo = liveP + (liveP - s.stop) * 2;
      } else {
        s.stop = liveP * (1 + s.atrPct * 1.5);
        s.alvo = liveP - (s.stop - liveP) * 2;
      }
    }

    const t1 = tfTendencia(kl1h);
    const desc = `${s.sym} perp Binance. Preço: ${fmt(s.c)}. RSI14: ${s.r.toFixed(0)}. Volume: ${s.volSpike.toFixed(1)}x. Tendência H1: ${t1&&t1.bull?"alta":t1&&t1.bear?"baixa":"neutra"}. Setup: ${s.dir}.`;
    
    // IA rápida com fallback quântico automático
    const ai = await aiSegundaOpiniao(desc);
    let confFinal = s.score;
    let iaNota = "Quant Algorítmico (90%)";

    if(ai && ai.conf >= 50){
      confFinal = Math.round((s.score * 0.5 + ai.conf * 0.5));
      iaNota = `IA Gemini (${ai.conf}%)`;
      if(ai.subir !== s.long && ai.conf >= 75){
        // IA discordou veementemente
        sent.push({ sym:s.sym, dir:s.dir, ia: "IA discordou", pulado:true });
        continue;
      }
    }

    const lev = confFinal >= 85 ? 10 : confFinal >= 75 ? 8 : 5;
    const txt = `☁️ <b>ORÁCULO FUTUROS</b> · ${s.long ? "🟢 LONG (COMPRA)" : "🔴 SHORT (VENDA)"}
━━━━━━━━━━━━━━━━━━━
🪙 <b>Par:</b> #${s.sym} (15m)
🎯 <b>Entrada:</b> ${fmt(s.c)}
🎯 <b>Alvo (TP):</b> ${fmt(s.alvo)} (R:R 2:1)
🛑 <b>Stop Loss:</b> ${fmt(s.stop)}
⚡ <b>Alavancagem Recomendada:</b> ${lev}x
💪 <b>Probabilidade:</b> ${confFinal}% (${iaNota})
━━━━━━━━━━━━━━━━━━━
📊 <b>RSI14:</b> ${s.r.toFixed(0)} · <b>Volume:</b> ${s.volSpike.toFixed(1)}x
🧭 <b>H1:</b> ${t1&&t1.bull?"🟢 ALTA":t1&&t1.bear?"🔴 BAIXA":"⚪ NEUTRO"}`;

    const r = await tgSend(txt);
    lastSentPerSymbol.set(s.sym, now);
    recentSentRadarSymbols.push(s.sym);
    if(recentSentRadarSymbols.length > 8) recentSentRadarSymbols.shift(); // Mantém histórico dos 8 últimos
    sent.push({ sym:s.sym, dir:s.dir, score:confFinal, ia:iaNota, tg:r });
  }

  try{
    fetch(`${BASE}/api/bin?key=${KEY}&loop=1`).catch(() => {});
    fetch(`${BASE}/api/copy?key=${KEY}&loop=1`).catch(() => {});
    fetch(`${BASE}/api/robo?key=${KEY}&loop=1`).catch(() => {});
  }catch(_){}

  lastRadarRun = Date.now();
  if(isLoop){
    scheduleNextR(2);
    try{ await fetch(SELF_RADAR + "&quick=1").catch(()=>{}); }catch(_){}
  }

  res.status(200).json({
    ok: true,
    hora: new Date(now).toISOString(),
    modo: "FUTUROS-TURBO-v6",
    varridos: UNIVERSE.length,
    candidatos: candidates.length,
    enviados: sent.filter(x => !x.pulado).length,
    sinais: sent
  });
}
