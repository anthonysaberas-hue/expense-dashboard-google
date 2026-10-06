import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

// The redirect URI has to match what is registered in the Cloud Console EXACTLY,
// and it differs between localhost and production — so it is derived from the
// request rather than configured, which is one fewer env var to get wrong.
export function callbackUrl(req) {
  const u = new URL(req.url);
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  const host = req.headers.get("host") || u.host;
  return `${proto}://${host}/api/drive/callback`;
}

// Step one of connecting Drive: bounce to Google's consent screen.
export async function GET(req) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_OAUTH_CLIENT_ID is not set — add it to .env.local and Vercel first." },
      { status: 503 },
    );
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(req),
    response_type: "code",
    scope: DRIVE_SCOPE,
    // Both are required to get a REFRESH token rather than a one-hour access token.
    // `prompt=consent` in particular: Google issues a refresh token only on the first
    // grant, so re-connecting after a revoke would silently hand back an access token
    // and nothing to store.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
