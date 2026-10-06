export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { readAllPhotos, softDeletePhoto } from "../../../lib/photos";
import { getImage, trashImage } from "../../../lib/drive";

// THE BYTES — proxies the image rather than linking to Drive directly, which keeps it
// behind this app's password gate: middleware.js gates every /api path, and a plain
// <img src="/api/photos/x"> sends the dash_auth cookie same-origin with no exemption
// needed. A Drive-hosted URL would have bypassed the gate entirely.
export async function GET(_request, { params }) {
  try {
    if (!process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json(
        { error: "DASHBOARD_PASSWORD is not set — refusing to serve a receipt image with no auth gate." },
        { status: 503 },
      );
    }
    const rows = await readAllPhotos();
    const row = rows.find((r) => r.ID === params.id);
    if (!row || !row.DriveFileID) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const { bytes, mime } = await getImage(row.DriveFileID);
    return new Response(bytes, {
      headers: {
        "Content-Type": row.Mime || mime || "image/jpeg",
        "Content-Length": String(bytes.length),
        // The bytes behind an id never change, so this is safe to cache hard — and
        // PRIVATE, because a shared cache must never hold someone's receipt photos.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("Photos API read error:", error);
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

export async function DELETE(_request, { params }) {
  try {
    if (!process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json(
        { error: "DASHBOARD_PASSWORD is not set — refusing to delete a photo with no auth gate." },
        { status: 503 },
      );
    }
    const rows = await readAllPhotos();
    const row = rows.find((r) => r.ID === params.id);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

    await softDeletePhoto(params.id);
    // TRASH, not delete: it lands in the Drive bin for 30 days. And it happens after
    // the row is stamped, so a Drive failure leaves an orphaned file rather than a row
    // pointing at nothing — the harmless direction of the two.
    if (row.DriveFileID) {
      try {
        await trashImage(row.DriveFileID);
      } catch {
        // The row is already gone from the app's point of view; a file left in Drive
        // is not worth failing the request the user is waiting on.
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Photos API delete error:", error);
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
