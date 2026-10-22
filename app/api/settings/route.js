export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSettings, writeSettings, isWriteConfigured } from "../../lib/sheets";

// Only these keys sync; anything else in the request is ignored
const SYNCED_KEYS = ["custom_categories", "expense_budgets", "dismissed_insights", "known_people", "vendor_categories"];

// GET — all synced settings
export async function GET() {
  try {
    const settings = await readSettings();
    return NextResponse.json(
      { settings: Object.fromEntries(SYNCED_KEYS.filter((k) => k in settings).map((k) => [k, settings[k]])) },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Settings read error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT — { key: value, ... } upserted in one go
export async function PUT(request) {
  try {
    if (!isWriteConfigured()) {
      return NextResponse.json({ error: "Write not configured" }, { status: 503 });
    }
    const body = await request.json();
    const entries = Object.fromEntries(Object.entries(body || {}).filter(([k]) => SYNCED_KEYS.includes(k)));
    await writeSettings(entries);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Settings write error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
