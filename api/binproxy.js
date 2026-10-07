export const config = { runtime: "edge", regions:["gru1"] };
export default async function(req){
  const u = new URL(req.url);
  const target = u.searchParams.get("u");
  const key = req.headers.get("x-mbx-apikey");
  if(!target || !/^https:\/\/(fapi|www)\.binance\.com\//.test(target))
    return new Response("bad url",{status:400});
  const headers = { "User-Agent":"Mozilla/5.0" };
  if(key) headers["X-MBX-APIKEY"] = key;
  const r = await fetch(target, { method: req.method, headers, redirect:"follow" });
  const text = await r.text();
  return new Response(text, { status:r.status, headers:{"content-type":"application/json","access-control-allow-origin":"*"} });
}
