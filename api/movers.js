// Serverless function that calls PokemonPriceTracker and normalizes data for the ticker.
// Requires Vercel env var: PPT_API_KEY

export default async function handler(req, res) {
  try {
    const KEY = process.env.PPT_API_KEY;
    if (!KEY) return res.status(500).json({ error: "Missing PPT_API_KEY env var" });

    // Example endpoint: get top movers (you can switch to weekly/monthly by param)
    // Docs: refer to PokemonPriceTracker's API; adjust the URL below if needed.
    const url = "https://api.pokemonpricetracker.com/v1/movers?window=24h&limit=40";

    const r = await fetch(url, { headers: { "Authorization": `Bearer ${KEY}` } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);

    // Expecting array of movers; each entry should contain card name, set, current price, and change %
    const raw = JSON.parse(text);
    // Normalize into { name, set, price, pctChange }
    const data = (Array.isArray(raw) ? raw : raw.data || [])
      .map(item => ({
        name: item.name || item.cardName || "Card",
        set:  item.set || item.setName || "",
        price: Number(item.price || item.marketPrice || item.currentPrice || 0),
        pctChange: Number(item.percentChange || item.changePct || 0)
      }))
      // keep only priced rows
      .filter(x => Number.isFinite(x.price))
      // biggest absolute movers first
      .sort((a,b) => Math.abs(b.pctChange) - Math.abs(a.pctChange))
      .slice(0, 20);

    // edge cache for 5 minutes
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    res.json({ data });
  } catch (e) {
    res.status(500).json({ error: "Proxy failed", details: String(e) });
  }
}
