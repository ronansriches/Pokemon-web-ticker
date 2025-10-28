// api/movers.js — robust PPT proxy with auto-computed % change and safe fallback demo data
export default async function handler(req, res) {
  try {
    const KEY = process.env.PPT_API_KEY;
    if (!KEY) {
      // No key? Serve demo so the page still works (useful on streams/tests).
      return res.json({ data: demoData() });
    }

    const windowParam = (req.query.window || "24h").toString(); // 24h | 7d | 30d
    const limitParam  = Number(req.query.limit || 200);

    const candidates = [
      `https://www.pokemonpricetracker.com/api/v2/movers?window=${windowParam}&limit=${limitParam}`,
      // fallback shapes (some accounts expose different routes/versions)
      `https://www.pokemonpricetracker.com/api/movers?window=${windowParam}&limit=${limitParam}`
    ];

    let rawText = null, status = 0;
    for (const url of candidates) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
      status = r.status;
      rawText = await r.text();
      if (r.ok) break;
    }
    if (status < 200 || status >= 300) {
      console.error("Upstream PPT error:", status, rawText?.slice(0,300));
      // Keep your site alive with demo output instead of blank page
      return res.json({ data: demoData() });
    }

    let payload;
    try { payload = JSON.parse(rawText); } catch { payload = rawText; }

    const list = Array.isArray(payload?.data) ? payload.data :
                 Array.isArray(payload) ? payload : [];

    const data = list
      .filter(x => Number(x.price || x.marketPrice) > 0)
      .map(x => {
        const current = Number(x.price || x.marketPrice || x.currentPrice || 0);
        const prev    = Number(x.previousPrice || 0);
        const apiPct  = Number(x.percentChange || x.change24h || x.priceChange || 0);

        const computedPct = (!apiPct || apiPct === 0) && prev
          ? ((current - prev) / prev) * 100
          : apiPct || 0;

        const pctChange = Number.isFinite(computedPct) ? computedPct : 0;

        const image =
          x.imageUrl || x.image ||
          (x.setCode && x.number
            ? `https://images.pokemontcg.io/${x.setCode}/${x.number}.png`
            : "https://via.placeholder.com/60x84?text=%3F");

        return {
          id: x.id || `${x.setCode||"set"}-${x.number||"0"}`,
          name: x.name || x.cardName || "Unknown",
          set:  x.set || x.setName || (x.setCode || "Unknown Set"),
          image,
          price: current,
          pctChange,
          history: Array.isArray(x.history) ? x.history : (prev ? [prev, current] : [current])
        };
      })
      .filter(c => Math.abs(c.pctChange) >= 0.1)      // ignore tiny wiggles
      .sort((a,b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))
      .slice(0, 200);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    return res.json({ data });
  } catch (e) {
    console.error("Proxy failed:", e);
    // Never leave you blank on stream
    return res.json({ data: demoData() });
  }
}

// Demo payload to keep UI rendering when API is down/misconfigured.
function demoData(){
  const fake = [
    { name:"Charizard ex", set:"Obsidian Flames", price:118.5, pctChange:32.2, image:"https://images.pokemontcg.io/sv3/125.png" },
    { name:"Gardevoir ex", set:"Scarlet & Violet", price:42.1, pctChange:-18.4, image:"https://images.pokemontcg.io/sv1/86.png" },
    { name:"Mew VMAX", set:"Fusion Strike", price:25.3, pctChange:12.7, image:"https://images.pokemontcg.io/swsh8/114.png" },
    { name:"Pikachu", set:"Celebrations", price:3.2, pctChange:-9.1, image:"https://images.pokemontcg.io/cel25/5.png" },
  ];
  // tile to ~60 entries so the scroll looks full
  const out = [];
  for (let i=0;i<15;i++) out.push(...fake.map((c,idx)=>({
    ...c, id:`demo-${i}-${idx}`, history:[c.price/(1+c.pctChange/100), c.price]
  })));
  return out;
}
