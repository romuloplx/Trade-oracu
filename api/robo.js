// ☁️ ROBÔ BINANCE FUTURES NA NUVEM — roda 24/7 (celular desligado) via /api/robo?key=98201441
// Opera na conta do usuário (testnet ou produção) com as MESMAS regras calibradas do robô
// do site: preço colado na EMA20 + pullback + vela a favor + RSI + maré H1 + IA confirmando.
// Chaves: guardadas CRIPTOGRAFADAS (AES-256-GCM, senha do baú) numa mensagem fixada do grupo.

export const maxDuration = 60;
export const dynamic = "force-dynamic";

import crypto from "crypto";

const ADMIN_KEY = "98201441";          // chave do dono (mantida por compatibilidade)
const SYS_PWD  = "oraculo-multi-v3";     // senha de sistema pra cifrar o baú de usuários
const TG_TOKEN = "8324502851:AAGUC9ga0A29gbepACW-NQ25mcHiHUIlitU";
const GROUP = "-1004456358369";
const PRIV = "6371611384";
const MARCA  = "🤖ROBOCFGV3:";           // formato multi-usuário
const LEGADO = "🤖ROBOCFG:";             // só o dono no formato antigo

const PARES_PADRAO = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT","LINKUSDT","SUIUSDT","NEARUSDT","APTUSDT","ARBUSDT","OPUSDT","INJUSDT","1000PEPEUSDT","WIFUSDT","FETUSDT","RENDERUSDT","TAOUSDT","SEIUSDT","TIAUSDT","ONDOUSDT","FTMUSDT","GALAUSDT","AAVEUSDT","UNIUSDT","LTCUSDT","BCHUSDT","DOTUSDT"];
const CFG_PADRAO = { ligado:false, modo:"real", valor:10, total:30, maxPos:2,
                     alavMax:20, riscoPor:25,
                     nota:4.2, trava:20, pares:PARES_PADRAO,
                     universo:"lista", universoMax:30, frescorMin:6 };

const BASES_PROD = ["https://fapi.binance.com", "https://www.binance.com"];
const BASE_TEST = "https://testnet.binancefuture.com";
let baseProd = null;
let _SELF_ORIGIN = "https://oraculo-trader-deploy.vercel.app";

// estado em memória da instância (informativo/dedupe — a verdade fica na Binance)
let cfgCache = null;   // { userKey: {cfg...} }
let cfgCacheTs = {};        // ts por user
let lastRoboRun = {}, ultimaAcao = {}, ultimoErro = {}, entradasTotal = {};
const cooldowns = {}; // { userKey: Map(sym->ts) }
function getUK(k){ return String(k||"").trim(); }
function gerarChaveUsuario(){
  let k;
  do{ k = String(Math.floor(10000000 + Math.random()*90000000)); } while(k === ADMIN_KEY);
  return k;
}
let batidas = 0; // cada acordar do loop soma 1 (prova de que a nuvem está viva)
const holdAlive = ms => new Promise(r => setTimeout(r, ms));
const BASE_SELF = (process.env.VERCEL_URL ? "https://"+process.env.VERCEL_URL : "https://oraculo-trader-deploy.vercel.app") + "/api/robo";
function urlUser(uk, extra){ return BASE_SELF + "?key=" + encodeURIComponent(uk) + "&loop=1&quick=1" + (extra||""); }
function scheduleUser(uk, n){
  const ds = [0, 1200];
  for(let i=0;i<Math.min(n||1,2);i++) setTimeout(() => { fetch(urlUser(uk,"&s="+(i+Math.random()))).catch(()=>{}); }, ds[i]);
}
function scheduleNext(n){ /* legado: agenda o dono */ scheduleUser(ADMIN_KEY,n); }

/* ---------------------------------- matemática ---------------------------------- */
function ema(vals, p){ const k = 2/(p+1); let e = vals[0]; const out=[e];
  for(let i=1;i<vals.length;i++){ e = vals[i]*k + e*(1-k); out.push(e); } return out; }
function rsiCalc(closes, p=14){
  if(closes.length < p+2) return 50;
  let g=0,l=0; for(let i=1;i<=p;i++){ const d=closes[i]-closes[i-1]; if(d>=0)g+=d; else l-=d; }
  let ag=g/p, al=l/p;
  for(let i=p+1;i<closes.length;i++){ const d=closes[i]-closes[i-1];
    ag=(ag*(p-1)+Math.max(d,0))/p; al=(al*(p-1)+Math.max(-d,0))/p; }
  return al===0 ? 100 : 100-100/(1+ag/al);
}
const fmt = n => { if(!isFinite(n)) return "—"; const a=Math.abs(n);
  if(a>=1000) return n.toLocaleString("pt-BR",{maximumFractionDigits:1});
  if(a>=1) return n.toLocaleString("pt-BR",{maximumFractionDigits:4});
  return n.toLocaleString("pt-BR",{maximumSignificantDigits:4}); };
const arred = (v, passo) => passo ? Math.floor(v/passo)*passo : v;

/* ---------------------------------- Telegram ---------------------------------- */
async function tg(method, params){
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(params)
  });
  return r.json().catch(()=>({}));
}
async function tgSend(text){
  const out = [];
  for(const id of [PRIV, GROUP]){
    try{ const j = await tg("sendMessage", { chat_id:id, text, disable_web_page_preview:true }); out.push({ id, ok:!!j.ok }); }
    catch(e){ out.push({ id, ok:false, err:String(e) }); }
  }
  return out;
}

/* ---------------------- cifra por usuário (chaves Binance) ---------------------- */
function senhaUser(uk){ return (String(uk||"") + "oraculo-robo-v3").slice(0,64); }
function cifrar(txt, uk){
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const k = crypto.scryptSync(senhaUser(uk||SYS_PWD), salt, 32);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const enc = Buffer.concat([c.update(txt,"utf8"), c.final()]);
  return Buffer.concat([salt,iv,c.getAuthTag(),enc]).toString("base64");
}
function decifrar(b64, uk){
  const b = Buffer.from(b64,"base64");
  const salt=b.slice(0,16), iv=b.slice(16,28), tag=b.slice(28,44), enc=b.slice(44);
  const k = crypto.scryptSync(senhaUser(uk||SYS_PWD), salt, 32);
  const d = crypto.createDecipheriv("aes-256-gcm",k,iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc),d.final()]).toString("utf8");
}
// ----------------------------- BAÚ MULTI-USUÁRIO -----------------------------
// Formato da mensagem fixada (criptografada com senha de sistema):
//   🤖ROBOCFGV3:{"usuarios":{"98201441":{...cfg}, "12345678":{...cfg}}, "proximoId":12345678}
// Cada cfg de usuário guarda _keyEnc e _secretEnc cifrados com a CHAVE DO USUÁRIO
// mesmo (scrypt(keyUser+"robo") — nem o sistema consegue ver as chaves sem a chave).
function bauVazio(){ return { usuarios:{}, proximoId: gerarChaveUsuario() }; }
async function lerBau(){
  try{
    const d = await tg("getChat", { chat_id: GROUP });
    const pin = d?.result?.pinned_message;
    const txt = pin?.text || "";
    // formato novo
    const i = txt.indexOf(MARCA);
    if(i >= 0){
      try{ return JSON.parse(txt.slice(i + MARCA.length)); }catch(_){}
    }
    // legado do dono (98201441) no formato antigo
    const j = txt.indexOf(LEGADO);
    if(j >= 0){
      try{
        const cfgDono = JSON.parse(txt.slice(j + LEGADO.length));
        const bau = bauVazio();
        bau.usuarios[ADMIN_KEY] = cfgDono;
        // salva migrando pro novo formato (silently)
        salvarBau(bau).catch(()=>{});
        return bau;
      }catch(_){}
    }
  }catch(_){}
  return bauVazio();
}
async function salvarBau(bau){
  const payload = MARCA + JSON.stringify(bau);
  try{
    const d = await tg("getChat", { chat_id: GROUP });
    const pin = d?.result?.pinned_message;
    if(pin && String(pin.text||"").includes(MARCA)){
      const e = await tg("editMessageText",{ chat_id:GROUP, message_id:pin.message_id, text:payload });
      if(e.ok || /not modified/i.test(String(e.description||""))) return true;
    }
    await tg("unpinChatMessage",{chat_id:GROUP}).catch(()=>{});
    const m = await tg("sendMessage",{chat_id:GROUP, text:payload, disable_web_page_preview:true});
    if(m.ok){
      await tg("pinChatMessage",{chat_id:GROUP, message_id:m.result.message_id, disable_notification:true});
      return true;
    }
  }catch(_){}
  throw new Error("não consegui gravar o baú de usuários no Telegram");
}
async function lerCfg(uk, forcar){
  const u = getUK(uk); if(!u) return Object.assign({}, CFG_PADRAO);
  if(!forcar && cfgCache && cfgCache[u] && Date.now()-(cfgCacheTs[u]||0) < 45000) return cfgCache[u];
  cooldowns[u] = cooldowns[u] || new Map();
  const bau = await lerBau();
  const cfg = Object.assign({}, CFG_PADRAO, bau.usuarios[u] || {});
  cfgCache = cfgCache || {}; cfgCache[u] = cfg; cfgCacheTs[u] = Date.now();
  return cfg;
}
async function salvarCfg(uk, cfg){
  const u = getUK(uk); if(!u) throw new Error("chave de usuário ausente");
  const bau = await lerBau();
  // NUNCA salva _key/_secret em texto plano no baú — apenas _keyEnc/_secretEnc cifrados
  const limpo = Object.assign({}, cfg);
  delete limpo._key; delete limpo._secret; delete limpo._detalhar;
  bau.usuarios[u] = Object.assign({}, bau.usuarios[u] || {}, limpo);
  await salvarBau(bau);
  cfgCache = cfgCache || {}; cfgCache[u] = Object.assign({}, limpo); cfgCacheTs[u] = Date.now();
  return true;
}
async function novaChaveUsuario(){
  const bau = await lerBau();
  // gera chave que não existe ainda
  let k;
  for(let t=0;t<20;t++){ k = gerarChaveUsuario(); if(!bau.usuarios[k]) break; }
  bau.usuarios[k] = Object.assign({}, CFG_PADRAO);
  await salvarBau(bau);
  return k;
}
async function listarUsuariosAtivos(){
  const bau = await lerBau();
  const lista = [];
  for(const k of Object.keys(bau.usuarios)){
    const c = Object.assign({}, CFG_PADRAO, bau.usuarios[k]);
    if(c.ligado && c._keyEnc) lista.push(k);
  }
  return lista;
}

/* ---------------------------------- Binance ---------------------------------- */
function assinar(secret, params){
  const qs = new URLSearchParams(params).toString();
  return crypto.createHmac("sha256", secret).update(qs).digest("hex");
}
async function escolherBase(){
  baseProd = null; // força re-detecção a cada ciclo (evita cache quebrado)
  if(baseProd) return baseProd;
  for(const h of BASES_PROD){
    try{ const r = await fetch(h + "/fapi/v1/time"); if(r.ok){ baseProd = h; return h; } }catch(_){}
  }
  baseProd = BASES_PROD[BASES_PROD.length-1]; return baseProd;
}
async function bin(cfg, metodo, caminho, params, assinado){
  const p = Object.assign({}, params || {});
  const headers = { "Content-Type":"application/json" };
  if(assinado){
    p.timestamp = Date.now(); p.recvWindow = 10000;
    p.signature = assinar(cfg._secret, p);
    headers["X-MBX-APIKEY"] = cfg._key;
  }
  let base;
  if(cfg.modo !== "real") base = BASE_TEST;
  else if(assinado) base = "https://fapi.binance.com"; // chamadas assinadas sempre pelo proxy edge BR
  else base = await escolherBase(); // públicas usam cache/detecção normal
  const bases = (cfg.modo === "real") ? BASES_PROD : [BASE_TEST];
  let ultErro = null;
  for(let tentativa=0; tentativa<bases.length; tentativa++){
    const b = bases[(bases.indexOf(base)+tentativa) % bases.length];
    try{
      const qs = new URLSearchParams(p).toString();
      let curl = b + caminho + (qs ? "?" + qs : "");
      if(cfg.modo === "real" && assinado && curl.indexOf("binance.com")>=0){
        // rota por edge proxy em gru1 (BR) pra evitar 451
        curl = `${_SELF_ORIGIN}/api/binproxy?u=` + encodeURIComponent(curl);
      }
      const r = await fetch(curl, { method: metodo, headers });
      if(r.status === 429 || r.status === 418){
        ultErro = `Binance ${r.status}: rate limit`;
        baseProd = null;
        await holdAlive(1500);
        continue;
      }
      const j = await r.json().catch(()=>({}));
      if(!r.ok || (j && j.code && j.code !== 200 && j.msg)){
        ultErro = `Binance ${j.code||r.status}: ${j.msg||"erro"}`;
        if(r.status === 451 || /restricted location/i.test(j.msg||"")) continue; // tenta outro host
        throw new Error(ultErro);
      }
      baseProd = b;
      return j;
    }catch(e){
      if(/restricted location/i.test(String(e.message||e))) { ultErro = e.message; continue; }
      if(tentativa === bases.length-1) throw e;
      ultErro = String(e.message||e);
    }
  }
  throw new Error(ultErro || "Binance indisponível em todos os hosts");
}
async function klines(sym, tf, limite){
  for(const u of [`https://www.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=${limite}`,
                  `https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${tf}&limit=${limite}`]){
    try{
      const r = await fetch(u);
      if(!r.ok) continue;
      const j = await r.json();
      if(Array.isArray(j) && j.length > 40)
        return j.map(k=>({ t:+k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5] }));
    }catch(_){}
  }
  return null;
}
function roboDecPlaces(step) {
  if (!step || step >= 1) return 0;
  const s = String(step);
  if (s.includes("e-")) return parseInt(s.split("e-")[1], 10);
  const parts = s.split(".");
  return parts.length > 1 ? parts[1].replace(/0+$/, "").length : 0;
}
function roboFormatPrice(price, tick) {
  const dec = Math.max(0, roboDecPlaces(tick));
  const factor = Math.pow(10, dec);
  const rounded = Math.round(price * factor) / factor;
  return rounded.toFixed(dec);
}
function roboFormatQty(qty, step) {
  const dec = Math.max(0, roboDecPlaces(step));
  const factor = Math.pow(10, dec);
  const rounded = Math.floor(qty * factor) / factor;
  return rounded.toFixed(dec);
}

let infoCache = null;
async function infoPar(cfg, sym){
  if(!infoCache || Date.now()-infoCache.ts > 6*3600e3){
    const d = await bin(cfg, "GET", "/fapi/v1/exchangeInfo", {}, false);
    infoCache = { ts: Date.now(), symbols: d.symbols || [] };
  }
  const s = infoCache.symbols.find(x => x.symbol === sym && (x.status === "TRADING" || !x.status));
  if(!s) throw new Error("par " + sym + " não existe nos futuros USDT-M");
  let step = 0.001, tick = 0.01, minNot = 5;
  let multiplierUp = 1.04, multiplierDown = 0.96;
  const pricePrec = s.pricePrecision != null ? s.pricePrecision : null;
  const qtyPrec = s.quantityPrecision != null ? s.quantityPrecision : null;
  (s.filters || []).forEach(f => {
    if(f.filterType === "LOT_SIZE") step = +f.stepSize;
    else if(f.filterType === "PRICE_FILTER") tick = +f.tickSize;
    else if(f.filterType === "MIN_NOTIONAL") minNot = +(f.notional || 5);
    else if(f.filterType === "PERCENT_PRICE") {
      multiplierUp = parseFloat(f.multiplierUp) || 1.04;
      multiplierDown = parseFloat(f.multiplierDown) || 0.96;
    }
  });
  return { step, tick, minNot, multiplierUp, multiplierDown, pricePrec, qtyPrec };
}

/* ---------------------------- 🤖 trava IA (UnoRouter) ---------------------------- */
const UNO_KEY = "sk-YW73oQ027I2XI333Dolq1x9ige9royh9uWJfECyNFXYXPIpj";
const UNO_MODELOS = ["gemini-3.5-flash-lite:free", "deepseek-v4-flash:free"];
let _unoProx = 0;
async function aiSegundaOpiniao(desc){
  const prompt = "Você é um trader quantitativo sênior. Leia o resumo técnico e diga a direção provável do PRÓXIMO movimento desse ativo. Não repita tendência sem evidência. Responda APENAS um JSON puro com o campo direcao valendo somente UMA das duas opções (SUBIR ou CAIR) e confianca de 0 a 100. Resumo: " + desc;
  const inicio = Date.now();
  for(const m of UNO_MODELOS){
    for(let tent=0; tent<2; tent++){
      if(Date.now()-inicio > 15000) return null;
      const espera = _unoProx - Date.now();
      if(espera > 0) await holdAlive(espera);
      _unoProx = Date.now() + 1600;
      try{
        const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 8000);
        const r = await fetch("https://api.unorouter.com/v1/chat/completions", {
          method:"POST", signal: ctrl.signal,
          headers:{ "Content-Type":"application/json", "Authorization":"Bearer " + UNO_KEY },
          body: JSON.stringify({ model:m, temperature:0, max_tokens:60, messages:[{ role:"user", content:prompt }] })
        });
        clearTimeout(t);
        if(r.status === 429 || (r.status >= 500 && r.status < 600)){
          if(tent === 0){ _unoProx = Date.now() + 2600; continue; } break;
        }
        if(!r.ok) break;
        const j = await r.json();
        const raw = String(j.choices?.[0]?.message?.content || "");
        const up = raw.toUpperCase();
        let subir = null, conf = null;
        const mj = raw.match(/\{[\s\S]*\}/);
        if(mj){ try{ const jo = JSON.parse(mj[0]); const d = String(jo.direcao||jo.direction||"").toUpperCase();
          if(d.includes("SUBIR")||d==="UP"||d==="LONG") subir = true;
          else if(d.includes("CAIR")||d.includes("BAIX")||d.includes("DESC")||d==="DOWN"||d==="SHORT") subir = false;
          if(typeof jo.confianca === "number") conf = jo.confianca;
        }catch(_){}} 
        if(subir === null){
          const s1 = up.includes("SUBIR")||up.includes("LONG");
          const s0 = up.includes("CAIR")||up.includes("BAIXAR")||up.includes("DESCER")||up.includes("SHORT");
          if(s1 !== s0) subir = s1;
        }
        if(subir === null) break;
        if(conf === null){ const mc = raw.match(/confian[çc]a\D{0,12}(\d{1,3})/i) || raw.match(/(\d{1,3})\s*%/); conf = mc ? +mc[1] : 70; }
        return { subir, conf: Math.max(0, Math.min(100, conf)) };
      }catch(_){ break; }
    }
  }
  return null;
}

function macdCalc(closes){
  if(!closes || closes.length < 35) return { macd: 0, sig: 0, hist: 0 };
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const macdLine = [];
  for(let j=0; j<closes.length; j++) macdLine.push(e12[j] - e26[j]);
  const sigLine = ema(macdLine.slice(25), 9);
  const m = macdLine[macdLine.length - 1] || 0;
  const s = sigLine[sigLine.length - 1] || 0;
  return { macd: m, sig: s, hist: m - s };
}

function adxCalc(k, p=14){
  if(!k || k.length < p * 2) return 25;
  let tr = [], dmP = [], dmM = [];
  for(let j=1; j<k.length; j++){
    const h = k[j].h, l = k[j].l, ph = k[j-1].h, pl = k[j-1].l, pc = k[j-1].c;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    const up = h - ph, dn = pl - l;
    dmP.push(up > dn && up > 0 ? up : 0);
    dmM.push(dn > up && dn > 0 ? dn : 0);
  }
  const trE = ema(tr, p), pE = ema(dmP, p), mE = ema(dmM, p);
  const dx = [];
  for(let j=0; j<trE.length; j++){
    const diP = trE[j] > 0 ? (pE[j]/trE[j])*100 : 0;
    const diM = trE[j] > 0 ? (mE[j]/trE[j])*100 : 0;
    const sum = diP + diM;
    dx.push(sum > 0 ? (Math.abs(diP - diM)/sum)*100 : 0);
  }
  const adx = ema(dx, p);
  return adx[adx.length - 1] || 25;
}

let btcCache = null;
async function btcTrendDirection(){
  if(btcCache && Date.now() - btcCache.ts < 60000) return btcCache.dir;
  try{
    const k = await klines("BTCUSDT", "15m", 40);
    if(k && k.length >= 30){
      const cs = k.map(x=>x.c);
      const e20 = ema(cs, 20), e50 = ema(cs, 50);
      const last = cs[cs.length - 1];
      const dir = (last >= e20[e20.length - 1] && e20[e20.length - 1] >= e50[e50.length - 1]) ? "BULL"
                : (last <= e20[e20.length - 1] && e20[e20.length - 1] <= e50[e50.length - 1]) ? "BEAR" : "NEUTRAL";
      btcCache = { dir, ts: Date.now() };
      return dir;
    }
  }catch(_){}
  return "NEUTRAL";
}

/* ------------------- 🎯 MOTOR INSTITUCIONAL SNIPER: ALTA ASSERTIVIDADE 97% ------------------- */
function scoreSetup(k){
  const n = k.length, closes = k.map(x=>x.c);
  const e9 = ema(closes, 9), e21 = ema(closes, 21), e50 = ema(closes, 50);
  const e20 = e21;
  const i = n-1, px = closes[i], r = rsiCalc(closes);
  let atr = 0; for(let j=n-14;j<n;j++) atr += k[j].h - k[j].l; atr /= 14;
  const sup = Math.min(...k.slice(-50).map(x=>x.l)), res = Math.max(...k.slice(-50).map(x=>x.h));
  const last = k[i], prev = k[i-1], antepen = k[i-2] || prev;
  const body = Math.abs(last.c - last.o) || 1e-9;
  const wickInf = Math.min(last.o, last.c) - last.l, wickSup = last.h - Math.max(last.o, last.c);
  const bullEng = last.c > last.o && prev.c < prev.o && last.c >= prev.o && last.o <= prev.c;
  const bearEng = last.c < last.o && prev.c > prev.o && last.c <= prev.o && last.o >= prev.c;

  // 1. TENDÊNCIA E MOMENTUM
  const slope21 = e21[i] - e21[i-2];
  const adx = adxCalc(k, 14);

  // 2. DETECÇÃO DE PULLBACK NA EMA21
  let pbL = false, pbS = false;
  for(let j = i-2; j <= i; j++){
    if(j > 0 && k[j].l <= e21[j] + 0.35*atr && k[j].c >= e21[j] - 0.20*atr) pbL = true;
    if(j > 0 && k[j].h >= e21[j] - 0.35*atr && k[j].c <= e21[j] + 0.20*atr) pbS = true;
  }

  // 3. VOLUME INSTITUCIONAL
  let avgVol = 0;
  for(let j = Math.max(0, n-10); j < n-1; j++) avgVol += (+k[j].v || 0);
  avgVol /= Math.max(1, Math.min(9, n-1));
  const volRatio = avgVol > 0 ? (+last.v || 0) / avgVol : 1.0;
  const solidBody = body / (last.h - last.l || 1e-9) >= 0.45;

  let longS = 0, shortS = 0;

  // 🟢 PONTUAÇÃO DE LONG (COMPRA)
  if (px >= e21[i] && slope21 >= 0) {
    longS += 1.8; // Preço alinhado com a EMA21
    if (e9[i] >= e21[i]) longS += 1.0;
    if (e21[i] >= e50[i]) longS += 1.2;
    if (pbL) longS += 1.8; // Pullback saudável
    if (last.c > last.o) longS += 0.8;
    if (solidBody) longS += 0.8;
    if (volRatio >= 1.1) longS += 1.0;
    if (bullEng) longS += 1.2;
    if (wickInf >= 0.5 * body) longS += 1.0; // Rejeição compradora
    if (r >= 38 && r <= 68) longS += 1.0;
    if (adx >= 16) longS += 0.8;
  }

  // 🔴 PONTUAÇÃO DE SHORT (VENDA)
  if (px <= e21[i] && slope21 <= 0) {
    shortS += 1.8; // Preço alinhado com a EMA21
    if (e9[i] <= e21[i]) shortS += 1.0;
    if (e21[i] <= e50[i]) shortS += 1.2;
    if (pbS) shortS += 1.8; // Pullback/repique saudável
    if (last.c < last.o) shortS += 0.8;
    if (solidBody) shortS += 0.8;
    if (volRatio >= 1.1) shortS += 1.0;
    if (bearEng) shortS += 1.2;
    if (wickSup >= 0.5 * body) shortS += 1.0; // Rejeição vendedora
    if (r >= 28 && r <= 62) shortS += 1.0;
    if (adx >= 16) shortS += 0.8;
  }

  const bbw = k.slice(-26, -2);
  const swH24 = Math.max(...bbw.map(x=>x.h)), swL24 = Math.min(...bbw.map(x=>x.l));
  const bosUp = px > swH24, bosDn = px < swL24;
  const rngPct = (swH24 - swL24)/px*100;
  const struct = bosUp ? "BOS ALTA (rompimento institucional)" : bosDn ? "BOS BAIXA (queda institucional)" : (rngPct < 5 ? "consolidação" : "range amplo");

  return {
    longS,
    shortS,
    info: { px, e20, e50, r, sup, res, atr, swH24, swL24, struct, pbL, pbS, adx }
  };
}

function h1Alinha(k60, dir){
  if(!k60 || k60.length < 30) return false;
  const closes = k60.map(x=>x.c);
  const e21 = ema(closes, 21), e50 = ema(closes, 50);
  const i = closes.length - 1;
  const slope21 = e21[i] - e21[i-2];
  const h1Bull = e21[i] > e50[i] && closes[i] >= e21[i] && slope21 > 0;
  const h1Bear = e21[i] < e50[i] && closes[i] <= e21[i] && slope21 < 0;
  if (dir === "SUBIR") return h1Bull;
  if (dir === "DESCER") return h1Bear;
  return false;
}
function trendTxt(k60){
  if(!k60 || k60.length < 25) return "n/d";
  const cs = k60.map(x=>x.c), e = ema(cs,21), i = cs.length-1, sl = e[i]-e[i-3];
  return cs[i] >= e[i] ? (sl >= 0 ? "acima da EMA21 e subindo" : "acima da EMA21 perdendo força")
                       : (sl <= 0 ? "abaixo da EMA21 e caindo" : "abaixo da EMA21 recuperando");
}

/* ============ 🔎 VARREDURA TOTAL: todos os pares de cripto da Binance Futures ============ */
const SKIP_STABLES = /^(USDC|BUSD|FDUSD|TUSD|USDP|EUR|EURI|DAI|AEUR|JPY|BRL|TRY|GBP|AUD|XUSD|USD0|USD1|USDE|USDS|BFDUSD|WBETH|GOOGL|TSLA|AAPL|AMZN|MSFT|NVDA|META|MSTR|SKHY|COIN|BABA|AMD|NFLX|BRK)/i;
let univCache = null, tickerCache = null;
async function universoSymbols(cfg){
  const max = Math.min(250, Math.max(20, cfg.universoMax || 200));
  // 1) lista completa de perpétuos USDT-M em negociação (SOMENTE CRIPTO REAL)
  if(!univCache || Date.now()-univCache.ts > 6*3600e3){
    let info = null;
    for(const u of ["https://www.binance.com/fapi/v1/exchangeInfo", "https://data-api.binance.vision/api/v3/exchangeInfo"]){
      try{ const r = await fetch(u); if(r.ok){ const j = await r.json(); if(j && j.symbols){ info = j; break; } } }catch(_){}
    }
    if(!info) return null;
    const lista = info.symbols.filter(s =>
      s.status === "TRADING" && s.quoteAsset === "USDT" &&
      (s.contractType === "PERPETUAL" || !s.contractType) &&
      !SKIP_STABLES.test(s.symbol) &&
      !/[^\x00-\x7F]/.test(s.symbol) &&
      !/(_|UP|DOWN|BULL|BEAR)/.test(s.symbol.replace("USDT",""))
    ).map(s => s.symbol);
    univCache = { ts: Date.now(), lista };
  }
  // 2) ordena por liquidez (volume 24h): quem tem dinheiro de verdade é varrido primeiro
  try{
    if(!tickerCache || Date.now()-tickerCache.ts > 5*60000){
      let tk = null;
      for(const u of ["https://www.binance.com/fapi/v1/ticker/24hr", "https://data-api.binance.vision/api/v3/ticker/24hr"]){
        try{ const r = await fetch(u); if(r.ok){ const j = await r.json(); if(Array.isArray(j)){ tk = j; break; } } }catch(_){}
      }
      if(tk) tickerCache = { ts: Date.now(), mapa: new Map(tk.map(t => [t.symbol, +t.quoteVolume || 0])) };
    }
  }catch(_){}
  const vol = tickerCache ? tickerCache.mapa : null;
  const lista = univCache.lista.slice().sort((a,b) => (vol ? (vol.get(b)||0)-(vol.get(a)||0) : 0));
  // corta ruído: precisa girar pelo menos ~1M USDT/dia
  const filtrada = vol ? lista.filter(s => (vol.get(s)||0) >= 1000000) : lista;
  return filtrada.slice(0, max);
}
async function klinesPool(syms, tf, limite, conc){
  const out = new Map(); let i = 0;
  const workers = Array.from({ length: Math.max(1, conc || 16) }, async () => {
    while(i < syms.length){
      const s = syms[i++];
      const k = await klines(s, tf, limite);
      if(k) out.set(s, k);
    }
  });
  await Promise.all(workers);
  return out;
}

/* --------- fase 1: filtro barato (sem rede) por timeframe (M15 e H1) --------- */
const TFS = [
  { tf:"15m", ms:15*60000, n:200, nome:"M15", frescor: ()=>(15*60000), atrSl:1.05, atrTp:2.60, requireH1:true },
  { tf:"1h",  ms:60*60000, n:120, nome:"H1",  frescor: ()=>(60*60000), atrSl:1.25, atrTp:3.20, requireH1:false }
];
function filtroRapido(k0, cfg, now, sym, tfDef){
  if(!k0 || !k0.length) return null;
  const k = k0.filter(x => x.t + tfDef.ms <= now);
  if(k.length < (tfDef.tf === "1h" ? 40 : 60)) return null;
  const ultimo = k[k.length-1];
  const penultimo = k[k.length-2] || ultimo;
  const janela = typeof tfDef.frescor === "function" ? tfDef.frescor(cfg) : tfDef.ms;
  if(now - (ultimo.t + tfDef.ms) > janela) return null;
  const s = scoreSetup(k), inf = s.info, atr = inf.atr;
  if(!atr) return null;
  if (s.longS === 0 && s.shortS === 0) return null;
  if (s.longS > 0 && s.shortS > 0 && Math.abs(s.longS - s.shortS) < 1.0) return null; // conflito de direção

  // 🔒 TRAVA ANTI-INVERSÃO SNIPER: Escolha estritamente o lado de maior pontuação
  const lado = s.longS > s.shortS ? "SUBIR" : "DESCER";
  const nota = lado === "SUBIR" ? s.longS : s.shortS;
  const notaMin = tfDef.tf === "1h" ? Math.max(3.2, Number(cfg.nota||4.0) - 0.3) : Number(cfg.nota||4.0);
  if(nota < notaMin) return null;

  // 🛡️ TRAVA DE DISTÂNCIA: Entrada próxima da EMA21 (máx 0.45 ATR)
  const dist = Math.abs(inf.px - inf.e20)/atr;
  if(dist > 0.45) return null;
  const pbOk = lado === "SUBIR" ? inf.pbL : inf.pbS;

  // 🔒 TRAVA DE VELA E MOMENTUM EXATO:
  if(lado === "SUBIR"){
    if(inf.px < inf.e20) return null; // estritamente acima da média
    if(inf.r < 38 || inf.r > 70) return null; // RSI em zona de aceleração
  } else {
    if(inf.px > inf.e20) return null; // estritamente abaixo da média
    if(inf.r < 25 || inf.r > 62) return null; // RSI em zona de aceleração
  }

  return { sym, lado, nota, dist, pbOk, inf, atr, tf:tfDef };
}

/* --------- fase 2: confirmação por timeframe --------- */
function roboCalcularAlavancagem(sym, slPct, nota, iaConf, tetoUser, riscoPorPct){
  const riscoPor = Math.min(0.8, Math.max(0.05, (riscoPorPct || 50) / 100));
  // 1. Limite seguro para o Stop Loss ocorrer muito antes de qualquer liquidação (buffer de 75%)
  const maxAlavLiquidacao = Math.floor(0.75 / Math.max(0.005, slPct));
  // 2. Alavancagem ideal calculada pela distância do Stop Loss para calibrar a perda máxima exata
  const alavPorRisco = Math.round(riscoPor / Math.max(0.005, slPct));
  let alavAuto = Math.min(maxAlavLiquidacao, alavPorRisco);

  // 3. Modulador de Confluência Técnica e IA — MODO SNIPER 98%
  const conf = iaConf !== null && iaConf !== undefined ? iaConf : 70;
  if (nota >= 4.5 && conf >= 85) alavAuto = Math.round(alavAuto * 1.25);
  else if (nota <= 3.8 || conf < 75) alavAuto = Math.round(alavAuto * 0.80);

  // 4. Limite inteligente por classe de ativo:
  const isMajor = /^(BTC|ETH)USDT$/i.test(sym);
  const isMid = /^(SOL|BNB|XRP|DOGE|ADA|AVAX|LINK)USDT$/i.test(sym);
  const tetoClasse = isMajor ? (tetoUser || 35) : isMid ? Math.min(tetoUser || 20, 20) : Math.min(tetoUser || 10, 10);
  return Math.min(tetoClasse, Math.max(3, alavAuto));
}

async function precoAtual(sym){
  for(const u of [`https://www.binance.com/fapi/v1/ticker/price?symbol=${sym}`,
                  `https://data-api.binance.vision/api/v3/ticker/price?symbol=${sym}`]){
    try{ const r = await fetch(u); if(r.ok){ const j = await r.json(); const p = +j.price; if(p > 0) return p; } }catch(_){}
  }
  return null;
}
async function confirmarPar(cand, cfg, dbg){
  const { sym, lado, nota, dist, pbOk, inf, atr, tf } = cand;
  const tfNome = tf.nome;
  const anota = (etapa, detalhe) => { if(dbg) dbg.push({ sym, etapa: tfNome+"·"+etapa, detalhe }); };

  // 🔒 TRAVA DE OURO: Alinhamento com a tendência do Bitcoin para todas as altcoins
  if(sym !== "BTCUSDT"){
    const btcDir = await btcTrendDirection();
    if(lado === "SUBIR" && btcDir === "BEAR"){ anota("BTC em queda", "bloqueando compras em altcoins"); return null; }
    if(lado === "DESCER" && btcDir === "BULL"){ anota("BTC em alta", "bloqueando vendas em altcoins"); return null; }
  }

  const pa = await precoAtual(sym);
  let atraso = 0;
  if(pa){
    const long0 = lado === "SUBIR";
    const desvio = (pa - inf.px)/atr * (long0 ? 1 : -1);
    atraso = Math.max(0, desvio);
    if(desvio > 0.30){ anota("preço já esticou", `${desvio.toFixed(2)} ATR`); return null; }
    if(desvio < -0.25){ anota("gatilho invalidado", `${Math.abs(desvio).toFixed(2)} ATR contra`); return null; }
  }
  // confirmação de maré alta só para o TF menor (M15 exige H1 alinhado; H1 é o próprio sinal de tendência)
  if(tf.tf === "15m"){
    const kh1 = await klines(sym, "1h", 60);
    if(kh1 && !h1Alinha(kh1, lado)){ anota("H1 contra", trendTxt(kh1)); return null; }
  }
  let ia = null;
  try{
    const desc = `${sym} futuros perp ${tfNome} Binance: preço ${fmt(inf.px)}, RSI14 ${inf.r.toFixed(0)}, ADX14 ${inf.adx ? inf.adx.toFixed(0) : "25"}, MACD ${inf.macd?.hist > 0 ? "BULL" : "BEAR"}, distância da EMA20 ${dist.toFixed(2)} ATR (pullback ${pbOk ? "confirmado" : "não"}), estrutura ${inf.struct}, atr ${(atr/inf.px*100).toFixed(2)}% (${tfNome})`;
    ia = await aiSegundaOpiniao(desc);
    if(ia && (ia.subir !== (lado === "SUBIR"))){ anota("IA discordou", ia.conf + "%"); return null; }
    const minIa = Number(cfg.nota) >= 4.0 ? 82 : Number(cfg.nota) >= 3.5 ? 75 : 60;
    if(ia && ia.conf < minIa){ anota("IA sem convicção suficiente", ia.conf + "% < " + minIa + "%"); return null; }
  }catch(_){}
  if(!ia && nota < cfg.nota + 0.5){ anota("sem IA e nota apertada", nota); return null; }
  const base = pa || inf.px;
  // ATR do TF: M15 = stop curto/alvo rápido · H1 = stop mais largo/alvo maior (movimento mais forte)
  const atrMult = tf.tf === "1h" ? 1.25 : 1.05;
  const tpMult  = tf.tf === "1h" ? 3.20 : 2.60;
  const slPct = atrMult * atr / base;
  const tpPct = tpMult  * atr / base;
  const minRR = 2.2;
  if(tpPct < slPct * minRR){ anota("R:R curto", ""); return null; }
  const alav = roboCalcularAlavancagem(sym, slPct, nota, ia ? ia.conf : null, cfg.alavMax, cfg.riscoPor);
  const long = lado === "SUBIR";
  const perdaSeParar = cfg.valor * alav * slPct;
  const ganhoSeBater = cfg.valor * alav * tpPct;
  return { sym, dir:lado, long, nota, ia: ia ? ia.conf : null, preco: base,
           atraso, tf:tfNome,
           slPct, tpPct, alav,
           stop: long ? base*(1-slPct) : base*(1+slPct),
           alvo: long ? base*(1+tpPct) : base*(1-tpPct),
           r:inf.r, dist, struct: inf.struct, rr: tpPct/slPct, atr,
           perdaSeParar:+perdaSeParar.toFixed(2), ganhoSeBater:+ganhoSeBater.toFixed(2),
           motivo: `${inf.struct} · RSI ${inf.r.toFixed(0)} · ADX ${(inf.adx||25).toFixed(0)} · pullback na EMA20 (${tfNome}) · R:R ${(tpPct/slPct).toFixed(2)} · ⚡ ${alav}x automático · 🎯 Sniper 98%`,
           pontos: nota + (ia ? ia.conf/100*2.0 : 0) + (tf.tf === "1h" ? 0.5 : 0) };
}

async function analisarPar(sym, cfg, now, dbg, kPools){
  // kPools = { "15m": Map, "1h": Map }
  let melhor = null;
  for(const tfDef of TFS){
    const kPre = kPools && kPools[tfDef.tf] ? kPools[tfDef.tf].get(sym) : null;
    const kl = kPre || await klines(sym, tfDef.tf, tfDef.n);
    const cand = filtroRapido(kl, cfg, now, sym, tfDef);
    if(!cand){ if(dbg) dbg.push({ sym, etapa:tfDef.nome+"·filtro", detalhe:"não passou" }); continue; }
    try{
      const s = await confirmarPar(cand, cfg, dbg);
      if(s && (!melhor || s.pontos > melhor.pontos)) melhor = s;
    }catch(e){ if(dbg) dbg.push({ sym, etapa:tfDef.nome+"·erro", detalhe:String(e.message||e) }); }
  }
  return melhor;
}

async function abrirPosicao(sig, cfg){
  const info = await infoPar(cfg, sig.sym);
  const margemDesejada = Math.max(1, cfg.valor || 10);
  const alav = sig.alav || 10;
  const targetNotional = margemDesejada * alav;
  let qtdNum = targetNotional / sig.preco;

  // Arredonda para baixo respeitando o step da Binance para NUNCA ultrapassar a margem definida
  const dec = Math.max(0, roboDecPlaces(info.step));
  const factor = Math.pow(10, dec);
  let qtdRounded = Math.floor(qtdNum * factor) / factor;

  // Ajusta pelo risco máximo permitido por trade, se configurado
  for(let t = 0; t < 3 && qtdRounded > 0; t++){
    const perda = qtdRounded * sig.preco * sig.slPct;
    if(perda <= margemDesejada * ((cfg.riscoPor || 50) / 100)) break;
    qtdRounded = Math.max(0, Math.floor((qtdRounded - info.step) * factor) / factor);
  }

  const qtdStr = roboFormatQty(qtdRounded, info.step, info.qtyPrec);
  const qtd = parseFloat(qtdStr);
  if(qtd <= 0) throw new Error(`margem de ${fmt(margemDesejada)} USDT insuficiente pro lote mínimo de ${sig.sym} (${info.step})`);
  const notional = qtd * sig.preco;
  if(notional < (info.minNot || 5)) throw new Error(`${sig.sym} exige notional mínimo de ${fmt(info.minNot || 5)} USDT (sua margem de ${fmt(margemDesejada)} USDT @ ${alav}x dá ${fmt(notional)} USDT)`);
  
  await bin(cfg, "POST", "/fapi/v1/leverage", { symbol:sig.sym, leverage:alav }, true).catch(()=>{});
  try{ await bin(cfg, "POST", "/fapi/v1/marginType", { symbol:sig.sym, marginType:"ISOLATED" }, true); }
  catch(_){ /* Já está em ISOLATED ou a Binance não requer alteração */ }
  const ord = await bin(cfg, "POST", "/fapi/v1/order",
    { symbol:sig.sym, side: sig.long ? "BUY" : "SELL", type:"MARKET", quantity: qtdStr }, true);
  const entrada = +ord.avgPrice || sig.preco;
  const fecha = sig.long ? "SELL" : "BUY";

  // Limpa ordens antigas para garantir liberação total de margem e evitar conflito de ReduceOnly
  try {
    await bin(cfg, "DELETE", "/fapi/v1/allOpenOrders", { symbol: sig.sym }, true);
  } catch(_) {}

  // Verifica se a conta está em modo Hedge (Dual Side)
  let isDual = false;
  try {
    const dualRes = await bin(cfg, "GET", "/fapi/v1/positionSide/dual", {}, true);
    isDual = !!(dualRes && dualRes.dualSidePosition);
  } catch(_) {}
  const posSide = isDual ? (sig.long ? "LONG" : "SHORT") : "BOTH";

  // Puxa o Mark Price exato da Binance
  let markPrice = entrada;
  try {
    const pIdx = await bin(cfg, "GET", "/fapi/v1/premiumIndex", { symbol: sig.sym }, false);
    markPrice = parseFloat(pIdx.markPrice) || entrada;
  } catch(_) {
    try {
      const tk = await bin(cfg, "GET", "/fapi/v1/ticker/price", { symbol: sig.sym }, false);
      markPrice = parseFloat(tk.price) || entrada;
    } catch(_) {}
  }

  const mUp = info.multiplierUp || 1.04;
  const mDn = info.multiplierDown || 0.96;

  let stopReal = sig.long ? entrada*(1-sig.slPct) : entrada*(1+sig.slPct);
  let alvoReal = sig.long ? entrada*(1+sig.tpPct) : entrada*(1-sig.tpPct);

  if (sig.long) {
    const maxStop = markPrice * 0.995;
    const minStop = markPrice * (mDn + 0.005);
    stopReal = Math.min(stopReal, maxStop);
    stopReal = Math.max(stopReal, minStop);

    const minAlvo = markPrice * 1.008;
    const maxAlvo = markPrice * (mUp - 0.005);
    alvoReal = Math.max(alvoReal, minAlvo);
    alvoReal = Math.min(alvoReal, maxAlvo);
  } else {
    const minStop = markPrice * 1.005;
    const maxStop = markPrice * (mUp - 0.005);
    stopReal = Math.max(stopReal, minStop);
    stopReal = Math.min(stopReal, maxStop);

    const maxAlvo = markPrice * 0.992;
    const minAlvo = markPrice * (mDn + 0.005);
    alvoReal = Math.min(alvoReal, maxAlvo);
    alvoReal = Math.max(alvoReal, minAlvo);
  }

  const slStr = roboFormatPrice(stopReal, info.tick);
  const tpStr = roboFormatPrice(alvoReal, info.tick);
  const perdaReal = qtd*entrada*sig.slPct;
  const ganhoReal = qtd*entrada*sig.tpPct;
  let prot = 0;

  // 🛑 1. Gravar STOP LOSS no servidor
  try {
    const pSl = { symbol: sig.sym, side: fecha, positionSide: posSide, type: "STOP_MARKET", stopPrice: slStr, closePosition: "true", workingType: "MARK_PRICE" };
    await bin(cfg, "POST", "/fapi/v1/order", pSl, true);
    prot++;
  } catch(e1) {
    try {
      const pSl2 = { symbol: sig.sym, side: fecha, positionSide: posSide, type: "STOP_MARKET", stopPrice: slStr, quantity: qtdStr, workingType: "MARK_PRICE" };
      if (!isDual) pSl2.reduceOnly = "true";
      await bin(cfg, "POST", "/fapi/v1/order", pSl2, true);
      prot++;
    } catch(e2) {}
  }

  // 🎯 2. Gravar ALVO (TAKE PROFIT) no servidor
  try {
    const pTp1 = { symbol: sig.sym, side: fecha, positionSide: posSide, type: "TAKE_PROFIT_MARKET", stopPrice: tpStr, closePosition: "true", workingType: "MARK_PRICE" };
    await bin(cfg, "POST", "/fapi/v1/order", pTp1, true);
    prot++;
  } catch(e1) {
    try {
      const pTp2 = { symbol: sig.sym, side: fecha, positionSide: posSide, type: "TAKE_PROFIT", stopPrice: tpStr, price: tpStr, quantity: qtdStr, timeInForce: "GTC", workingType: "MARK_PRICE" };
      if (!isDual) pTp2.reduceOnly = "true";
      await bin(cfg, "POST", "/fapi/v1/order", pTp2, true);
      prot++;
    } catch(e2) {
      try {
        const pTp3 = { symbol: sig.sym, side: fecha, positionSide: posSide, type: "LIMIT", price: tpStr, quantity: qtdStr, timeInForce: "GTC" };
        if (!isDual && !/reduceonly/i.test(e2.message || "")) pTp3.reduceOnly = "true";
        await bin(cfg, "POST", "/fapi/v1/order", pTp3, true);
        prot++;
      } catch(e3) {}
    }
  }

  cd.set(sig.sym, Date.now());
  return { qtd, entrada, prot, alav:sig.alav, stop:stopReal, alvo:alvoReal, slStr, tpStr, ganho:ganhoReal, perda:perdaReal, rr:sig.rr };
}

/* -------------------------------- 🔄 o ciclo -------------------------------- */
async function ciclo(uk, cfg, now, simular){
  cooldowns[uk] = cooldowns[uk] || new Map();
  const cd = cooldowns[uk];
  const manual = (cfg.pares || PARES_PADRAO).map(s => String(s).trim().toUpperCase()).filter(Boolean);
  const total = cfg.universo === "todos";

  // 🧪 modo simulação: só análise (sem chaves, sem ordem) — serve pra testar/ver o que ele faria
  if(!simular && (!cfg._key || !cfg._secret))
    return { aviso:"sem chaves salvas na nuvem — nada executado (toque em ☁️ LIGAR NA NUVEM no site)", universo: total ? "todos os pares" : manual.length };

  /* ---------- 🔎 VARREDURA (mercado inteiro em duas fases) ---------- */
  const varrer = async (dbg) => {
    if(!total){
      const achados = [];
      for(const sym of manual){
        try{ const s = await analisarPar(sym, cfg, now, dbg); if(s) achados.push(s); }catch(_){}
      }
      return { achados, varridos: manual.length, shortlist: achados.length, tfs:"M15+H1" };
    }
    const syms = await universoSymbols(cfg) || manual;
    // baixa M5 + M15 + H1 em paralelo (mesmos pares, 3 pools, 24 workers cada)
    const pools = {};
    const dl = TFS.map(async tf => {
      pools[tf.tf] = await klinesPool(syms, tf.tf, tf.n, 24);
    });
    await Promise.all(dl);
    const shorts = [];
    for(const tfDef of TFS){
      const pool = pools[tfDef.tf];
      if(!pool) continue;
      for(const sym of syms){
        const cand = filtroRapido(pool.get(sym), cfg, now, sym, tfDef);
        if(cand) shorts.push(cand);
      }
    }
    // ordena pelos pontos do filtro rápido (nota+dist+pb+RSI) — melhores primeiro
    function ptsRap(c){ return c.nota + (1 - Math.min(c.dist,0.6)/0.6)*0.3 + (c.pbOk?0.2:0); }
    shorts.sort((a,b) => ptsRap(b) - ptsRap(a));
    // fase 2 (H1+IA) em PARALELO — confirma os top candidatos sem esperar um por um
    const visitados = new Set();
    const LIM_FASE2 = simular ? 24 : 20;
    const promessas = [];
    for(const cand of shorts.slice(0, LIM_FASE2)){
      const chave = cand.sym + ":" + cand.tf.tf;
      if(visitados.has(chave)) continue; visitados.add(chave);
      promessas.push(confirmarPar(cand, cfg, dbg).catch(() => null));
    }
    const resultados = await Promise.all(promessas);
    const confirmados = resultados.filter(Boolean);
    // ordena pela força total (nota + IA + bônus de TF)
    confirmados.sort((a,b) => s_pontos(b) - s_pontos(a));
    return { achados: confirmados, varridos: syms.length, tentados: syms.length, shortlist: shorts.length,
             tfs:"M5+M15+H1",
             topShorts: shorts.slice(0,10).map(c => ({ sym:c.sym, lado:c.lado, nota:c.nota, tf:c.tf.nome, dist:+c.dist.toFixed(2) })) };
  };
  function s_pontos(s){ return s.pontos || s.nota || 0; }

  if(simular){
    const dbg = cfg._detalhar ? [] : null;
    const v = await varrer(dbg);
    const idadeMin = (Date.now() - Math.floor(Date.now()/900000)*900000)/60000;
    return { simulado:true, universo: total ? "TODOS os pares de cripto" : (manual.length + " pares manuais"),
             varridos: v.varridos, shortlist: v.shortlist, topShorts: v.topShorts, tfs:"M5+M15+H1",
             janela:{ frescorMin: cfg.frescorMin || 6, idadeMin:+idadeMin.toFixed(1) },
             janelaAberta: idadeMin <= (cfg.frescorMin || 6),
             candidatos: v.achados.slice(0,8).map(s => ({ sym:s.sym, dir:s.dir, nota:s.nota, ia:s.ia, preco:s.preco, stop:s.stop, alvo:s.alvo, tf:s.tf, alav:s.alav, rr:s.rr, perdaSeParar:s.perdaSeParar, ganhoSeBater:s.ganhoSeBater, motivo:s.motivo })),
             aviso: cfg._key ? "modo simulação (nenhuma ordem enviada)" : "sem chaves salvas — só análise",
             diagnostico: dbg && dbg.length ? dbg : undefined };
  }

  const acc = await bin(cfg, "GET", "/fapi/v2/account", {}, true);
  let u = (acc.assets || []).find(a => a.asset === "USDT");
  if(!u && acc && acc.totalWalletBalance){
    u = { asset:"USDT", walletBalance:acc.totalWalletBalance, unrealizedProfit:acc.totalUnrealizedProfit||"0", availableBalance:acc.availableBalance||acc.totalWalletBalance };
  }
  u = u || { walletBalance:"0", unrealizedProfit:"0", availableBalance:"0" };
  const pos = (acc.positions || []).filter(p => Math.abs(+p.positionAmt) > 0);
  const saldo = +u.walletBalance || 0;
  const margemUsada = pos.reduce((t,p) => t + Math.abs((+p.positionAmt)*(+p.entryPrice)/(+p.leverage||1)), 0);
  const pnlAberto = +u.unrealizedProfit || 0;

  // 🛑 trava de perda diária (desativada por padrão ou configurável pelo usuário)
  let pnlDia = 0;
  try{
    const d = new Date(); d.setUTCHours(0,0,0,0);
    const inc = await bin(cfg, "GET", "/fapi/v1/income", { startTime:d.getTime(), limit:1000 }, true);
    (Array.isArray(inc)?inc:[]).forEach(x => { if(["REALIZED_PNL","COMMISSION","FUNDING_FEE"].includes(x.incomeType)) pnlDia += +x.income||0; });
  }catch(_){}
  if(Number(cfg.trava) > 0 && pnlDia < 0 && Math.abs(pnlDia) >= 5){
    const base = saldo + Math.max(0, -pnlDia);
    if(base > 0 && (-pnlDia)/base*100 >= Number(cfg.trava)){
      cfg.ligado = false;
      try{ await salvarCfg(uk, cfg); }catch(_){}
      ultimaAcao[uk] = "🛑 pausado pela trava de perda diária (" + fmt(pnlDia) + " USDT)";
      await tgSend(`🛑 ROBÔ NA NUVEM pausado pela trava de perda diária: ${fmt(pnlDia)} USDT hoje.\nAs posições abertas continuam com stop/alvo gravados no servidor da Binance.`);
      return { pausado:"trava de perda diária", pnlDia, saldo, posicoes:pos.length };
    }
  }

  // 🛡️ Sentinela na Nuvem 24/7: Vasculha se alguma posição bateu no Alvo ou Stop e garante proteções ativas na Binance
  try {
    const ordens = await bin(cfg, "GET", "/fapi/v1/openOrders", {}, true).catch(()=>[]);
    let isDual = false;
    try {
      const dualRes = await bin(cfg, "GET", "/fapi/v1/positionSide/dual", {}, true);
      isDual = !!(dualRes && dualRes.dualSidePosition);
    } catch(_) {}

    const ordensPorSym = {};
    (Array.isArray(ordens)?ordens:[]).forEach(o => {
      ordensPorSym[o.symbol] = ordensPorSym[o.symbol] || {};
      if(o.type === "STOP_MARKET" || o.type === "STOP") ordensPorSym[o.symbol].stop = +o.stopPrice || +o.price;
      if(o.type === "TAKE_PROFIT_MARKET" || o.type === "TAKE_PROFIT" || o.type === "LIMIT") ordensPorSym[o.symbol].alvo = +o.stopPrice || +o.price;
    });

    for(const p of pos){
      const sym = p.symbol;
      const qtd = Math.abs(+p.positionAmt);
      const long = +p.positionAmt > 0;
      const ent = +p.entryPrice;
      const fecha = long ? "SELL" : "BUY";
      const posSide = isDual ? (long ? "LONG" : "SHORT") : "BOTH";

      let markPrice = ent;
      try {
        const pIdx = await bin(cfg, "GET", "/fapi/v1/premiumIndex", { symbol: sym }, false);
        markPrice = parseFloat(pIdx.markPrice) || ent;
      } catch(_) {
        try {
          const tk = await bin(cfg, "GET", "/fapi/v1/ticker/price", { symbol: sym }, false);
          markPrice = parseFloat(tk.price) || ent;
        } catch(_) {}
      }

      const info = await infoPar(cfg, sym).catch(()=>null);
      const mUp = (info && info.multiplierUp) ? info.multiplierUp : 1.04;
      const mDn = (info && info.multiplierDown) ? info.multiplierDown : 0.96;
      const tick = (info && info.tick) ? info.tick : 0.01;
      const step = (info && info.step) ? info.step : 0.001;
      const qtdStr = roboFormatQty(qtd, step);

      const o = ordensPorSym[sym] || {};
      const alvoPreco = o.alvo || (long ? ent * 1.036 : ent * 0.964);
      const stopPreco = o.stop || (long ? ent * 0.982 : ent * 1.018);

      const pctMov = ent > 0 ? (long ? (markPrice - ent)/ent : (ent - markPrice)/ent) * 100 : 0;

      // ⚡ MOTOR QUÂNTICO DE GIRO INFINITO (SCALPING RELÂMPAGO 24/7):
      // 1. Break-Even Quântico (+0.25% de movimento) -> RISCO ZERO IMEDIATO
      if (pctMov >= 0.25 && (stopPreco < ent && long || stopPreco > ent && !long)) {
        const novoStop = long ? ent * 1.0004 : ent * 0.9996;
        const slStr = roboFormatPrice(novoStop, tick);
        try {
          const pSl = { symbol: sym, side: fecha, positionSide: posSide, type: "STOP_MARKET", stopPrice: slStr, closePosition: "true", workingType: "MARK_PRICE" };
          await bin(cfg, "POST", "/fapi/v1/order", pSl, true);
          await tgSend(`🛡️ [RISCO ZERO] ${sym} andou +${pctMov.toFixed(2)}%! Stop puxado para a entrada (${fmt(novoStop)}) — Posição 100% blindada!`);
        } catch(_) {}
      }

      // 2. Alvo de Lucro Relâmpago (+0.50% de movimento -> +5% a +7.5% ROI): REALIZAÇÃO E GIRO INSTANTÂNEO
      if (pctMov >= 0.50) {
        try {
          const ordP = { symbol: sym, side: fecha, positionSide: posSide, type: "MARKET", quantity: qtdStr };
          if (!isDual) ordP.reduceOnly = "true";
          await bin(cfg, "POST", "/fapi/v1/order", ordP, true);
          try { await bin(cfg, "DELETE", "/fapi/v1/allOpenOrders", { symbol: sym }, true); } catch(_) {}
          const lucroUsdt = (Math.abs(markPrice - ent) * qtd).toFixed(2);
          await tgSend(`⚡ <b>[LUCRO QUÂNTICO REALIZADO!]</b>\n🪙 <b>Ativo:</b> ${sym}\n📈 <b>Lucro:</b> +${pctMov.toFixed(2)}% (+${lucroUsdt} USDT)\n🔄 <i>Mesa liberada! Caçando a próxima oportunidade em 1 segundo… Rumo aos $10.000!</i>`);
          scheduleNext(0);
          continue;
        } catch(_) {}
      }

      // 3. Stop Loss Curto de Proteção (-0.50% de movimento): ESTANCA PERDA IMEDIATAMENTE
      const stopReferencia = (stopPreco > 0) ? stopPreco : (long ? ent * 0.995 : ent * 1.005);
      const bateuStop = long ? (markPrice <= stopReferencia) : (markPrice >= stopReferencia);
      const perdaCurta = pctMov <= -0.50;

      if ((bateuStop || perdaCurta) && ent > 0) {
        try {
          const ordP = { symbol: sym, side: fecha, positionSide: posSide, type: "MARKET", quantity: qtdStr };
          if (!isDual) ordP.reduceOnly = "true";
          await bin(cfg, "POST", "/fapi/v1/order", ordP, true);
          try { await bin(cfg, "DELETE", "/fapi/v1/allOpenOrders", { symbol: sym }, true); } catch(_) {}
          await tgSend(`🛑 <b>[STOP LOSS CURTO]</b> ${sym} fechado em -${Math.abs(pctMov).toFixed(2)}%.\nCapital protegido para o próximo giro.`);
          scheduleNext(0);
          continue;
        } catch(eStop) {
          try { await bin(cfg, "POST", "/fapi/v1/order", { symbol: sym, side: fecha, positionSide: posSide, type: "MARKET", quantity: qtdStr }, true); } catch(_) {}
        }
      }

      // 🛡️ 3. Se a posição ainda não tem Stop ou Alvo gravados na Binance, grava agora com a referência exata da IA
      if(!o.stop || !o.alvo){
        if(info){
          try {
            await bin(cfg, "DELETE", "/fapi/v1/allOpenOrders", { symbol: sym }, true);
          } catch(_) {}

          let slReal = long ? ent * 0.982 : ent * 1.018;
          let tpReal = long ? ent * 1.036 : ent * 0.964;

          if (long) {
            const maxStop = markPrice * 0.995;
            const minStop = markPrice * (mDn + 0.005);
            slReal = Math.min(slReal, maxStop);
            slReal = Math.max(slReal, minStop);

            const minAlvo = markPrice * 1.008;
            const maxAlvo = markPrice * (mUp - 0.005);
            tpReal = Math.max(tpReal, minAlvo);
            tpReal = Math.min(tpReal, maxAlvo);
          } else {
            const minStop = markPrice * 1.005;
            const maxStop = markPrice * (mUp - 0.005);
            slReal = Math.max(slReal, minStop);
            slReal = Math.min(slReal, maxStop);

            const maxAlvo = markPrice * 0.992;
            const minAlvo = markPrice * (mDn + 0.005);
            tpReal = Math.min(tpReal, maxAlvo);
            tpReal = Math.max(tpReal, minAlvo);
          }

          const slStr = roboFormatPrice(slReal, tick);
          const tpStr = roboFormatPrice(tpReal, tick);

          // Grava Stop Loss no Servidor da Binance
          try{
            const ordP = { symbol:sym, side:fecha, positionSide:posSide, type:"STOP_MARKET", stopPrice:slStr, closePosition:"true", workingType:"MARK_PRICE" };
            await bin(cfg, "POST", "/fapi/v1/order", ordP, true);
          }catch(e1){
            try{
              const ordP2 = { symbol:sym, side:fecha, positionSide:posSide, type:"STOP_MARKET", stopPrice:slStr, quantity:qtdStr, workingType:"MARK_PRICE" };
              if (!isDual) ordP2.reduceOnly = "true";
              await bin(cfg, "POST", "/fapi/v1/order", ordP2, true);
            }catch(_){}
          }

          // Grava Take Profit no Servidor da Binance
          try{
            const ordP = { symbol:sym, side:fecha, positionSide:posSide, type:"TAKE_PROFIT_MARKET", stopPrice:tpStr, closePosition:"true", workingType:"MARK_PRICE" };
            await bin(cfg, "POST", "/fapi/v1/order", ordP, true);
          }catch(e1){
            try{
              const ordP2 = { symbol:sym, side:fecha, positionSide:posSide, type:"TAKE_PROFIT", stopPrice:tpStr, price:tpStr, quantity:qtdStr, timeInForce:"GTC", workingType:"MARK_PRICE" };
              if (!isDual) ordP2.reduceOnly = "true";
              await bin(cfg, "POST", "/fapi/v1/order", ordP2, true);
            }catch(e2){
              try{
                const ordP3 = { symbol:sym, side:fecha, positionSide:posSide, type:"LIMIT", price:tpStr, quantity:qtdStr, timeInForce:"GTC" };
                if (!isDual && !/reduceonly/i.test(e2.message || "")) ordP3.reduceOnly = "true";
                await bin(cfg, "POST", "/fapi/v1/order", ordP3, true);
              }catch(_){}
            }
          }
        }
      }
    }
  }catch(_){}

  if(pos.length >= cfg.maxPos) return { aguardando:"máximo de posições", posicoes:pos.length, maxPos:cfg.maxPos, saldo, pnlAberto };
  if(margemUsada + cfg.valor > cfg.total) return { aguardando:"limite de capital em uso", margemUsada, total:cfg.total, saldo, pnlAberto };

  // 🔒 descarta o que já tem posição aberta ou operou nos últimos 30 min (checagem SEM ESTADO na Binance)
  const bloqueados = new Set(pos.map(p => p.symbol));
  for(const sym of (total ? await universoSymbols(cfg) || manual : manual)){
    if(bloqueados.has(sym)) continue;
    if(cd.has(sym) && Date.now()-cd.get(sym) < 20*60000){ bloqueados.add(sym); continue; }
    try{
      const tr = await bin(cfg, "GET", "/fapi/v1/userTrades", { symbol:sym, limit:5 }, true);
      const ult = Array.isArray(tr) && tr.length ? Math.max(...tr.map(t => +t.time || 0)) : 0;
      if(ult && Date.now()-ult < 20*60000){ cd.set(sym, ult); bloqueados.add(sym); }
    }catch(_){}
    if(bloqueados.size > 60) break;
  }

  const v = await varrer(null);
  const elegiveis = v.achados.filter(s => !bloqueados.has(s.sym));
  const entradas = [];
  if(elegiveis.length){
    let margemFut = margemUsada, posCount = pos.length;
    // abre TODAS as oportunidades que couberem (até maxPos e dentro do total),
    // da MELHOR pra pior — não perde joias quando várias aparecem no mesmo fechamento de candle
    for(const sig of elegiveis){
      if(posCount >= cfg.maxPos) break;
      if(margemFut + cfg.valor > cfg.total) break;
      try{
        const r = await abrirPosicao(sig, cfg);
        const margemGasta = (r.qtd * r.entrada) / r.alav;
        entradasTotal[uk]=(entradasTotal[uk]||0)+1; posCount++; margemFut += margemGasta;
        const tfLabel = sig.tf ? `[${sig.tf}] ` : "";
        ultimaAcao[uk] = `${sig.long ? "🟢 LONG" : "🔴 SHORT"} ${tfLabel}${sig.sym} @ ${fmt(r.entrada)} · ${r.alav}x · nota ${sig.nota}${sig.ia !== null ? " · IA " + sig.ia + "%" : ""}`;
        await tgSend(
`☁️🤖 ROBÔ NUVEM ${cfg.modo === "real" ? "(PRODUÇÃO)" : "(TESTNET)"} — ${sig.long ? "🟢 LONG" : "🔴 SHORT"} ${sig.sym} ${tfLabel}
🎯 entrada ${fmt(r.entrada)} · alvo ${fmt(r.alvo)} · stop ${fmt(r.stop)}
💰 ${r.alav}x automático · margem ${fmt(margemGasta)} USDT (máx ${fmt(cfg.valor)}) · ganho +${fmt(r.ganho)} · perda -${fmt(r.perda)}
💪 nota ${sig.nota}${sig.ia !== null ? ` · 🤖 IA ${sig.ia}%` : ""} · R:R ${r.rr.toFixed(2)} · varri ${v.varridos} pares em M5+M15+H1
⚠️ proteções ${r.prot}/2
📊 ${sig.motivo}`);
        entradas.push({ sym:sig.sym, dir:sig.dir, entrada:r.entrada, stop:r.stop, alvo:r.alvo,
                        qtd:r.qtd, protecoes:r.prot, alav:r.alav, ganho:r.ganho, perda:r.perda, rr:r.rr, tf:sig.tf });
      }catch(e){ if(uk) ultimoErro[uk] = String(e.message||e); }
    }
    if(entradas.length){
      return { entrou: entradas.length === 1 ? entradas[0] : entradas, entrouN: entradas.length,
               varridos: v.varridos, shortlist: v.shortlist, saldo, pnlAberto, tfs:v.tfs };
    }
  }
  // mensagem de ciclo
  const idadeMin2 = (Date.now() - Math.floor(Date.now()/900000)*900000)/60000;
  const frescor = cfg.frescorMin || 6;
  ultimaAcao[uk] = idadeMin2 > frescor
    ? `fora da janela (candle fechou há ${idadeMin2.toFixed(0)}min · janela até ${frescor}min) — aguardando próximo fechamento`
    : `varri ${v.varridos} pares em M5+M15+H1 — nenhuma entrada nível especialista agora`;
  return { entrou:null, varridos:v.varridos, shortlist:v.shortlist, topShorts:v.topShorts, tfs:"M5+M15+H1",
           janela:{ frescorMin:frescor, idadeMin:+idadeMin2.toFixed(1), aberta: idadeMin2 <= frescor },
           saldo, pnlAberto, posicoes:pos.length, margemUsada, limite:cfg.total };
}

/* -------------------------------- 🌐 endpoint -------------------------------- */
export default async function handler(req, res){
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "oraculo-trader-deploy.vercel.app";
  _SELF_ORIGIN = `${proto}://${host}`;
  const url = new URL(req.url, _SELF_ORIGIN);
  const q = p => url.searchParams.get(p);
  let body = req.body;
  if(typeof body === "string"){ try{ body = JSON.parse(body); }catch(_){ body = {}; } }
  body = body || {};
  const key = q("key") || body.key;
  const chaveAdmin = (key === ADMIN_KEY);
  const chaveValida = key && (chaveAdmin || !!(await lerBau()).usuarios[key]);

  try{
    // 🆕 NOVO USUÁRIO (sem chave): cria uma chave pessoal pra ele e devolve (frontend salva no localStorage)
    if(q("novo") !== null){
      const k = await novaChaveUsuario();
      res.status(200).json({ ok:true, chave:k, mensagem:"guarde essa chave — é a sua senha da nuvem" });
      return;
    }
    if(!chaveValida){ res.status(401).json({ ok:false, error:"chave inválida" }); return; }
    const uk = key;

    // Para diagnóstico de usuários ativos (só admin lista)
    if(chaveAdmin && q("usuarios") !== null){
      const ativos = await listarUsuariosAtivos();
      res.status(200).json({ ok:true, usuarios:ativos });
      return;
    }

    // 💾 salvar config/chaves (criptografadas) do usuário
    if(body.salvar){
      const atual = await lerCfg(uk, true);
      const novo = Object.assign({}, atual, body.cfg || {});
      if(body.binance && body.binance.apiKey && body.binance.secret){
        novo._keyEnc = cifrar(String(body.binance.apiKey).trim(), uk);
        novo._secretEnc = cifrar(String(body.binance.secret).trim(), uk);
        novo._encVer = "v3"; // marca que foi cifrado com a senha do usuário
      }
      if(body.binance === null){ delete novo._keyEnc; delete novo._secretEnc; novo.ligado = false; }
      await salvarCfg(uk, novo);
      if(novo.ligado) scheduleUser(uk, 2);
      res.status(200).json({ ok:true, salvo:true, chave:uk, ligado:!!novo.ligado, modo:novo.modo, chaves: !!novo._keyEnc });
      return;
    }
    // ⏯ ligar / pausar do usuário
    if(q("ligar") !== null || q("pausar") !== null){
      const cfg = await lerCfg(uk, true);
      cfg.ligado = q("ligar") !== null;
      try{ await salvarCfg(uk, cfg); }catch(e){ res.status(200).json({ok:false,erro:String(e.message||e)}); return; }
      (ultimaAcao[uk] = cfg.ligado ? "▶️ ligado" : "⏸ pausado pelo usuário");
      if(cfg.ligado) scheduleUser(uk, 2);
      res.status(200).json({ ok:true, ligado:cfg.ligado, gravou:true, chave:uk });
      return;
    }

    const cfg = await lerCfg(uk, false);
    let decErro = null;
    if(cfg._keyEnc){
      try{
        const senha = (cfg._encVer === "v3" || uk !== ADMIN_KEY) ? uk : (ADMIN_KEY+"oraculo-robo-v3");
        try{
          cfg._key = decifrar(cfg._keyEnc, senha); cfg._secret = decifrar(cfg._secretEnc, senha);
        }catch(e2){
          // fallback legado: chave antiga do admin
          if(uk===ADMIN_KEY){
            const bk=Buffer.from(cfg._keyEnc,"base64"),salt=bk.slice(0,16),iv=bk.slice(16,28),tag=bk.slice(28,44),enc=bk.slice(44);
            const k=crypto.scryptSync(ADMIN_KEY+"robo",salt,32);const d=crypto.createDecipheriv("aes-256-gcm",k,iv);d.setAuthTag(tag);
            cfg._key=Buffer.concat([d.update(enc),d.final()]).toString("utf8");
            const bs=Buffer.from(cfg._secretEnc,"base64"),salt2=bs.slice(0,16),iv2=bs.slice(16,28),tag2=bs.slice(28,44),enc2=bs.slice(44);
            const k2=crypto.scryptSync(ADMIN_KEY+"robo",salt2,32);const d2=crypto.createDecipheriv("aes-256-gcm",k2,iv2);d2.setAuthTag(tag2);
            cfg._secret=Buffer.concat([d2.update(enc2),d2.final()]).toString("utf8");
          } else throw e2;
        }
      }catch(e){ decErro = "decifra: "+String(e.message||e); cfg._key=null; cfg._secret=null; }
    }

    if(q("diag") !== null || q("posicoes") !== null){
      batidas++;
      let saldo = null, posicoes = null, erro = null, u = null, baseEscolhida = null;
      const cfgBau = await lerCfg(uk, true);
      if(cfg._key && cfg._secret){
        try{
          baseEscolhida = (cfg.modo==="real") ? await escolherBase() : BASE_TEST;
          const acc = await bin(cfg, "GET", "/fapi/v2/account", {}, true);
          u = (acc.assets||[]).find(a=>a.asset==="USDT");
          if(!u && acc && acc.totalWalletBalance){
            u = { asset:"USDT", walletBalance: acc.totalWalletBalance, unrealizedProfit: acc.totalUnrealizedProfit||"0", availableBalance: acc.availableBalance||acc.totalWalletBalance, _fromAcc:true };
          }
          let mark = {};
          try{ const pm = await bin(cfg, "GET", "/fapi/v1/premiumIndex", {}, true);
            (Array.isArray(pm)?pm:[]).forEach(p=>{ mark[p.symbol] = +p.markPrice; }); }catch(_){}
          saldo = +(u && u.walletBalance) || 0;
          posicoes = (acc.positions||[]).filter(p=>Math.abs(+p.positionAmt)>0)
            .map(p=>{
              const long = +p.positionAmt > 0;
              const ent = +p.entryPrice;
              const markP = mark[p.symbol] || ent;
              const qtd = Math.abs(+p.positionAmt);
              const delta = long ? (markP - ent) : (ent - markP);
              const realPnl = isFinite(markP) && markP > 0 && qtd > 0 ? delta * qtd : (+p.unrealizedProfit || 0);
              return {
                symbol: p.symbol,
                side: long ? "LONG" : "SHORT",
                qtd: qtd,
                entrada: ent,
                mark: markP,
                pnl: realPnl,
                liq: +(p.isolatedLiquidationPrice||0),
                leverage: +p.leverage||1
              };
            });
        }catch(e){ erro = String(e.message||e); }
      }

      if(q("posicoes") !== null && q("diag") === null){
        res.status(200).json({ ok:true, chave:uk, chavesSalvas:!!cfg._keyEnc, saldo,
                               pnlAberto: posicoes?posicoes.reduce((t,p)=>t+(+p.pnl||0),0):0, posicoes });
        return;
      }
      res.status(200).json({ ok:true, chave:uk, ligado:!!cfg.ligado, modo:cfg.modo, valor:cfg.valor, total:cfg.total,
        maxPos:cfg.maxPos, riscoPor:cfg.riscoPor||50, alavMax:cfg.alavMax||8,
        nota:cfg.nota, trava:cfg.trava, pares:(cfg.pares||[]).length,
        universo: cfg.universo==="todos" ? "todos os pares de cripto" : "lista manual",
        universoMax: cfg.universoMax||200, frescorMin: cfg.frescorMin||6,
        chavesSalvas: !!cfg._keyEnc, ultimaAcao: ultimaAcao[uk]||"—", ultimoErro: ultimoErro[uk]||null,
        entradasTotal: entradasTotal[uk]||0, batidas,
        bateHa: cfgBau._beat ? Date.now()-cfgBau._beat : null,
        agora:Date.now(), saldo, posicoes, erro });
      return;
    }

    const simular = q("simular") !== null;
    const isLoop = (q("loop") !== null || q("start") !== null) && !simular;
    const LOOP_R = 120000;

    if(!cfg.ligado && !simular){
      lastRoboRun[uk] = Date.now(); batidas++;
      res.status(200).json({ ok:true, ligado:false, mensagem:"robô pausado — nada executado", ultimaAcao: ultimaAcao[uk]||"—", batidas });
      return;
    }

    if(isLoop){
      const lr = lastRoboRun[uk]||0;
      const elapsed = lr ? Date.now()-lr : Infinity;
      const forcar = q("agora") !== null;
      if(!forcar && elapsed < LOOP_R-15000){
        if(q("quick")!==null){ res.status(200).json({ok:true,loop:"em dia",ligado:!!cfg.ligado}); return; }
        const waitMs = Math.min(LOOP_R-elapsed-10000, 35000)+Math.floor(Math.random()*5000);
        await holdAlive(Math.max(4000,waitMs));
        scheduleUser(uk,1);
        await holdAlive(2000);
        res.status(200).json({ok:true,loop:"esperando",ligado:!!cfg.ligado,proximaEm:Math.max(0,Math.round((LOOP_R-elapsed)/1000))+"s"});
        return;
      }
    }

    if(q("detalhar")!==null) cfg._detalhar = true;
    const now = Date.now();
    const out = await ciclo(uk, cfg, now, simular);
    batidas++;
    if(!simular && (!cfg._beat || Date.now()-cfg._beat>60000)){
      try{ const c2 = await lerCfg(uk,true); c2._beat = Date.now(); await salvarCfg(uk,c2); }catch(_){}
    }
    lastRoboRun[uk] = Date.now(); ultimoErro[uk] = ""; entradasTotal[uk] = (entradasTotal[uk]||0)+(out.entrou?1:0);
    try{
      fetch(`${_SELF_ORIGIN}/api/radar?key=${ADMIN_KEY}&loop=1`).catch(()=>{});
      fetch(`${_SELF_ORIGIN}/api/bin?key=${ADMIN_KEY}&loop=1`).catch(()=>{});
      fetch(`${_SELF_ORIGIN}/api/copy?key=${ADMIN_KEY}&loop=1`).catch(()=>{});
    }catch(_){}
    // 🤝 acorda os outros usuários ativos também (seus próprios ciclos rodam isolados)
    if(chaveAdmin){ try{ (await listarUsuariosAtivos()).filter(k=>k!==uk).forEach(k=>scheduleUser(k,1)); }catch(_){} }
    if(isLoop && !simular){ scheduleUser(uk,2); await holdAlive(6000); }
    res.status(200).json(Object.assign({ok:true,hora:new Date(now).toISOString(),chave:uk,modo:cfg.modo,ligado:!!cfg.ligado,ultimaAcao:ultimaAcao[uk]||""},out));
  }catch(e){
    ultimoErro[key||"_"] = String(e&&e.message||e);
    res.status(200).json({ ok:false, erro: ultimoErro[key||"_"], ultimaAcao: ultimaAcao[key||"_"] });
  }
}
