// api/movers.js — Self-healing version that computes % change when missing

export default async function handler(req, res) {
  try {
    const KEY = process.env.PPT_API_KEY;
    if (!KEY) return res.status(500).json({ error: "Missing PPT_API_KEY env var" });

    // Pull a large sample of movers (you can raise limit if you like)
    const url = "https://www.pokemonpricetracker.com/api/v2/movers?window=24h&limit=200";
    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    const text = await r.text();

    if (!r.ok) return res.status(r.status).send(text);

    const raw = JSON.parse(text);
    const list = Array.isArray(raw.data) ? raw.data : raw;

    const data = list
      .filter(x => Number(x.price || x.marketPrice) > 0)
      .map(x => {
        const current = Number(x.price || x.marketPrice || 0);
        const prev = Number(x.previousPrice || 0);
        const apiPct =
          Number(x.percentChange || x.change24h || x.priceChange || 0);

        // compute if missing or zero but we have previous/current
        const computedPct =
          (!apiPct || apiPct === 0) && prev
            ? ((current - prev) / prev) * 100
            : apiPct || 0;

        const pctChange = Number.isFinite(computedPct) ? computedPct : 0;

        // normalize image URL
        const image =
          x.imageUrl ||
          x.image ||
          (x.setCode && x.number
            ? `https://images.pokemontcg.io/${x.setCode}/${x.number}.png`
            : "https://via.placeholder.com/60x84?text=No+Image");

        return {
          id: x.id,
          name: x.name || x.cardName || "Unknown",
          set: x.set || x.setName || "Unknown Set",
          image,
          price: current,
          pctChange,
          history:
            x.history ||
            (prev
              ? [prev, current]
              : [current]), // synthesize a short history if missing
        };
      })
      // Filter out near-zero movers to keep list relevant
      .filter(c => Math.abs(c.pctChange) >= 0.1)
      // Sort by biggest absolute movement
      .sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))
      .slice(0, 100);

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    res.json({ data });
  } catch (e) {
    console.error("Proxy failed:", e);
    res.status(500).json({ error: "Proxy failed", details: String(e) });
  }
}
