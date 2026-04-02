export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import {
  readAllRows,
  ensureColumns,
  updateRow,
  appendRow,
  deleteRow,
  readAllSplits,
  deleteSplit,
  isWriteConfigured,
} from "../../lib/sheets";

function normalize(row) {
  let date = row.Date || null;
  if (date && typeof date === "string" && date.startsWith("Date(")) {
    const m = date.match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) {
      date = `${m[1]}-${String(parseInt(m[2]) + 1).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
    }
  }

  return {
    id: row.ID || null,
    name: row.Name || "",
    date,
    amount: typeof row.Amount === "number" ? row.Amount : parseFloat(row.Amount) || 0,
    vendor: row.Vendor || "",
    category: row.Category || "Uncategorized",
    source: row.Source || "",
    rawSubject: row["Raw Email Subject"] || "",
    repaid: typeof row.Repaid === "number" ? row.Repaid : parseFloat(row.Repaid) || 0,
    notes: row.Notes || "",
  };
}

// GET — read all expenses
export async function GET() {
  try {
    // Ensure ID/Repaid/Notes columns exist and IDs are populated
    await ensureColumns();

    const { data } = await readAllRows();
    const expenses = data.filter((r) => r.Name || r.Vendor).map(normalize);

    // Read splits and attach to expenses
    let splits = [];
    try { splits = await readAllSplits(); } catch { /* Splits tab may not exist yet */ }

    const normalizedSplits = splits.map((s) => ({
      splitId: s.SplitID,
      expenseId: s.ExpenseID,
      person: s.Person || "",
      share: parseFloat(s.Share) || 0,
      repaid: parseFloat(s.Repaid) || 0,
      status: s.Status || "pending",
    }));

    // Pre-compute netAmount on each expense
    // Active splits: subtract share (stable — your portion doesn't change as they pay)
    // Forgiven splits: subtract only repaid (forgiven portion = your cost)
    // Overpaid: if repaid > share, subtract repaid (extra goes to you)
    for (const exp of expenses) {
      const expSplits = normalizedSplits.filter((s) => s.expenseId === exp.id);
      if (expSplits.length > 0) {
        let totalDeduction = 0;
        for (const sp of expSplits) {
          if (sp.status === "forgiven") {
            // Forgiven: only what they actually repaid reduces your cost
            totalDeduction += sp.repaid;
          } else if (sp.repaid > sp.share) {
            // Overpaid: full repaid amount (extra goes to you)
            totalDeduction += sp.repaid;
          } else {
            // Active/pending/partial/settled: subtract their share (stable)
            totalDeduction += sp.share;
          }
        }
        exp.netAmount = exp.amount - totalDeduction;
      } else {
        exp.netAmount = exp.amount - exp.repaid;
      }
    }

    return NextResponse.json(
      {
        expenses,
        splits: normalizedSplits,
        count: expenses.length,
        lastUpdated: new Date().toISOString(),
        writeEnabled: isWriteConfigured(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("Sheets API read error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expenses", details: error.message },
      { status: 500 }
    );
  }
}

// PATCH — update an existing row
export async function PATCH(request) {
  try {
    if (!isWriteConfigured()) {
      return NextResponse.json(
        { error: "Write not configured — set GOOGLE_SERVICE_ACCOUNT_KEY" },
        { status: 503 }
      );
    }

    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Map frontend field names to Sheet column names
    const sheetFields = {};
    if (fields.name !== undefined) sheetFields.Name = fields.name;
    if (fields.date !== undefined) sheetFields.Date = fields.date;
    if (fields.amount !== undefined) sheetFields.Amount = fields.amount;
    if (fields.vendor !== undefined) sheetFields.Vendor = fields.vendor;
    if (fields.category !== undefined) sheetFields.Category = fields.category;
    if (fields.repaid !== undefined) sheetFields.Repaid = fields.repaid;
    if (fields.notes !== undefined) sheetFields.Notes = fields.notes;

    await updateRow(id, sheetFields);

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("Sheets API update error:", error);
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: error.message },
      { status }
    );
  }
}

// POST — add a new row
export async function POST(request) {
  try {
    if (!isWriteConfigured()) {
      return NextResponse.json(
        { error: "Write not configured — set GOOGLE_SERVICE_ACCOUNT_KEY" },
        { status: 503 }
      );
    }

    const body = await request.json();

    if (!body.date || body.amount === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: date, amount" },
        { status: 400 }
      );
    }

    const sheetFields = {
      Name: body.name || body.vendor || "",
      Date: body.date,
      Amount: body.amount,
      Category: body.category || "Uncategorized",
      Vendor: body.vendor || "",
      Source: "Dashboard",
      Repaid: body.repaid || 0,
      Notes: body.notes || "",
    };

    const id = await appendRow(sheetFields);

    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("Sheets API append error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// DELETE — remove a row by ID
export async function DELETE(request) {
  try {
    if (!isWriteConfigured()) {
      return NextResponse.json(
        { error: "Write not configured — set GOOGLE_SERVICE_ACCOUNT_KEY" },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    // Delete associated splits first (avoid orphans)
    try {
      const splits = await readAllSplits();
      const orphans = splits.filter((s) => s.ExpenseID === id);
      for (const s of orphans) {
        await deleteSplit(s.SplitID);
      }
    } catch { /* Splits tab may not exist */ }

    await deleteRow(id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Sheets API delete error:", error);
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { error: error.message },
      { status }
    );
  }
}
