import yahooFinance from "yahoo-finance2";

export const revalidate = 60; // cache for 60 seconds server-side

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
      try {
        const quote = await yahooFinance.quote(ticker, {}, { validateResult: false });
        prices[ticker] = {
          price: quote.regularMarketPrice ?? null,
          currency: quote.currency ?? "CAD",
          name: quote.longName || quote.shortName || ticker,
          previousClose: quote.regularMarketPreviousClose ?? null,
          change: quote.regularMarketChange ?? null,
          changePercent: quote.regularMarketChangePercent ?? null,
        };
      } catch {
        prices[ticker] = null;
        warnings.push(`Could not fetch price for ${ticker}`);
      }
    })
  );

  return Response.json({ prices, warnings });
}
