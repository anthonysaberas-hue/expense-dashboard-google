export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import {
  readAllRows,
  ensureColumns,
  updateRows,
  appendRows,
  deleteRow,
  readAllSplits,
  deleteSplits,
  isWriteConfigured,
} from "../../lib/sheets";
import { readAllPhotos, softDeletePhoto } from "../../lib/photos";
import { withNetAmounts } from "../../lib/money";

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
    _order: row._rowIndex || 0,
    notes: row.Notes || "",
  };
}

// Map frontend field names to Sheet column names
function toSheetFields(fields) {
  const sheetFields = {};
  if (fields.name !== undefined) sheetFields.Name = fields.name;
  if (fields.date !== undefined) sheetFields.Date = fields.date;
  if (fields.amount !== undefined) sheetFields.Amount = fields.amount;
  if (fields.vendor !== undefined) sheetFields.Vendor = fields.vendor;
  if (fields.category !== undefined) sheetFields.Category = fields.category;
  if (fields.repaid !== undefined) sheetFields.Repaid = fields.repaid;
  if (fields.notes !== undefined) sheetFields.Notes = fields.notes;
  return sheetFields;
}

function toNewRow(body) {
  return {
    Name: body.name || body.vendor || "",
    Date: body.date,
    Amount: body.amount,
    Category: body.category || "Uncategorized",
    Vendor: body.vendor || "",
    Source: "Dashboard",
    Repaid: body.repaid || 0,
    Notes: body.notes || "",
  };
}

// GET — read all expenses
export async function GET() {
  try {
    // Ensure ID/Repaid/Notes columns exist and IDs are populated
    await ensureColumns();

    const { data } = await readAllRows();
    const expenses = data
      .filter((r) => r.Name || r.Vendor)
      .map(normalize)
      .filter((e) => !(e.amount === 0 && (e.notes || "").startsWith("[Split into")));

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

    // Your cost per expense — see app/lib/money.js for the rules
    const expensesWithNet = withNetAmounts(expenses, normalizedSplits);

    return NextResponse.json(
      {
        expenses: expensesWithNet,
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

    // Either { id, ...fields } or { updates: [{ id, ...fields }] } — one Sheets request either way
    const body = await request.json();
    const list = Array.isArray(body.updates) ? body.updates : [body];
    if (list.length === 0 || list.some((u) => !u.id)) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    await updateRows(list.map(({ id, ...fields }) => ({ id, fields: toSheetFields(fields) })));
    const id = list.length === 1 ? list[0].id : undefined;

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

    // Either one expense, or { rows: [...] } (installments) with an optional
    // { archive: { id, ...fields } } applied after the rows are added
    const body = await request.json();
    const rows = Array.isArray(body.rows) ? body.rows : [body];
    if (rows.length === 0 || rows.some((r) => !r.date || r.amount === undefined)) {
      return NextResponse.json(
        { error: "Missing required fields: date, amount" },
        { status: 400 }
      );
    }

    const ids = await appendRows(rows.map(toNewRow));
    if (body.archive?.id) {
      const { id: archiveId, ...fields } = body.archive;
      await updateRows([{ id: archiveId, fields: toSheetFields(fields) }]);
    }
    const id = ids[0];

    return NextResponse.json({ ok: true, id, ids });
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
      await deleteSplits(splits.filter((s) => s.ExpenseID === id).map((s) => s.SplitID));
    } catch { /* Splits tab may not exist */ }

    // Soft-delete associated photos (avoid orphaning their Drive references). Each
    // photo gets its own try/catch: a 429 on one must not abandon the rest as live
    // orphan rows, and this outer try/catch's only job is to tolerate a missing
    // Photos tab — it must never abort the expense deletion either way.
    try {
      const photos = await readAllPhotos();
      const orphanPhotos = photos.filter((p) => p.ExpenseID === id);
      for (const p of orphanPhotos) {
        try {
          await softDeletePhoto(p.ID);
        } catch (e) {
          console.error(`Failed to soft-delete photo ${p.ID} for expense ${id}:`, e);
        }
      }
    } catch { /* Photos tab may not exist */ }

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
