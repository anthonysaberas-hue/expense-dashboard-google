import { readAllHoldings, appendHolding, updateHolding, deleteHolding, deleteAllHoldings } from "../../lib/holdings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const holdings = await readAllHoldings();
    const normalized = holdings.map((h) => ({
      id: h.ID,
      ticker: (h.Ticker || "").toUpperCase(),
      shares: parseFloat(h.Shares) || 0,
      buyPrice: parseFloat(h.BuyPrice) || 0,
      buyDate: h.BuyDate || "",
      name: h.Name || "",
      notes: h.Notes || "",
    }));
    return Response.json({ holdings: normalized, count: normalized.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { ticker, shares, buyPrice, buyDate, name, notes } = body;

    if (!ticker) return Response.json({ error: "ticker is required" }, { status: 400 });
    if (!shares || isNaN(parseFloat(shares))) return Response.json({ error: "shares must be a number" }, { status: 400 });
    if (!buyPrice || isNaN(parseFloat(buyPrice))) return Response.json({ error: "buyPrice must be a number" }, { status: 400 });
    if (!buyDate) return Response.json({ error: "buyDate is required" }, { status: 400 });

    const id = await appendHolding({
      Ticker: ticker.toUpperCase(),
      Shares: parseFloat(shares),
      BuyPrice: parseFloat(buyPrice),
      BuyDate: buyDate,
      Name: name || "",
      Notes: notes || "",
    });

    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });

    const mapped = {};
    if (fields.ticker !== undefined) mapped.Ticker = fields.ticker.toUpperCase();
    if (fields.shares !== undefined) mapped.Shares = parseFloat(fields.shares);
    if (fields.buyPrice !== undefined) mapped.BuyPrice = parseFloat(fields.buyPrice);
    if (fields.buyDate !== undefined) mapped.BuyDate = fields.buyDate;
    if (fields.name !== undefined) mapped.Name = fields.name;
    if (fields.notes !== undefined) mapped.Notes = fields.notes;

    await updateHolding(id, mapped);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("all") === "true") {
      const deleted = await deleteAllHoldings();
      return Response.json({ ok: true, deleted });
    }
    const id = searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await deleteHolding(id);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
