// api/movers.js — PokemonPriceTracker v2/cards version
// Computes "movers" from 7-day history. Requires Vercel env var: PPT_API_KEY.

export default async function handler(req, res) {
  try {
    const KEY = process.env.PPT_API_KEY;
    if (!KEY) return res.status(500).json({ error: "Missing PPT_API_KEY in Vercel env" });

    // Pull a reasonable slice of pricier cards (fewer zero/blank entries), with 7d history.
    const params = new URLSearchParams({
      limit: "60",
      includeHistory: "true",
      days: "7",
      sortBy: "price",        // highest current price first (cheap filter for noise)
      sortOrder: "desc",
      minPrice: "5"           // skip $0/$1 noise; tweak if you want
    });

    const url = `https://www.pokemonpricetracker.com/api/v2/cards?${params.toString()}`;

    const r = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);

    // PPT returns an array or {data:[...]} — handle both.
    const payload = JSON.parse(text);
    const rows = Array.isArray(payload) ? payload : (payload.data || []);

    // Normalize + compute % change from 7d history when present.
    const normalized = rows.map(raw => {
      const name = raw.name || raw.cardName || "Card";
      const set  = raw.set?.name || raw.setName || raw.setId || "Set";

      // current price – try common fields the docs show
      // docs show something like { prices: { market: 125.50 } }  :contentReference[oaicite:1]{index=1}
      const priceNow =
        Number(raw.prices?.market ?? raw.marketPrice ?? raw.price ?? 0);

      // priceHistory: could be { '2025-10-20': 11.2, ... } or an array; be defensive
      const histObj = raw.priceHistory || raw.history || null;
      let histArr = [];
      if (Array.isArray(histObj)) {
        histArr = histObj.map(Number).filter(n => Number.isFinite(n));
      } else if (histObj && typeof histObj === "object") {
        // sort by key (date) to get oldest -> newest
        histArr = Object.keys(histObj).sort().map(k => Number(histObj[k]))
          .filter(n => Number.isFinite(n));
      }

      const first = histArr.length ? histArr[0] : priceNow;
      const last  = histArr.length ? histArr[histArr.length - 1] : priceNow;
      const pct7  = (first && last) ? ((last - first) / first) * 100 : 0;

      return { name, set, price: priceNow, pctChange: pct7, _hist: [first, last] };
    })
    // keep only priced rows
    .filter(x => Number.isFinite(x.price) && x.price > 0);

    // rank by biggest absolute 7d mover
    normalized.sort((a, b) => Math.abs(b.pctChange) - Math.abs(a.pctChange));

    const data = normalized.slice(0, 20);

    // 5-minute edge cache
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=300");
    return res.json({ data });
  } catch (e) {
    return res.status(500).json({ error: "Proxy failed", details: String(e) });
  }
}
