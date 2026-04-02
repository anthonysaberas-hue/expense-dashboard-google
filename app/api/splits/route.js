import { NextResponse } from "next/server";
import {
  addSplit,
  updateSplit,
  deleteSplit,
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

    // Forgive action: just mark the split as forgiven
    // The forgiven amount is tracked in the split itself (share - repaid = forgiven portion)
    // No separate expense row created — avoids sync issues if deleted
    if (action === "forgive") {
      await updateSplit(splitId, { Status: "forgiven", Repaid: fields.currentRepaid || 0 });
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
