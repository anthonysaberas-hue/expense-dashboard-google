import { NextResponse } from "next/server";
import {
  addSplit,
  updateSplit,
  deleteSplit,
  appendRow,
  isWriteConfigured,
} from "../../lib/sheets";

// POST — create a new split
export async function POST(request) {
  try {
    if (!isWriteConfigured()) {
      return NextResponse.json({ error: "Write not configured" }, { status: 503 });
    }
    const { expenseId, person, share } = await request.json();
    if (!expenseId || !person || !share) {
      return NextResponse.json({ error: "Missing expenseId, person, or share" }, { status: 400 });
    }
    const splitId = await addSplit(expenseId, person, Number(share));
    return NextResponse.json({ ok: true, splitId });
  } catch (error) {
    console.error("Split create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH — update a split (record payment or forgive)
export async function PATCH(request) {
  try {
    if (!isWriteConfigured()) {
      return NextResponse.json({ error: "Write not configured" }, { status: 503 });
    }
    const body = await request.json();
    const { splitId, action, ...fields } = body;

    if (!splitId) {
      return NextResponse.json({ error: "Missing splitId" }, { status: 400 });
    }

    // Forgive action: update split status + create Relationship expense
    if (action === "forgive") {
      const forgiveAmount = Number(fields.forgiveAmount) || 0;
      const person = fields.person || "Unknown";
      const expenseRef = fields.expenseRef || "";

      // 1. Update split status to forgiven
      await updateSplit(splitId, { Status: "forgiven", Repaid: fields.currentRepaid || 0 });

      // 2. Create a new expense in the Budget tab with category "Relationship"
      if (forgiveAmount > 0) {
        await appendRow({
          Name: `Forgiven for ${person}`,
          Date: new Date().toISOString().split("T")[0],
          Amount: forgiveAmount,
          Category: "Relationship",
          Vendor: person,
          Source: "Dashboard",
          Notes: `Absorbed from: ${expenseRef}`,
          Repaid: 0,
        });
      }

      return NextResponse.json({ ok: true });
    }

    // Regular update (record payment)
    const sheetFields = {};
    if (fields.repaid !== undefined) sheetFields.Repaid = fields.repaid;
    if (fields.status !== undefined) sheetFields.Status = fields.status;

    await updateSplit(splitId, sheetFields);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Split update error:", error);
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE — remove a split
export async function DELETE(request) {
  try {
    if (!isWriteConfigured()) {
      return NextResponse.json({ error: "Write not configured" }, { status: 503 });
    }
    const { searchParams } = new URL(request.url);
    const splitId = searchParams.get("splitId");
    if (!splitId) {
      return NextResponse.json({ error: "Missing splitId" }, { status: 400 });
    }
    await deleteSplit(splitId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Split delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
