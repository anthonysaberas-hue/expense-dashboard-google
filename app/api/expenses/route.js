export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextResponse } from "next/server";

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1J2fRLD_lk_MaB77VesONXbHKFjMtEMPSNyb8tGTXvok";

export async function GET() {
  try {
    const GID = process.env.GOOGLE_SHEET_GID || "1367308403";
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${GID}`;
    const resp = await fetch(url, { cache: "no-store" });
    const text = await resp.text();

    if (!resp.ok) {
      return NextResponse.json(
        { error: "Google Sheets returned HTTP " + resp.status, details: text.slice(0, 500) },
        { status: 500 }
      );
    }

    // Google Sheets returns JSONP-like response, strip the wrapper
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?\s*$/);
    if (!match) {
      return NextResponse.json(
        { error: "Unexpected response from Google Sheets (sheet may not be public)", details: text.slice(0, 500) },
        { status: 500 }
      );
    }
    const data = JSON.parse(match[1]);

    const cols = data.table.cols.map((c) => c.label);
    const rows = data.table.rows;

    const expenses = rows
      .map((row) => {
        const cells = row.c;
        const obj = {};
        cols.forEach((col, i) => {
          if (!col) return;
          const cell = cells[i];
          if (!cell) {
            obj[col] = null;
            return;
          }
          // Google Sheets date format: Date(year, month, day)
          if (cell.f && col === "Date") {
            obj[col] = cell.f;
          } else if (cell.v !== null && cell.v !== undefined) {
            obj[col] = cell.v;
          } else {
            obj[col] = cell.f || null;
          }
        });
        return obj;
      })
      .filter((e) => e.Name || e.Vendor);

    // Normalize to expected format
    const normalized = expenses.map((e) => {
      let date = e.Date || null;
      // Handle Google Sheets Date(year, month, day) format
      if (date && typeof date === "string" && date.startsWith("Date(")) {
        const match = date.match(/Date\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          const y = match[1];
          const m = String(parseInt(match[2]) + 1).padStart(2, "0");
          const d = String(match[3]).padStart(2, "0");
          date = `${y}-${m}-${d}`;
        }
      }

      return {
        name: e.Name || "",
        date: date,
        amount: typeof e.Amount === "number" ? e.Amount : parseFloat(e.Amount) || 0,
        vendor: e.Vendor || "",
        category: e.Category || "Uncategorized",
        source: e.Source || "",
        rawSubject: e["Raw Email Subject"] || "",
      };
    });

    return NextResponse.json(
      {
        expenses: normalized,
        count: normalized.length,
        lastUpdated: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("Google Sheets error:", error);
    return NextResponse.json(
      { error: "Failed to fetch expenses from Google Sheets", details: error.message },
      { status: 500 }
    );
  }
}
