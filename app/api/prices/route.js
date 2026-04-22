export const revalidate = 60; // cache for 60 seconds server-side

async function fetchQuote(ticker) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ExpenseDashboard/1.0)",
        "Accept": "application/json",
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") return null;
    return {
      price: meta.regularMarketPrice,
      currency: meta.currency || "USD",
      name: meta.longName || meta.shortName || ticker,
      previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
      resolvedTicker: ticker,
    };
  } catch {
    return null;
  }
}

// Synthetic tickers that don't map directly to a Yahoo symbol.
// GOLD → spot gold per ounce in CAD = gold-USD × USD/CAD FX rate.
const SYNTHETIC = {
  GOLD: async () => {
    const [goldUsd, usdCad] = await Promise.all([
      fetchQuote("GC=F"),      // Gold futures, USD per oz
      fetchQuote("CAD=X"),     // USD → CAD FX rate (e.g. 1.37)
    ]);
    if (!goldUsd || !usdCad) return null;
    const previousClose =
      goldUsd.previousClose != null && usdCad.previousClose != null
        ? goldUsd.previousClose * usdCad.previousClose
        : null;
    return {
      price: goldUsd.price * usdCad.price,
      currency: "CAD",
      name: "Gold (spot, CAD per oz)",
      previousClose,
      resolvedTicker: "GC=F × CAD=X",
    };
  },
};

// Try synthetic first, then the ticker as-is, then with a .TO suffix (TSX)
async function fetchWithFallback(ticker) {
  if (SYNTHETIC[ticker]) {
    const synth = await SYNTHETIC[ticker]();
    if (synth) return synth;
  }
  const direct = await fetchQuote(ticker);
  if (direct) return direct;
  if (!ticker.includes(".")) {
    const tsx = await fetchQuote(`${ticker}.TO`);
    if (tsx) return tsx;
  }
  return null;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("tickers") || "";
  const tickers = raw.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);

  if (tickers.length === 0) {
    return Response.json({ prices: {}, warnings: [] });
  }

  const prices = {};
  const warnings = [];

  await Promise.all(
    tickers.map(async (ticker) => {
      const quote = await fetchWithFallback(ticker);
      if (quote) {
        prices[ticker] = {
          price: quote.price,
          currency: quote.currency,
          name: quote.name,
          previousClose: quote.previousClose,
          resolvedTicker: quote.resolvedTicker,
        };
      } else {
        prices[ticker] = null;
        warnings.push(`Could not fetch price for ${ticker}`);
      }
    })
  );

  return Response.json({ prices, warnings });
}
