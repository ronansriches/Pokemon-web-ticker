// api/movers.js — Enhanced version for larger data and images

export default async function handler(req, res) {
  try {
    const KEY = process.env.PPT_API_KEY;
    if (!KEY) return res.status(500).json({ error: "Missing PPT_API_KEY env var" });

    const url = "https://www.pokemonpricetracker.com/api/v2/movers?window=24h&limit=200";


    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    const text = await r.text();
    if (!r.ok) {
  console.error("API error", r.status, text);
  return res.status(r.status).send(text);
}

    
    if (!r.ok) return res.status(r.status).send(text);

    const raw = JSON.parse(text);
    const data = (raw.data || raw)
      .filter(x => x.price && Math.abs(x.percentChange) > 1) // ignore tiny movers
      .sort((a, b) => Math.abs(b.percentChange) - Math.abs(a.percentChange))
      .slice(0, 100) // top 100 big movers
      .map(x => ({
        id: x.id,
        name: x.name || x.cardName,
        set: x.set || x.setName || "Unknown Set",
        image: x.imageUrl || x.image || `https://images.pokemontcg.io/${x.setCode}/${x.number}.png`,
        price: Number(x.price || x.marketPrice || 0),
        pctChange: Number(x.percentChange || 0),
        history: x.history || [],
      }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    res.json({ data });
  } catch (e) {
    console.error("Proxy failed:", e);
    res.status(500).json({ error: "Proxy failed", details: e.message });
  }
}
