export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readAllPhotos, appendPhoto, ALLOWED_MIME } from "../../lib/photos";

// GET?expenseId= lists one expense's photos (the thumbnail strip). With no expenseId
// it gives them all, which is what app/page.js reads once on mount to build the
// photoCounts map keyed by ExpenseID — one request, not one per row.
export async function GET(request) {
  try {
    if (!process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json(
        { error: "DASHBOARD_PASSWORD is not set — refusing to serve the photo index with no auth gate." },
        { status: 503 },
      );
    }
    const { searchParams } = new URL(request.url);
    const expenseId = searchParams.get("expenseId");
    const rows = await readAllPhotos();
    const out = rows
      .filter((r) => !expenseId || r.ExpenseID === expenseId)
      .map(({ _rowIndex, ...rest }) => rest);
    return NextResponse.json(out);
  } catch (error) {
    console.error("Photos API read error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Records a photo the BROWSER has already put in Drive. It never sees the bytes — see
// app/api/drive/token for why that matters (Vercel's 4.5 MB request body cap would
// otherwise force a downscale on exactly the photos that need to stay legible).
export async function POST(request) {
  try {
    if (!process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json(
        { error: "DASHBOARD_PASSWORD is not set — refusing to record a photo with no auth gate." },
        { status: 503 },
      );
    }
    const body = await request.json();
    for (const k of ["id", "expenseId", "driveFileId"]) {
      if (!body[k] || String(body[k]).trim() === "") {
        return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
      }
    }
    const mime = String(body.mime || "image/jpeg").toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ error: `unsupported image type: ${mime}` }, { status: 400 });
    }

    // Idempotent on the client's id, like every other create in this app: a replayed
    // POST returns the row it already made rather than a second one pointing at the
    // same Drive file. `includeDeleted` so a replay against a since-soft-deleted row
    // still matches instead of minting a duplicate.
    const existingRows = await readAllPhotos({ includeDeleted: true });
    const existing = existingRows.find((r) => r.ID === body.id);
    if (existing) {
      const { _rowIndex, ...rest } = existing;
      return NextResponse.json(rest, { status: 200 });
    }

    const fields = {
      ID: body.id,
      ExpenseID: body.expenseId,
      DriveFileID: String(body.driveFileId).trim(),
      Mime: mime,
      DateAdded: new Date().toISOString(),
      DeletedAt: "",
    };
    await appendPhoto(fields);
    return NextResponse.json(fields, { status: 201 });
  } catch (error) {
    console.error("Photos API create error:", error);
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
