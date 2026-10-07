// ☁️ REANIMADOR: acorda os 3 radares da nuvem e o pool de IA de uma vez
// Chamado pelos crons âncora da Vercel (vercel.json) e pelo app.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const KEY = "98201441";

export default async function handler(req, res){
  const url = new URL(req.url, "http://x");
  if(url.searchParams.get("key") !== KEY){ res.status(401).json({ ok:false, error:"chave inválida" }); return; }
  const base = "https://oraculo-trader-deploy.vercel.app"; // URL fixa do custom domain (nunca muda)
  const urls = ["/api/radar", "/api/bin", "/api/copy", "/api/robo"].map(p => `${base}${p}?key=${KEY}&start=1`);
  // Fire-and-forget: dispara tudo em paralelo sem esperar (evita timeout do cron/revive)
  urls.forEach(u => { fetch(u).catch(()=>{}); });
  // Sonda leve de saúde da IA (só GET é rápido)
  fetch(`${base}/api/llm`).catch(()=>{});
  // Responde imediatamente pro cron não ficar esperando
  const r = urls.map(() => "disparado");
  const llm = ["disparado"];
  res.status(200).json({
    ok:true, hora: new Date().toISOString(),
    revive: r,
    iaPool: llm
  });
}
