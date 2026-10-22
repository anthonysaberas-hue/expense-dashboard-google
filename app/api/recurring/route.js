export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readRecurring, addRecurring, updateRecurring, deleteRecurring, isWriteConfigured } from "../../lib/sheets";
import { FREQUENCIES, normalizeRecurring } from "../../lib/recurring";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function toSheetFields(f) {
  const out = {};
  if (f.vendor !== undefined) out.Vendor = String(f.vendor).trim();
  if (f.name !== undefined) out.Name = String(f.name).trim();
  if (f.amount !== undefined) out.Amount = Number(f.amount) || 0;
  if (f.category !== undefined) out.Category = f.category || "Uncategorized";
  if (f.frequency !== undefined) out.Frequency = f.frequency;
  if (f.startDate !== undefined) out.StartDate = f.startDate;
  if (f.endDate !== undefined) out.EndDate = f.endDate || "";
  if (f.lastCreated !== undefined) out.LastCreated = f.lastCreated || "";
  if (f.active !== undefined) out.Active = f.active ? "TRUE" : "FALSE";
  if (f.notes !== undefined) out.Notes = f.notes || "";
  return out;
}

function validate(f, partial = false) {
  if (!partial || f.vendor !== undefined) if (!String(f.vendor || "").trim()) return "Vendor is required";
  if (!partial || f.amount !== undefined) if (!(Number(f.amount) > 0)) return "Amount must be more than 0";
  if (!partial || f.frequency !== undefined) if (!FREQUENCIES[f.frequency]) return "Unknown frequency";
  if (!partial || f.startDate !== undefined) if (!DATE.test(f.startDate || "")) return "Start date must be YYYY-MM-DD";
  if (f.endDate && !DATE.test(f.endDate)) return "End date must be YYYY-MM-DD";
  return null;
}

export async function GET() {
  try {
    const items = (await readRecurring()).map(normalizeRecurring);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Recurring read error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    if (!isWriteConfigured()) return NextResponse.json({ error: "Write not configured" }, { status: 503 });
    const body = await request.json();
    const problem = validate(body);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    const id = await addRecurring(toSheetFields({ active: true, ...body }));
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("Recurring create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    if (!isWriteConfigured()) return NextResponse.json({ error: "Write not configured" }, { status: 503 });
    const { id, ...fields } = await request.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const problem = validate(fields, true);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    await updateRecurring([{ id, fields: toSheetFields(fields) }]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Recurring update error:", error);
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function DELETE(request) {
  try {
    if (!isWriteConfigured()) return NextResponse.json({ error: "Write not configured" }, { status: 503 });
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deleteRecurring(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Recurring delete error:", error);
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
