import { OAuth2Client } from "google-auth-library";
import { callbackUrl } from "../connect/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const page = (title, bodyHtml) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body { font: 15px/1.5 -apple-system, system-ui, sans-serif; margin: 0; padding: 28px 20px 60px;
         max-width: 620px; color: #0f172a; background: #f4f6f9; }
  h1 { font-size: 20px; margin: 0 0 14px; }
  code, textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  textarea { width: 100%; min-height: 92px; padding: 10px; font-size: 12.5px; border: 1px solid #cbd5e1;
             border-radius: 8px; background: #fff; box-sizing: border-box; word-break: break-all; }
  ol { padding-left: 20px; } li { margin: 8px 0; }
  .err { color: #b91c1c; font-weight: 700; }
  a { color: #0f766e; }
</style>
${bodyHtml}`,
  {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private",
    },
  },
);

// Step two: swap the code for a refresh token and show it ONCE, for Anthony to paste.
//
// Deliberately not stored anywhere by the app. It could go in a settings UI — the
// Sheet is the only datastore — but a refresh token is a credential, and the Sheet is
// open to every backup committed to git. An env var is where this app already keeps
// its secrets, so this is where this one goes too.
export async function GET(req) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) {
    return page("Drive not connected", `<h1>Drive not connected</h1>
      <p class="err">Google said: ${escapeHtml(err)}</p>
      <p>Nothing changed. <a href="/">Back to the dashboard</a></p>`);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    return page("Drive not connected", `<h1>Drive not connected</h1>
      <p class="err">No authorisation code came back.</p>
      <p><a href="/">Back to the dashboard</a></p>`);
  }

  try {
    const client = new OAuth2Client(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      callbackUrl(req),
    );
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      // Google issues one only on a FIRST grant. Re-connecting an app that is already
      // authorised returns an access token and nothing to keep — say so plainly
      // rather than showing an empty box.
      return page("Almost — no refresh token", `<h1>Almost — no refresh token</h1>
        <p class="err">Google returned an access token but no refresh token.</p>
        <p>That happens when this app is already authorised on your account. Remove it at
        <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">myaccount.google.com/connections</a>,
        then run Connect again.</p>`);
    }
    return page("Drive connected", `<h1>Drive connected ✓</h1>
      <p>Copy this into <code>.env.local</code> <b>and</b> Vercel (mark it Sensitive), then redeploy:</p>
      <textarea readonly onclick="this.select()">GOOGLE_DRIVE_REFRESH_TOKEN=${escapeHtml(tokens.refresh_token)}</textarea>
      <ol>
        <li>Paste it into <code>.env.local</code> and restart <code>npm run dev</code>.</li>
        <li>Add the same variable in Vercel → Settings → Environment Variables.</li>
        <li>Open an expense's notes and add a photo.</li>
      </ol>
      <p>This is shown once and stored nowhere. If you lose it, just run Connect again.</p>
      <p><a href="/">Back to the dashboard</a></p>`);
  } catch (e) {
    return page("Drive not connected", `<h1>Drive not connected</h1>
      <p class="err">${escapeHtml(e.message || "The token exchange failed.")}</p>
      <p>The usual cause is the redirect URI not matching. This app used:</p>
      <textarea readonly onclick="this.select()">${escapeHtml(callbackUrl(req))}</textarea>
      <p>It must be listed verbatim under Authorised redirect URIs on the OAuth client.</p>
      <p><a href="/">Back to the dashboard</a></p>`);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
