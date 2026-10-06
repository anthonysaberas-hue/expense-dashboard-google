import { NextResponse } from "next/server";
import { accessToken, folderId, driveConfigured } from "../../../lib/drive";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// A short-lived Drive token for the BROWSER, so a photo goes straight from the phone
// to Drive and never through this server.
//
// What is handed to the browser, and why it is a reasonable thing to hand over:
//   · the token is minted from the refresh token and lives about an hour;
//   · its scope is `drive.file`, so it can only see or touch files THIS app created
//     — never the rest of his Drive;
//   · this route is behind the app's password like every other /api path — EXCEPT
//     middleware.js disables all auth when DASHBOARD_PASSWORD is unset, which would
//     otherwise hand this bearer token to any anonymous caller. Guard it explicitly
//     here rather than trusting the middleware's fallback-open behaviour.
export async function GET() {
  try {
    if (!process.env.DASHBOARD_PASSWORD) {
      return NextResponse.json(
        { error: "DASHBOARD_PASSWORD is not set — refusing to serve a Drive token with no auth gate." },
        { status: 503 },
      );
    }
    if (!driveConfigured()) {
      return NextResponse.json({ error: "Google Drive is not connected yet." }, { status: 503 });
    }
    const [token, folder] = await Promise.all([accessToken(), folderId()]);
    if (!token) return NextResponse.json({ error: "Could not get a Drive token." }, { status: 502 });
    return NextResponse.json({ token, folder }, {
      // Never let a shared cache anywhere near a bearer token.
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
