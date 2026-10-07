// diagnóstico: testa a segunda opinião UnoRouter DE DENTRO da Vercel
export default async function handler(req, res){
  const UNO_KEY = "sk-YW73oQ027I2XI333Dolq1x9ige9royh9uWJfECyNFXYXPIpj";
  const modelos = ["gemini-3.5-flash-lite:free", "deepseek-v4-flash:free"];
  const out = [];
  for(const m of modelos){
    const t0 = Date.now();
    try{
      const ctrl = new AbortController(); const t = setTimeout(()=>ctrl.abort(), 9000);
      const r = await fetch("https://api.unorouter.com/v1/chat/completions", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + UNO_KEY },
        body: JSON.stringify({ model: m, temperature: 0, max_tokens: 60,
          messages: [{ role: "user", content: "Responda APENAS: {\"direcao\":\"SUBIR\",\"confianca\":70}" }] })
      });
      clearTimeout(t);
      const j = await r.json().catch(()=>null);
      out.push({ modelo: m, status: r.status, ms: Date.now()-t0, conteudo: j && j.choices ? j.choices[0].message.content : j, ok: r.ok });
    }catch(e){
      out.push({ modelo: m, erro: String(e && e.message || e), ms: Date.now()-t0 });
    }
  }
  res.status(200).json({ ok: true, out });
}
