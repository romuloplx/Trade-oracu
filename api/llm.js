// ☁️ POOL DE LLM — GOOGLE GEMINI COMO PRIORIDADE + RODÍZIO + FALLBACK
// Modelos atualizados com suporte instantâneo de alta performance.

const GEMINI_KEY = process.env.GEMINI_KEY || process.env.GOOGLE_API_KEY || "";

// Adaptador: converte messages [{role,content}] para o formato generateContent do Gemini
async function chamaGemini(modelo, messages, { temperature=0.2, max_tokens=800, jsonOnly=false }){
  const mapModel = {
    "gemini-flash-lite": "gemini-flash-lite-latest",
    "gemini-flash": "gemini-flash-latest",
    "gemini-3.5-flash-lite": "gemini-flash-lite-latest",
    "gemini-3.8-flash-lite": "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite": "gemini-flash-lite-latest"
  };
  const m = mapModel[modelo] || modelo;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${GEMINI_KEY}`;
  const systemInstr = messages.find(x => x.role === "system")?.content || "Você é um trader profissional sênior. Responda em JSON estrito.";
  const parts = [];
  for(const msg of messages){
    if(msg.role === "system") continue;
    let conteudo = msg.content;
    if(Array.isArray(conteudo)){
      for(const c of conteudo){
        if(typeof c === "string") parts.push({ text: c });
        else if(c.type === "text") parts.push({ text: c.text });
        else if(c.type === "image_url" && c.image_url?.url){
          const b64 = String(c.image_url.url).replace(/^data:[^;]+;base64,/, "");
          parts.push({ inline_data: { mime_type: "image/png", data: b64 } });
        }
      }
    }else{
      parts.push({ text: String(conteudo) });
    }
  }
  const body = {
    contents: [{ role: "user", parts }],
    systemInstruction: { role: "system", parts: [{ text: systemInstr }] },
    generationConfig: {
      temperature,
      maxOutputTokens: max_tokens,
      responseMimeType: jsonOnly ? "application/json" : "text/plain"
    },
    safetySettings: [
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" }
    ]
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  const inicio = Date.now();
  try{
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify(body)
    });
    clearTimeout(t);
    const data = await r.json().catch(()=>({}));
    if(!r.ok){
      const msg = data?.error?.message || `HTTP ${r.status}`;
      const transiente = r.status === 429 || (r.status>=500 && r.status<600) || r.status === 503;
      const err = new Error("Gemini: " + msg);
      err.status = r.status; err.transiente = transiente; err.lat = Date.now()-inicio;
      throw err;
    }
    const cand = data?.candidates?.[0];
    let texto = "";
    if(cand?.content?.parts){
      for(const p of cand.content.parts){
        if(p.text) texto += p.text;
      }
    }
    if(!texto){
      const err = new Error("Gemini: resposta vazia");
      err.status = 0; err.transiente = true; err.lat = Date.now()-inicio;
      throw err;
    }
    return { texto, modeloUsado: m, lat: Date.now()-inicio };
  }catch(e){
    clearTimeout(t);
    if(!e.lat) e.lat = Date.now()-inicio;
    throw e;
  }
}

// ============== POOL DE PROVEDORES ==============
const PROVEDORES = [
  {
    id: "google-gemini-lite",
    nome: "🌐 Google Gemini Lite",
    chave: "google",
    tipo: "gemini",
    modelos: ["gemini-flash-lite-latest", "gemini-flash-latest"],
    timeoutMs: 10000
  },
  {
    id: "uno-gemini",
    nome: "🌐 UnoRouter Gemini",
    url: "https://api.unorouter.com/v1/chat/completions",
    key: "sk-YW73oQ027I2XI333Dolq1x9ige9royh9uWJfECyNFXYXPIpj",
    tipo: "openai",
    modelos: ["gemini-3.5-flash-lite:free"],
    timeoutMs: 12000
  },
  {
    id: "uno-deepseek",
    nome: "🌐 UnoRouter DeepSeek",
    url: "https://api.unorouter.com/v1/chat/completions",
    key: "sk-YW73oQ027I2XI333Dolq1x9ige9royh9uWJfECyNFXYXPIpj",
    tipo: "openai",
    modelos: ["deepseek-v4-flash:free"],
    timeoutMs: 12000
  },
  {
    id: "poll-openai-fast",
    nome: "🆓 Pollinations OpenAI",
    url: "https://text.pollinations.ai/openai/chat/completions",
    key: null,
    tipo: "openai",
    modelos: ["openai-fast"],
    timeoutMs: 14000
  }
];

async function chamaOpenAi(p, body){
  const headers = { "Content-Type": "application/json" };
  if(p.key) headers["Authorization"] = "Bearer " + p.key;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), p.timeoutMs || 10000);
  const inicio = Date.now();
  try{
    const r = await fetch(p.url, {
      method: "POST", headers, signal: ctrl.signal,
      body: JSON.stringify(body)
    });
    clearTimeout(t);
    let data = {};
    try{ data = await r.json(); }catch(_){}
    if(!r.ok){
      const transiente = r.status === 429 || (r.status >= 500 && r.status < 600);
      const err = new Error((data?.error?.message || data?.error || `HTTP ${r.status}`));
      err.status = r.status; err.transiente = transiente; err.lat = Date.now()-inicio;
      throw err;
    }
    const txt = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || "";
    if(!txt || typeof txt !== "string"){
      const err = new Error("resposta vazia de " + p.nome);
      err.status = 0; err.transiente = true; err.lat = Date.now()-inicio;
      throw err;
    }
    return { texto: txt, modeloUsado: body.model, lat: Date.now()-inicio };
  }catch(e){
    clearTimeout(t);
    if(!e.lat) e.lat = Date.now()-inicio;
    throw e;
  }
}

const state = {
  blacklist: new Map(),
  ultimoOk: null,
  erros: {},
  health: {},
  _ultimoUso: {},
  PACE: {
    "google-gemini-lite": 400,
    "uno-gemini": 600,
    "uno-deepseek": 600,
    "poll-openai-fast": 200
  }
};
const HEALTH_EVERY = 10 * 60 * 1000;

function marcaFalha(p, err){
  const isRate = err.status === 429 || /rate.?limit|quota|overload/i.test(String(err.message||""));
  const isServerErr = (err.status||0) >= 500 || /internal|unavailable/i.test(String(err.message||""));
  const dur = isRate ? 60*1000 : isServerErr ? 30*1000 : 10*1000;
  state.blacklist.set(p.id, Date.now() + dur);
  state.erros[p.id] = state.erros[p.id] || { qtd:0 };
  state.erros[p.id].qtd++;
  state.erros[p.id].ultimoErro = String(err.message || err).slice(0,120);
  state.erros[p.id].quando = Date.now();
  state.erros[p.id].tipo = isRate?"rate":isServerErr?"server":"transiente";
}
function marcaOk(p, lat, modeloUsado){
  state.blacklist.delete(p.id);
  state.health[p.id] = { lat, quando: Date.now(), modelo: modeloUsado };
  state.ultimoOk = p.id;
  state._ultimoUso[p.id] = Date.now();
}

async function chamaProvedor(p, opts){
  if(p.tipo === "gemini"){
    let ultimo = null;
    for(const m of p.modelos){
      try{
        const r = await chamaGemini(m, opts.messages, opts);
        return { texto: r.texto, usado: p, modelo: r.modeloUsado, lat: r.lat };
      }catch(e){
        ultimo = e;
        if(/not found|no longer available|model/i.test(String(e.message||""))) continue;
        throw e;
      }
    }
    if(ultimo) throw ultimo;
  }

  let ultimo = null;
  for(const m of p.modelos){
    const body = { model:m, messages:opts.messages, temperature:opts.temperature??0.2,
                   max_tokens:opts.max_tokens??800, stream:false };
    if(opts.jsonOnly && p.id.startsWith("uno")) body.response_format = { type:"json_object" };
    try{
      const r = await chamaOpenAi(p, body);
      return { texto:r.texto, usado:p, modelo:r.modeloUsado, lat:r.lat };
    }catch(e){
      ultimo = e;
      if(e.status === 429 || (e.status>=500 && e.status<600)) break;
    }
  }
  if(ultimo) throw ultimo;
  throw new Error("sem resposta de " + p.nome);
}

async function chat(opts){
  const agora = Date.now();
  const fixed = ["google-gemini-lite"];
  const others = PROVEDORES.filter(p => !fixed.includes(p.id))
    .sort((a,b) => (state._ultimoUso[a.id]||0) - (state._ultimoUso[b.id]||0));
  const providers = [...fixed.map(id => PROVEDORES.find(p=>p.id===id)).filter(Boolean), ...others];

  let ultimoErro = null;
  for(const p of providers){
    const ate = state.blacklist.get(p.id);
    if(ate && ate > agora) continue;
    const desde = agora - (state._ultimoUso[p.id]||0);
    const pace = state.PACE[p.id] || 300;
    if(desde < pace) await new Promise(r => setTimeout(r, pace - desde + 20));
    try{
      const r = await chamaProvedor(p, opts);
      marcaOk(p, r.lat, r.modelo);
      return r;
    }catch(e){
      ultimoErro = e;
      marcaFalha(p, e);
    }
  }

  // Fallback rápido
  for(const p of providers){
    try{
      const r = await chamaProvedor(p, opts);
      marcaOk(p, r.lat, r.modelo);
      return r;
    }catch(e){ marcaFalha(p,e); }
  }
  const err = new Error("Todos os provedores de IA falharam: " + String(ultimoErro?.message||ultimoErro||"indisponível"));
  err.todosFalharam = true;
  throw err;
}

async function healthCheck(){
  for(const p of PROVEDORES){
    const h = state.health[p.id];
    if(h && Date.now() - h.quando < HEALTH_EVERY) continue;
    if(state.blacklist.has(p.id) && state.blacklist.get(p.id) > Date.now()) continue;
    try{
      await chamaProvedor(p, { messages:[{role:"user",content:"ping"}], max_tokens:3, temperature:0 });
      marcaOk(p, 0, "healthcheck");
    }catch(e){ marcaFalha(p,e); }
  }
}
setInterval(() => { healthCheck().catch(()=>{}); }, 60*1000);

export default async function handler(req, res){
  if(req.method === "GET"){
    return res.status(200).json({
      ok:true, pool: PROVEDORES.length, principal:"Google Gemini",
      provedores: PROVEDORES.map(p => ({
        id: p.id, nome: p.nome, modelos: p.modelos,
        status: state.blacklist.has(p.id) && state.blacklist.get(p.id) > Date.now()
          ? `cooldown até ${new Date(state.blacklist.get(p.id)).toISOString()}`
          : (state.health[p.id] ? `online (${state.health[p.id].lat}ms · ${state.health[p.id].modelo})` : "pronto"),
        erros: (state.erros[p.id]?.qtd)||0,
        ultimoErro: state.erros[p.id]?.ultimoErro || null
      })),
      ultimoOk: state.ultimoOk
    });
  }
  if(req.method !== "POST") return res.status(405).json({ error:"Apenas POST" });
  const b = req.body || {};
  if(b.url && b.body){
    let targetUrl = String(b.url || "").trim();
    let targetKey = b.key ? String(b.key).trim() : "";

    // 🛡️ Auto-correção: se o usuário ou frontend passou uma API key no campo url
    if (!/^https?:\/\//i.test(targetUrl)) {
      if (targetUrl.startsWith("sk-or-")) {
        targetKey = targetUrl; targetUrl = "https://openrouter.ai/api/v1/chat/completions";
      } else if (targetUrl.startsWith("sk-ant-")) {
        targetKey = targetUrl; targetUrl = "https://api.anthropic.com/v1/messages";
      } else if (targetUrl.startsWith("sk-")) {
        targetKey = targetUrl; targetUrl = "https://api.openai.com/v1/chat/completions";
      } else if (targetUrl.startsWith("gsk_")) {
        targetKey = targetUrl; targetUrl = "https://api.groq.com/openai/v1/chat/completions";
      } else if (targetUrl.startsWith("xai-")) {
        targetKey = targetUrl; targetUrl = "https://api.x.ai/v1/chat/completions";
      } else if (targetUrl.startsWith("nvapi-") || targetUrl.startsWith("rt-")) {
        targetKey = targetUrl; targetUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
      } else {
        targetUrl = ""; // URL inválida, usará o pool interno de IA
      }
    }

    if (targetUrl) {
      const headers = { "Content-Type":"application/json" };
      if (targetKey) headers["Authorization"] = "Bearer " + targetKey;
      try{
        const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 20000);
        const r = await fetch(targetUrl, { method:"POST", headers, signal:ctrl.signal, body:JSON.stringify(b.body) });
        clearTimeout(t);
        const data = await r.json().catch(()=>({}));
        if (!r.ok && data?.error && Array.isArray(b.body?.messages)) {
          // Se a chave externa falhar (ex: sem saldo ou 401), fallback automático para o pool de IA
          try {
            const rPool = await chat({ messages: b.body.messages, temperature: b.body.temperature ?? 0.2, max_tokens: b.body.max_tokens ?? 800 });
            return res.status(200).json({ choices: [{ message: { role:"assistant", content: rPool.texto } }], model: rPool.usado.id+":"+rPool.modelo, provedor: rPool.usado.nome, fallback: true });
          } catch(_) {}
        }
        return res.status(r.status).json(data);
      }catch(e){
        // Se a chamada fetch der erro de rede/URL, fallback transparente para o pool da nuvem
        if (Array.isArray(b.body?.messages)) {
          try {
            const rPool = await chat({ messages: b.body.messages, temperature: b.body.temperature ?? 0.2, max_tokens: b.body.max_tokens ?? 800 });
            return res.status(200).json({ choices: [{ message: { role:"assistant", content: rPool.texto } }], model: rPool.usado.id+":"+rPool.modelo, provedor: rPool.usado.nome, fallback: true });
          } catch(_) {}
        }
        return res.status(502).json({ error:"Falha proxy: "+String(e.message||e) });
      }
    }
  }
  try{
    const messages = b.messages;
    if(!Array.isArray(messages) || messages.length===0){
      return res.status(400).json({ error:"messages obrigatório" });
    }
    const r = await chat({
      messages,
      temperature: b.temperature ?? 0.2,
      max_tokens: b.max_tokens ?? 800,
      jsonOnly: !!b.jsonOnly
    });
    return res.status(200).json({
      choices: [{ message: { role:"assistant", content: r.texto } }],
      model: r.usado.id+":"+r.modelo,
      provedor: r.usado.nome,
      modelo: r.modelo,
      latencia_ms: r.lat,
      object: "chat.completion"
    });
  }catch(e){
    return res.status(503).json({
      error: String(e.message||e),
      provedores: PROVEDORES.map(p => ({ id:p.id, blacklist: state.blacklist.get(p.id)||0 }))
    });
  }
}

export { chat as llmChat, PROVEDORES, state as llmState, GEMINI_KEY, chamaGemini };
