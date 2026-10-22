export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readRecurring, updateRecurring, readAllRows, appendRows, isWriteConfigured } from "../../../lib/sheets";
import { dueOccurrences, recurringKey, normalizeRecurring } from "../../../lib/recurring";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Today in your timezone — the daily cron runs on UTC servers
function todayIn(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Add every charge that's due and hasn't been added yet. Safe to run any
// number of times: each created row carries recurring:<id>:<date> in its
// "Raw Email Subject" and is skipped if that key already exists.
async function run(today) {
  if (!isWriteConfigured()) return { status: 503, body: { error: "Write not configured" } };
  const items = (await readRecurring()).map(normalizeRecurring).filter((i) => i.active);
  if (items.length === 0) return { status: 200, body: { ok: true, created: 0 } };

  const { data } = await readAllRows();
  const existing = new Set(data.map((r) => r["Raw Email Subject"]).filter((v) => v && v.startsWith("recurring:")));

  const rows = [];
  const lastCreated = [];
  for (const item of items) {
    const dates = dueOccurrences(item, today);
    if (dates.length === 0) continue;
    for (const date of dates) {
      const key = recurringKey(item.id, date);
      if (existing.has(key)) continue;
      rows.push({
        Name: item.name || item.vendor,
        Date: date,
        Amount: item.amount,
        Category: item.category,
        Vendor: item.vendor,
        Source: "Recurring",
        "Raw Email Subject": key,
        Repaid: 0,
        Notes: item.notes || "",
      });
    }
    lastCreated.push({ id: item.id, fields: { LastCreated: dates[dates.length - 1] } });
  }

  if (rows.length > 0) await appendRows(rows);
  await updateRecurring(lastCreated);
  return { status: 200, body: { ok: true, created: rows.length } };
}

async function handle(today) {
  try {
    const { status, body } = await run(today);
    return NextResponse.json(body, { status });
  } catch (error) {
    console.error("Recurring run error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Daily Vercel cron (middleware lets it through with the CRON_SECRET bearer)
export async function GET() {
  return handle(todayIn(process.env.APP_TIMEZONE || "America/Toronto"));
}

// The app calls this on load with the phone's local date, as a catch-up
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const today = DATE.test(body.today || "") ? body.today : todayIn(process.env.APP_TIMEZONE || "America/Toronto");
  return handle(today);
}
