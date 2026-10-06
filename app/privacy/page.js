// A real privacy policy, and PUBLIC — middleware.js exempts /privacy from the password
// gate, because Google will not let an OAuth app leave "Testing" without a reachable
// policy URL, and a page behind a login is not reachable.
//
// Everything below has to stay TRUE. If the app starts collecting something else,
// this page changes in the same commit.
export const metadata = {
  title: "Privacy — Expense Dashboard",
  description: "What Expense Dashboard stores, where it stores it, and who can see it.",
};

const P = { fontSize: 15, lineHeight: 1.7, margin: "0 0 14px" };
const H2 = { fontSize: 17, fontWeight: 600, margin: "26px 0 8px" };

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "28px 18px 60px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 4px" }}>Privacy</h1>
      <p style={{ fontSize: 13, opacity: 0.7, margin: "0 0 20px" }}>
        Expense Dashboard · last updated 6 October 2026
      </p>

      <p style={P}>
        Expense Dashboard is a private app used by one person to track their own
        household spending. It is not a product, it is not sold, and it carries no
        advertising or analytics of any kind.
      </p>

      <h2 style={H2}>What it stores</h2>
      <p style={P}>
        Transactions (date, amount, vendor, category and free-text notes), amounts
        repaid by other people along with the first name or nickname used to identify
        them, investment holdings, and any photos attached to a transaction&rsquo;s
        notes. That is the whole list. There is no account system beyond a single
        shared password, and no profile, location, contact or device data is collected.
      </p>

      <h2 style={H2}>Where it is stored</h2>
      <p style={P}>
        Transaction text lives in one private Google Sheet owned by the app&rsquo;s
        owner. Photos live in an <b>Expense Dashboard</b> folder in the owner&rsquo;s
        personal Google Drive. Nothing is stored on any other server, and the app has
        no database of its own.
      </p>

      <h2 style={H2}>Google account access</h2>
      <p style={P}>
        The app asks for a single Google Drive permission,{" "}
        <code>drive.file</code>. That scope grants access <b>only to files the app
        itself created</b> — it cannot see, read or modify anything else in the
        connected Google Drive. It is used for one purpose: storing and retrieving the
        photos attached to transaction notes.
      </p>
      <p style={P}>
        Expense Dashboard&rsquo;s use of information received from Google APIs adheres
        to the{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements. Data obtained through those APIs is
        never sold, never transferred to anyone else, and never used for advertising.
      </p>

      <h2 style={H2}>Who can see it</h2>
      <p style={P}>
        The owner, and anyone the owner gives the password to. The Sheet and the Drive
        folder are private to the owner&rsquo;s Google account. No third party receives
        any of it.
      </p>

      <h2 style={H2}>Deleting it</h2>
      <p style={P}>
        Deleting a photo in the app moves the underlying file to the Google Drive bin,
        where Drive keeps it for 30 days before removing it permanently. Deleting a
        transaction removes its row from the Sheet. The owner can revoke the
        app&rsquo;s Drive access at any time at{" "}
        <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">
          myaccount.google.com/connections
        </a>
        .
      </p>

      <h2 style={H2}>Contact</h2>
      <p style={P}>
        Questions about this policy go to the email listed as the support contact on the
        app&rsquo;s Google consent screen.
      </p>

      <p style={{ marginTop: 32 }}>
        <a href="/" style={{ fontSize: 14 }}>Back to the dashboard</a>
      </p>
    </main>
  );
}
