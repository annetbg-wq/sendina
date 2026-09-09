# Real mailbox acceptance — Google + Microsoft

This is the final production acceptance for the HTTPS-only mailbox architecture. It is intentionally performed with two real mailboxes after the deterministic CI gates have passed.

## Preconditions

- production Sendina deployment is healthy;
- PostgreSQL and `ENCRYPTION_KEY` are configured;
- platform-owned Google and Microsoft OAuth applications are configured in Sendina;
- two real mailboxes are available: one Google/Gmail or Google Workspace mailbox and one Outlook.com/Microsoft 365 mailbox;
- both mailboxes are connected through Sendina OAuth and report `READY` after fresh verification;
- `SEND_ALLOWLIST` contains only the two test addresses for the duration of the acceptance;
- `SENDING_ENABLED` is enabled only for the controlled test window.

Never copy mailbox passwords, refresh tokens, client secrets or session tokens into this document, GitHub issues, PRs or chat transcripts.

## Google → Microsoft

1. Confirm the Google mailbox is `READY` in **Settings → Mail and domains** and that its transport is **Gmail API / HTTPS**.
2. Create a one-recipient acceptance campaign whose only recipient is the Microsoft test address.
3. Preview and approve the first batch through the normal Sendina policy path.
4. Send exactly one message.
5. Confirm the message state is `SENT`, with a persisted RFC Message-ID and provider/thread identity.
6. Reply from the real Microsoft mailbox to the received message.
7. Do not press manual sync. Wait for the periodic mailbox recovery worker (default interval: five minutes).
8. Confirm the reply appears once in Sendina, is attached to the original recipient/campaign/thread, and does not create a duplicate on the next recovery pass.
9. Restart/redeploy the Sendina backend.
10. Send a second reply from Microsoft and confirm Gmail History resumes from the persisted cursor after restart.

## Microsoft → Google

Repeat the same sequence in the opposite direction. The Microsoft sender must use Microsoft Graph over HTTPS, and the returned Google reply must be discovered from the persisted Graph Delta cursor after a backend restart.

## Failure / recovery checks

- While a mailbox is `REAUTH_REQUIRED`, `DEGRADED` or `ERROR`, sender selection and real send must remain blocked.
- A provider timeout or ambiguous 5xx after dispatch must become `UNKNOWN`; Sendina must not automatically resend it.
- `UNKNOWN` may become `SENT` only after provider evidence is found by RFC Message-ID. A miss remains `UNKNOWN`.
- Disconnect + reconnect, or a new OAuth generation, must invalidate old mailbox proofs and require a fresh verify before returning to `READY`.
- Google/Microsoft acceptance must not depend on SMTP 465/587 or IMAP 993. CI already hard-blocks those ports; the production acceptance verifies the real hosted provider path.

## Pass criteria

The production acceptance passes only when both directions satisfy all of the following:

- OAuth connect/reconnect works without mailbox passwords or per-user OAuth client credentials;
- mailbox reaches `READY` only after current-generation proofs;
- one campaign send creates exactly one real message;
- reply is imported automatically and mapped to the correct campaign, recipient and thread;
- a repeated sync/recovery pass is idempotent;
- backend restart does not lose the Gmail History / Graph Delta position;
- no ambiguous outcome causes an automatic resend;
- disconnect/re-auth state is reflected in the product and blocks sending until repaired.

After the test, restore the normal production allowlist/sending policy rather than leaving the test addresses or temporary limits in place.
